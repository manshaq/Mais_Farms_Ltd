import { Router, Response } from 'express';
import {
  calculateAnimalTotalCosts,
  calculateFarmFinancialSummary,
  calculateFeedProductStock,
  computeHealthRankings,
} from '../../src/domain/farmRules.ts';
import { db } from '../db/store.ts';
import { paginateItems, requirePermission, StaffRequest } from '../middleware/auth.ts';

export const reportsRouter = Router();

/**
 * GET /api/reports (Canonical Section 15 Endpoint)
 * Returns executive summary across all 10 report datasets with optional date range filtering.
 */
reportsRouter.get(
  '/reports',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { startDate, endDate } = req.query;
    const referenceDate = new Date().toISOString().slice(0, 10);
    const stocks = db.feedProducts.map((p) =>
      calculateFeedProductStock(p, db.feedPurchases, db.feedIssues, db.inventoryMovements)
    );
    const financialSummary = calculateFarmFinancialSummary(
      db.expenses,
      db.payments,
      db.expenseAllocations,
      {
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      }
    );
    const healthRankings = computeHealthRankings(
      db.animals,
      db.healthEpisodes,
      db.treatments,
      referenceDate
    );
    const animalCosts = db.animals.map((a) => ({
      animalId: a.id,
      currentTag: a.currentTag,
      name: a.name,
      costs: calculateAnimalTotalCosts(a, db.expenses, db.expenseAllocations),
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      herdSummary: {
        totalRegistered: db.animals.length,
        activeHerd: db.animals.filter((a) => a.status === 'Active').length,
        activeCalves: db.animals.filter((a) => a.status === 'Active' && a.type === 'Calf').length,
      },
      financialSummary,
      healthRankings,
      feedStocks: stocks,
      animalCosts,
    });
  }
);

/**
 * GET /api/reports/health
 * Returns health rankings, treatment episodes, and withdrawal alerts with pagination & date filters.
 */
reportsRouter.get(
  '/reports/health',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { startDate, endDate, severity, status, page, limit } = req.query;
    const referenceDate = new Date().toISOString().slice(0, 10);

    let episodes = [...db.healthEpisodes];
    let treatments = [...db.treatments];

    if (startDate) {
      episodes = episodes.filter((e) => e.reportedDate >= String(startDate));
      treatments = treatments.filter((t) => t.treatmentDate >= String(startDate));
    }
    if (endDate) {
      episodes = episodes.filter((e) => e.reportedDate <= String(endDate));
      treatments = treatments.filter((t) => t.treatmentDate <= String(endDate));
    }
    if (severity && severity !== 'ALL') {
      episodes = episodes.filter((e) => e.severity === String(severity));
    }
    if (status && status !== 'ALL') {
      episodes = episodes.filter((e) => e.status === String(status));
    }

    const rankings = computeHealthRankings(db.animals, episodes, treatments, referenceDate);

    res.json({
      rankings,
      episodes: paginateItems(episodes, page, limit),
      treatments: paginateItems(treatments, page, limit),
    });
  }
);

/**
 * GET /api/reports/expenses
 * Returns farm financial summary, cost per animal, and paginated expense transactions.
 */
reportsRouter.get(
  '/reports/expenses',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { startDate, endDate, category, supplierId, page, limit } = req.query;

    let expenses = db.expenses.filter((e) => !e.isReversed);
    if (startDate) {
      expenses = expenses.filter((e) => e.expenseDate >= String(startDate));
    }
    if (endDate) {
      expenses = expenses.filter((e) => e.expenseDate <= String(endDate));
    }
    if (category && category !== 'ALL') {
      expenses = expenses.filter((e) => e.category === String(category));
    }
    if (supplierId && supplierId !== 'ALL') {
      expenses = expenses.filter((e) => e.supplierId === String(supplierId));
    }

    const summary = calculateFarmFinancialSummary(
      expenses,
      db.payments,
      db.expenseAllocations,
      startDate ? String(startDate) : undefined,
      endDate ? String(endDate) : undefined
    );

    const animalCostReport = db.animals.map((a) => ({
      animal: a,
      costs: calculateAnimalTotalCosts(a, db.expenses, db.expenseAllocations),
    }));

    res.json({
      summary,
      animalCosts: animalCostReport,
      expenses: paginateItems(expenses, page, limit),
    });
  }
);

/**
 * GET /api/reports/herd
 */
reportsRouter.get(
  '/reports/herd',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { status, type, herdGroup, page, limit } = req.query;
    let animals = [...db.animals];
    if (status && status !== 'ALL') {
      animals = animals.filter((a) => a.status === String(status));
    }
    if (type && type !== 'ALL') {
      animals = animals.filter((a) => a.type === String(type));
    }
    if (herdGroup && herdGroup !== 'ALL') {
      animals = animals.filter((a) => a.herdGroup === String(herdGroup));
    }

    res.json(paginateItems(animals, page, limit));
  }
);

/**
 * GET /api/reports/feed
 */
reportsRouter.get(
  '/reports/feed',
  requirePermission('VIEW_RECORDS'),
  (req: StaffRequest, res: Response) => {
    const { page, limit } = req.query;
    const stocks = db.feedProducts.map((p) =>
      calculateFeedProductStock(p, db.feedPurchases, db.feedIssues, db.inventoryMovements)
    );
    res.json({
      stocks,
      issues: paginateItems(db.feedIssues, page, limit),
      purchases: paginateItems(db.feedPurchases, page, limit),
    });
  }
);
