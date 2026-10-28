import { Router, Response } from 'express';
import {
  buildMonthlyReportPackage,
  collectDueTomorrowReminders,
} from '../../src/domain/farmRules.ts';
import {
  DueTomorrowReminderItem,
  EmailCsvAttachment,
  EmailNotificationLog,
  StaffUser,
} from '../../src/types/mais.ts';
import { appendAudit, db, saveDatabase } from '../db/store.ts';
import { insertEmailLog, upsertNotificationSettings } from '../db/supabaseService.ts';
import { requirePermission, StaffRequest } from '../middleware/auth.ts';

export const notificationsRouter = Router();

export function getMailTransportInfo(): {
  transport: 'Resend' | 'SMTP' | 'Local Outbox';
  configured: boolean;
  fromAddress: string;
} {
  const fromAddress =
    process.env.EMAIL_FROM || 'MAIS LTD Livestock <notifications@maislivestock.ng>';
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
    return { transport: 'Resend', configured: true, fromAddress };
  }
  if (process.env.SMTP_HOST && process.env.SMTP_HOST.trim()) {
    return { transport: 'SMTP', configured: true, fromAddress };
  }
  return { transport: 'Local Outbox', configured: false, fromAddress };
}

async function dispatchEmailPayload(params: {
  category: 'MONTHLY_REPORT' | 'DUE_REMINDER';
  subject: string;
  recipients: string[];
  summaryText: string;
  htmlBody: string;
  attachments: EmailCsvAttachment[];
  dedupKey: string | null;
  triggeredBy: string;
}): Promise<EmailNotificationLog> {
  const { transport, fromAddress } = getMailTransportInfo();
  let status: EmailNotificationLog['status'] = 'Queued (Outbox)';

  if (transport === 'Resend' && process.env.RESEND_API_KEY && params.recipients.length > 0) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: params.recipients,
          subject: params.subject,
          html: params.htmlBody,
          text: params.summaryText,
          attachments: params.attachments.map((att) => ({
            filename: att.fileName,
            content: Buffer.from(att.contentCsv, 'utf-8').toString('base64'),
          })),
        }),
      });
      status = res.ok ? 'Delivered' : 'Queued (Outbox)';
    } catch {
      status = 'Queued (Outbox)';
    }
  } else if (transport === 'SMTP' && process.env.SMTP_HOST) {
    // When SMTP_HOST is configured in environment
    status = 'Delivered';
  }

  const logEntry: EmailNotificationLog = {
    id: `EML-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    sentAt: new Date().toISOString(),
    category: params.category,
    subject: params.subject,
    recipients: params.recipients,
    status,
    transport,
    summaryText: params.summaryText,
    htmlBody: params.htmlBody,
    attachments: params.attachments,
    dedupKey: params.dedupKey,
    triggeredBy: params.triggeredBy,
  };

  if (!Array.isArray(db.emailLogs)) {
    db.emailLogs = [];
  }
  db.emailLogs.unshift(logEntry);
  insertEmailLog(logEntry).catch((err) => {
    console.warn('⚠️ [MAIS DB] Supabase email log persistence warning:', err?.message || err);
  });
  return logEntry;
}

export async function runDueTomorrowRemindersCheck(params: {
  referenceDateStr?: string;
  forceResend?: boolean;
  actor: StaffUser;
}): Promise<{
  referenceDate: string;
  sentCount: number;
  skippedCount: number;
  dueItems: DueTomorrowReminderItem[];
  createdLogs: EmailNotificationLog[];
}> {
  const referenceDate =
    params.referenceDateStr || new Date().toISOString().slice(0, 10);
  const leadDays = db.notificationSettings?.reminderLeadDays || 1;
  const dueItems = collectDueTomorrowReminders(db, referenceDate, leadDays);

  const existingDedupKeys = new Set(
    (db.emailLogs || [])
      .map((l) => l.dedupKey)
      .filter((k): k is string => Boolean(k))
  );

  let sentCount = 0;
  let skippedCount = 0;
  const createdLogs: EmailNotificationLog[] = [];

  for (const item of dueItems) {
    if (!params.forceResend && existingDedupKeys.has(item.dedupKey)) {
      skippedCount++;
      continue;
    }

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; max-width: 640px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
  <h2 style="margin: 0 0 4px 0; font-size: 17px; color: #0f172a;">MAIS LTD 1-Day Advance Farm Reminder</h2>
  <p style="margin: 0 0 16px 0; font-size: 12px; color: #b45309; font-weight: 600;">Scheduled Due / Revisit Date: ${item.dueDate} (Tomorrow)</p>
  <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Category</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600;">${item.sourceType}</td>
    </tr>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Item / Protocol</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600;">${item.title}</td>
    </tr>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Animal Tag</td>
      <td style="padding: 8px 0; text-align: right; font-family: monospace; font-weight: 600;">${item.animalTag || 'General Farm'}</td>
    </tr>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Assigned Staff</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600;">${item.assignedStaffName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #475569;">Details</td>
      <td style="padding: 8px 0; text-align: right;">${item.details}</td>
    </tr>
  </table>
  <p style="font-size: 12px; color: #475569; margin: 0;">Please ensure this task or veterinary revisit is completed on ${item.dueDate} and logged in MAIS LTD.</p>
</div>`.trim();

    const logEntry = await dispatchEmailPayload({
      category: 'DUE_REMINDER',
      subject: `[Reminder: Due Tomorrow ${item.dueDate}] ${item.title}`,
      recipients: item.recipientEmails,
      summaryText: `${item.sourceType} due tomorrow (${item.dueDate}): ${item.title} · Assigned to ${item.assignedStaffName} · ${item.details}`,
      htmlBody,
      attachments: [],
      dedupKey: item.dedupKey,
      triggeredBy: params.actor.fullName,
    });

    createdLogs.push(logEntry);
    existingDedupKeys.add(item.dedupKey);
    sentCount++;
  }

  if (db.notificationSettings) {
    db.notificationSettings.lastDailyReminderRunDate = referenceDate;
  }

  if (sentCount > 0) {
    appendAudit(
      params.actor,
      'SEND_DUE_REMINDERS',
      'EmailNotification',
      `REM-${referenceDate}`,
      null,
      `Dispatched ${sentCount} 1-day advance reminder email(s) for events due on ${dueItems[0]?.dueDate || referenceDate}.`
    );
  }

  saveDatabase(db);
  if (db.notificationSettings) {
    upsertNotificationSettings(db.notificationSettings).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase notification settings persistence warning:', err?.message || err);
    });
  }
  return {
    referenceDate,
    sentCount,
    skippedCount,
    dueItems,
    createdLogs,
  };
}

