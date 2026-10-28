import { Request, Response, NextFunction } from 'express';
import { canPerformAction, PermissionAction } from '../../src/domain/farmRules.ts';
import { StaffRole, StaffUser } from '../../src/types/mais.ts';
import { db, saveDatabase, supabaseClient } from '../db/store.ts';

export interface StaffRequest extends Request {
  staffUser?: StaffUser;
  authToken?: string;
}

/**
 * Active session token store mapping Bearer token -> StaffUser.id
 */
export const activeSessions = new Map<string, string>();

export function normalizeRole(rawRole: unknown): StaffRole {
  const str = String(rawRole || '').trim();
  if (str === 'Admin' || str.toLowerCase() === 'admin') return 'Admin';
  if (
    str === 'Farm Manager' ||
    str.toLowerCase() === 'farm manager' ||
    str.toLowerCase() === 'manager'
  ) {
    return 'Farm Manager';
  }
  return 'Read-Only Staff';
}

/**
 * Resolves a Supabase user's role from public.users table or user_metadata
 * and synchronizes their StaffUser record in db.users.
 */
export async function resolveAndSyncSupabaseUser(supaUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}): Promise<StaffUser> {
  const email = (supaUser.email || '').toLowerCase();
  const meta = supaUser.user_metadata || {};

  let dbRoleRow: {
    id?: string;
    full_name?: string;
    role?: string;
    title?: string;
    can_approve_expenses?: boolean;
    status?: string;
  } | null = null;

  if (supabaseClient && email) {
    try {
      const { data } = await supabaseClient
        .from('users')
        .select('*')
        .ilike('email', email)
        .maybeSingle();
      if (data) {
        dbRoleRow = data;
      }
    } catch {
      // Fallback to user_metadata if public.users table is not yet migrated
    }
  }

  let localUser = db.users.find(
    (u) =>
      u.supabaseUserId === supaUser.id ||
      (email && u.email.toLowerCase() === email)
  );

  const resolvedRole: StaffRole = dbRoleRow?.role
    ? normalizeRole(dbRoleRow.role)
    : meta.role
    ? normalizeRole(meta.role)
    : localUser?.role || 'Read-Only Staff';

  const resolvedCanApprove =
    resolvedRole === 'Admin'
      ? true
      : typeof dbRoleRow?.can_approve_expenses === 'boolean'
      ? dbRoleRow.can_approve_expenses
      : typeof meta.can_approve_expenses === 'boolean'
      ? meta.can_approve_expenses
      : localUser?.canApproveExpenses ?? false;

  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  if (!localUser) {
    localUser = {
      id: dbRoleRow?.id || `USR-0${db.users.length + 1}`,
      supabaseUserId: supaUser.id,
      fullName:
        dbRoleRow?.full_name ||
        meta.full_name ||
        (email ? email.split('@')[0] : 'Supabase User'),
      email: supaUser.email || '',
      role: resolvedRole,
      title:
        dbRoleRow?.title ||
        meta.title ||
        (resolvedRole === 'Admin'
          ? 'Administrator'
          : resolvedRole === 'Farm Manager'
          ? 'Farm Operations Manager'
          : 'Livestock Staff'),
      canApproveExpenses: resolvedCanApprove,
      status: dbRoleRow?.status === 'Suspended' ? 'Suspended' : 'Active',
      lastActive: nowStr,
    };
    db.users.push(localUser);
    saveDatabase(db);
  } else {
    localUser.supabaseUserId = supaUser.id;
    localUser.role = resolvedRole;
    localUser.canApproveExpenses = resolvedCanApprove;
    localUser.lastActive = nowStr;
    saveDatabase(db);
  }

  return localUser;
}

/**
 * Attaches the authenticated staff user based on Supabase JWT, session token, or x-staff-user-id.
 */
export async function attachStaffUser(
  req: StaffRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    // Prefer token from HttpOnly secure cookie, fallback to Authorization header
    let bearerToken: string | null = null;
    const cookieHeader = req.header('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
      if (match) {
        bearerToken = decodeURIComponent(match[1]);
      }
    }
    if (!bearerToken && req.header('authorization')?.startsWith('Bearer ')) {
      bearerToken = req.header('authorization')!.replace('Bearer ', '').trim();
    }

    if (bearerToken) {
      req.authToken = bearerToken;

      // 1. Check active session map first
      const mappedUserId = activeSessions.get(bearerToken);
      // 1. Check in-memory active session token
      if (mappedUserId) {
        const sessionUser = db.users.find((u) => u.id === mappedUserId);
        if (sessionUser && sessionUser.status === 'Active' && !sessionUser.deleted) {
          req.staffUser = sessionUser;
          next();
          return;
        }
      }

      // 2. Check if bearerToken is a direct StaffUser ID (e.g. USR-01)
      // Only allowed in local dev mode (no Supabase client configured).
      // In production with Supabase, all requests must carry a valid Supabase JWT.
      if (!supabaseClient) {
        const directUser = db.users.find((u) => u.id === bearerToken);
        if (directUser && directUser.status === 'Active' && !directUser.deleted) {
          req.staffUser = directUser;
          next();
          return;
        }
      }

      // 3. If Supabase is configured, verify Supabase JWT and fetch role from Supabase
      if (supabaseClient) {
        const { data, error } = await supabaseClient.auth.getUser(bearerToken);
        if (!error && data?.user) {
          const syncedUser = await resolveAndSyncSupabaseUser(data.user);
          if (syncedUser.status === 'Active' && !syncedUser.deleted) {
            activeSessions.set(bearerToken, syncedUser.id);
            req.staffUser = syncedUser;
            next();
            return;
          }
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Enforces Role-Based Access Control (RBAC) on every protected operation.
 * Roles: 'Admin' | 'Farm Manager' | 'Read-Only Staff'
 */
export function requirePermission(action: PermissionAction) {
  return (req: StaffRequest, res: Response, next: NextFunction) => {
    const user = req.staffUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    if (user.status !== 'Active') {
      res.status(403).json({
        error: `Account for ${user.fullName} is currently suspended.`,
      });
      return;
    }
    const allowed = canPerformAction(user.role, action, user.canApproveExpenses);
    if (!allowed) {
      res.status(403).json({
        error: `Authorization Denied: Role "${user.role}" (${user.fullName}) is not permitted to perform ${action}.`,
      });
      return;
    }
    next();
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Standard pagination helper for all list and report endpoints.
 */
export function paginateItems<T>(
  items: T[],
  pageParam?: unknown,
  limitParam?: unknown
): PaginatedResponse<T> {
  const page = Math.max(1, Number(pageParam) || 1);
  const limit = Math.min(200, Math.max(1, Number(limitParam) || 50));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const startIndex = (page - 1) * limit;
  const paged = items.slice(startIndex, startIndex + limit);

  return {
    items: paged,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
