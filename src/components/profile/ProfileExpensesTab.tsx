import React from 'react';
import { AnimalCostBreakdown } from '../../domain/farmRules';

export interface ExpenseLedgerRow {
  id: string;
  date: string;
  category: string;
  method: string;
  description: string;
  amountNgn: number;
}

interface ProfileExpensesTabProps {
  costBreakdown: AnimalCostBreakdown;
  expenseLedgerRows: ExpenseLedgerRow[];
}

export const ProfileExpensesTab: React.FC<ProfileExpensesTabProps> = ({
  costBreakdown,
  expenseLedgerRows,
}) => {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 border border-slate-200/80 rounded-xl p-4 bg-white/80">
        <div>
          <p className="text-xs text-slate-500">Purchase Cost</p>
          <p className="text-sm font-bold font-mono text-slate-900 mt-1">
            NGN {costBreakdown.purchaseCostNgn.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Direct Treatments</p>
          <p className="text-sm font-bold font-mono text-slate-900 mt-1">
            NGN {costBreakdown.directTreatmentCostNgn.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Direct Breeding</p>
          <p className="text-sm font-bold font-mono text-slate-900 mt-1">
            NGN {costBreakdown.directBreedingCostNgn.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Shared Feed</p>
          <p className="text-sm font-bold font-mono text-slate-900 mt-1">
            NGN {costBreakdown.allocatedFeedCostNgn.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Lifetime Total</p>
          <p className="text-sm font-bold font-mono text-emerald-800 mt-1">
            NGN {costBreakdown.totalLifetimeCostNgn.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="border border-slate-200/80 rounded-xl bg-white/80 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="py-2.5 px-4 font-medium">Date</th>
              <th className="py-2.5 px-4 font-medium">Category</th>
              <th className="py-2.5 px-4 font-medium">Allocation Basis</th>
              <th className="py-2.5 px-4 font-medium">Description</th>
              <th className="py-2.5 px-4 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {expenseLedgerRows.map((row) => (
              <tr key={row.id}>
                <td className="py-2.5 px-4 font-mono">{row.date}</td>
                <td className="py-2.5 px-4 font-medium text-slate-900">{row.category}</td>
                <td className="py-2.5 px-4 font-mono text-slate-600">{row.method}</td>
                <td className="py-2.5 px-4 text-slate-600">{row.description}</td>
                <td className="py-2.5 px-4 font-mono font-semibold text-right">
                  NGN {row.amountNgn.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
