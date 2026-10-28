import React, { useMemo, useState } from 'react';
import { Download, Lock, Search, ShieldCheck } from 'lucide-react';
import { MaisDatabaseState } from '../../types/mais';
import { computeAuditEntryHash, filterAuditLogs } from '../../domain/farmRules';
import { downloadCsvFile } from '../../utils/csvExport';

interface ActivityAuditTabProps {
  db: MaisDatabaseState;
  canViewAudit: boolean;
}

export const ActivityAuditTab: React.FC<ActivityAuditTabProps> = ({
  db,
  canViewAudit,
}) => {
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditUserFilter, setAuditUserFilter] = useState('ALL');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  const distinctAuditActions = useMemo(() => {
    const actions = new Set<string>();
    for (const log of db.auditLogs) {
      if (log.action) actions.add(log.action);
    }
    return Array.from(actions).sort();
  }, [db.auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    return filterAuditLogs(db.auditLogs, {
      searchQuery: auditSearch,
      action: auditActionFilter,
      userId: auditUserFilter,
      startDate: auditStartDate,
      endDate: auditEndDate,
    });
  }, [db.auditLogs, auditSearch, auditActionFilter, auditUserFilter, auditStartDate, auditEndDate]);

  const handleExportAuditCsv = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const headers = [
      'Audit ID',
      'Timestamp',
      'Staff ID',
      'Staff Name',
      'Staff Role',
      'Action',
      'Entity Type',
      'Entity ID',
      'Animal Tag',
      'Previous Value',
      'New Value',
      'Summary',
      'Integrity Hash',
    ];
    const rows = filteredAuditLogs.map((log) => {
      const resolvedHash =
        log.integrityHash || computeAuditEntryHash(log, log.previousHash || null);
      return [
        log.id,
        log.timestamp.slice(0, 19).replace('T', ' '),
        log.userId,
        log.userName,
        log.userRole,
        log.action,
        log.entityType,
        log.entityId,
        log.animalTag || '',
        log.previousValue || '',
        log.newValue || '',
        log.summary,
        resolvedHash,
      ];
    });
    downloadCsvFile(`mais_audit_logs_export_${dateStamp}.csv`, headers, rows);
  };

  if (!canViewAudit) {
    return (
      <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-600 flex flex-col items-center gap-2">
        <Lock className="w-5 h-5 text-slate-400" />
        <p className="font-semibold text-slate-900">Access Restricted</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="liquid-glass-panel rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs items-end">
        <div className="relative lg:col-span-2">
          <label className="block font-semibold text-slate-700 mb-1">Search Activity</label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search Activity Log"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Search summary, staff, tag, hash..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Action Type</label>
          <select
            aria-label="Filter by Action Type"
            value={auditActionFilter}
            onChange={(e) => setAuditActionFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
          >
            <option value="ALL">All Actions</option>
            {distinctAuditActions.map((act) => (
              <option key={act} value={act}>
                {act}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Staff Member</label>
          <select
            aria-label="Filter by Staff Member"
            value={auditUserFilter}
            onChange={(e) => setAuditUserFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">All Staff</option>
            {db.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">From</label>
            <input
              type="date"
              aria-label="Filter From Date"
              value={auditStartDate}
              onChange={(e) => setAuditStartDate(e.target.value)}
              className="w-full px-2 py-2 border border-slate-300 rounded-lg bg-white font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">To</label>
            <input
              type="date"
              aria-label="Filter To Date"
              value={auditEndDate}
              onChange={(e) => setAuditEndDate(e.target.value)}
              className="w-full px-2 py-2 border border-slate-300 rounded-lg bg-white font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleExportAuditCsv}
            disabled={filteredAuditLogs.length === 0}
            className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV ({filteredAuditLogs.length})
          </button>
        </div>
      </div>

      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        {filteredAuditLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No matching activity records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Time</th>
                  <th className="py-3 px-4 font-semibold">Staff</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">Tag</th>
                  <th className="py-3 px-4 font-semibold">State Change</th>
                  <th className="py-3 px-4 font-semibold">Details</th>
                  <th className="py-3 px-4 font-semibold">Integrity Seal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredAuditLogs.map((log) => {
                  const seal =
                    log.integrityHash || computeAuditEntryHash(log, log.previousHash || null);
                  const isSecurityAlert = log.action === 'LOGIN_RATE_LIMITED';
                  return (
                    <tr
                      key={log.id}
                      className={
                        isSecurityAlert ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50'
                      }
                    >
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {log.timestamp.slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{log.userName}</p>
                        <p className="text-slate-500">{log.userRole}</p>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span
                          className={
                            isSecurityAlert
                              ? 'font-bold text-red-700'
                              : 'font-bold text-emerald-800'
                          }
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        {log.animalTag || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {log.previousValue || log.newValue ? (
                          <span>
                            {log.previousValue || '—'} → {log.newValue || '—'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-900">{log.summary}</td>
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        <span
                          title={`Tamper-evident chain hash: ${seal}`}
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-800"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          {seal.slice(0, 12)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
