-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: verify-data.sql
-- VERSION: 1.4.0
-- UPDATED: 2026-03-28
--
-- HOW TO USE:
-- Run each query block one at a time in Supabase SQL Editor.
-- Each check has an EXPECTED result listed above it.
-- Run all checks after database-setup.sql and seed-data.sql.
-- ==========================================================


-- ==========================================================
-- CHECK 1: Table Row Counts
-- EXPECTED: 16 tables with correct row counts
--
--   audit_logs:                0
--   carrier_invoice_mappings:  21
--   carrier_invoices:          1
--   cactus_invoice_line_items: 0
--   cactus_invoices:           0
--   invoice_line_items:        2
--   locations:                 3
--   meter_transactions:        1
--   meters:                    1
--   org_carrier_accounts:      4
--   org_users:                 0
--   organizations:             2
--   rate_cards:                1
--   rate_shop_log:             0
--   shipment_events:           1
--   shipment_ledger:           3
-- ==========================================================

SELECT 'audit_logs',                (SELECT COUNT(*)::int FROM audit_logs)
UNION ALL
SELECT 'carrier_invoice_mappings',  (SELECT COUNT(*)::int FROM carrier_invoice_mappings)
UNION ALL
SELECT 'carrier_invoices',          (SELECT COUNT(*)::int FROM carrier_invoices)
UNION ALL
SELECT 'cactus_invoice_line_items', (SELECT COUNT(*)::int FROM cactus_invoice_line_items)
UNION ALL
SELECT 'cactus_invoices',           (SELECT COUNT(*)::int FROM cactus_invoices)
UNION ALL
SELECT 'invoice_line_items',        (SELECT COUNT(*)::int FROM invoice_line_items)
UNION ALL
SELECT 'locations',                 (SELECT COUNT(*)::int FROM locations)
UNION ALL
SELECT 'meter_transactions',        (SELECT COUNT(*)::int FROM meter_transactions)
UNION ALL
SELECT 'meters',                    (SELECT COUNT(*)::int FROM meters)
UNION ALL
SELECT 'org_carrier_accounts',      (SELECT COUNT(*)::int FROM org_carrier_accounts)
UNION ALL
SELECT 'org_users',                 (SELECT COUNT(*)::int FROM org_users)
UNION ALL
SELECT 'organizations',             (SELECT COUNT(*)::int FROM organizations)
UNION ALL
SELECT 'rate_cards',                (SELECT COUNT(*)::int FROM rate_cards)
UNION ALL
SELECT 'rate_shop_log',             (SELECT COUNT(*)::int FROM rate_shop_log)
UNION ALL
SELECT 'shipment_events',           (SELECT COUNT(*)::int FROM shipment_events)
UNION ALL
SELECT 'shipment_ledger',           (SELECT COUNT(*)::int FROM shipment_ledger)
ORDER BY 1;


-- ==========================================================
-- CHECK 2: carrier_code_enum Values (v1.4.0)
-- EXPECTED: 11 values — LSO should NOT appear
--   UPS, FEDEX, USPS, UNIUNI, GOFO, SHIPX,
--   DHL_ECOM, DHL_EXPRESS, LANDMARK, ONTRAC, OSM
-- ==========================================================

SELECT enumlabel AS carrier_code
FROM pg_enum
WHERE enumtypid = 'carrier_code_enum'::regtype
ORDER BY enumsortorder;


-- ==========================================================
-- CHECK 3: Organization Hierarchy
-- EXPECTED: 2 rows
--   Cactus 3PL Headquarters — 3PL — terms_days: 7 — Top-level org
--   Desert Boutique — MERCHANT — terms_days: 7 — Child of: Cactus 3PL Headquarters
-- ==========================================================

SELECT
    o.name,
    o.org_type,
    o.terms_days,
    CASE
        WHEN o.parent_org_id IS NULL THEN 'Top-level org'
        ELSE 'Child of: ' || (
            SELECT name FROM organizations p WHERE p.id = o.parent_org_id
        )
    END AS hierarchy
FROM organizations o
ORDER BY o.created_at;


-- ==========================================================
-- CHECK 4: Locations with Billing Address Flag
-- EXPECTED: 3 rows, all is_billing_address = TRUE
--   Cactus 3PL Main Warehouse — Phoenix AZ
--   Cactus 3PL Dallas Hub — Dallas TX
--   Desert Boutique Fulfillment Center — Scottsdale AZ
-- ==========================================================

SELECT
    o.name              AS org_name,
    l.name              AS location_name,
    l.city,
    l.state,
    l.normalized_address,
    l.is_billing_address
FROM locations l
INNER JOIN organizations o ON l.org_id = o.id
ORDER BY o.name, l.name;


