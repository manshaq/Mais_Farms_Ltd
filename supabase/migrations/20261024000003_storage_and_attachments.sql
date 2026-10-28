-- MAIS LTD LIVESTOCK MANAGEMENT SYSTEM: Storage Buckets & Attachments Schema
-- Migration: 20261024000003_storage_and_attachments.sql

-- 1. Create attachments table for animal photos, vet reports, receipts, and pedigree certificates
CREATE TABLE IF NOT EXISTS public.attachments (
  id TEXT PRIMARY KEY,
  animal_id TEXT REFERENCES public.animals(id) ON DELETE SET NULL,
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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_attachments_animal_id ON public.attachments(animal_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON public.attachments(sha256_hash);

-- Row Level Security (RLS)
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read attachments permitted staff" ON public.attachments;
DROP POLICY IF EXISTS "Write attachments operational staff" ON public.attachments;
DROP POLICY IF EXISTS "Allow backend access to attachments" ON public.attachments;
CREATE POLICY "Allow backend access to attachments" ON public.attachments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Supabase Storage Private Buckets Setup (animal-photos and receipt-documents)
DO $$
BEGIN
  -- Verify if Supabase storage schema exists
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    -- Ensure animal-photos bucket exists (Private)
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'animal-photos',
      'animal-photos',
      FALSE,
      10485760, -- 10MB
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = 10485760;

    -- Ensure receipt-documents bucket exists (Private)
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'receipt-documents',
      'receipt-documents',
      FALSE,
      15728640, -- 15MB
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    )
    ON CONFLICT (id) DO UPDATE
    SET public = FALSE,
        file_size_limit = 15728640;
  END IF;
END $$;

-- 3. Supabase Storage Security Policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    DROP POLICY IF EXISTS "Staff read private animal photos" ON storage.objects;
    DROP POLICY IF EXISTS "Staff upload private attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Staff manage private attachments" ON storage.objects;
    DROP POLICY IF EXISTS "Allow backend storage access" ON storage.objects;
    CREATE POLICY "Allow backend storage access" ON storage.objects
      FOR ALL USING (bucket_id IN ('animal-photos', 'receipt-documents'))
      WITH CHECK (bucket_id IN ('animal-photos', 'receipt-documents'));
  END IF;
END $$;
