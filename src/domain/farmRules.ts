/**
 * MAIS LTD Livestock Management System - Domain Business Logic & Integrity Invariants
 *
 * Modularized domain modules re-exported for unified backward compatibility:
 * - tagRules: Tag normalization, unique animal resolution, new tag candidate validation
 * - feedRules: Stock balance calculations (Opening + Receipts - Issues - Adjustments), shared feed cost allocation
 * - weightRules: Weight progression and Average Daily Gain (ADG) calculation
 * - financeRules: Animal cost accumulation and farm financial summaries
 * - healthRules: Health rankings and analytics
 * - authRules: Role permissions, action authorization, and login rate limiting
 * - auditRules: Hash chaining and tamper-evident audit logs
 * - scheduleRules: Operational calendar schedules, automated reminder generation, and monthly packages
 * - backupRules: PostgreSQL backup SQL generation, snapshot envelope creation, and verification
 */

export * from './tagRules.ts';
export * from './feedRules.ts';
export * from './weightRules.ts';
export * from './financeRules.ts';
export * from './healthRules.ts';
export * from './authRules.ts';
export * from './auditRules.ts';
export * from './scheduleRules.ts';
export * from './backupRules.ts';
