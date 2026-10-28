import { Router, Request, Response, NextFunction } from 'express';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  clearLoginAttempts,
  evaluateLoginRateLimit,
  getRolePermissionsSummary,
  LoginAttemptRecord,
  recordFailedLoginAttempt,
} from '../../src/domain/farmRules.ts';
import { StaffUser } from '../../src/types/mais.ts';
import {
  appendAudit,
  db,
  saveDatabase,
  supabaseAuthClient,
  supabaseClient,
  supabaseUrl,
} from '../db/store.ts';
import { softDeleteUser } from '../db/supabaseService.ts';
import {
  activeSessions,
  cacheSupabaseSession,
  registerLocalSession,
  requirePermission,
  resolveAndSyncSupabaseUser,
  revokeSession,
  StaffRequest,
} from '../middleware/auth.ts';
import { validateRequiredString } from '../validation/validators.ts';

export const authRouter = Router();

// Per-IP rate limiter for sensitive authentication endpoints (login, password reset)
// Bound strictly to req.ip (trusting Express proxy configuration)
interface IpWindow {
  count: number;
  resetAt: number;
}
export const ipLimitStore = new Map<string, IpWindow>();

export function pruneRateLimitStores(): void {
  const now = Date.now();
  for (const [ip, entry] of ipLimitStore.entries()) {
    if (entry.resetAt <= now) {
      ipLimitStore.delete(ip);
    }
  }
}

export function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'local';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxRequests = 25; // 25 attempts per 15 min per IP

  let entry = ipLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    ipLimitStore.set(ip, entry);
  } else {
    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Too many login attempts from this IP, please try again later.' });
      return;
    }
  }
  next();
}

export const loginAttemptStore = new Map<string, LoginAttemptRecord>();

/**
 * Modern salted scrypt password hashing (H2).
 * Stores format: scrypt$<saltHex>$<derivedKeyHex>
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(plain, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Timing-safe password verification supporting salted scrypt, legacy SHA-256 hex, and plaintext.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHash] = parts;
    const derivedKey = scryptSync(plain, salt, 64);
    const candidateBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  }
  if (stored.length === 64) {
    const candidate = createHash('sha256').update(plain).digest('hex');
    const candidateBuffer = Buffer.from(candidate, 'hex');
    const storedBuffer = Buffer.from(stored, 'hex');
    if (candidateBuffer.length !== storedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, storedBuffer);
  }
  return plain === stored;
}

export function sanitizeUser(u: StaffUser) {
  const { password: _pw, ...safe } = u;
  return {
    ...safe,
    permissions: getRolePermissionsSummary(u.role, u.canApproveExpenses),
  };
}

/**
 * POST /api/auth/login
 * Authenticates a user via Supabase Auth (signInWithPassword on isolated auth client)
 * or verifies local credentials when SUPABASE_URL is not configured.
 * Enforces brute-force rate limiting (max 5 failed attempts per 15-minute window).
 */
