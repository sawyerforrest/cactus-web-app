-- =============================================================================
-- Migration v1.10.0-025: commit_gofo_standard_zones_upload() PG function
-- =============================================================================
-- Purpose: Atomic scoped-DELETE + bulk INSERT for the GOFO Standard Zone
--   Matrix upload flow. Mirror of v1.10.0-023's commit_dhl_ecom_zones_upload
--   but scoped to (carrier_code='GOFO', service_level='Standard') so the two
--   carriers' rows on carrier_zone_matrices remain disjoint and re-uploads
--   on one service never touch the other's data.
--
-- Inputs:
--   p_rows  — JSONB array of carrier_zone_matrices row objects produced by
--             parseGofoStandardZonesFile (7,448 rows at typical full-set
--             load: 931 ZIP3s × 8 hubs)
--
-- Returns:
--   jsonb with matrix_rows_written (single key — GOFO Standard operates on
--   one target table, like DHL Domestic)
--
-- Scope:
--   The DELETE is filtered to carrier_code='GOFO' AND service_level='Standard'
--   so DHL eCom rows (and any future GOFO Economy rows, should they ever be
--   stored separately) are untouched. Per spec § 2 architectural decision:
--   Economy and Standard share the same zone matrix at rating time, so we
--   only insert Standard; the rating engine reads Standard rows for both.
--
-- Why SECURITY DEFINER + hardened search_path:
--   Same rationale as v1.10.0-021 / v1.10.0-023 — keeps the function's
--   effective grantee stable if/when an authenticated-user invocation path
--   is added later, and prevents temp-schema-name-collision hijacking.
--   Function owner is postgres (Supabase default for migration-created
--   functions).
--
-- Why explicit GRANT EXECUTE:
--   Pattern 6 discipline. v1.10.0-022 was hotfixed once for a missing GRANT;
--   this migration declares the grants explicitly up-front so the canonical
--   .sql is correct on first apply.
--
-- Schema reference (verified Pattern 1, 2026-05-05):
--   carrier_zone_matrices columns:
--     carrier_code (carrier_code_enum), service_level, matrix_version,
--     origin_zip3, dest_zip3, zone, effective_date, source, notes
--     (id, deprecated_date, created_at have defaults)
--   carrier_code_enum: includes 'GOFO' (verified via the existing GOFO
--     Regional Coverage write path)
--
-- This migration does NOT extend any enums (Pattern 2 split not needed).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commit_gofo_standard_zones_upload(
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matrix_count integer;
BEGIN
  -- 1. Wipe prior active set scoped to GOFO/Standard only. Other carriers'
  --    rows on the same table are untouched.
  DELETE FROM carrier_zone_matrices
  WHERE carrier_code = 'GOFO' AND service_level = 'Standard';

  -- 2. Bulk INSERT new rows from the JSONB array. INSERT FROM
  --    jsonb_array_elements is performant for 7k rows in one shot —
  --    Postgres parses the JSONB once and iterates internally; no need
  --    for chunking at this size (DHL's 16,740-row variant uses the
  --    identical pattern with no issues).
  INSERT INTO carrier_zone_matrices (
    carrier_code, service_level, matrix_version, origin_zip3, dest_zip3,
    zone, effective_date, source, notes
  )
  SELECT
    (v->>'carrier_code')::carrier_code_enum,
    v->>'service_level',
    v->>'matrix_version',
    v->>'origin_zip3',
    v->>'dest_zip3',
    v->>'zone',
    (v->>'effective_date')::date,
    v->>'source',
    v->>'notes'
  FROM jsonb_array_elements(p_rows) v;
  GET DIAGNOSTICS v_matrix_count = ROW_COUNT;

  -- Function body is one transaction: if INSERT fails mid-stream, the
  -- DELETE is rolled back too and the prior active set survives.
  RETURN jsonb_build_object(
    'matrix_rows_written', v_matrix_count
  );
END;
$$;

COMMENT ON FUNCTION public.commit_gofo_standard_zones_upload IS
  'Atomic scoped-replace for the GOFO Standard Zone Matrices upload flow. '
  'Called by the Alamo''s commit Server Action via supabase-js .rpc() after '
  'the operator confirms a parsed XLSX preview. DELETEs prior GOFO/Standard '
  'rows from carrier_zone_matrices and INSERTs the parsed rows from the '
  'supplied JSONB array (typically 7,448 rows for a full 8-hub upload — '
  '931 ZIP3s × 8 hubs after lossless ZIP5→ZIP3 aggregation). Per spec § 2 '
  'GOFO Economy uses the same matrix at rating time; only Standard is '
  'inserted here. See migration v1.10.0-020 for the staging bucket and '
  'PATTERNS.md Pattern 4 for the atomic-write discipline.';

GRANT EXECUTE ON FUNCTION public.commit_gofo_standard_zones_upload(jsonb)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Verification queries (run manually after applying):
-- ----------------------------------------------------------------------------
-- SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc WHERE proname = 'commit_gofo_standard_zones_upload';
-- Expected: 1 row, prosecdef=true, args = 'p_rows jsonb'
--
-- -- Smoke test with a 1-row payload (DELETE + 1 INSERT inside the function).
-- -- Run only AFTER you're prepared to lose any existing GOFO/Standard rows.
-- SELECT public.commit_gofo_standard_zones_upload(
--   '[{"carrier_code":"GOFO","service_level":"Standard","matrix_version":"smoke","origin_zip3":"900","dest_zip3":"005","zone":"8","effective_date":"2026-04-28","source":"smoke test","notes":"Hub: LAX"}]'::jsonb
-- );
-- Expected: '{"matrix_rows_written": 1}'
-- (After smoke test, the carrier_zone_matrices table will hold only the 1
-- smoke-test row for GOFO/Standard; re-run the real upload to restore.)
