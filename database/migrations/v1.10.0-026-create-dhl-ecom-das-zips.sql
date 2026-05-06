-- =============================================================================
-- Migration v1.10.0-026: create dhl_ecom_das_zips table
-- =============================================================================
-- Purpose: New reference-data table holding the DHL eCommerce Delivery Area
--   Surcharge ZIP5 list. Conceptually mirrors gofo_remote_zip3s (a flag list)
--   but at ZIP5 granularity instead of ZIP3 — DAS isn't a "whole prefix is
--   surcharged" concept, it's a "this specific ZIP5 has a surcharge"
--   concept. The published 2026 list has 22,264 ZIP5s clustered in specific
--   geographic patches, not whole ZIP3 prefixes; aggregating to ZIP3 would
--   be lossy.
--
-- Rating-engine usage:
--   Binary lookup — "is this destination ZIP5 in dhl_ecom_das_zips with
--   deprecated_date IS NULL?" — yes/no drives whether the DHL DAS surcharge
--   line item fires. Surcharge dollar amount comes from the rate card layer
--   (sub-phase 2b's next deliverable), not this table.
--
-- Re-upload semantics:
--   Truncate-and-replace via the v1.10.0-027 commit_dhl_ecom_das_zips_upload()
--   PG function. Same atomic-write discipline as DHL Domestic Zones and
--   GOFO Standard, just with TRUNCATE since this table holds only DHL DAS
--   data (no scope-delete needed).
--
-- Why a partial index on (zip5) WHERE deprecated_date IS NULL:
--   Active-set lookups are the hot path from the rating engine. A partial
--   index keeps the index size minimal while still covering the lookup
--   pattern. Standard PostgreSQL approach for soft-deleted reference data.
--
-- Pattern 6 discipline: explicit GRANTs alongside the RLS policy. The
-- v1.10.0-022 hotfix taught us that policies without GRANTs produce silent
-- "permission denied" failures; this migration declares both up-front.
--
-- Schema reference (target table created here):
--   dhl_ecom_das_zips(zip5 char(5), effective_date date, deprecated_date date,
--     source text, notes text, created_at timestamptz)
--   PK: (zip5, effective_date) — a ZIP can re-appear across publication dates
--   Partial index: (zip5) WHERE deprecated_date IS NULL
--   RLS: enabled, authenticated SELECT-all policy
-- =============================================================================

CREATE TABLE dhl_ecom_das_zips (
  zip5            CHAR(5)  NOT NULL,
  effective_date  DATE     NOT NULL,
  deprecated_date DATE     NULL,
  source          TEXT     NOT NULL DEFAULT 'DHL eCommerce DAS ZIP List XLSX',
  notes           TEXT     NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zip5, effective_date)
);

COMMENT ON TABLE dhl_ecom_das_zips IS
  'DHL eCommerce Delivery Area Surcharge ZIP5 list. Reference data sourced '
  'from DHL''s published 2026 DAS ZIP file. Rating engine queries this table '
  'to determine if a destination ZIP5 is subject to the DAS surcharge. '
  'Re-uploads truncate-and-replace the active set in one transaction. '
  'Conceptually mirrors gofo_remote_zip3s but at ZIP5 granularity.';

ALTER TABLE dhl_ecom_das_zips ENABLE ROW LEVEL SECURITY;

CREATE POLICY dhl_ecom_das_zips_authenticated_select ON dhl_ecom_das_zips
  FOR SELECT TO authenticated USING (true);

-- Pattern 6 discipline: explicit GRANTs alongside the RLS policy
GRANT SELECT ON dhl_ecom_das_zips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON dhl_ecom_das_zips TO service_role;

CREATE INDEX idx_dhl_ecom_das_zips_zip5 ON dhl_ecom_das_zips(zip5)
  WHERE deprecated_date IS NULL;

-- ----------------------------------------------------------------------------
-- Verification queries (run manually after applying):
-- ----------------------------------------------------------------------------
-- SELECT count(*) FROM dhl_ecom_das_zips;
-- Expected: 0 (no rows seeded; first load arrives via the upload flow)
--
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'dhl_ecom_das_zips';
-- Expected: relrowsecurity=true
--
-- SELECT polname FROM pg_policy WHERE polrelid = 'dhl_ecom_das_zips'::regclass;
-- Expected: dhl_ecom_das_zips_authenticated_select
--
-- SELECT indexname FROM pg_indexes WHERE tablename = 'dhl_ecom_das_zips';
-- Expected: dhl_ecom_das_zips_pkey, idx_dhl_ecom_das_zips_zip5
