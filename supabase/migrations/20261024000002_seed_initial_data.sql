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

-- 2. Core Initial Feed Products
INSERT INTO public.feed_products (id, name, category, unit, opening_stock, reorder_level, standard_unit_cost_ngn, storage_location)
VALUES 
  ('FP-01', 'Dairy Cattle Concentrate 18%', 'Concentrate', 'kg', 5000.00, 1000.00, 320.00, 'Feed Mill - Silo A'),
  ('FP-02', 'Maize Silage High Energy', 'Roughage / Silage', 'kg', 12000.00, 2500.00, 85.00, 'Silage Bunker 1'),
  ('FP-03', 'Calf Starter Pellets 20%', 'Calf Milk Replacer', 'kg', 1500.00, 400.00, 480.00, 'Calf Barn Storage'),
  ('FP-04', 'Dairy Mineral & Vitamin Premix', 'Mineral / Supplement', 'kg', 800.00, 200.00, 1250.00, 'Dry Storage Bay 3')
ON CONFLICT (id) DO NOTHING;

-- 3. Core Initial Suppliers
INSERT INTO public.suppliers (id, name, category, contact_person, phone, email, address, payment_terms)
VALUES
  ('SUP-01', 'Premier Agro Mills Kaduna', 'Feed Ingredients', 'Musa Ibrahim', '+234 803 111 2233', 'orders@premieragro.ng', 'Plot 14 Industrial Layout, Kaduna', 'Net 30'),
  ('SUP-02', 'Grand Cereals & Feeds Jos', 'Concentrates & Premixes', 'Grace Danjuma', '+234 802 333 4455', 'sales@grandcereals.ng', 'Bukuru Expressway, Jos, Plateau', '15 Days'),
  ('SUP-03', 'VetCare West Africa Ltd', 'Veterinary Pharmaceuticals', 'Dr. Emeka Obi', '+234 805 555 6677', 'dispatch@vetcare.ng', 'Victoria Island, Lagos', 'Immediate Bank Transfer')
ON CONFLICT (id) DO NOTHING;
