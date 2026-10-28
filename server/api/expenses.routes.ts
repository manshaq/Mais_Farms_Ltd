import { Router, Response } from 'express';
import {
  calculateFarmFinancialSummary,
  canPerformAction,
} from '../../src/domain/farmRules.ts';
import { Expense, Payment } from '../../src/types/mais.ts';
import {
  appendAnimalEvent,
  appendAudit,
  db,
  generateExpenseTransactionCode,
  generateSupplierId,
  saveDatabase,
} from '../db/store.ts';
import {
  insertExpense,
  insertExpenseAllocation,
  insertPayment,
  insertSupplier,
  insertTask,
  updateExpense,
  updateTask,
} from '../db/supabaseService.ts';
import { paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';
import {
  validatePositiveNumber,
  validateRequiredString,
} from '../validation/validators.ts';

export const expensesRouter = Router();

/**
 * GET /api/expenses
 * Supports pagination and filters (category, paymentStatus, supplierId, animalId, startDate, endDate, includeReversed)
 */
expensesRouter.get(
  '/expenses',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const {
      category,
      paymentStatus,
      supplierId,
      animalId,
      startDate,
      endDate,
      includeReversed,
      page,
      limit,
    } = req.query;

    let filtered = [...db.expenses];

    if (includeReversed !== 'true') {
      filtered = filtered.filter((e) => !e.isReversed);
    }
    if (category && category !== 'ALL') {
      filtered = filtered.filter((e) => e.category === String(category));
    }
    if (paymentStatus && paymentStatus !== 'ALL') {
      filtered = filtered.filter((e) => e.paymentStatus === String(paymentStatus));
    }
    if (supplierId && supplierId !== 'ALL') {
      filtered = filtered.filter((e) => e.supplierId === String(supplierId));
    }
    if (animalId) {
      filtered = filtered.filter((e) => e.linkedAnimalId === String(animalId));
    }
    if (startDate) {
      filtered = filtered.filter((e) => e.expenseDate >= String(startDate));
    }
    if (endDate) {
      filtered = filtered.filter((e) => e.expenseDate <= String(endDate));
    }

    const summary = calculateFarmFinancialSummary(
      filtered,
      db.payments,
      db.expenseAllocations,
      startDate ? String(startDate) : undefined,
      endDate ? String(endDate) : undefined
    );

    res.json({
      ...paginateItems(filtered, page, limit),
      summary,
    });
  }
);

/**
 * POST /api/expenses
 * Validates inputs and prevents double-counting when linking expenses to animals.
 */
