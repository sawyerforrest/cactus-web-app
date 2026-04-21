-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: seed-data.sql
-- VERSION: 1.6.1
-- UPDATED: 2026-04-20
--
-- CHANGES IN v1.6.1:
--   - shipment_ledger inserts now write the v1.6.1 markup
--     context triple (markup_type_applied, markup_value_applied,
--     markup_source) instead of the dropped markup_percentage /
--     markup_flat_fee columns.
--   - invoice_line_items inserts updated for v1.6.0 column
--     renames (ship_from_address_* → address_sender_*;
--     carrier_account_number → account_number_carrier) and
--     write the markup context triple instead of the dropped
--     markup_percentage column.
--
-- RUN ORDER:
--   1. database-setup.sql
--   2. all migrations under database/migrations/ in order
--   3. seed-data.sql (this file)
--   4. verify-data.sql
-- ==========================================================


-- ==========================================================
-- SECTION 1: ORGANIZATIONS
-- ==========================================================

INSERT INTO organizations (name, org_type, terms_days)
VALUES ('Cactus 3PL Headquarters', '3PL', 7);

INSERT INTO organizations (name, org_type, terms_days, parent_org_id)
SELECT
    'Desert Boutique',
    'MERCHANT',
    7,
    id
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;


-- ==========================================================
-- SECTION 2: LOCATIONS
-- ==========================================================

-- 3PL main warehouse (Phoenix)
INSERT INTO locations (
    org_id, name, location_type,
    address_line1, city, state, postal_code, country,
    normalized_address, is_billing_address
)
SELECT
    id,
    'Cactus 3PL Main Warehouse',
    'WAREHOUSE',
    '1234 Desert Logistics Blvd',
    'Phoenix', 'AZ', '85001', 'US',
    '1234 DESERT LOGISTICS BLVD, PHOENIX, AZ, 85001, US',
    TRUE
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;

-- 3PL second warehouse (Dallas)
INSERT INTO locations (
    org_id, name, location_type,
    address_line1, city, state, postal_code, country,
    normalized_address, is_billing_address
)
SELECT
    id,
    'Cactus 3PL Dallas Hub',
    'WAREHOUSE',
    '5678 Lone Star Pkwy',
    'Dallas', 'TX', '75201', 'US',
    '5678 LONE STAR PKWY, DALLAS, TX, 75201, US',
    TRUE
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;

-- Desert Boutique warehouse (Scottsdale)
INSERT INTO locations (
    org_id, name, location_type,
    address_line1, city, state, postal_code, country,
    normalized_address, is_billing_address
)
SELECT
    id,
    'Desert Boutique Fulfillment Center',
    'SHIP_FROM',
    '999 Saguaro Way',
    'Scottsdale', 'AZ', '85251', 'US',
    '999 SAGUARO WAY, SCOTTSDALE, AZ, 85251, US',
    TRUE
FROM organizations
WHERE name = 'Desert Boutique'
LIMIT 1;


-- ==========================================================
-- SECTION 3: CARRIER ACCOUNTS
-- ==========================================================

-- 3PL: UPS lassoed
INSERT INTO org_carrier_accounts (
    org_id, carrier_code, account_number, account_nickname,
    carrier_account_mode, is_cactus_account,
    markup_percentage, markup_flat_fee, dispute_threshold
)
SELECT
    id, 'UPS', 'CACTUS-UPS-001',
    'Cactus 3PL UPS — Warehance',
    'lassoed_carrier_account', TRUE,
    0.1500, 0.0000, 2.0000
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;

-- 3PL: FedEx lassoed
INSERT INTO org_carrier_accounts (
    org_id, carrier_code, account_number, account_nickname,
    carrier_account_mode, is_cactus_account,
    markup_percentage, markup_flat_fee, dispute_threshold
)
SELECT
    id, 'FEDEX', 'CACTUS-FEDEX-001',
    'Cactus 3PL FedEx — Warehance',
    'lassoed_carrier_account', TRUE,
    0.1500, 0.0000, 2.0000
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;

