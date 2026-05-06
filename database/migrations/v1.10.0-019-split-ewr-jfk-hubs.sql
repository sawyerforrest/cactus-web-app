-- =============================================================================
-- Migration v1.10.0-019: Split EWR_JFK into EWR and JFK as distinct hubs
-- =============================================================================
-- Purpose: GOFO publishes New Jersey (Newark/EWR) and New York (JFK area) as
--   two distinct rate cards with materially different pricing (311 cell
--   differences between the STDNJ and STDNE sheets in GOFO's published 2026
--   Standard rate book). The current schema collapses them to a single
--   EWR_JFK enum value, which prevents accurate hub-specific pricing.
--
-- This migration:
--   1. Adds 'EWR' and 'JFK' values to gofo_hub_enum (additive, safe).
--   2. Removes the old combined gofo_hubs row for 'EWR_JFK' (CASCADE on FK
--      from gofo_hub_proximity will clear its 896 dependent rows).
--   3. Inserts two new rows into gofo_hubs: EWR (Newark) and JFK (Queens NYC).
--   4. Recomputes gofo_hub_proximity from scratch via Haversine so all 896
--      ZIP3s rank 8 hubs instead of 7.
--
-- The 'EWR_JFK' enum value remains in the type definition. Postgres cannot
-- drop enum values without rebuilding the entire type and migrating all
-- columns; for an unused legacy value, leaving it in place is safe and
-- much simpler than the alternative.
--
-- Pre-migration state confirmed:
--   gofo_hubs WHERE hub_code = 'EWR_JFK': 1 row (will be deleted)
--   gofo_hub_proximity WHERE hub_code = 'EWR_JFK': 896 rows (will CASCADE)
--   lead_warehouses WHERE preferred_gofo_hub = 'EWR_JFK': 0 rows (clean)
--   pld_analysis_shipments referencing EWR_JFK: 0 rows (no completed runs yet)
--
-- Per Rule 10 (derived data atomicity): zip3_centroids is unchanged but
--   gofo_hub_proximity is rebuilt because gofo_hubs membership changes.
--   The Haversine recompute is in this same migration.
--
-- Schema verified 2026-05-05 against information_schema.columns:
--   gofo_hubs columns: hub_code, hub_name, city, state, primary_zip5,
--                     latitude, longitude, notes, created_at
--
-- Coordinates for new hubs (sourced from public airport data):
--   EWR (Newark Liberty International Airport):  40.6925, -74.1687
--   JFK (John F. Kennedy International Airport): 40.6413, -73.7781
-- These match the convention used by existing hubs (e.g., LAX is at the
-- airport coordinates, not the Los Angeles city centroid).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Phase 1: Add new enum values.
-- ALTER TYPE ... ADD VALUE must run outside the transaction block where the
-- new value is used. We commit it independently before the data changes.
-- ----------------------------------------------------------------------------

ALTER TYPE gofo_hub_enum ADD VALUE IF NOT EXISTS 'EWR';
ALTER TYPE gofo_hub_enum ADD VALUE IF NOT EXISTS 'JFK';

-- ----------------------------------------------------------------------------
-- Phase 2: Update gofo_hubs (delete old combined, insert two new) and
-- recompute gofo_hub_proximity. All in one transaction so derivation
-- refresh is atomic with source change.
-- ----------------------------------------------------------------------------

BEGIN;

-- Remove old combined hub. The FK on gofo_hub_proximity.zip3 has ON DELETE
-- CASCADE, so all 896 rows where hub_code='EWR_JFK' are auto-deleted.
DELETE FROM gofo_hubs WHERE hub_code = 'EWR_JFK';

