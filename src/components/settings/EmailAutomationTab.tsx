import React, { useState } from 'react';
import {
  BellRing,
  Download,
  Eye,
  Lock,
  Mail,
  Search,
  X,
} from 'lucide-react';
import {
  EmailCsvAttachment,
  EmailNotificationLog,
  MaisDatabaseState,
} from '../../types/mais';

interface EmailAutomationTabProps {
  db: MaisDatabaseState;
  canViewAudit: boolean;
  onUpdateNotificationSettings?: (payload: any) => Promise<void>;
  onSendMonthlyReportEmail?: (startDate: string, endDate: string) => Promise<void>;
  onRunDueReminders?: (forceResend?: boolean) => Promise<void>;
}

export const EmailAutomationTab: React.FC<EmailAutomationTabProps> = ({
  db,
  canViewAudit,
  onUpdateNotificationSettings,
  onSendMonthlyReportEmail,
  onRunDueReminders,
}) => {
  const settings = db.notificationSettings || {
    autoMonthlyReportEnabled: true,
    monthlyReportDayOfMonth: 1,
    autoDailyReminderEnabled: true,
    reminderLeadDays: 1,
    additionalRecipientEmails: '',
    lastMonthlyReportSentMonth: null,
    lastDailyReminderRunDate: null,
  };

  const [autoMonthly, setAutoMonthly] = useState<boolean>(settings.autoMonthlyReportEnabled);
  const [monthlyDay, setMonthlyDay] = useState<number>(settings.monthlyReportDayOfMonth || 1);
  const [autoDaily, setAutoDaily] = useState<boolean>(settings.autoDailyReminderEnabled);
  const [leadDays, setLeadDays] = useState<number>(settings.reminderLeadDays || 1);
  const [extraRecipients, setExtraRecipients] = useState<string>(
    settings.additionalRecipientEmails || ''
  );

  const [reportMonthStart, setReportMonthStart] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [reportMonthEnd, setReportMonthEnd] = useState<string>(() => {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  });

  const [emailSearch, setEmailSearch] = useState('');
  const [emailCategoryFilter, setEmailCategoryFilter] = useState<'ALL' | 'MONTHLY_REPORT' | 'DUE_REMINDER'>('ALL');
  const [inspectedEmail, setInspectedEmail] = useState<EmailNotificationLog | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleSaveScheduleSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateNotificationSettings) return;
    setBusyAction('save_settings');
    try {
      await onUpdateNotificationSettings({
        autoMonthlyReportEnabled: autoMonthly,
        monthlyReportDayOfMonth: monthlyDay,
        autoDailyReminderEnabled: autoDaily,
        reminderLeadDays: leadDays,
        additionalRecipientEmails: extraRecipients,
      });
    } finally {
      setBusyAction(null);
    }
  };

  const downloadAttachmentCsv = (att: EmailCsvAttachment) => {
    const bom = '\uFEFF';
    const blob = new Blob([bom + att.contentCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', att.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredEmailLogs = (db.emailLogs || []).filter((log) => {
    if (emailCategoryFilter !== 'ALL' && log.category !== emailCategoryFilter) {
      return false;
    }
    if (!emailSearch.trim()) return true;
    const q = emailSearch.toLowerCase();
    return (
      log.subject.toLowerCase().includes(q) ||
      log.summaryText.toLowerCase().includes(q) ||
      log.recipients.some((r) => r.toLowerCase().includes(q))
    );
  });

  if (!canViewAudit) {
    return (
      <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-600 flex flex-col items-center gap-2">
        <Lock className="w-5 h-5 text-slate-400" />
        <p className="font-semibold text-slate-900">Access Restricted</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-xs">
      {/* Schedule Configuration & Manual Dispatch Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <form
          onSubmit={handleSaveScheduleSettings}
          className="liquid-glass-panel rounded-xl p-5 lg:col-span-2 space-y-4 flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Automated Email Schedule & Recipients
              </h3>
              <span className="text-slate-500 font-mono">
                Recipients: Active Admins & Farm Managers
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-3.5 border border-slate-200 rounded-lg bg-white space-y-2">
                <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoMonthly}
                    onChange={(e) => setAutoMonthly(e.target.checked)}
                  />
                  <span>Automated Monthly Report Email</span>
                </label>
                <p className="text-slate-600">
                  Sends monthly executive digest + 3 CSV attachments (Expenses, Herd Costs, Health Treatments) to Admins & Farm Managers.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-slate-600">Send on Day of Month:</span>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    aria-label="Day of Month for Monthly Report"
                    value={monthlyDay}
                    onChange={(e) => setMonthlyDay(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                  />
                </div>
              </div>

              <div className="p-3.5 border border-slate-200 rounded-lg bg-white space-y-2">
                <label className="flex items-center gap-2 font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDaily}
                    onChange={(e) => setAutoDaily(e.target.checked)}
                  />
                  <span>Automated Advance Due / Revisit Reminders</span>
                </label>
                <p className="text-slate-600">
                  Emails assigned staff & managers before Tasks, Vet Treatment Revisits, Vaccinations, and Pregnancy/Calving dates.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-slate-600">Advance Lead Days:</span>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    aria-label="Advance Lead Days"
                    value={leadDays}
                    onChange={(e) => setLeadDays(Number(e.target.value) || 1)}
                    className="w-16 px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                  />
                  <span className="text-slate-500">day(s) before due date</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Additional Recipient Emails (Optional, comma-separated)
              </label>
              <input
                type="text"
                value={extraRecipients}
                onChange={(e) => setExtraRecipients(e.target.value)}
                placeholder="auditor@maislivestock.ng, director@maislivestock.ng"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={busyAction === 'save_settings'}
              className="px-4 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {busyAction === 'save_settings' ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </form>

        {/* Manual Dispatch Card */}
        <div className="liquid-glass-panel rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Immediate Email Dispatch</h3>
            <p className="text-slate-600">
              Generate and send a monthly report package (with CSV attachments) or trigger the 1-day advance reminder check now.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Period Start
                </label>
                <input
                  type="date"
                  aria-label="Monthly Report Start Date"
                  value={reportMonthStart}
                  onChange={(e) => setReportMonthStart(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Period End
                </label>
                <input
                  type="date"
                  aria-label="Monthly Report End Date"
                  value={reportMonthEnd}
                  onChange={(e) => setReportMonthEnd(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono bg-white"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {onSendMonthlyReportEmail && (
              <button
                type="button"
                disabled={busyAction === 'send_monthly'}
                onClick={async () => {
                  setBusyAction('send_monthly');
                  try {
                    await onSendMonthlyReportEmail(reportMonthStart, reportMonthEnd);
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="w-full px-4 py-2.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                <Mail className="w-3.5 h-3.5" />
                {busyAction === 'send_monthly'
                  ? 'Dispatching Monthly Report...'
                  : 'Send Monthly Report Now'}
              </button>
            )}

            {onRunDueReminders && (
              <button
                type="button"
                disabled={busyAction === 'run_reminders'}
                onClick={async () => {
                  setBusyAction('run_reminders');
                  try {
                    await onRunDueReminders(true);
                  } finally {
                    setBusyAction(null);
                  }
                }}
                className="w-full px-4 py-2 font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg inline-flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
              >
                <BellRing className="w-3.5 h-3.5 text-amber-700" />
                {busyAction === 'run_reminders'
                  ? 'Checking Due Items...'
                  : 'Run 1-Day Reminder Check'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Email Outbox & Delivery Log Table */}
      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Email Outbox & Delivery Log ({filteredEmailLogs.length})
            </h3>
            <p className="text-slate-500">
              Every monthly report and 1-day advance reminder email is logged here with full HTML preview and downloadable CSV attachments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search Email Outbox"
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                placeholder="Search subject, recipient..."
                className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <select
              aria-label="Filter Email Category"
              value={emailCategoryFilter}
              onChange={(e) => setEmailCategoryFilter(e.target.value as any)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
            >
              <option value="ALL">All Categories</option>
              <option value="MONTHLY_REPORT">MONTHLY_REPORT</option>
              <option value="DUE_REMINDER">DUE_REMINDER</option>
            </select>
          </div>
        </div>

        {filteredEmailLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No emails dispatched yet. Click "Send Monthly Report Now" or "Run 1-Day Reminder Check" above to generate and send.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-white text-slate-600">
                  <th className="py-3 px-4 font-semibold">Sent Time</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Subject & Summary</th>
                  <th className="py-3 px-4 font-semibold">Recipients</th>
                  <th className="py-3 px-4 font-semibold">Attachments</th>
                  <th className="py-3 px-4 font-semibold">Delivery Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredEmailLogs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {item.sentAt.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{item.subject}</p>
                      <p className="text-slate-600 mt-0.5">{item.summaryText}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {item.recipients.join(', ')}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {item.attachments.length > 0
                        ? `${item.attachments.length} CSV file(s)`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-emerald-800">
                        {item.status}
                      </span>{' '}
                      <span className="text-slate-500">· {item.transport}</span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setInspectedEmail(item)}
                        className="px-2.5 py-1 font-semibold text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Inspector Modal */}
      {inspectedEmail && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Email Message Inspector"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{inspectedEmail.subject}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  To: {inspectedEmail.recipients.join(', ')} · {inspectedEmail.sentAt.slice(0, 19).replace('T', ' ')}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Email Inspector"
                onClick={() => setInspectedEmail(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div
                className="bg-slate-50 p-4 rounded-xl border border-slate-200"
                dangerouslySetInnerHTML={{ __html: inspectedEmail.htmlBody }}
              />

              {inspectedEmail.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">
                    Attached Audit CSV Files ({inspectedEmail.attachments.length})
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {inspectedEmail.attachments.map((att) => (
                      <button
                        key={att.fileName}
                        type="button"
                        onClick={() => downloadAttachmentCsv(att)}
                        className="p-2.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-left flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-mono font-semibold text-slate-900 truncate">
                            {att.fileName}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {att.rowCount} row(s)
                          </p>
                        </div>
                        <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedEmail(null)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
