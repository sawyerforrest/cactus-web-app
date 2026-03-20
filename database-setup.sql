-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: database-setup.sql
-- ==========================================================

-- 1. THE ORGANIZATIONS (The Parent Table)
-- We build this first because everything else needs to "look" at it.
CREATE TABLE Organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- A unique, unguessable ID
    name TEXT NOT NULL,                           -- The name of the 3PL or Merchant
    terms_days INT DEFAULT 7,                     -- How many days they have to pay
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. THE METER (The Wallet)
-- This table "points" to the Organizations table via the org_id.
CREATE TABLE Meters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),    -- This is the "Link" to the parent
    current_balance DECIMAL(18, 4) DEFAULT 0.0000, -- 4 decimal places for precision
    min_threshold DECIMAL(18, 4) DEFAULT 100.0000,
    reload_amount DECIMAL(18, 4) DEFAULT 500.0000,
    primary_pm_id TEXT,                          -- Primary Payment Method ID
    backup_pm_id TEXT                            -- Backup Payment Method ID
);

-- 3. THE NORMALIZATION LAYER (The Translator)
-- This tells Cactus how to read messy carrier invoices.
CREATE TABLE Carrier_Invoice_Mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code TEXT NOT NULL,           -- e.g., 'DHL_ECOM'
    raw_header_name TEXT NOT NULL,        -- The name in the carrier's CSV file
    cactus_standard_field TEXT NOT NULL,   -- The name in our standardized Cactus system
    UNIQUE(carrier_code, raw_header_name) -- Prevents duplicate rules
);

-- 4. THE SHIPMENT LEDGER (The Math Engine)
-- This is where the "Double-Ceiling" markup lives.
CREATE TABLE Shipment_Ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    tracking_number TEXT UNIQUE NOT NULL,
    
    -- STAGE 1 & 2: Primary Markup
    raw_carrier_cost DECIMAL(18, 4),
    primary_markup_rate DECIMAL(7, 4),
    primary_subtotal_rounded DECIMAL(12, 2), -- First "Ceiling" round-up
    
    -- STAGE 3 & 4: Secondary Markup
    secondary_markup_rate DECIMAL(7, 4),
    final_cactus_rate DECIMAL(12, 2),        -- Final "Ceiling" round-up
    
    reconciled_at TIMESTAMP DEFAULT NOW()
);

-- 5. CACTUS INVOICES (The Billing Output)
CREATE TABLE Cactus_Invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    qbo_invoice_id TEXT,                    -- Our link to QuickBooks Online
    total_amount DECIMAL(12, 2),
    due_date DATE NOT NULL,                 -- When the "Auto-Pull" happens
    status TEXT DEFAULT 'UNPAID'
);