import dotenv from 'dotenv';
import { db } from '../db/store.ts';
import {
  executeEncryptedBackupJob,
  getBackupEnvironmentStatus,
  pruneExpiredBackups,
  verifyEncryptedBackupFile,
} from './backupService.ts';
import { StaffUser } from '../../src/types/mais.ts';

dotenv.config();

async function main() {
  const command = process.argv[2] || 'run';
  const tierArg = process.argv.find((a) => a.startsWith('--tier='))?.split('=')[1] as
    | 'daily'
    | 'monthly'
    | 'manual'
    | undefined;

  const cliActor: StaffUser =
    db.users.find((u) => u.role === 'Admin') || {
      id: 'CLI-ADMIN',
      fullName: 'CLI Backup Operator',
      email: 'belloaliyu808@gmail.com',
      role: 'Admin',
      title: 'System Administrator',
      canApproveExpenses: true,
      status: 'Active',
      lastActive: new Date().toISOString(),
    };

  if (command === 'status') {
    console.log(JSON.stringify(getBackupEnvironmentStatus(), null, 2));
    return;
  }

  if (command === 'prune') {
    const res = pruneExpiredBackups();
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (command === 'verify') {
    const latestRun = (db.backupRuns || []).find((r) => r.status === 'Succeeded');
    if (!latestRun) {
      console.error('No succeeded backup runs found to verify.');
      process.exit(1);
    }
    const verified = verifyEncryptedBackupFile(latestRun.id);
    console.log(
      JSON.stringify(
        {
          runId: verified.runLog.id,
          fileName: verified.runLog.fileName,
          cipher: verified.runLog.cipher,
          checksumVerified: verified.checksumVerified,
          decryptionSucceeded: verified.decryptionSucceeded,
          valid: verified.verification.valid,
          checks: verified.verification.checks,
        },
        null,
        2
      )
    );
    if (!verified.verification.valid) process.exit(1);
    return;
  }

  // Default: 'run'
  const { runLog, prunedCount } = await executeEncryptedBackupJob({
    actor: cliActor,
    requestedTier: tierArg || 'manual',
  });

  console.log(
    JSON.stringify(
      {
        id: runLog.id,
        status: runLog.status,
        tier: runLog.tier,
        engine: runLog.engine,
        fileName: runLog.fileName,
        uncompressedSizeBytes: runLog.uncompressedSizeBytes,
        encryptedSizeBytes: runLog.encryptedSizeBytes,
        cipher: runLog.cipher,
        sha256Checksum: runLog.sha256Checksum,
        storageDestinations: runLog.storageDestinations,
        objectLockRetainUntil: runLog.objectLockRetainUntil,
        retentionExpiresAt: runLog.retentionExpiresAt,
        prunedExpiredCount: prunedCount,
        errorSummary: runLog.errorSummary,
      },
      null,
      2
    )
  );

  if (runLog.status !== 'Succeeded') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Backup CLI execution failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
