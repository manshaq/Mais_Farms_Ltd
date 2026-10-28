-- ==============================================================================
-- MAIS LTD LIVESTOCK MANAGEMENT SYSTEM: PRODUCTION DATABASE SCHEMA
-- Migration: 20261024000001_initial_schema.sql
-- Primary Objective: ONE ANIMAL = ONE PERMANENT IDENTITY = ONE COMPLETE HISTORY
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. Staff Users & Supabase Auth RBAC (Admin, Farm Manager, Read-Only Staff)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  auth_user_id UUID UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Farm Manager', 'Read-Only Staff')),
  title TEXT NOT NULL,
  can_approve_expenses BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper function for RLS policies
CREATE OR REPLACE FUNCTION public.get_my_mais_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() AND status = 'Active' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------------------------
-- 2. Permanent Animal Identity Registry
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.animals (
  id TEXT PRIMARY KEY, -- Immutable internal ID (e.g. ANM-1001)
  current_tag TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Cow', 'Bull', 'Heifer', 'Calf', 'Other')),
  sex TEXT NOT NULL CHECK (sex IN ('Female', 'Male')),
  breed TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  acquisition_type TEXT NOT NULL CHECK (acquisition_type IN ('Purchased', 'Born on Farm', 'Transferred', 'Other')),
  source_details TEXT,
  acquisition_date DATE NOT NULL,
  purchase_price NUMERIC(14, 2) DEFAULT 0.00,
  dam_tag TEXT,
  dam_id TEXT REFERENCES public.animals(id) ON DELETE RESTRICT,
  sire_id TEXT,
  herd_group TEXT NOT NULL,
  location TEXT NOT NULL,
  identifying_characteristics TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Sold', 'Transferred', 'Deceased', 'Missing', 'Culled')),
  status_changed_at DATE,
  status_reason TEXT,
  notes TEXT,
  registered_by TEXT NOT NULL,
  registered_at DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ------------------------------------------------------------------------------
-- 3. Visible & Historical Tag Identifiers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.animal_identifiers (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  tag_number TEXT NOT NULL,
  normalized_tag TEXT UNIQUE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at DATE NOT NULL,
  retired_at DATE,
  retired_reason TEXT,
  assigned_by TEXT NOT NULL
);

-- ------------------------------------------------------------------------------
-- 4. Chronological Animal Event Timeline
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.animal_events (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('REGISTRATION', 'BIODATA_UPDATE', 'TAG_CHANGE', 'STATUS_CHANGE', 'HEALTH_EPISODE', 'TREATMENT', 'VACCINATION', 'FEED_ALLOCATION', 'BREEDING', 'CALVING', 'WEIGHT', 'EXPENSE', 'DOCUMENT')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  cost_ngn NUMERIC(14, 2),
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. Health Episodes & Veterinary Treatments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.health_episodes (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  reported_date DATE NOT NULL,
  symptoms TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  diagnosis_category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Moderate', 'High', 'Critical')),
  status TEXT NOT NULL CHECK (status IN ('Open', 'Under Treatment', 'Monitoring', 'Resolved', 'Chronic')),
  veterinarian TEXT NOT NULL,
  outcome TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.treatments (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES public.health_episodes(id) ON DELETE RESTRICT,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  treatment_date DATE NOT NULL,
  medicine TEXT NOT NULL,
  active_ingredient TEXT,
  dosage TEXT NOT NULL,
  route TEXT NOT NULL CHECK (route IN ('Intramuscular (IM)', 'Subcutaneous (SC)', 'Intravenous (IV)', 'Oral', 'Topical', 'Intramammary', 'Other')),
  duration_days INTEGER NOT NULL DEFAULT 1 CHECK (duration_days >= 1),
  withdrawal_milk_days INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_milk_days >= 0),
  withdrawal_meat_days INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_meat_days >= 0),
  administrator TEXT NOT NULL,
  veterinarian TEXT NOT NULL,
  medicine_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  consultation_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  other_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  follow_up_date DATE,
  outcome TEXT NOT NULL DEFAULT 'Pending Follow-up',
  notes TEXT,
  expense_id TEXT
);

CREATE TABLE IF NOT EXISTS public.vaccination_records (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  date_administered DATE NOT NULL,
  protocol_type TEXT NOT NULL CHECK (protocol_type IN ('Vaccination', 'Deworming', 'Routine Check', 'Hoof Care', 'Other')),
  vaccine_or_product TEXT NOT NULL,
  batch_number TEXT,
  dosage TEXT NOT NULL,
  next_due_date DATE NOT NULL,
  veterinarian TEXT NOT NULL,
  cost_ngn NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  withdrawal_days INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- ------------------------------------------------------------------------------
-- 6. Growth & Body Weights
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.weight_records (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  measurement_date DATE NOT NULL,
  weight_kg NUMERIC(8, 2) NOT NULL CHECK (weight_kg > 0),
  body_condition_score NUMERIC(3, 1) CHECK (body_condition_score BETWEEN 1.0 AND 5.0),
  stage TEXT NOT NULL CHECK (stage IN ('Birth', 'Weaning', 'Yearling', 'Routine', 'Pre-Breeding', 'Other')),
  recorded_by TEXT NOT NULL,
  notes TEXT
);

-- ------------------------------------------------------------------------------
-- 7. Breeding, Gestation & Calving
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.breeding_events (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  heat_date DATE NOT NULL,
  insemination_date DATE NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  sire_id_or_straw TEXT NOT NULL,
  sire_breed TEXT NOT NULL,
  batch_number TEXT,
  technician TEXT NOT NULL,
  pregnancy_check_date DATE,
  pregnancy_check_method TEXT NOT NULL DEFAULT 'Pending',
  pregnancy_result TEXT NOT NULL DEFAULT 'Pending' CHECK (pregnancy_result IN ('Pending', 'Confirmed Pregnant', 'Open / Not Pregnant')),
  estimated_due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Inseminated' CHECK (status IN ('Inseminated', 'Confirmed Pregnant', 'Calved', 'Failed / Open')),
  cost_ngn NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.calving_events (
  id TEXT PRIMARY KEY,
  dam_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  breeding_event_id TEXT REFERENCES public.breeding_events(id) ON DELETE SET NULL,
  calving_date DATE NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('Live Single', 'Live Twins', 'Stillborn', 'Assisted Live')),
  assistance_required TEXT NOT NULL DEFAULT 'None',
  calf_ids TEXT[] DEFAULT '{}',
  calf_tags TEXT[] DEFAULT '{}',
  veterinarian TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL
);

-- ------------------------------------------------------------------------------
-- 8. Feed Inventory & Herd Allocation
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Concentrate', 'Roughage / Silage', 'Mineral / Supplement', 'Calf Milk Replacer', 'Other')),
  unit TEXT NOT NULL DEFAULT 'kg',
  opening_stock NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  reorder_level NUMERIC(12, 2) NOT NULL DEFAULT 100.00,
  standard_unit_cost_ngn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  storage_location TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_terms TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.feed_purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  product_id TEXT NOT NULL REFERENCES public.feed_products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  batch_number TEXT,
  quantity_ordered NUMERIC(12, 2) NOT NULL,
  quantity_received NUMERIC(12, 2) NOT NULL,
  unit_price_ngn NUMERIC(12, 2) NOT NULL,
  transport_cost_ngn NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_cost_ngn NUMERIC(14, 2) NOT NULL,
  invoice_number TEXT,
  expense_id TEXT,
  recorded_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES public.feed_products(id) ON DELETE RESTRICT,
  movement_date DATE NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'LOSS', 'ADJUSTMENT')),
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  reference_id TEXT,
  recorded_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.feed_issues (
  id TEXT PRIMARY KEY,
  issue_date DATE NOT NULL,
  product_id TEXT NOT NULL REFERENCES public.feed_products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'kg',
  target_type TEXT NOT NULL CHECK (target_type IN ('Animal', 'Group')),
  target_animal_id TEXT REFERENCES public.animals(id) ON DELETE SET NULL,
  target_group TEXT,
  allocation_method TEXT NOT NULL CHECK (allocation_method IN ('direct_animal', 'equal_headcount', 'animal_days', 'weight_proportion')),
  wastage_kg NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  unit_cost_ngn NUMERIC(12, 2) NOT NULL,
  total_cost_ngn NUMERIC(14, 2) NOT NULL,
  responsible_staff TEXT NOT NULL,
  notes TEXT
);

