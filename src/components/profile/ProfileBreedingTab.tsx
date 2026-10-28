import React from 'react';
import { Animal, BreedingEvent, CalvingEvent } from '../../types/mais';

interface ProfileBreedingTabProps {
  animal: Animal;
  breedingEvents: BreedingEvent[];
  calvingEvents: CalvingEvent[];
  canEdit: boolean;
  onSelectAnimalById: (animalId: string) => void;
  onOpenQuickAction: (
    actionType: 'treatment' | 'feed' | 'weight' | 'breeding' | 'expense',
    preselectedAnimalId: string
  ) => void;
}

export const ProfileBreedingTab: React.FC<ProfileBreedingTabProps> = ({
  animal,
  breedingEvents,
  calvingEvents,
  canEdit,
  onSelectAnimalById,
  onOpenQuickAction,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Breeding &amp; Calving</h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => onOpenQuickAction('breeding', animal.id)}
            className="liquid-glass-btn-primary px-3 py-1.5 text-xs font-medium rounded-xl"
          >
            Record Breeding / Calving
          </button>
        )}
      </div>

      <div className="border border-slate-200/80 rounded-xl p-4 bg-white/80">
        <h4 className="text-xs font-bold text-slate-900 mb-3">
          Insemination &amp; Pregnancy Checks ({breedingEvents.length})
        </h4>
        {breedingEvents.length === 0 ? (
          <p className="text-xs text-slate-500">
            No insemination events recorded for this animal.
          </p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">AI Date</th>
                <th className="py-2 px-3 font-medium">Sire / Straw ID</th>
                <th className="py-2 px-3 font-medium">Attempt</th>
                <th className="py-2 px-3 font-medium">Pregnancy Check</th>
                <th className="py-2 px-3 font-medium">Est. Due Date</th>
                <th className="py-2 pl-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {breedingEvents.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3 font-mono">{b.inseminationDate}</td>
                  <td className="py-2 px-3 font-mono font-medium text-slate-900">
                    {b.sireIdOrStraw}
                  </td>
                  <td className="py-2 px-3 font-mono">#{b.attemptNumber}</td>
                  <td className="py-2 px-3">
                    {b.pregnancyResult} ({b.pregnancyCheckMethod} ·{' '}
                    {b.pregnancyCheckDate || 'Pending'})
                  </td>
                  <td className="py-2 px-3 font-mono">{b.estimatedDueDate}</td>
                  <td className="py-2 pl-3 font-semibold text-slate-900">{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border border-slate-200/80 rounded-xl p-4 bg-white/80">
        <h4 className="text-xs font-bold text-slate-900 mb-3">
          Confirmed Calving Events ({calvingEvents.length})
        </h4>
        {calvingEvents.length === 0 ? (
          <p className="text-xs text-slate-500">No calving events linked to this animal.</p>
        ) : (
          <div className="divide-y divide-slate-200 text-xs">
            {calvingEvents.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-mono font-semibold text-slate-900">
                    Calved: {c.calvingDate}
                  </span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span>Outcome: {c.outcome}</span>
                  <span className="mx-2 text-slate-400">·</span>
                  <span>Assistance: {c.assistanceRequired}</span>
                  <p className="text-slate-600 mt-0.5">{c.notes}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.calfIds.map((cid, idx) => (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => onSelectAnimalById(cid)}
                      className="px-2.5 py-1 font-mono text-xs font-medium text-emerald-800 border border-emerald-300 rounded-lg hover:bg-emerald-50"
                    >
                      View Calf {c.calfTags[idx] || cid}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
