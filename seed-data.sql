-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: seed-data.sql
-- DESCRIPTION: Initial test data to bring the DB to life.
-- ==========================================================

-- 1. Create a Test Organization
-- We use a 'Variable' called @test_org_id to keep track of the random ID
-- so we can link the Meter to it in the next step.

INSERT INTO Organizations (name, terms_days)
VALUES ('Cactus Test 3PL', 7);

-- 2. Create a Meter for that Organization
-- Note: In a real database tool, we'd grab the ID from above.
-- For this "Seed" file, we are just telling the computer:
-- "Find the Org we just made and give them a wallet."

INSERT INTO Meters (org_id, current_balance, min_threshold, reload_amount)
SELECT id, 500.0000, 100.0000, 500.0000 
FROM Organizations 
WHERE name = 'Cactus Test 3PL' 
LIMIT 1;

-- 3. Create a Sample Mapping (DHL eCommerce Fuel)
-- This "Teaches" Cactus how to read a DHL Fuel Surcharge.

INSERT INTO Carrier_Invoice_Mappings (carrier_code, raw_header_name, cactus_standard_field)
VALUES ('DHL_ECOM', 'Fuel Surcharge', 'fuel_surcharge');