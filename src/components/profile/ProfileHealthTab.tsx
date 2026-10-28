import React from 'react';
import { Plus } from 'lucide-react';
import {
  Animal,
  HealthEpisode,
  Treatment,
  VaccinationRecord,
} from '../../types/mais';

interface ProfileHealthTabProps {
  animal: Animal;
  healthEpisodes: HealthEpisode[];
  treatments: Treatment[];
  vaccinations: VaccinationRecord[];
  canEdit: boolean;
  onOpenQuickAction: (
    actionType: 'treatment' | 'feed' | 'weight' | 'breeding' | 'expense',
    preselectedAnimalId: string
  ) => void;
}

export const ProfileHealthTab: React.FC<ProfileHealthTabProps> = ({
  animal,
  healthEpisodes,
  treatments,
  vaccinations,
  canEdit,
  onOpenQuickAction,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          Health Cases ({healthEpisodes.length}) &amp; Treatments ({treatments.length})
        </h3>
        {canEdit && (
          <button
            type="button"
            onClick={() => onOpenQuickAction('treatment', animal.id)}
            className="liquid-glass-btn-primary px-3 py-1.5 text-xs font-medium rounded-xl inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Treatment
          </button>
        )}
      </div>

      {healthEpisodes.length === 0 ? (
        <div className="border border-slate-200/80 rounded-xl p-6 bg-white/80 text-center text-xs text-slate-500">
          No illness cases reported for {animal.currentTag}.
        </div>
      ) : (
        <div className="space-y-4">
          {healthEpisodes.map((ep) => {
            const epTreatments = treatments.filter((t) => t.episodeId === ep.id);
            return (
              <div
                key={ep.id}
                className="border border-slate-200/80 rounded-xl p-4 bg-white/80 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-900">
                        {ep.reportedDate}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-900">
                        Severity: {ep.severity}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Status: {ep.status}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">
                      {ep.diagnosis}
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Symptoms: {ep.symptoms} · Vet: {ep.veterinarian}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-slate-500">{ep.id}</span>
                </div>

                {epTreatments.length > 0 && (
                  <div className="overflow-x-auto border-t border-slate-200 pt-3">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-1.5 pr-3 font-medium">Date</th>
                          <th className="py-1.5 px-3 font-medium">Medicine &amp; Dosage</th>
                          <th className="py-1.5 px-3 font-medium">Withdrawal</th>
                          <th className="py-1.5 px-3 font-medium">Follow-up</th>
                          <th className="py-1.5 px-3 font-medium">Outcome</th>
                          <th className="py-1.5 pl-3 font-medium text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {epTreatments.map((tr) => (
                          <tr key={tr.id}>
                            <td className="py-2 pr-3 font-mono">{tr.treatmentDate}</td>
                            <td className="py-2 px-3">
                              <div className="font-medium text-slate-900">{tr.medicine}</div>
                              <div className="text-slate-500">
                                {tr.dosage} · {tr.route}
                              </div>
                            </td>
                            <td className="py-2 px-3 font-mono">
                              Milk: {tr.withdrawalMilkDays}d · Meat: {tr.withdrawalMeatDays}d
                            </td>
                            <td className="py-2 px-3 font-mono">
                              {tr.followUpDate || 'None'}
                            </td>
                            <td className="py-2 px-3">{tr.outcome}</td>
                            <td className="py-2 pl-3 font-mono text-right font-semibold">
                              NGN {tr.totalCost.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preventive Care / Vaccinations */}
      <div className="border border-slate-200/80 rounded-xl p-4 bg-white/80">
        <h4 className="text-sm font-bold text-slate-900 mb-3">
          Vaccinations &amp; Preventive Care ({vaccinations.length})
        </h4>
        {vaccinations.length === 0 ? (
          <p className="text-xs text-slate-500">No vaccinations logged yet.</p>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Protocol</th>
                <th className="py-2 px-3 font-medium">Product &amp; Batch</th>
                <th className="py-2 px-3 font-medium">Dosage</th>
                <th className="py-2 px-3 font-medium">Next Due</th>
                <th className="py-2 pl-3 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vaccinations.map((v) => (
                <tr key={v.id}>
                  <td className="py-2 pr-3 font-mono">{v.dateAdministered}</td>
                  <td className="py-2 px-3 font-medium text-slate-900">{v.protocolType}</td>
                  <td className="py-2 px-3">
                    {v.vaccineOrProduct}{' '}
                    <span className="font-mono text-slate-500">({v.batchNumber})</span>
                  </td>
                  <td className="py-2 px-3">{v.dosage}</td>
                  <td className="py-2 px-3 font-mono">{v.nextDueDate}</td>
                  <td className="py-2 pl-3 font-mono text-right">
                    NGN {v.costNgn.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
