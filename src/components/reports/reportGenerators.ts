import {
  Animal,
  MaisDatabaseState,
} from '../../types/mais';
import {
  AnimalCostBreakdown,
  calculateWeightHistoryWithADG,
  ProductStockSummary,
} from '../../domain/farmRules';

export type ReportType =
  | 'herd'
  | 'animal_history'
  | 'health'
  | 'feed'
  | 'breeding'
  | 'calf_growth'
  | 'expense'
  | 'animal_cost'
  | 'task'
  | 'audit';

export interface ReportDefinition {
  id: ReportType;
  title: string;
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  { id: 'herd', title: 'Herd' },
  { id: 'animal_history', title: 'Animal History' },
  { id: 'health', title: 'Health' },
  { id: 'feed', title: 'Feed & Stock' },
  { id: 'breeding', title: 'Breeding' },
  { id: 'calf_growth', title: 'Calf Growth' },
  { id: 'expense', title: 'Expenses' },
  { id: 'animal_cost', title: 'Animal Costs' },
  { id: 'task', title: 'Tasks' },
  { id: 'audit', title: 'Activity Log' },
];

export interface BuildReportParams {
  selectedReport: ReportType;
  db: MaisDatabaseState;
  filteredAnimals: Animal[];
  selectedAnimalId: string;
  inDateRange: (dateStr: string) => boolean;
  productStocks: ProductStockSummary[];
  animalCosts: Record<string, AnimalCostBreakdown>;
  categoryFilter: string;
  statusFilter: string;
}

