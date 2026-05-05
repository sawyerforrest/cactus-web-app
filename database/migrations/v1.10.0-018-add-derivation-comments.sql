-- =============================================================================
-- Migration v1.10.0-018: Add derivation-chain table comments
-- =============================================================================
-- Purpose: Add COMMENT ON TABLE entries to source tables in derivation chains
--   so that schema introspection (psql \d+, Supabase dashboard, anyone viewing
--   the table definition) surfaces the derivation dependency.
--
-- Per Rule 10 (Derived data must be refreshed atomically with its source) added
-- to master briefing v1.10.0 Section 6.
--
-- Currently one derivation chain exists in the schema:
--   gofo_hub_proximity ← zip3_centroids (Haversine compute)
--
-- This migration is purely documentary — no DDL changes to columns, indexes,
-- triggers, or data. Safe to apply at any time. Idempotent (re-running just
-- replaces the comment text with the same content).
-- =============================================================================

BEGIN;

COMMENT ON TABLE zip3_centroids IS
  'SOURCE TABLE in a derivation chain. Per Rule 10 of the master briefing, '
  'gofo_hub_proximity is computed from this table via Haversine distance. '
  'Any TRUNCATE or re-seed of this table must be immediately followed by '
  're-running the Haversine compute (currently encoded in migration '
  'v1.10.0-017) to repopulate gofo_hub_proximity. ON DELETE CASCADE on the '
  'FK from gofo_hub_proximity means TRUNCATE...CASCADE here will empty the '
  'proximity table at the moment of truncate, before new source rows are '
  'inserted. New warehouses created while gofo_hub_proximity is empty will '
  'fail to auto-select a GOFO hub (operators must manually pick) until the '
  'derivation is re-run. See docs/derived-data-dependencies.md for the full '
  'maintenance protocol.';

COMMENT ON TABLE gofo_hub_proximity IS
  'DERIVED TABLE. Computed from zip3_centroids via Haversine distance to '
  'each row of gofo_hubs, ranked nearest to farthest. Used at '
  'lead_warehouses creation time to auto-select preferred_gofo_hub for new '
  'warehouses. Once a warehouse is created, its hub assignment is stored on '
  'lead_warehouses.preferred_gofo_hub and the proximity table is no longer '
  'consulted for that warehouse. Per Rule 10 of the master briefing: do not '
  'manually mutate this table. Re-derive by re-running migration v1.10.0-017 '
  '(or equivalent admin UI action) after any change to zip3_centroids or '
  'gofo_hubs.';

-- Document the v1.10.0-013 fuel-tier reseed lesson on the source table too —
-- this is not a derivation chain but a source-of-truth-from-published-document
-- pattern that has its own re-seed discipline.

COMMENT ON TABLE dhl_ecom_fuel_tiers IS
  'Reference data sourced verbatim from DHL eCommerce''s published "Fuel '
  'Surcharge for Domestic Products" PDF document. Not a derived table — this '
  'IS the source of truth for DHL fuel calculations. Re-seed only when DHL '
  'publishes a new effective_date schedule. Verify values against the source '
  'PDF before any TRUNCATE-and-reseed; do not approximate or extrapolate '
  'tier ranges or rates. Current effective_date 2026-05-30 has 18 tiers '
  'covering diesel prices $1.14 through $8.20.';

COMMENT ON TABLE gofo_remote_zip3s IS
  'Reference data sourced from GOFO''s published US Remote Areas ZIP list. '
  'Indicates ZIP3 prefixes that trigger the GOFO Standard remote-rate '
  'variant (Hawaii, Alaska, Puerto Rico, USVI, Guam, Military APO/FPO). '
  'Note GOFO Regional does not service these destinations, so they do not '
  'need centroids in zip3_centroids. Re-seed only when GOFO publishes an '
  'updated remote area list. Current 28 entries.';

COMMENT ON TABLE diesel_price_history IS
  'Weekly snapshot of US national average on-highway diesel price, sourced '
  'from US Energy Information Administration (EIA) series EPD2D, duoarea '
  'NUS. Auto-fetched every Monday 11:00 UTC by Edge Function '
  'fetch-eia-diesel (cron job pld-fetch-eia-diesel-weekly). Manual entries '
  'are preserved on auto-fetch (UPSERT uses ignoreDuplicates on '
  'effective_week_start). Used by the rating engine to determine the '
  'active DHL fuel tier per shipment ship_date.';

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification queries (run these manually after applying)
-- -----------------------------------------------------------------------------
-- SELECT obj_description('zip3_centroids'::regclass, 'pg_class') IS NOT NULL AS has_comment;
-- Expected: true
--
-- SELECT relname, obj_description(oid, 'pg_class') AS comment_text
-- FROM pg_class 
-- WHERE relname IN ('zip3_centroids', 'gofo_hub_proximity', 'dhl_ecom_fuel_tiers',
--                   'gofo_remote_zip3s', 'diesel_price_history')
-- ORDER BY relname;
-- Expected: 5 rows, each with a populated comment_text starting with the
-- documented description. zip3_centroids and gofo_hub_proximity comments
-- reference Rule 10.
