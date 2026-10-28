import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Tag,
  Stethoscope,
  Wheat,
  HeartHandshake,
  Receipt,
  FileBarChart,
  BellRing,
  Users,
  Search,
  Menu,
  X,
  AlertCircle,
  CheckCircle2,
  LogOut,
} from 'lucide-react';
import {
  AnimalStatus,
  MaisDatabaseState,
  StaffUser,
} from './types/mais';
import {
  AnimalCostBreakdown,
  calculateAnimalTotalCosts,
  calculateFarmFinancialSummary,
  calculateFeedProductStock,
  computeHealthRankings,
  FarmFinancialSummary,
  HealthAnalyticsRankings,
  ProductStockSummary,
  canPerformAction,
} from './domain/farmRules';
import { INITIAL_MAIS_DB } from './data/seedData';
import { DashboardView } from './components/DashboardView';
import { AnimalsView } from './components/AnimalsView';
import { HealthView } from './components/HealthView';
import { FeedInventoryView } from './components/FeedInventoryView';
import { BreedingCalvesView } from './components/BreedingCalvesView';
import { ExpensesView } from './components/ExpensesView';
import { ReportsView } from './components/ReportsView';
import { TasksRemindersView } from './components/TasksRemindersView';
import { StaffSettingsView } from './components/StaffSettingsView';
import { AnimalProfileModal } from './components/AnimalProfileModal';
import { QuickActionModals, QuickActionModalType } from './components/QuickActionModals';
import { LoginPage } from './components/LoginPage';
import { maisApiClient } from './services/apiClient';

type SectionId =
  | 'dashboard'
  | 'animals'
  | 'health'
  | 'feed'
  | 'breeding'
  | 'expenses'
  | 'reports'
  | 'tasks'
  | 'staff';

const NAV_SECTIONS: {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'animals',
      label: 'Animals',
      icon: <Tag className="w-4 h-4" />,
    },
    {
      id: 'health',
      label: 'Health',
      icon: <Stethoscope className="w-4 h-4" />,
    },
    {
      id: 'feed',
      label: 'Feed',
      icon: <Wheat className="w-4 h-4" />,
    },
    {
      id: 'breeding',
      label: 'Breeding',
      icon: <HeartHandshake className="w-4 h-4" />,
    },
    {
      id: 'expenses',
      label: 'Expenses',
      icon: <Receipt className="w-4 h-4" />,
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <FileBarChart className="w-4 h-4" />,
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: <BellRing className="w-4 h-4" />,
    },
    {
      id: 'staff',
      label: 'Staff',
      icon: <Users className="w-4 h-4" />,
    },
  ];

