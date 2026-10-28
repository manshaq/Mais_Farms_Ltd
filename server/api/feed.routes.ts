import { Router, Response } from 'express';
import {
  allocateSharedFeedCost,
  calculateFeedProductStock,
} from '../../src/domain/farmRules.ts';
import {
  Animal,
  Expense,
  ExpenseAllocation,
  FeedIssue,
  FeedProduct,
  FeedPurchase,
  InventoryMovement,
} from '../../src/types/mais.ts';
import { appendAnimalEvent, appendAudit, db, saveDatabase } from '../db/store.ts';
import { paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';
import {
  validateNonNegativeNumber,
  validatePositiveNumber,
  validateRequiredString,
} from '../validation/validators.ts';

export const feedRouter = Router();

function resolveOrCreateFeedProduct(body: any): FeedProduct | null {
  const {
    productId,
    newProductName,
    newProductCategory,
    newProductReorderLevel,
    newProductStorageLocation,
    unitPriceNgn,
  } = body;

  if (productId && productId !== '__NEW__') {
    const existing = db.feedProducts.find((p) => p.id === productId);
    if (existing) return existing;
  }

  const trimmedName = String(newProductName || '').trim();
  if (!trimmedName) {
    return null;
  }

  // Check if a product with the same name already exists
  const byName = db.feedProducts.find(
    (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (byName) return byName;

  const created: FeedProduct = {
    id: `FD-${String(db.feedProducts.length + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
    name: trimmedName,
    category: String(newProductCategory || 'Concentrate').trim(),
    unit: 'kg',
    openingStock: 0,
    reorderLevel: Math.max(0, Number(newProductReorderLevel || 200)),
    standardUnitCostNgn: Math.max(1, Number(unitPriceNgn || 450)),
    storageLocation: String(newProductStorageLocation || 'Main Feed Store').trim(),
  };

  db.feedProducts.push(created);
  return created;
}

/**
 * GET /api/inventory
 * Returns computed stock balances (Closing = Opening + Receipts - Issues - Losses) plus paginated movements/purchases/issues.
 */
feedRouter.get(
  '/inventory',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { productId, lowStockOnly, page, limit } = req.query;

    let productStocks = db.feedProducts.map((p) =>
      calculateFeedProductStock(p, db.feedPurchases, db.feedIssues, db.inventoryMovements)
    );

    if (productId) {
      productStocks = productStocks.filter((s) => s.productId === String(productId));
    }
    if (lowStockOnly === 'true') {
      productStocks = productStocks.filter((s) => s.isLowStock);
    }

    const movements = productId
      ? db.inventoryMovements.filter((m) => m.productId === String(productId))
      : db.inventoryMovements;

    res.json({
      stocks: productStocks,
      purchases: paginateItems(db.feedPurchases, page, limit),
      issues: paginateItems(db.feedIssues, page, limit),
      movements: paginateItems(movements, page, limit),
    });
  }
);

/**
 * GET /api/feed-products (Canonical Section 15 Endpoint)
 */
feedRouter.get(
  '/feed-products',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { category, page, limit } = req.query;
    let items = db.feedProducts.map((p) => ({
      ...p,
      stockSummary: calculateFeedProductStock(
        p,
        db.feedPurchases,
        db.feedIssues,
        db.inventoryMovements
      ),
    }));
    if (category && category !== 'ALL') {
      items = items.filter((p) => p.category === String(category));
    }
    res.json(paginateItems(items, page, limit));
  }
);

/**
 * POST /api/feed-products (Canonical Section 15 Endpoint)
 */
feedRouter.post(
  '/feed-products',
  requirePermission('MANAGE_FEED'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const { name, category, unit, openingStock, reorderLevel, standardUnitCostNgn, storageLocation } =
      req.body;
    const nameCheck = validateRequiredString(name, 'Feed product name');
    if (!nameCheck.valid) {
      res.status(400).json({ error: nameCheck.error });
      return;
    }
    const created: FeedProduct = {
      id: `FD-${String(db.feedProducts.length + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
      name: String(name).trim(),
      category: String(category || 'Concentrate').trim(),
      unit: String(unit || 'kg').trim(),
      openingStock: Math.max(0, Number(openingStock || 0)),
      reorderLevel: Math.max(0, Number(reorderLevel || 200)),
      standardUnitCostNgn: Math.max(1, Number(standardUnitCostNgn || 450)),
      storageLocation: String(storageLocation || 'Main Feed Store').trim(),
    };
    db.feedProducts.push(created);
    appendAudit(
      user,
      'CREATE_FEED_PRODUCT',
      'FeedProduct',
      created.id,
      null,
      `Registered feed product "${created.name}" (${created.category}).`
    );
    saveDatabase(db);
    res.status(201).json({ product: created });
  }
);

/**
 * GET /api/feed-purchases (Canonical Section 15 Endpoint)
 */
feedRouter.get(
  ['/feed/purchases', '/feed-purchases'],
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { productId, supplierId, page, limit } = req.query;
    let list = [...db.feedPurchases];
    if (productId) list = list.filter((p) => p.productId === String(productId));
    if (supplierId) list = list.filter((p) => p.supplierId === String(supplierId));
    res.json(paginateItems(list, page, limit));
  }
);

/**
 * GET /api/feed-issues (Canonical Section 15 Endpoint)
 */
feedRouter.get(
  ['/feed/issues', '/feed-issues'],
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { productId, targetAnimalId, targetGroup, page, limit } = req.query;
    let list = [...db.feedIssues];
    if (productId) list = list.filter((i) => i.productId === String(productId));
    if (targetAnimalId) list = list.filter((i) => i.targetAnimalId === String(targetAnimalId));
    if (targetGroup) list = list.filter((i) => i.targetGroup === String(targetGroup));
    res.json(paginateItems(list, page, limit));
  }
);

/**
 * POST /api/feed/purchases & POST /api/feed-purchases
 * Records feed procurement, creates product/supplier if new, updates stock ledger, and posts single non-duplicated expense.
 */
feedRouter.post(
  ['/feed/purchases', '/feed-purchases'],
  requirePermission('MANAGE_FEED'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      supplierId,
      supplierName,
      purchaseDate,
      batchNumber,
      quantityOrdered,
      quantityReceived,
      unitPriceNgn,
      transportCostNgn,
      invoiceNumber,
      paymentStatus,
    } = req.body;

    const product = resolveOrCreateFeedProduct(req.body);
    if (!product) {
      res.status(400).json({
        error: 'Please select an existing feed product or enter a new feed product name.',
      });
      return;
    }

    const qtyCheck = validatePositiveNumber(quantityReceived, 'Quantity received');
    if (!qtyCheck.valid) {
      res.status(400).json({ error: qtyCheck.error });
      return;
    }

    const unitPrice = Number(unitPriceNgn || product.standardUnitCostNgn);
    const priceCheck = validatePositiveNumber(unitPrice, 'Unit price');
    if (!priceCheck.valid) {
      res.status(400).json({ error: priceCheck.error });
      return;
    }

    // Update product standard cost to latest purchase unit price
    product.standardUnitCostNgn = unitPrice;

    const transportCheck = validateNonNegativeNumber(transportCostNgn, 'Transport cost');
    if (!transportCheck.valid) {
      res.status(400).json({ error: transportCheck.error });
      return;
    }

    const cleanSupplierName = String(supplierName || 'Direct Feed Supplier').trim();
    let resolvedSupplier = db.suppliers.find(
      (s) => s.id === supplierId || s.name.toLowerCase() === cleanSupplierName.toLowerCase()
    );
    if (!resolvedSupplier && cleanSupplierName) {
      resolvedSupplier = {
        id: `SUP-${String(db.suppliers.length + 1).padStart(2, '0')}`,
        name: cleanSupplierName,
        category: 'Feed & Grain',
        phone: '',
        email: '',
        address: 'Recorded via Feed Purchase',
        bankDetails: '',
      };
      db.suppliers.push(resolvedSupplier);
    }

    const qtyRec = Number(quantityReceived);
    const transport = Number(transportCostNgn || 0);
    const totalCostNgn = Math.round(qtyRec * unitPrice + transport);
    // Update product standard cost to effective landed unit cost per kg
    product.standardUnitCostNgn = Number((totalCostNgn / qtyRec).toFixed(2));
    const dateStr = purchaseDate || new Date().toISOString().slice(0, 10);
    const purchaseId = `FP-${Date.now()}`;
    const expenseId = `EXP-${Date.now()}`;

    const purchase: FeedPurchase = {
      id: purchaseId,
      supplierId: resolvedSupplier ? resolvedSupplier.id : 'SUP-01',
      supplierName: resolvedSupplier ? resolvedSupplier.name : cleanSupplierName,
      purchaseDate: dateStr,
      productId: product.id,
      productName: product.name,
      batchNumber: String(batchNumber || `B-${Date.now().toString().slice(-4)}`).trim(),
      quantityOrdered: Number(quantityOrdered || qtyRec),
      quantityReceived: qtyRec,
      unitPriceNgn: unitPrice,
      transportCostNgn: transport,
      totalCostNgn,
      invoiceNumber: String(invoiceNumber || `INV-${Date.now().toString().slice(-5)}`).trim(),
      expenseId,
      recordedBy: user.fullName,
    };

    const mov: InventoryMovement = {
      id: `MOV-${Date.now()}`,
      productId: product.id,
      movementDate: dateStr,
      movementType: 'RECEIPT',
      quantity: qtyRec,
      reason: `Purchase receipt (${purchase.invoiceNumber})`,
      referenceId: purchaseId,
      recordedBy: user.fullName,
    };

    const exp: Expense = {
      id: expenseId,
      transactionCode: `MAIS-EXP-2026-${db.expenses.length + 101}`,
      expenseDate: dateStr,
      amountNgn: totalCostNgn,
      category: 'Feed & Nutrition',
      description: `Purchase of ${qtyRec} kg ${product.name} (Batch ${purchase.batchNumber})`,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierName,
      paymentStatus: paymentStatus || 'Paid',
      paymentMethod: 'Bank Transfer',
      invoiceNumber: purchase.invoiceNumber,
      linkedEntityType: 'FeedPurchase',
      linkedEntityId: purchaseId,
      linkedAnimalId: null,
      approvalStatus: 'Approved',
      enteredBy: user.fullName,
      approvedBy: user.fullName,
      isReversed: false,
      reversalReason: null,
    };

    db.feedPurchases.unshift(purchase);
    db.inventoryMovements.unshift(mov);
    db.expenses.unshift(exp);

    if (exp.paymentStatus === 'Paid') {
      db.payments.push({
        id: `PAY-${Date.now()}`,
        expenseId,
        paymentDate: dateStr,
        amountNgn: totalCostNgn,
        paymentMethod: 'Bank Transfer',
        referenceNumber: `NIP-${purchase.invoiceNumber}`,
        recordedBy: user.fullName,
        notes: 'Feed purchase payment',
      });
    }

    appendAudit(
      user,
      'FEED_PURCHASE',
      'FeedPurchase',
      purchaseId,
      null,
      `Received ${qtyRec} kg of ${product.name} for NGN ${totalCostNgn.toLocaleString()} (Invoice ${purchase.invoiceNumber}).`
    );

    saveDatabase(db);
    res.status(201).json({ purchase, expense: exp, product });
  }
);

/**
 * POST /api/feed/issues & POST /api/feed-issues
 * Enforces inventory balance and allocates shared group ration costs without double-counting.
 */
feedRouter.post(
  ['/feed/issues', '/feed-issues'],
  requirePermission('MANAGE_FEED'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      issueDate,
      productId,
      quantity,
      targetType,
      targetAnimalId,
      targetGroup,
      allocationMethod,
      wastageKg,
      notes,
    } = req.body;

    const product = db.feedProducts.find((p) => p.id === productId);
    if (!product) {
      res.status(400).json({
        error: 'Feed product not found. Record a Feed Purchase first to add stock.',
      });
      return;
    }

    const qtyCheck = validatePositiveNumber(quantity, 'Issued quantity');
    if (!qtyCheck.valid) {
      res.status(400).json({ error: qtyCheck.error });
      return;
    }

    const qty = Number(quantity);
    const wastage = Math.max(0, Number(wastageKg || 0));

    const currentStock = calculateFeedProductStock(
      product,
      db.feedPurchases,
      db.feedIssues,
      db.inventoryMovements
    );
    if (qty > currentStock.closingStock) {
      res.status(400).json({
        error: `Insufficient stock: Cannot issue ${qty} kg of ${product.name}. Current closing stock is ${currentStock.closingStock} kg.`,
      });
      return;
    }

    let targetAnimals: Animal[] = [];
    if (targetType === 'Animal') {
      const found = db.animals.find((a) => a.id === targetAnimalId);
      if (!found) {
        res.status(400).json({ error: 'Selected recipient animal not found.' });
        return;
      }
      targetAnimals = [found];
    } else {
      targetAnimals = db.animals.filter(
        (a) => a.status === 'Active' && a.herdGroup === targetGroup
      );
      if (targetAnimals.length === 0) {
        res.status(400).json({
          error: `No active animals found in herd group "${targetGroup}" to allocate feed costs.`,
        });
        return;
      }
    }

    const dateStr = issueDate || new Date().toISOString().slice(0, 10);
    const issueId = `FIS-${Date.now()}`;
    const totalCostNgn = Math.round(qty * product.standardUnitCostNgn);

    const newIssue: FeedIssue = {
      id: issueId,
      issueDate: dateStr,
      productId: product.id,
      productName: product.name,
      quantity: qty,
      unit: 'kg',
      targetType: targetType || 'Group',
      targetAnimalId: targetType === 'Animal' ? targetAnimals[0].id : null,
      targetGroup: targetType === 'Group' ? targetGroup : null,
      allocationMethod:
        targetType === 'Animal' ? 'direct_animal' : allocationMethod || 'equal_headcount',
      wastageKg: wastage,
      unitCostNgn: product.standardUnitCostNgn,
      totalCostNgn,
      responsibleStaff: user.fullName,
      notes: String(notes || '').trim(),
    };

    db.feedIssues.unshift(newIssue);
    db.inventoryMovements.unshift({
      id: `MOV-${Date.now()}`,
      productId: product.id,
      movementDate: dateStr,
      movementType: 'ISSUE',
      quantity: qty,
      reason:
        targetType === 'Animal'
          ? `Issued to animal ${targetAnimals[0].currentTag}`
          : `Issued to group ${targetGroup}`,
      referenceId: issueId,
      recordedBy: user.fullName,
    });

    const latestWeights = Object.fromEntries(
      targetAnimals.map((a) => {
        const wList = db.weightRecords.filter((w) => w.animalId === a.id);
        const latest = [...wList].sort((x, y) =>
          y.measurementDate.localeCompare(x.measurementDate)
        )[0];
        return [a.id, latest ? latest.weightKg : 350];
      })
    );

    const shares = allocateSharedFeedCost({
      quantityKg: qty,
      unitCostNgn: product.standardUnitCostNgn,
      allocationMethod: newIssue.allocationMethod,
      targetAnimals: targetAnimals.map((a) => ({
        id: a.id,
        weightKg: latestWeights[a.id],
        daysFed: 1,
      })),
    });

    for (const share of shares) {
      const alloc: ExpenseAllocation = {
        id: `ALC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        expenseId: null,
        feedIssueId: issueId,
        animalId: share.animalId,
        allocationDate: dateStr,
        allocationCategory: 'Shared Feed',
        allocationMethod: share.methodLabel,
        amountNgn: share.allocatedCostNgn,
        notes: `${Math.round(share.shareRatio * 100)}% (${share.allocatedQuantityKg} kg) of ${qty} kg ${product.name} via ${share.methodLabel}`,
      };
      db.expenseAllocations.unshift(alloc);

      appendAnimalEvent(
        share.animalId,
        dateStr,
        'FEED_ALLOCATION',
        `Feed Issued & Allocated: ${product.name}`,
        `Allocated ${share.allocatedQuantityKg} kg (NGN ${share.allocatedCostNgn.toLocaleString()}) via ${share.methodLabel}.`,
        issueId,
        share.allocatedCostNgn,
        user.fullName
      );
    }

    const updatedStock = calculateFeedProductStock(
      product,
      db.feedPurchases,
      db.feedIssues,
      db.inventoryMovements
    );
    if (updatedStock.isLowStock) {
      const existingTask = db.tasks.find(
        (t) => t.referenceId === product.id && t.status !== 'Completed'
      );
      if (!existingTask) {
        db.tasks.unshift({
          id: `TSK-${Date.now()}`,
          title: `Low Stock Alert: Restock ${product.name} (${updatedStock.closingStock} kg remaining)`,
          category: 'Low Feed Stock',
          dueDate: dateStr,
          priority: 'High',
          assignedTo: user.fullName,
          animalId: null,
          animalTag: null,
          referenceId: product.id,
          status: 'Pending',
          completionNotes: '',
          completedAt: null,
        });
      }
    }

    appendAudit(
      user,
      'FEED_ISSUE_AND_ALLOCATION',
      'FeedIssue',
      issueId,
      targetType === 'Animal' ? targetAnimals[0].currentTag : null,
      `Issued ${qty} kg ${product.name} and allocated NGN ${totalCostNgn.toLocaleString()} across ${shares.length} animal(s) (${newIssue.allocationMethod}).`,
      `Stock: ${currentStock.closingStock} kg`,
      `Stock: ${updatedStock.closingStock} kg`
    );

    saveDatabase(db);
    res.status(201).json({ issue: newIssue, allocations: shares, updatedStock });
  }
);

/**
 * POST /api/feed/losses
 */
feedRouter.post(
  '/feed/losses',
  requirePermission('MANAGE_FEED'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const { productId, movementDate, quantity, reason } = req.body;
    const product = db.feedProducts.find((p) => p.id === productId);
    if (!product) {
      res.status(400).json({ error: 'Feed product not found.' });
      return;
    }
    const qtyCheck = validatePositiveNumber(quantity, 'Loss quantity');
    const reasonCheck = validateRequiredString(reason, 'Loss reason');
    if (!qtyCheck.valid || !reasonCheck.valid) {
      res.status(400).json({ error: qtyCheck.error || reasonCheck.error });
      return;
    }

    const qty = Number(quantity);
    const mov: InventoryMovement = {
      id: `MOV-${Date.now()}`,
      productId: product.id,
      movementDate: movementDate || new Date().toISOString().slice(0, 10),
      movementType: 'LOSS',
      quantity: qty,
      reason: String(reason).trim(),
      referenceId: `LOSS-${Date.now()}`,
      recordedBy: user.fullName,
    };
    db.inventoryMovements.unshift(mov);

    appendAudit(
      user,
      'RECORD_FEED_LOSS',
      'InventoryMovement',
      mov.id,
      null,
      `Recorded ${qty} kg loss/wastage for ${product.name}. Reason: ${reason}`
    );

    saveDatabase(db);
    res.status(201).json({ movement: mov });
  }
);
