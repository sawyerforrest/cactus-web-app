-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: verify-data.sql
-- DESCRIPTION: A quick script to "Read" the data we seeded.
-- ==========================================================

-- 1. Show me the Organization and its Balance
-- We are "Joining" two tables together using the org_id link.

SELECT 
    Organizations.name AS org_name, 
    Meters.current_balance AS wallet_balance,
    Organizations.terms_days AS payment_terms
FROM Organizations
JOIN Meters ON Organizations.id = Meters.org_id
WHERE Organizations.name = 'Cactus Test 3PL';

-- 2. Show me all the Carrier Mappings we have "taught" Cactus
-- This ensures our DHL eCommerce rule is saved.

SELECT * FROM Carrier_Invoice_Mappings;