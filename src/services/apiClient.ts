import {
  Animal,
  AnimalEvent,
  AnimalIdentifier,
  AttachmentRecord,
  AuditLog,
  BreedingEvent,
  CalvingEvent,
  Expense,
  ExpenseAllocation,
  FarmTask,
  FeedIssue,
  FeedPurchase,
  HealthEpisode,
  InventoryMovement,
  MaisDatabaseState,
  StaffUser,
  Treatment,
  VaccinationRecord,
} from '../types/mais';
import {
  AnimalCostBreakdown,
  ComputedWeightWithADG,
  FarmFinancialSummary,
  HealthAnalyticsRankings,
  ProductStockSummary,
} from '../domain/farmRules';

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface AnimalHistoryResponse {
  animal: Animal;
  identifiers: AnimalIdentifier[];
  timeline: AnimalEvent[];
  healthEpisodes: HealthEpisode[];
  treatments: Treatment[];
  vaccinations: VaccinationRecord[];
  weights: ComputedWeightWithADG[];
  breedingEvents: BreedingEvent[];
  calvingEvents: CalvingEvent[];
  allocations: ExpenseAllocation[];
  directExpenses: Expense[];
  costBreakdown: AnimalCostBreakdown;
  attachments: AttachmentRecord[];
}

async function requestJson<T>(
  url: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  bearerToken: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    credentials: 'include', // forward HttpOnly auth_token cookie automatically
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with HTTP ${res.status}`);
  }
  return data as T;
}

export interface AuthAccountPreview {
  id: string;
  fullName: string;
  email: string;
  role: StaffUser['role'];
  title: string;
  canApproveExpenses: boolean;
}

export interface AuthSessionResponse {
  token: string;
  user: StaffUser & {
    permissions?: {
      canViewRecords: boolean;
      canEditAnimalsAndOperations: boolean;
      canApproveExpenses: boolean;
      canManageStaffAndSettings: boolean;
      accessLabel: string;
    };
  };
  authMode: 'supabase' | 'local_rbac';
}

export const maisApiClient = {
  // Authentication & Supabase Role Authorization
  login: async (payload: { email: string; password: string }): Promise<AuthSessionResponse> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed.');
    }
    return data as AuthSessionResponse;
  },

  signup: async (payload: {
    fullName: string;
    email: string;
    password: string;
    role: StaffUser['role'];
    title?: string;
    canApproveExpenses?: boolean;
  }): Promise<AuthSessionResponse> => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Account registration failed.');
    }
    return data as AuthSessionResponse;
  },

  logout: async (tokenOrUserId?: string) => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tokenOrUserId
          ? {
              Authorization: `Bearer ${tokenOrUserId}`,
            }
          : {}),
      },
      credentials: 'include',
    }).catch(() => {});
  },

  // System state
  getState: (userId: string) =>
    requestJson<{
      db: MaisDatabaseState;
      computed: {
        productStocks: ProductStockSummary[];
        financialSummary: FarmFinancialSummary;
        healthRankings: HealthAnalyticsRankings;
        animalCosts: Record<string, AnimalCostBreakdown>;
        supabaseConfigured: boolean;
        supabaseUrl: string | null;
      };
    }>('/api/state', 'GET', userId),

  // Animals & Tag Search
  getAnimals: (
    userId: string,
    params?: {
      type?: string;
      status?: string;
      herdGroup?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.status) qs.set('status', params.status);
    if (params?.herdGroup) qs.set('herdGroup', params.herdGroup);
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<PaginatedResult<Animal>>(
      `/api/animals${query ? `?${query}` : ''}`,
      'GET',
      userId
    );
  },

  getAnimalById: (userId: string, id: string) =>
    requestJson<{
      animal: Animal;
      identifiers: AnimalIdentifier[];
      costBreakdown: AnimalCostBreakdown;
    }>(`/api/animals/${encodeURIComponent(id)}`, 'GET', userId),

  getAnimalByTag: (userId: string, tagNumber: string) =>
    requestJson<{
      animal: Animal;
      matchedIdentifier: AnimalIdentifier;
      isHistoricalMatch: boolean;
    }>(`/api/animals/by-tag/${encodeURIComponent(tagNumber)}`, 'GET', userId),

  getAnimalHistory: (userId: string, id: string) =>
    requestJson<AnimalHistoryResponse>(
      `/api/animals/${encodeURIComponent(id)}/history`,
      'GET',
      userId
    ),

  createAnimal: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ animal: Animal; identifier: AnimalIdentifier }>(
      '/api/animals',
      'POST',
      userId,
      payload
    ),

  replaceAnimalTag: (
    userId: string,
    animalId: string,
    payload: { newTagNumber: string; reason: string }
  ) =>
    requestJson<{ animal: Animal; newIdentifier: AnimalIdentifier }>(
      `/api/animals/${encodeURIComponent(animalId)}/replace-tag`,
      'POST',
      userId,
      payload
    ),

  updateAnimalStatus: (
    userId: string,
    animalId: string,
    payload: { newStatus: string; reason: string }
  ) =>
    requestJson<{ animal: Animal }>(
      `/api/animals/${encodeURIComponent(animalId)}/status`,
      'POST',
      userId,
      payload
    ),

  // Health
  createHealthEpisode: (
    userId: string,
    animalId: string,
    payload: Record<string, unknown>
  ) =>
    requestJson<{ episode: HealthEpisode }>(
      `/api/animals/${encodeURIComponent(animalId)}/health-episodes`,
      'POST',
      userId,
      payload
    ),

  createTreatment: (
    userId: string,
    episodeId: string,
    payload: Record<string, unknown>
  ) =>
    requestJson<{ treatment: Treatment; expenseId: string | null }>(
      `/api/health-episodes/${encodeURIComponent(episodeId)}/treatments`,
      'POST',
      userId,
      payload
    ),

  createVaccination: (
    userId: string,
    animalId: string,
    payload: Record<string, unknown>
  ) =>
    requestJson<{ vaccination: VaccinationRecord }>(
      `/api/animals/${encodeURIComponent(animalId)}/vaccinations`,
      'POST',
      userId,
      payload
    ),

  // Feed & Inventory
  getInventory: (
    userId: string,
    params?: { productId?: string; lowStockOnly?: boolean; page?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.productId) qs.set('productId', params.productId);
    if (params?.lowStockOnly) qs.set('lowStockOnly', 'true');
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<{
      stocks: ProductStockSummary[];
      purchases: PaginatedResult<FeedPurchase>;
      issues: PaginatedResult<FeedIssue>;
      movements: PaginatedResult<InventoryMovement>;
    }>(`/api/inventory${query ? `?${query}` : ''}`, 'GET', userId);
  },

  createFeedPurchase: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ purchase: FeedPurchase; expense: Expense }>(
      '/api/feed/purchases',
      'POST',
      userId,
      payload
    ),

  createFeedIssue: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ issue: FeedIssue }>('/api/feed/issues', 'POST', userId, payload),

  createFeedLoss: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ movement: InventoryMovement }>('/api/feed/losses', 'POST', userId, payload),

  // Breeding, Calving & Weights
  createBreedingEvent: (
    userId: string,
    animalId: string,
    payload: Record<string, unknown>
  ) =>
    requestJson<{ breedingEvent: BreedingEvent }>(
      `/api/animals/${encodeURIComponent(animalId)}/breeding-events`,
      'POST',
      userId,
      payload
    ),

  createCalvingEvent: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ calvingEvent: CalvingEvent; calfIds: string[] }>(
      '/api/calving-events',
      'POST',
      userId,
      payload
    ),

  createWeightRecord: (
    userId: string,
    animalId: string,
    payload: Record<string, unknown>
  ) =>
    requestJson<{ historyWithAdg: ComputedWeightWithADG[] }>(
      `/api/animals/${encodeURIComponent(animalId)}/weights`,
      'POST',
      userId,
      payload
    ),

  // Expenses & Payments
  getExpenses: (
    userId: string,
    params?: {
      category?: string;
      paymentStatus?: string;
      supplierId?: string;
      animalId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    }
  ) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.paymentStatus) qs.set('paymentStatus', params.paymentStatus);
    if (params?.supplierId) qs.set('supplierId', params.supplierId);
    if (params?.animalId) qs.set('animalId', params.animalId);
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<PaginatedResult<Expense> & { summary: FarmFinancialSummary }>(
      `/api/expenses${query ? `?${query}` : ''}`,
      'GET',
      userId
    );
  },

  createExpense: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ expense: Expense }>('/api/expenses', 'POST', userId, payload),

  createExpensePayment: (
    userId: string,
    expenseId: string,
    payload: Record<string, unknown>
  ) =>
    requestJson<{ expense: Expense }>(
      `/api/expenses/${encodeURIComponent(expenseId)}/payments`,
      'POST',
      userId,
      payload
    ),

  approveExpense: (userId: string, expenseId: string) =>
    requestJson<{ expense: Expense }>(
      `/api/expenses/${encodeURIComponent(expenseId)}/approve`,
      'POST',
      userId,
      {}
    ),

  reverseExpense: (userId: string, expenseId: string, reason: string) =>
    requestJson<{ expense: Expense }>(
      `/api/expenses/${encodeURIComponent(expenseId)}/reverse`,
      'POST',
      userId,
      { reason }
    ),

  // Reports
  getHealthReport: (
    userId: string,
    params?: { startDate?: string; endDate?: string; page?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<{
      rankings: HealthAnalyticsRankings;
      episodes: PaginatedResult<HealthEpisode>;
      treatments: PaginatedResult<Treatment>;
    }>(`/api/reports/health${query ? `?${query}` : ''}`, 'GET', userId);
  },

  getExpensesReport: (
    userId: string,
    params?: { startDate?: string; endDate?: string; page?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<{
      summary: FarmFinancialSummary;
      animalCosts: Array<{ animal: Animal; costs: AnimalCostBreakdown }>;
      expenses: PaginatedResult<Expense>;
    }>(`/api/reports/expenses${query ? `?${query}` : ''}`, 'GET', userId);
  },

  // Tasks, Staff & Audit Logs
  getTasks: (
    userId: string,
    params?: { status?: string; category?: string; page?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<PaginatedResult<FarmTask>>(
      `/api/tasks${query ? `?${query}` : ''}`,
      'GET',
      userId
    );
  },

  createTask: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ task: FarmTask }>('/api/tasks', 'POST', userId, payload),

  updateTask: (
    userId: string,
    taskId: string,
    payload: { status: string; completionNotes: string }
  ) =>
    requestJson<{ task: FarmTask }>(
      `/api/tasks/${encodeURIComponent(taskId)}`,
      'PATCH',
      userId,
      payload
    ),

  getUsers: (userId: string, params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<PaginatedResult<StaffUser>>(
      `/api/users${query ? `?${query}` : ''}`,
      'GET',
      userId
    );
  },

  createUser: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ user: StaffUser }>('/api/users', 'POST', userId, payload),

  updateUser: (userId: string, targetUserId: string, payload: Record<string, unknown>) =>
    requestJson<{ user: StaffUser }>(
      `/api/users/${encodeURIComponent(targetUserId)}`,
      'PATCH',
      userId,
      payload
    ),

  deleteUser: (userId: string, targetUserId: string) =>
    requestJson<{ success: boolean; message: string; user: StaffUser }>(
      `/api/users/${encodeURIComponent(targetUserId)}`,
      'DELETE',
      userId
    ),

  getAuditLogs: (
    userId: string,
    params?: { action?: string; entityType?: string; animalTag?: string; page?: number; limit?: number }
  ) => {
    const qs = new URLSearchParams();
    if (params?.action) qs.set('action', params.action);
    if (params?.entityType) qs.set('entityType', params.entityType);
    if (params?.animalTag) qs.set('animalTag', params.animalTag);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return requestJson<PaginatedResult<AuditLog>>(
      `/api/audit-logs${query ? `?${query}` : ''}`,
      'GET',
      userId
    );
  },

  uploadAttachment: (userId: string, payload: Record<string, unknown>) =>
    requestJson<{ attachment: AttachmentRecord }>(
      '/api/attachments',
      'POST',
      userId,
      payload
    ),

  syncToSupabase: (tokenOrUserId: string) =>
    requestJson<{
      success: boolean;
      message: string;
      synced: Record<string, number>;
    }>('/api/sync-to-supabase', 'POST', tokenOrUserId),
};
