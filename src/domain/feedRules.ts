import {
  AllocationMethod,
  FeedIssue,
  FeedProduct,
  FeedPurchase,
  InventoryMovement,
} from '../types/mais.ts';

export interface ProductStockSummary {
  productId: string;
  productName: string;
  category: string;
  unit: string;
  openingStock: number;
  receipts: number;
  issues: number;
  recordedLosses: number;
  closingStock: number;
  reorderLevel: number;
  isLowStock: boolean;
  standardUnitCostNgn: number;
  inventoryValueNgn: number;
}

/**
 * Core stock formula from MAIS LTD spec:
 * Closing Stock = Opening Stock + Receipts - Issues - Recorded Losses
 */
export function calculateFeedProductStock(
  product: FeedProduct,
  purchases: FeedPurchase[],
  issues: FeedIssue[],
  movements: InventoryMovement[]
): ProductStockSummary {
  const receiptsFromPurchases = purchases
    .filter((p) => p.productId === product.id)
    .reduce((sum, p) => sum + p.quantityReceived, 0);

  const extraReceiptMovements = movements
    .filter((m) => m.productId === product.id && m.movementType === 'RECEIPT' && !m.referenceId.startsWith('FP-'))
    .reduce((sum, m) => sum + m.quantity, 0);

  const receipts = receiptsFromPurchases + extraReceiptMovements;

  const issuedQuantity = issues
    .filter((i) => i.productId === product.id)
    .reduce((sum, i) => sum + i.quantity, 0);

  const lossMovements = movements
    .filter((m) => m.productId === product.id && m.movementType === 'LOSS')
    .reduce((sum, m) => sum + m.quantity, 0);

  const wastageFromIssues = issues
    .filter((i) => i.productId === product.id)
    .reduce((sum, i) => sum + (i.wastageKg || 0), 0);

  // Note: wastage recorded inside an issue is tracked; standalone loss movements are added to recordedLosses
  const recordedLosses = lossMovements + wastageFromIssues;
  const netConsumptionIssues = issuedQuantity - wastageFromIssues;

  // Closing Stock = Opening Stock + Receipts - Issues - Recorded Losses
  // Where total outflow from store = issuedQuantity + lossMovements = netConsumptionIssues + recordedLosses
  const closingStock = Math.max(
    0,
    Number((product.openingStock + receipts - netConsumptionIssues - recordedLosses).toFixed(2))
  );

  return {
    productId: product.id,
    productName: product.name,
    category: product.category,
    unit: product.unit,
    openingStock: product.openingStock,
    receipts: Number(receipts.toFixed(2)),
    issues: Number(netConsumptionIssues.toFixed(2)),
    recordedLosses: Number(recordedLosses.toFixed(2)),
    closingStock,
    reorderLevel: product.reorderLevel,
    isLowStock: closingStock <= product.reorderLevel,
    standardUnitCostNgn: product.standardUnitCostNgn,
    inventoryValueNgn: Math.round(closingStock * product.standardUnitCostNgn),
  };
}

export interface SharedFeedTargetAnimal {
  id: string;
  weightKg?: number;
  daysFed?: number;
}

export interface AllocatedAnimalShare {
  animalId: string;
  shareRatio: number;
  allocatedQuantityKg: number;
  allocatedCostNgn: number;
  methodLabel: 'Direct 100%' | 'Equal Headcount' | 'Animal-Days' | 'Weight Proportion';
}

/**
 * Allocates shared feed cost across target animals without charging the full group cost to each animal
 * and without creating duplicate original expenses.
 */
export function allocateSharedFeedCost(params: {
  quantityKg: number;
  unitCostNgn: number;
  allocationMethod: AllocationMethod;
  targetAnimals: SharedFeedTargetAnimal[];
}): AllocatedAnimalShare[] {
  const { quantityKg, unitCostNgn, allocationMethod, targetAnimals } = params;
  const totalCostNgn = Math.round(quantityKg * unitCostNgn);

  if (targetAnimals.length === 0) return [];

  if (targetAnimals.length === 1 || allocationMethod === 'direct_animal') {
    return [
      {
        animalId: targetAnimals[0].id,
        shareRatio: 1,
        allocatedQuantityKg: Number(quantityKg.toFixed(2)),
        allocatedCostNgn: totalCostNgn,
        methodLabel: 'Direct 100%',
      },
    ];
  }

  let weights: number[] = [];
  let methodLabel: AllocatedAnimalShare['methodLabel'] = 'Equal Headcount';

  if (allocationMethod === 'animal_days') {
    methodLabel = 'Animal-Days';
    weights = targetAnimals.map((a) => (a.daysFed && a.daysFed > 0 ? a.daysFed : 1));
  } else if (allocationMethod === 'weight_proportion') {
    methodLabel = 'Weight Proportion';
    weights = targetAnimals.map((a) => (a.weightKg && a.weightKg > 0 ? a.weightKg : 250));
  } else {
    methodLabel = 'Equal Headcount';
    weights = targetAnimals.map(() => 1);
  }

  const totalWeight = weights.reduce((acc, v) => acc + v, 0);
  let allocatedCostSoFar = 0;
  let allocatedQtySoFar = 0;

  return targetAnimals.map((animal, index) => {
    const ratio = totalWeight > 0 ? weights[index] / totalWeight : 1 / targetAnimals.length;
    const isLast = index === targetAnimals.length - 1;
    const shareCost = isLast
      ? totalCostNgn - allocatedCostSoFar
      : Math.round(totalCostNgn * ratio);
    allocatedCostSoFar += shareCost;

    const shareQty = isLast
      ? Number((quantityKg - allocatedQtySoFar).toFixed(2))
      : Number((quantityKg * ratio).toFixed(2));
    allocatedQtySoFar = Number((allocatedQtySoFar + shareQty).toFixed(2));

    return {
      animalId: animal.id,
      shareRatio: Number(ratio.toFixed(4)),
      allocatedQuantityKg: shareQty,
      allocatedCostNgn: shareCost,
      methodLabel,
    };
  });
}
