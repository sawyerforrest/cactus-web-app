-- =============================================================================
-- Migration v1.10.0-023: commit_dhl_ecom_zones_upload() PG function
-- =============================================================================
-- Purpose: Single Postgres function that performs the atomic scoped-DELETE +
--   bulk INSERT for the DHL eCom Domestic Zone Matrices upload flow. Function
--   bodies are naturally one transaction, so calling this via supabase-js
--   .rpc() gives the atomic write semantic the spec requires without exposing
--   explicit BEGIN/COMMIT to the application layer.
--
-- Inputs:
--   p_rows  — JSONB array of carrier_zone_matrices row objects produced by
--             parseDhlEcomZonesFiles (16,740 rows at typical full-set load)
--
-- Returns:
--   jsonb with matrix_rows_written (single key — DHL Domestic Zones operates
--   on one target table, unlike GOFO Regional Coverage which writes both a
--   coverage table and a matrix table)
--
-- Scope:
--   The DELETE is filtered to carrier_code='DHL_ECOM' AND service_level='Ground'
--   so other carriers' zone data (future GOFO Standard, USPS, etc.) is
--   untouched. Any future DHL service levels that share this matrix will
--   need a careful refactor — for v1, 'Ground' is the only DHL eCom service
--   that consumes this matrix.
--
-- Why SECURITY DEFINER + hardened search_path:
--   Same rationale as v1.10.0-021's commit_gofo_regional_upload — keeps the
--   function's effective grantee stable if/when an authenticated-user
--   invocation path is added later, and prevents temp-schema-name-collision
--   hijacking. Function owner is postgres (Supabase default for migration-
--   created functions).
--
-- Schema reference (verified Pattern 1, 2026-05-05):
--   carrier_zone_matrices columns:
--     carrier_code (carrier_code_enum), service_level, matrix_version,
--     origin_zip3, dest_zip3, zone, effective_date, source, notes
--     (id, deprecated_date, created_at have defaults)
--
-- This migration does NOT extend any enums (Pattern 2 split not needed).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commit_dhl_ecom_zones_upload(
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_matrix_count integer;
BEGIN
  -- 1. Wipe prior active set scoped to DHL_ECOM/Ground only. Other carriers'
  --    rows on the same table are untouched.
  DELETE FROM carrier_zone_matrices
  WHERE carrier_code = 'DHL_ECOM' AND service_level = 'Ground';

  -- 2. Bulk INSERT new rows from the JSONB array. INSERT FROM jsonb_array_elements
  --    is performant for 16k rows in one shot — Postgres parses the JSONB once
  --    and iterates internally; no need for explicit chunking at this size.
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

COMMENT ON FUNCTION public.commit_dhl_ecom_zones_upload IS
  'Atomic scoped-replace for the DHL eCom Domestic Zone Matrices upload flow. '
  'Called by the Alamo''s commit Server Action via supabase-js .rpc() after '
  'the operator confirms a parsed XLSX preview. DELETEs prior DHL_ECOM/Ground '
  'rows from carrier_zone_matrices and INSERTs the parsed rows from the '
  'supplied JSONB array (typically 16,740 rows for a full 18-DC upload). '
  'See migration v1.10.0-020 for the staging bucket and PATTERNS.md Pattern 4 '
  'for the atomic-write discipline.';

-- Match the GRANT pattern used elsewhere in v1.10.0 — service_role bypasses
-- RLS already; granting EXECUTE to authenticated keeps a future
-- authenticated-user invocation path open without another migration.
GRANT EXECUTE ON FUNCTION public.commit_dhl_ecom_zones_upload(jsonb)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Verification queries (run manually after applying):
-- ----------------------------------------------------------------------------
-- SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc WHERE proname = 'commit_dhl_ecom_zones_upload';
-- Expected: 1 row, prosecdef=true, args = 'p_rows jsonb'
--
-- -- Smoke test with a 1-row payload (DELETE + 1 INSERT inside the function).
-- -- Run only AFTER the v1.10.0-022 dhl_ecom_dcs lookup is seeded.
-- SELECT public.commit_dhl_ecom_zones_upload(
--   '[{"carrier_code":"DHL_ECOM","service_level":"Ground","matrix_version":"smoke","origin_zip3":"302","dest_zip3":"005","zone":"5","effective_date":"2026-03-22","source":"smoke test","notes":"DC: ATL"}]'::jsonb
-- );
-- Expected: '{"matrix_rows_written": 1}'
-- (After smoke test, the carrier_zone_matrices table will hold only the 1
-- smoke-test row for DHL_ECOM/Ground; re-run the real upload to restore.)