-- Insert the two new distinct hubs. Using primary_zip5 of EWR airport (07114)
-- and JFK airport (11430) as the canonical "where the hub is" reference,
-- matching the convention of other hubs (LAX uses 90045, ORD uses 60666, etc.)
INSERT INTO gofo_hubs (hub_code, hub_name, city, state, primary_zip5, latitude, longitude, notes) VALUES
  ('EWR', 'Newark Liberty', 'Newark', 'NJ', '07114', 40.6925, -74.1687,
   'Split from former EWR_JFK in v1.10.0-019. GOFO injects shipments here for NJ-area pricing per published 2026 rate card.'),
  ('JFK', 'New York JFK', 'Queens', 'NY', '11430', 40.6413, -73.7781,
   'Split from former EWR_JFK in v1.10.0-019. GOFO injects shipments here for NY-area pricing per published 2026 rate card.');

-- Recompute gofo_hub_proximity from scratch.
-- After the CASCADE above, the proximity table has 896 × 6 = 5,376 rows
-- (the 6 hubs whose proximity rows weren't deleted). Truncate and rebuild
-- for cleanliness — single atomic recompute over all 8 hubs is easier to
-- reason about than partial inserts.
TRUNCATE TABLE gofo_hub_proximity;

INSERT INTO gofo_hub_proximity (zip3, hub_code, distance_miles, rank)
SELECT
  zip3,
  hub_code,
  distance_miles,
  ROW_NUMBER() OVER (PARTITION BY zip3 ORDER BY distance_miles ASC) AS rank
FROM (
  SELECT
    z.zip3,
    h.hub_code,
    -- Haversine distance in miles (earth radius 3958.7613 mi)
    3958.7613 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS((h.latitude - z.latitude) / 2)), 2)
      + COS(RADIANS(z.latitude)) * COS(RADIANS(h.latitude))
        * POWER(SIN(RADIANS((h.longitude - z.longitude) / 2)), 2)
    )) AS distance_miles
  FROM zip3_centroids z
  CROSS JOIN gofo_hubs h
) base
ORDER BY zip3, rank;

-- Update the table comment on gofo_hubs to reflect the new count.
COMMENT ON TABLE gofo_hubs IS
  'GOFO injection point hubs (8 hubs as of v1.10.0-019: LAX, DFW, ORD, EWR, '
  'JFK, ATL, MIA, SLC). EWR (Newark) and JFK (New York) are distinct hubs '
  'with separately published GOFO rate cards — do not collapse them. Each '
  'hub is an injection point where shippers drop off (or GOFO picks up) '
  'parcels for downstream USPS-Last-Mile or Regional delivery. Per Rule 10: '
  'hub membership changes require re-running the gofo_hub_proximity '
  'Haversine compute, which v1.10.0-019 does atomically.';

COMMIT;

-- =============================================================================
-- Verification queries (run manually after applying)
-- =============================================================================
-- SELECT hub_code, hub_name, city, state FROM gofo_hubs ORDER BY hub_code;
-- Expected: 8 rows (ATL, DFW, EWR, JFK, LAX, MIA, ORD, SLC). EWR_JFK absent.
--
-- SELECT array_to_string(enum_range(NULL::gofo_hub_enum), ', ');
-- Expected: includes 'EWR' and 'JFK'. 'EWR_JFK' will still appear in the
-- enum (Postgres doesn't drop enum values) but no row references it.
--
-- SELECT count(*) FROM gofo_hub_proximity;
-- Expected: 7168 (896 ZIP3s × 8 hubs)
--
-- SELECT zip3, hub_code, ROUND(distance_miles::numeric, 1) AS miles, rank
-- FROM gofo_hub_proximity
-- WHERE zip3 IN ('100', '070') AND rank <= 3
-- ORDER BY zip3, rank;
-- Expected:
--   ZIP3 100 (NYC Manhattan)  -> JFK rank 1, single-digit miles
--   ZIP3 070 (NJ Newark area) -> EWR rank 1, single-digit miles
--
-- SELECT count(*) FROM gofo_hub_proximity WHERE hub_code = 'EWR_JFK';
-- Expected: 0
--
-- SELECT count(*) FROM gofo_hubs WHERE hub_code = 'EWR_JFK';
-- Expected: 0
