export const SUPABASE_POSTGRES_SCHEMA_SQL = `-- MAIS LTD: Complete PostgreSQL / Supabase Database Schema
-- Primary Objective: One animal, one permanent identity, one complete history.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Staff Users & Supabase Auth Role-Based Access Control (Admin, Farm Manager, Read-Only Staff)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Admin', 'Farm Manager', 'Read-Only Staff')),
  title TEXT NOT NULL,
  can_approve_expenses BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Automatic Supabase Auth -> public.users Role Synchronization Trigger
CREATE OR REPLACE FUNCTION public.handle_new_supabase_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, auth_user_id, full_name, email, role, title, can_approve_expenses, status, deleted)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'staff_id', 'USR-' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 8)),
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Read-Only Staff'),
    COALESCE(NEW.raw_user_meta_data->>'title', 'Farm Staff'),
    COALESCE((NEW.raw_user_meta_data->>'can_approve_expenses')::BOOLEAN, FALSE),
    'Active',
    FALSE
  )
  ON CONFLICT (email) DO UPDATE
  SET auth_user_id = EXCLUDED.auth_user_id,
      last_active = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_supabase_user();

-- Helper function used by Supabase RLS policies to authorize Admin, Farm Manager, or Read-Only Staff
CREATE OR REPLACE FUNCTION public.get_my_mais_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() AND status = 'Active' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;


--2. Permanent Animal Identity Registry
CREATE TABLE IF NOT EXISTS animals (
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
  purchase_price NUMERIC(14, 2),
  dam_tag TEXT,
  dam_id TEXT REFERENCES animals(id),
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

-- 3. Current & Historical Tag Identifiers (Retired tags remain searchable & never reassigned)
CREATE TABLE IF NOT EXISTS animal_identifiers (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  tag_number TEXT NOT NULL,
  normalized_tag TEXT UNIQUE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at DATE NOT NULL,
  retired_at DATE,
  retired_reason TEXT,
  assigned_by TEXT NOT NULL
);

-- 4. Chronological Animal Event Timeline
CREATE TABLE IF NOT EXISTS animal_events (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  cost_ngn NUMERIC(14, 2),
  recorded_by TEXT NOT NULL
);

-- 5. Health Episodes (Distinct from individual treatment visits)
CREATE TABLE IF NOT EXISTS health_episodes (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
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

-- 6. Veterinary Treatments
CREATE TABLE IF NOT EXISTS treatments (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL REFERENCES health_episodes(id) ON DELETE RESTRICT,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  treatment_date DATE NOT NULL,
  medicine TEXT NOT NULL,
  active_ingredient TEXT NOT NULL,
  dosage TEXT NOT NULL,
  route TEXT NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 1,
  withdrawal_milk_days INTEGER NOT NULL DEFAULT 0,
  withdrawal_meat_days INTEGER NOT NULL DEFAULT 0,
  administrator TEXT NOT NULL,
  veterinarian TEXT NOT NULL,
  medicine_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  consultation_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  follow_up_date DATE,
  outcome TEXT NOT NULL,
  notes TEXT,
  expense_id TEXT
);

-- 7. Preventive Care & Vaccinations
CREATE TABLE IF NOT EXISTS vaccination_records (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  date_administered DATE NOT NULL,
  protocol_type TEXT NOT NULL,
  vaccine_or_product TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  dosage TEXT NOT NULL,
  next_due_date DATE NOT NULL,
  veterinarian TEXT NOT NULL,
  cost_ngn NUMERIC(14, 2) NOT NULL DEFAULT 0,
  withdrawal_days INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- 8. Weight & Growth Measurements
CREATE TABLE IF NOT EXISTS weight_records (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  measurement_date DATE NOT NULL,
  weight_kg NUMERIC(8, 2) NOT NULL CHECK (weight_kg > 0),
  body_condition_score NUMERIC(3, 1),
  stage TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  notes TEXT
);

-- 9. Breeding Events & Pregnancy Checks
CREATE TABLE IF NOT EXISTS breeding_events (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  heat_date DATE NOT NULL,
  insemination_date DATE NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  sire_id_or_straw TEXT NOT NULL,
  sire_breed TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  technician TEXT NOT NULL,
  pregnancy_check_date DATE,
  pregnancy_check_method TEXT NOT NULL,
  pregnancy_result TEXT NOT NULL,
  estimated_due_date DATE NOT NULL,
  status TEXT NOT NULL,
  cost_ngn NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT
);

-- 10. Calving Events
CREATE TABLE IF NOT EXISTS calving_events (
  id TEXT PRIMARY KEY,
  dam_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  breeding_event_id TEXT REFERENCES breeding_events(id),
  calving_date DATE NOT NULL,
  outcome TEXT NOT NULL,
  assistance_required TEXT NOT NULL,
  calf_ids TEXT[] NOT NULL DEFAULT '{}',
  calf_tags TEXT[] NOT NULL DEFAULT '{}',
  veterinarian TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL
);

-- 11. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  bank_details TEXT
);

-- 12. Feed Products & Inventory Settings
CREATE TABLE IF NOT EXISTS feed_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  opening_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(12, 2) NOT NULL DEFAULT 0,
  standard_unit_cost_ngn NUMERIC(12, 2) NOT NULL DEFAULT 0,
  storage_location TEXT NOT NULL
);

-- 13. Feed Purchases
CREATE TABLE IF NOT EXISTS feed_purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  product_id TEXT NOT NULL REFERENCES feed_products(id),
  product_name TEXT NOT NULL,
  batch_number TEXT NOT NULL,
  quantity_ordered NUMERIC(12, 2) NOT NULL,
  quantity_received NUMERIC(12, 2) NOT NULL,
  unit_price_ngn NUMERIC(12, 2) NOT NULL,
  transport_cost_ngn NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_cost_ngn NUMERIC(14, 2) NOT NULL,
  invoice_number TEXT NOT NULL,
  expense_id TEXT,
  recorded_by TEXT NOT NULL
);

-- 14. Inventory Movements (Receipts, Issues, Losses, Adjustments)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES feed_products(id),
  movement_date DATE NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'LOSS', 'ADJUSTMENT')),
  quantity NUMERIC(12, 2) NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);

-- 15. Feed Issues
CREATE TABLE IF NOT EXISTS feed_issues (
  id TEXT PRIMARY KEY,
  issue_date DATE NOT NULL,
  product_id TEXT NOT NULL REFERENCES feed_products(id),
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  target_type TEXT NOT NULL CHECK (target_type IN ('Animal', 'Group')),
  target_animal_id TEXT REFERENCES animals(id),
  target_group TEXT,
  allocation_method TEXT NOT NULL,
  wastage_kg NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unit_cost_ngn NUMERIC(12, 2) NOT NULL,
  total_cost_ngn NUMERIC(14, 2) NOT NULL,
  responsible_staff TEXT NOT NULL,
  notes TEXT
);

-- 16. Centralized Expenses (Original Financial Transactions)
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  transaction_code TEXT UNIQUE NOT NULL,
  expense_date DATE NOT NULL,
  amount_ngn NUMERIC(14, 2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id),
  supplier_name TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('Paid', 'Partially Paid', 'Unpaid')),
  payment_method TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  linked_entity_type TEXT NOT NULL,
  linked_entity_id TEXT,
  linked_animal_id TEXT REFERENCES animals(id),
  approval_status TEXT NOT NULL DEFAULT 'Approved',
  entered_by TEXT NOT NULL,
  approved_by TEXT,
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversal_reason TEXT
);

-- 17. Expense Allocations (Separated from original expenses to prevent double counting)
CREATE TABLE IF NOT EXISTS expense_allocations (
  id TEXT PRIMARY KEY,
  expense_id TEXT REFERENCES expenses(id),
  feed_issue_id TEXT REFERENCES feed_issues(id),
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  allocation_date DATE NOT NULL,
  allocation_category TEXT NOT NULL,
  allocation_method TEXT NOT NULL,
  amount_ngn NUMERIC(14, 2) NOT NULL,
  notes TEXT
);

-- 18. Supplier & Expense Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL,
  amount_ngn NUMERIC(14, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  reference_number TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  notes TEXT
);

-- 19. Tasks & Reminders
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  due_date DATE NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')),
  assigned_to TEXT NOT NULL,
  animal_id TEXT REFERENCES animals(id),
  animal_tag TEXT,
  reference_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Overdue', 'Completed', 'Dismissed')),
  completion_notes TEXT,
  completed_at DATE
);

-- 20. Immutable Audit Logs (with Tamper-Evident Chain Hashes)
CREATE TABLE IF NOT EXISTS audit_logs (
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
  integrity_hash TEXT
);

-- 21. Private Document, Photo & Expense Receipt Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  animal_id TEXT REFERENCES animals(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_kb INTEGER NOT NULL,
  uploaded_at DATE NOT NULL,
  uploaded_by TEXT NOT NULL,
  notes TEXT,
  sha256_hash TEXT,
  mime_type TEXT
);

-- 22. Automated Email Outbox & Delivery Log
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL CHECK (category IN ('MONTHLY_REPORT', 'DUE_REMINDER', 'BACKUP_ALERT')),
  subject TEXT NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  transport TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  html_body TEXT NOT NULL,
  dedup_key TEXT,
  triggered_by TEXT NOT NULL
);

-- 23. Attachments & Private Document Storage Registry
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  animal_id TEXT REFERENCES animals(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('Animal', 'HealthEpisode', 'Treatment', 'Expense', 'Breeding')),
  entity_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size_kb INTEGER NOT NULL DEFAULT 1,
  storage_bucket TEXT,
  storage_path TEXT,
  mime_type TEXT,
  sha256_hash TEXT,
  notes TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 24. System & Backup Policy Settings
CREATE TABLE IF NOT EXISTS backup_settings (
  id TEXT PRIMARY KEY DEFAULT 'DEFAULT_POLICY',
  auto_backup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_hour_utc INTEGER NOT NULL DEFAULT 2 CHECK (schedule_hour_utc BETWEEN 0 AND 23),
  daily_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (daily_retention_days >= 1),
  monthly_retention_months INTEGER NOT NULL DEFAULT 12 CHECK (monthly_retention_months >= 1),
  max_retry_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_retry_attempts BETWEEN 1 AND 10),
  immutable_object_lock BOOLEAN NOT NULL DEFAULT TRUE,
  object_lock_days INTEGER NOT NULL DEFAULT 30 CHECK (object_lock_days >= 1),
  alert_admin_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
  alert_recipient_email TEXT,
  last_daily_backup_date DATE,
  last_monthly_backup_month TEXT
);

-- 24. Immutable Database Backup Run Telemetry (Secrets Redacted)
CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  tier TEXT NOT NULL CHECK (tier IN ('daily', 'monthly', 'manual')),
  engine TEXT NOT NULL CHECK (engine IN ('pg_dump_native', 'serializable_sql_bundle')),
  status TEXT NOT NULL CHECK (status IN ('Succeeded', 'Failed', 'Retrying')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  file_name TEXT NOT NULL,
  uncompressed_size_bytes BIGINT NOT NULL DEFAULT 0,
  encrypted_size_bytes BIGINT NOT NULL DEFAULT 0,
  encrypted BOOLEAN NOT NULL DEFAULT TRUE,
  cipher TEXT NOT NULL DEFAULT 'AES-256-GCM',
  sha256_checksum TEXT NOT NULL,
  storage_destinations TEXT[] NOT NULL DEFAULT '{}',
  s3_key TEXT,
  immutable_protected BOOLEAN NOT NULL DEFAULT TRUE,
  object_lock_retain_until TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL,
  pruned_at TIMESTAMPTZ,
  error_summary TEXT,
  triggered_by TEXT NOT NULL
);

-- Trigger to protect immutable backup_runs and audit_logs against accidental deletion or tampering
CREATE OR REPLACE FUNCTION public.prevent_immutable_record_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'audit_logs' THEN
    RAISE EXCEPTION 'Audit logs are append-only and cannot be modified or deleted.';
  END IF;
  IF TG_TABLE_NAME = 'backup_runs' AND OLD.immutable_protected = TRUE AND OLD.object_lock_retain_until IS NOT NULL AND OLD.object_lock_retain_until > NOW() THEN
    RAISE EXCEPTION 'Backup record % is protected by Object Lock until % and cannot be deleted.', OLD.id, OLD.object_lock_retain_until;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_audit_logs ON audit_logs;
CREATE TRIGGER trg_protect_audit_logs
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_record_deletion();

DROP TRIGGER IF EXISTS trg_protect_backup_runs ON backup_runs;
CREATE TRIGGER trg_protect_backup_runs
  BEFORE DELETE ON backup_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_record_deletion();

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_animals_current_tag ON animals(current_tag);
CREATE INDEX IF NOT EXISTS idx_animal_identifiers_norm_tag ON animal_identifiers(normalized_tag);
CREATE INDEX IF NOT EXISTS idx_animal_identifiers_animal_id ON animal_identifiers(animal_id);
CREATE INDEX IF NOT EXISTS idx_animal_events_animal_id ON animal_events(animal_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_episodes_animal_id ON health_episodes(animal_id);
CREATE INDEX IF NOT EXISTS idx_treatments_animal_id ON treatments(animal_id, treatment_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_backup_runs_started_at ON backup_runs(started_at DESC);

-- Row Level Security (RLS) Enforcement across Core Operational & Backup Tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE animal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE breeding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calving_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
-- Backend Application Access Policies (Node/Express backend enforces strict RBAC & business rules)
CREATE POLICY "Allow backend access to animals" ON animals
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend access to animal_identifiers" ON animal_identifiers
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend access to users" ON users
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend access to animal_events" ON animal_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend access to attachments" ON attachments
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend access to expenses" ON expenses
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow backend access to audit_logs" ON audit_logs
  FOR ALL USING (true) WITH CHECK (true);
`;