authRouter.post('/auth/login', loginRateLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const emailCheck = validateRequiredString(email, 'Email', 3);
  const passCheck = validateRequiredString(password, 'Password', 3);
  if (!emailCheck.valid || !passCheck.valid) {
    res.status(400).json({ error: emailCheck.error || passCheck.error });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const rawPassword = String(password);
  const clientIp = req.ip || 'local';
  const rateLimitKey = `${clientIp}:${normalizedEmail}`;

  const rateCheck = evaluateLoginRateLimit(loginAttemptStore, rateLimitKey);
  if (!rateCheck.allowed) {
    const minutes = Math.ceil(rateCheck.retryAfterSeconds / 60);
    res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
    res.status(429).json({
      error: `Too many failed sign-in attempts. Account temporarily locked for ${minutes} minute(s).`,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    });
    return;
  }

  const handleFailedAttempt = () => {
    const attemptResult = recordFailedLoginAttempt(loginAttemptStore, rateLimitKey);
    if (attemptResult.locked) {
      const targetStaff = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
      const auditActor: StaffUser = targetStaff || {
        id: 'SYSTEM-SECURITY',
        fullName: normalizedEmail,
        email: normalizedEmail,
        role: 'Read-Only Staff',
        title: 'Unauthenticated Attempt',
        canApproveExpenses: false,
        status: 'Active',
        lastActive: new Date().toISOString(),
      };
      appendAudit(
        auditActor,
        'LOGIN_RATE_LIMITED',
        'StaffUser',
        targetStaff?.id || normalizedEmail,
        null,
        `Locked sign-in for ${normalizedEmail} after 5 failed password attempts from ${clientIp}.`
      );
      saveDatabase(db);
      res.setHeader('Retry-After', String(attemptResult.retryAfterSeconds));
      res.status(429).json({
        error: 'Too many failed sign-in attempts. Account locked for 15 minutes.',
        retryAfterSeconds: attemptResult.retryAfterSeconds,
      });
      return;
    }

    res.status(401).json({
      error: `Invalid email or password. ${attemptResult.remainingAttempts} attempt(s) remaining before temporary lockout.`,
    });
  };

  // 1. Authenticate with Supabase Auth via dedicated auth client (H4: does not overwrite service_role client)
  if (supabaseAuthClient) {
    try {
      const { data, error } = await supabaseAuthClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: rawPassword,
      });

      if (!error && data?.user && data?.session) {
        const staffUser = await resolveAndSyncSupabaseUser(data.user);
        if (staffUser.status !== 'Active' || staffUser.deleted) {
          res.status(403).json({
            error: 'This account is currently suspended or deactivated.',
          });
          return;
        }
        clearLoginAttempts(loginAttemptStore, rateLimitKey);
        const token = data.session.access_token;
        cacheSupabaseSession(token, staffUser.id);

        appendAudit(
          staffUser,
          'LOGIN',
          'StaffUser',
          staffUser.id,
          null,
          `${staffUser.fullName} signed in.`
        );
        saveDatabase(db);

        // Set HttpOnly secure cookie with token
        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.json({
          token,
          user: sanitizeUser(staffUser),
          authMode: 'supabase',
        });
        return;
      } else if (error) {
        // Auto-bootstrap default Admin into Supabase Auth if INITIAL_ADMIN_PASSWORD matches (H7)
        const initAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'belloaliyu808@gmail.com').trim().toLowerCase();
        const initAdminName = (process.env.INITIAL_ADMIN_NAME || 'Bello Aliyu').trim();
        const initAdminPass = process.env.INITIAL_ADMIN_PASSWORD?.trim();

        if (
          normalizedEmail === initAdminEmail &&
          initAdminPass &&
          rawPassword === initAdminPass &&
          supabaseClient?.auth?.admin
        ) {
          try {
            await supabaseClient.auth.admin.createUser({
              email: normalizedEmail,
              password: rawPassword,
              email_confirm: true,
              user_metadata: {
                role: 'Admin',
                full_name: initAdminName,
                title: 'Administrator',
                staff_id: 'USR-01',
                can_approve_expenses: true,
              },
            });
            const retryRes = await supabaseAuthClient.auth.signInWithPassword({
              email: normalizedEmail,
              password: rawPassword,
            });
            if (retryRes.data?.user && retryRes.data?.session) {
              const staffUser = await resolveAndSyncSupabaseUser(retryRes.data.user);
              clearLoginAttempts(loginAttemptStore, rateLimitKey);
              const token = retryRes.data.session.access_token;
              cacheSupabaseSession(token, staffUser.id);
              appendAudit(
                staffUser,
                'LOGIN',
                'StaffUser',
                staffUser.id,
                null,
                `${staffUser.fullName} initial bootstrap sign in.`
              );
              saveDatabase(db);
              res.cookie('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
              });
              res.json({
                token,
                user: sanitizeUser(staffUser),
                authMode: 'supabase',
              });
              return;
            }
          } catch (autoErr) {
            console.warn('Auto-provision initial admin warning:', autoErr);
          }
        }

        // If user is registered in local db with correct password, allow local authentication fallback
        const fallbackUser = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
        if (!fallbackUser || !fallbackUser.password || !verifyPassword(rawPassword, fallbackUser.password)) {
          handleFailedAttempt();
          return;
        }
      }
    } catch {
      // Fallback to local user store if Supabase network call fails
    }
  }

  // 2. Local store verification (when SUPABASE_URL is not configured in preview/development)
  const localUser = db.users.find(
    (u) => u.email.toLowerCase() === normalizedEmail
  );

  if (!localUser || !localUser.password) {
    handleFailedAttempt();
    return;
  }

  // Timing-safe password verification
  if (!verifyPassword(rawPassword, localUser.password)) {
    handleFailedAttempt();
    return;
  }

  // Transparently upgrade legacy SHA-256 or plaintext password to salted scrypt (H2)
  if (!localUser.password.startsWith('scrypt$')) {
    localUser.password = hashPassword(rawPassword);
  }

  if (localUser.status !== 'Active' || localUser.deleted) {
    res.status(403).json({
      error: 'This account is currently suspended or deactivated.',
    });
    return;
  }

  clearLoginAttempts(loginAttemptStore, rateLimitKey);
  localUser.lastActive = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // Unpredictable 256-bit cryptographically secure session token (H3)
  const sessionToken = `mais_sess_${randomBytes(32).toString('hex')}`;
  registerLocalSession(sessionToken, localUser.id);

  appendAudit(
    localUser,
    'LOGIN',
    'StaffUser',
    localUser.id,
    null,
    `${localUser.fullName} signed in.`
  );
  saveDatabase(db);

  // Set HttpOnly cookie
  res.cookie('auth_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    token: sessionToken,
    user: sanitizeUser(localUser),
    authMode: 'local_rbac',
  });
});

