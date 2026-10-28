-- ==============================================================================
-- MAIS LTD Livestock Management System — Database Migration
-- Version: 20261028000001
-- Name: fix_backend_rls_policies
-- Description: Configure Row Level Security (RLS) policies scoped strictly TO service_role
--              for all tables and storage objects. This ensures that direct public access
--              via PostgREST/anon key is blocked while our Express backend maintains full access.
-- ==============================================================================

-- 1. Animals & Identifiers
ALTER TABLE IF EXISTS public.animals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read permitted staff" ON public.animals;
DROP POLICY IF EXISTS "Write operational staff" ON public.animals;
DROP POLICY IF EXISTS "Active staff can read animals" ON public.animals;
DROP POLICY IF EXISTS "Managers and Admins can mutate animals" ON public.animals;
DROP POLICY IF EXISTS "Allow backend access to animals" ON public.animals;
CREATE POLICY "Allow backend access to animals" ON public.animals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.animal_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to animal_identifiers" ON public.animal_identifiers;
CREATE POLICY "Allow backend access to animal_identifiers" ON public.animal_identifiers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Staff Users & Animal Events
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to users" ON public.users;
CREATE POLICY "Allow backend access to users" ON public.users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.animal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to animal_events" ON public.animal_events;
CREATE POLICY "Allow backend access to animal_events" ON public.animal_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Health & Weights
ALTER TABLE IF EXISTS public.health_episodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to health_episodes" ON public.health_episodes;
CREATE POLICY "Allow backend access to health_episodes" ON public.health_episodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.treatments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to treatments" ON public.treatments;
CREATE POLICY "Allow backend access to treatments" ON public.treatments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.vaccination_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to vaccination_records" ON public.vaccination_records;
CREATE POLICY "Allow backend access to vaccination_records" ON public.vaccination_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.weight_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to weight_records" ON public.weight_records;
CREATE POLICY "Allow backend access to weight_records" ON public.weight_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Breeding & Calving
ALTER TABLE IF EXISTS public.breeding_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to breeding_events" ON public.breeding_events;
CREATE POLICY "Allow backend access to breeding_events" ON public.breeding_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.calving_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to calving_events" ON public.calving_events;
CREATE POLICY "Allow backend access to calving_events" ON public.calving_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Feed & Inventory
ALTER TABLE IF EXISTS public.feed_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to feed_products" ON public.feed_products;
CREATE POLICY "Allow backend access to feed_products" ON public.feed_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.feed_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to feed_purchases" ON public.feed_purchases;
CREATE POLICY "Allow backend access to feed_purchases" ON public.feed_purchases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to inventory_movements" ON public.inventory_movements;
CREATE POLICY "Allow backend access to inventory_movements" ON public.inventory_movements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.feed_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to feed_issues" ON public.feed_issues;
CREATE POLICY "Allow backend access to feed_issues" ON public.feed_issues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Vendors, Expenses & Payments
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to suppliers" ON public.suppliers;
CREATE POLICY "Allow backend access to suppliers" ON public.suppliers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to expenses" ON public.expenses;
CREATE POLICY "Allow backend access to expenses" ON public.expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.expense_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to expense_allocations" ON public.expense_allocations;
CREATE POLICY "Allow backend access to expense_allocations" ON public.expense_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to payments" ON public.payments;
CREATE POLICY "Allow backend access to payments" ON public.payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. Tasks, Audit & Attachments
ALTER TABLE IF EXISTS public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to tasks" ON public.tasks;
CREATE POLICY "Allow backend access to tasks" ON public.tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read audit admin only" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow backend access to audit_logs" ON public.audit_logs;
CREATE POLICY "Allow backend access to audit_logs" ON public.audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read attachments permitted staff" ON public.attachments;
DROP POLICY IF EXISTS "Write attachments operational staff" ON public.attachments;
DROP POLICY IF EXISTS "Active staff can read attachments" ON public.attachments;
DROP POLICY IF EXISTS "Operational staff can manage attachments" ON public.attachments;
DROP POLICY IF EXISTS "Allow backend access to attachments" ON public.attachments;
CREATE POLICY "Allow backend access to attachments" ON public.attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. Backups
ALTER TABLE IF EXISTS public.backup_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only Admins can view or manage backup_settings" ON public.backup_settings;
DROP POLICY IF EXISTS "Allow backend access to backup_settings" ON public.backup_settings;
CREATE POLICY "Allow backend access to backup_settings" ON public.backup_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE IF EXISTS public.backup_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Only Admins can view or manage backup_runs" ON public.backup_runs;
DROP POLICY IF EXISTS "Allow backend access to backup_runs" ON public.backup_runs;
CREATE POLICY "Allow backend access to backup_runs" ON public.backup_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. Storage Objects
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "Staff read private animal photos" ON storage.objects;
    DROP POLICY IF EXISTS "Staff upload private attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Staff manage private attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Allow backend storage access" ON storage.objects;
    CREATE POLICY "Allow backend storage access" ON storage.objects
      FOR ALL TO service_role USING (bucket_id IN ('animal-photos', 'receipt-documents'))
      WITH CHECK (bucket_id IN ('animal-photos', 'receipt-documents'));
  END IF;
END $$;