expensesRouter.post(
  '/expenses',
  requirePermission('RECORD_EXPENSES'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const {
      expenseDate,
      amountNgn,
      quantity,
      unit,
      pricePerUnitNgn,
      category,
      description,
      supplierId,
      supplierName,
      paymentStatus,
      paymentMethod,
      invoiceNumber,
      linkedAnimalId,
    } = req.body;

    const descCheck = validateRequiredString(description, 'Expense description');
    const catCheck = validateRequiredString(category, 'Expense category');
    if (!descCheck.valid || !catCheck.valid) {
      res.status(400).json({ error: descCheck.error || catCheck.error });
      return;
    }

    // Quantity-based pricing (e.g. "5 Bags at NGN 12,000 each"): when both are
    // supplied, Total Price is always computed here, never trusted from the client.
    const usesQuantityPricing = quantity !== undefined && quantity !== null && quantity !== '';
    let amt: number;
    let qtyNum: number | null = null;
    let pricePerUnitNum: number | null = null;
    let unitVal: string | null = null;

    if (usesQuantityPricing) {
      const qtyCheck = validatePositiveNumber(quantity, 'Quantity');
      const priceCheck = validatePositiveNumber(pricePerUnitNgn, 'Price per unit');
      if (!qtyCheck.valid || !priceCheck.valid) {
        res.status(400).json({ error: qtyCheck.error || priceCheck.error });
        return;
      }
      qtyNum = Number(quantity);
      pricePerUnitNum = Number(pricePerUnitNgn);
      unitVal = String(unit || 'Units').trim();
      amt = Math.round(qtyNum * pricePerUnitNum);
    } else {
      const amtCheck = validatePositiveNumber(amountNgn, 'Expense amount (NGN)');
      if (!amtCheck.valid) {
        res.status(400).json({ error: amtCheck.error });
        return;
      }
      amt = Number(amountNgn);
    }

    const dateStr = expenseDate || new Date().toISOString().slice(0, 10);
    const expId = `EXP-${Date.now()}`;
    const canSelfApprove = canPerformAction(
      user.role,
      'APPROVE_EXPENSES',
      user.canApproveExpenses
    );

    const cleanSupplierName = String(supplierName || 'Direct Farm Vendor').trim();
    let resolvedSupplier = db.suppliers.find(
      (s) => s.id === supplierId || s.name.toLowerCase() === cleanSupplierName.toLowerCase()
    );
    // Expense below has an FK on supplier_id when a new supplier is created
    // here, so its Supabase write must wait for the supplier's.
    let supplierReady: Promise<unknown> = Promise.resolve();
    if (!resolvedSupplier && cleanSupplierName) {
      resolvedSupplier = {
        id: generateSupplierId(db.suppliers),
        name: cleanSupplierName,
        category: String(category || 'General Vendor'),
        phone: '',
        email: '',
        address: 'Recorded via Expense Register',
        bankDetails: '',
      };
      db.suppliers.push(resolvedSupplier);
      supplierReady = insertSupplier(resolvedSupplier).catch((err) => {
        console.warn('⚠️ [MAIS DB] Supabase supplier persistence warning:', err?.message || err);
      });
    }

    const newExp: Expense = {
      id: expId,
      transactionCode: generateExpenseTransactionCode(db.expenses),
      expenseDate: dateStr,
      amountNgn: amt,
      quantity: qtyNum,
      unit: unitVal,
      pricePerUnitNgn: pricePerUnitNum,
      category,
      description: String(description).trim(),
      supplierId: resolvedSupplier ? resolvedSupplier.id : supplierId || null,
      supplierName: resolvedSupplier ? resolvedSupplier.name : cleanSupplierName,
      paymentStatus: paymentStatus || 'Paid',
      paymentMethod: paymentMethod || 'Bank Transfer',
      invoiceNumber: String(invoiceNumber || `INV-${Date.now().toString().slice(-5)}`).trim(),
      linkedEntityType: linkedAnimalId ? 'Animal' : 'General',
      linkedEntityId: linkedAnimalId || null,
      linkedAnimalId: linkedAnimalId || null,
      approvalStatus: canSelfApprove ? 'Approved' : 'Pending Approval',
      enteredBy: user.fullName,
      approvedBy: canSelfApprove ? user.fullName : null,
      isReversed: false,
      reversalReason: null,
    };

    db.expenses.unshift(newExp);
    // Allocation/payment below have an FK on expense_id, so they must wait
    // for this expense's Supabase write instead of racing it.
    const expenseReady = supplierReady
      .catch(() => {})
      .then(() => insertExpense(newExp))
      .catch((e) => console.warn('Supabase expense sync warning:', e));

    if (linkedAnimalId) {
      const animal = db.animals.find((a) => a.id === linkedAnimalId);
      if (animal) {
        const expAlloc = {
          id: `ALC-${Date.now()}`,
          expenseId: expId,
          feedIssueId: null,
          animalId: animal.id,
          allocationDate: dateStr,
          allocationCategory:
            category === 'Veterinary & Treatment'
              ? 'Direct Treatment'
              : category === 'Breeding & AI'
              ? 'Direct Breeding'
              : 'Shared Group Care',
          allocationMethod: 'Direct 100%',
          amountNgn: amt,
          notes: newExp.description,
        };
        db.expenseAllocations.unshift(expAlloc);
        expenseReady
          .then(() => insertExpenseAllocation(expAlloc))
          .catch((err) => {
            console.warn('⚠️ [MAIS DB] Supabase expense allocation persistence warning:', err?.message || err);
          });

        appendAnimalEvent(
          animal.id,
          dateStr,
          'EXPENSE',
          `Direct Expense: ${newExp.category}`,
          `${newExp.description} (${newExp.transactionCode})`,
          expId,
          amt,
          user.fullName
        );
      }
    }

    if (newExp.paymentStatus === 'Paid') {
      const autoPayment = {
        id: `PAY-${Date.now()}`,
        expenseId: expId,
        paymentDate: dateStr,
        amountNgn: amt,
        paymentMethod:
          newExp.paymentMethod === 'Credit' ? ('Bank Transfer' as const) : newExp.paymentMethod,
        referenceNumber: `REF-${newExp.transactionCode}`,
        recordedBy: user.fullName,
        notes: 'Settled upon entry',
      };
      db.payments.push(autoPayment);
      expenseReady
        .then(() => insertPayment(autoPayment))
        .catch((err) => {
          console.warn('⚠️ [MAIS DB] Supabase payment persistence warning:', err?.message || err);
        });
    }

    if (newExp.approvalStatus === 'Pending Approval') {
      const approvalTask = {
        id: `TSK-${Date.now()}`,
        title: `Approve Expense ${newExp.transactionCode}: ${newExp.description} (NGN ${amt.toLocaleString()})`,
        category: 'Expense Approval' as const,
        dueDate: dateStr,
        priority: 'Medium' as const,
        assignedTo: 'Dr. Bello Aliyu',
        animalId: linkedAnimalId || null,
        animalTag: null,
        referenceId: expId,
        status: 'Pending' as const,
        completionNotes: '',
        completedAt: null,
      };
      db.tasks.unshift(approvalTask);
      insertTask(approvalTask).catch((err) => {
        console.warn('⚠️ [MAIS DB] Supabase task persistence warning:', err?.message || err);
      });
    }

    appendAudit(
      user,
      'CREATE_EXPENSE',
      'Expense',
      expId,
      null,
      `Recorded expense ${newExp.transactionCode} for NGN ${amt.toLocaleString()} (${newExp.category}).`
    );

    saveDatabase(db);
    res.status(201).json({ expense: newExp });
  }
);

