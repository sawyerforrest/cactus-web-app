-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: seed-data.sql
-- VERSION: 1.1.0
-- PURPOSE: Populate the database with realistic test data.
--
-- WHAT IS SEED DATA?
-- "Seeding" a database means inserting fake-but-realistic data
-- so you can test your application without needing real clients
-- or real shipments. Think of it as setting up a board game
-- before you play — the pieces aren't real, but they let you
-- practice the moves.
--
-- RUN ORDER: Always run database-setup.sql first, then this file.
-- ==========================================================


-- ==========================================================
-- SECTION 1: ORGANIZATIONS
-- We create a 3PL parent org and a merchant child org.
-- This tests the parent/child hierarchy that Phase 2 billing
-- depends on.
--
-- WHAT IS A 3PL?
-- A Third-Party Logistics provider (3PL) is a company that
-- handles fulfillment for other brands. In Cactus, a 3PL is
-- the top-level client. The brands they ship for are
-- "sub-clients" — child organizations linked to the 3PL parent.
-- ==========================================================

INSERT INTO organizations (name, org_type, terms_days)
VALUES ('Cactus 3PL Headquarters', '3PL', 7);

-- Create a child merchant linked to the 3PL above.
-- Note: We use a SELECT to find the parent's id rather than
-- hardcoding it, because Supabase auto-generates UUIDs and we
-- don't know the value until after the first INSERT.
-- UUID = Universally Unique Identifier — a randomly generated
-- ID that is guaranteed to be unique across all records.
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
-- SECTION 2: RATE CARDS
-- Rate cards define how much markup Cactus adds to the raw
-- carrier cost before billing the client.
--
-- WHAT IS A RATE CARD?
-- Think of it like a pricing agreement. For a given org and
-- carrier, a rate card says "add 15% on top of whatever UPS
-- charges us." The Single-Ceiling pipeline reads from this
-- table every time a shipment is rated.
--
-- We create one rate card per carrier for the 3PL org.
-- ==========================================================

-- UPS rate card: 15% markup, applies to all UPS service levels
INSERT INTO rate_cards (org_id, carrier_code, service_level, markup_type, markup_percentage)
SELECT id, 'UPS', NULL, 'PERCENTAGE', 0.1500
FROM organizations WHERE name = 'Cactus 3PL Headquarters' LIMIT 1;

-- FedEx rate card: 15% markup, applies to all FedEx service levels
INSERT INTO rate_cards (org_id, carrier_code, service_level, markup_type, markup_percentage)
SELECT id, 'FEDEX', NULL, 'PERCENTAGE', 0.1500
FROM organizations WHERE name = 'Cactus 3PL Headquarters' LIMIT 1;

-- USPS rate card: 12% markup (slightly lower — USPS is high volume)
INSERT INTO rate_cards (org_id, carrier_code, service_level, markup_type, markup_percentage)
SELECT id, 'USPS', NULL, 'PERCENTAGE', 0.1200
FROM organizations WHERE name = 'Cactus 3PL Headquarters' LIMIT 1;

-- DHL eCommerce rate card: 18% markup
INSERT INTO rate_cards (org_id, carrier_code, service_level, markup_type, markup_percentage)
SELECT id, 'DHL_ECOM', NULL, 'PERCENTAGE', 0.1800
FROM organizations WHERE name = 'Cactus 3PL Headquarters' LIMIT 1;


-- ==========================================================
-- SECTION 3: METER
-- A meter is the pre-paid USPS postage wallet. The org loads
-- funds into it, and every time a USPS label is printed, the
-- cost is deducted from the balance.
--
-- We give the 3PL a $500.00 opening balance.
-- ==========================================================

INSERT INTO meters (org_id, current_balance, min_threshold, reload_amount, apply_cc_fee)
SELECT id, 500.0000, 100.0000, 500.0000, FALSE
FROM organizations WHERE name = 'Cactus 3PL Headquarters' LIMIT 1;


-- ==========================================================
-- SECTION 4: METER TRANSACTIONS
-- Every change to the meter balance must have a corresponding
-- transaction record. The opening load is recorded here.
--
-- IMPORTANT CONCEPT — IMMUTABLE LEDGER:
-- Think of meter_transactions like a bank statement. You never
-- go back and erase a line from your bank statement — you just
-- add new entries. This table works the same way. The current
-- balance is always the sum of all transactions, not a number
-- someone typed in directly.
-- ==========================================================

INSERT INTO meter_transactions (
    meter_id,
    org_id,
    transaction_type,
    gross_amount,
    fee_amount,
    net_amount,
    balance_after,
    description
)
SELECT
    m.id,
    m.org_id,
    'RELOAD',
    500.0000,   -- gross amount loaded
    0.0000,     -- no CC fee (ACH payment, apply_cc_fee = FALSE)
    500.0000,   -- net amount credited to postage balance
    500.0000,   -- balance after this transaction
    'Seed data: initial USPS meter load — ACH, no processing fee'
