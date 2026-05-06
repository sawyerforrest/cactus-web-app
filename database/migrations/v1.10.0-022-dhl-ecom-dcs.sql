-- =============================================================================
-- Migration v1.10.0-022: DHL eCom Distribution Centers lookup table
-- =============================================================================
-- Purpose: Add a small lookup table mapping DHL eCommerce DC codes to their
--   ZIP3 origin and city/state metadata. Required by the Zone Matrices upload
--   screen so the rating engine can resolve "lead's warehouse is in Charlotte
--   ZIP 28202 → use the CLT rate card and CLT zone matrix" cleanly without
--   hardcoding the 18-row mapping in application code.
--
-- Pattern: same shape as gofo_hubs (which already exists). Reference data,
-- read-only outside migrations, queried by rating engine and admin UIs.
--
-- Source: ORIGIN_ZIP3 column from each of the 18 DHL eCommerce zone matrix
-- files (DHL_eCommerce_Zones_Table_<DC>.xlsx) — verified 2026-05-05 by
-- Senior Architect against all 18 published files.
--
-- Schema verification (Pattern 1): no existing dhl_ecom_dcs table. Adding
-- new table; no FK dependencies, no derivation chains.
-- =============================================================================

BEGIN;

CREATE TABLE dhl_ecom_dcs (
  dc_code      CHAR(3)  PRIMARY KEY,
  origin_code  TEXT     NOT NULL UNIQUE,
  dc_zip3      CHAR(3)  NOT NULL,
  city         TEXT     NOT NULL,
  state        CHAR(2)  NOT NULL,
  notes        TEXT     NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dhl_ecom_dcs IS
  'DHL eCommerce distribution centers (18 DCs as of v1.10.0-022). Maps the '
  'three-letter DC code (e.g., CLT) used in rate card filenames and zone '
  'matrix files to the ORIGIN code (USCLT1) used in DHL data and the '
  'origin ZIP3 (282) used by the rating engine. This is reference data — '
  'do not mutate outside of migrations. New DC additions from DHL require '
  'a new migration.';

INSERT INTO dhl_ecom_dcs (dc_code, origin_code, dc_zip3, city, state, notes) VALUES
  ('ATL', 'USATL1', '302', 'Atlanta',          'GA', 'Atlanta hub'),
  ('BOS', 'USBOS1', '015', 'Boston',           'MA', 'Boston hub'),
  ('CAK', 'USCAK1', '442', 'Akron-Canton',     'OH', 'Northeast Ohio hub'),
  ('CLT', 'USCLT1', '280', 'Charlotte',        'NC', 'Charlotte hub'),
  ('CVG', 'USCVG1', '410', 'Cincinnati',       'OH', 'Cincinnati hub'),
  ('DEN', 'USDEN1', '802', 'Denver',           'CO', 'Denver hub'),
  ('DFW', 'USDFW1', '750', 'Dallas-Ft Worth',  'TX', 'DFW hub'),
  ('EWR', 'USEWR1', '070', 'Newark',           'NJ', 'Newark Liberty hub'),
  ('IAD', 'USIAD1', '201', 'Washington Dulles','VA', 'Dulles hub'),
  ('IAH', 'USIAH1', '770', 'Houston',          'TX', 'Houston hub'),
  ('LAX', 'USLAX1', '906', 'Los Angeles',      'CA', 'LA hub'),
  ('MCI', 'USMCI1', '641', 'Kansas City',      'MO', 'Kansas City hub'),
  ('MCO', 'USMCO1', '328', 'Orlando',          'FL', 'Orlando hub'),
  ('ORD', 'USORD1', '601', 'Chicago O''Hare',  'IL', 'Chicago hub'),
  ('PHX', 'USPHX1', '850', 'Phoenix',          'AZ', 'Phoenix hub'),
  ('SEA', 'USSEA1', '983', 'Seattle',          'WA', 'Seattle hub'),
  ('SFO', 'USSFO1', '945', 'San Francisco',    'CA', 'SF Bay Area hub'),
  ('SLC', 'USSLC1', '841', 'Salt Lake City',   'UT', 'Salt Lake City hub');

-- Enable RLS (consistent with all PLD reference tables in v1.10.0)
ALTER TABLE dhl_ecom_dcs ENABLE ROW LEVEL SECURITY;

-- Permissive read for authenticated users; writes go through admin UI / migrations.
CREATE POLICY dhl_ecom_dcs_authenticated_select ON dhl_ecom_dcs
  FOR SELECT TO authenticated USING (true);

-- Table-level GRANTs. RLS policies alone aren't enough — Postgres requires
-- both an RLS-allowed predicate AND a base SELECT (or other) privilege at
-- the table level. Without these grants, queries from authenticated /
-- service_role roles fail with "permission denied for table dhl_ecom_dcs"
-- even though the policy would otherwise admit the row.
--
-- Original v1.10.0-022 shipped without these GRANTs (RLS + policy only),
-- which broke the Zone Matrices upload screen's dhl_ecom_dcs lookup at
-- runtime. Fix applied as v1_10_0_022_fix_dhl_ecom_dcs_grants hotfix on
-- 2026-05-05; this canonical file now includes them inline so a from-
-- scratch replay matches the live state. See PATTERNS.md (forthcoming
-- Pattern 6: "Tables with RLS still need explicit role GRANTs").
GRANT SELECT ON dhl_ecom_dcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON dhl_ecom_dcs TO service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- Verification queries
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM dhl_ecom_dcs;                      -- Expect 18
-- SELECT dc_code, dc_zip3 FROM dhl_ecom_dcs ORDER BY dc_code;
-- SELECT count(*) FROM dhl_ecom_dcs WHERE dc_zip3 = '280' AND dc_code = 'CLT';  -- Expect 1