-- 3PL: USPS lassoed
INSERT INTO org_carrier_accounts (
    org_id, carrier_code, account_number, account_nickname,
    carrier_account_mode, is_cactus_account,
    markup_percentage, markup_flat_fee, dispute_threshold
)
SELECT
    id, 'USPS', 'CACTUS-USPS-001',
    'Cactus 3PL USPS Meter',
    'lassoed_carrier_account', TRUE,
    0.1200, 0.0000, 1.0000
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;

-- Desert Boutique: UPS dark
INSERT INTO org_carrier_accounts (
    org_id, carrier_code, account_number, account_nickname,
    carrier_account_mode, is_cactus_account,
    markup_percentage, markup_flat_fee, dispute_threshold
)
SELECT
    id, 'UPS', 'CACTUS-UPS-001',
    'Desert Boutique UPS — ShipStation (Dark)',
    'dark_carrier_account', TRUE,
    0.1800, 0.0000, 2.0000
FROM organizations
WHERE name = 'Desert Boutique'
LIMIT 1;


-- ==========================================================
-- SECTION 4: RATE CARDS
-- ==========================================================

INSERT INTO rate_cards (
    org_carrier_account_id, org_id,
    service_level, nickname, effective_date
)
SELECT
    oca.id, oca.org_id,
    'GROUND_ADVANTAGE',
    'USPS GA Custom Rates — Q1 2026',
    '2026-01-01'
FROM org_carrier_accounts oca
INNER JOIN organizations o ON oca.org_id = o.id
WHERE o.name = 'Cactus 3PL Headquarters'
AND oca.carrier_code = 'USPS'
LIMIT 1;


-- ==========================================================
-- SECTION 5: METER
-- ==========================================================

INSERT INTO meters (
    org_id, current_balance, min_threshold,
    reload_amount, apply_cc_fee
)
SELECT id, 500.0000, 100.0000, 500.0000, FALSE
FROM organizations
WHERE name = 'Cactus 3PL Headquarters'
LIMIT 1;

INSERT INTO meter_transactions (
    meter_id, org_id, transaction_type,
    gross_amount, fee_amount, net_amount,
    balance_after, description
)
SELECT
    m.id, m.org_id, 'RELOAD',
    500.0000, 0.0000, 500.0000, 500.0000,
    'Seed data: initial USPS meter load — ACH, no fee'
FROM meters m
INNER JOIN organizations o ON m.org_id = o.id
WHERE o.name = 'Cactus 3PL Headquarters';


-- ==========================================================
-- SECTION 6: CARRIER INVOICE MAPPINGS
-- ==========================================================

INSERT INTO carrier_invoice_mappings
    (carrier_code, raw_header_name, cactus_standard_field)
VALUES
    ('UPS', 'Fuel Surcharge',           'fuel_surcharge'),
    ('UPS', 'Residential Surcharge',    'residential_surcharge'),
    ('UPS', 'Address Correction',       'address_correction'),
    ('UPS', 'Delivery Area Surcharge',  'delivery_area_surcharge'),
    ('UPS', 'Additional Handling',      'additional_handling'),
    ('UPS', 'Transportation Charges',   'base_charge'),
    ('FEDEX', 'Fuel',                       'fuel_surcharge'),
    ('FEDEX', 'Residential Delivery',       'residential_surcharge'),
    ('FEDEX', 'Address Correction',         'address_correction'),
    ('FEDEX', 'Delivery Area Surcharge',    'delivery_area_surcharge'),
    ('FEDEX', 'Additional Handling Charge', 'additional_handling'),
    ('FEDEX', 'Base Charge',                'base_charge'),
    ('USPS', 'Nonmachinable Surcharge', 'additional_handling'),
    ('USPS', 'APV Adjustment',          'apv_adjustment'),
    ('USPS', 'Dim Weight Adjustment',   'dim_weight_adjustment'),
    ('USPS', 'Postage',                 'base_charge'),
    ('DHL_ECOM', 'FUE',                 'fuel_surcharge'),
    ('DHL_ECOM', 'Fuel_Surch',          'fuel_surcharge'),
    ('DHL_ECOM', 'Residential',         'residential_surcharge'),
    ('DHL_ECOM', 'Address_Correction',  'address_correction'),
    ('DHL_ECOM', 'Transportation',      'base_charge');


