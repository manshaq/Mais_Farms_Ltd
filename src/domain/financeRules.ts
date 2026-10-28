import { Animal, Expense, ExpenseAllocation, Payment } from '../types/mais.ts';

export interface AnimalCostBreakdown {
  animalId: string;
  purchaseCostNgn: number;
  directTreatmentCostNgn: number;
  directBreedingCostNgn: number;
  otherDirectCostNgn: number;
  allocatedFeedCostNgn: number;
  allocatedGroupCostNgn: number;
  totalLifetimeCostNgn: number;
}

/**
 * Computes an animal's direct and allocated costs without double counting.
 * If an original expense is already represented in ExpenseAllocations for that animal,
 * it is counted once. Reversed or rejected expenses are strictly excluded.
 */
export function calculateAnimalTotalCosts(
  animal: Animal,
  expenses: Expense[],
  allocations: ExpenseAllocation[]
): AnimalCostBreakdown {
  const activeExpenses = expenses.filter((e) => !e.isReversed && e.approvalStatus !== 'Rejected');
  const reversedOrRejectedExpenseIds = new Set(
    expenses
      .filter((e) => e.isReversed || e.approvalStatus === 'Rejected')
      .map((e) => e.id)
  );
  const animalAllocations = allocations.filter(
    (a) => a.animalId === animal.id && (!a.expenseId || !reversedOrRejectedExpenseIds.has(a.expenseId))
  );
  const allocatedExpenseIds = new Set(
    animalAllocations.map((a) => a.expenseId).filter((id): id is string => Boolean(id))
  );

  let purchaseCostNgn = animal.purchasePrice || 0;
  let directTreatmentCostNgn = 0;
  let directBreedingCostNgn = 0;
  let otherDirectCostNgn = 0;
  let allocatedFeedCostNgn = 0;
  let allocatedGroupCostNgn = 0;

  for (const alloc of animalAllocations) {
    if (alloc.allocationCategory === 'Direct Purchase') {
      // Only add if not already counted in animal.purchasePrice
      if (!animal.purchasePrice) purchaseCostNgn += alloc.amountNgn;
    } else if (alloc.allocationCategory === 'Direct Treatment') {
      directTreatmentCostNgn += alloc.amountNgn;
    } else if (alloc.allocationCategory === 'Direct Breeding') {
      directBreedingCostNgn += alloc.amountNgn;
    } else if (alloc.allocationCategory === 'Shared Feed') {
      allocatedFeedCostNgn += alloc.amountNgn;
    } else {
      allocatedGroupCostNgn += alloc.amountNgn;
    }
  }

  // Include any direct animal expenses that do not have an ExpenseAllocation row yet
  for (const exp of activeExpenses) {
    if (exp.linkedAnimalId === animal.id && !allocatedExpenseIds.has(exp.id)) {
      if (exp.category === 'Animal Purchase') {
        if (!animal.purchasePrice) purchaseCostNgn += exp.amountNgn;
      } else if (exp.category === 'Veterinary & Treatment') {
        directTreatmentCostNgn += exp.amountNgn;
      } else if (exp.category === 'Breeding & AI') {
        directBreedingCostNgn += exp.amountNgn;
      } else {
        otherDirectCostNgn += exp.amountNgn;
      }
    }
  }

  const totalLifetimeCostNgn = Math.round(
    purchaseCostNgn +
      directTreatmentCostNgn +
      directBreedingCostNgn +
      otherDirectCostNgn +
      allocatedFeedCostNgn +
      allocatedGroupCostNgn
  );

  return {
    animalId: animal.id,
    purchaseCostNgn: Math.round(purchaseCostNgn),
    directTreatmentCostNgn: Math.round(directTreatmentCostNgn),
    directBreedingCostNgn: Math.round(directBreedingCostNgn),
    otherDirectCostNgn: Math.round(otherDirectCostNgn),
    allocatedFeedCostNgn: Math.round(allocatedFeedCostNgn),
    allocatedGroupCostNgn: Math.round(allocatedGroupCostNgn),
    totalLifetimeCostNgn,
  };
}

