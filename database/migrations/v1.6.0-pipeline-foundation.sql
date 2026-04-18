-- ==========================================================================
-- MIGRATION v1.6.0 — Pipeline Foundation
-- Date: 2026-04-17
-- Purpose: Rename final_merchant_rate → final_billed_rate everywhere.
--          Add markup context columns (markup_type_applied, markup_value_applied,
--          markup_source) and is_adjustment_only flag to invoice_line_items.
--          Backfill new columns from existing data.
--          Drop deprecated markup_percentage and markup_flat_fee columns.
-- Author: Cactus Logistics — pipeline refactor Session A
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. RENAME final_merchant_rate → final_billed_rate
--    Affected tables: invoice_line_items, shipment_ledger,
--                     rate_shop_log, cactus_invoice_line_items
-- --------------------------------------------------------------------------

ALTER TABLE invoice_line_items
  RENAME COLUMN final_merchant_rate TO final_billed_rate;

ALTER TABLE shipment_ledger
  RENAME COLUMN final_merchant_rate TO final_billed_rate;

ALTER TABLE rate_shop_log
  RENAME COLUMN final_merchant_rate TO final_billed_rate;

-- cactus_invoice_line_items may not have this column directly — verify with:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'cactus_invoice_line_items';
-- If it does not have final_merchant_rate, skip this rename for this table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cactus_invoice_line_items'
      AND column_name = 'final_merchant_rate'
  ) THEN
    EXECUTE 'ALTER TABLE cactus_invoice_line_items RENAME COLUMN final_merchant_rate TO final_billed_rate';
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 2. ADD new columns to invoice_line_items
-- --------------------------------------------------------------------------

ALTER TABLE invoice_line_items
  ADD COLUMN markup_type_applied   TEXT,
  ADD COLUMN markup_value_applied  DECIMAL(10,6),
  ADD COLUMN markup_source         TEXT,
  ADD COLUMN is_adjustment_only    BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN invoice_line_items.markup_type_applied IS
  'percentage or flat. Locked at Stage 5 Billing Calculation. Replaces deprecated markup_percentage/markup_flat_fee dual-column approach.';

COMMENT ON COLUMN invoice_line_items.markup_value_applied IS
  'The actual markup value used at billing time. For percentage: decimal fraction (e.g. 0.150000 for 15%). For flat: dollar amount (e.g. 1.000000 for $1.00). Locked at Stage 5.';

COMMENT ON COLUMN invoice_line_items.markup_source IS
  'carrier_account or rate_card. Indicates where the BASE RATE came from (not the markup percentage). Used for analytics: rate-carded vs API-rated margin comparison.';

COMMENT ON COLUMN invoice_line_items.is_adjustment_only IS
  'TRUE when the only FRT row for this tracking number on this invoice is an adjustment (no primary freight charge). Indicates a post-audit correction from a previous billing cycle. Used to skip variance calculation in Match stage and for downstream reporting.';

-- --------------------------------------------------------------------------
-- 3. BACKFILL new columns from existing data
--
-- For all existing invoice_line_items rows that have been billed (have a
-- final_billed_rate populated), derive the markup context from the
-- org_carrier_accounts row that was active at billing time.
--
-- NOTE: This backfill assumes existing rows used percentage markup with
-- markup_percentage from the carrier account at the time. This is true for
-- the test invoice (Cactus 3PL HQ, 15% markup, all UPS lassoed). For real
-- production migrations later, this backfill logic must be revisited.
-- --------------------------------------------------------------------------

UPDATE invoice_line_items ili
SET
  markup_type_applied = CASE
    WHEN oca.markup_flat_fee IS NOT NULL AND oca.markup_flat_fee > 0 THEN 'flat'
    ELSE 'percentage'
  END,
  markup_value_applied = CASE
    WHEN oca.markup_flat_fee IS NOT NULL AND oca.markup_flat_fee > 0 THEN oca.markup_flat_fee
    ELSE COALESCE(oca.markup_percentage, 0)
  END,
  markup_source = CASE
    WHEN oca.use_rate_card = TRUE THEN 'rate_card'
    ELSE 'carrier_account'
  END
FROM org_carrier_accounts oca
WHERE ili.org_carrier_account_id = oca.id
  AND ili.final_billed_rate IS NOT NULL
  AND ili.markup_type_applied IS NULL;

-- --------------------------------------------------------------------------
-- 4. DROP deprecated columns
-- --------------------------------------------------------------------------

ALTER TABLE invoice_line_items
  DROP COLUMN IF EXISTS markup_percentage,
  DROP COLUMN IF EXISTS markup_flat_fee;

-- --------------------------------------------------------------------------
-- 5. GRANTS — service_role needs ALL on the modified table
-- --------------------------------------------------------------------------

GRANT ALL ON invoice_line_items TO service_role;

-- --------------------------------------------------------------------------
-- 6. VERIFICATION QUERIES (informational — do not fail on mismatch, just log)
-- --------------------------------------------------------------------------

DO $$
DECLARE
  total_rows INT;
  backfilled_rows INT;
  null_markup_rows INT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM invoice_line_items;
  SELECT COUNT(*) INTO backfilled_rows FROM invoice_line_items WHERE markup_type_applied IS NOT NULL;
  SELECT COUNT(*) INTO null_markup_rows FROM invoice_line_items WHERE markup_type_applied IS NULL AND final_billed_rate IS NOT NULL;

  RAISE NOTICE 'Migration v1.6.0 complete. Total rows: %. Backfilled: %. Billed-but-not-backfilled: % (should be 0).',
    total_rows, backfilled_rows, null_markup_rows;
END $$;

COMMIT;
