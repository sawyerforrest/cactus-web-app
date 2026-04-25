-- ==========================================================================
-- v1.7.0 BACKFILL — address normalization
-- Date: 2026-04-25
-- Runs AFTER v1.7.0-address-naming-cleanup.sql.
--
-- 1. Populates locations.normalized_address for the one row that the
--    pre-Session-C.1 location form failed to write (Utah Test). Bug fix
--    landed in src/alamo/app/orgs/[id]/locations/new/page.tsx in the
--    same session.
-- 2. Re-renders invoice_line_items.address_sender_normalized so existing
--    rows include line_2 in the canonical string. The parser now writes
--    line_2 going forward; this update aligns historical data.
-- ==========================================================================

BEGIN;

UPDATE locations
SET normalized_address = UPPER(CONCAT_WS(', ',
  NULLIF(address_line_1, ''),
  NULLIF(address_line_2, ''),
  NULLIF(city, ''),
  NULLIF(state, ''),
  NULLIF(postal_code, ''),
  NULLIF(country, '')
))
WHERE id = '429a0963-a966-4f93-9a9e-629f8944584d';

UPDATE invoice_line_items
SET address_sender_normalized = UPPER(CONCAT_WS(', ',
  NULLIF(address_sender_line_1, ''),
  NULLIF(address_sender_line_2, ''),
  NULLIF(address_sender_city, ''),
  NULLIF(address_sender_state, ''),
  NULLIF(address_sender_postal_code, ''),
  NULLIF(address_sender_country, '')
))
WHERE address_sender_line_1 IS NOT NULL
   OR address_sender_city IS NOT NULL;

DO $$
DECLARE
  null_locations INT;
BEGIN
  SELECT COUNT(*) INTO null_locations
    FROM locations WHERE normalized_address IS NULL;
  RAISE NOTICE 'v1.7.0 backfill: locations with NULL normalized_address = %', null_locations;
  IF null_locations <> 0 THEN
    RAISE EXCEPTION 'v1.7.0 backfill verification failed';
  END IF;
END $$;

COMMIT;