/**
 * POST /api/expenses/:id/payments
 */
expensesRouter.post(
  '/expenses/:id/payments',
  requirePermission('RECORD_EXPENSES'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const expense = db.expenses.find((e) => e.id === req.params.id);
    if (!expense) {
      res.status(404).json({ error: 'Expense transaction not found.' });
      return;
    }

    const { amountNgn, paymentDate, paymentMethod, referenceNumber, notes } = req.body;
    const amtCheck = validatePositiveNumber(amountNgn, 'Payment amount');
    if (!amtCheck.valid) {
      res.status(400).json({ error: amtCheck.error });
      return;
    }

    const amt = Number(amountNgn);
    const existingPaid = db.payments
      .filter((p) => p.expenseId === expense.id)
      .reduce((s, p) => s + p.amountNgn, 0);

    const payment: Payment = {
      id: `PAY-${Date.now()}`,
      expenseId: expense.id,
      paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
      amountNgn: amt,
      paymentMethod: paymentMethod || 'Bank Transfer',
      referenceNumber: String(referenceNumber || `NIP-${Date.now().toString().slice(-6)}`).trim(),
      recordedBy: user.fullName,
      notes: String(notes || '').trim(),
    };

    db.payments.push(payment);
    insertPayment(payment).catch((e) => console.warn('Supabase payment sync warning:', e));
    const newTotalPaid = existingPaid + amt;
    expense.paymentStatus = newTotalPaid >= expense.amountNgn ? 'Paid' : 'Partially Paid';
    updateExpense(expense.id, { paymentStatus: expense.paymentStatus }).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase expense update warning:', err?.message || err);
    });

    appendAudit(
      user,
      'RECORD_PAYMENT',
      'Payment',
      payment.id,
      null,
      `Recorded payment of NGN ${amt.toLocaleString()} against ${expense.transactionCode}. Status: ${expense.paymentStatus}.`
    );

    saveDatabase(db);
    res.status(201).json({ payment, expense });
  }
);

/**
 * POST /api/expenses/:id/approve
 */
expensesRouter.post(
  '/expenses/:id/approve',
  requirePermission('APPROVE_EXPENSES'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const expense = db.expenses.find((e) => e.id === req.params.id);
    if (!expense) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }
    const prev = expense.approvalStatus;
    expense.approvalStatus = 'Approved';
    expense.approvedBy = user.fullName;
    updateExpense(expense.id, {
      approvalStatus: expense.approvalStatus,
      approvedBy: expense.approvedBy,
    }).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase expense update warning:', err?.message || err);
    });

    for (const t of db.tasks) {
      if (t.referenceId === expense.id && t.status !== 'Completed') {
        t.status = 'Completed';
        t.completedAt = new Date().toISOString().slice(0, 10);
        t.completionNotes = `Approved by ${user.fullName}`;
        updateTask(t.id, {
          status: t.status,
          completedAt: t.completedAt,
          completionNotes: t.completionNotes,
        }).catch((err) => {
          console.warn('⚠️ [MAIS DB] Supabase task update warning:', err?.message || err);
        });
      }
    }

    appendAudit(
      user,
      'APPROVE_EXPENSE',
      'Expense',
      expense.id,
      null,
      `Approved expense ${expense.transactionCode} (NGN ${expense.amountNgn.toLocaleString()}).`,
      prev,
      'Approved'
    );

    saveDatabase(db);
    res.json({ expense });
  }
);