FROM meters m
INNER JOIN organizations o ON m.org_id = o.id
WHERE o.name = 'Cactus 3PL Headquarters';


-- ==========================================================
-- SECTION 5: CARRIER INVOICE MAPPINGS
-- These rows "teach" Cactus how to read messy carrier invoices.
-- Different carriers use different names for the same charges.
-- For example, UPS calls it "Fuel Surcharge" but DHL calls it
-- "FUE". This table maps all of them to one Cactus standard name.
--
-- WHAT IS NORMALIZATION?
-- Normalization means taking messy, inconsistent data from
-- multiple sources and converting it into one clean, consistent
-- format. Like translating French, Spanish, and German all into
-- English so you can read them in one place.
-- ==========================================================

-- UPS mappings
INSERT INTO carrier_invoice_mappings (carrier_code, raw_header_name, cactus_standard_field)
VALUES
    ('UPS', 'Fuel Surcharge',           'fuel_surcharge'),
    ('UPS', 'Residential Surcharge',    'residential_surcharge'),
    ('UPS', 'Address Correction',       'address_correction'),
    ('UPS', 'Delivery Area Surcharge',  'delivery_area_surcharge'),
    ('UPS', 'Additional Handling',      'additional_handling');

-- FedEx mappings
INSERT INTO carrier_invoice_mappings (carrier_code, raw_header_name, cactus_standard_field)
VALUES
    ('FEDEX', 'Fuel',                       'fuel_surcharge'),
    ('FEDEX', 'Residential Delivery',       'residential_surcharge'),
    ('FEDEX', 'Address Correction',         'address_correction'),
    ('FEDEX', 'Delivery Area Surcharge',    'delivery_area_surcharge'),
    ('FEDEX', 'Additional Handling Charge', 'additional_handling');

-- USPS mappings
INSERT INTO carrier_invoice_mappings (carrier_code, raw_header_name, cactus_standard_field)
VALUES
    ('USPS', 'Nonmachinable Surcharge',     'nonmachinable_surcharge'),
    ('USPS', 'APV Adjustment',              'apv_adjustment'),
    ('USPS', 'Dim Weight Adjustment',       'dim_weight_adjustment');

-- DHL eCommerce mappings
INSERT INTO carrier_invoice_mappings (carrier_code, raw_header_name, cactus_standard_field)
VALUES
    ('DHL_ECOM', 'FUE',                     'fuel_surcharge'),
    ('DHL_ECOM', 'Fuel_Surch',              'fuel_surcharge'),
    ('DHL_ECOM', 'Residential',             'residential_surcharge'),
    ('DHL_ECOM', 'Address_Correction',      'address_correction');


-- ==========================================================
-- SECTION 6: LOCATIONS
-- A location is a ship-from address. In Phase 1 this is used
-- when requesting rates from carriers — they need to know
-- where the package is coming FROM to calculate the cost.
-- ==========================================================

INSERT INTO locations (org_id, name, location_type, address_line1, city, state, postal_code, country)
SELECT
    id,
    'Cactus 3PL Main Warehouse',
    'WAREHOUSE',
    '1234 Desert Logistics Blvd',
    'Phoenix',
    'AZ',
    '85001',
    'US'
FROM organizations WHERE name = 'Cactus 3PL Headquarters' LIMIT 1;


-- ==========================================================
-- SECTION 7: SHIPMENT LEDGER TEST ENTRY
-- This creates one test shipment to verify the Single-Ceiling
-- math pipeline is working correctly.
--
-- THE MATH (read this carefully — this is the core of Cactus):
--   Raw carrier cost:    $12.3456
--   Markup:              15% (0.15)
--   Pre-ceiling amount:  $12.3456 × 1.15 = $14.19744
--   After ceiling:       CEILING($14.19744 to next cent) = $14.20
--
-- $14.19744 is NOT a whole cent. The next whole cent up is $14.20.
-- That $14.20 is what the client gets billed. Cactus keeps the
-- difference between $14.20 and whatever the carrier actually
-- charged Cactus.
-- ==========================================================

INSERT INTO shipment_ledger (
    org_id,
    tracking_number,
    carrier_code,
    service_level,
    raw_carrier_cost,
    markup_percentage,
    pre_ceiling_amount,
    final_merchant_rate,
    reconciled
)
SELECT
    id,
    '1Z-CACTUS-TEST-001',
    'UPS',
    'GROUND',
    12.3456,    -- what Cactus pays UPS
    0.1500,     -- 15% markup (from rate card)
    14.1974,    -- 12.3456 × 1.15 = 14.19744, stored as 14.1974
    14.2000,    -- CEILING(14.19744 × 100) / 100 = 14.20
    FALSE       -- not yet reconciled against a carrier invoice
FROM organizations
WHERE name = 'Desert Boutique'
LIMIT 1;