-- ==========================================================
-- SECTION 7: SHIPMENT LEDGER — LASSOED TEST SHIPMENT
--
-- Single-Ceiling math:
--   raw_carrier_cost: $12.3456
--   markup (15%):     × 1.15 = $14.19744
--   pre_ceiling:      $14.1974
--   final_rate:       CEILING → $14.20
-- ==========================================================

INSERT INTO shipment_ledger (
    org_id, org_carrier_account_id,
    tracking_number, carrier_code, service_level,
    shipment_source, raw_carrier_cost,
    markup_type_applied, markup_value_applied, markup_source,
    pre_ceiling_amount, final_billed_rate,
    reconciled, label_printed_at
)
SELECT
    o.id, oca.id,
    '1Z-CACTUS-TEST-001', 'UPS', 'UPS_GROUND',
    'RATING_ENGINE', 12.3456,
    'percentage', 0.150000, 'carrier_account',
    14.1974, 14.2000,
    FALSE, now()
FROM organizations o
INNER JOIN org_carrier_accounts oca
    ON o.id = oca.org_id
    AND oca.carrier_code = 'UPS'
    AND oca.carrier_account_mode = 'lassoed_carrier_account'
WHERE o.name = 'Cactus 3PL Headquarters'
LIMIT 1;

INSERT INTO shipment_events (
    shipment_ledger_id, org_id, event_type,
    carrier_code, carrier_timestamp, carrier_message
)
SELECT
    sl.id, sl.org_id, 'LABEL_CREATED', 'UPS',
    now(), 'Label created via Cactus rating engine — seed data'
FROM shipment_ledger sl
WHERE sl.tracking_number = '1Z-CACTUS-TEST-001';


-- ==========================================================
-- SECTION 8: CARRIER INVOICE BATCH — DARK ACCOUNT TEST
-- ==========================================================

INSERT INTO carrier_invoices (
    org_id, carrier_code, org_carrier_account_id,
    invoice_file_name, invoice_period_start, invoice_period_end,
    status, total_carrier_amount, total_line_items
)
SELECT
    o.id, 'UPS', oca.id,
    'ups-invoice-2026-03-15.csv',
    '2026-03-09', '2026-03-15',
    'APPROVED', 45.7800, 2
FROM organizations o
INNER JOIN org_carrier_accounts oca
    ON o.id = oca.org_id
    AND oca.carrier_code = 'UPS'
    AND oca.carrier_account_mode = 'dark_carrier_account'
WHERE o.name = 'Desert Boutique'
LIMIT 1;

-- Dark shipment 1
-- 18.4500 × 1.18 = 21.771 → ceiling → 21.78
INSERT INTO shipment_ledger (
    org_id, org_carrier_account_id,
    tracking_number, carrier_code, service_level,
    shipment_source, raw_carrier_cost,
    markup_type_applied, markup_value_applied, markup_source,
    pre_ceiling_amount, final_billed_rate,
    reconciled, carrier_invoiced_amount
)
SELECT
    o.id, oca.id,
    '1Z-DARK-TEST-001', 'UPS', 'UPS_GROUND',
    'INVOICE_IMPORT', 18.4500,
    'percentage', 0.180000, 'carrier_account',
    21.7710, 21.7800, TRUE, 18.4500
FROM organizations o
INNER JOIN org_carrier_accounts oca
    ON o.id = oca.org_id
    AND oca.carrier_code = 'UPS'
    AND oca.carrier_account_mode = 'dark_carrier_account'
