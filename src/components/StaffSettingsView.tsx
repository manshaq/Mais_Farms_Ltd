import React, { useState } from 'react';
import { MaisDatabaseState, StaffUser } from '../types/mais';
import { canPerformAction } from '../domain/farmRules';
import { StaffTab } from './settings/StaffTab';
import { EmailAutomationTab } from './settings/EmailAutomationTab';
import { ActivityAuditTab } from './settings/ActivityAuditTab';
import { BackupRecoveryTab } from './settings/BackupRecoveryTab';

export interface StaffSettingsViewProps {
  db: MaisDatabaseState;
  currentUser: StaffUser;
  onCreateStaffUser: (payload: any) => Promise<void>;
  onUpdateStaffUser: (userId: string, payload: any) => Promise<void>;
  onDeleteStaffUser?: (userId: string) => Promise<void>;
  onUpdateNotificationSettings?: (payload: any) => Promise<void>;
  onSendMonthlyReportEmail?: (startDate: string, endDate: string) => Promise<void>;
  onRunDueReminders?: (forceResend?: boolean) => Promise<void>;
  onExportBackup?: () => Promise<any>;
  onVerifyBackup?: (snapshot?: any) => Promise<any>;
  onRestoreBackup?: (snapshot: any) => Promise<any>;
  onRunEncryptedBackup?: (tier?: 'daily' | 'monthly' | 'manual') => Promise<any>;
  onUpdateBackupSettings?: (payload: any) => Promise<any>;
  onVerifyEncryptedRun?: (runId: string) => Promise<any>;
  onRestoreEncryptedRun?: (runId: string) => Promise<any>;
  onPruneBackups?: () => Promise<any>;
}

export const StaffSettingsView: React.FC<StaffSettingsViewProps> = ({
  db,
  currentUser,
  onCreateStaffUser,
  onUpdateStaffUser,
  onDeleteStaffUser,
  onUpdateNotificationSettings,
  onSendMonthlyReportEmail,
  onRunDueReminders,
  onExportBackup,
  onVerifyBackup,
  onRestoreBackup,
  onRunEncryptedBackup,
  onUpdateBackupSettings,
  onVerifyEncryptedRun,
  onRestoreEncryptedRun,
  onPruneBackups,
}) => {
  const [subTab, setSubTab] = useState<'staff' | 'email' | 'activity' | 'backup'>('staff');

  const canManageStaff = canPerformAction(currentUser.role, 'MANAGE_STAFF');
  const canViewAudit = canPerformAction(currentUser.role, 'VIEW_AUDIT');

  return (
    <div className="space-y-5">
      {/* Subtab Navigation Bar */}
      <div className="liquid-glass-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-900">Settings &amp; Audit</h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setSubTab('staff')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                subTab === 'staff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Staff ({db.users.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('email')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                subTab === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Email Automation
            </button>
            <button
              type="button"
              onClick={() => setSubTab('activity')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                subTab === 'activity' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Activity Log ({db.auditLogs.length})
            </button>
            {canManageStaff && (
              <button
                type="button"
                onClick={() => setSubTab('backup')}
                className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                  subTab === 'backup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Backup &amp; Recovery
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subtab Views */}
      {subTab === 'staff' && (
        <StaffTab
          db={db}
          currentUser={currentUser}
          canManageStaff={canManageStaff}
          onCreateStaffUser={onCreateStaffUser}
          onUpdateStaffUser={onUpdateStaffUser}
          onDeleteStaffUser={onDeleteStaffUser}
        />
      )}

      {subTab === 'email' && (
        <EmailAutomationTab
          db={db}
          canViewAudit={canViewAudit}
          onUpdateNotificationSettings={onUpdateNotificationSettings}
          onSendMonthlyReportEmail={onSendMonthlyReportEmail}
          onRunDueReminders={onRunDueReminders}
        />
      )}

      {subTab === 'activity' && (
        <ActivityAuditTab
          db={db}
          canViewAudit={canViewAudit}
        />
      )}

      {subTab === 'backup' && canManageStaff && (
        <BackupRecoveryTab
          db={db}
          canManageStaff={canManageStaff}
          onExportBackup={onExportBackup}
          onVerifyBackup={onVerifyBackup}
          onRestoreBackup={onRestoreBackup}
          onRunEncryptedBackup={onRunEncryptedBackup}
          onUpdateBackupSettings={onUpdateBackupSettings}
          onVerifyEncryptedRun={onVerifyEncryptedRun}
          onRestoreEncryptedRun={onRestoreEncryptedRun}
          onPruneBackups={onPruneBackups}
        />
      )}
    </div>
  );
};
