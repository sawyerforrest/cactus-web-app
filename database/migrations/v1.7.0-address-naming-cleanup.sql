-- ==========================================================================
-- MIGRATION v1.7.0 — Address column naming cleanup
-- Date: 2026-04-25
-- Purpose: Standardize on `postal_code` (not `zip`) and `line_1`/`line_2`
--          (not `line1`/`line2`) across invoice_line_items and locations.
--          Pure RENAME — no data transformation. Data preserved atomically.
-- Affects: 8 columns across 2 tables, 1 index, and a data-only backfill of
--          carrier_invoice_mappings.cactus_standard_field where the value
--          mirrors a renamed column.
-- ==========================================================================

BEGIN;

-- invoice_line_items (6 column renames)
ALTER TABLE invoice_line_items RENAME COLUMN address_sender_zip TO address_sender_postal_code;
ALTER TABLE invoice_line_items RENAME COLUMN address_receiver_zip TO address_receiver_postal_code;
ALTER TABLE invoice_line_items RENAME COLUMN address_sender_line1 TO address_sender_line_1;
ALTER TABLE invoice_line_items RENAME COLUMN address_sender_line2 TO address_sender_line_2;
ALTER TABLE invoice_line_items RENAME COLUMN address_receiver_line1 TO address_receiver_line_1;
ALTER TABLE invoice_line_items RENAME COLUMN address_receiver_line2 TO address_receiver_line_2;

-- locations (2 column renames)
ALTER TABLE locations RENAME COLUMN address_line1 TO address_line_1;
ALTER TABLE locations RENAME COLUMN address_line2 TO address_line_2;

-- Index name follows the column it sits on. RENAME COLUMN updates the index
-- definition automatically but leaves the index *name* with the legacy "zip"
-- token. Rename it to match the new convention.
ALTER INDEX idx_invoice_line_items_address_receiver_zip
  RENAME TO idx_invoice_line_items_address_receiver_postal_code;

-- carrier_invoice_mappings.cactus_standard_field stores the canonical
-- column name as a string. Renormalize the four rows that reference legacy
-- names so the vocabulary matches the schema.
UPDATE carrier_invoice_mappings SET cactus_standard_field = 'address_sender_line_1'
  WHERE cactus_standard_field = 'address_sender_line1';
UPDATE carrier_invoice_mappings SET cactus_standard_field = 'address_sender_line_2'
  WHERE cactus_standard_field = 'address_sender_line2';
UPDATE carrier_invoice_mappings SET cactus_standard_field = 'address_sender_postal_code'
  WHERE cactus_standard_field = 'address_sender_zip';
UPDATE carrier_invoice_mappings SET cactus_standard_field = 'address_receiver_line_1'
  WHERE cactus_standard_field = 'address_receiver_line1';
UPDATE carrier_invoice_mappings SET cactus_standard_field = 'address_receiver_line_2'
  WHERE cactus_standard_field = 'address_receiver_line2';
UPDATE carrier_invoice_mappings SET cactus_standard_field = 'address_receiver_postal_code'
  WHERE cactus_standard_field = 'address_receiver_zip';

-- Verification NOTICE — fail the transaction if any rename did not land.
DO $$
DECLARE
  ili_renamed INT;
  loc_renamed INT;
  idx_renamed INT;
  mappings_legacy INT;
BEGIN
  SELECT COUNT(*) INTO ili_renamed
    FROM information_schema.columns
    WHERE table_name = 'invoice_line_items'
      AND column_name IN (
        'address_sender_postal_code', 'address_receiver_postal_code',
        'address_sender_line_1', 'address_sender_line_2',
        'address_receiver_line_1', 'address_receiver_line_2'
      );
  SELECT COUNT(*) INTO loc_renamed
    FROM information_schema.columns
    WHERE table_name = 'locations'
      AND column_name IN ('address_line_1', 'address_line_2');
  SELECT COUNT(*) INTO idx_renamed
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_invoice_line_items_address_receiver_postal_code';
  SELECT COUNT(*) INTO mappings_legacy
    FROM carrier_invoice_mappings
    WHERE cactus_standard_field IN (
      'address_sender_line1', 'address_sender_line2', 'address_sender_zip',
      'address_receiver_line1', 'address_receiver_line2', 'address_receiver_zip'
    );
  RAISE NOTICE 'v1.7.0: ili columns: %/6, loc columns: %/2, index renamed: %/1, legacy mappings remaining: %',
    ili_renamed, loc_renamed, idx_renamed, mappings_legacy;
  IF ili_renamed <> 6 OR loc_renamed <> 2 OR idx_renamed <> 1 OR mappings_legacy <> 0 THEN
    RAISE EXCEPTION 'v1.7.0 verification failed';
  END IF;
END $$;

COMMIT;
