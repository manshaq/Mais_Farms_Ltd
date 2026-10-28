import {
  DueTomorrowReminderItem,
  EmailCsvAttachment,
  MaisDatabaseState,
} from '../types/mais.ts';
import { formatCsvContent } from '../utils/csvExport.ts';
import { calculateAnimalTotalCosts, calculateFarmFinancialSummary } from './financeRules.ts';
import { calculateFeedProductStock } from './feedRules.ts';

/**
 * Adds a specified number of calendar days to a YYYY-MM-DD date string in UTC.
 */
export function addDaysToIsoDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolves recipient email addresses for a reminder item:
 * includes the assigned staff member (if matched in db.users), all active Admins and Farm Managers,
 * and any additional comma-separated emails configured in notificationSettings.
 */
export function resolveReminderRecipients(
  db: MaisDatabaseState,
  assignedStaffName?: string | null
): string[] {
  const emails = new Set<string>();
  const activeUsers = (db.users || []).filter((u) => u.status === 'Active');

  for (const u of activeUsers) {
    if (u.role === 'Admin' || u.role === 'Farm Manager') {
      emails.add(u.email.trim().toLowerCase());
    }
    if (
      assignedStaffName &&
      u.fullName.trim().toLowerCase() === assignedStaffName.trim().toLowerCase()
    ) {
      emails.add(u.email.trim().toLowerCase());
    }
  }

  const extra = db.notificationSettings?.additionalRecipientEmails || '';
  for (const part of extra.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed && trimmed.includes('@')) {
      emails.add(trimmed);
    }
  }

  return Array.from(emails);
}

/**
 * Collects all farm items due in `leadDays` (default 1 day = tomorrow) across:
 * 1. Pending Farm Tasks (dueDate === targetDate)
 * 2. Veterinary Treatment Follow-up Revisits (followUpDate === targetDate & outcome === 'Pending Follow-up')
 * 3. Scheduled Vaccinations & Protocols (nextDueDate === targetDate)
 * 4. Breeding Pregnancy Checks (pregnancyCheckDate === targetDate & pregnancyResult === 'Pending')
 * 5. Estimated Calving Dates (estimatedDueDate === targetDate & status !== 'Calved' & status !== 'Failed / Open')
 */