export interface ReportTableData {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

export function buildReportExportData({
  selectedReport,
  db,
  filteredAnimals,
  selectedAnimalId,
  inDateRange,
  productStocks,
  animalCosts,
  categoryFilter,
  statusFilter,
}: BuildReportParams): ReportTableData {
  const repTitle =
    REPORT_DEFINITIONS.find((r) => r.id === selectedReport)?.title || selectedReport;

  if (selectedReport === 'herd') {
    return {
      title: 'MAIS LTD Herd Population & Status Report',
      headers: [
        'Permanent ID',
        'Current Tag',
        'Name',
        'Type',
        'Sex',
        'Breed',
        'Herd Group',
        'Location',
        'Status',
        'Registered Date',
      ],
      rows: filteredAnimals.map((a) => [
        a.id,
        a.currentTag,
        a.name,
        a.type,
        a.sex,
        a.breed,
        a.herdGroup,
        a.location,
        a.status,
        a.registeredAt,
      ]),
    };
  }

  if (selectedReport === 'animal_history') {
    const anm = db.animals.find((a) => a.id === selectedAnimalId);
    return {
      title: `Animal Complete History Report (${anm?.currentTag || selectedAnimalId})`,
      headers: [
        'Date',
        'Animal Tag',
        'Permanent ID',
        'Event Type',
        'Title',
        'Summary',
        'Cost (NGN)',
        'Recorded By',
      ],
      rows: db.animalEvents
        .filter((e) => e.animalId === selectedAnimalId && inDateRange(e.eventDate))
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
        .map((e) => [
          e.eventDate,
          anm?.currentTag || e.animalId,
          e.animalId,
          e.eventType,
          e.title,
          e.summary,
          e.costNgn || 0,
          e.recordedBy,
        ]),
    };
  }

  if (selectedReport === 'health') {
    return {
      title: 'MAIS LTD Health & Veterinary Treatment Report',
      headers: [
        'Treatment Date',
        'Animal Tag',
        'Permanent ID',
        'Episode Diagnosis',
        'Medicine',
        'Dosage',
        'Veterinarian',
        'Total Cost (NGN)',
        'Outcome',
      ],
      rows: db.treatments
        .filter((t) => inDateRange(t.treatmentDate))
        .map((t) => {
          const anm = db.animals.find((a) => a.id === t.animalId);
          const ep = db.healthEpisodes.find((e) => e.id === t.episodeId);
          return [
            t.treatmentDate,
            anm?.currentTag || t.animalId,
            t.animalId,
            ep?.diagnosis || t.episodeId,
            t.medicine,
            t.dosage,
            t.veterinarian,
            t.totalCost,
            t.outcome,
          ];
        }),
    };
  }

  if (selectedReport === 'feed') {
    return {
      title: 'MAIS LTD Feed Purchase, Consumption & Stock Report',
      headers: [
        'Product ID',
        'Product Name',
        'Opening Stock (kg)',
        'Receipts (kg)',
        'Net Issues (kg)',
        'Recorded Losses (kg)',
        'Closing Stock (kg)',
        'Valuation (NGN)',
      ],
      rows: productStocks.map((s) => [
        s.productId,
        s.productName,
        s.openingStock,
        s.receipts,
        s.issues,
        s.recordedLosses,
        s.closingStock,
        s.inventoryValueNgn,
      ]),
    };
  }

  if (selectedReport === 'breeding') {
    return {
      title: 'MAIS LTD Breeding, Pregnancy & Calving Report',
      headers: [
        'AI Date',
        'Animal Tag',
        'Permanent ID',
        'Sire / Straw ID',
        'Attempt #',
        'Pregnancy Check Method',
        'Pregnancy Result',
        'Estimated Due Date',
        'Status',
        'Cost (NGN)',
      ],
      rows: db.breedingEvents
        .filter((b) => inDateRange(b.inseminationDate))
        .map((b) => {
          const anm = db.animals.find((a) => a.id === b.animalId);
          return [
            b.inseminationDate,
            anm?.currentTag || b.animalId,
            b.animalId,
            b.sireIdOrStraw,
            b.attemptNumber,
            b.pregnancyCheckMethod,
            b.pregnancyResult,
            b.estimatedDueDate,
            b.status,
            b.costNgn,
          ];
        }),
    };
  }

  if (selectedReport === 'calf_growth') {
    return {
      title: 'MAIS LTD Calf Weight & Average Daily Gain (ADG) Report',
      headers: [
        'Animal Tag',
        'Permanent ID',
        'Animal Name',
        'Measurement Date',
        'Stage',
        'Weight (kg)',
        'Days Elapsed',
        'ADG (kg/day)',
      ],
      rows: filteredAnimals.flatMap((anm) => {
        const wHist = calculateWeightHistoryWithADG(
          db.weightRecords.filter(
            (w) => w.animalId === anm.id && inDateRange(w.measurementDate)
          )
        );
        return wHist.map((w) => [
          anm.currentTag,
          anm.id,
          anm.name,
          w.measurementDate,
          w.stage,
          w.weightKg,
          w.daysBetween ?? 0,
          w.adgKgPerDay ?? 0,
        ]);
      }),
    };
  }

  if (selectedReport === 'expense') {
    return {
      title: 'MAIS LTD Farm Expense Report',
      headers: [
        'Date',
        'Transaction Code',
        'Category',
        'Description',
        'Supplier',
        'Invoice #',
        'Payment Status',
        'Approval Status',
        'Amount (NGN)',
      ],
      rows: db.expenses
        .filter(
          (e) =>
            !e.isReversed &&
            inDateRange(e.expenseDate) &&
            (categoryFilter === 'ALL' || e.category === categoryFilter)
        )
        .map((e) => [
          e.expenseDate,
          e.transactionCode,
          e.category,
          e.description,
          e.supplierName,
          e.invoiceNumber,
          e.paymentStatus,
          e.approvalStatus,
          e.amountNgn,
        ]),
    };
  }

  if (selectedReport === 'animal_cost') {
    return {
      title: 'MAIS LTD Lifetime Cost per Animal Report',
      headers: [
        'Permanent ID',
        'Current Tag',
        'Animal Name',
        'Status',
        'Purchase Cost (NGN)',
        'Direct Treatments (NGN)',
        'Direct Breeding (NGN)',
        'Allocated Shared Feed (NGN)',
        'Lifetime Total Cost (NGN)',
      ],
      rows: filteredAnimals.map((a) => {
        const c = animalCosts[a.id];
        return [
          a.id,
          a.currentTag,
          a.name,
          a.status,
          c?.purchaseCostNgn ?? 0,
          c?.directTreatmentCostNgn ?? 0,
          c?.directBreedingCostNgn ?? 0,
          c?.allocatedFeedCostNgn ?? 0,
          c?.totalLifetimeCostNgn ?? 0,
        ];
      }),
    };
  }

  if (selectedReport === 'task') {
    return {
      title: 'MAIS LTD Farm Tasks & Schedule Report',
      headers: [
        'Task ID',
        'Due Date',
        'Category',
        'Priority',
        'Task Description',
        'Animal Tag',
        'Assigned Staff',
        'Status',
      ],
      rows: db.tasks
        .filter(
          (t) =>
            inDateRange(t.dueDate) &&
            (categoryFilter === 'ALL' || t.category === categoryFilter) &&
            (statusFilter === 'ALL' || t.status === statusFilter)
        )
        .map((t) => [
          t.id,
          t.dueDate,
          t.category,
          t.priority,
          t.title,
          t.animalTag || 'General',
          t.assignedTo,
          t.status,
        ]),
    };
  }

  // audit
  return {
    title: `MAIS LTD ${repTitle} Report`,
    headers: [
      'Audit ID',
      'Timestamp',
      'Staff Name',
      'Role',
      'Action',
      'Entity Type',
      'Entity ID',
      'Animal Tag',
      'Previous Value',
      'New Value',
      'Summary',
    ],
    rows: db.auditLogs
      .filter((a) => inDateRange(a.timestamp))
      .map((a) => [
        a.id,
        a.timestamp.slice(0, 19).replace('T', ' '),
        a.userName,
        a.userRole,
        a.action,
        a.entityType,
        a.entityId,
        a.animalTag || '',
        a.previousValue || '',
        a.newValue || '',
        a.summary,
      ]),
  };
}