-- ==========================================================
-- CHECK 5: Carrier Account Profiles
-- EXPECTED: 4 rows
--   Cactus 3PL — UPS lassoed — 15% markup — is_cactus = TRUE
--   Cactus 3PL — FedEx lassoed — 15% markup — is_cactus = TRUE
--   Cactus 3PL — USPS lassoed — 12% markup — is_cactus = TRUE
--   Desert Boutique — UPS dark — 18% markup — is_cactus = TRUE
-- ==========================================================

SELECT
    o.name                          AS org_name,
    oca.carrier_code,
    oca.account_nickname,
    oca.carrier_account_mode,
    oca.markup_percentage,
    oca.dispute_threshold,
    oca.is_cactus_account
FROM org_carrier_accounts oca
INNER JOIN organizations o ON oca.org_id = o.id
ORDER BY o.name, oca.carrier_code;


-- ==========================================================
-- CHECK 6: Meter Balance
-- EXPECTED: 1 row
--   Cactus 3PL Headquarters — balance: 500.0000
-- ==========================================================

SELECT
    o.name          AS org_name,
    m.current_balance,
    m.min_threshold,
    m.reload_amount,
    m.apply_cc_fee,
    mt.transaction_type,
    mt.net_amount,
    mt.balance_after,
    mt.description
FROM meters m
INNER JOIN organizations o ON m.org_id = o.id
INNER JOIN meter_transactions mt ON mt.meter_id = m.id
ORDER BY mt.created_at;


-- ==========================================================
-- CHECK 7: Single-Ceiling Math — All Shipments
-- EXPECTED: ceiling_verified = 'PASS ✓' on all 3 rows
--
-- Lassoed: $12.3456 × 1.15 = $14.19744 → ceiling → $14.20
-- Dark 1:  $18.4500 × 1.18 = $21.7710  → ceiling → $21.78
-- Dark 2:  $27.3300 × 1.18 = $32.2494  → ceiling → $32.25
-- ==========================================================

SELECT
    o.name                  AS org_name,
    sl.tracking_number,
    sl.shipment_source,
    sl.carrier_code,
    sl.service_level,
    sl.raw_carrier_cost,
    sl.markup_percentage,
    sl.pre_ceiling_amount,
    sl.final_billed_rate,
    CASE
        WHEN sl.final_billed_rate =
            (CEIL(sl.raw_carrier_cost * (1 + sl.markup_percentage) * 100) / 100)
        THEN 'PASS ✓'
        ELSE 'FAIL ✗ — check Single-Ceiling pipeline'
    END                     AS ceiling_verified
FROM shipment_ledger sl
INNER JOIN organizations o ON sl.org_id = o.id
ORDER BY sl.created_at;


-- ==========================================================
-- CHECK 8: Dark Account Invoice Pipeline Verification
-- EXPECTED: 2 rows — both ceiling_verified = 'PASS ✓'
--   both billing_status = 'APPROVED'
--   both match_method = 'SHIP_FROM_ADDRESS'
--   both match_status = 'AUTO_MATCHED'
-- ==========================================================

SELECT
    o.name                          AS org_name,
    ili.tracking_number,
    ili.ship_from_address_normalized,
    ili.carrier_charge,
    ili.markup_percentage,
    ili.final_billed_rate,
    ili.match_method,
    ili.match_status,
    ili.billing_status,
    ili.dispute_flag,
    sl.shipment_source,
    CASE
        WHEN ili.final_billed_rate =
            (CEIL(ili.carrier_charge * (1 + ili.markup_percentage) * 100) / 100)
        THEN 'PASS ✓'
        ELSE 'FAIL ✗'
    END                             AS ceiling_verified
FROM invoice_line_items ili
INNER JOIN organizations o ON ili.org_id = o.id
INNER JOIN shipment_ledger sl ON ili.shipment_ledger_id = sl.id
ORDER BY ili.tracking_number;


-- ==========================================================
-- CHECK 9: Shipment Events (Event Sourcing)
-- EXPECTED: 1 row
--   event_type = LABEL_CREATED for 1Z-CACTUS-TEST-001
-- ==========================================================

SELECT
    o.name          AS org_name,
    sl.tracking_number,
    se.event_type,
    se.carrier_code,
    se.carrier_message,
    se.ai_flagged,
    se.created_at
FROM shipment_events se
INNER JOIN shipment_ledger sl ON se.shipment_ledger_id = sl.id
INNER JOIN organizations o ON se.org_id = o.id
ORDER BY se.created_at;


-- ==========================================================
-- CHECK 10: Carrier Invoice Mappings by Carrier
-- EXPECTED: 21 rows total
--   DHL_ECOM: 5
--   FEDEX:    6
--   UPS:      6
--   USPS:     4
-- ==========================================================

SELECT
    carrier_code,
    COUNT(*) AS mapping_count
FROM carrier_invoice_mappings
GROUP BY carrier_code
ORDER BY carrier_code;