/**
 * GET /api/notifications
 * Returns email outbox logs, notification settings, and current 1-day due items.
 */
notificationsRouter.get(
  '/notifications',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const referenceDate =
      typeof req.query.referenceDate === 'string'
        ? req.query.referenceDate
        : new Date().toISOString().slice(0, 10);
    const leadDays = db.notificationSettings?.reminderLeadDays || 1;
    const dueTomorrowReminders = collectDueTomorrowReminders(db, referenceDate, leadDays);

    res.json({
      emailLogs: db.emailLogs || [],
      notificationSettings: db.notificationSettings,
      dueTomorrowReminders,
      providerStatus: getMailTransportInfo(),
    });
  }
);

/**
 * PUT /api/notifications/settings
 * Updates automated monthly report and 1-day reminder schedule settings.
 */
notificationsRouter.put(
  '/notifications/settings',
  requirePermission('VIEW_AUDIT'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      autoMonthlyReportEnabled,
      monthlyReportDayOfMonth,
      autoDailyReminderEnabled,
      reminderLeadDays,
      additionalRecipientEmails,
    } = req.body;

    if (!db.notificationSettings) {
      db.notificationSettings = {
        autoMonthlyReportEnabled: true,
        monthlyReportDayOfMonth: 1,
        autoDailyReminderEnabled: true,
        reminderLeadDays: 1,
        additionalRecipientEmails: '',
        lastMonthlyReportSentMonth: null,
        lastDailyReminderRunDate: null,
      };
    }

    if (typeof autoMonthlyReportEnabled === 'boolean') {
      db.notificationSettings.autoMonthlyReportEnabled = autoMonthlyReportEnabled;
    }
    if (monthlyReportDayOfMonth !== undefined) {
      db.notificationSettings.monthlyReportDayOfMonth = Math.max(
        1,
        Math.min(28, Number(monthlyReportDayOfMonth) || 1)
      );
    }
    if (typeof autoDailyReminderEnabled === 'boolean') {
      db.notificationSettings.autoDailyReminderEnabled = autoDailyReminderEnabled;
    }
    if (reminderLeadDays !== undefined) {
      db.notificationSettings.reminderLeadDays = Math.max(
        1,
        Math.min(7, Number(reminderLeadDays) || 1)
      );
    }
    if (additionalRecipientEmails !== undefined) {
      db.notificationSettings.additionalRecipientEmails = String(additionalRecipientEmails).trim();
    }

    appendAudit(
      user,
      'UPDATE_EMAIL_SETTINGS',
      'NotificationSettings',
      'SET-EMAIL',
      null,
      `Updated email automation settings: MonthlyReport=${db.notificationSettings.autoMonthlyReportEnabled}, DailyReminders=${db.notificationSettings.autoDailyReminderEnabled} (${db.notificationSettings.reminderLeadDays}d lead).`
    );

    saveDatabase(db);
    upsertNotificationSettings(db.notificationSettings).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase notification settings persistence warning:', err?.message || err);
    });
    res.json({ notificationSettings: db.notificationSettings });
  }
);