export function collectDueTomorrowReminders(
  db: MaisDatabaseState,
  referenceDateStr: string,
  leadDays: number = 1
): DueTomorrowReminderItem[] {
  const targetDate = addDaysToIsoDate(referenceDateStr, leadDays);
  const items: DueTomorrowReminderItem[] = [];

  // 1. Tasks due tomorrow
  for (const task of db.tasks || []) {
    if (
      task.status !== 'Completed' &&
      task.status !== 'Dismissed' &&
      task.dueDate === targetDate
    ) {
      const anm = task.animalId ? db.animals.find((a) => a.id === task.animalId) : null;
      const tag = task.animalTag || anm?.currentTag || null;
      items.push({
        id: `REM-TASK-${task.id}`,
        sourceType: 'Task',
        entityId: task.id,
        title: task.title,
        details: `${task.category} · Priority: ${task.priority}${tag ? ` · Animal: ${tag}` : ''}`,
        dueDate: task.dueDate,
        animalId: task.animalId,
        animalTag: tag,
        assignedStaffName: task.assignedTo || 'Farm Staff',
        recipientEmails: resolveReminderRecipients(db, task.assignedTo),
        dedupKey: `REMINDER:Task:${task.id}:${task.dueDate}`,
      });
    }
  }

  // 2. Veterinary Treatment Follow-up Revisits due tomorrow
  for (const tr of db.treatments || []) {
    if (tr.outcome === 'Pending Follow-up' && tr.followUpDate === targetDate) {
      const anm = db.animals.find((a) => a.id === tr.animalId);
      const ep = db.healthEpisodes.find((e) => e.id === tr.episodeId);
      const tag = anm?.currentTag || tr.animalId;
      const staff = tr.veterinarian || tr.administrator || 'Veterinarian';
      items.push({
        id: `REM-TR-${tr.id}`,
        sourceType: 'Treatment Revisit',
        entityId: tr.id,
        title: `Veterinary Follow-up Revisit for ${tag}`,
        details: `Episode: ${ep?.diagnosis || tr.episodeId} · Medicine: ${tr.medicine} (${tr.dosage})`,
        dueDate: tr.followUpDate,
        animalId: tr.animalId,
        animalTag: tag,
        assignedStaffName: staff,
        recipientEmails: resolveReminderRecipients(db, staff),
        dedupKey: `REMINDER:TreatmentRevisit:${tr.id}:${tr.followUpDate}`,
      });
    }
  }

  // 3. Scheduled Vaccinations & Protocols due tomorrow
  for (const vac of db.vaccinations || []) {
    if (vac.nextDueDate === targetDate) {
      const anm = db.animals.find((a) => a.id === vac.animalId);
      const tag = anm?.currentTag || vac.animalId;
      const staff = vac.veterinarian || 'Veterinarian';
      items.push({
        id: `REM-VAC-${vac.id}`,
        sourceType: 'Vaccination',
        entityId: vac.id,
        title: `${vac.protocolType} Due: ${vac.vaccineOrProduct} (${tag})`,
        details: `Dosage: ${vac.dosage} · Batch: ${vac.batchNumber || 'N/A'}`,
        dueDate: vac.nextDueDate,
        animalId: vac.animalId,
        animalTag: tag,
        assignedStaffName: staff,
        recipientEmails: resolveReminderRecipients(db, staff),
        dedupKey: `REMINDER:Vaccination:${vac.id}:${vac.nextDueDate}`,
      });
    }
  }

  // 4. Breeding Pregnancy Checks & 5. Estimated Calving due tomorrow
  for (const br of db.breedingEvents || []) {
    const anm = db.animals.find((a) => a.id === br.animalId);
    const tag = anm?.currentTag || br.animalId;
    const staff = br.technician || 'Breeding Technician';

    if (br.pregnancyCheckDate === targetDate && br.pregnancyResult === 'Pending') {
      items.push({
        id: `REM-PREG-${br.id}`,
        sourceType: 'Pregnancy Check',
        entityId: br.id,
        title: `Scheduled Pregnancy Check for ${tag}`,
        details: `Method: ${br.pregnancyCheckMethod} · Sire/Straw: ${br.sireIdOrStraw}`,
        dueDate: br.pregnancyCheckDate,
        animalId: br.animalId,
        animalTag: tag,
        assignedStaffName: staff,
        recipientEmails: resolveReminderRecipients(db, staff),
        dedupKey: `REMINDER:PregnancyCheck:${br.id}:${br.pregnancyCheckDate}`,
      });
    }

    if (
      br.estimatedDueDate === targetDate &&
      br.status !== 'Calved' &&
      br.status !== 'Failed / Open'
    ) {
      items.push({
        id: `REM-CALV-${br.id}`,
        sourceType: 'Estimated Calving',
        entityId: br.id,
        title: `Estimated Calving Date Tomorrow for Dam ${tag}`,
        details: `Sire/Straw: ${br.sireIdOrStraw} (${br.sireBreed}) · Prepare calving pen`,
        dueDate: br.estimatedDueDate,
        animalId: br.animalId,
        animalTag: tag,
        assignedStaffName: staff,
        recipientEmails: resolveReminderRecipients(db, staff),
        dedupKey: `REMINDER:EstimatedCalving:${br.id}:${br.estimatedDueDate}`,
      });
    }
  }

  return items;
}

export interface MonthlyReportPackage {
  periodStart: string;
  periodEnd: string;
  subject: string;
  recipients: string[];
  summaryText: string;
  htmlBody: string;
  attachments: EmailCsvAttachment[];
  metrics: {
    activeHerdCount: number;
    totalExpenditureNgn: number;
    totalPaidNgn: number;
    totalUnpaidBalanceNgn: number;
    treatmentCount: number;
    totalInventoryValuationNgn: number;
  };
}

/**
 * Compiles the monthly executive, health, feed stock, and financial report package
 * with 3 RFC-4180 CSV attachments for Admins and Farm Managers.
 */
