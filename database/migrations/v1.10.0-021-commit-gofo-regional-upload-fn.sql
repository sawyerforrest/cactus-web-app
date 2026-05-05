-- =============================================================================
-- Migration v1.10.0-021: commit_gofo_regional_upload() PG function
-- =============================================================================
-- Purpose: Provide a single Postgres function that performs the atomic
-- dual-table TRUNCATE + bulk INSERT for the GOFO Regional Coverage upload
-- flow. Function bodies are naturally one transaction, so calling this via
-- supabase-js .rpc() gives us the atomic write semantic the spec requires
-- without exposing explicit BEGIN/COMMIT to the application layer.
--
-- Inputs:
--   p_coverage  — JSONB array of service_coverage_zips row objects
--   p_matrix    — JSONB array of gofo_regional_zone_matrix row objects
--
-- Returns:
--   jsonb with two keys: coverage_rows_written and matrix_rows_written
--
-- Why SECURITY DEFINER + hardened search_path:
--   The Alamo's commit Server Action runs as service_role which already
--   bypasses RLS, so SECURITY DEFINER doesn't grant additional privilege
--   here. We mark it anyway to keep the function's effective grantee
--   stable if/when an authenticated-user invocation path is added in the
--   future. search_path is pinned to (public, pg_temp) per Supabase
--   security advisor guidance, so the function can't be hijacked by
--   placing a same-named relation in a temp schema.
--
-- Schema reference (verified Pattern 1, 2026-05-05):
--   service_coverage_zips columns:
--     carrier_code, service_level, zip5, is_serviceable, effective_date,
--     source (id, deprecated_date, notes, created_at have defaults / NULL)
--   gofo_regional_zone_matrix columns:
--     matrix_version, injection_point, dest_zip5, zone, effective_date,
--     source (id, deprecated_date, notes, created_at have defaults / NULL)
--
-- This migration does NOT extend any enums (Pattern 2 split not needed).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commit_gofo_regional_upload(
  p_coverage jsonb,
  p_matrix jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_coverage_count integer;
  v_matrix_count integer;
BEGIN
  -- 1. Wipe prior active set in both tables.
  TRUNCATE TABLE service_coverage_zips;
  TRUNCATE TABLE gofo_regional_zone_matrix;

  -- 2. Bulk INSERT coverage rows from the JSONB array.
  INSERT INTO service_coverage_zips (
    carrier_code, service_level, zip5, is_serviceable,
    effective_date, source
  )
  SELECT
    (v->>'carrier_code')::carrier_code_enum,
    v->>'service_level',
    v->>'zip5',
    (v->>'is_serviceable')::boolean,
    (v->>'effective_date')::date,
    v->>'source'
  FROM jsonb_array_elements(p_coverage) v;
  GET DIAGNOSTICS v_coverage_count = ROW_COUNT;

  -- 3. Bulk INSERT zone matrix rows from the JSONB array.
  INSERT INTO gofo_regional_zone_matrix (
    matrix_version, injection_point, dest_zip5, zone,
    effective_date, source
  )
  SELECT
    v->>'matrix_version',
    (v->>'injection_point')::gofo_hub_enum,
    v->>'dest_zip5',
    v->>'zone',
    (v->>'effective_date')::date,
    v->>'source'
  FROM jsonb_array_elements(p_matrix) v;
  GET DIAGNOSTICS v_matrix_count = ROW_COUNT;

  -- Function body is one transaction. If either INSERT fails, both
  -- TRUNCATEs are rolled back — the caller sees an error and the prior
  -- active set remains intact.
  RETURN jsonb_build_object(
    'coverage_rows_written', v_coverage_count,
    'matrix_rows_written', v_matrix_count
  );
END;
$$;

COMMENT ON FUNCTION public.commit_gofo_regional_upload IS
  'Atomic two-table replace for the GOFO Regional Coverage upload flow. '
  'Called by the Alamo''s commit Server Action via supabase-js .rpc() '
  'after the operator confirms a parsed XLSX preview. Truncates both '
  'service_coverage_zips and gofo_regional_zone_matrix and inserts the '
  'parsed rows from the supplied JSONB arrays. See migration v1.10.0-020 '
  'for the staging bucket and PATTERNS.md Pattern 4 for the atomic-write '
  'discipline.';

-- Grant execute to authenticated for completeness; service_role can call
-- regardless. Anon does NOT get execute privilege.
GRANT EXECUTE ON FUNCTION public.commit_gofo_regional_upload(jsonb, jsonb)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Verification (run manually after applying):
-- ----------------------------------------------------------------------------
-- SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc
-- WHERE proname = 'commit_gofo_regional_upload';
-- Expected: 1 row, prosecdef=true, args = 'p_coverage jsonb, p_matrix jsonb'
--
-- -- Smoke test with a tiny inline payload (does TRUNCATE + 1 row each).
-- -- Run after Phase 2b end-to-end test to confirm the function works.
-- SELECT public.commit_gofo_regional_upload(
--   '[{"carrier_code":"GOFO","service_level":"Regional","zip5":"00000","is_serviceable":true,"effective_date":"2026-04-28","source":"smoke test"}]'::jsonb,
--   '[{"matrix_version":"smoke","injection_point":"LAX","dest_zip5":"00000","zone":"1","effective_date":"2026-04-28","source":"smoke test"}]'::jsonb
-- );
-- Expected: '{"coverage_rows_written": 1, "matrix_rows_written": 1}'