WHERE o.name = 'Desert Boutique'
LIMIT 1;

-- Dark shipment 2
-- 27.3300 × 1.18 = 32.2494 → ceiling → 32.25
INSERT INTO shipment_ledger (
    org_id, org_carrier_account_id,
    tracking_number, carrier_code, service_level,
    shipment_source, raw_carrier_cost,
    markup_type_applied, markup_value_applied, markup_source,
    pre_ceiling_amount, final_billed_rate,
    reconciled, carrier_invoiced_amount
)
SELECT
    o.id, oca.id,
    '1Z-DARK-TEST-002', 'UPS', 'UPS_GROUND',
    'INVOICE_IMPORT', 27.3300,
    'percentage', 0.180000, 'carrier_account',
    32.2494, 32.2500, TRUE, 27.3300
FROM organizations o
INNER JOIN org_carrier_accounts oca
    ON o.id = oca.org_id
    AND oca.carrier_code = 'UPS'
    AND oca.carrier_account_mode = 'dark_carrier_account'
WHERE o.name = 'Desert Boutique'
LIMIT 1;

-- Invoice line items for dark carrier invoice
INSERT INTO invoice_line_items (
    carrier_invoice_id, org_id, org_carrier_account_id,
    shipment_ledger_id, tracking_number, account_number_carrier,
    address_sender_raw, address_sender_normalized,
    carrier_charge, base_charge, fuel_surcharge,
    match_method, match_status,
    markup_type_applied, markup_value_applied, markup_source,
    pre_ceiling_amount, final_billed_rate,
    billing_status, dispute_flag
)
SELECT
    ci.id, o.id, oca.id, sl.id,
    '1Z-DARK-TEST-001', 'CACTUS-UPS-001',
    '999 Saguaro Way, Scottsdale, AZ 85251',
    '999 SAGUARO WAY, SCOTTSDALE, AZ, 85251, US',
    18.4500, 16.2000, 2.2500,
    'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
    'percentage', 0.180000, 'carrier_account',
    21.7710, 21.7800,
    'APPROVED', FALSE
FROM carrier_invoices ci
INNER JOIN organizations o ON ci.org_id = o.id
INNER JOIN org_carrier_accounts oca ON ci.org_carrier_account_id = oca.id
INNER JOIN shipment_ledger sl ON sl.tracking_number = '1Z-DARK-TEST-001'
WHERE o.name = 'Desert Boutique'
LIMIT 1;

INSERT INTO invoice_line_items (
    carrier_invoice_id, org_id, org_carrier_account_id,
    shipment_ledger_id, tracking_number, account_number_carrier,
    address_sender_raw, address_sender_normalized,
    carrier_charge, base_charge, fuel_surcharge, residential_surcharge,
    match_method, match_status,
    markup_type_applied, markup_value_applied, markup_source,
    pre_ceiling_amount, final_billed_rate,
    billing_status, dispute_flag
)
SELECT
    ci.id, o.id, oca.id, sl.id,
    '1Z-DARK-TEST-002', 'CACTUS-UPS-001',
    '999 Saguaro Way, Scottsdale, AZ 85251',
    '999 SAGUARO WAY, SCOTTSDALE, AZ, 85251, US',
    27.3300, 23.5000, 2.8300, 1.0000,
    'SHIP_FROM_ADDRESS', 'AUTO_MATCHED',
    'percentage', 0.180000, 'carrier_account',
    32.2494, 32.2500,
    'APPROVED', FALSE
FROM carrier_invoices ci
INNER JOIN organizations o ON ci.org_id = o.id
INNER JOIN org_carrier_accounts oca ON ci.org_carrier_account_id = oca.id
INNER JOIN shipment_ledger sl ON sl.tracking_number = '1Z-DARK-TEST-002'
WHERE o.name = 'Desert Boutique'
LIMIT 1;