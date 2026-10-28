import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Stethoscope,
  Wheat,
  Scale,
  HeartHandshake,
  Receipt,
  CheckCircle2,
  ArrowUpRight,
  Tag,
  CalendarClock,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  addDaysToIsoDate,
  calculateFarmFinancialSummary,
  canPerformAction,
  collectUpcomingScheduleItems,
  ProductStockSummary,
  resolveAnimalByTag,
} from '../domain/farmRules';
import { QuickActionModalType } from './QuickActionModals';

interface DashboardViewProps {
  db: MaisDatabaseState;
  productStocks: ProductStockSummary[];
  currentUser: StaffUser;
  onOpenAnimalProfile: (animal: Animal, matchedHistoricalTag?: string | null) => void;
  onOpenQuickAction: (modalType: QuickActionModalType, preselectedAnimalId?: string) => void;
  onNavigateSection: (sectionId: string) => void;
  onCompleteTask: (taskId: string) => Promise<void>;
}

type ExpensePeriodPreset = 'today' | 'week' | 'month' | 'all';

export const DashboardView: React.FC<DashboardViewProps> = ({
  db,
  productStocks,
  currentUser,
  onOpenAnimalProfile,
  onOpenQuickAction,
  onNavigateSection,
  onCompleteTask,
}) => {
  const [tagSearchInput, setTagSearchInput] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [expensePeriod, setExpensePeriod] = useState<ExpensePeriodPreset>('month');

  const canWrite = canPerformAction(currentUser.role, 'EDIT_ANIMALS');
  const todayStr = new Date().toISOString().slice(0, 10);

  const activeAnimals = db.animals.filter((a) => a.status === 'Active');
  const activeCalves = activeAnimals.filter((a) => a.type === 'Calf');
  const openHealthEpisodes = db.healthEpisodes.filter((h) => h.status !== 'Resolved');
  const lowStockItems = productStocks.filter((s) => s.isLowStock);

  const periodRange = useMemo(() => {
    if (expensePeriod === 'today') {
      return { startDate: todayStr, endDate: todayStr, label: 'Today' };
    }
    if (expensePeriod === 'week') {
      const start = addDaysToIsoDate(todayStr, -6);
      return { startDate: start, endDate: todayStr, label: 'Last 7 Days' };
    }
    if (expensePeriod === 'month') {
      const start = `${todayStr.slice(0, 7)}-01`;
      const end = `${todayStr.slice(0, 7)}-31`;
      return { startDate: start, endDate: end, label: 'This Month' };
    }
    return { startDate: undefined, endDate: undefined, label: 'All Time' };
  }, [expensePeriod, todayStr]);

  const periodFinancialSummary = useMemo(
    () =>
      calculateFarmFinancialSummary(db.expenses, db.payments, db.expenseAllocations, {
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      }),
    [db.expenses, db.payments, db.expenseAllocations, periodRange]
  );

  const periodExpensesCount = useMemo(() => {
    return db.expenses.filter((e) => {
      if (e.isReversed) return false;
      if (periodRange.startDate && e.expenseDate < periodRange.startDate) return false;
      if (periodRange.endDate && e.expenseDate > periodRange.endDate) return false;
      return true;
    }).length;
  }, [db.expenses, periodRange]);

  const upcomingScheduleItems = useMemo(
    () => collectUpcomingScheduleItems(db, todayStr).slice(0, 8),
    [db, todayStr]
  );

  const activeTasks = db.tasks.filter(
    (t) => t.status === 'Pending' || t.status === 'Overdue'
  );

  const recentEvents = [...db.animalEvents]
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
    .slice(0, 8);

  const handleHeroTagSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    if (!tagSearchInput.trim()) return;
    const match = resolveAnimalByTag(tagSearchInput, db.animals, db.animalIdentifiers);
    if (!match) {
      setSearchError(`No animal found for tag "${tagSearchInput.toUpperCase()}".`);
      return;
    }
    onOpenAnimalProfile(
      match.animal,
      match.isHistoricalMatch ? match.matchedIdentifier.tagNumber : null
    );
    setTagSearchInput('');
  };

  return (
    <div className="space-y-6">
      {/* Top Bar: Ear Tag Resolver + Quick Action Buttons */}
      <div className="liquid-glass-panel rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <form onSubmit={handleHeroTagSearch} className="flex-1 max-w-xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search animal by current or historical tag number"
                value={tagSearchInput}
                onChange={(e) => {
                  setTagSearchInput(e.target.value);
                  if (searchError) setSearchError(null);
                }}
                placeholder="Search by ear tag..."
                className="w-full pl-10 pr-4 py-2 text-xs border border-slate-300 rounded-lg font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
            <button
              type="submit"
              className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap"
            >
              Search
            </button>
          </div>
          {searchError && (
            <p className="mt-1.5 text-xs text-red-700 font-medium">{searchError}</p>
          )}
        </form>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenQuickAction('register_animal')}
              className="liquid-glass-btn-primary px-3.5 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Animal</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickAction('treatment')}
              className="liquid-glass-btn-secondary px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
            >
              <Stethoscope className="w-3.5 h-3.5 text-emerald-700" />
              <span>Treatment</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickAction('feed')}
              className="liquid-glass-btn-secondary px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
            >
              <Wheat className="w-3.5 h-3.5 text-emerald-700" />
              <span>Feed</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickAction('weight')}
              className="liquid-glass-btn-secondary px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5 text-emerald-700" />
              <span>Weight</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickAction('breeding')}
              className="liquid-glass-btn-secondary px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
            >
              <HeartHandshake className="w-3.5 h-3.5 text-emerald-700" />
              <span>Breeding</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenQuickAction('expense')}
              className="liquid-glass-btn-secondary px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-700" />
              <span>Expense</span>
            </button>
          </div>
        )}
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Herd */}
        <button
          type="button"
          onClick={() => onNavigateSection('animals')}
          className="liquid-glass-panel rounded-xl p-5 text-left hover:border-emerald-600/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Herd
            </span>
            <span className="font-mono text-xs text-slate-400">
              {db.animals.length} Total
            </span>
          </div>
          <p className="text-3xl font-bold font-mono text-slate-900 tabular-nums mt-2">
            {activeAnimals.length}
          </p>
          <p className="text-xs font-mono text-emerald-800 font-semibold mt-1">
            Active Calves: {activeCalves.length}
          </p>
        </button>

        {/* Open Cases */}
        <button
          type="button"
          onClick={() => onNavigateSection('health')}
          className="liquid-glass-panel rounded-xl p-5 text-left hover:border-emerald-600/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Open Cases
            </span>
            <span className="font-mono text-xs text-slate-400">
              {db.treatments.length} Visits
            </span>
          </div>
          <p className="text-3xl font-bold font-mono text-slate-900 tabular-nums mt-2">
            {openHealthEpisodes.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Animals receiving treatment
          </p>
        </button>

        {/* Low Stock */}
        <button
          type="button"
          onClick={() => onNavigateSection('feed')}
          className="liquid-glass-panel rounded-xl p-5 text-left hover:border-emerald-600/40 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Low Stock
            </span>
            <span className="font-mono text-xs text-slate-400">
              {productStocks.length} Items
            </span>
          </div>
          <p
            className={`text-3xl font-bold font-mono tabular-nums mt-2 ${
              lowStockItems.length > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {lowStockItems.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {lowStockItems.length > 0
              ? `Reorder alert: ${lowStockItems.map((i) => i.productName).join(', ')}`
              : 'All feed stocks above reorder level'}
          </p>
        </button>

        {/* Farm Expenses */}
        <div className="liquid-glass-panel rounded-xl p-5 text-left flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onNavigateSection('expenses')}
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-emerald-800"
              >
                Farm Expenses ({periodRange.label})
              </button>
              <span className="font-mono text-xs text-slate-400">
                {periodExpensesCount} Entries
              </span>
            </div>
            <p className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-2">
              NGN {periodFinancialSummary.totalExpenditureNgn.toLocaleString()}
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center gap-1 text-[11px]">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Week' },
                { id: 'month', label: 'Month' },
                { id: 'all', label: 'All Time' },
              ] as { id: ExpensePeriodPreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setExpensePeriod(p.id)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  expensePeriod === p.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Clean, Simple Empty State when 0 animals are registered */}
      {db.animals.length === 0 && (
        <div className="liquid-glass-panel rounded-xl p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <Tag className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">
            No Animals Registered
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Add your first animal or receive feed stock to get started.
          </p>
          {canWrite && (
            <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenQuickAction('register_animal')}
                className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Animal
              </button>
              <button
                type="button"
                onClick={() => onOpenQuickAction('feed')}
                className="liquid-glass-btn-secondary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <Wheat className="w-4 h-4 text-emerald-700" />
                Add Feed
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upcoming Vaccinations, Pregnancy Checks & Calving Dates Schedule Panel */}
      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Upcoming Vaccinations, Breeding Checks & Calving Schedule ({upcomingScheduleItems.length})
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => onNavigateSection('health')}
              className="font-semibold text-emerald-800 hover:underline"
            >
              Health & Protocols
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => onNavigateSection('breeding')}
              className="font-semibold text-emerald-800 hover:underline"
            >
              Breeding & Calving
            </button>
          </div>
        </div>

        {upcomingScheduleItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No upcoming vaccinations, pregnancy checks, or expected calvings scheduled.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 text-xs">
            {upcomingScheduleItems.slice(0, 4).map((item) => {
              const linkedAnimal = db.animals.find((a) => a.id === item.animalId);
              return (
                <div key={item.id} className="p-4 space-y-1.5 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono font-semibold ${
                        item.isOverdue ? 'text-red-700' : 'text-emerald-800'
                      }`}
                    >
                      {item.isOverdue ? `Overdue · ${item.dueDate}` : `Due ${item.dueDate}`}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">{item.category}</span>
                  </div>
                  <p className="font-semibold text-slate-900 truncate">{item.title}</p>
                  <p className="text-slate-500 truncate">{item.subtitle}</p>
                  {linkedAnimal && (
                    <button
                      type="button"
                      onClick={() => onOpenAnimalProfile(linkedAnimal)}
                      className="font-mono font-bold text-emerald-800 hover:underline inline-flex items-center gap-0.5 pt-0.5"
                    >
                      {linkedAnimal.currentTag} ({linkedAnimal.name})
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2-Column Operational Workspace: Tasks & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 6 cols: Actionable Tasks */}
        <div className="lg:col-span-6 liquid-glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <h2 className="text-sm font-bold text-slate-900">
              Pending Tasks ({activeTasks.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection('tasks')}
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              Manage Tasks
            </button>
          </div>

          <div className="divide-y divide-slate-200 flex-1">
            {activeTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No pending or overdue tasks scheduled.
              </div>
            ) : (
              activeTasks.slice(0, 6).map((task) => {
                const isOverdue =
                  task.status === 'Overdue' || task.dueDate < todayStr;
                const linkedAnimal = task.animalId
                  ? db.animals.find((a) => a.id === task.animalId)
                  : null;

                return (
                  <div
                    key={task.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-mono font-semibold ${
                            isOverdue ? 'text-red-700' : 'text-slate-600'
                          }`}
                        >
                          {isOverdue ? `Overdue · ${task.dueDate}` : `Due ${task.dueDate}`}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">{task.category}</span>
                        {linkedAnimal && (
                          <>
                            <span className="text-slate-300">·</span>
                            <button
                              type="button"
                              onClick={() => onOpenAnimalProfile(linkedAnimal)}
                              className="font-mono font-bold text-emerald-800 hover:underline"
                            >
                              {linkedAnimal.currentTag}
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-slate-900 mt-1 truncate">
                        {task.title}
                      </p>
                    </div>

                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => onCompleteTask(task.id)}
                        className="liquid-glass-btn-secondary px-2.5 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1 shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Done
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 6 cols: Recent Activity Stream */}
        <div className="lg:col-span-6 liquid-glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <h2 className="text-sm font-bold text-slate-900">Recent Farm Activity</h2>
            <button
              type="button"
              onClick={() => onNavigateSection('animals')}
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              Herd Registry
            </button>
          </div>

          <div className="divide-y divide-slate-200 flex-1">
            {recentEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No activity events logged yet.
              </div>
            ) : (
              recentEvents.map((evt) => {
                const animal = db.animals.find((a) => a.id === evt.animalId);
                return (
                  <div
                    key={evt.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500">{evt.eventDate}</span>
                        {animal && (
                          <button
                            type="button"
                            onClick={() => onOpenAnimalProfile(animal)}
                            className="font-mono font-bold text-emerald-800 hover:underline inline-flex items-center gap-0.5"
                          >
                            {animal.currentTag}
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="font-medium text-slate-900 mt-0.5 truncate">{evt.title}</p>
                    </div>
                    {evt.costNgn !== null && evt.costNgn > 0 && (
                      <span className="font-mono font-semibold text-slate-800 tabular-nums shrink-0">
                        NGN {evt.costNgn.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
