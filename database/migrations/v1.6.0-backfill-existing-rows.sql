-- ==========================================================================
-- BACKFILL — Apply v1.6.0 parser fixes to existing rows without re-parsing
-- Run AFTER v1.6.0-pipeline-foundation.sql migration is applied
-- ==========================================================================

BEGIN;

-- Backfill date_invoiced from raw_line_data (handles 2-digit year)
-- We can't easily replicate parseDate() in SQL, so we rely on the format
-- being consistent (M/D/YY) and use to_date() with explicit format.
UPDATE invoice_line_items
SET date_invoiced = to_date(raw_line_data->>'Invoice Date', 'FMMM/FMDD/YY')
WHERE date_invoiced IS NULL
  AND raw_line_data->>'Invoice Date' IS NOT NULL
  AND raw_line_data->>'Invoice Date' != ''
  AND raw_line_data->>'Invoice Date' ~ '^\d{1,2}/\d{1,2}/\d{2}$';

-- Backfill date_shipped from Transaction Date (dark account proxy)
UPDATE invoice_line_items
SET date_shipped = to_date(raw_line_data->>'Transaction Date', 'FMMM/FMDD/YY')
WHERE date_shipped IS NULL
  AND raw_line_data->>'Transaction Date' IS NOT NULL
  AND raw_line_data->>'Transaction Date' != ''
  AND raw_line_data->>'Transaction Date' ~ '^\d{1,2}/\d{1,2}/\d{2}$';

-- Backfill service_level from Charge Description on primary FRT row
-- This is more complex because raw_line_data on each line item only stores
-- ONE row from the CSV (the first one — typically the FRT row). If that
-- row has Charge Classification Code = FRT and a Charge Description that
-- isn't an adjustment, use it.
UPDATE invoice_line_items
SET service_level = TRIM(raw_line_data->>'Charge Description')
WHERE service_level IS NULL
  AND raw_line_data->>'Charge Classification Code' = 'FRT'
  AND raw_line_data->>'Charge Description' IS NOT NULL
  AND raw_line_data->>'Charge Description' != ''
  AND raw_line_data->>'Charge Description' NOT LIKE 'Shipping Charge Correction%'
  AND raw_line_data->>'Charge Description' NOT LIKE '%Adjustment%';

-- Mark adjustment-only lines (where the stored raw row IS an adjustment FRT)
UPDATE invoice_line_items
SET is_adjustment_only = TRUE,
    service_level = TRIM(raw_line_data->>'Charge Description')
WHERE is_adjustment_only = FALSE
  AND service_level IS NULL
  AND raw_line_data->>'Charge Classification Code' = 'FRT'
  AND (raw_line_data->>'Charge Description' LIKE 'Shipping Charge Correction%'
       OR raw_line_data->>'Charge Description' LIKE '%Adjustment%');

-- Verification
DO $$
DECLARE
  total_rows INT;
  service_level_populated INT;
  date_shipped_populated INT;
  date_invoiced_populated INT;
  adjustment_only_count INT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM invoice_line_items
    WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679';
  SELECT COUNT(*) INTO service_level_populated FROM invoice_line_items
    WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679' AND service_level IS NOT NULL;
  SELECT COUNT(*) INTO date_shipped_populated FROM invoice_line_items
    WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679' AND date_shipped IS NOT NULL;
  SELECT COUNT(*) INTO date_invoiced_populated FROM invoice_line_items
    WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679' AND date_invoiced IS NOT NULL;
  SELECT COUNT(*) INTO adjustment_only_count FROM invoice_line_items
    WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679' AND is_adjustment_only = TRUE;

  RAISE NOTICE 'Backfill verification on test invoice 904d933a:';
  RAISE NOTICE '  Total rows: %', total_rows;
  RAISE NOTICE '  service_level populated: % (target: most should populate)', service_level_populated;
  RAISE NOTICE '  date_shipped populated: % (target: 100%% — Transaction Date is universal)', date_shipped_populated;
  RAISE NOTICE '  date_invoiced populated: % (target: 100%% — Invoice Date is universal)', date_invoiced_populated;
  RAISE NOTICE '  is_adjustment_only flagged: %', adjustment_only_count;
END $$;

COMMIT;