-- ------------------------------------------------------------------------------
-- 9. Financial Accounting & Multi-Tier Approvals
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY,
  transaction_code TEXT UNIQUE NOT NULL,
  expense_date DATE NOT NULL,
  amount_ngn NUMERIC(14, 2) NOT NULL CHECK (amount_ngn >= 0),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  supplier_id TEXT REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Partially Paid', 'Unpaid')),
  payment_method TEXT NOT NULL,
  invoice_number TEXT,
  linked_entity_type TEXT NOT NULL CHECK (linked_entity_type IN ('Animal', 'Treatment', 'FeedPurchase', 'Breeding', 'General')),
  linked_entity_id TEXT,
  linked_animal_id TEXT REFERENCES public.animals(id) ON DELETE SET NULL,
  approval_status TEXT NOT NULL DEFAULT 'Pending Approval' CHECK (approval_status IN ('Approved', 'Pending Approval', 'Rejected')),
  entered_by TEXT NOT NULL,
  approved_by TEXT,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversal_reason TEXT
);

CREATE TABLE IF NOT EXISTS public.expense_allocations (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  animal_id TEXT NOT NULL REFERENCES public.animals(id) ON DELETE RESTRICT,
  allocated_amount_ngn NUMERIC(14, 2) NOT NULL CHECK (allocated_amount_ngn >= 0),
  allocation_method TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount_ngn NUMERIC(14, 2) NOT NULL CHECK (amount_ngn > 0),
  payment_method TEXT NOT NULL,
  reference_number TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL
);

