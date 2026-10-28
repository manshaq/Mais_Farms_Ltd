import { StaffRole } from '../types/mais.ts';

export type PermissionAction =
  | 'VIEW_RECORDS'
  | 'CREATE_ANIMALS'
  | 'EDIT_ANIMALS'
  | 'RECORD_HEALTH'
  | 'RECORD_TREATMENTS'
  | 'MANAGE_FEED'
  | 'MANAGE_BREEDING'
  | 'RECORD_EXPENSES'
  | 'APPROVE_EXPENSES'
  | 'MANAGE_STAFF'
  | 'DELETE_USERS'
  | 'MANAGE_SETTINGS'
  | 'VIEW_AUDIT'
  | 'REVERSE_RECORDS';

/**
 * Enforces the 3-role permission table from Section 7 of MAIS LTD specification.
 */
export function canPerformAction(
  role: StaffRole,
  action: PermissionAction,
  canApproveExpensesFlag: boolean = false
): boolean {
  if (role === 'Read-Only Staff') {
    return action === 'VIEW_RECORDS';
  }

  if (role === 'Farm Manager') {
    switch (action) {
      case 'VIEW_RECORDS':
      case 'CREATE_ANIMALS':
      case 'EDIT_ANIMALS':
      case 'RECORD_HEALTH':
      case 'RECORD_TREATMENTS':
      case 'MANAGE_FEED':
      case 'MANAGE_BREEDING':
      case 'RECORD_EXPENSES':
      case 'VIEW_AUDIT':
      case 'REVERSE_RECORDS':
        return true;
      case 'APPROVE_EXPENSES':
        return canApproveExpensesFlag;
      case 'MANAGE_STAFF':
      case 'DELETE_USERS':
      case 'MANAGE_SETTINGS':
        return false;
      default:
        return false;
    }
  }

  if (role === 'Admin') {
    return true;
  }

  return false;
}

export interface RolePermissionsSummary {
  role: StaffRole;
  canViewRecords: boolean;
  canEditAnimalsAndOperations: boolean;
  canApproveExpenses: boolean;
  canManageStaffAndSettings: boolean;
  accessLabel: string;
}

export function getRolePermissionsSummary(
  role: StaffRole,
  canApproveExpensesFlag: boolean = false
): RolePermissionsSummary {
  return {
    role,
    canViewRecords: canPerformAction(role, 'VIEW_RECORDS', canApproveExpensesFlag),
    canEditAnimalsAndOperations: canPerformAction(role, 'EDIT_ANIMALS', canApproveExpensesFlag),
    canApproveExpenses: canPerformAction(role, 'APPROVE_EXPENSES', canApproveExpensesFlag),
    canManageStaffAndSettings: canPerformAction(role, 'MANAGE_STAFF', canApproveExpensesFlag),
    accessLabel:
      role === 'Admin'
        ? 'Full System Authority · Staff, Financial Approvals & All Farm Operations'
        : role === 'Farm Manager'
        ? `Operations & Livestock Management${canApproveExpensesFlag ? ' · Expense Approver' : ''}`
        : 'Read-Only Access · View Animal Dossiers, Inventory & Reports Only',
  };
}

export interface LoginAttemptRecord {
  failedCount: number;
  firstFailedAtMs: number;
  lockedUntilMs: number | null;
}

export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Evaluates whether a login key (IP + normalized email) is currently rate-limited.
 */
export function evaluateLoginRateLimit(
  store: Map<string, LoginAttemptRecord>,
  key: string,
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number; remainingAttempts: number } {
  const record = store.get(key);
  if (!record) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    };
  }

  if (record.lockedUntilMs && nowMs < record.lockedUntilMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.lockedUntilMs - nowMs) / 1000));
    return {
      allowed: false,
      retryAfterSeconds,
      remainingAttempts: 0,
    };
  }

  // Reset expired window or expired lockout
  if (
    (record.lockedUntilMs && nowMs >= record.lockedUntilMs) ||
    nowMs - record.firstFailedAtMs >= LOGIN_RATE_LIMIT_WINDOW_MS
  ) {
    store.delete(key);
    return {
      allowed: true,
      retryAfterSeconds: 0,
      remainingAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, LOGIN_RATE_LIMIT_MAX_ATTEMPTS - record.failedCount),
  };
}

/**
 * Records a failed login attempt and triggers a lockout if max attempts are reached within the window.
 */
export function recordFailedLoginAttempt(
  store: Map<string, LoginAttemptRecord>,
  key: string,
  nowMs: number = Date.now()
): { locked: boolean; retryAfterSeconds: number; remainingAttempts: number } {
  const existing = store.get(key);
  if (
    !existing ||
    (existing.lockedUntilMs && nowMs >= existing.lockedUntilMs) ||
    nowMs - existing.firstFailedAtMs >= LOGIN_RATE_LIMIT_WINDOW_MS
  ) {
    const fresh: LoginAttemptRecord = {
      failedCount: 1,
      firstFailedAtMs: nowMs,
      lockedUntilMs: null,
    };
    store.set(key, fresh);
    return {
      locked: false,
      retryAfterSeconds: 0,
      remainingAttempts: LOGIN_RATE_LIMIT_MAX_ATTEMPTS - 1,
    };
  }

  const nextCount = existing.failedCount + 1;
  const locked = nextCount >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
  const lockedUntilMs = locked ? nowMs + LOGIN_RATE_LIMIT_LOCKOUT_MS : null;
  store.set(key, {
    failedCount: nextCount,
    firstFailedAtMs: existing.firstFailedAtMs,
    lockedUntilMs,
  });

  return {
    locked,
    retryAfterSeconds: locked ? Math.ceil(LOGIN_RATE_LIMIT_LOCKOUT_MS / 1000) : 0,
    remainingAttempts: Math.max(0, LOGIN_RATE_LIMIT_MAX_ATTEMPTS - nextCount),
  };
}

export function clearLoginAttempts(store: Map<string, LoginAttemptRecord>, key: string): void {
  store.delete(key);
}
