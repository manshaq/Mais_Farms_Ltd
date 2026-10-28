import React from 'react';
import { Animal, ExpenseAllocation } from '../../types/mais';

interface ProfileFeedTabProps {
  animal: Animal;
  feedAllocations: ExpenseAllocation[];
  canEdit: boolean;
  onOpenQuickAction: (
    actionType: 'treatment' | 'feed' | 'weight' | 'breeding' | 'expense',
    preselectedAnimalId: string
  ) => void;
}

export const ProfileFeedTab: React.FC<ProfileFeedTabProps> = ({
  animal,
  feedAllocations,
  canEdit,
  onOpenQuickAction,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          Feed Allocations ({feedAllocations.length})
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => onOpenQuickAction('feed', animal.id)}
            className="liquid-glass-btn-primary px-3 py-1.5 text-xs font-medium rounded-xl"
          >
            Issue Feed
          </button>
        )}
      </div>

      {feedAllocations.length === 0 ? (
        <div className="border border-slate-200/80 rounded-xl p-6 bg-white/80 text-center text-xs text-slate-500">
          No feed allocations recorded for {animal.currentTag} yet.
        </div>
      ) : (
        <div className="border border-slate-200/80 rounded-xl bg-white/80 overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Reference</th>
                <th className="py-2.5 px-4 font-medium">Method</th>
                <th className="py-2.5 px-4 font-medium">Details</th>
                <th className="py-2.5 px-4 font-medium text-right">Allocated Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {feedAllocations.map((alloc) => (
                <tr key={alloc.id}>
                  <td className="py-2.5 px-4 font-mono">{alloc.allocationDate}</td>
                  <td className="py-2.5 px-4 font-mono">{alloc.feedIssueId || alloc.id}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {alloc.allocationMethod}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{alloc.notes}</td>
                  <td className="py-2.5 px-4 font-mono font-semibold text-right">
                    NGN {alloc.amountNgn.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
