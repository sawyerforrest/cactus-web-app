-- =============================================================================
-- Migration v1.10.0-020: pld-uploads Storage bucket + RLS + cleanup cron
-- =============================================================================
-- Purpose: Create the pld-uploads Storage bucket used by all PLD upload
--   screens to stage XLSX files between the preview and commit steps of
--   the two-stage upload flow. Add RLS policies for authenticated user
--   access. Schedule a daily cron job to sweep abandoned stage files.
--
-- Path namespacing convention (set by application code, not enforced here):
--   pld-uploads/coverage-zips/<uuid>.xlsx       — GOFO Regional Coverage
--   pld-uploads/zone-matrices/<uuid>.xlsx       — DHL eCom zone matrices
--   pld-uploads/rate-cards/<uuid>.xlsx          — Analysis rate cards
--
-- Cleanup is layered:
--   1. Commit success in the application — the commit Server Action calls
--      storage.from('pld-uploads').remove([path]) immediately after the
--      atomic dual-table write completes.
--   2. Daily cron sweep — pld-uploads-cleanup-stale runs at 08:00 UTC and
--      removes stage files older than 24 hours, catching abandoned
--      previews where the operator never clicked Commit.
--
-- Schema verification (Pattern 1, ran 2026-05-05):
--   service_coverage_zips: id, carrier_code, service_level, zip5,
--     is_serviceable, effective_date, deprecated_date, source, notes,
--     created_at — matches parser output
--   gofo_regional_zone_matrix: id, matrix_version, injection_point,
--     dest_zip5, zone, effective_date, deprecated_date, source, notes,
--     created_at — matches parser output
--
-- This migration does NOT extend any enums (Pattern 2 split not needed).
-- Single apply_migration call should succeed.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create the bucket
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'pld-uploads',
  'pld-uploads',
  false,
  26214400,  -- 25 MB
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. RLS policies on storage.objects scoped to this bucket
-- ----------------------------------------------------------------------------
-- The application uses service_role which bypasses RLS, so these policies
-- exist primarily as belt-and-suspenders for any future client-side direct
-- uploads, and to keep the bucket cleanly isolated from any future
-- bucket-level public access.
--
-- The owner column on storage.objects is auto-set to auth.uid() on INSERT
-- by Supabase storage triggers. We scope SELECT and DELETE to the
-- file's owner to prevent operators reading or deleting each other's
-- in-flight uploads (anticipating the multi-operator world post-v1.5).

CREATE POLICY "pld_uploads_authenticated_insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pld-uploads');

CREATE POLICY "pld_uploads_authenticated_select_own"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pld-uploads' AND owner = auth.uid());

CREATE POLICY "pld_uploads_authenticated_delete_own"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pld-uploads' AND owner = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. Daily cleanup cron
-- ----------------------------------------------------------------------------
-- Sweeps stage files older than 24 hours. The 24-hour window covers
-- abandoned previews while leaving headroom for an operator who walks
-- away mid-flow and returns later in the day. Removing the storage.objects
-- row triggers Supabase's storage backend to delete the underlying blob
-- asynchronously.

SELECT cron.schedule(
  'pld-uploads-cleanup-stale',
  '0 8 * * *',
  $cron$
  DELETE FROM storage.objects
  WHERE bucket_id = 'pld-uploads'
    AND created_at < (now() - interval '24 hours');
  $cron$
);

-- ----------------------------------------------------------------------------
-- Verification queries (run these manually after applying)
-- ----------------------------------------------------------------------------
-- SELECT id, name, public, file_size_limit, allowed_mime_types
-- FROM storage.buckets WHERE id = 'pld-uploads';
-- Expected: 1 row, public=false, file_size_limit=26214400, mime_types=2 entries
--
-- SELECT policyname FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'pld_uploads%';
-- Expected: 3 rows (insert, select_own, delete_own)
--
-- SELECT jobid, jobname, schedule, active FROM cron.job
-- WHERE jobname = 'pld-uploads-cleanup-stale';
-- Expected: 1 row, schedule = '0 8 * * *', active = true