export function buildMonthlyReportPackage(
  db: MaisDatabaseState,
  startDate: string,
  endDate: string
): MonthlyReportPackage {
  const recipients = resolveReminderRecipients(db, null);

  const activeAnimals = db.animals.filter((a) => a.status === 'Active');
  const finSummary = calculateFarmFinancialSummary(
    db.expenses,
    db.payments,
    db.expenseAllocations,
    { startDate, endDate }
  );

  const periodExpenses = db.expenses.filter(
    (e) =>
      !e.isReversed &&
      e.approvalStatus !== 'Rejected' &&
      e.expenseDate >= startDate &&
      e.expenseDate <= endDate
  );

  const periodTreatments = db.treatments.filter(
    (t) => t.treatmentDate >= startDate && t.treatmentDate <= endDate
  );

  const productStocks = db.feedProducts.map((p) =>
    calculateFeedProductStock(p, db.feedPurchases, db.feedIssues, db.inventoryMovements)
  );
  const totalInventoryValuationNgn = productStocks.reduce(
    (sum, s) => sum + s.inventoryValueNgn,
    0
  );

  // Attachment 1: Monthly Expenses CSV
  const expensesCsv = formatCsvContent(
    [
      'Expense Date',
      'Transaction Code',
      'Category',
      'Description',
      'Supplier',
      'Invoice Number',
      'Payment Status',
      'Approval Status',
      'Amount (NGN)',
    ],
    periodExpenses.map((e) => [
      e.expenseDate,
      e.transactionCode,
      e.category,
      e.description,
      e.supplierName,
      e.invoiceNumber,
      e.paymentStatus,
      e.approvalStatus,
      e.amountNgn,
    ])
  );

  // Attachment 2: Herd & Per-Animal Lifetime Cost Breakdown CSV
  const herdCostsCsv = formatCsvContent(
    [
      'Permanent ID',
      'Current Tag',
      'Name',
      'Type',
      'Sex',
      'Breed',
      'Status',
      'Purchase Cost (NGN)',
      'Direct Treatments (NGN)',
      'Direct Breeding (NGN)',
      'Allocated Shared Feed (NGN)',
      'Lifetime Total Cost (NGN)',
    ],
    db.animals.map((a) => {
      const c = calculateAnimalTotalCosts(a, db.expenses, db.expenseAllocations);
      return [
        a.id,
        a.currentTag,
        a.name,
        a.type,
        a.sex,
        a.breed,
        a.status,
        c.purchaseCostNgn,
        c.directTreatmentCostNgn,
        c.directBreedingCostNgn,
        c.allocatedFeedCostNgn,
        c.totalLifetimeCostNgn,
      ];
    })
  );

  // Attachment 3: Health & Veterinary Treatments CSV
  const healthCsv = formatCsvContent(
    [
      'Treatment Date',
      'Animal Tag',
      'Diagnosis',
      'Medicine',
      'Dosage',
      'Veterinarian',
      'Outcome',
      'Follow-Up Revisit Date',
      'Total Cost (NGN)',
    ],
    periodTreatments.map((t) => {
      const anm = db.animals.find((a) => a.id === t.animalId);
      const ep = db.healthEpisodes.find((e) => e.id === t.episodeId);
      return [
        t.treatmentDate,
        anm?.currentTag || t.animalId,
        ep?.diagnosis || t.episodeId,
        t.medicine,
        t.dosage,
        t.veterinarian,
        t.outcome,
        t.followUpDate || '',
        t.totalCost,
      ];
    })
  );

  const attachments: EmailCsvAttachment[] = [
    {
      fileName: `mais_expenses_${startDate}_to_${endDate}.csv`,
      contentCsv: expensesCsv,
      rowCount: periodExpenses.length,
    },
    {
      fileName: `mais_herd_costs_${startDate}_to_${endDate}.csv`,
      contentCsv: herdCostsCsv,
      rowCount: db.animals.length,
    },
    {
      fileName: `mais_health_treatments_${startDate}_to_${endDate}.csv`,
      contentCsv: healthCsv,
      rowCount: periodTreatments.length,
    },
  ];

  const subject = `MAIS LTD Monthly Farm Report (${startDate} to ${endDate})`;
  const summaryText = `Active Herd: ${activeAnimals.length} animals · Period Expenditure: NGN ${finSummary.totalExpenditureNgn.toLocaleString()} (Paid: NGN ${finSummary.totalPaidNgn.toLocaleString()}, Unpaid: NGN ${finSummary.totalUnpaidBalanceNgn.toLocaleString()}) · Treatments: ${periodTreatments.length} · Feed Stock Valuation: NGN ${totalInventoryValuationNgn.toLocaleString()}`;

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; max-width: 680px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
  <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #0f172a;">MAIS LTD Livestock Management System</h2>
  <p style="margin: 0 0 20px 0; font-size: 12px; color: #475569;">Monthly Executive, Health & Financial Report · Period: ${startDate} to ${endDate}</p>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Active Livestock Herd</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; font-family: monospace;">${activeAnimals.length} head (${db.animals.length} total registered)</td>
    </tr>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Period Total Expenditure</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; font-family: monospace;">NGN ${finSummary.totalExpenditureNgn.toLocaleString()}</td>
    </tr>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Settled Payments vs. Unpaid Balance</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; font-family: monospace;">Paid: NGN ${finSummary.totalPaidNgn.toLocaleString()} · Unpaid: NGN ${finSummary.totalUnpaidBalanceNgn.toLocaleString()}</td>
    </tr>
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 8px 0; color: #475569;">Clinical Treatments Logged</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; font-family: monospace;">${periodTreatments.length} treatment event(s)</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #475569;">Closing Feed Inventory Valuation</td>
      <td style="padding: 8px 0; text-align: right; font-weight: 600; font-family: monospace;">NGN ${totalInventoryValuationNgn.toLocaleString()}</td>
    </tr>
  </table>
  <p style="font-size: 12px; color: #334155; margin: 0;">Attached CSV audit files: <strong>${attachments.map((a) => a.fileName).join(', ')}</strong></p>
</div>`.trim();

  return {
    periodStart: startDate,
    periodEnd: endDate,
    subject,
    recipients,
    summaryText,
    htmlBody,
    attachments,
    metrics: {
      activeHerdCount: activeAnimals.length,
      totalExpenditureNgn: finSummary.totalExpenditureNgn,
      totalPaidNgn: finSummary.totalPaidNgn,
      totalUnpaidBalanceNgn: finSummary.totalUnpaidBalanceNgn,
      treatmentCount: periodTreatments.length,
      totalInventoryValuationNgn,
    },
  };
}

export interface UpcomingScheduleItem {
  id: string;
  category: 'Vaccination' | 'Pregnancy Check' | 'Estimated Calving' | 'Treatment Follow-up';
  dueDate: string;
  animalId: string;
  animalTag: string;
  animalName: string;
  title: string;
  subtitle: string;
  isOverdue: boolean;
}

/**
 * Collects upcoming vaccinations, pregnancy checks, estimated calving dates, and treatment follow-ups
 * for the Dashboard Upcoming Schedule panel.
 */
export function collectUpcomingScheduleItems(
  db: MaisDatabaseState,
  referenceDateStr: string
): UpcomingScheduleItem[] {
  const items: UpcomingScheduleItem[] = [];

  for (const vac of db.vaccinations || []) {
    if (!vac.nextDueDate) continue;
    const animal = db.animals.find((a) => a.id === vac.animalId);
    if (animal && animal.status !== 'Active') continue;
    items.push({
      id: `SCH-VAC-${vac.id}`,
      category: 'Vaccination',
      dueDate: vac.nextDueDate,
      animalId: vac.animalId,
      animalTag: animal?.currentTag || vac.animalId,
      animalName: animal?.name || 'Livestock',
      title: `${vac.protocolType}: ${vac.vaccineOrProduct}`,
      subtitle: `Dosage: ${vac.dosage} · Vet: ${vac.veterinarian}`,
      isOverdue: vac.nextDueDate < referenceDateStr,
    });
  }

  for (const br of db.breedingEvents || []) {
    const animal = db.animals.find((a) => a.id === br.animalId);
    if (animal && animal.status !== 'Active') continue;

    if (br.pregnancyCheckDate && br.pregnancyResult === 'Pending') {
      items.push({
        id: `SCH-PREG-${br.id}`,
        category: 'Pregnancy Check',
        dueDate: br.pregnancyCheckDate,
        animalId: br.animalId,
        animalTag: animal?.currentTag || br.animalId,
        animalName: animal?.name || 'Livestock',
        title: `Pregnancy Check (${br.pregnancyCheckMethod})`,
        subtitle: `Sire/Straw: ${br.sireIdOrStraw} · Tech: ${br.technician}`,
        isOverdue: br.pregnancyCheckDate < referenceDateStr,
      });
    }

    if (
      br.estimatedDueDate &&
      br.status !== 'Calved' &&
      br.status !== 'Failed / Open'
    ) {
      items.push({
        id: `SCH-CALV-${br.id}`,
        category: 'Estimated Calving',
        dueDate: br.estimatedDueDate,
        animalId: br.animalId,
        animalTag: animal?.currentTag || br.animalId,
        animalName: animal?.name || 'Livestock',
        title: `Expected Calving (${br.status})`,
        subtitle: `Sire: ${br.sireIdOrStraw} (${br.sireBreed})`,
        isOverdue: br.estimatedDueDate < referenceDateStr,
      });
    }
  }

  for (const tr of db.treatments || []) {
    if (!tr.followUpDate || tr.outcome !== 'Pending Follow-up') continue;
    const animal = db.animals.find((a) => a.id === tr.animalId);
    if (animal && animal.status !== 'Active') continue;
    items.push({
      id: `SCH-TRT-${tr.id}`,
      category: 'Treatment Follow-up',
      dueDate: tr.followUpDate,
      animalId: tr.animalId,
      animalTag: animal?.currentTag || tr.animalId,
      animalName: animal?.name || 'Livestock',
      title: `Vet Revisit: ${tr.medicine}`,
      subtitle: `Dosage: ${tr.dosage} · Vet: ${tr.veterinarian}`,
      isOverdue: tr.followUpDate < referenceDateStr,
    });
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
