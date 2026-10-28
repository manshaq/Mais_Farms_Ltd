-- ==============================================================================
-- MAIS LTD Livestock Management System — Database Migration
-- Version: 20261028000003
-- Name: relax_freeform_category_checks
-- Description: Several "category" columns are modeled in the app as a
--              suggested-options-with-free-text field (the TypeScript types
--              are literally `'PresetA' | 'PresetB' | ... | string`, and the
--              corresponding forms use a SelectWithCustom control that lets
--              staff type any value). The initial schema instead gave these
--              columns a rigid CHECK ... IN (...) constraint, which rejects
--              any value outside its hardcoded list — e.g. registering an
--              animal with a custom type/breed-adjacent label fails with
--              "violates check constraint animals_type_check".
--
--              This drops the CHECK on exactly those open-ended columns.
--              Columns that are true fixed enums controlled entirely by
--              backend logic (role, status workflows, payment/approval
--              status, linked/related entity types, movement/event types,
--              allocation method) are untouched — those still protect data
--              integrity correctly.
-- ==============================================================================

ALTER TABLE public.animals DROP CONSTRAINT IF EXISTS animals_type_check;
ALTER TABLE public.animals DROP CONSTRAINT IF EXISTS animals_sex_check;
ALTER TABLE public.animals DROP CONSTRAINT IF EXISTS animals_acquisition_type_check;
ALTER TABLE public.animals DROP CONSTRAINT IF EXISTS animals_status_check;

ALTER TABLE public.health_episodes DROP CONSTRAINT IF EXISTS health_episodes_severity_check;
ALTER TABLE public.health_episodes DROP CONSTRAINT IF EXISTS health_episodes_status_check;

ALTER TABLE public.treatments DROP CONSTRAINT IF EXISTS treatments_route_check;

ALTER TABLE public.vaccination_records DROP CONSTRAINT IF EXISTS vaccination_records_protocol_type_check;

ALTER TABLE public.weight_records DROP CONSTRAINT IF EXISTS weight_records_stage_check;

ALTER TABLE public.breeding_events DROP CONSTRAINT IF EXISTS breeding_events_pregnancy_result_check;
ALTER TABLE public.breeding_events DROP CONSTRAINT IF EXISTS breeding_events_status_check;

ALTER TABLE public.calving_events DROP CONSTRAINT IF EXISTS calving_events_outcome_check;

ALTER TABLE public.feed_products DROP CONSTRAINT IF EXISTS feed_products_category_check;