-- ------------------------------------------------------------------------------
-- 10. Operational Tasks, Attachments & Cryptographic Audit
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  assigned_to_user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  related_entity_type TEXT,
  related_entity_id TEXT,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  animal_tag TEXT,
  summary TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  previous_hash TEXT,
  integrity_hash TEXT NOT NULL
);

-- ------------------------------------------------------------------------------
-- Indexes for High Performance
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_animals_tag ON public.animals(current_tag);
CREATE INDEX IF NOT EXISTS idx_animals_status ON public.animals(status);
CREATE INDEX IF NOT EXISTS idx_identifiers_tag ON public.animal_identifiers(normalized_tag);
CREATE INDEX IF NOT EXISTS idx_treatments_date ON public.treatments(treatment_date);
CREATE INDEX IF NOT EXISTS idx_weight_date ON public.weight_records(measurement_date);
CREATE INDEX IF NOT EXISTS idx_feed_issues_date ON public.feed_issues(issue_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_audit_time ON public.audit_logs(timestamp DESC);

-- ------------------------------------------------------------------------------
-- Row Level Security (RLS) Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read permitted staff" ON public.animals;
DROP POLICY IF EXISTS "Write operational staff" ON public.animals;
DROP POLICY IF EXISTS "Allow backend access to animals" ON public.animals;
CREATE POLICY "Allow backend access to animals" ON public.animals
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend access to users" ON public.users;
CREATE POLICY "Allow backend access to users" ON public.users
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Read audit admin only" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow backend access to audit_logs" ON public.audit_logs;
CREATE POLICY "Allow backend access to audit_logs" ON public.audit_logs
  FOR ALL USING (true) WITH CHECK (true);


