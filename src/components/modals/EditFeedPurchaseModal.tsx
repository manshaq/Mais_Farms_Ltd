import React, { useState } from 'react';
import { FeedPurchase } from '../../types/mais';
import { ModalDialogShell } from './ModalDialogShell';

interface EditFeedPurchaseModalProps {
  purchase: FeedPurchase;
  onClose: () => void;
  onSave: (purchaseId: string, payload: any) => Promise<void>;
}

export const EditFeedPurchaseModal: React.FC<EditFeedPurchaseModalProps> = ({
  purchase,
  onClose,
  onSave,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [purchaseDate, setPurchaseDate] = useState(purchase.purchaseDate);
  const [batchNumber, setBatchNumber] = useState(purchase.batchNumber);
  const [quantityReceived, setQuantityReceived] = useState(String(purchase.quantityReceived));
  const [unitPriceNgn, setUnitPriceNgn] = useState(String(purchase.unitPriceNgn));
  const [transportCostNgn, setTransportCostNgn] = useState(String(purchase.transportCostNgn));
  const [supplierName, setSupplierName] = useState(purchase.supplierName);
  const [invoiceNumber, setInvoiceNumber] = useState(purchase.invoiceNumber);
  const [notes, setNotes] = useState(purchase.notes || '');

  const qtyNum = Number(quantityReceived) || 0;
  const priceNum = Number(unitPriceNgn) || 0;
  const transportNum = Number(transportCostNgn) || 0;
  const liveTotal = qtyNum * priceNum + transportNum;

  const formatNaira = (amount: number) =>
    `₦${amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onSave(purchase.id, {
        purchaseDate,
        batchNumber,
        quantityReceived: qtyNum,
        unitPriceNgn: priceNum,
        transportCostNgn: transportNum,
        supplierName,
        invoiceNumber,
        notes,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Edit Feed Purchase"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          {purchase.productName} — original entry by {purchase.recordedBy}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Date Bought <span className="text-emerald-700">*</span>
            </label>
            <input
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Batch Number</label>
            <input
              type="text"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Quantity ({purchase.unit}) <span className="text-emerald-700">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={quantityReceived}
              onChange={(e) => setQuantityReceived(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Price per Unit (₦ per {purchase.unit}) <span className="text-emerald-700">*</span>
            </label>
            <input
              type="number"
              min="1"
              required
              value={unitPriceNgn}
              onChange={(e) => setUnitPriceNgn(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Transport Cost (₦)</label>
            <input
              type="number"
              min="0"
              value={transportCostNgn}
              onChange={(e) => setTransportCostNgn(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Total Price (₦)</label>
            <div className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-slate-50 font-semibold text-slate-900">
              {formatNaira(liveTotal)}
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Supplier or Seller</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Invoice / Receipt No.</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth noting about this purchase"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>
    </ModalDialogShell>
  );
};
