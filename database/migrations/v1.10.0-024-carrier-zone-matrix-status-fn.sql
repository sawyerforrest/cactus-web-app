-- =============================================================================
-- Migration v1.10.0-024: carrier_zone_matrix_status() helper function
-- =============================================================================
-- Purpose: Server-side aggregate that returns total row count, distinct
-- origin-DC count, latest effective_date, and latest created_at scoped to a
-- given (carrier_code, service_level). Used by Reference Data UI surfaces
-- (index card + per-page LoadedCard) so the displayed numbers are computed
-- in the database rather than client-side over a sampled row slice.
--
-- Why this exists:
--   The naive UI pattern was "fetch up to 20,000 origin_zip3 values via
--   PostgREST and dedup client-side to count DCs". That doesn't work
--   reliably: PostgREST caps response rows server-side, and for a fully
--   loaded DHL Domestic Zone matrix (16,740 rows in a single transaction
--   so all created_at values tie) the truncated slice contained only 2
--   distinct origin_zip3 values. The page rendered "16,740 rows · 2 DCs"
--   instead of "18 DCs". Aggregating in the database and returning a
--   single row sidesteps the row-cap entirely.
--
--   Same bug shape applied to the Reference Data index page's DHL row;
--   both surfaces now consume this function via supabase-js .rpc().
--
--   Generalized over (carrier, service) so the GOFO Standard add-on
--   coming next can use the same helper without another migration.
--
-- Schema reference (verified Pattern 1, 2026-05-05): carrier_zone_matrices
-- has carrier_code (carrier_code_enum), service_level (text),
-- origin_zip3 (char(3)), effective_date (date), deprecated_date (date),
-- created_at (timestamptz). All read-only here.
--
-- STABLE function — no side effects, deterministic for a given DB state.
-- Postgres can cache the result within a single statement evaluation.
--
-- SECURITY DEFINER + pinned search_path per the v1.10.0-021/-023 pattern.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.carrier_zone_matrix_status(
  p_carrier carrier_code_enum,
  p_service text
)
RETURNS TABLE (
  total_rows         integer,
  distinct_dcs       integer,
  latest_effective   date,
  latest_created_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    count(*)::integer                  AS total_rows,
    count(DISTINCT origin_zip3)::integer AS distinct_dcs,
    max(effective_date)                AS latest_effective,
    max(created_at)                    AS latest_created_at
  FROM carrier_zone_matrices
  WHERE carrier_code = p_carrier
    AND service_level = p_service
    AND deprecated_date IS NULL;
$$;

COMMENT ON FUNCTION public.carrier_zone_matrix_status IS
  'Returns aggregate stats for a (carrier_code, service_level) slice of '
  'carrier_zone_matrices: row count, distinct origin DC count, latest '
  'effective_date, latest created_at. Used by Reference Data UI surfaces '
  'so DC count is computed server-side instead of via a row-capped '
  'PostgREST sample. STABLE; safe to call on every page render.';

GRANT EXECUTE ON FUNCTION public.carrier_zone_matrix_status(carrier_code_enum, text)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Verification (run manually after applying):
-- ----------------------------------------------------------------------------
-- SELECT * FROM public.carrier_zone_matrix_status('DHL_ECOM', 'Ground');
-- Expected after a successful 18-DC upload: total_rows=16740, distinct_dcs=18,
-- latest_effective=<date from UPDATED column>, latest_created_at=<commit timestamp>
