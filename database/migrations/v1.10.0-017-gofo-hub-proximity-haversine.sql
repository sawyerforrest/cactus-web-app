-- =============================================================================
-- Migration v1.10.0-017: GOFO hub proximity Haversine compute
-- =============================================================================
-- Purpose: Pre-compute Haversine great-circle distances from every ZIP3
-- centroid to every GOFO hub, ranked nearest-first per ZIP3. Stored in
-- gofo_hub_proximity for O(1) "what's the closest hub to this ZIP3?"
-- lookups during GOFO Regional rate-card resolution.
--
-- Inputs:
--   zip3_centroids   (896 rows, seeded in v1.10.0-016)
--   gofo_hubs        (7 rows, seeded in v1.10.0-004)
--
-- Output:
--   gofo_hub_proximity (896 x 7 = 6,272 rows expected)
--
-- Method:
--   Haversine formula with Earth radius = 3958.7613 statute miles.
--   ROW_NUMBER() OVER (PARTITION BY zip3 ORDER BY distance_miles ASC)
--   guarantees a strict 1..7 ranking per ZIP3 with no ties.
--
-- Schema verified before authoring (information_schema.columns):
--   id UUID PK default gen_random_uuid(),
--   zip3 CHAR(3) NOT NULL FK→zip3_centroids,
--   hub_code gofo_hub_enum NOT NULL FK→gofo_hubs,
--   distance_miles NUMERIC NOT NULL,
--   rank INTEGER NOT NULL,
--   computed_at TIMESTAMPTZ default now(),
--   UNIQUE(zip3, hub_code)
--
-- TRUNCATE is safe because gofo_hub_proximity is a leaf table — no inbound
-- foreign keys, so plain TRUNCATE works without CASCADE.
-- =============================================================================

BEGIN;

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
    -- Haversine formula. Inputs in degrees; convert via radians().
    -- a = sin²(Δφ/2) + cos(φ1) · cos(φ2) · sin²(Δλ/2)
    -- c = 2 · atan2(√a, √(1−a))   ↔ equivalent to 2 · asin(√a)
    -- d = R · c
    -- Earth radius R = 3958.7613 miles (mean radius for navigation).
    (
      2 * 3958.7613 *
      asin(
        sqrt(
          power(sin(radians((h.latitude::float8 - z.latitude::float8) / 2)), 2)
          + cos(radians(z.latitude::float8))
          * cos(radians(h.latitude::float8))
          * power(sin(radians((h.longitude::float8 - z.longitude::float8) / 2)), 2)
        )
      )
    )::numeric(10, 4) AS distance_miles
  FROM zip3_centroids z
  CROSS JOIN gofo_hubs h
) raw_distances;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification queries (run these manually after applying)
-- -----------------------------------------------------------------------------
-- SELECT count(*) FROM gofo_hub_proximity;
-- Expected: 6272 (896 ZIP3s × 7 hubs)
--
-- -- Charlotte NC (ZIP3 282) — nearest hub should be ATL (Atlanta) or
-- -- EWR_JFK (Newark/NY) given Charlotte's location 35.2°N, -80.8°W.
-- -- ATL is at (33.64, -84.43), EWR_JFK at (40.69, -74.17). Charlotte is
-- -- ~225 miles from ATL and ~530 miles from EWR_JFK, so ATL should win.
-- SELECT hub_code, distance_miles, rank
-- FROM gofo_hub_proximity
-- WHERE zip3 = '282'
-- ORDER BY rank
-- LIMIT 3;
-- Expected: (ATL, ~225, 1), (EWR_JFK or ORD, ~500-600, 2), ...
--
-- -- Salt Lake City (ZIP3 841) → nearest hub should be SLC at near-zero distance.
-- SELECT hub_code, distance_miles, rank
-- FROM gofo_hub_proximity
-- WHERE zip3 = '841' AND rank = 1;
-- Expected: (SLC, distance < 50 miles, 1)
--
-- -- Strict ranking integrity: every ZIP3 must have ranks 1..7 with no gaps
-- -- and no duplicates.
-- SELECT zip3, count(*) AS hub_count, min(rank) AS min_rank, max(rank) AS max_rank
-- FROM gofo_hub_proximity
-- GROUP BY zip3
-- HAVING count(*) <> 7 OR min(rank) <> 1 OR max(rank) <> 7;
-- Expected: zero rows returned.
