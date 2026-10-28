import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  Animal,
  AnimalIdentifier,
  ExpenseAllocation,
  HealthEpisode,
  Treatment,
  WeightWithADG,
} from '../../types/mais';
import { AnimalCostBreakdown } from '../../domain/farmRules';

interface ProfileOverviewTabProps {
  animal: Animal;
  costBreakdown: AnimalCostBreakdown;
  latestWeight?: WeightWithADG;
  healthEpisodes: HealthEpisode[];
  treatments: Treatment[];
  feedAllocations: ExpenseAllocation[];
  identifiers: AnimalIdentifier[];
  offspring: Animal[];
  onSelectAnimalById: (animalId: string) => void;
}

export const ProfileOverviewTab: React.FC<ProfileOverviewTabProps> = ({
  animal,
  costBreakdown,
  latestWeight,
  healthEpisodes,
  treatments,
  feedAllocations,
  identifiers,
  offspring,
  onSelectAnimalById,
}) => {
  return (
    <div className="space-y-5">
      {/* Top Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border border-slate-200/80 rounded-xl p-4 bg-white/80">
        <div>
          <p className="text-xs text-slate-500">Latest Weight</p>
          <p className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
            {latestWeight ? `${latestWeight.weightKg.toFixed(1)} kg` : 'Not measured'}
          </p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            {latestWeight?.adgKgPerDay !== null && latestWeight?.adgKgPerDay !== undefined
              ? `ADG: ${latestWeight.adgKgPerDay >= 0 ? '+' : ''}${latestWeight.adgKgPerDay} kg/day`
              : latestWeight
              ? `Measured ${latestWeight.measurementDate}`
              : 'No baseline'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Health &amp; Treatments</p>
          <p className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
            {healthEpisodes.length} cases · {treatments.length} visits
          </p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Vet Cost: NGN {costBreakdown.directTreatmentCostNgn.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Allocated Feed Cost</p>
          <p className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
            NGN {costBreakdown.allocatedFeedCostNgn.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {feedAllocations.length} ration allocations
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Lifetime Total Cost</p>
          <p className="text-lg font-bold text-emerald-800 font-mono tabular-nums mt-0.5">
            NGN {costBreakdown.totalLifetimeCostNgn.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Purchase + Direct + Shared
          </p>
        </div>
      </div>

      {/* Biodata & Identifier Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="border border-slate-200/80 rounded-xl p-5 bg-white/80 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Biodata &amp; Registration</h3>
          <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
            <div>
              <dt className="text-slate-500">Permanent ID</dt>
              <dd className="font-mono font-semibold text-slate-900 mt-0.5">{animal.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Current Tag</dt>
              <dd className="font-mono font-semibold text-emerald-800 mt-0.5">
                {animal.currentTag}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Date of Birth</dt>
              <dd className="font-mono text-slate-900 mt-0.5">{animal.dateOfBirth}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Acquisition</dt>
              <dd className="text-slate-900 mt-0.5">
                {animal.acquisitionType} ({animal.acquisitionDate})
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Source / Breeder</dt>
              <dd className="text-slate-900 mt-0.5">{animal.sourceDetails || 'MAIS LTD'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Purchase Price</dt>
              <dd className="font-mono text-slate-900 mt-0.5">
                {animal.purchasePrice !== null
                  ? `NGN ${animal.purchasePrice.toLocaleString()}`
                  : 'Born on Farm'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Dam (Mother)</dt>
              <dd className="font-mono text-slate-900 mt-0.5">
                {animal.damId ? (
                  <button
                    type="button"
                    onClick={() => onSelectAnimalById(animal.damId!)}
                    className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    {animal.damTag || animal.damId}
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                ) : (
                  animal.damTag || 'Not recorded'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Sire / Semen ID</dt>
              <dd className="font-mono text-slate-900 mt-0.5">
                {animal.sireId || 'Not recorded'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Markings &amp; Characteristics</dt>
              <dd className="text-slate-900 mt-0.5">
                {animal.identifyingCharacteristics || 'Standard breed markings'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Notes</dt>
              <dd className="text-slate-700 mt-0.5">{animal.notes || 'None'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Registered By</dt>
              <dd className="text-slate-900 mt-0.5">{animal.registeredBy}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Registration Date</dt>
              <dd className="font-mono text-slate-900 mt-0.5">{animal.registeredAt}</dd>
            </div>
          </dl>
        </div>

        {/* Tag Identifier History & Offspring */}
        <div className="space-y-5">
          <div className="border border-slate-200/80 rounded-xl p-5 bg-white/80">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Tag History (Current &amp; Retired)
            </h3>
            <div className="divide-y divide-slate-200 text-xs">
              {identifiers.map((ident) => (
                <div key={ident.id} className="py-2.5 flex items-start justify-between gap-4">
                  <div>
                    <span className="font-mono font-bold text-slate-900">
                      {ident.tagNumber}
                    </span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span
                      className={
                        ident.isCurrent
                          ? 'text-emerald-700 font-semibold'
                          : 'text-amber-700 font-medium'
                      }
                    >
                      {ident.isCurrent ? 'Active Tag' : 'Retired Historical Tag'}
                    </span>
                    {ident.retiredReason && (
                      <p className="text-slate-500 mt-0.5">
                        Retired ({ident.retiredAt}): {ident.retiredReason}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-slate-500 shrink-0">
                    Assigned {ident.assignedAt}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-slate-200/80 rounded-xl p-5 bg-white/80">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Offspring / Calves ({offspring.length})
            </h3>
            {offspring.length === 0 ? (
              <p className="text-xs text-slate-500">
                No calves linked to {animal.currentTag} yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 text-xs">
                {offspring.map((calf) => (
                  <div
                    key={calf.id}
                    className="py-2.5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => onSelectAnimalById(calf.id)}
                        className="font-mono font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
                      >
                        {calf.currentTag} ({calf.name})
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                      <span className="mx-2 text-slate-400">·</span>
                      <span className="text-slate-600">
                        {calf.sex} · Born {calf.dateOfBirth} · Sire: {calf.sireId}
                      </span>
                    </div>
                    <span className="font-mono text-slate-500">{calf.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