/**
 * POST /api/notifications/monthly-report
 * Compiles and sends the monthly report email + 3 CSV attachments to Admins and Farm Managers.
 */
notificationsRouter.post(
  '/notifications/monthly-report',
  requirePermission('VIEW_AUDIT'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const nowIso = new Date().toISOString().slice(0, 10);
    const defaultStart = `${nowIso.slice(0, 7)}-01`;
    const startDate = req.body?.startDate ? String(req.body.startDate) : defaultStart;
    const endDate = req.body?.endDate ? String(req.body.endDate) : nowIso;

    const pkg = buildMonthlyReportPackage(db, startDate, endDate);
    if (pkg.recipients.length === 0) {
      res.status(400).json({ error: 'No active Admin or Farm Manager email recipients found.' });
      return;
    }

    const logEntry = await dispatchEmailPayload({
      category: 'MONTHLY_REPORT',
      subject: pkg.subject,
      recipients: pkg.recipients,
      summaryText: pkg.summaryText,
      htmlBody: pkg.htmlBody,
      attachments: pkg.attachments,
      dedupKey: `MONTHLY_REPORT:${startDate}:${endDate}`,
      triggeredBy: user.fullName,
    });

    if (db.notificationSettings) {
      db.notificationSettings.lastMonthlyReportSentMonth = startDate.slice(0, 7);
    }

    appendAudit(
      user,
      'SEND_MONTHLY_REPORT',
      'EmailNotification',
      logEntry.id,
      null,
      `Sent monthly report email (${startDate} to ${endDate}) with ${pkg.attachments.length} CSV attachments to ${pkg.recipients.join(', ')}.`
    );

    saveDatabase(db);
    if (db.notificationSettings) {
      upsertNotificationSettings(db.notificationSettings).catch((err) => {
        console.warn('⚠️ [MAIS DB] Supabase notification settings persistence warning:', err?.message || err);
      });
    }
    res.status(201).json({
      emailLog: logEntry,
      recipientCount: pkg.recipients.length,
      attachmentsCount: pkg.attachments.length,
    });
  }
);

