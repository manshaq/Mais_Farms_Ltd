-- ==============================================================================
-- MAIS LTD Livestock Management System — Database Migration
-- Version: 20261028000002
-- Name: add_missing_persistence_tables
-- Description: Adds the four tables the app already models in memory
--              (notification_settings, backup_settings, backup_runs, email_logs)
--              but which were never created by an earlier migration, extends
--              expense_allocations so shared-feed-cost allocations (which
--              reference a feed_issue, not an expense) can be stored, and
--              fixes public.tasks to match the columns and status values the
--              application actually uses.
-- ==============================================================================

-- 1. Notification settings (single row, singleton)
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  auto_monthly_report_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_report_day_of_month INTEGER NOT NULL DEFAULT 1,
  auto_daily_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_lead_days INTEGER NOT NULL DEFAULT 1,
  additional_recipient_emails TEXT NOT NULL DEFAULT '',
  last_monthly_report_sent_month TEXT,
  last_daily_reminder_run_date TEXT
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to notification_settings" ON public.notification_settings;
CREATE POLICY "Allow backend access to notification_settings" ON public.notification_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Backup policy settings (single row, singleton)
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  auto_backup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_hour_utc INTEGER NOT NULL DEFAULT 2,
  daily_retention_days INTEGER NOT NULL DEFAULT 30,
  monthly_retention_months INTEGER NOT NULL DEFAULT 12,
  max_retry_attempts INTEGER NOT NULL DEFAULT 3,
  immutable_object_lock BOOLEAN NOT NULL DEFAULT TRUE,
  object_lock_days INTEGER NOT NULL DEFAULT 30,
  alert_admin_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
  alert_recipient_email TEXT NOT NULL DEFAULT '',
  last_daily_backup_date TEXT,
  last_monthly_backup_month TEXT
);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to backup_settings" ON public.backup_settings;
CREATE POLICY "Allow backend access to backup_settings" ON public.backup_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Backup run log
CREATE TABLE IF NOT EXISTS public.backup_runs (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  tier TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL,
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
  immutable_protected BOOLEAN NOT NULL DEFAULT FALSE,
  object_lock_retain_until TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL,
  pruned_at TIMESTAMPTZ,
  error_summary TEXT,
  triggered_by TEXT NOT NULL
);

ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to backup_runs" ON public.backup_runs;
CREATE POLICY "Allow backend access to backup_runs" ON public.backup_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Outbound email log (monthly reports, reminders, backup alerts)
CREATE TABLE IF NOT EXISTS public.email_logs (
  id TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  transport TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]',
  dedup_key TEXT,
  triggered_by TEXT NOT NULL
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow backend access to email_logs" ON public.email_logs;
CREATE POLICY "Allow backend access to email_logs" ON public.email_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Allow expense_allocations to also reference a feed_issue (shared feed-cost
--    allocations have no Expense yet when they're recorded) and to carry the
--    allocation date/category the app already tracks.
ALTER TABLE public.expense_allocations ALTER COLUMN expense_id DROP NOT NULL;
ALTER TABLE public.expense_allocations
  ADD COLUMN IF NOT EXISTS feed_issue_id TEXT REFERENCES public.feed_issues(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS allocation_date DATE,
  ADD COLUMN IF NOT EXISTS allocation_category TEXT;

ALTER TABLE public.expense_allocations
  DROP CONSTRAINT IF EXISTS expense_allocations_source_check;
ALTER TABLE public.expense_allocations
  ADD CONSTRAINT expense_allocations_source_check
  CHECK (expense_id IS NOT NULL OR feed_issue_id IS NOT NULL);

-- 6. public.tasks: add the reference_id/animal_tag columns the app tracks on
--    every FarmTask (used to dedupe and auto-complete tasks), and widen the
--    status CHECK to the values the application actually assigns
--    ('Overdue', 'Dismissed') instead of the unused 'In Progress'/'Cancelled'.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS animal_tag TEXT;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('Pending', 'Overdue', 'Completed', 'Dismissed'));
