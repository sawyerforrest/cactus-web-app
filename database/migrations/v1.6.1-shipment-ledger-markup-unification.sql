-- ==========================================================================
-- MIGRATION v1.6.1 — shipment_ledger markup unification
-- Date: 2026-04-20
-- Purpose: Extend the v1.6.0 markup context model (markup_type_applied,
--          markup_value_applied, markup_source) from invoice_line_items to
--          shipment_ledger, and drop the legacy markup_percentage and
--          markup_flat_fee columns from shipment_ledger. After this migration
--          quote-time (rating engine) and bill-time (Billing Calc) use the
--          same data shape.
--
-- Author: Cactus Logistics — pipeline refactor Session B
--
-- Safety: shipment_ledger has zero rows in test Supabase as of 2026-04-20
--         (verify the pre-flight COUNT(*) below returns 0 before running).
--         If this migration runs against a non-empty shipment_ledger the
--         ALTER TABLE DROP will destroy markup state on existing rows —
--         that is intentional for the test environment, but DO NOT run
--         against production without a data-migration plan first.
--
-- Does NOT touch: org_carrier_accounts.markup_percentage /
--                 org_carrier_accounts.markup_flat_fee. Those columns are
--                 the source of truth for admin-set markup config and
--                 continue to exist unchanged.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- PRE-FLIGHT (run these as separate statements BEFORE the migration;
-- they are commented out so the migration file runs cleanly end-to-end):
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'shipment_ledger'
--     AND column_name IN ('markup_percentage', 'markup_flat_fee',
--                          'final_billed_rate', 'markup_type_applied',
--                          'markup_value_applied', 'markup_source')
--   ORDER BY column_name;
--   -- Expected: markup_percentage, markup_flat_fee, final_billed_rate
--   --           (no markup_type_applied / markup_value_applied / markup_source yet)
--
--   SELECT COUNT(*) FROM shipment_ledger;
--   -- Expected: 0 (test Supabase has no production shipment_ledger data yet)
-- --------------------------------------------------------------------------

BEGIN;

-- 1. Add the three new markup context columns (nullable initially).
ALTER TABLE shipment_ledger
  ADD COLUMN markup_type_applied  TEXT,
  ADD COLUMN markup_value_applied DECIMAL(10,6),
  ADD COLUMN markup_source        TEXT;

-- 2. Add CHECK constraints to keep values consistent with invoice_line_items.
ALTER TABLE shipment_ledger
  ADD CONSTRAINT shipment_ledger_markup_type_check
    CHECK (markup_type_applied IS NULL
           OR markup_type_applied IN ('percentage', 'flat')),
  ADD CONSTRAINT shipment_ledger_markup_source_check
    CHECK (markup_source IS NULL
           OR markup_source IN ('carrier_account', 'rate_card'));

-- 3. Drop the legacy columns. shipment_ledger is empty in the test
--    environment so no data is lost. Production cutover (if ever) will
--    require a backfill step here, not a straight DROP.
ALTER TABLE shipment_ledger
  DROP COLUMN markup_percentage,
  DROP COLUMN markup_flat_fee;

-- 4. Emit a NOTICE with the surviving markup-related column names for
--    human verification in the Supabase SQL Editor output pane.
DO $$
DECLARE
  col_list TEXT;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO col_list
    FROM information_schema.columns
    WHERE table_name = 'shipment_ledger'
      AND column_name IN ('markup_type_applied', 'markup_value_applied',
                           'markup_source', 'markup_percentage',
                           'markup_flat_fee');
  RAISE NOTICE 'shipment_ledger markup columns after migration: %', col_list;
  -- Expected NOTICE payload:
  --   markup_source, markup_type_applied, markup_value_applied
END $$;

COMMIT;
