-- ==============================================================================
-- MAIS LTD Livestock Management System — Database Migration
-- Version: 20261027000001
-- Name: add_user_soft_delete
-- Description: Add deleted flag on public.users to support non-destructive soft-delete
-- ==============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT FALSE;
