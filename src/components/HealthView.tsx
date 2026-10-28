import React, { useState, useMemo } from 'react';
import {
  Plus,
  ShieldAlert,
  ArrowUpRight,
  Stethoscope,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  canPerformAction,
  HealthAnalyticsRankings,
} from '../domain/farmRules';
import { SelectWithCustom } from './SelectWithCustom';

interface HealthViewProps {
  db: MaisDatabaseState;
  healthRankings: HealthAnalyticsRankings;
  currentUser: StaffUser;
  onOpenAnimalProfile: (animal: Animal) => void;
  onOpenTreatmentModal: (preselectedAnimalId?: string) => void;
  onRecordVaccination: (animalId: string, payload: any) => Promise<void>;
}

export const HealthView: React.FC<HealthViewProps> = ({
  db,
  healthRankings,
  currentUser,
  onOpenAnimalProfile,
  onOpenTreatmentModal,
  onRecordVaccination,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [subTab, setSubTab] = useState<'episodes' | 'rankings' | 'preventive'>('episodes');
  const [vacAnimalId, setVacAnimalId] = useState(db.animals[0]?.id || '');
  const [vacProtocol, setVacProtocol] = useState('Vaccination');
  const [vacProduct, setVacProduct] = useState('');
  const [vacDosage, setVacDosage] = useState('');
  const [vacNextDue, setVacNextDue] = useState(todayStr);
  const [vacCost, setVacCost] = useState('');
  const [submittingVac, setSubmittingVac] = useState(false);

  const canWrite = canPerformAction(currentUser.role, 'RECORD_TREATMENTS');

  const animalsUnderWithdrawal = useMemo(() => {
    const today = new Date();
    const set = new Set<string>();
    for (const t of db.treatments) {
      if ((t.withdrawalMilkDays > 0 || t.withdrawalMeatDays > 0) && t.treatmentDate) {
        const trDate = new Date(t.treatmentDate);
        const maxDays = Math.max(t.withdrawalMilkDays || 0, t.withdrawalMeatDays || 0);
        const diffDays = Math.floor((today.getTime() - trDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < maxDays) set.add(t.animalId);
      }
    }
    return Array.from(set);
  }, [db.treatments]);

  const handleVacSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacAnimalId || !vacProduct.trim()) return;
    setSubmittingVac(true);
    try {
      await onRecordVaccination(vacAnimalId, {
        dateAdministered: todayStr,
        protocolType: vacProtocol,
        vaccineOrProduct: vacProduct.trim(),
        dosage: vacDosage.trim() || 'Standard dose',
        nextDueDate: vacNextDue,
        costNgn: Number(vacCost || 0),
        veterinarian: currentUser.fullName,
      });
      setVacProduct('');
      setVacDosage('');
      setVacCost('');
    } finally {
      setSubmittingVac(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Health & Veterinary</h1>

          {animalsUnderWithdrawal.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
              {animalsUnderWithdrawal.length} Active Withdrawal Hold
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setSubTab('episodes')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'episodes' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Cases ({db.healthEpisodes.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('rankings')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'rankings' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Rankings
            </button>
            <button
              type="button"
              onClick={() => setSubTab('preventive')}
              className={`px-3 py-1.5 font-medium rounded-lg ${
                subTab === 'preventive' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Vaccinations ({db.vaccinations.length})
            </button>
          </div>

          {canWrite && (
            <button
              type="button"
              onClick={() => onOpenTreatmentModal()}
              className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Record Treatment
            </button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: HEALTH EPISODES & TREATMENTS */}
      {subTab === 'episodes' && (
        <div className="space-y-4">
          {db.healthEpisodes.length === 0 ? (
            <div className="liquid-glass-panel rounded-xl p-10 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <Stethoscope className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-900">No Health Cases</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No health cases or treatments recorded yet.
              </p>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => onOpenTreatmentModal()}
                  className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add Treatment
                </button>
              )}
            </div>
          ) : (
            db.healthEpisodes.map((ep) => {
              const animal = db.animals.find((a) => a.id === ep.animalId);
              const epTreatments = db.treatments.filter((t) => t.episodeId === ep.id);
              const totalEpCost = epTreatments.reduce((s, t) => s + t.totalCost, 0);

              return (
                <div
                  key={ep.id}
                  className="liquid-glass-panel rounded-xl p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {animal && (
                          <button
                            type="button"
                            onClick={() => onOpenAnimalProfile(animal)}
                            className="font-mono font-bold text-emerald-800 hover:underline inline-flex items-center gap-1"
                          >
                            {animal.currentTag} ({animal.name})
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{ep.reportedDate}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            ep.severity === 'High' || ep.severity === 'Critical'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {ep.severity} Severity
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">{ep.status}</span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mt-1">
                        {ep.diagnosis}{' '}
                        <span className="font-normal text-slate-500 text-xs">
                          ({ep.diagnosisCategory})
                        </span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {ep.symptoms} · Vet: {ep.veterinarian}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                        NGN {totalEpCost.toLocaleString()}
                      </p>
                      {canWrite && animal && (
                        <button
                          type="button"
                          onClick={() => onOpenTreatmentModal(animal.id)}
                          className="mt-1.5 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-300 rounded-lg hover:bg-emerald-50"
                        >
                          + Follow-up
                        </button>
                      )}
                    </div>
                  </div>

                  {epTreatments.length > 0 && (
                    <div className="overflow-x-auto border-t border-slate-200 pt-3">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-1.5 pr-3 font-medium">Date</th>
                            <th className="py-1.5 px-3 font-medium">Medicine & Dosage</th>
                            <th className="py-1.5 px-3 font-medium">Withdrawal</th>
                            <th className="py-1.5 px-3 font-medium">Follow-up</th>
                            <th className="py-1.5 px-3 font-medium">Outcome</th>
                            <th className="py-1.5 pl-3 font-medium text-right">Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {epTreatments.map((t) => (
                            <tr key={t.id}>
                              <td className="py-2 pr-3 font-mono">{t.treatmentDate}</td>
                              <td className="py-2 px-3">
                                <span className="font-semibold text-slate-900">{t.medicine}</span>
                                <span className="block text-slate-500">
                                  {t.dosage} · {t.route}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-mono">
                                Milk: {t.withdrawalMilkDays}d · Meat: {t.withdrawalMeatDays}d
                              </td>
                              <td className="py-2 px-3 font-mono">{t.followUpDate || '—'}</td>
                              <td className="py-2 px-3">{t.outcome}</td>
                              <td className="py-2 pl-3 font-mono font-semibold text-right">
                                NGN {t.totalCost.toLocaleString()}
                              </td>
                            </tr>
                          ))}
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

      {/* SUBTAB 2: SICKEST / MOST TREATED RANKINGS */}
      {subTab === 'rankings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="liquid-glass-panel rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Most Treated Animals
              </h3>
            </div>
            {healthRankings.mostTreatmentEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No treatment history available yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4 font-medium">Animal</th>
                    <th className="py-2.5 px-4 font-medium text-right">Details</th>
                    <th className="py-2.5 px-4 font-medium text-right">Treatments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {healthRankings.mostTreatmentEvents.map((row) => {
                    const anm = db.animals.find((a) => a.id === row.animalId);
                    return (
                      <tr key={row.animalId} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => anm && onOpenAnimalProfile(anm)}
                            className="font-mono font-bold text-emerald-800 hover:underline"
                          >
                            {row.currentTag}
                          </button>
                          <span className="block text-slate-600">{row.animalName}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-right">{row.supportingDetails}</td>
                        <td className="py-3 px-4 font-mono font-bold text-right text-emerald-800">
                          {row.metricValue}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="liquid-glass-panel rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                Costliest Health Cases
              </h3>
            </div>
            {healthRankings.highestTreatmentExpenditure.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No veterinary expenses recorded yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4 font-medium">Animal</th>
                    <th className="py-2.5 px-4 font-medium">Summary</th>
                    <th className="py-2.5 px-4 font-medium text-right">Total Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {healthRankings.highestTreatmentExpenditure.map((row) => {
                    const anm = db.animals.find((a) => a.id === row.animalId);
                    return (
                      <tr key={row.animalId} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => anm && onOpenAnimalProfile(anm)}
                            className="font-mono font-bold text-emerald-800 hover:underline"
                          >
                            {row.currentTag} ({row.animalName})
                          </button>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{row.supportingDetails}</td>
                        <td className="py-3 px-4 font-mono font-bold text-right text-slate-900">
                          NGN {row.metricValue.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: PREVENTIVE CARE & VACCINATION SCHEDULE */}
      {subTab === 'preventive' && (
        <div className="space-y-5">
          {canWrite && db.animals.length > 0 && (
            <form
              onSubmit={handleVacSubmit}
              className="liquid-glass-panel rounded-xl p-5 space-y-3 text-xs"
            >
              <h3 className="text-sm font-bold text-slate-900">
                Log Vaccination / Deworming Protocol
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-start">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Animal</label>
                  <select
                    value={vacAnimalId || db.animals[0]?.id}
                    onChange={(e) => setVacAnimalId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                  >
                    {db.animals.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.currentTag} — {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <SelectWithCustom
                  label="Protocol Type"
                  value={vacProtocol}
                  onChange={(v) => setVacProtocol(v)}
                  options={['Vaccination', 'Deworming', 'Routine Check', 'Hoof Care']}
                  placeholder="Type custom protocol..."
                />

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Product / Vaccine *
                  </label>
                  <input
                    type="text"
                    required
                    value={vacProduct}
                    onChange={(e) => setVacProduct(e.target.value)}
                    placeholder="Vaccine or product name"
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Next Due Date</label>
                  <input
                    type="date"
                    value={vacNextDue}
                    onChange={(e) => setVacNextDue(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Cost (NGN)</label>
                  <input
                    type="number"
                    min="0"
                    value={vacCost}
                    onChange={(e) => setVacCost(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={submittingVac}
                    className="w-full px-3 py-2 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                  >
                    {submittingVac ? 'Saving...' : 'Save Protocol'}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="liquid-glass-panel rounded-xl overflow-hidden">
            {db.vaccinations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No vaccination or deworming records logged yet.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Animal</th>
                    <th className="py-3 px-4 font-semibold">Protocol</th>
                    <th className="py-3 px-4 font-semibold">Product</th>
                    <th className="py-3 px-4 font-semibold">Next Due Date</th>
                    <th className="py-3 px-4 font-semibold text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {db.vaccinations.map((v) => {
                    const anm = db.animals.find((a) => a.id === v.animalId);
                    return (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono">{v.dateAdministered}</td>
                        <td className="py-3 px-4">
                          {anm ? (
                            <button
                              type="button"
                              onClick={() => onOpenAnimalProfile(anm)}
                              className="font-mono font-bold text-emerald-800 hover:underline"
                            >
                              {anm.currentTag} ({anm.name})
                            </button>
                          ) : (
                            v.animalId
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">{v.protocolType}</td>
                        <td className="py-3 px-4">
                          {v.vaccineOrProduct} ({v.dosage})
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-amber-800">
                          {v.nextDueDate}
                        </td>
                        <td className="py-3 px-4 font-mono text-right">
                          NGN {v.costNgn.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
