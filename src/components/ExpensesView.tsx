import React, { useState, useMemo } from 'react';
import {
  Plus,
  CheckCircle2,
  RotateCcw,
  CreditCard,
  ArrowUpRight,
  Receipt,
  Download,
  Search,
  Paperclip,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  addDaysToIsoDate,
  AnimalCostBreakdown,
  calculateFarmFinancialSummary,
  canPerformAction,
  FarmFinancialSummary,
} from '../domain/farmRules';
import { downloadCsvFile, downloadExcelFile } from '../utils/csvExport';

interface ExpensesViewProps {
  db: MaisDatabaseState;
  financialSummary: FarmFinancialSummary;
  animalCosts: Record<string, AnimalCostBreakdown>;
  currentUser: StaffUser;
  onOpenExpenseModal: () => void;
  onOpenAnimalProfile: (animal: Animal) => void;
  onApproveExpense: (expenseId: string) => Promise<void>;
  onReverseExpense: (expenseId: string, reason: string) => Promise<void>;
  onRecordPayment: (expenseId: string, amountNgn: number, referenceNumber: string) => Promise<void>;
  onUploadExpenseReceipt?: (payload: {
    entityId: string;
    animalId: string | null;
    fileName: string;
    fileSizeKb: number;
    notes: string;
  }) => Promise<void>;
}

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  db,
  financialSummary: initialFinancialSummary,
  animalCosts,
  currentUser,
  onOpenExpenseModal,
  onOpenAnimalProfile,
  onApproveExpense,
  onReverseExpense,
  onRecordPayment,
  onUploadExpenseReceipt,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [subTab, setSubTab] = useState<'transactions' | 'animal_costs' | 'suppliers'>(
    'transactions'
  );
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [paymentModalExpenseId, setPaymentModalExpenseId] = useState<string | null>(null);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [payRefInput, setPayRefInput] = useState('');

  const [receiptModalExpenseId, setReceiptModalExpenseId] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  const canRecord = canPerformAction(currentUser.role, 'RECORD_EXPENSES');
  const canApprove = canPerformAction(
    currentUser.role,
    'APPROVE_EXPENSES',
    currentUser.canApproveExpenses
  );
  const canReverse = canPerformAction(currentUser.role, 'REVERSE_RECORDS');

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      setStartDate(addDaysToIsoDate(todayStr, -6));
      setEndDate(todayStr);
    } else if (preset === 'month') {
      setStartDate(`${todayStr.slice(0, 7)}-01`);
      setEndDate(`${todayStr.slice(0, 7)}-31`);
    }
  };

  const activeFinancialSummary = useMemo(() => {
    if (!startDate && !endDate) return initialFinancialSummary;
    return calculateFarmFinancialSummary(db.expenses, db.payments, db.expenseAllocations, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  }, [db.expenses, db.payments, db.expenseAllocations, startDate, endDate, initialFinancialSummary]);

  const availableCategories = Array.from(
    new Set([
      'Feed & Nutrition',
      'Veterinary & Treatment',
      'Breeding & AI',
      'Animal Purchase',
      'Equipment & Repairs',
      'Utilities & Fuel',
      ...db.expenses.map((e) => e.category).filter(Boolean),
    ])
  );

  const filteredExpenses = db.expenses.filter((e) => {
    if (categoryFilter !== 'ALL' && e.category !== categoryFilter) return false;
    if (paymentStatusFilter !== 'ALL' && e.paymentStatus !== paymentStatusFilter) return false;
    if (startDate && e.expenseDate < startDate) return false;
    if (endDate && e.expenseDate > endDate) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const linkedAnm = e.linkedAnimalId
        ? db.animals.find((a) => a.id === e.linkedAnimalId)
        : null;
      const matches =
        e.description.toLowerCase().includes(q) ||
        e.supplierName.toLowerCase().includes(q) ||
        e.transactionCode.toLowerCase().includes(q) ||
        e.invoiceNumber.toLowerCase().includes(q) ||
        (linkedAnm?.currentTag.toLowerCase().includes(q) ?? false);
      if (!matches) return false;
    }
    return true;
  });

  const buildExportData = () => {
    if (subTab === 'animal_costs') {
      const headers = [
        'Animal ID',
        'Current Tag',
        'Name',
        'Type',
        'Status',
        'Purchase Cost (NGN)',
        'Direct Treatments (NGN)',
        'Direct Breeding (NGN)',
        'Allocated Shared Feed (NGN)',
        'Total Lifetime Cost (NGN)',
      ];
      const rows = db.animals.map((a) => {
        const c = animalCosts[a.id];
        return [
          a.id,
          a.currentTag,
          a.name,
          a.type,
          a.status,
          c?.purchaseCostNgn ?? a.purchasePrice ?? 0,
          c?.directTreatmentCostNgn ?? 0,
          c?.directBreedingCostNgn ?? 0,
          c?.allocatedFeedCostNgn ?? 0,
          c?.totalLifetimeCostNgn ?? 0,
        ];
      });
      return { baseName: 'mais_animal_costs_export', title: 'Cost per Animal Ledger', headers, rows };
    }

    if (subTab === 'suppliers') {
      const headers = [
        'Supplier ID',
        'Supplier Name',
        'Category',
        'Phone',
        'Email',
        'Address',
        'Total Invoiced (NGN)',
        'Total Paid (NGN)',
        'Outstanding Balance (NGN)',
      ];
      const rows = db.suppliers.map((sup) => {
        const supExpenses = db.expenses.filter(
          (e) => !e.isReversed && (e.supplierId === sup.id || e.supplierName === sup.name)
        );
        const totalBilled = supExpenses.reduce((s, e) => s + e.amountNgn, 0);
        const supExpIds = new Set(supExpenses.map((e) => e.id));
        const totalPaid = db.payments
          .filter((p) => supExpIds.has(p.expenseId))
          .reduce((s, p) => s + p.amountNgn, 0);
        const balance = Math.max(0, totalBilled - totalPaid);
        return [
          sup.id,
          sup.name,
          sup.category,
          sup.phone,
          sup.email,
          sup.address,
          totalBilled,
          totalPaid,
          balance,
        ];
      });
      return { baseName: 'mais_suppliers_export', title: 'Supplier Balances', headers, rows };
    }

    const headers = [
      'Expense ID',
      'Transaction Code',
      'Date',
      'Category',
      'Description',
      'Supplier',
      'Invoice Number',
      'Linked Scope',
      'Animal Tag',
      'Payment Status',
      'Payment Method',
      'Approval Status',
      'Reversed',
      'Reversal Reason',
      'Amount (NGN)',
      'Paid Amount (NGN)',
      'Outstanding Balance (NGN)',
      'Receipts Attached',
      'Recorded By',
    ];

    const rows = filteredExpenses.map((exp) => {
      const linkedAnm = exp.linkedAnimalId
        ? db.animals.find((a) => a.id === exp.linkedAnimalId)
        : null;
      const paidAmount = db.payments
        .filter((p) => p.expenseId === exp.id)
        .reduce((sum, p) => sum + p.amountNgn, 0);
      const balance = exp.isReversed ? 0 : Math.max(0, exp.amountNgn - paidAmount);
      const receiptsCount = db.attachments.filter(
        (att) => att.entityType === 'Expense' && att.entityId === exp.id
      ).length;

      return [
        exp.id,
        exp.transactionCode,
        exp.expenseDate,
        exp.category,
        exp.description,
        exp.supplierName,
        exp.invoiceNumber,
        exp.linkedEntityType,
        linkedAnm ? linkedAnm.currentTag : '',
        exp.paymentStatus,
        exp.paymentMethod,
        exp.approvalStatus,
        exp.isReversed ? 'Yes' : 'No',
        exp.reversalReason || '',
        exp.amountNgn,
        paidAmount,
        balance,
        receiptsCount,
        exp.enteredBy,
      ];
    });

    return { baseName: 'mais_expenses_export', title: 'MAIS LTD Expenses Ledger', headers, rows };
  };

  const handleExportExpensesCsv = () => {
    const { baseName, headers, rows } = buildExportData();
    downloadCsvFile(baseName, headers, rows);
  };

  const handleExportExpensesExcel = () => {
    const { baseName, title, headers, rows } = buildExportData();
    downloadExcelFile(baseName, title, headers, rows, {
      subtitle: `Period: ${startDate || 'Beginning'} to ${endDate || 'Present'} | Generated by ${currentUser.fullName}`,
    });
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalExpenseId || !payAmountInput) return;
    await onRecordPayment(
      paymentModalExpenseId,
      Number(payAmountInput),
      payRefInput || `NIP-${Date.now().toString().slice(-6)}`
    );
    setPaymentModalExpenseId(null);
    setPayAmountInput('');
    setPayRefInput('');
  };

  const handleReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptModalExpenseId || !receiptFileName.trim() || !onUploadExpenseReceipt) return;
    const targetExpense = db.expenses.find((x) => x.id === receiptModalExpenseId);
    setSubmittingReceipt(true);
    try {
      await onUploadExpenseReceipt({
        entityId: receiptModalExpenseId,
        animalId: targetExpense?.linkedAnimalId || null,
        fileName: receiptFileName.trim(),
        fileSizeKb: 245,
        notes: receiptNotes.trim() || `Receipt for ${targetExpense?.invoiceNumber || receiptModalExpenseId}`,
      });
      setReceiptFileName('');
      setReceiptNotes('');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const activeReceiptExpense = receiptModalExpenseId
    ? db.expenses.find((x) => x.id === receiptModalExpenseId) || null
    : null;
  const activeExpenseReceipts = receiptModalExpenseId
    ? db.attachments.filter(
        (att) => att.entityType === 'Expense' && att.entityId === receiptModalExpenseId
      )
    : [];

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Expenses & Ledger</h1>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setSubTab('transactions')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'transactions' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Expenses ({db.expenses.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('animal_costs')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'animal_costs' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Cost per Animal ({db.animals.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('suppliers')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'suppliers' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Suppliers ({db.suppliers.length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExpensesExcel}
            className="liquid-glass-btn-secondary px-3 py-2 text-xs font-semibold text-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Export Excel (.xls)
          </button>

          <button
            type="button"
            onClick={handleExportExpensesCsv}
            className="liquid-glass-btn-secondary px-3 py-2 text-xs font-semibold text-slate-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {canRecord && (
            <button
              type="button"
              onClick={onOpenExpenseModal}
              className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Expense
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="liquid-glass-panel rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Spending
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1.5">
            NGN {activeFinancialSummary.totalExpenditureNgn.toLocaleString()}
          </p>
        </div>
        <div className="liquid-glass-panel rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Paid
          </p>
          <p className="text-2xl font-bold font-mono text-emerald-700 tabular-nums mt-1.5">
            NGN {activeFinancialSummary.totalPaidNgn.toLocaleString()}
          </p>
        </div>
        <div className="liquid-glass-panel rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Unpaid Balance
          </p>
          <p className="text-2xl font-bold font-mono text-amber-700 tabular-nums mt-1.5">
            NGN {activeFinancialSummary.totalUnpaidBalanceNgn.toLocaleString()}
          </p>
        </div>
        <div className="liquid-glass-panel rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Allocated to Herd
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1.5">
            NGN {activeFinancialSummary.totalAllocatedToAnimalsNgn.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Inline Payment Drawer */}
      {paymentModalExpenseId && (
        <form
          onSubmit={handlePaymentSubmit}
          className="bg-slate-100 border border-slate-300 rounded-xl p-4 flex flex-wrap items-end gap-4 text-xs"
        >
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Payment Amount (NGN) for Expense {paymentModalExpenseId}
            </label>
            <input
              type="number"
              required
              value={payAmountInput}
              onChange={(e) => setPayAmountInput(e.target.value)}
              placeholder="Amount in NGN"
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block font-medium text-slate-700 mb-1">
              Bank Transfer / POS Reference
            </label>
            <input
              type="text"
              value={payRefInput}
              onChange={(e) => setPayRefInput(e.target.value)}
              placeholder="Transaction reference"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
            >
              Confirm Payment
            </button>
            <button
              type="button"
              onClick={() => setPaymentModalExpenseId(null)}
              className="px-3 py-2 text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Inline Receipt & Supporting Document Drawer */}
      {activeReceiptExpense && (
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">
                Receipts & Supporting Documents for {activeReceiptExpense.transactionCode} ({activeReceiptExpense.invoiceNumber})
              </h3>
              <p className="text-slate-600">
                {activeReceiptExpense.supplierName} · NGN {activeReceiptExpense.amountNgn.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReceiptModalExpenseId(null)}
              className="px-3 py-1 font-semibold text-slate-700 hover:text-slate-900"
            >
              Close
            </button>
          </div>

          {activeExpenseReceipts.length === 0 ? (
            <p className="text-slate-500">No receipt documents attached to this expense yet.</p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              {activeExpenseReceipts.map((att) => (
                <div key={att.id} className="p-2.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-mono font-semibold text-slate-900">{att.fileName}</span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="text-slate-600">
                      {att.fileSizeKb} KB · Uploaded {att.uploadedAt} by {att.uploadedBy}
                    </span>
                    {att.notes && <p className="text-slate-500 mt-0.5">{att.notes}</p>}
                  </div>
                  {att.sha256Hash && (
                    <span className="font-mono text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {att.sha256Hash.slice(0, 14)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {canRecord && onUploadExpenseReceipt && (
            <form onSubmit={handleReceiptSubmit} className="flex flex-wrap items-end gap-3 pt-1">
              <div className="flex-1 min-w-[220px]">
                <label className="block font-medium text-slate-700 mb-1">
                  Receipt / Invoice Filename *
                </label>
                <input
                  type="text"
                  required
                  aria-label="Receipt Filename"
                  value={receiptFileName}
                  onChange={(e) => setReceiptFileName(e.target.value)}
                  placeholder="e.g. Northern_Mills_INV100_Receipt.pdf"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="flex-1 min-w-[220px]">
                <label className="block font-medium text-slate-700 mb-1">
                  Verification / Audit Notes
                </label>
                <input
                  type="text"
                  aria-label="Receipt Notes"
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="Stamped supplier receipt copy"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                disabled={submittingReceipt}
                className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {submittingReceipt ? 'Attaching...' : 'Attach Receipt'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* SUBTAB 1: ORIGINAL EXPENSES REGISTER */}
      {subTab === 'transactions' && (
        <div className="space-y-4">
          <div className="liquid-glass-panel rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search expenses"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search description, supplier, invoice, or tag..."
                  className="w-full pl-10 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <select
                aria-label="Filter expenses by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700"
              >
                <option value="ALL">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter expenses by payment status"
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Unpaid">Unpaid</option>
              </select>
            </div>

            {/* Date Period Presets & Custom Range */}
            <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium mr-1">Period:</span>
                {(
                  [
                    { id: 'all', label: 'All Time' },
                    { id: 'today', label: 'Daily (Today)' },
                    { id: 'week', label: 'Weekly (7d)' },
                    { id: 'month', label: 'Monthly' },
                  ] as { id: DatePreset; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyDatePreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      datePreset === p.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <label className="text-slate-600">From:</label>
                <input
                  type="date"
                  aria-label="Expense Filter Start Date"
                  value={startDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setStartDate(e.target.value);
                  }}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono"
                />
                <label className="text-slate-600">To:</label>
                <input
                  type="date"
                  aria-label="Expense Filter End Date"
                  value={endDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setEndDate(e.target.value);
                  }}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>
          </div>

          <div className="liquid-glass-panel rounded-xl overflow-hidden">
            {filteredExpenses.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                  <Receipt className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-slate-900">No Expenses Found</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Record farm expenditures, veterinary bills, or feed purchases to track supplier balances and per-animal cost allocations.
                </p>
                {canRecord && (
                  <button
                    type="button"
                    onClick={onOpenExpenseModal}
                    className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Record Expense
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-3 px-4 font-semibold">Date & Code</th>
                      <th className="py-3 px-4 font-semibold">Category & Description</th>
                      <th className="py-3 px-4 font-semibold">Supplier & Invoice</th>
                      <th className="py-3 px-4 font-semibold">Linked Record</th>
                      <th className="py-3 px-4 font-semibold">Payment Status</th>
                      <th className="py-3 px-4 font-semibold">Approval</th>
                      <th className="py-3 px-4 font-semibold text-right">Amount (NGN)</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredExpenses.map((exp) => {
                      const linkedAnm = exp.linkedAnimalId
                        ? db.animals.find((a) => a.id === exp.linkedAnimalId)
                        : null;
                      const receiptCount = db.attachments.filter(
                        (att) => att.entityType === 'Expense' && att.entityId === exp.id
                      ).length;

                      return (
                        <tr
                          key={exp.id}
                          className={
                            exp.isReversed ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-3 px-4 font-mono">
                            <div className="font-semibold text-slate-900">{exp.expenseDate}</div>
                            <div className="text-[11px] text-slate-500">{exp.transactionCode}</div>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{exp.category}</p>
                            <p className="text-slate-600">{exp.description}</p>
                            {exp.quantity != null && exp.pricePerUnitNgn != null && (
                              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                                {exp.quantity.toLocaleString()} {exp.unit || 'Units'} × ₦
                                {exp.pricePerUnitNgn.toLocaleString()}
                              </p>
                            )}
                            {exp.isReversed && (
                              <p className="text-red-700 font-medium mt-0.5">
                                REVERSED: {exp.reversalReason}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900">{exp.supplierName}</p>
                            <p className="font-mono text-slate-500">{exp.invoiceNumber}</p>
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {linkedAnm ? (
                              <button
                                type="button"
                                onClick={() => onOpenAnimalProfile(linkedAnm)}
                                className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"
                              >
                                {linkedAnm.currentTag}
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="text-slate-500">{exp.linkedEntityType}</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-semibold ${
                                exp.paymentStatus === 'Paid'
                                  ? 'text-emerald-700'
                                  : exp.paymentStatus === 'Partially Paid'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {exp.paymentStatus}
                            </span>
                            <p className="text-[11px] text-slate-500">{exp.paymentMethod}</p>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={
                                exp.approvalStatus === 'Approved'
                                  ? 'text-slate-900 font-medium'
                                  : 'text-amber-800 font-semibold'
                              }
                            >
                              {exp.approvalStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-right text-slate-900 tabular-nums">
                            NGN {exp.amountNgn.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                setReceiptModalExpenseId(
                                  receiptModalExpenseId === exp.id ? null : exp.id
                                )
                              }
                              className="px-2 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                              title="View or attach receipt documents"
                            >
                              <Paperclip className="w-3 h-3 text-emerald-700" />
                              Receipts ({receiptCount})
                            </button>
                            {!exp.isReversed &&
                              exp.approvalStatus === 'Pending Approval' &&
                              canApprove && (
                                <button
                                  type="button"
                                  onClick={() => onApproveExpense(exp.id)}
                                  className="px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-300 rounded hover:bg-emerald-50 inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Approve
                                </button>
                              )}
                            {!exp.isReversed && exp.paymentStatus !== 'Paid' && canRecord && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentModalExpenseId(exp.id);
                                  setPayAmountInput(String(exp.amountNgn));
                                }}
                                className="px-2.5 py-1 text-xs font-medium text-slate-800 border border-slate-300 rounded hover:bg-slate-100 inline-flex items-center gap-1"
                              >
                                <CreditCard className="w-3 h-3" />
                                Pay
                              </button>
                            )}
                            {!exp.isReversed && canReverse && (
                              <button
                                type="button"
                                onClick={() =>
                                  onReverseExpense(
                                    exp.id,
                                    'Reversed by authorized staff via Expense Register'
                                  )
                                }
                                className="px-2 py-1 text-xs text-slate-500 hover:text-red-700"
                                title="Reverse posted transaction with audit log"
                              >
                                <RotateCcw className="w-3.5 h-3.5 inline" />
                              </button>
                            )}
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
      )}

      {/* SUBTAB 2: LIFETIME ANIMAL COSTS */}
      {subTab === 'animal_costs' && (
        <div className="liquid-glass-panel rounded-xl overflow-hidden">
          {db.animals.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No animals registered yet to compute lifetime costs.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Animal Tag & ID</th>
                  <th className="py-3 px-4 font-semibold">Name & Type</th>
                  <th className="py-3 px-4 font-semibold text-right">Purchase Cost</th>
                  <th className="py-3 px-4 font-semibold text-right">Direct Treatments</th>
                  <th className="py-3 px-4 font-semibold text-right">Direct Breeding</th>
                  <th className="py-3 px-4 font-semibold text-right">Allocated Shared Feed</th>
                  <th className="py-3 px-4 font-semibold text-right">Total Lifetime Cost (NGN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {db.animals.map((a) => {
                  const c = animalCosts[a.id];
                  if (!c) return null;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => onOpenAnimalProfile(a)}
                          className="font-mono font-bold text-emerald-700 hover:underline"
                        >
                          {a.currentTag}
                        </button>
                        <span className="block font-mono text-[11px] text-slate-500">{a.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{a.name}</p>
                        <p className="text-slate-500">
                          {a.type} · {a.status}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-right tabular-nums">
                        NGN {c.purchaseCostNgn.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right tabular-nums">
                        NGN {c.directTreatmentCostNgn.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right tabular-nums">
                        NGN {c.directBreedingCostNgn.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right tabular-nums">
                        NGN {c.allocatedFeedCostNgn.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-right text-emerald-800 tabular-nums">
                        NGN {c.totalLifetimeCostNgn.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SUBTAB 3: SUPPLIERS & PAYMENTS */}
      {subTab === 'suppliers' && (
        <div>
          {db.suppliers.length === 0 ? (
            <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-500">
              Suppliers are automatically added when you record a feed purchase or farm expense.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {db.suppliers.map((sup) => {
                const supExpenses = db.expenses.filter(
                  (e) => !e.isReversed && (e.supplierId === sup.id || e.supplierName === sup.name)
                );
                const totalBilled = supExpenses.reduce((s, e) => s + e.amountNgn, 0);
                const supExpIds = new Set(supExpenses.map((e) => e.id));
                const totalPaid = db.payments
                  .filter((p) => supExpIds.has(p.expenseId))
                  .reduce((s, p) => s + p.amountNgn, 0);
                const balance = Math.max(0, totalBilled - totalPaid);

                return (
                  <div
                    key={sup.id}
                    className="liquid-glass-panel rounded-xl p-5 space-y-3 text-xs"
                  >
                    <div>
                      <span className="text-slate-500">{sup.category}</span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">{sup.name}</h3>
                      <p className="text-slate-600 mt-1">{sup.address}</p>
                    </div>
                    <div className="pt-3 border-t border-slate-200 space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Total Invoiced:</span>
                        <span className="font-semibold text-slate-900">
                          NGN {totalBilled.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Total Paid:</span>
                        <span className="text-emerald-700 font-semibold">
                          NGN {totalPaid.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-sans">Outstanding Balance:</span>
                        <span className="text-amber-800 font-bold">
                          NGN {balance.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
