import React, { useState } from 'react';
import {
  Search,
  Plus,
  ArrowUpRight,
  Tag,
  Download,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  AnimalCostBreakdown,
  canPerformAction,
  normalizeTag,
  resolveAnimalByTag,
} from '../domain/farmRules';
import { downloadCsvFile } from '../utils/csvExport';

interface AnimalsViewProps {
  db: MaisDatabaseState;
  animalCosts: Record<string, AnimalCostBreakdown>;
  currentUser: StaffUser;
  onOpenAnimalProfile: (animal: Animal, matchedHistoricalTag?: string | null) => void;
  onOpenRegisterModal: () => void;
}

export const AnimalsView: React.FC<AnimalsViewProps> = ({
  db,
  animalCosts,
  currentUser,
  onOpenAnimalProfile,
  onOpenRegisterModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');

  const canCreate = canPerformAction(currentUser.role, 'CREATE_ANIMALS');

  const herdGroups = Array.from(new Set(db.animals.map((a) => a.herdGroup))).filter(Boolean);
  const animalTypes = Array.from(new Set(db.animals.map((a) => a.type))).filter(Boolean);
  const animalStatuses = Array.from(
    new Set(['Active', 'Sold', 'Transferred', 'Deceased', 'Missing', 'Culled', ...db.animals.map((a) => a.status)])
  ).filter(Boolean);

  const filteredAnimals = db.animals.filter((animal) => {
    if (statusFilter !== 'ALL' && animal.status !== statusFilter) return false;
    if (typeFilter !== 'ALL' && animal.type !== typeFilter) return false;
    if (groupFilter !== 'ALL' && animal.herdGroup !== groupFilter) return false;

    if (searchQuery.trim()) {
      const qNorm = normalizeTag(searchQuery);
      const qLower = searchQuery.toLowerCase();
      const identMatches = db.animalIdentifiers.some(
        (ident) =>
          ident.animalId === animal.id && ident.normalizedTag.includes(qNorm)
      );
      const textMatches =
        animal.name.toLowerCase().includes(qLower) ||
        animal.id.toLowerCase().includes(qLower) ||
        animal.breed.toLowerCase().includes(qLower);

      if (!identMatches && !textMatches) return false;
    }

    return true;
  });

  const handleDirectTagResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const match = resolveAnimalByTag(searchQuery, db.animals, db.animalIdentifiers);
    if (match) {
      onOpenAnimalProfile(
        match.animal,
        match.isHistoricalMatch ? match.matchedIdentifier.tagNumber : null
      );
    }
  };

  const handleExportAnimalsCsv = () => {
    const headers = [
      'Animal ID',
      'Current Tag',
      'Previous Tags',
      'Name',
      'Type',
      'Sex',
      'Breed',
      'Status',
      'Herd Group',
      'Location',
      'Origin',
      'Date of Birth',
      'Acquisition Date',
      'Latest Weight (kg)',
      'Latest Weight Date',
      'Purchase Cost (NGN)',
      'Direct Treatment Cost (NGN)',
      'Direct Breeding Cost (NGN)',
      'Allocated Feed Cost (NGN)',
      'Total Lifetime Cost (NGN)',
    ];

    const rows = filteredAnimals.map((animal) => {
      const retiredTags = db.animalIdentifiers
        .filter((i) => i.animalId === animal.id && !i.isCurrent)
        .map((i) => i.tagNumber)
        .join('; ');
      const weights = db.weightRecords
        .filter((w) => w.animalId === animal.id)
        .sort((a, b) => b.measurementDate.localeCompare(a.measurementDate));
      const latestWeight = weights[0];
      const cost = animalCosts[animal.id];

      return [
        animal.id,
        animal.currentTag,
        retiredTags,
        animal.name,
        animal.type,
        animal.sex,
        animal.breed,
        animal.status,
        animal.herdGroup,
        animal.location,
        animal.sourceDetails || animal.acquisitionType,
        animal.dateOfBirth || '',
        animal.acquisitionDate,
        latestWeight ? latestWeight.weightKg.toFixed(1) : '',
        latestWeight ? latestWeight.measurementDate : '',
        cost?.purchaseCostNgn ?? animal.purchasePrice ?? 0,
        cost?.directTreatmentCostNgn ?? 0,
        cost?.directBreedingCostNgn ?? 0,
        cost?.allocatedFeedCostNgn ?? 0,
        cost?.totalLifetimeCostNgn ?? 0,
      ];
    });

    downloadCsvFile('mais_animals_export', headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Animals ({filteredAnimals.length})
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAnimalsCsv}
            className="liquid-glass-btn-secondary px-3.5 py-2 text-xs font-semibold text-slate-700 rounded-lg inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={onOpenRegisterModal}
              className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Animal
            </button>
          )}
        </div>
      </div>

      {/* Filter & Tag Search Bar */}
      <div className="liquid-glass-panel rounded-xl p-4 flex flex-wrap items-center gap-3">
        <form onSubmit={handleDirectTagResolve} className="flex-1 min-w-[260px] flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search animals"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tag, name, or breed..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            Search
          </button>
        </form>

        <select
          aria-label="Filter by animal status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700"
        >
          <option value="ALL">All Statuses ({db.animals.length})</option>
          {animalStatuses.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by animal type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700"
        >
          <option value="ALL">All Types</option>
          {animalTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by herd group"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-700"
        >
          <option value="ALL">All Groups</option>
          {herdGroups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      {/* Registry Table */}
      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        {filteredAnimals.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
              <Tag className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-slate-900">No Animals Found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {db.animals.length === 0
                ? 'No animals registered yet.'
                : 'No animals match your search.'}
            </p>
            {db.animals.length === 0 && canCreate && (
              <button
                type="button"
                onClick={onOpenRegisterModal}
                className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Animal
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4 font-semibold">Tag & ID</th>
                  <th className="py-3 px-4 font-semibold">Animal</th>
                  <th className="py-3 px-4 font-semibold">Group & Barn</th>
                  <th className="py-3 px-4 font-semibold">Weight</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Lifetime Cost</th>
                  <th className="py-3 px-4 font-semibold text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredAnimals.map((animal) => {
                  const retiredTags = db.animalIdentifiers.filter(
                    (i) => i.animalId === animal.id && !i.isCurrent
                  );
                  const weights = db.weightRecords
                    .filter((w) => w.animalId === animal.id)
                    .sort((a, b) => b.measurementDate.localeCompare(a.measurementDate));
                  const latestWeight = weights[0];
                  const cost = animalCosts[animal.id];

                  return (
                    <tr
                      key={animal.id}
                      onClick={() => onOpenAnimalProfile(animal)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900 text-sm">
                          {animal.currentTag}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{animal.id}</div>
                        {retiredTags.length > 0 && (
                          <div className="font-mono text-[11px] text-amber-800 mt-0.5">
                            Old: {retiredTags.map((t) => t.tagNumber).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{animal.name}</div>
                        <div className="text-slate-500">
                          {animal.type} · {animal.sex} · {animal.breed}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-900">{animal.herdGroup}</div>
                        <div className="text-slate-500">{animal.location}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {latestWeight ? (
                          <span className="font-semibold text-slate-900">
                            {latestWeight.weightKg.toFixed(1)} kg
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-semibold ${
                            animal.status === 'Active'
                              ? 'text-emerald-700'
                              : animal.status === 'Sold' || animal.status === 'Transferred'
                              ? 'text-amber-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {animal.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        NGN {(cost?.totalLifetimeCostNgn || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAnimalProfile(animal);
                          }}
                          className="liquid-glass-btn-secondary px-3 py-1.5 text-xs font-semibold text-emerald-900 rounded-lg inline-flex items-center gap-1"
                        >
                          Open
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
