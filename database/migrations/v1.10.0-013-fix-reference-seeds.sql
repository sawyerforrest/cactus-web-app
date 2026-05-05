-- =============================================================================
-- Migration v1.10.0-013: Fix reference seed data
-- =============================================================================
-- Purpose: Correct two seed errors discovered in post-Phase-1 audit.
--
-- Issue 1 (CRITICAL): dhl_ecom_fuel_tiers seeded with fabricated values
--   instead of DHL's actual published tiers. Real values from the DHL eCom
--   "Fuel Surcharge for Domestic Products (Effective Starting May 30, 2026)"
--   document are below. Fabricated values would have caused fuel calculations
--   to be ~10x too low, breaking Test B regression and any production analysis
--   that uses fuel_treatment_mode = 'full'.
--
-- Issue 2 (MINOR): gofo_remote_zip3s missing ZIP3 099 (Military APO/FPO Europe).
--   Source GOFO remote area list has 28 ZIP3 entries; current seed has 27.
--   Adding 099 brings total to 28 matching source.
--
-- Both tables are pure reference data with no inbound foreign keys, so
-- TRUNCATE + re-INSERT is safe.
--
-- Source documents (authoritative):
--   DHL: dec-us-fuel-surcharges-domestic-effective-053026.pdf (uploaded by Sawyer)
--   GOFO: gofo_remote_areas_zip_list.xlsx (uploaded by Sawyer)
--
-- Schema note: This migration matches the actual schema deployed in
-- v1.10.0-009 (dhl_ecom_fuel_tiers) and v1.10.0-004 (gofo_remote_zip3s),
-- which differs from the implementation brief's column spec. The brief
-- specified additional audit columns that were not implemented; this
-- migration uses only the columns that actually exist.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Fix 1: DHL eCom fuel tiers
-- -----------------------------------------------------------------------------
-- Actual deployed schema columns: id (uuid pk default), effective_date,
-- deprecated_date, diesel_price_min, diesel_price_max, fuel_per_lb,
-- source (default 'DHL_PUBLISHED'), notes, created_at

TRUNCATE TABLE dhl_ecom_fuel_tiers;

INSERT INTO dhl_ecom_fuel_tiers (
  effective_date, diesel_price_min, diesel_price_max, fuel_per_lb, notes
) VALUES
  ('2026-05-30', 1.14, 1.31, 0.19, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 1.31, 1.55, 0.20, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 1.55, 1.95, 0.21, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 1.95, 2.42, 0.22, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 2.42, 2.82, 0.23, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 2.82, 3.29, 0.24, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 3.29, 3.69, 0.25, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 3.69, 4.10, 0.26, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 4.10, 4.51, 0.27, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 4.51, 4.91, 0.28, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 4.91, 5.32, 0.29, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 5.32, 5.72, 0.30, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 5.72, 6.13, 0.31, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 6.13, 6.71, 0.32, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 6.71, 7.00, 0.33, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 7.00, 7.40, 0.34, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 7.40, 7.80, 0.35, 'DHL eCom domestic fuel surcharge effective 2026-05-30'),
  ('2026-05-30', 7.80, 8.20, 0.36, 'DHL eCom domestic fuel surcharge effective 2026-05-30');

-- -----------------------------------------------------------------------------
-- Fix 2: GOFO remote ZIP3s
-- -----------------------------------------------------------------------------
-- Actual deployed schema columns: zip3 (char(3) pk), region, notes, created_at

TRUNCATE TABLE gofo_remote_zip3s;

INSERT INTO gofo_remote_zip3s (zip3, region, notes) VALUES
  ('006', 'Puerto Rico',     NULL),
  ('007', 'Puerto Rico',     NULL),
  ('008', 'Virgin Islands',  NULL),
  ('009', 'Puerto Rico',     NULL),
  ('090', 'Military',        'APO/FPO Europe'),
  ('091', 'Military',        'APO/FPO Europe'),
  ('092', 'Military',        'APO/FPO Europe'),
  ('093', 'Military',        'APO/FPO Europe'),
  ('094', 'Military',        'APO/FPO Europe'),
  ('095', 'Military',        'APO/FPO Europe'),
  ('096', 'Military',        'APO/FPO Europe'),
  ('097', 'Military',        'APO/FPO Europe'),
  ('098', 'Military',        'APO/FPO Europe'),
  ('099', 'Military',        'APO/FPO Europe'),
  ('340', 'Military',        'APO/FPO Americas / USVI overlap'),
  ('962', 'Military',        'APO/FPO Pacific'),
  ('963', 'Military',        'APO/FPO Pacific'),
  ('964', 'Military',        'APO/FPO Pacific'),
  ('965', 'Military',        'APO/FPO Pacific'),
  ('966', 'Military',        'APO/FPO Pacific'),
  ('967', 'Hawaii',          NULL),
  ('968', 'Hawaii',          NULL),
  ('969', 'Guam',            'Includes Northern Mariana, American Samoa'),
  ('995', 'Alaska',          NULL),
  ('996', 'Alaska',          NULL),
  ('997', 'Alaska',          NULL),
  ('998', 'Alaska',          NULL),
  ('999', 'Alaska',          NULL);

-- -----------------------------------------------------------------------------
-- Verification queries (run these manually after applying)
-- -----------------------------------------------------------------------------
-- SELECT diesel_price_min, diesel_price_max, fuel_per_lb 
--   FROM dhl_ecom_fuel_tiers ORDER BY diesel_price_min LIMIT 3;
-- Expected: (1.14, 1.31, 0.19), (1.31, 1.55, 0.20), (1.55, 1.95, 0.21)
--
-- SELECT count(*) FROM dhl_ecom_fuel_tiers;
-- Expected: 18
--
-- SELECT count(*) FROM gofo_remote_zip3s;
-- Expected: 28
--
-- SELECT zip3 FROM gofo_remote_zip3s WHERE zip3 = '099';
-- Expected: one row returned

COMMIT;
