import React from 'react';
import { Animal, WeightWithADG } from '../../types/mais';

interface ProfileWeightTabProps {
  animal: Animal;
  weightsWithAdg: WeightWithADG[];
  canEdit: boolean;
  onOpenQuickAction: (
    actionType: 'treatment' | 'feed' | 'weight' | 'breeding' | 'expense',
    preselectedAnimalId: string
  ) => void;
}

export const ProfileWeightTab: React.FC<ProfileWeightTabProps> = ({
  animal,
  weightsWithAdg,
  canEdit,
  onOpenQuickAction,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          Weight &amp; Average Daily Gain ({weightsWithAdg.length})
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => onOpenQuickAction('weight', animal.id)}
            className="liquid-glass-btn-primary px-3 py-1.5 text-xs font-medium rounded-xl"
          >
            Record Weight
          </button>
        )}
      </div>

      {weightsWithAdg.length === 0 ? (
        <div className="border border-slate-200/80 rounded-xl p-6 bg-white/80 text-center text-xs text-slate-500">
          No weight measurements recorded yet.
        </div>
      ) : (
        <div className="border border-slate-200/80 rounded-xl bg-white/80 overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 font-medium">Date</th>
                <th className="py-2.5 px-4 font-medium">Stage</th>
                <th className="py-2.5 px-4 font-medium text-right">Weight (kg)</th>
                <th className="py-2.5 px-4 font-medium text-right">Days Elapsed</th>
                <th className="py-2.5 px-4 font-medium text-right">ADG</th>
                <th className="py-2.5 px-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {weightsWithAdg.map((w) => (
                <tr key={w.id}>
                  <td className="py-2.5 px-4 font-mono">{w.measurementDate}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{w.stage}</td>
                  <td className="py-2.5 px-4 font-mono font-semibold text-right">
                    {w.weightKg.toFixed(1)} kg
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right">
                    {w.daysBetween !== null ? `${w.daysBetween} d` : 'Baseline'}
                  </td>
                  <td className="py-2.5 px-4 font-mono font-semibold text-right text-emerald-800">
                    {w.adgKgPerDay !== null
                      ? `${w.adgKgPerDay >= 0 ? '+' : ''}${w.adgKgPerDay.toFixed(3)} kg/day`
                      : '—'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{w.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
