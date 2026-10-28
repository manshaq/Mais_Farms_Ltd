import { Router, Response } from 'express';
import { SUPABASE_POSTGRES_SCHEMA_SQL } from '../../src/data/supabaseSchemaSql.ts';
import {
  calculateAnimalTotalCosts,
  calculateFarmFinancialSummary,
  calculateFeedProductStock,
  computeHealthRankings,
} from '../../src/domain/farmRules.ts';
import { db, resetDatabaseToClean, supabaseClient, supabaseUrl } from '../db/store.ts';
import { attachStaffUser, requirePermission, StaffRequest } from '../middleware/auth.ts';
import { animalsRouter } from './animals.routes.ts';
import { authRouter, sanitizeUser } from './auth.routes.ts';
import { healthRouter } from './health.routes.ts';
import { feedRouter } from './feed.routes.ts';
import { breedingRouter } from './breeding.routes.ts';
import { expensesRouter } from './expenses.routes.ts';
import { reportsRouter } from './reports.routes.ts';
import { operationsRouter } from './operations.routes.ts';
import {
  getMailTransportInfo,
  notificationsRouter,
  startNotificationScheduler,
} from './notifications.routes.ts';
import {
  getBackupEnvironmentStatus,
  startAutomatedBackupScheduler,
} from '../backup/backupService.ts';
import { hydrateDatabaseFromSupabase } from '../db/supabaseService.ts';

export const apiRouter = Router();

startNotificationScheduler();
startAutomatedBackupScheduler();

if (supabaseClient) {
  hydrateDatabaseFromSupabase(db).catch((err) => {
    console.warn('⚠️ [MAIS DB] Supabase initial hydration warning:', err?.message || err);
  });
}

apiRouter.use(attachStaffUser);
apiRouter.use(authRouter);

/**
 * GET /api/state
 * Returns the complete operational state and server-computed analytics.
 * Redacts administrative and audit data for non-Admin roles (M5).
 */
apiRouter.get('/state', requirePermission('VIEW_RECORDS'), (req: StaffRequest, res: Response) => {
  const user = req.staffUser;
  const isAdmin = user?.role === 'Admin';

  const productStocks = db.feedProducts.map((p) =>
    calculateFeedProductStock(p, db.feedPurchases, db.feedIssues, db.inventoryMovements)
  );
  const financialSummary = calculateFarmFinancialSummary(
    db.expenses,
    db.payments,
    db.expenseAllocations
  );
  const healthRankings = computeHealthRankings(
    db.animals,
    db.healthEpisodes,
    db.treatments,
    new Date().toISOString().slice(0, 10)
  );
  const animalCosts = Object.fromEntries(
    db.animals.map((a) => [
      a.id,
      calculateAnimalTotalCosts(a, db.expenses, db.expenseAllocations),
    ])
  );

  const safeUsers = isAdmin
    ? db.users.map((u) => sanitizeUser(u))
    : db.users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role,
        title: u.title,
        status: u.status,
        canApproveExpenses: u.canApproveExpenses,
      }));

  const sanitizedDb = {
    ...db,
    users: safeUsers,
    auditLogs: isAdmin ? db.auditLogs : [],
    emailLogs: isAdmin ? db.emailLogs : [],
    backupSettings: isAdmin ? db.backupSettings : null,
    backupRuns: isAdmin ? db.backupRuns : [],
  };

  res.json({
    db: sanitizedDb,
    computed: {
      productStocks,
      financialSummary,
      healthRankings,
      animalCosts,
      supabaseConfigured: Boolean(supabaseClient),
      supabaseUrl: supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, '') : null,
      mailProvider: isAdmin ? getMailTransportInfo() : null,
      backupEnvironment: isAdmin ? getBackupEnvironmentStatus() : null,
    },
  });
});

apiRouter.post(
  '/reset-data',
  requirePermission('MANAGE_STAFF'),
  (_req: StaffRequest, res: Response) => {
    // Only permit wiping data when explicitly enabled via ALLOW_RESET in non-production
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_RESET !== 'true') {
      res.status(403).json({
        error: 'Database reset is disabled. Set ALLOW_RESET=true in non-production environments to enable.',
      });
      return;
    }
    const cleanDb = resetDatabaseToClean();
    res.json({ db: cleanDb, message: 'All farm records have been cleared.' });
  }
);

apiRouter.get('/supabase-schema', requirePermission('VIEW_RECORDS'), (_req, res) => {
  res.json({
    sql: SUPABASE_POSTGRES_SCHEMA_SQL,
    supabaseConfigured: Boolean(supabaseClient),
  });
});

// Mount domain API modules
apiRouter.use(animalsRouter);
apiRouter.use(healthRouter);
apiRouter.use(feedRouter);
apiRouter.use(breedingRouter);
apiRouter.use(expensesRouter);
apiRouter.use(reportsRouter);
apiRouter.use(operationsRouter);
apiRouter.use(notificationsRouter);


