import React, { useState } from 'react';
import {
  Plus,
  AlertTriangle,
  ArrowUpRight,
  Wheat,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  canPerformAction,
  ProductStockSummary,
} from '../domain/farmRules';

interface FeedInventoryViewProps {
  db: MaisDatabaseState;
  productStocks: ProductStockSummary[];
  currentUser: StaffUser;
  onOpenFeedModal: () => void;
  onOpenAnimalProfile: (animal: Animal) => void;
}

export const FeedInventoryView: React.FC<FeedInventoryViewProps> = ({
  db,
  productStocks,
  currentUser,
  onOpenFeedModal,
  onOpenAnimalProfile,
}) => {
  const [subTab, setSubTab] = useState<'stock' | 'issues' | 'purchases'>('stock');
  const canManage = canPerformAction(currentUser.role, 'MANAGE_FEED');

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Feed & Inventory</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setSubTab('stock')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'stock' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Stock Balances ({productStocks.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('issues')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'issues' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Feed Issues ({db.feedIssues.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('purchases')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'purchases' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Purchases ({db.feedPurchases.length})
            </button>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={onOpenFeedModal}
              className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Issue / Purchase Feed
            </button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: STOCK BALANCES */}
      {subTab === 'stock' && (
        <div className="space-y-5">
          {productStocks.length === 0 ? (
            <div className="liquid-glass-panel rounded-xl p-10 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <Wheat className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-900">No Feed in Stock</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No feed products recorded yet.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={onOpenFeedModal}
                  className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add Feed
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {productStocks.map((st) => (
                <div
                  key={st.productId}
                  className={`rounded-xl p-4 border ${
                    st.isLowStock
                      ? 'bg-amber-50/60 border-amber-300'
                      : 'liquid-glass-panel'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-medium text-slate-500">
                        {st.category}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {st.productName}
                      </h3>
                    </div>
                    {st.isLowStock && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" />
                        Low
                      </span>
                    )}
                  </div>

                  <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-3">
                    {st.closingStock.toLocaleString()} kg
                  </p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Reorder Level: {st.reorderLevel} kg · NGN{' '}
                    {st.standardUnitCostNgn}/kg
                  </p>

                  <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600">
                    <div>Opening: {st.openingStock} kg</div>
                    <div>+ Receipts: {st.receipts} kg</div>
                    <div>- Issues: {st.issues} kg</div>
                    <div>- Losses: {st.recordedLosses} kg</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stock Movements Ledger */}
          <div className="liquid-glass-panel rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Stock Movement Ledger ({db.inventoryMovements.length})
              </h3>
            </div>
            {db.inventoryMovements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No inventory movements recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 px-4 font-medium">Date</th>
                      <th className="py-2.5 px-4 font-medium">Product</th>
                      <th className="py-2.5 px-4 font-medium">Type</th>
                      <th className="py-2.5 px-4 font-medium text-right">Quantity</th>
                      <th className="py-2.5 px-4 font-medium">Reason & Reference</th>
                      <th className="py-2.5 px-4 font-medium">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {db.inventoryMovements.map((m) => {
                      const prod = db.feedProducts.find((p) => p.id === m.productId);
                      return (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono">{m.movementDate}</td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">
                            {prod?.name || m.productId}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold">
                            <span
                              className={
                                m.movementType === 'RECEIPT'
                                  ? 'text-emerald-700'
                                  : m.movementType === 'LOSS'
                                  ? 'text-red-700'
                                  : 'text-slate-800'
                              }
                            >
                              {m.movementType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-right">
                            {m.movementType === 'RECEIPT' ? '+' : '-'}
                            {m.quantity} kg
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {m.reason} <span className="font-mono">({m.referenceId})</span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{m.recordedBy}</td>
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

      {/* SUBTAB 2: FEED ISSUES & COST ALLOCATIONS */}
      {subTab === 'issues' && (
        <div className="space-y-4">
          {db.feedIssues.length === 0 ? (
            <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-500">
              No feed issues or group ration allocations recorded yet.
            </div>
          ) : (
            db.feedIssues.map((iss) => {
              const allocations = db.expenseAllocations.filter(
                (a) => a.feedIssueId === iss.id
              );
              return (
                <div
                  key={iss.id}
                  className="liquid-glass-panel rounded-xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-900">
                          {iss.issueDate}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{iss.id}</span>
                        <span aria-hidden="true">·</span>
                        <span>Issued by {iss.responsibleStaff}</span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1">
                        {iss.quantity} kg {iss.productName} →{' '}
                        {iss.targetType === 'Group'
                          ? `Group: ${iss.targetGroup}`
                          : `Animal: ${iss.targetAnimalId}`}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Allocation Method: <strong>{iss.allocationMethod}</strong>
                        {iss.notes ? ` · ${iss.notes}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                        NGN {iss.totalCostNgn.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Split across {allocations.length} animal(s)
                      </p>
                    </div>
                  </div>

                  {allocations.length > 0 && (
                    <div className="overflow-x-auto border-t border-slate-200 pt-3">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1.5 pr-3 font-medium">Animal</th>
                            <th className="py-1.5 px-3 font-medium">Basis</th>
                            <th className="py-1.5 px-3 font-medium">Computation Breakdown</th>
                            <th className="py-1.5 pl-3 font-medium text-right">Allocated Share</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allocations.map((al) => {
                            const anm = db.animals.find((a) => a.id === al.animalId);
                            return (
                              <tr key={al.id}>
                                <td className="py-2 pr-3">
                                  {anm ? (
                                    <button
                                      type="button"
                                      onClick={() => onOpenAnimalProfile(anm)}
                                      className="font-mono font-bold text-emerald-800 hover:underline inline-flex items-center gap-1"
                                    >
                                      {anm.currentTag} ({anm.name})
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  ) : (
                                    al.animalId
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono">{al.allocationMethod}</td>
                                <td className="py-2 px-3 text-slate-600">{al.notes}</td>
                                <td className="py-2 pl-3 font-mono font-semibold text-right">
                                  NGN {al.amountNgn.toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 3: FEED PURCHASES */}
      {subTab === 'purchases' && (
        <div className="liquid-glass-panel rounded-xl overflow-hidden">
          {db.feedPurchases.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No feed purchases recorded yet.
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Date & Invoice</th>
                  <th className="py-3 px-4 font-semibold">Supplier</th>
                  <th className="py-3 px-4 font-semibold">Feed Product & Batch</th>
                  <th className="py-3 px-4 font-semibold text-right">Qty Received</th>
                  <th className="py-3 px-4 font-semibold text-right">Unit Price</th>
                  <th className="py-3 px-4 font-semibold text-right">Transport</th>
                  <th className="py-3 px-4 font-semibold text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {db.feedPurchases.map((fp) => (
                  <tr key={fp.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono">
                      <div className="font-semibold text-slate-900">{fp.purchaseDate}</div>
                      <div className="text-slate-500">{fp.invoiceNumber}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{fp.supplierName}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">{fp.productName}</span>
                      <span className="block font-mono text-slate-500">Batch: {fp.batchNumber}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-right">
                      {fp.quantityReceived.toLocaleString()} kg
                    </td>
                    <td className="py-3 px-4 font-mono text-right">
                      NGN {fp.unitPriceNgn.toLocaleString()}/kg
                    </td>
                    <td className="py-3 px-4 font-mono text-right">
                      NGN {fp.transportCostNgn.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-right text-slate-900">
                      NGN {fp.totalCostNgn.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