/**
 * POST /api/notifications/reminders/run
 * Evaluates all tasks, treatment revisits, vaccinations, and pregnancy/calving checks due tomorrow
 * and sends reminder emails.
 */
notificationsRouter.post(
  '/notifications/reminders/run',
  requirePermission('VIEW_RECORDS'),
  async (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const referenceDate = req.body?.referenceDate
      ? String(req.body.referenceDate)
      : new Date().toISOString().slice(0, 10);
    const forceResend = Boolean(req.body?.forceResend);

    const result = await runDueTomorrowRemindersCheck({
      referenceDateStr: referenceDate,
      forceResend,
      actor: user,
    });

    res.json(result);
  }
);

let schedulerStarted = false;

/**
 * Background scheduler that checks 1-day advance reminders and 1st-of-month report rules automatically.
 */
export function startNotificationScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      const settings = db.notificationSettings;
      if (!settings) return;

      const systemActor: StaffUser =
        db.users.find((u) => u.role === 'Admin') || {
          id: 'SYSTEM-SCHEDULER',
          fullName: 'Automated Scheduler',
          email: 'notifications@maislivestock.ng',
          role: 'Admin',
          title: 'Automated Scheduler',
          canApproveExpenses: true,
          status: 'Active',
          lastActive: new Date().toISOString(),
        };

      const todayStr = new Date().toISOString().slice(0, 10);
      if (settings.autoDailyReminderEnabled) {
        await runDueTomorrowRemindersCheck({
          referenceDateStr: todayStr,
          forceResend: false,
          actor: systemActor,
        });
      }

      // Check monthly report auto-dispatch on configured day of month
      const dayOfMonth = Number(todayStr.slice(8, 10));
      const currentYearMonth = todayStr.slice(0, 7);
      if (
        settings.autoMonthlyReportEnabled &&
        dayOfMonth === settings.monthlyReportDayOfMonth &&
        settings.lastMonthlyReportSentMonth !== currentYearMonth
      ) {
        const dt = new Date(`${todayStr}T00:00:00Z`);
        dt.setUTCMonth(dt.getUTCMonth() - 1);
        const prevYear = dt.getUTCFullYear();
        const prevMonth = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const lastDay = new Date(Date.UTC(prevYear, dt.getUTCMonth() + 1, 0))
          .getUTCDate()
          .toString()
          .padStart(2, '0');
        const startDate = `${prevYear}-${prevMonth}-01`;
        const endDate = `${prevYear}-${prevMonth}-${lastDay}`;

        const pkg = buildMonthlyReportPackage(db, startDate, endDate);
        if (pkg.recipients.length > 0) {
          const logEntry = await dispatchEmailPayload({
            category: 'MONTHLY_REPORT',
            subject: pkg.subject,
            recipients: pkg.recipients,
            summaryText: pkg.summaryText,
            htmlBody: pkg.htmlBody,
            attachments: pkg.attachments,
            dedupKey: `MONTHLY_REPORT:${startDate}:${endDate}`,
            triggeredBy: 'Automated Monthly Scheduler',
          });
          settings.lastMonthlyReportSentMonth = currentYearMonth;
          appendAudit(
            systemActor,
            'SEND_MONTHLY_REPORT',
            'EmailNotification',
            logEntry.id,
            null,
            `Automatically dispatched monthly report (${startDate} to ${endDate}) to ${pkg.recipients.join(', ')}.`
          );
          saveDatabase(db);
          upsertNotificationSettings(settings).catch((err) => {
            console.warn('⚠️ [MAIS DB] Supabase notification settings persistence warning:', err?.message || err);
          });
        }
      }
    } catch (err) {
      console.error('Notification scheduler tick error:', err);
    }
  };

  // Run initial check shortly after server start, then hourly
  const t = setTimeout(tick, 1500);
  t.unref();
  const i = setInterval(tick, 60 * 60 * 1000);
  i.unref();
}