export interface FarmFinancialSummary {
  totalExpenditureNgn: number;
  totalPaidNgn: number;
  totalUnpaidBalanceNgn: number;
  pendingApprovalsCount: number;
  byCategory: Record<string, number>;
  bySupplier: Record<string, number>;
  totalAllocatedToAnimalsNgn: number;
}

/**
 * Calculates farm-wide expense totals strictly from original non-reversed Expense records.
 * Expense allocations are NEVER added to totalExpenditureNgn, preventing double counting.
 */
export function calculateFarmFinancialSummary(
  expenses: Expense[],
  payments: Payment[],
  allocations: ExpenseAllocation[],
  dateRangeOrStart?: { startDate?: string; endDate?: string } | string,
  optionalEndDate?: string
): FarmFinancialSummary {
  const dateRange: { startDate?: string; endDate?: string } =
    typeof dateRangeOrStart === 'string'
      ? { startDate: dateRangeOrStart, endDate: optionalEndDate }
      : dateRangeOrStart || (optionalEndDate ? { endDate: optionalEndDate } : {});

  const reversedOrRejectedExpenseIds = new Set(
    expenses
      .filter((e) => e.isReversed || e.approvalStatus === 'Rejected')
      .map((e) => e.id)
  );

  const filteredExpenses = expenses.filter((e) => {
    if (e.isReversed || e.approvalStatus === 'Rejected') return false;
    if (dateRange?.startDate && e.expenseDate < dateRange.startDate) return false;
    if (dateRange?.endDate && e.expenseDate > dateRange.endDate) return false;
    return true;
  });

  const validExpenseIds = new Set(filteredExpenses.map((e) => e.id));

  let totalExpenditureKobo = 0;
  const byCategoryKobo: Record<string, number> = {};
  const bySupplierKobo: Record<string, number> = {};

  for (const exp of filteredExpenses) {
    const kobo = Math.round((Number(exp.amountNgn) || 0) * 100);
    totalExpenditureKobo += kobo;
    byCategoryKobo[exp.category] = (byCategoryKobo[exp.category] || 0) + kobo;
    const sup = exp.supplierName || 'Direct / Unspecified';
    bySupplierKobo[sup] = (bySupplierKobo[sup] || 0) + kobo;
  }

  const totalPaidKobo = payments
    .filter((p) => validExpenseIds.has(p.expenseId))
    .reduce((sum, p) => sum + Math.round((Number(p.amountNgn) || 0) * 100), 0);

  const totalExpenditureNgn = Math.round(totalExpenditureKobo / 100);
  const totalPaidNgn = Math.round(totalPaidKobo / 100);
  const totalUnpaidBalanceNgn = Math.max(
    0,
    Math.round((totalExpenditureKobo - totalPaidKobo) / 100)
  );
  const pendingApprovalsCount = filteredExpenses.filter(
    (e) => e.approvalStatus === 'Pending Approval'
  ).length;

  const totalAllocatedKobo = allocations
    .filter((a) => {
      if (a.expenseId && reversedOrRejectedExpenseIds.has(a.expenseId)) return false;
      if (dateRange?.startDate && a.allocationDate < dateRange.startDate) return false;
      if (dateRange?.endDate && a.allocationDate > dateRange.endDate) return false;
      return true;
    })
    .reduce((sum, a) => sum + Math.round((Number(a.amountNgn) || 0) * 100), 0);

  const byCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries(byCategoryKobo)) {
    byCategory[k] = Math.round(v / 100);
  }
  const bySupplier: Record<string, number> = {};
  for (const [k, v] of Object.entries(bySupplierKobo)) {
    bySupplier[k] = Math.round(v / 100);
  }

  return {
    totalExpenditureNgn,
    totalPaidNgn,
    totalUnpaidBalanceNgn,
    pendingApprovalsCount,
    byCategory,
    bySupplier,
    totalAllocatedToAnimalsNgn: Math.round(totalAllocatedKobo / 100),
  };
}
