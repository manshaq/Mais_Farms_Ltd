import React, { useState } from 'react';
import {
  AllocationMethod,
  MaisDatabaseState,
} from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';
import { ModalDialogShell } from './ModalDialogShell';

interface RecordFeedModalProps {
  db: MaisDatabaseState;
  onClose: () => void;
  onRecordFeedIssue: (payload: any) => Promise<void>;
  onRecordFeedPurchase: (payload: any) => Promise<void>;
  onRecordFeedLoss: (payload: any) => Promise<void>;
}

export const RecordFeedModal: React.FC<RecordFeedModalProps> = ({
  db,
  onClose,
  onRecordFeedIssue,
  onRecordFeedPurchase,
  onRecordFeedLoss,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [feedSubMode, setFeedSubMode] = useState<'purchase' | 'issue' | 'loss'>('issue');
  const [feedProductId, setFeedProductId] = useState(db.feedProducts[0]?.id || '');
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Concentrate');
  const [newProductStorageLocation, setNewProductStorageLocation] = useState('Main Feed Store');
  const [newProductReorderLevel, setNewProductReorderLevel] = useState('200');
  const [feedQty, setFeedQty] = useState('');
  const [feedUnitPrice, setFeedUnitPrice] = useState('450');
  const [feedTransportCost, setFeedTransportCost] = useState('0');
  const [feedSupplierName, setFeedSupplierName] = useState('Grand Cereals Ltd');
  const [feedInvoice, setFeedInvoice] = useState('');
  const [feedTargetType, setFeedTargetType] = useState<'Group' | 'Animal'>('Group');
  const [feedTargetGroup, setFeedTargetGroup] = useState('Lactating Cows');
  const [feedTargetAnimalId, setFeedTargetAnimalId] = useState(db.animals[0]?.id || '');
  const [feedAllocMethod, setFeedAllocMethod] = useState<AllocationMethod>('weight_proportion');
  const [feedLossReason, setFeedLossReason] = useState('Moisture damage in storage');

  const existingGroups = Array.from(
    new Set([
      'Lactating Cows',
      'Dry & Pregnant Cows',
      'Growing Heifers',
      'Calves & Weaners',
      'Breeding Bulls',
      ...db.animals.map((a) => a.herdGroup).filter(Boolean),
    ])
  );

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
      if (feedSubMode === 'issue') {
        await onRecordFeedIssue({
          issueDate: todayStr,
          productId: feedProductId,
          quantity: Number(feedQty),
          targetType: feedTargetType,
          targetGroup: feedTargetType === 'Group' ? feedTargetGroup : null,
          targetAnimalId: feedTargetType === 'Animal' ? feedTargetAnimalId : null,
          allocationMethod:
            feedTargetType === 'Animal' ? 'direct_animal' : feedAllocMethod,
          wastageKg: 0,
        });
      } else if (feedSubMode === 'purchase') {
        await onRecordFeedPurchase({
          purchaseDate: todayStr,
          productId: feedProductId,
          newProductName: feedProductId === '__NEW__' ? newProductName : undefined,
          newProductCategory: feedProductId === '__NEW__' ? newProductCategory : undefined,
          newProductStorageLocation:
            feedProductId === '__NEW__' ? newProductStorageLocation : undefined,
          newProductReorderLevel:
            feedProductId === '__NEW__' ? Number(newProductReorderLevel || 200) : undefined,
          quantityReceived: Number(feedQty),
          unitPriceNgn: Number(feedUnitPrice),
          transportCostNgn: Number(feedTransportCost || 0),
          supplierName: feedSupplierName,
          invoiceNumber: feedInvoice || `INV-${Date.now().toString().slice(-5)}`,
          paymentStatus: 'Paid',
        });
      } else {
        await onRecordFeedLoss({
          productId: feedProductId,
          movementDate: todayStr,
          quantity: Number(feedQty),
          reason: feedLossReason,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record feed transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Feed Inventory & Allocation"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setFeedSubMode('purchase')}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              feedSubMode === 'purchase'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Receive Feed Purchase
          </button>
          <button
            type="button"
            onClick={() => setFeedSubMode('issue')}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              feedSubMode === 'issue'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Issue &amp; Allocate Feed
          </button>
          <button
            type="button"
            onClick={() => setFeedSubMode('loss')}
            className={`px-3 py-1.5 rounded-lg font-semibold ${
              feedSubMode === 'loss'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            Record Loss / Spoilage
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Feed Product <span className="text-emerald-700">*</span>
            </label>
            <select
              value={feedProductId}
              onChange={(e) => setFeedProductId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {db.feedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category}) — NGN {p.standardUnitCostNgn}/kg
                </option>
              ))}
              {feedSubMode === 'purchase' && (
                <option value="__NEW__">+ Create New Feed Product...</option>
              )}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Quantity (kg) <span className="text-emerald-700">*</span>
            </label>
            <input
              type="number"
              min="1"
              required
              value={feedQty}
              onChange={(e) => setFeedQty(e.target.value)}
              placeholder="Quantity in kg"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
        </div>

        {feedSubMode === 'purchase' && feedProductId === '__NEW__' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1.5">
                New Feed Product Name <span className="text-emerald-700">*</span>
              </label>
              <input
                type="text"
                required
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. Dairy Concentrate 18% CP, Maize Silage, Salt Lick..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <SelectWithCustom
              label="Feed Category"
              required
              value={newProductCategory}
              onChange={(v) => setNewProductCategory(v)}
              options={[
                'Concentrate',
                'Roughage / Silage',
                'Mineral / Supplement',
                'Calf Milk Replacer',
                'Hay / Forage',
              ]}
              placeholder="Type custom feed category..."
            />
            <SelectWithCustom
              label="Storage Location"
              required
              value={newProductStorageLocation}
              onChange={(v) => setNewProductStorageLocation(v)}
              options={[
                'Main Feed Store',
                'Silage Bunker 1',
                'Concentrate Silo A',
                'Mineral Store Room',
              ]}
              placeholder="Type custom storage location..."
            />
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Low-Stock Reorder Alert Level (kg)
              </label>
              <input
                type="number"
                min="0"
                value={newProductReorderLevel}
                onChange={(e) => setNewProductReorderLevel(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
        )}

        {feedSubMode === 'issue' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Issue Target Type
              </label>
              <select
                value={feedTargetType}
                onChange={(e) => setFeedTargetType(e.target.value as 'Group' | 'Animal')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Group">Shared Herd Group</option>
                <option value="Animal">Single Specific Animal (100% Direct)</option>
              </select>
            </div>

            {feedTargetType === 'Group' ? (
              <>
                <SelectWithCustom
                  label="Target Herd Group"
                  required
                  value={feedTargetGroup}
                  onChange={(v) => setFeedTargetGroup(v)}
                  options={existingGroups}
                  placeholder="Type custom herd group..."
                />
                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Shared Cost Allocation Formula
                  </label>
                  <select
                    value={feedAllocMethod}
                    onChange={(e) =>
                      setFeedAllocMethod(e.target.value as AllocationMethod)
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="weight_proportion">
                      Weight Proportion (Proportional to each animal&apos;s live weight)
                    </option>
                    <option value="equal_headcount">
                      Equal Headcount (Split equally across active animals in group)
                    </option>
                    <option value="animal_days">
                      Animal-Days Present (Proportional to days present in group)
                    </option>
                  </select>
                </div>
              </>
            ) : (
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Recipient Animal
                </label>
                <select
                  value={feedTargetAnimalId}
                  onChange={(e) => setFeedTargetAnimalId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                >
                  {db.animals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.currentTag} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {feedSubMode === 'purchase' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Unit Price per kg (NGN) <span className="text-emerald-700">*</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={feedUnitPrice}
                onChange={(e) => setFeedUnitPrice(e.target.value)}
                placeholder="Price per kg in NGN"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Transport / Offloading Cost (NGN)
              </label>
              <input
                type="number"
                min="0"
                value={feedTransportCost}
                onChange={(e) => setFeedTransportCost(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <SelectWithCustom
              label="Supplier / Vendor"
              required
              value={feedSupplierName}
              onChange={(v) => setFeedSupplierName(v)}
              options={existingSuppliers}
              placeholder="Type custom feed supplier..."
            />
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Supplier Invoice #
              </label>
              <input
                type="text"
                value={feedInvoice}
                onChange={(e) => setFeedInvoice(e.target.value)}
                placeholder="Optional invoice reference"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
        )}

        {feedSubMode === 'loss' && (
          <div>
            <SelectWithCustom
              label="Reason for Spoilage / Wastage"
              required
              value={feedLossReason}
              onChange={(v) => setFeedLossReason(v)}
              options={[
                'Moisture damage in storage',
                'Spillage during trough loading',
                'Rodent / pest damage',
                'Expired batch disposal',
              ]}
              placeholder="Type custom wastage or loss reason..."
            />
          </div>
        )}
      </div>
    </ModalDialogShell>
  );
};
