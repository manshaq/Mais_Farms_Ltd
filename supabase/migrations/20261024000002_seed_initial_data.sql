-- ==============================================================================
-- MAIS LTD LIVESTOCK MANAGEMENT SYSTEM: INITIAL SEED DATA
-- Migration: 20261024000002_seed_initial_data.sql
-- ==============================================================================

-- 1. Initial Default Administrator
INSERT INTO public.users (id, full_name, email, role, title, can_approve_expenses, status)
VALUES (
  'USR-01',
  'Bello Aliyu',
  'belloaliyu808@gmail.com',
  'Admin',
  'Administrator',
  TRUE,
  'Active'
)
ON CONFLICT (id) DO UPDATE
SET role = 'Admin', can_approve_expenses = TRUE;

