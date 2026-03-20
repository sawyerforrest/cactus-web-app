-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: seed-data.sql
-- PURPOSE: Testing Single-Ceiling & Parent/Child Logic
-- ==========================================================

-- 1. Create the Parent 3PL
INSERT INTO Organizations (name, org_type, terms_days)
VALUES ('Cactus 3PL Headquarters', '3PL', 7);

-- 2. Create a Child Merchant linked to that 3PL
INSERT INTO Organizations (name, org_type, parent_org_id)
SELECT 'Desert Boutique', 'SUB_CLIENT', id 
FROM Organizations 
WHERE name = 'Cactus 3PL Headquarters' 
LIMIT 1;

-- 3. Give the Parent 3PL a Metered Wallet
INSERT INTO Meters (org_id, current_balance, min_threshold, reload_amount)
SELECT id, 500.0000, 100.0000, 500.0000 
FROM Organizations 
WHERE name = 'Cactus 3PL Headquarters' 
LIMIT 1;

-- 4. Create a Test Shipment with Single-Ceiling Math
-- Scenario: Carrier cost is $12.3456. Markup is 15% (0.15).
-- Math: 12.3456 * 1.15 = 14.19744. 
-- Ceiling should round this to $14.20.

INSERT INTO Shipment_Ledger (org_id, tracking_number, raw_carrier_cost, markup_rate, final_merchant_rate)
SELECT 
    id, 
    '1Z-CACTUS-TEST-001', 
    12.3456, 
    0.1500, 
    14.20 -- Manually calculated for this seed to verify logic later
FROM Organizations 
WHERE name = 'Desert Boutique' 
LIMIT 1;