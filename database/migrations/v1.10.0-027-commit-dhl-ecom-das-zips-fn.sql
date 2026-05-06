-- =============================================================================
-- Migration v1.10.0-027: commit_dhl_ecom_das_zips_upload() PG function
-- =============================================================================
-- Purpose: Atomic TRUNCATE + bulk INSERT for the DHL DAS ZIPs upload flow.
--   Mirrors the v1.10.0-023 (DHL Domestic) and v1.10.0-025 (GOFO Standard)
--   commit functions, with TRUNCATE in place of scope-deleted DELETE since
--   dhl_ecom_das_zips holds only DHL DAS data — no other carrier or service
--   shares the table, so a full TRUNCATE is the cleanest active-set wipe.
--
-- Inputs:
--   p_rows  — JSONB array of dhl_ecom_das_zips row objects produced by
--             parseDhlEcomDasZipsFile (22,264 rows at typical full-set load)
--
-- Returns:
--   jsonb with zips_written (single key, mirrors matrix_rows_written from
--   the zone-matrices commit functions)
--
-- Why TRUNCATE not DELETE:
--   This table holds exactly one carrier's DAS list. There's no scope
--   discriminator to filter on (unlike carrier_zone_matrices which mixes
--   DHL_ECOM/Ground and GOFO/Standard rows). TRUNCATE is faster and resets
--   the underlying storage; DELETE WHERE TRUE would do the same logical
--   thing more slowly.
--
-- Atomic semantic:
--   Function body is one transaction. If the INSERT fails mid-stream, the
--   TRUNCATE rolls back too and the prior active set survives. Same
--   discipline as PATTERNS.md Pattern 4.
--
-- Pattern 6 discipline: explicit GRANT EXECUTE alongside SECURITY DEFINER.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commit_dhl_ecom_das_zips_upload(
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_zip_count integer;
BEGIN
  -- 1. Wipe prior active set. Full TRUNCATE — this table holds exactly one
  --    carrier's DAS list, no scope discriminator needed.
  TRUNCATE TABLE dhl_ecom_das_zips;

  -- 2. Bulk INSERT new rows from the JSONB array. INSERT FROM
  --    jsonb_array_elements is performant for 22k rows in one shot.
  INSERT INTO dhl_ecom_das_zips (
    zip5, effective_date, source, notes
  )
  SELECT
    v->>'zip5',
    (v->>'effective_date')::date,
    v->>'source',
    v->>'notes'
  FROM jsonb_array_elements(p_rows) v;
  GET DIAGNOSTICS v_zip_count = ROW_COUNT;

  -- Function body is one transaction: if INSERT fails mid-stream, the
  -- TRUNCATE is rolled back too and the prior active set survives.
  RETURN jsonb_build_object(
    'zips_written', v_zip_count
  );
END;
$$;

COMMENT ON FUNCTION public.commit_dhl_ecom_das_zips_upload IS
  'Atomic truncate-and-replace for the DHL DAS ZIPs upload flow. Called by '
  'the Alamo''s commit Server Action via supabase-js .rpc() after the '
  'operator confirms a parsed XLSX preview. TRUNCATEs dhl_ecom_das_zips and '
  'INSERTs the parsed rows from the supplied JSONB array (typically 22,264 '
  'rows for a full DAS ZIP list). See migration v1.10.0-020 for the staging '
  'bucket and PATTERNS.md Pattern 4 for the atomic-write discipline.';

GRANT EXECUTE ON FUNCTION public.commit_dhl_ecom_das_zips_upload(jsonb)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Verification queries (run manually after applying):
-- ----------------------------------------------------------------------------
-- SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc WHERE proname = 'commit_dhl_ecom_das_zips_upload';
-- Expected: 1 row, prosecdef=true, args = 'p_rows jsonb'
--
-- -- Smoke test with a 1-row payload (TRUNCATE + 1 INSERT inside the function).
-- -- Run only AFTER you're prepared to lose any existing dhl_ecom_das_zips rows.
-- SELECT public.commit_dhl_ecom_das_zips_upload(
--   '[{"zip5":"00501","effective_date":"2026-01-18","source":"smoke test","notes":null}]'::jsonb
-- );
-- Expected: '{"zips_written": 1}'
-- (After smoke test, the table will hold only the 1 smoke-test row; re-run
-- the real upload to restore.)