const SESSION_STORAGE_KEY = 'mais_ltd_auth_session_v1';

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return Boolean(parsed?.user?.id);
        } catch {
          return false;
        }
      }
    }
    return false;
  });

  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved)?.token || null;
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  const [db, setDb] = useState<MaisDatabaseState>(INITIAL_MAIS_DB);
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved)?.user?.id || 'USR-01';
        } catch {
          return 'USR-01';
        }
      }
    }
    return 'USR-01';
  });
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(false);
  const [serverComputed, setServerComputed] = useState<{
    productStocks: ProductStockSummary[];
    financialSummary: FarmFinancialSummary;
    healthRankings: HealthAnalyticsRankings;
    animalCosts: Record<string, AnimalCostBreakdown>;
  } | null>(null);

  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [historicalTagMatched, setHistoricalTagMatched] = useState<string | null>(null);

  const [activeQuickModal, setActiveQuickModal] = useState<QuickActionModalType>(null);
  const [preselectedModalAnimalId, setPreselectedModalAnimalId] = useState<string | null>(null);

  const [globalTagQuery, setGlobalTagQuery] = useState('');

  const [banner, setBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const currentUser =
    db.users.find((u) => u.id === currentUserId) || db.users[0];

  const fetchBackendState = useCallback(async () => {
    try {
      const token = authToken || undefined;
      const data = await maisApiClient.getState(token);
      if (data.db) {
        setDb(data.db);
        setSupabaseConfigured(Boolean(data.computed?.supabaseConfigured));
        if (data.computed) {
          setServerComputed({
            productStocks: data.computed.productStocks,
            financialSummary: data.computed.financialSummary,
            healthRankings: data.computed.healthRankings,
            animalCosts: data.computed.animalCosts,
          });
        }
      }
    } catch (err: any) {
      if (err.message?.includes('Authentication required') || err.message?.includes('401')) {
        setIsAuthenticated(false);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
      setBanner({
        type: 'error',
        message: err.message || 'Unable to connect to server.',
      });
    }
  }, [authToken]);

  useEffect(() => {
    fetchBackendState();
  }, [fetchBackendState]);

  const handleAuthenticated = async (session: {
    user: StaffUser;
    token: string;
    authMode: 'supabase' | 'local_rbac';
  }) => {
    // Rely on HttpOnly cookie for session token transport; do not store token in sessionStorage (H6)
    const safeSession = { user: session.user, authMode: session.authMode };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safeSession));
    setAuthToken(session.token);
    setCurrentUserId(session.user.id);
    setIsAuthenticated(true);
    await fetchBackendState();
  };

  const handleLogout = async () => {
    try {
      await maisApiClient.logout(authToken || undefined);
    } catch {
      // Ignore logout network error
    }
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setAuthToken(null);
    setIsAuthenticated(false);
    setSelectedAnimalId(null);
    setActiveQuickModal(null);
    setBanner(null);
  };

  const apiCall = async (
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body?: any
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        setIsAuthenticated(false);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    await fetchBackendState();
    return data;
  };

  const handleGlobalTagSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalTagQuery.trim()) return;
    try {
      const token = authToken || currentUserId;
      const data = await maisApiClient.getAnimalByTag(token, globalTagQuery.trim());
      setSelectedAnimalId(data.animal.id);
      setHistoricalTagMatched(
        data.isHistoricalMatch ? data.matchedIdentifier.tagNumber : null
      );
      setGlobalTagQuery('');
    } catch (err: any) {
      setBanner({
        type: 'error',
        message: err.message || 'Tag not found.',
      });
    }
  };

  const productStocks: ProductStockSummary[] =
    serverComputed?.productStocks ??
    db.feedProducts.map((p) =>
      calculateFeedProductStock(p, db.feedPurchases, db.feedIssues, db.inventoryMovements)
    );
  const financialSummary: FarmFinancialSummary =
    serverComputed?.financialSummary ??
    calculateFarmFinancialSummary(db.expenses, db.payments, db.expenseAllocations);
  const healthRankings: HealthAnalyticsRankings =
    serverComputed?.healthRankings ??
    computeHealthRankings(
      db.animals,
      db.healthEpisodes,
      db.treatments,
      new Date().toISOString().slice(0, 10)
    );
  const animalCosts: Record<string, AnimalCostBreakdown> =
    serverComputed?.animalCosts ??
    Object.fromEntries(
      db.animals.map((a) => [
        a.id,
        calculateAnimalTotalCosts(a, db.expenses, db.expenseAllocations),
      ])
    );

  const selectedAnimal = selectedAnimalId
    ? db.animals.find((a) => a.id === selectedAnimalId) || null
    : null;

  const canEditAnimals = canPerformAction(currentUser.role, 'EDIT_ANIMALS');

  const currentSectionMeta =
    NAV_SECTIONS.find((s) => s.id === activeSection) || NAV_SECTIONS[0];

  if (!isAuthenticated) {
    return (
      <LoginPage
        supabaseConfigured={supabaseConfigured}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div role="document" className="min-h-screen flex liquid-glass-canvas animate-fade-in text-slate-900 selection:bg-emerald-600 selection:text-white">
      {/* Desktop Sidebar */}
      <aside role="complementary" className="hidden lg:flex lg:flex-col lg:w-60 lg:my-3 lg:ml-3 lg:rounded-2xl liquid-glass-sidebar text-slate-200 shrink-0 no-print sticky top-3 h-[calc(100vh-1.5rem)]">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-white font-display whitespace-nowrap">
              MAIS LTD
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 tracking-tight">
            Livestock Management
          </p>
        </div>

        <nav className="flex-1 px-3 py-3.5 space-y-1 overflow-y-auto" aria-label="Main Navigation">
          {NAV_SECTIONS.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all duration-150 whitespace-nowrap ${isActive
                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/25 shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-100 border border-transparent'
                  }`}
              >
                <span className={isActive ? 'text-emerald-400' : 'text-slate-400'}>
                  {sec.icon}
                </span>
                <span className="text-xs tracking-tight truncate">{sec.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 m-2.5 rounded-xl bg-black/20 border border-white/10 text-xs text-slate-300">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-white truncate">{currentUser.fullName}</p>
              <p className="text-[11px] text-emerald-400 mt-0.5 truncate">
                {currentUser.role}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-200 transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-60 m-2 rounded-2xl liquid-glass-sidebar text-slate-200 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-base font-bold text-white">MAIS LTD</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(sec.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs text-left whitespace-nowrap ${activeSection === sec.id
                      ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/25 shadow-sm'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                    }`}
                >
                  {sec.icon}
                  <span>{sec.label}</span>
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-xs font-semibold text-white"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-30 liquid-glass-header px-6 py-3.5 flex items-center justify-between gap-6 no-print">
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-700 hover:text-slate-900 rounded-lg liquid-glass-btn-secondary"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="font-semibold text-sm text-slate-900 font-display">
              {currentSectionMeta.label}
            </span>
          </div>

          {activeSection !== 'dashboard' ? (
            <form
              onSubmit={handleGlobalTagSearch}
              className="hidden md:flex items-center flex-1 max-w-md relative"
            >
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                aria-label="Search tag"
                value={globalTagQuery}
                onChange={(e) => setGlobalTagQuery(e.target.value)}
                placeholder="Search tag number..."
                className="w-full pl-10 pr-20 py-1.5 text-xs bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-300 rounded-lg font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-colors"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
              >
                Find
              </button>
            </form>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-900">{currentUser.fullName}</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-medium text-[11px]">
                {currentUser.role}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-red-700 rounded-lg liquid-glass-btn-secondary transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Feedback Banner */}
        {banner && (
          <div
            className={`px-6 py-2.5 border-b text-xs flex items-center justify-between gap-4 no-print ${banner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-red-50 border-red-200 text-red-950'
              }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span className="font-medium">{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="text-xs font-semibold underline hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Section Content */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              db={db}
              productStocks={productStocks}
              currentUser={currentUser}
              onOpenAnimalProfile={(animal, matchedHist) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(matchedHist || null);
              }}
              onOpenQuickAction={(modalType, preId) => {
                setPreselectedModalAnimalId(preId || null);
                setActiveQuickModal(modalType);
              }}
              onNavigateSection={(sec) => setActiveSection(sec as SectionId)}
              onCompleteTask={async (taskId) => {
                await apiCall(`/api/tasks/${taskId}`, 'PATCH', {
                  status: 'Completed',
                  completionNotes: `Completed by ${currentUser.fullName}`,
                });
                setBanner({ type: 'success', message: 'Task completed.' });
              }}
            />
          )}

          {activeSection === 'animals' && (
            <AnimalsView
              db={db}
              animalCosts={animalCosts}
              currentUser={currentUser}
              onOpenAnimalProfile={(animal, matchedHist) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(matchedHist || null);
              }}
              onOpenRegisterModal={() => setActiveQuickModal('register_animal')}
            />
          )}

          {activeSection === 'health' && (
            <HealthView
              db={db}
              healthRankings={healthRankings}
              currentUser={currentUser}
              onOpenAnimalProfile={(animal) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(null);
              }}
              onOpenTreatmentModal={(preId) => {
                setPreselectedModalAnimalId(preId || null);
                setActiveQuickModal('treatment');
              }}
              onRecordVaccination={async (animalId, payload) => {
                await apiCall(`/api/animals/${animalId}/vaccinations`, 'POST', payload);
                setBanner({
                  type: 'success',
                  message: 'Vaccination saved.',
                });
              }}
            />
          )}

          {activeSection === 'feed' && (
            <FeedInventoryView
              db={db}
              productStocks={productStocks}
              currentUser={currentUser}
              onOpenFeedModal={() => setActiveQuickModal('feed')}
              onOpenAnimalProfile={(animal) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(null);
              }}
            />
          )}

          {activeSection === 'breeding' && (
            <BreedingCalvesView
              db={db}
              currentUser={currentUser}
              onOpenAnimalProfile={(animal) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(null);
              }}
              onOpenBreedingModal={() => setActiveQuickModal('breeding')}
              onOpenWeightModal={(preId) => {
                setPreselectedModalAnimalId(preId || null);
                setActiveQuickModal('weight');
              }}
            />
          )}

          {activeSection === 'expenses' && (
            <ExpensesView
              db={db}
              financialSummary={financialSummary}
              animalCosts={animalCosts}
              currentUser={currentUser}
              onOpenExpenseModal={() => setActiveQuickModal('expense')}
              onOpenAnimalProfile={(animal) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(null);
              }}
              onApproveExpense={async (expenseId) => {
                await apiCall(`/api/expenses/${expenseId}/approve`, 'POST');
                setBanner({ type: 'success', message: 'Expense approved.' });
              }}
              onReverseExpense={async (expenseId, reason) => {
                await apiCall(`/api/expenses/${expenseId}/reverse`, 'POST', { reason });
                setBanner({
                  type: 'success',
                  message: 'Expense reversed.',
                });
              }}
              onRecordPayment={async (expenseId, amountNgn, referenceNumber) => {
                await apiCall(`/api/expenses/${expenseId}/payments`, 'POST', {
                  amountNgn,
                  referenceNumber,
                  paymentMethod: 'Bank Transfer',
                });
                setBanner({
                  type: 'success',
                  message: `Payment of NGN ${amountNgn.toLocaleString()} saved.`,
                });
              }}
              onUploadExpenseReceipt={async (payload) => {
                await apiCall('/api/attachments', 'POST', {
                  entityType: 'Expense',
                  entityId: payload.entityId,
                  animalId: payload.animalId,
                  fileName: payload.fileName,
                  fileType: 'Invoice / Receipt',
                  fileSizeKb: payload.fileSizeKb,
                  notes: payload.notes,
                });
                setBanner({
                  type: 'success',
                  message: `Receipt "${payload.fileName}" attached to expense ${payload.entityId}.`,
                });
              }}
            />
          )}

          {activeSection === 'reports' && (
            <ReportsView
              db={db}
              productStocks={productStocks}
              animalCosts={animalCosts}
              currentUser={currentUser}
              onOpenAnimalProfile={(animal) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(null);
              }}
              onSendMonthlyReportEmail={async (startDate, endDate) => {
                const res = await apiCall('/api/notifications/monthly-report', 'POST', {
                  startDate,
                  endDate,
                });
                setBanner({
                  type: 'success',
                  message: `Monthly report email (${startDate} to ${endDate}) dispatched to ${res.recipientCount} recipient(s) with ${res.attachmentsCount} CSV attachment(s).`,
                });
              }}
            />
          )}

          {activeSection === 'tasks' && (
            <TasksRemindersView
              db={db}
              currentUser={currentUser}
              onOpenAnimalProfile={(animal) => {
                setSelectedAnimalId(animal.id);
                setHistoricalTagMatched(null);
              }}
              onCreateTask={async (payload) => {
                await apiCall('/api/tasks', 'POST', payload);
                setBanner({ type: 'success', message: 'Task saved.' });
              }}
              onUpdateTaskStatus={async (taskId, status, completionNotes) => {
                await apiCall(`/api/tasks/${taskId}`, 'PATCH', { status, completionNotes });
                setBanner({ type: 'success', message: 'Task updated.' });
              }}
              onRunDueReminders={async (forceResend) => {
                const res = await apiCall('/api/notifications/reminders/run', 'POST', {
                  forceResend,
                });
                setBanner({
                  type: 'success',
                  message:
                    res.sentCount > 0
                      ? `Sent ${res.sentCount} 1-day advance reminder email(s).`
                      : `Reminder check complete (${res.dueItems?.length || 0} item(s) due tomorrow).`,
                });
              }}
            />
          )}

          {activeSection === 'staff' && (
            <StaffSettingsView
              db={db}
              currentUser={currentUser}
              onCreateStaffUser={async (payload) => {
                await apiCall('/api/users', 'POST', payload);
                setBanner({ type: 'success', message: 'Staff member added.' });
              }}
              onUpdateStaffUser={async (userId, payload) => {
                await apiCall(`/api/users/${userId}`, 'PATCH', payload);
                setBanner({
                  type: 'success',
                  message: 'Role updated.',
                });
              }}
              onDeleteStaffUser={async (userId) => {
                await apiCall(`/api/users/${userId}`, 'DELETE');
                setBanner({
                  type: 'success',
                  message: 'Staff user deactivated. All created records preserved.',
                });
              }}
              onUpdateNotificationSettings={async (payload) => {
                await apiCall('/api/notifications/settings', 'PUT', payload);
                setBanner({
                  type: 'success',
                  message: 'Email automation schedule updated.',
                });
              }}
              onSendMonthlyReportEmail={async (startDate, endDate) => {
                const res = await apiCall('/api/notifications/monthly-report', 'POST', {
                  startDate,
                  endDate,
                });
                setBanner({
                  type: 'success',
                  message: `Monthly report email (${startDate} to ${endDate}) dispatched to ${res.recipientCount} recipient(s) with ${res.attachmentsCount} CSV attachment(s).`,
                });
              }}
              onRunDueReminders={async (forceResend) => {
                const res = await apiCall('/api/notifications/reminders/run', 'POST', {
                  forceResend,
                });
                setBanner({
                  type: 'success',
                  message:
                    res.sentCount > 0
                      ? `Sent ${res.sentCount} 1-day advance reminder email(s).`
                      : `Reminder check complete (${res.dueItems?.length || 0} item(s) due tomorrow).`,
                });
              }}
              onExportBackup={async () => {
                const res = await apiCall('/api/backups/export', 'GET');
                setBanner({
                  type: 'success',
                  message: `Database backup snapshot ${res.snapshot?.snapshotId || ''} exported.`,
                });
                return res;
              }}
              onVerifyBackup={async (snapshot) => {
                const res = await apiCall('/api/backups/verify', 'POST', {
                  snapshot,
                });
                setBanner({
                  type: res.verification?.valid ? 'success' : 'error',
                  message: res.verification?.valid
                    ? 'Backup restoration dry-run & integrity verification test passed.'
                    : 'Backup verification detected integrity errors.',
                });
                return res;
              }}
              onRestoreBackup={async (snapshot) => {
                const res = await apiCall('/api/backups/restore', 'POST', {
                  snapshot,
                });
                setBanner({
                  type: 'success',
                  message: `Database restored from snapshot ${res.restoredSnapshotId}.`,
                });
                return res;
              }}
              onRunEncryptedBackup={async (tier) => {
                const res = await apiCall('/api/backups/run', 'POST', { tier });
                setBanner({
                  type: 'success',
                  message: `Encrypted PostgreSQL backup ${res.runLog?.fileName} (${res.runLog?.cipher}) completed.`,
                });
                return res;
              }}
              onUpdateBackupSettings={async (payload) => {
                const res = await apiCall('/api/backups/settings', 'PUT', payload);
                setBanner({
                  type: 'success',
                  message: 'Automated backup retention & alert policy updated.',
                });
                return res;
              }}
              onVerifyEncryptedRun={async (runId) => {
                const res = await apiCall(`/api/backups/runs/${runId}/verify`, 'POST');
                setBanner({
                  type: res.verification?.valid ? 'success' : 'error',
                  message: res.verification?.valid
                    ? `Encrypted archive ${res.runLog?.fileName} decrypted & passed all integrity checks.`
                    : 'Encrypted archive verification reported errors.',
                });
                return res;
              }}
              onRestoreEncryptedRun={async (runId) => {
                const res = await apiCall(`/api/backups/runs/${runId}/restore`, 'POST');
                setBanner({
                  type: 'success',
                  message: `Database restored from encrypted archive ${res.runLog?.fileName}.`,
                });
                return res;
              }}
              onPruneBackups={async () => {
                const res = await apiCall('/api/backups/prune', 'POST');
                setBanner({
                  type: 'success',
                  message: `Retention check complete: ${res.prunedCount} expired backup(s) pruned, ${res.lockedProtectedCount} protected by Object Lock.`,
                });
                return res;
              }}
            />
          )}
        </main>
      </div>

      {/* Animal Profile Modal */}
      {selectedAnimal && (
        <AnimalProfileModal
          animal={selectedAnimal}
          db={db}
          costBreakdown={
            animalCosts[selectedAnimal.id] ||
            calculateAnimalTotalCosts(selectedAnimal, db.expenses, db.expenseAllocations)
          }
          currentUser={currentUser}
          historicalTagMatched={historicalTagMatched}
          onClose={() => {
            setSelectedAnimalId(null);
            setHistoricalTagMatched(null);
          }}
          onSelectAnimalById={(id) => {
            setSelectedAnimalId(id);
            setHistoricalTagMatched(null);
          }}
          onReplaceTag={async (animalId, newTagNumber, reason) => {
            await apiCall(`/api/animals/${animalId}/replace-tag`, 'POST', {
              newTagNumber,
              reason,
            });
            setBanner({
              type: 'success',
              message: `Tag updated to ${newTagNumber.toUpperCase()}.`,
            });
          }}
          onChangeStatus={async (animalId, newStatus: AnimalStatus, reason: string) => {
            await apiCall(`/api/animals/${animalId}/status`, 'POST', {
              newStatus,
              reason,
            });
            setBanner({
              type: 'success',
              message: `Status updated to ${newStatus}.`,
            });
          }}
          onUpdateAnimal={async (animalId, payload) => {
            await apiCall(`/api/animals/${animalId}`, 'PUT', payload);
            setBanner({
              type: 'success',
              message: 'Animal biodata updated.',
            });
          }}
          onUploadAttachment={async (payload) => {
            await apiCall('/api/attachments', 'POST', payload);
            setBanner({ type: 'success', message: 'File attached.' });
          }}
          onOpenQuickAction={(type, preId) => {
            setPreselectedModalAnimalId(preId);
            setActiveQuickModal(type);
          }}
        />
      )}

      {/* Quick Action Modals */}
      <QuickActionModals
        activeModal={activeQuickModal}
        preselectedAnimalId={preselectedModalAnimalId}
        db={db}
        onClose={() => {
          setActiveQuickModal(null);
          setPreselectedModalAnimalId(null);
        }}
        onRegisterAnimal={async (payload) => {
          const res = await apiCall('/api/animals', 'POST', payload);
          setBanner({
            type: 'success',
            message: `Added ${res.animal.currentTag} (${res.animal.name}).`,
          });
        }}
        onCreateHealthEpisode={async (animalId, payload) => {
          return await apiCall(`/api/animals/${animalId}/health-episodes`, 'POST', payload);
        }}
        onRecordTreatment={async (episodeId, payload) => {
          await apiCall(`/api/health-episodes/${episodeId}/treatments`, 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Treatment saved.',
          });
        }}
        onRecordFeedIssue={async (payload) => {
          await apiCall('/api/feed/issues', 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Feed issued.',
          });
        }}
        onRecordFeedPurchase={async (payload) => {
          await apiCall('/api/feed/purchases', 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Feed purchase saved.',
          });
        }}
        onRecordFeedLoss={async (payload) => {
          await apiCall('/api/feed/losses', 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Feed loss saved.',
          });
        }}
        onRecordWeight={async (animalId, payload) => {
          await apiCall(`/api/animals/${animalId}/weights`, 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Weight saved.',
          });
        }}
        onRecordBreeding={async (animalId, payload) => {
          await apiCall(`/api/animals/${animalId}/breeding-events`, 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Breeding saved.',
          });
        }}
        onRecordCalving={async (payload) => {
          await apiCall('/api/calving-events', 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Calving saved.',
          });
        }}
        onRecordExpense={async (payload) => {
          await apiCall('/api/expenses', 'POST', payload);
          setBanner({
            type: 'success',
            message: 'Expense saved.',
          });
        }}
      />
    </div>
  );
}
