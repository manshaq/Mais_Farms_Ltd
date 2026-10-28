import React, { useState } from 'react';
import {
  ExpenseCategory,
  MaisDatabaseState,
} from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';
import { ModalDialogShell } from './ModalDialogShell';

interface RecordExpenseModalProps {
  db: MaisDatabaseState;
  preselectedAnimalId?: string | null;
  onClose: () => void;
  onRecordExpense: (payload: any) => Promise<void>;
}

export const RecordExpenseModal: React.FC<RecordExpenseModalProps> = ({
  db,
  preselectedAnimalId,
  onClose,
  onRecordExpense,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Feed & Nutrition');
  const [expDesc, setExpDesc] = useState('');
  const [expSupplier, setExpSupplier] = useState('Grand Cereals Ltd');
  const [expPaymentStatus, setExpPaymentStatus] = useState<'Paid' | 'Partially Paid' | 'Unpaid'>('Paid');
  const [expPaymentMethod, setExpPaymentMethod] = useState('Bank Transfer');
  const [expInvoice, setExpInvoice] = useState('');
  const [expDate, setExpDate] = useState(todayStr);
  const [expLinkedAnimalId, setExpLinkedAnimalId] = useState(preselectedAnimalId || '');

  const existingSuppliers = Array.from(
    new Set([
      'Grand Cereals Ltd',
      'Premier Feed Mills',
      'Livestock Feeds Plc',
      'VetCare Pharma Supplies',
      ...db.suppliers.map((s) => s.name).filter(Boolean),
    ])
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onRecordExpense({
        expenseDate: expDate,
        amountNgn: Number(expAmount),
        category: expCategory,
        description: expDesc,
        supplierName: expSupplier,
        paymentStatus: expPaymentStatus,
        paymentMethod: expPaymentMethod,
        invoiceNumber: expInvoice || `INV-${Date.now().toString().slice(-5)}`,
        linkedAnimalId: expLinkedAnimalId || null,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Record Operating Expense"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Amount (NGN) <span className="text-emerald-700">*</span>
          </label>
          <input
            type="number"
            min="1"
            required
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="Enter amount in NGN"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        <SelectWithCustom
          label="Expense Category"
          required
          value={expCategory}
          onChange={(v) => setExpCategory(v)}
          options={[
            'Feed & Nutrition',
            'Veterinary & Treatment',
            'Breeding & AI',
            'Animal Purchase',
            'Transport & Logistics',
            'Farm Labour',
            'Utilities & Fuel',
            'Equipment & Repairs',
            'Other Operations',
          ]}
          placeholder="Type custom expense category..."
        />

        <div className="md:col-span-2">
          <label className="block font-semibold text-slate-700 mb-1.5">
            Description <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            value={expDesc}
            onChange={(e) => setExpDesc(e.target.value)}
            placeholder="Describe the expenditure item or service"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>

        <SelectWithCustom
          label="Supplier / Payee"
          required
          value={expSupplier}
          onChange={(v) => setExpSupplier(v)}
          options={existingSuppliers}
          placeholder="Type custom vendor or payee name..."
        />

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Payment Status
          </label>
          <select
            value={expPaymentStatus}
            onChange={(e) => setExpPaymentStatus(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            <option value="Paid">Paid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Unpaid">Unpaid (Credit / Payable)</option>
          </select>
        </div>

        <SelectWithCustom
          label="Payment Method"
          value={expPaymentMethod}
          onChange={(v) => setExpPaymentMethod(v)}
          options={['Bank Transfer', 'POS / Card', 'Cash', 'Cheque', 'Credit']}
          placeholder="Type custom payment method..."
        />

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Invoice / Receipt Number
          </label>
          <input
            type="text"
            value={expInvoice}
            onChange={(e) => setExpInvoice(e.target.value)}
            placeholder="Optional invoice number"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Expense Date <span className="text-emerald-700">*</span>
          </label>
          <input
            type="date"
            required
            value={expDate}
            onChange={(e) => setExpDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Link Directly to Animal (Optional)
          </label>
          <select
            value={expLinkedAnimalId}
            onChange={(e) => setExpLinkedAnimalId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
          >
            <option value="">General Farm Expense (Not Single-Animal)</option>
            {db.animals.map((a) => (
              <option key={a.id} value={a.id}>
                {a.currentTag} — {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </ModalDialogShell>
  );
};
