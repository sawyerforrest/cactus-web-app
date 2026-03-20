-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: database-setup.sql
-- FOCUS: Phase 1 (Single-Ceiling & Billing)
-- ==========================================================

-- 1. ORGANIZATIONS (Small Parcel Merchants & 3PLs)
CREATE TABLE Organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_org_id UUID REFERENCES Organizations(id), -- Phase 2: Sub-client support
    name TEXT NOT NULL,
    org_type TEXT DEFAULT 'MERCHANT',               -- '3PL', 'MERCHANT', 'SUB_CLIENT'
    terms_days INT DEFAULT 7,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. METERS (Phase 1: Pre-paid USPS Wallet)
CREATE TABLE Meters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    current_balance DECIMAL(18, 4) DEFAULT 0.0000,
    min_threshold DECIMAL(18, 4) DEFAULT 100.0000,
    reload_amount DECIMAL(18, 4) DEFAULT 500.0000,
    primary_pm_id TEXT,
    backup_pm_id TEXT
);

-- 3. CARRIER MAPPINGS (Phase 1: Normalization Layer)
CREATE TABLE Carrier_Invoice_Mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code TEXT NOT NULL,           -- e.g., 'DHL_ECOM'
    raw_header_name TEXT NOT NULL,        -- e.g., 'Fuel Surcharge'
    cactus_standard_field TEXT NOT NULL,   -- e.g., 'fuel_surcharge'
    UNIQUE(carrier_code, raw_header_name)
);

-- 4. SHIPMENT LEDGER (The Single-Ceiling Math Engine)
CREATE TABLE Shipment_Ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    tracking_number TEXT UNIQUE NOT NULL,
    raw_carrier_cost DECIMAL(18, 4),
    markup_rate DECIMAL(7, 4),           -- e.g., 0.15 for 15%
    final_merchant_rate DECIMAL(12, 2), -- The result of the Single-Ceiling Round
    reconciled_at TIMESTAMP DEFAULT NOW()
);

-- 5. CACTUS INVOICES (Phase 1: Cactus-to-Client Invoicing)
CREATE TABLE Cactus_Invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    total_amount DECIMAL(12, 2),
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'UNPAID',        -- UNPAID, PAID, FAILED, VOID
    qbo_invoice_id TEXT
);

-- 6. PHASE 3 FOUNDATIONS (WMS & Integrity)
CREATE TABLE Locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    name TEXT NOT NULL,
    location_type TEXT DEFAULT 'STORAGE'
);

CREATE TABLE Audit_Logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES Organizations(id),
    action_type TEXT NOT NULL,           -- e.g., 'RATE_LOOKUP', 'MANUAL_INVOICE'
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);