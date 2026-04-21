-- ==========================================================================
-- MIGRATION v1.6.1 — shipment_ledger markup unification (REVISED)
-- Date: 2026-04-20 (revised same day)
-- Purpose: Extend the v1.6.0 markup context model (markup_type_applied,
--          markup_value_applied, markup_source) from invoice_line_items to
--          shipment_ledger, BACKFILL the new columns from the existing
--          markup_percentage / markup_flat_fee values, and then drop the
--          legacy columns.
--
-- Author: Cactus Logistics — pipeline refactor Session B
--
-- REVISION NOTE: The original Session B migration assumed shipment_ledger
--          was empty. Pre-flight in the live test Supabase showed 953
--          existing rows from Session A's Match runs. Per Rule 6
--          (immutable records), we preserve those rows through the schema
--          change instead of wiping them. The flow is now:
--               1. ADD new columns (nullable)
--               2. BACKFILL from legacy markup_percentage/markup_flat_fee
--               3. ADD CHECK constraints
--               4. DROP legacy columns
--
-- Backfill rule (matches deriveMarkupContext() logic in
-- src/alamo/lib/markup-context.ts):
--          - markup_flat_fee > 0  → markup_type_applied = 'flat',
--                                   markup_value_applied = markup_flat_fee
--          - else                 → markup_type_applied = 'percentage',
--                                   markup_value_applied = markup_percentage
--                                   (defaults to 0 if NULL)
--          - markup_source        → 'carrier_account' for all backfilled rows
--                                   (rate cards weren't in production use
--                                    when these rows were created; rate_card
--                                    becomes a possibility starting with
--                                    v1.6.0+ Billing Calc)
--
-- Does NOT touch: org_carrier_accounts.markup_percentage /
--                 org_carrier_accounts.markup_flat_fee. Those columns are
--                 the source of truth for admin-set markup config and
--                 continue to exist unchanged.
-- ==========================================================================

BEGIN;

-- 1. ADD the three new markup context columns (nullable initially so that
--    backfill can populate them before NOT NULL constraints, if any, are
--    enforced. Schema design keeps them nullable permanently — the CHECK
--    constraints below allow NULL for forward-compatibility with rows
--    inserted before the markup is determined.)
ALTER TABLE shipment_ledger
  ADD COLUMN markup_type_applied  TEXT,
  ADD COLUMN markup_value_applied DECIMAL(10,6),
  ADD COLUMN markup_source        TEXT;

-- 2. BACKFILL — derive the new context from existing markup_percentage and
--    markup_flat_fee. Same priority rule as deriveMarkupContext: flat wins
--    when greater than zero.
UPDATE shipment_ledger
SET
  markup_type_applied = CASE
    WHEN COALESCE(markup_flat_fee, 0) > 0 THEN 'flat'
    ELSE 'percentage'
  END,
  markup_value_applied = CASE
    WHEN COALESCE(markup_flat_fee, 0) > 0 THEN markup_flat_fee
    ELSE COALESCE(markup_percentage, 0)
  END,
  markup_source = 'carrier_account';

-- 3. ADD CHECK constraints (after backfill so existing rows already conform).
ALTER TABLE shipment_ledger
  ADD CONSTRAINT shipment_ledger_markup_type_check
    CHECK (markup_type_applied IS NULL
           OR markup_type_applied IN ('percentage', 'flat')),
  ADD CONSTRAINT shipment_ledger_markup_source_check
    CHECK (markup_source IS NULL
           OR markup_source IN ('carrier_account', 'rate_card'));

-- 4. DROP the legacy columns now that the data has been preserved on the
--    new columns.
ALTER TABLE shipment_ledger
  DROP COLUMN markup_percentage,
  DROP COLUMN markup_flat_fee;

-- 5. Emit a NOTICE with row counts for human verification in the Supabase
--    SQL Editor output pane.
DO $$
DECLARE
  total_rows  INT;
  backfilled  INT;
  flat_rows   INT;
  pct_rows    INT;
  col_list    TEXT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM shipment_ledger;
  SELECT COUNT(*) INTO backfilled FROM shipment_ledger
    WHERE markup_type_applied IS NOT NULL;
  SELECT COUNT(*) INTO flat_rows FROM shipment_ledger
    WHERE markup_type_applied = 'flat';
  SELECT COUNT(*) INTO pct_rows FROM shipment_ledger
    WHERE markup_type_applied = 'percentage';
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO col_list
    FROM information_schema.columns
    WHERE table_name = 'shipment_ledger'
      AND column_name IN ('markup_type_applied', 'markup_value_applied',
                           'markup_source', 'markup_percentage',
                           'markup_flat_fee');
  RAISE NOTICE 'shipment_ledger v1.6.1 complete: % total rows, % backfilled (% flat, % percentage)',
    total_rows, backfilled, flat_rows, pct_rows;
  RAISE NOTICE 'shipment_ledger markup columns after migration: %', col_list;
  -- Expected:
  --   "shipment_ledger v1.6.1 complete: 953 total rows, 953 backfilled (0 flat, 953 percentage)"
  --   "shipment_ledger markup columns after migration: markup_source, markup_type_applied, markup_value_applied"
END $$;

COMMIT;
