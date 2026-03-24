-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: verify-data.sql
-- VERSION: 1.1.0
-- PURPOSE: Confirm the database is set up correctly after
--          running database-setup.sql and seed-data.sql.
--
-- HOW TO USE THIS FILE:
-- Run each query block one at a time in the Supabase SQL Editor.
-- Each query has a comment explaining what you should see.
-- If the results match the expected output, that section passes.
--
-- WHAT IS A JOIN?
-- A JOIN is a way to combine data from two tables into one result.
-- For example, shipments have an org_id but not the org name.
-- A JOIN lets us pull both at once: "show me shipments AND the
-- name of the org they belong to."
-- ==========================================================


-- ==========================================================
-- CHECK 1: Organizations
-- EXPECTED: 2 rows
--   - "Cactus 3PL Headquarters" with org_type = '3PL'
--   - "Desert Boutique" with org_type = 'MERCHANT'
--     and a non-null parent_org_id pointing to the 3PL
-- ==========================================================

SELECT
    name,
    org_type,
    terms_days,
    CASE
        WHEN parent_org_id IS NULL THEN 'Top-level org'
        ELSE 'Child of: ' || (
            SELECT name FROM organizations parent
            WHERE parent.id = o.parent_org_id
        )
    END AS hierarchy
FROM organizations o
ORDER BY created_at;


-- ==========================================================
-- CHECK 2: Meter & Opening Balance
-- EXPECTED: 1 row
--   - org_name = "Cactus 3PL Headquarters"
--   - wallet_balance = 500.0000
--   - min_threshold = 100.0000
--   - reload_amount = 500.0000
-- ==========================================================

SELECT
    o.name                  AS org_name,
    m.current_balance       AS wallet_balance,
    m.min_threshold         AS reload_trigger,
    m.reload_amount         AS reload_amount,
    m.apply_cc_fee          AS cc_fee_enabled
FROM organizations o
INNER JOIN meters m ON o.id = m.org_id;


-- ==========================================================
-- CHECK 3: Meter Transactions (Opening Ledger Entry)
-- EXPECTED: 1 row
--   - transaction_type = 'RELOAD'
--   - gross_amount = 500.0000
--   - fee_amount = 0.0000
--   - net_amount = 500.0000
--   - balance_after = 500.0000
-- ==========================================================

SELECT
    mt.transaction_type,
    mt.gross_amount,
    mt.fee_amount,
    mt.net_amount,
    mt.balance_after,
    mt.description
FROM meter_transactions mt
INNER JOIN organizations o ON mt.org_id = o.id
WHERE o.name = 'Cactus 3PL Headquarters';


-- ==========================================================
-- CHECK 4: Rate Cards
-- EXPECTED: 4 rows — one for each carrier seeded
--   UPS: 15%, FedEx: 15%, USPS: 12%, DHL_ECOM: 18%
-- ==========================================================

SELECT
    o.name              AS org_name,
    rc.carrier_code,
    rc.markup_type,
    rc.markup_percentage,
    rc.is_active
FROM rate_cards rc
INNER JOIN organizations o ON rc.org_id = o.id
ORDER BY rc.carrier_code;


-- ==========================================================
-- CHECK 5: Carrier Invoice Mappings (Normalization Layer)
-- EXPECTED: Multiple rows, grouped by carrier.
--   Each row shows a raw carrier header mapped to a
--   Cactus standard field name.
-- ==========================================================

SELECT
    carrier_code,
    raw_header_name,
    cactus_standard_field,
    effective_date,
    deprecated_date
FROM carrier_invoice_mappings
ORDER BY carrier_code, raw_header_name;


-- ==========================================================
-- CHECK 6: Single-Ceiling Math Verification
-- This is the most important check. It verifies the core
-- financial logic of Cactus is calculating correctly.
--
-- EXPECTED:
--   tracking_number     = '1Z-CACTUS-TEST-001'
--   raw_carrier_cost    = 12.3456
--   markup_percentage   = 0.1500
--   pre_ceiling_amount  = 14.1974
--   final_merchant_rate = 14.2000
--   ceiling_verified    = 'PASS'
--
-- The ceiling_verified column recalculates the math live and
-- confirms it matches what was stored. If it shows 'FAIL',
-- the Single-Ceiling pipeline has a bug.
-- ==========================================================

SELECT
    o.name                      AS org_name,
    sl.tracking_number,
    sl.carrier_code,
    sl.service_level,
    sl.raw_carrier_cost,
    sl.markup_percentage,
    sl.pre_ceiling_amount,
    sl.final_merchant_rate,
    CASE
        WHEN sl.final_merchant_rate =
            (CEIL(sl.raw_carrier_cost * (1 + sl.markup_percentage) * 100) / 100)
        THEN 'PASS ✓'
        ELSE 'FAIL ✗ — check Single-Ceiling pipeline'
    END                         AS ceiling_verified
FROM shipment_ledger sl
INNER JOIN organizations o ON sl.org_id = o.id;


-- ==========================================================
-- CHECK 7: Full Table Inventory
-- EXPECTED: Shows row counts for all 10 tables.
-- Use this as a quick health check any time you want to
-- confirm the database is populated.
--
-- Approximate expected counts after seed:
--   audit_logs: 0
--   carrier_invoice_mappings: 14
--   cactus_invoices: 0
--   locations: 1
--   meter_transactions: 1
--   meters: 1
--   org_users: 0
--   organizations: 2
--   rate_cards: 4
--   shipment_ledger: 1
-- ==========================================================

SELECT 'audit_logs'                 AS table_name, COUNT(*) AS row_count FROM audit_logs
UNION ALL
SELECT 'carrier_invoice_mappings',               COUNT(*) FROM carrier_invoice_mappings
UNION ALL
SELECT 'cactus_invoices',                        COUNT(*) FROM cactus_invoices
UNION ALL
SELECT 'locations',                              COUNT(*) FROM locations
UNION ALL
SELECT 'meter_transactions',                     COUNT(*) FROM meter_transactions
UNION ALL
SELECT 'meters',                                 COUNT(*) FROM meters
UNION ALL
SELECT 'org_users',                              COUNT(*) FROM org_users
UNION ALL
SELECT 'organizations',                          COUNT(*) FROM organizations
UNION ALL
SELECT 'rate_cards',                             COUNT(*) FROM rate_cards
UNION ALL
SELECT 'shipment_ledger',                        COUNT(*) FROM shipment_ledger
ORDER BY table_name;
