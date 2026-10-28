-- ==============================================================================
-- MAIS LTD LIVESTOCK MANAGEMENT SYSTEM: CLEAN ALL OPERATIONAL TEST DATA
-- File: supabase/scripts/clean_all_test_data.sql
-- 
-- Description: Safely clears all operational records (animals, clinical events,
-- feed inventory, expenses, audit logs, backup runs, test staff) while keeping
-- database schema, RLS policies, and the initial Administrator (USR-01) intact.
-- ==============================================================================

BEGIN;

-- 1. Temporarily disable immutability triggers for audit logs and backup runs
ALTER TABLE IF EXISTS public.audit_logs DISABLE TRIGGER trg_protect_audit_logs;
ALTER TABLE IF EXISTS public.backup_runs DISABLE TRIGGER trg_protect_backup_runs;

-- 2. Truncate all livestock, clinical, inventory, financial, and operational tables
TRUNCATE TABLE 
  public.attachments,
  public.animal_events,
  public.treatment_attachments,
  public.treatments,
  public.health_episodes,
  public.vaccination_records,
  public.weight_records,
  public.calving_events,
  public.breeding_events,
  public.animal_identifiers,
  public.animals,
  public.feed_issues,
  public.inventory_movements,
  public.feed_purchases,
  public.feed_products,
  public.expense_allocations,
  public.payments,
  public.expenses,
  public.suppliers,
  public.tasks,
  public.backup_runs,
  public.audit_logs
CASCADE;

-- 3. Re-enable immutability triggers
ALTER TABLE IF EXISTS public.audit_logs ENABLE TRIGGER trg_protect_audit_logs;
ALTER TABLE IF EXISTS public.backup_runs ENABLE TRIGGER trg_protect_backup_runs;

-- 4. Remove any generated test staff users, retaining only the primary Administrator (USR-01)
DELETE FROM public.users WHERE id != 'USR-01';

COMMIT;
