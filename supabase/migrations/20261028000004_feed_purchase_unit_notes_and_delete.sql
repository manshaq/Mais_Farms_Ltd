-- ==============================================================================
-- MAIS LTD Livestock Management System — Database Migration
-- Version: 20261028000004
-- Name: feed_purchase_unit_notes_and_delete
-- Description: feed_purchases was missing the `unit` (bags/kg/litres/etc,
--              inherited from the feed product at purchase time) and `notes`
--              columns the app now records on every purchase. Also adds
--              optional quantity/unit/price-per-unit columns to expenses for
--              quantity-based general expenses (feed purchases already have
--              their own dedicated table/columns for this).
-- ==============================================================================

ALTER TABLE public.feed_purchases
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Optional quantity-based pricing for general expenses (e.g. "5 bags of
-- cement at NGN 12,000 each"). Fixed expenses (a repair bill, a flat fee)
-- leave these null and just use amount_ngn directly, as before.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS price_per_unit_ngn NUMERIC(14, 2);