/**
 * POST /api/expenses/:id/reverse
 */
expensesRouter.post(
  '/expenses/:id/reverse',
  requirePermission('REVERSE_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const expense = db.expenses.find((e) => e.id === req.params.id);
    if (!expense) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }
    const { reason } = req.body;
    const reasonCheck = validateRequiredString(reason, 'Reversal reason', 3);
    if (!reasonCheck.valid) {
      res.status(400).json({ error: reasonCheck.error });
      return;
    }
    expense.isReversed = true;
    expense.reversalReason = String(reason).trim();
    updateExpense(expense.id, {
      isReversed: expense.isReversed,
      reversalReason: expense.reversalReason,
    }).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase expense update warning:', err?.message || err);
    });

    appendAudit(
      user,
      'REVERSE_EXPENSE',
      'Expense',
      expense.id,
      null,
      `Reversed posted expense ${expense.transactionCode} (NGN ${expense.amountNgn.toLocaleString()}). Reason: ${reason}`,
      'Active',
      'Reversed'
    );

    saveDatabase(db);
    res.json({ expense });
  }
);

/**
 * GET /api/payments (Canonical Section 15 Endpoint)
 */
expensesRouter.get(
  '/payments',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { expenseId, paymentMethod, startDate, endDate, page, limit } = req.query;
    let list = [...db.payments];
    if (expenseId) list = list.filter((p) => p.expenseId === String(expenseId));
    if (paymentMethod && paymentMethod !== 'ALL') {
      list = list.filter((p) => p.paymentMethod === String(paymentMethod));
    }
    if (startDate) list = list.filter((p) => p.paymentDate >= String(startDate));
    if (endDate) list = list.filter((p) => p.paymentDate <= String(endDate));
    res.json(paginateItems(list, page, limit));
  }
);

/**
 * POST /api/payments (Canonical Section 15 Endpoint)
 */
expensesRouter.post(
  '/payments',
  requirePermission('RECORD_EXPENSES'),
  (req: StaffRequest, res: Response) => {
    const user = req.staffUser!;
    const { expenseId, amountNgn, paymentDate, paymentMethod, referenceNumber, notes } = req.body;
    const expense = db.expenses.find((e) => e.id === expenseId);
    if (!expense) {
      res.status(404).json({ error: 'Valid expenseId is required to record a payment.' });
      return;
    }
    const amtCheck = validatePositiveNumber(amountNgn, 'Payment amount');
    if (!amtCheck.valid) {
      res.status(400).json({ error: amtCheck.error });
      return;
    }
    const amt = Number(amountNgn);
    const existingPaid = db.payments
      .filter((p) => p.expenseId === expense.id)
      .reduce((s, p) => s + p.amountNgn, 0);

    const payment: Payment = {
      id: `PAY-${Date.now()}`,
      expenseId: expense.id,
      paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
      amountNgn: amt,
      paymentMethod: paymentMethod || 'Bank Transfer',
      referenceNumber: String(referenceNumber || `NIP-${Date.now().toString().slice(-6)}`).trim(),
      recordedBy: user.fullName,
      notes: String(notes || '').trim(),
    };
    db.payments.push(payment);
    insertPayment(payment).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase payment persistence warning:', err?.message || err);
    });
    const newTotalPaid = existingPaid + amt;
    expense.paymentStatus = newTotalPaid >= expense.amountNgn ? 'Paid' : 'Partially Paid';
    updateExpense(expense.id, { paymentStatus: expense.paymentStatus }).catch((err) => {
      console.warn('⚠️ [MAIS DB] Supabase expense update warning:', err?.message || err);
    });

    appendAudit(
      user,
      'RECORD_PAYMENT',
      'Payment',
      payment.id,
      null,
      `Recorded payment of NGN ${amt.toLocaleString()} against ${expense.transactionCode}. Status: ${expense.paymentStatus}.`
    );
    saveDatabase(db);
    res.status(201).json({ payment, expense });
  }
);