/**
 * POST /api/auth/signup
 * Public self-registration is disabled; accounts must be created via Supabase or Admin Staff settings.
 */
authRouter.post('/auth/signup', (_req: Request, res: Response) => {
  res.status(403).json({
    error: 'Public registration is disabled. Accounts can only be created by an Administrator or in Supabase.',
  });
});

// Password reset endpoint using Supabase Auth (guarded by loginRateLimiter)
authRouter.post('/auth/password-reset', loginRateLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  const emailCheck = validateRequiredString(email, 'Email', 3);
  if (!emailCheck.valid) {
    res.status(400).json({ error: emailCheck.error });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!supabaseAuthClient) {
    res.status(503).json({ error: 'Password reset not available without Supabase configured.' });
    return;
  }
  try {
    const { error } = await supabaseAuthClient.auth.resetPasswordForEmail(normalizedEmail);
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.json({ success: true, message: 'Password reset email sent if account exists.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send password reset email.' });
  }
});

/**
 * GET /api/auth/me
 */
authRouter.get('/auth/me', (req: StaffRequest, res: Response) => {
  const user = req.staffUser;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  res.json({
    user: sanitizeUser(user),
    supabaseConfigured: Boolean(supabaseClient),
    supabaseProject: supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, '') : null,
  });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/auth/logout', async (req: StaffRequest, res: Response) => {
  if (req.authToken) {
    revokeSession(req.authToken);
  }
  res.clearCookie('auth_token');
  if (supabaseAuthClient) {
    try {
      await supabaseAuthClient.auth.signOut();
    } catch {
      // Ignore signout error
    }
  }
  res.json({ success: true });
});

/**
 * DELETE /api/auth/users/:id
 * Admin-only soft-delete of a staff user profile without destroying farm history.
 */
authRouter.delete(
  '/auth/users/:id',
  requirePermission('MANAGE_STAFF'),
  async (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const targetId = req.params.id;

    if (adminUser.id === targetId) {
      res.status(400).json({ error: 'Cannot delete your own user profile.' });
      return;
    }

    const targetUser = db.users.find((u) => u.id === targetId);
    if (!targetUser) {
      res.status(404).json({ error: 'Staff user not found.' });
      return;
    }

    if (targetUser.deleted) {
      res.status(400).json({ error: 'Staff user is already deleted.' });
      return;
    }

    const prevStatus = targetUser.status;
    targetUser.status = 'Suspended';
    targetUser.deleted = true;

    // Revoke all active in-memory sessions for target user
    for (const [token, session] of activeSessions.entries()) {
      if (session.userId === targetUser.id) {
        activeSessions.delete(token);
      }
    }

    // Persist soft-delete to Supabase if configured
    if (supabaseClient) {
      try {
        await softDeleteUser(targetUser.id);
        if (targetUser.supabaseUserId && supabaseClient.auth?.admin) {
          await supabaseClient.auth.admin.updateUserById(targetUser.supabaseUserId, {
            user_metadata: { status: 'Suspended', deleted: true },
            ban_duration: '876000h',
          });
        }
      } catch (err: any) {
        console.warn('Supabase softDeleteUser warning:', err?.message || err);
      }
    }

    appendAudit(
      adminUser,
      'USER_SOFT_DELETE',
      'StaffUser',
      targetUser.id,
      null,
      `Admin ${adminUser.fullName} soft-deleted staff user ${targetUser.fullName} (${targetUser.email}).`,
      prevStatus,
      'Suspended'
    );

    saveDatabase(db);
    res.json({
      success: true,
      message: `Staff user ${targetUser.fullName} has been soft-deleted. Related historical farm data is preserved.`,
      user: sanitizeUser(targetUser),
    });
  }
);
