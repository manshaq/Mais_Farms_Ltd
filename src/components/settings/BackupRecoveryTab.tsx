import React, { useState } from 'react';
import { Download, Lock, ShieldCheck } from 'lucide-react';
import { MaisDatabaseState } from '../../types/mais';

interface BackupRecoveryTabProps {
  db: MaisDatabaseState;
  canManageStaff: boolean;
  onExportBackup?: () => Promise<any>;
  onVerifyBackup?: (snapshot?: any) => Promise<any>;
  onRestoreBackup?: (snapshot: any) => Promise<any>;
  onRunEncryptedBackup?: (tier?: 'daily' | 'monthly' | 'manual') => Promise<any>;
  onUpdateBackupSettings?: (payload: any) => Promise<any>;
  onVerifyEncryptedRun?: (runId: string) => Promise<any>;
  onRestoreEncryptedRun?: (runId: string) => Promise<any>;
  onPruneBackups?: () => Promise<any>;
}

export const BackupRecoveryTab: React.FC<BackupRecoveryTabProps> = ({
  db,
  canManageStaff,
  onExportBackup,
  onVerifyBackup,
  onRestoreBackup,
  onRunEncryptedBackup,
  onUpdateBackupSettings,
  onVerifyEncryptedRun,
  onRestoreEncryptedRun,
  onPruneBackups,
}) => {
  const bkpSettings = db.backupSettings || {
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

  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(bkpSettings.autoBackupEnabled);
  const [dailyRetentionDays, setDailyRetentionDays] = useState<number>(
    bkpSettings.dailyRetentionDays || 30
  );
  const [monthlyRetentionMonths, setMonthlyRetentionMonths] = useState<number>(
    bkpSettings.monthlyRetentionMonths || 12
  );
  const [maxRetryAttempts, setMaxRetryAttempts] = useState<number>(
    bkpSettings.maxRetryAttempts || 3
  );
  const [immutableObjectLock, setImmutableObjectLock] = useState<boolean>(
    bkpSettings.immutableObjectLock
  );
  const [objectLockDays, setObjectLockDays] = useState<number>(bkpSettings.objectLockDays || 30);
  const [alertAdminOnFailure, setAlertAdminOnFailure] = useState<boolean>(
    bkpSettings.alertAdminOnFailure
  );
  const [alertRecipientEmail, setAlertRecipientEmail] = useState<string>(
    bkpSettings.alertRecipientEmail || 'belloaliyu808@gmail.com'
  );

  const [lastExportedSnapshot, setLastExportedSnapshot] = useState<any | null>(null);
  const [verificationReport, setVerificationReport] = useState<any | null>(null);
  const [backupJsonInput, setBackupJsonInput] = useState('');
  const [backupBusy, setBackupBusy] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const handleDownloadBackup = async () => {
    if (!onExportBackup) return;
    setBackupBusy('export');
    setBackupMessage(null);
    try {
      const res = await onExportBackup();
      if (res.snapshot) {
        setLastExportedSnapshot(res.snapshot);
        setVerificationReport(res.verification || null);
        const jsonStr = JSON.stringify(res.snapshot, null, 2);
        setBackupJsonInput(jsonStr);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute(
          'download',
          `mais_ltd_backup_${new Date().toISOString().slice(0, 10)}.json`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setBackupMessage(
          `Signed snapshot ${res.snapshot.snapshotId} exported (${res.snapshot.integrityHash}).`
        );
      }
    } finally {
      setBackupBusy(null);
    }
  };

  const handleRunDryRunVerification = async () => {
    if (!onVerifyBackup) return;
    setBackupBusy('verify');
    setBackupMessage(null);
    try {
      let parsedSnapshot: any = undefined;
      if (backupJsonInput.trim()) {
        try {
          parsedSnapshot = JSON.parse(backupJsonInput);
        } catch {
          setBackupMessage('Invalid JSON in snapshot box; verifying live database instead.');
        }
      }
      const res = await onVerifyBackup(parsedSnapshot);
      setVerificationReport(res.verification);
      if (res.snapshot) {
        setLastExportedSnapshot(res.snapshot);
      }
      setBackupMessage(
        res.verification?.valid
          ? `Dry-run restoration test PASSED (${res.verification.checks.length} structural & integrity checks verified).`
          : 'Dry-run restoration test reported integrity issues.'
      );
    } finally {
      setBackupBusy(null);
    }
  };

  const handleExecuteRestore = async () => {
    if (!onRestoreBackup) return;
    const candidate = backupJsonInput.trim()
      ? (() => {
          try {
            return JSON.parse(backupJsonInput);
          } catch {
            return null;
          }
        })()
      : lastExportedSnapshot;
    if (!candidate) {
      setBackupMessage('Export or paste a valid backup snapshot JSON before restoring.');
      return;
    }
    setBackupBusy('restore');
    setBackupMessage(null);
    try {
      const res = await onRestoreBackup(candidate);
      setVerificationReport(res.verification || null);
      setBackupMessage(
        `Database restored from snapshot ${res.restoredSnapshotId}. Pre-restore safety snapshot saved to ${res.preRestoreSafetyPath}.`
      );
    } finally {
      setBackupBusy(null);
    }
  };

  if (!canManageStaff) {
    return (
      <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-600 flex flex-col items-center gap-2">
        <Lock className="w-5 h-5 text-slate-400" />
        <p className="font-semibold text-slate-900">Access Restricted</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-xs">
      {/* Automated Encrypted Backup Scheduler & Retention Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!onUpdateBackupSettings) return;
            setBackupBusy('save_policy');
            try {
              await onUpdateBackupSettings({
                autoBackupEnabled,
                dailyRetentionDays,
                monthlyRetentionMonths,
                maxRetryAttempts,
                immutableObjectLock,
                objectLockDays,
                alertAdminOnFailure,
                alertRecipientEmail,
              });
              setBackupMessage(
                `Saved automated backup policy: ${dailyRetentionDays}d daily, ${monthlyRetentionMonths}m monthly, ${maxRetryAttempts} retries, Object Lock ${
                  immutableObjectLock ? `${objectLockDays}d` : 'Off'
                }.`
              );
            } finally {
              setBackupBusy(null);
            }
          }}
          className="liquid-glass-panel rounded-xl p-5 lg:col-span-2 space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Automated Encrypted PostgreSQL Backup & Retention Policy
                </h3>
                <p className="text-slate-600 mt-0.5">
                  Independent daily/monthly server-side exports encrypted at rest with AES-256-GCM (`.sql.gz.enc`) and synced to local vault &amp; S3-compatible off-site storage.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 font-mono font-semibold text-[11px]">
                AES-256-GCM · TLS 1.2+
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Daily Retention (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  aria-label="Daily Backup Retention Days"
                  value={dailyRetentionDays}
                  onChange={(e) => setDailyRetentionDays(Number(e.target.value) || 30)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monthly Retention (Months)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  aria-label="Monthly Backup Retention Months"
                  value={monthlyRetentionMonths}
                  onChange={(e) => setMonthlyRetentionMonths(Number(e.target.value) || 12)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Max Retries on Failure
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  aria-label="Max Backup Retry Attempts"
                  value={maxRetryAttempts}
                  onChange={(e) => setMaxRetryAttempts(Number(e.target.value) || 3)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 border border-slate-200 rounded-lg bg-white space-y-1.5">
                <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={immutableObjectLock}
                    onChange={(e) => setImmutableObjectLock(e.target.checked)}
                  />
                  <span>Immutable Object Lock Protection</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">Lock Duration (Days):</span>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    aria-label="Object Lock Duration Days"
                    value={objectLockDays}
                    onChange={(e) => setObjectLockDays(Number(e.target.value) || 30)}
                    className="w-20 px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                  />
                </div>
              </div>

              <div className="p-3 border border-slate-200 rounded-lg bg-white space-y-1.5">
                <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertAdminOnFailure}
                    onChange={(e) => setAlertAdminOnFailure(e.target.checked)}
                  />
                  <span>Alert Admin on Backup Failure</span>
                </label>
                <input
                  type="text"
                  aria-label="Backup Failure Alert Email"
                  value={alertRecipientEmail}
                  onChange={(e) => setAlertRecipientEmail(e.target.value)}
                  placeholder="belloaliyu808@gmail.com"
                  className="w-full px-2.5 py-1 border border-slate-300 rounded font-mono bg-white"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <label className="flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => setAutoBackupEnabled(e.target.checked)}
              />
              <span>Enable Automated Daily &amp; Monthly Scheduled Exports</span>
            </label>
            <button
              type="submit"
              disabled={backupBusy === 'save_policy'}
              className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50"
            >
              {backupBusy === 'save_policy' ? 'Saving Policy...' : 'Save Backup Policy'}
            </button>
          </div>
        </form>

        {/* Encrypted PostgreSQL Backup Job Trigger Card */}
        <div className="liquid-glass-panel rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              Run Encrypted PostgreSQL Backup
            </h3>
            <p className="text-slate-600">
              Executes a consistent `SERIALIZABLE` / `pg_dump` PostgreSQL export preserving schema, tables, foreign keys, triggers, functions, indexes, and RLS policies, compressed with Gzip and encrypted with AES-256-GCM.
            </p>
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-[11px] space-y-1 text-slate-700">
              <p>Last Daily Run: {bkpSettings.lastDailyBackupDate || 'Pending'}</p>
              <p>Last Monthly Run: {bkpSettings.lastMonthlyBackupMonth || 'Pending'}</p>
              <p>Vault Archives: {(db.backupRuns || []).length} recorded run(s)</p>
            </div>
          </div>

          <div className="space-y-2">
            {onRunEncryptedBackup && (
              <button
                type="button"
                disabled={backupBusy === 'run_encrypted'}
                onClick={async () => {
                  setBackupBusy('run_encrypted');
                  setBackupMessage(null);
                  try {
                    const res = await onRunEncryptedBackup('manual');
                    if (res?.runLog) {
                      setBackupMessage(
                        `Encrypted backup ${res.runLog.fileName} created (${(
                          res.runLog.encryptedSizeBytes / 1024
                        ).toFixed(1)} KB · SHA-256 ${res.runLog.sha256Checksum.slice(0, 16)}).`
                      );
                    }
                  } finally {
                    setBackupBusy(null);
                  }
                }}
                className="w-full px-4 py-2.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                {backupBusy === 'run_encrypted'
                  ? 'Encrypting & Storing Backup...'
                  : 'Run Encrypted Backup (.sql.gz.enc)'}
              </button>
            )}

            {onPruneBackups && (
              <button
                type="button"
                disabled={backupBusy === 'prune'}
                onClick={async () => {
                  setBackupBusy('prune');
                  try {
                    await onPruneBackups();
                  } finally {
                    setBackupBusy(null);
                  }
                }}
                className="w-full px-4 py-2 font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {backupBusy === 'prune'
                  ? 'Checking Retention...'
                  : 'Enforce 30d/12m Retention Policy'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Encrypted Backup Vault & Run Telemetry Table */}
      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Encrypted Backup Vault &amp; Run Telemetry ({(db.backupRuns || []).length})
            </h3>
            <p className="text-slate-500">
              Server-side encrypted `.sql.gz.enc` archives with SHA-256 verification, Object Lock immutability, and zero secret exposure.
            </p>
          </div>
        </div>

        {(db.backupRuns || []).length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            No encrypted backup runs recorded yet. Click "Run Encrypted Backup (.sql.gz.enc)" above to generate your first archive.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Timestamp &amp; Tier</th>
                  <th className="py-2.5 px-3 font-semibold">Encrypted Archive</th>
                  <th className="py-2.5 px-3 font-semibold">Size &amp; Cipher</th>
                  <th className="py-2.5 px-3 font-semibold">Vault &amp; Status</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(db.backupRuns || []).map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <p className="text-slate-800">{run.startedAt.slice(0, 19).replace('T', ' ')}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-bold text-slate-800 uppercase">{run.tier}</span> · {run.engine}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <p className="font-semibold text-slate-900">{run.fileName}</p>
                      <p className="text-[11px] text-slate-500">
                        SHA-256: {run.sha256Checksum.slice(0, 16)}...
                      </p>
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <p className="font-semibold text-slate-900">
                        {(run.encryptedSizeBytes / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-[11px] text-slate-500">{run.cipher}</p>
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <p>
                        <span
                          className={`font-bold ${
                            run.status === 'Succeeded' ? 'text-emerald-800' : 'text-red-700'
                          }`}
                        >
                          {run.status} ({run.attemptCount}/{run.maxAttempts})
                        </span>
                        <span className="text-slate-600"> · {run.storageDestinations.join(', ')}</span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {run.immutableProtected && run.objectLockRetainUntil
                          ? `Locked until ${run.objectLockRetainUntil.slice(0, 10)}`
                          : `Expires ${run.retentionExpiresAt.slice(0, 10)}`}
                      </p>
                      {run.errorSummary && (
                        <p className="text-[11px] text-red-700 font-mono mt-0.5">
                          {run.errorSummary}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                      {run.status === 'Succeeded' && (
                        <>
                          {onVerifyEncryptedRun && (
                            <button
                              type="button"
                              onClick={async () => {
                                setBackupBusy(`verify_${run.id}`);
                                try {
                                  const res = await onVerifyEncryptedRun(run.id);
                                  if (res?.verification) {
                                    setVerificationReport(res.verification);
                                  }
                                } finally {
                                  setBackupBusy(null);
                                }
                              }}
                              className="px-2 py-1 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                            >
                              Verify
                            </button>
                          )}
                          <a
                            href={`/api/backups/runs/${encodeURIComponent(run.id)}/download?format=sql`}
                            download
                            className="px-2 py-1 font-semibold text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 inline-block"
                          >
                            .SQL
                          </a>
                          <a
                            href={`/api/backups/runs/${encodeURIComponent(run.id)}/download`}
                            download
                            className="px-2 py-1 font-semibold text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 inline-block"
                          >
                            .ENC
                          </a>
                          {onRestoreEncryptedRun && (
                            <button
                              type="button"
                              onClick={async () => {
                                setBackupBusy(`restore_${run.id}`);
                                try {
                                  const res = await onRestoreEncryptedRun(run.id);
                                  if (res?.verification) {
                                    setVerificationReport(res.verification);
                                  }
                                } finally {
                                  setBackupBusy(null);
                                }
                              }}
                              className="px-2 py-1 font-semibold text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50"
                            >
                              Restore
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="liquid-glass-panel rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              1. Export Signed Database Snapshot
            </h3>
            <p className="text-slate-600">
              Download a complete JSON + SQL snapshot of all MAIS LTD tables sealed with a SHA-256 signature.
            </p>
          </div>
          <button
            type="button"
            disabled={backupBusy === 'export'}
            onClick={handleDownloadBackup}
            className="w-full px-4 py-2.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {backupBusy === 'export'
              ? 'Exporting Snapshot...'
              : 'Download Signed Backup (.json)'}
          </button>
        </div>

        <div className="liquid-glass-panel rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              2. Restoration Dry-Run &amp; Integrity Test
            </h3>
            <p className="text-slate-600">
              Non-destructively test database restoration procedures (Sections 10 &amp; 17). Validates SHA-256 hash signature, animal tag uniqueness, relational foreign keys, and feed stock balance equations.
            </p>
          </div>
          <button
            type="button"
            disabled={backupBusy === 'verify'}
            onClick={handleRunDryRunVerification}
            className="w-full px-4 py-2.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            {backupBusy === 'verify'
              ? 'Running Verification Checks...'
              : 'Run Restoration Verification Test'}
          </button>
        </div>

        <div className="liquid-glass-panel rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              3. Atomic Database Restore
            </h3>
            <p className="text-slate-600">
              Restore the central database from a verified snapshot. Automatically writes a pre-restore rollback snapshot (`mais_db_pre_restore_*.json`) before applying changes.
            </p>
          </div>
          <button
            type="button"
            disabled={backupBusy === 'restore'}
            onClick={handleExecuteRestore}
            className="w-full px-4 py-2.5 font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {backupBusy === 'restore'
              ? 'Restoring Snapshot...'
              : 'Restore from Verified Snapshot'}
          </button>
        </div>
      </div>

      {backupMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-mono">
          {backupMessage}
        </div>
      )}

      {verificationReport && (
        <div className="liquid-glass-panel rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Restoration Verification &amp; Integrity Report ({verificationReport.snapshotId})
              </h4>
              <p className="font-mono text-slate-500 mt-0.5">
                Expected Hash: {verificationReport.integrityHashExpected} · Computed Hash:{' '}
                {verificationReport.integrityHashComputed}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-lg font-bold font-mono ${
                verificationReport.valid
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-red-100 text-red-900'
              }`}
            >
              {verificationReport.valid ? 'ALL CHECKS PASSED' : 'VERIFICATION FAILED'}
            </span>
          </div>
          <div className="divide-y divide-slate-200">
            {verificationReport.checks?.map((chk: any, idx: number) => (
              <div key={idx} className="px-4 py-2.5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{chk.checkName}</p>
                  <p className="text-slate-600 font-mono text-[11px]">{chk.details}</p>
                </div>
                <span
                  className={`font-mono font-bold ${
                    chk.passed ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {chk.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="liquid-glass-panel rounded-xl p-4 space-y-2">
        <label className="block font-bold text-slate-900">
          Snapshot Payload Inspector / Upload JSON for Verification or Restore
        </label>
        <textarea
          aria-label="Backup Snapshot JSON Payload"
          rows={6}
          value={backupJsonInput}
          onChange={(e) => setBackupJsonInput(e.target.value)}
          placeholder="Click 'Download Signed Backup (.json)' or paste a backup snapshot JSON envelope here to verify or restore..."
          className="w-full p-3 border border-slate-300 rounded-lg bg-white font-mono text-[11px]"
        />
      </div>
    </div>
  );
};
