import fs from 'node:fs';
import path from 'node:path';
import { Router, Response } from 'express';
import {
  createBackupSnapshotEnvelope,
  verifyBackupSnapshotEnvelope,
} from '../../src/domain/farmRules.ts';
import { BackupTier, FarmTask, StaffRole, StaffUser } from '../../src/types/mais.ts';
import {
  appendAudit,
  db,
  generateStaffUserId,
  restoreDatabaseFromSnapshot,
  saveDatabase,
  supabaseClient,
} from '../db/store.ts';
import {
  ensureBackupVaultDir,
  executeEncryptedBackupJob,
  getBackupEnvironmentStatus,
  pruneExpiredBackups,
  restoreFromEncryptedBackupRun,
  verifyEncryptedBackupFile,
} from '../backup/backupService.ts';
import { decryptAndDecompressBackup } from '../backup/cryptoVault.ts';
import { activeSessions, normalizeRole, paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';
import { softDeleteUser, syncDatabaseToSupabase } from '../db/supabaseService.ts';
import { validateRequiredString } from '../validation/validators.ts';
import { hashPassword, sanitizeUser } from './auth.routes.ts';

export const operationsRouter = Router();

/**
 * GET /api/tasks
 * Supports pagination and filters (status, category, assignedTo, animalId)
 */
operationsRouter.get(
  '/tasks',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { status, category, assignedTo, animalId, page, limit } = req.query;
    let filtered = [...db.tasks];

    if (status && status !== 'ALL') {
      filtered = filtered.filter((t) => t.status === String(status));
    }
    if (category && category !== 'ALL') {
      filtered = filtered.filter((t) => t.category === String(category));
    }
    if (assignedTo && assignedTo !== 'ALL') {
      filtered = filtered.filter((t) => t.assignedTo === String(assignedTo));
    }
    if (animalId) {
      filtered = filtered.filter((t) => t.animalId === String(animalId));
    }

    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * POST /api/tasks
 */
operationsRouter.post(
  '/tasks',
  requirePermission('EDIT_ANIMALS'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const { title, category, dueDate, priority, assignedTo, animalId } = req.body;
    const titleCheck = validateRequiredString(title, 'Task title');
    if (!titleCheck.valid || !dueDate) {
      res.status(400).json({ error: titleCheck.error || 'Task due date is required.' });
      return;
    }

    const linkedAnimal = animalId ? db.animals.find((a) => a.id === animalId) : null;
    const task: FarmTask = {
      id: `TSK-${Date.now()}`,
      title: String(title).trim(),
      category: category || 'Vaccination / Protocol',
      dueDate,
      priority: priority || 'Medium',
      assignedTo: assignedTo || user.fullName,
      animalId: linkedAnimal?.id || null,
      animalTag: linkedAnimal?.currentTag || null,
      referenceId: null,
      status: 'Pending',
      completionNotes: '',
      completedAt: null,
    };
    db.tasks.unshift(task);
    saveDatabase(db);
    res.status(201).json({ task });
  }
);

/**
 * PATCH /api/tasks/:id
 */
operationsRouter.patch(
  '/tasks/:id',
  requirePermission('EDIT_ANIMALS'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const task = db.tasks.find((t) => t.id === req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found.' });
      return;
    }
    const { status, completionNotes } = req.body;
    const prevStatus = task.status;
    if (status) task.status = status;
    if (completionNotes !== undefined) task.completionNotes = String(completionNotes);
    if (status === 'Completed') {
      task.completedAt = new Date().toISOString().slice(0, 10);
    }

    appendAudit(
      user,
      'UPDATE_TASK',
      'Task',
      task.id,
      task.animalTag,
      `Updated task "${task.title}" status from ${prevStatus} to ${task.status}.`,
      prevStatus,
      task.status
    );

    saveDatabase(db);
    res.json({ task });
  }
);

/**
 * GET /api/users
 */
operationsRouter.get(
  '/users',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { role, status, page, limit, includeDeleted } = req.query;
    let filtered = db.users
      .filter((u) => includeDeleted === 'true' || !u.deleted)
      .map((u) => sanitizeUser(u));
    if (role && role !== 'ALL') {
      filtered = filtered.filter((u) => u.role === String(role));
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter((u) => u.status === String(status));
    }
    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * POST /api/users
 * Admin-only endpoint to create a new staff account (provisions in Supabase Auth + public.users when configured)
 */
operationsRouter.post(
  '/users',
  requirePermission('MANAGE_STAFF'),
  async (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const { fullName, email, password, role, title, canApproveExpenses } = req.body;
    if (!fullName || !email || !role || !password) {
      res.status(400).json({ error: 'Full name, email, password, and role are required.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const validRole: StaffRole = normalizeRole(role);
    const resolvedTitle = String(title || validRole).trim();
    const canApprove =
      validRole === 'Admin' ? true : validRole === 'Farm Manager' ? Boolean(canApproveExpenses) : false;
    const newId = generateStaffUserId(db.users);
    let supabaseUserId: string | undefined;

    if (supabaseClient) {
      try {
        // Attempt Admin API user creation first (when service_role key is configured), fallback to signUp
        const adminRes = await supabaseClient.auth.admin.createUser({
          email: normalizedEmail,
          password: String(password),
          email_confirm: true,
          user_metadata: {
            full_name: String(fullName).trim(),
            role: validRole,
            title: resolvedTitle,
            can_approve_expenses: canApprove,
          },
        });

        if (!adminRes.error && adminRes.data?.user) {
          supabaseUserId = adminRes.data.user.id;
        } else {
          // Check if already registered
          if (adminRes.error?.message?.toLowerCase().includes('already') || (adminRes.error as any)?.status === 422) {
            res.status(409).json({ error: 'A user with this email already exists in Supabase Auth.' });
            return;
          }
          const signUpRes = await supabaseClient.auth.signUp({
            email: normalizedEmail,
            password: String(password),
            options: {
              data: {
                full_name: String(fullName).trim(),
                role: validRole,
                title: resolvedTitle,
                can_approve_expenses: canApprove,
              },
            },
          });
          if (signUpRes.error) {
            res.status(400).json({ error: signUpRes.error.message });
            return;
          }
          supabaseUserId = signUpRes.data.user?.id;
        }

        await supabaseClient.from('users').upsert(
          {
            id: newId,
            auth_user_id: supabaseUserId || null,
            full_name: String(fullName).trim(),
            email: normalizedEmail,
            role: validRole,
            title: resolvedTitle,
            can_approve_expenses: canApprove,
            status: 'Active',
          },
          { onConflict: 'email' }
        );
      } catch (err: any) {
        // Proceed with local store if Supabase table migration is pending
        console.warn('Supabase staff user sync warning:', err?.message || err);
      }
    }

    const newStaff: StaffUser = {
      id: newId,
      supabaseUserId,
      fullName: String(fullName).trim(),
      email: normalizedEmail,
      role: validRole,
      title: resolvedTitle,
      canApproveExpenses: canApprove,
      status: 'Active',
      lastActive: new Date().toISOString().slice(0, 16).replace('T', ' '),
      password: hashPassword(String(password)),
    };
    db.users.push(newStaff);

    appendAudit(
      adminUser,
      'CREATE_STAFF_USER',
      'User',
      newStaff.id,
      null,
      `Created staff account for ${newStaff.fullName} with role "${newStaff.role}".`,
      null,
      newStaff.role
    );

    saveDatabase(db);
    res.status(201).json({ user: sanitizeUser(newStaff) });
  }
);

/**
 * PATCH /api/users/:id
 */
operationsRouter.patch(
  '/users/:id',
  requirePermission('MANAGE_STAFF'),
  async (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const targetUser = db.users.find((u) => u.id === req.params.id);
    if (!targetUser) {
      res.status(404).json({ error: 'Staff user not found.' });
      return;
    }
    const { role, canApproveExpenses, status, password } = req.body;
    const prevRole = targetUser.role;
    if (role) targetUser.role = normalizeRole(role);
    if (canApproveExpenses !== undefined) {
      targetUser.canApproveExpenses = Boolean(canApproveExpenses);
    }
    if (status && (status === 'Active' || status === 'Suspended')) {
      targetUser.status = status;
    }
    if (password && String(password).length >= 6) {
      targetUser.password = hashPassword(String(password));
    }

    if (supabaseClient) {
      try {
        await supabaseClient
          .from('users')
          .update({
            role: targetUser.role,
            can_approve_expenses: targetUser.canApproveExpenses,
            status: targetUser.status,
          })
          .eq('email', targetUser.email.toLowerCase());

        if (targetUser.supabaseUserId) {
          const updatePayload: Record<string, any> = {
            user_metadata: {
              role: targetUser.role,
              can_approve_expenses: targetUser.canApproveExpenses,
            },
          };
          if (password && String(password).length >= 6) {
            updatePayload.password = String(password);
          }
          await supabaseClient.auth.admin.updateUserById(
            targetUser.supabaseUserId,
            updatePayload
          );
        }
      } catch (err: any) {
        console.warn('Supabase staff update sync warning:', err?.message || err);
      }
    }

    appendAudit(
      adminUser,
      'UPDATE_STAFF_PERMISSIONS',
      'User',
      targetUser.id,
      null,
      `Updated permissions for ${targetUser.fullName}: Role=${targetUser.role}, ApproveExpenses=${targetUser.canApproveExpenses}, Status=${targetUser.status}.`,
      prevRole,
      targetUser.role
    );

    saveDatabase(db);
    res.json({ user: sanitizeUser(targetUser) });
  }
);

/**
 * DELETE /api/users/:id
 * Admin-only soft-delete of a staff user without removing records they created.
 */
operationsRouter.delete(
  '/users/:id',
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

    // Invalidate active session tokens for the target user
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
        console.warn('Supabase soft-delete sync warning:', err?.message || err);
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

/**
 * GET /api/audit-logs
 * Restricted to Admin and Farm Manager roles via VIEW_AUDIT permission. Supports pagination & filters.
 */
operationsRouter.get(
  '/audit-logs',
  requirePermission('VIEW_AUDIT'),
  (req: StaffRequest, res: Response) => {
    const { action, entityType, animalTag, userId, search, startDate, endDate, page, limit } =
      req.query;
    let filtered = [...db.auditLogs];

    if (action && action !== 'ALL') {
      filtered = filtered.filter((l) => l.action === String(action));
    }
    if (entityType && entityType !== 'ALL') {
      filtered = filtered.filter((l) => l.entityType === String(entityType));
    }
    if (animalTag) {
      filtered = filtered.filter((l) =>
        (l.animalTag || '').toLowerCase().includes(String(animalTag).toLowerCase())
      );
    }
    if (userId && userId !== 'ALL') {
      filtered = filtered.filter((l) => l.userId === String(userId));
    }
    if (startDate) {
      filtered = filtered.filter((l) => l.timestamp.slice(0, 10) >= String(startDate));
    }
    if (endDate) {
      filtered = filtered.filter((l) => l.timestamp.slice(0, 10) <= String(endDate));
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((l) =>
        [
          l.summary,
          l.userName,
          l.action,
          l.entityType,
          l.entityId,
          l.animalTag || '',
          l.previousValue || '',
          l.newValue || '',
          l.integrityHash || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    res.json(paginateItems(filtered, page, limit));
  }
);

/**
 * GET /api/backups/export
 * Generates a cryptographically signed JSON/SQL database snapshot for Admin disaster recovery.
 */
operationsRouter.get(
  '/backups/export',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const snapshot = createBackupSnapshotEnvelope(db, adminUser.fullName);

    appendAudit(
      adminUser,
      'DATABASE_BACKUP_EXPORT',
      'SystemBackup',
      snapshot.integrityHash,
      null,
      `Exported signed database snapshot (${snapshot.recordCounts.animals} animals, ${snapshot.recordCounts.expenses} expenses). Signature: ${snapshot.integrityHash}.`,
      null,
      snapshot.integrityHash
    );
    saveDatabase(db);

    res.json({ snapshot });
  }
);

/**
 * POST /api/backups/verify
 * Non-mutating dry-run verification of a backup snapshot envelope or current database state.
 */
operationsRouter.post(
  '/backups/verify',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const payloadToVerify = req.body?.snapshot || req.body?.state || createBackupSnapshotEnvelope(db, adminUser.fullName);
    const verification = verifyBackupSnapshotEnvelope(payloadToVerify);

    appendAudit(
      adminUser,
      'DATABASE_RESTORE_DRY_RUN',
      'SystemBackup',
      verification.computedHash,
      null,
      `Executed database restoration dry-run & integrity verification test: ${
        verification.valid ? 'PASSED ALL CHECKS' : `FAILED (${verification.errors.join('; ')})`
      }.`,
      null,
      verification.valid ? 'VERIFIED_OK' : 'VERIFICATION_FAILED'
    );
    saveDatabase(db);

    res.json({ verification });
  }
);

/**
 * POST /api/backups/restore
 * Verifies a backup snapshot and atomically restores it after writing a pre-restore rollback file.
 */
operationsRouter.post(
  '/backups/restore',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const candidate = req.body?.snapshot || req.body;
    const verification = verifyBackupSnapshotEnvelope(candidate);

    if (!verification.valid) {
      res.status(400).json({
        error: `Backup verification failed: ${verification.errors.join(' ')}`,
        verification,
      });
      return;
    }

    const targetState = candidate.state ? candidate.state : candidate;
    const { rollbackSnapshotFile } = restoreDatabaseFromSnapshot(targetState);

    appendAudit(
      adminUser,
      'DATABASE_RESTORE_EXECUTED',
      'SystemBackup',
      verification.computedHash,
      null,
      `Restored database from verified snapshot (${verification.computedHash}). Automatic pre-restore safety snapshot saved to ${rollbackSnapshotFile}.`,
      rollbackSnapshotFile,
      verification.computedHash
    );
    saveDatabase(db);

    res.json({
      restored: true,
      restoredSnapshotId: verification.snapshotId || verification.computedHash,
      preRestoreSafetyPath: rollbackSnapshotFile,
      rollbackSnapshotFile,
      verification,
    });
  }
);

/**
 * GET /api/backups/status
 * Returns backup policy settings, encrypted backup run telemetry, and environment status (no secrets).
 */
operationsRouter.get(
  '/backups/status',
  requirePermission('MANAGE_STAFF'),
  (_req: StaffRequest, res: Response) => {
    res.json({
      backupSettings: db.backupSettings,
      backupRuns: db.backupRuns || [],
      environment: getBackupEnvironmentStatus(),
    });
  }
);

/**
 * PUT /api/backups/settings
 * Updates configurable daily/monthly retention, retry policy, Object Lock, and failure alert settings.
 */
operationsRouter.put(
  '/backups/settings',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const {
      autoBackupEnabled,
      scheduleHourUtc,
      dailyRetentionDays,
      monthlyRetentionMonths,
      maxRetryAttempts,
      immutableObjectLock,
      objectLockDays,
      alertAdminOnFailure,
      alertRecipientEmail,
    } = req.body;

    if (!db.backupSettings) {
      db.backupSettings = {
        autoBackupEnabled: true,
        scheduleHourUtc: 2,
        dailyRetentionDays: 30,
        monthlyRetentionMonths: 12,
        maxRetryAttempts: 3,
        immutableObjectLock: true,
        objectLockDays: 30,
        alertAdminOnFailure: true,
        alertRecipientEmail: 'belloaliyu808@gmail.com',
        lastDailyBackupDate: null,
        lastMonthlyBackupMonth: null,
      };
    }

    if (typeof autoBackupEnabled === 'boolean') {
      db.backupSettings.autoBackupEnabled = autoBackupEnabled;
    }
    if (scheduleHourUtc !== undefined) {
      db.backupSettings.scheduleHourUtc = Math.max(0, Math.min(23, Number(scheduleHourUtc) || 0));
    }
    if (dailyRetentionDays !== undefined) {
      db.backupSettings.dailyRetentionDays = Math.max(
        1,
        Math.min(365, Number(dailyRetentionDays) || 30)
      );
    }
    if (monthlyRetentionMonths !== undefined) {
      db.backupSettings.monthlyRetentionMonths = Math.max(
        1,
        Math.min(120, Number(monthlyRetentionMonths) || 12)
      );
    }
    if (maxRetryAttempts !== undefined) {
      db.backupSettings.maxRetryAttempts = Math.max(
        1,
        Math.min(10, Number(maxRetryAttempts) || 3)
      );
    }
    if (typeof immutableObjectLock === 'boolean') {
      db.backupSettings.immutableObjectLock = immutableObjectLock;
    }
    if (objectLockDays !== undefined) {
      db.backupSettings.objectLockDays = Math.max(1, Math.min(3650, Number(objectLockDays) || 30));
    }
    if (typeof alertAdminOnFailure === 'boolean') {
      db.backupSettings.alertAdminOnFailure = alertAdminOnFailure;
    }
    if (alertRecipientEmail !== undefined) {
      db.backupSettings.alertRecipientEmail = String(alertRecipientEmail).trim();
    }

    appendAudit(
      adminUser,
      'UPDATE_BACKUP_POLICY',
      'BackupPolicySettings',
      'POLICY-DEFAULT',
      null,
      `Updated automated backup policy: DailyRetention=${db.backupSettings.dailyRetentionDays}d, MonthlyRetention=${db.backupSettings.monthlyRetentionMonths}m, MaxRetries=${db.backupSettings.maxRetryAttempts}, ObjectLock=${db.backupSettings.immutableObjectLock} (${db.backupSettings.objectLockDays}d).`
    );

    saveDatabase(db);
    res.json({ backupSettings: db.backupSettings });
  }
);

/**
 * POST /api/backups/run
 * Triggers an immediate encrypted PostgreSQL + JSON state backup job (`AES-256-GCM`).
 */
operationsRouter.post(
  '/backups/run',
  requirePermission('MANAGE_STAFF'),
  async (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const requestedTier = (req.body?.tier as BackupTier) || 'manual';
    const simulateFailure = Boolean(req.body?.simulateFailure);

    const { runLog, prunedCount } = await executeEncryptedBackupJob({
      actor: adminUser,
      requestedTier,
      simulateFailureForTest: simulateFailure,
    });

    res.status(runLog.status === 'Succeeded' ? 201 : 500).json({
      runLog,
      prunedCount,
    });
  }
);

/**
 * POST /api/backups/prune
 * Evaluates retention rules (30-day daily, 12-month monthly) and prunes expired unlocked backups.
 */
operationsRouter.post(
  '/backups/prune',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    const pruneResult = pruneExpiredBackups();

    appendAudit(
      adminUser,
      'BACKUP_RETENTION_PRUNE',
      'SystemBackup',
      `PRUNE-${Date.now()}`,
      null,
      `Executed backup retention policy check: pruned ${pruneResult.prunedCount} expired backup(s), protected ${pruneResult.lockedProtectedCount} Object-Locked backup(s).`
    );
    saveDatabase(db);

    res.json(pruneResult);
  }
);

/**
 * POST /api/backups/runs/:id/verify
 * Decrypts and verifies a specific encrypted `.sql.gz.enc` backup artifact from the vault.
 */
operationsRouter.post(
  '/backups/runs/:id/verify',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    try {
      const result = verifyEncryptedBackupFile(req.params.id);
      appendAudit(
        adminUser,
        'VERIFY_ENCRYPTED_BACKUP',
        'SystemBackup',
        result.runLog.id,
        null,
        `Verified encrypted AES-256-GCM backup ${result.runLog.fileName}: Checksum=OK, Decryption=OK, Checks=${
          result.verification.valid ? 'ALL PASSED' : 'FAILED'
        }.`
      );
      saveDatabase(db);
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Encrypted backup verification failed.',
      });
    }
  }
);

/**
 * POST /api/backups/runs/:id/restore
 * Decrypts, verifies, and atomically restores the database from an encrypted `.sql.gz.enc` backup run.
 */
operationsRouter.post(
  '/backups/runs/:id/restore',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    try {
      const result = restoreFromEncryptedBackupRun(req.params.id, adminUser);
      res.json({
        restored: true,
        restoredSnapshotId: result.runLog.snapshotId,
        preRestoreSafetyPath: result.rollbackSnapshotFile,
        rollbackSnapshotFile: result.rollbackSnapshotFile,
        verification: result.verification,
        runLog: result.runLog,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Encrypted backup restoration failed.',
      });
    }
  }
);

/**
 * GET /api/backups/runs/:id/download
 * Downloads either the encrypted `.sql.gz.enc` archive or the decrypted `.sql` PostgreSQL dump (`?format=sql`).
 */
operationsRouter.get(
  '/backups/runs/:id/download',
  requirePermission('MANAGE_STAFF'),
  (req: StaffRequest, res: Response) => {
    const runLog = (db.backupRuns || []).find((r) => r.id === req.params.id);
    if (!runLog) {
      res.status(404).json({ error: 'Backup run not found.' });
      return;
    }
    const vaultDir = ensureBackupVaultDir();
    const filePath = path.join(vaultDir, runLog.fileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Encrypted backup file not found on disk.' });
      return;
    }

    const encryptedBytes = fs.readFileSync(filePath);
    if (req.query.format === 'sql') {
      try {
        const decryptedJson = decryptAndDecompressBackup(encryptedBytes);
        const parsed = JSON.parse(decryptedJson);
        const sqlDump = String(parsed.postgresSqlDump || '');
        const sqlFileName = runLog.fileName.replace(/\.sql\.gz\.enc$/, '.sql');
        res.setHeader('Content-Type', 'application/sql; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${sqlFileName}"`);
        res.send(sqlDump);
        return;
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Failed to decrypt SQL dump.',
        });
        return;
      }
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${runLog.fileName}"`);
    res.send(encryptedBytes);
  }
);

/**
 * POST /api/sync-to-supabase
 * Admin-only: synchronizes local records into Supabase PostgreSQL tables.
 */
operationsRouter.post(
  '/sync-to-supabase',
  requirePermission('MANAGE_STAFF'),
  async (req: StaffRequest, res: Response) => {
    const adminUser = req.staffUser!;
    try {
      const result = await syncDatabaseToSupabase(db);
      appendAudit(
        adminUser,
        'DATABASE_BACKUP_EXPORT',
        'SupabaseSync',
        'SYNC-ALL',
        null,
        `Admin ${adminUser.fullName} pushed all local farm records to Supabase PostgreSQL.`
      );
      saveDatabase(db);
      res.json({
        success: true,
        message: 'Successfully synchronized local records to Supabase PostgreSQL.',
        ...result,
      });
    } catch (err: any) {
      console.error('Supabase sync error:', err);
      res.status(500).json({
        error: `Supabase sync failed: ${err.message || err}`,
      });
    }
  }
);


