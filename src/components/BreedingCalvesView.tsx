import React, { useState } from 'react';
import {
  Plus,
  Scale,
  ArrowUpRight,
  HeartHandshake,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  calculateWeightHistoryWithADG,
  canPerformAction,
} from '../domain/farmRules';

interface BreedingCalvesViewProps {
  db: MaisDatabaseState;
  currentUser: StaffUser;
  onOpenAnimalProfile: (animal: Animal) => void;
  onOpenBreedingModal: () => void;
  onOpenWeightModal: (preselectedAnimalId?: string) => void;
}

export const BreedingCalvesView: React.FC<BreedingCalvesViewProps> = ({
  db,
  currentUser,
  onOpenAnimalProfile,
  onOpenBreedingModal,
  onOpenWeightModal,
}) => {
  const [subTab, setSubTab] = useState<'breeding' | 'calving' | 'growth'>('breeding');
  const canManage = canPerformAction(currentUser.role, 'MANAGE_BREEDING');

  const calvesAndYoungstock = db.animals.filter(
    (a) =>
      a.type === 'Calf' ||
      a.type === 'Heifer' ||
      db.weightRecords.some((w) => w.animalId === a.id)
  );

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Breeding & Calves</h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setSubTab('breeding')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'breeding' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Insemination ({db.breedingEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('calving')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'calving' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Calving ({db.calvingEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('growth')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'growth' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Growth & Weights ({db.weightRecords.length})
            </button>
          </div>

          {canManage && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenBreedingModal}
                className="liquid-glass-btn-primary px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Breeding
              </button>
              <button
                type="button"
                onClick={() => onOpenWeightModal()}
                className="liquid-glass-btn-secondary px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Scale className="w-3.5 h-3.5" />
                Log Weight
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SUBTAB 1: INSEMINATION */}
      {subTab === 'breeding' && (
        <div className="liquid-glass-panel rounded-xl overflow-hidden">
          {db.breedingEvents.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-900">No Breeding Records</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No breeding or pregnancy events recorded yet.
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={onOpenBreedingModal}
                  className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add Breeding
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Animal</th>
                    <th className="py-3 px-4 font-semibold">AI Date</th>
                    <th className="py-3 px-4 font-semibold">Sire / Straw</th>
                    <th className="py-3 px-4 font-semibold">Pregnancy Check</th>
                    <th className="py-3 px-4 font-semibold">Due Date</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {db.breedingEvents.map((b) => {
                    const anm = db.animals.find((a) => a.id === b.animalId);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          {anm ? (
                            <button
                              type="button"
                              onClick={() => onOpenAnimalProfile(anm)}
                              className="font-mono font-bold text-emerald-800 hover:underline inline-flex items-center gap-1"
                            >
                              {anm.currentTag} ({anm.name})
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            b.animalId
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">{b.inseminationDate}</td>
                        <td className="py-3 px-4 font-mono text-slate-800">{b.sireIdOrStraw}</td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-900">{b.pregnancyResult}</span>{' '}
                          <span className="text-slate-500 font-mono">
                            ({b.pregnancyCheckDate || 'Pending'})
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {b.estimatedDueDate}
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-800">{b.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: CALVING */}
      {subTab === 'calving' && (
        <div className="space-y-3">
          {db.calvingEvents.length === 0 ? (
            <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-500">
              No calving events recorded yet.
            </div>
          ) : (
            db.calvingEvents.map((c) => {
              const dam = db.animals.find((a) => a.id === c.damId);
              return (
                <div
                  key={c.id}
                  className="liquid-glass-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="font-mono font-bold text-slate-900">{c.calvingDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.outcome}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900">
                      Dam:{' '}
                      {dam ? (
                        <button
                          type="button"
                          onClick={() => onOpenAnimalProfile(dam)}
                          className="font-mono text-emerald-800 hover:underline"
                        >
                          {dam.currentTag} ({dam.name})
                        </button>
                      ) : (
                        c.damId
                      )}
                    </p>
                    <p className="text-slate-600">{c.notes}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {c.calfIds.map((cid, idx) => {
                      const calfObj = db.animals.find((a) => a.id === cid);
                      return (
                        <button
                          key={cid}
                          type="button"
                          onClick={() => calfObj && onOpenAnimalProfile(calfObj)}
                          className="px-3.5 py-2 font-mono font-semibold text-emerald-800 liquid-glass-btn-secondary rounded-lg inline-flex items-center gap-1.5"
                        >
                          Calf: {c.calfTags[idx] || cid}
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBTAB 3: GROWTH & WEIGHTS */}
      {subTab === 'growth' && (
        <div className="space-y-4">
          {calvesAndYoungstock.length === 0 ? (
            <div className="liquid-glass-panel rounded-xl p-8 text-center text-xs text-slate-500">
              No weight measurements recorded yet.
            </div>
          ) : (
            calvesAndYoungstock.map((animal) => {
              const history = calculateWeightHistoryWithADG(
                db.weightRecords.filter((w) => w.animalId === animal.id)
              );
              if (history.length === 0) return null;
              const latest = history[history.length - 1];

              return (
                <div
                  key={animal.id}
                  className="liquid-glass-panel rounded-xl p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => onOpenAnimalProfile(animal)}
                      className="font-mono font-bold text-sm text-emerald-800 hover:underline inline-flex items-center gap-1"
                    >
                      {animal.currentTag} — {animal.name} ({animal.type})
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-6 text-xs font-mono">
                      <div>
                        <span className="text-slate-500 font-sans mr-1.5">Weight:</span>
                        <strong className="text-slate-900">{latest.weightKg.toFixed(1)} kg</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-sans mr-1.5">Daily Gain (ADG):</span>
                        <strong className="text-emerald-800">
                          {latest.adgKgPerDay !== null
                            ? `${latest.adgKgPerDay >= 0 ? '+' : ''}${latest.adgKgPerDay.toFixed(3)} kg/d`
                            : 'Baseline'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border-t border-slate-200 pt-2">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-1.5 pr-3 font-medium">Date</th>
                          <th className="py-1.5 px-3 font-medium">Stage</th>
                          <th className="py-1.5 px-3 font-medium text-right">Weight</th>
                          <th className="py-1.5 px-3 font-medium text-right">ADG</th>
                          <th className="py-1.5 pl-3 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {history.map((w) => (
                          <tr key={w.id}>
                            <td className="py-2 pr-3 font-mono">{w.measurementDate}</td>
                            <td className="py-2 px-3 font-medium text-slate-900">{w.stage}</td>
                            <td className="py-2 px-3 font-mono font-semibold text-right">
                              {w.weightKg.toFixed(1)} kg
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-right text-emerald-800">
                              {w.adgKgPerDay !== null
                                ? `${w.adgKgPerDay >= 0 ? '+' : ''}${w.adgKgPerDay.toFixed(3)} kg/d`
                                : 'Baseline'}
                            </td>
                            <td className="py-2 pl-3 text-slate-600">{w.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
