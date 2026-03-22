-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: database-setup.sql
-- VERSION: 1.1.0
-- UPDATED: 2026-03-22
-- FOCUS: Phase 1 — Single-Ceiling, Billing & Rating Engine
-- ARCHITECT NOTES:
--   - All tables snake_case per Cactus naming standard
--   - All currency columns DECIMAL(18,4) per Financial OS
--   - RLS enabled on all tables; policy stubs included
--   - rate_cards and meter_transactions tables added
--   - carrier_invoice_mappings includes versioning columns
--   - All financial tables include created_at + updated_at
-- ==========================================================


-- ==========================================================
-- SECTION 0: ENUMS
-- Centralizing constrained value sets as enums prevents
-- invalid data at the database level and self-documents intent.
-- ==========================================================

CREATE TYPE org_type_enum AS ENUM ('3PL', 'MERCHANT', 'SUB_CLIENT');
CREATE TYPE invoice_status_enum AS ENUM ('UNPAID', 'PAID', 'FAILED', 'VOID');
CREATE TYPE meter_transaction_type_enum AS ENUM (
    'RELOAD',           -- Funds added to meter (ACH or CC)
    'LABEL_PURCHASE',   -- USPS label deduction
    'APV_ADJUSTMENT',   -- USPS Automated Package Verification correction
    'CC_FEE',           -- 3% merchant processing fee on CC reloads
    'MANUAL_CREDIT',    -- Admin-issued credit (dispute resolution, etc.)
    'MANUAL_DEBIT'      -- Admin-issued debit (correction)
);
CREATE TYPE markup_type_enum AS ENUM (
    'PERCENTAGE',   -- e.g. 0.15 = 15% on top of carrier cost
    'FLAT',         -- e.g. $2.00 flat fee per shipment
    'COMBINED'      -- percentage + flat fee applied together
);
CREATE TYPE carrier_code_enum AS ENUM (
    'UPS',
    'FEDEX',
    'USPS',
    'DHL_ECOM',
    'DHL_EXPRESS',
    'UNIUNI',
    'LANDMARK',
    'ONTRAC',
    'LSO'
);
CREATE TYPE location_type_enum AS ENUM (
    'WAREHOUSE',    -- Full fulfillment facility (Phase 3 WMS)
    'SHIP_FROM',    -- Origin address for rate shopping
    'STORAGE',      -- General storage (Phase 3 placeholder)
    'RETURNS'       -- Returns processing (Phase 3 placeholder)
);


-- ==========================================================
-- SECTION 1: ORGANIZATIONS
-- The tenant foundation. Every row in every other table
-- must trace back to an org_id here.
-- Parent/child hierarchy supports Phase 2 sub-client billing.
-- ==========================================================

CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_org_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    org_type        org_type_enum NOT NULL DEFAULT 'MERCHANT',
    terms_days      INT NOT NULL DEFAULT 7,         -- Net payment terms (post-paid invoices)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE organizations IS
    'Multi-tenant root. Every financial and shipment record scopes to an org_id here.';
COMMENT ON COLUMN organizations.parent_org_id IS
    'NULL = top-level org (Cactus client). Non-null = sub-client of a 3PL (Phase 2).';
COMMENT ON COLUMN organizations.terms_days IS
    'Payment terms for post-paid (non-USPS) weekly invoices. Default Net-7.';

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by backend API only — never expose to client)
CREATE POLICY "service_role_all_organizations"
    ON organizations FOR ALL
    USING (auth.role() = 'service_role');

-- Org members can read their own org only
CREATE POLICY "org_members_read_own"
    ON organizations FOR SELECT
    USING (id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 2: ORG_USERS
-- Maps Supabase auth users to organizations with role-based
-- access control. Required for RLS policies across all tables.
-- ==========================================================

CREATE TABLE org_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'MEMBER',     -- 'ADMIN', 'MEMBER', 'READ_ONLY'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, user_id)
);

COMMENT ON TABLE org_users IS
    'Maps auth users to orgs. The anchor for all RLS policies.';

ALTER TABLE org_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_org_users"
    ON org_users FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "users_read_own_membership"
    ON org_users FOR SELECT
    USING (user_id = auth.uid());


-- ==========================================================
-- SECTION 3: RATE_CARDS
-- Defines org-specific markup rules per carrier and service.
-- This is where the Single-Ceiling pipeline begins —
-- the markup applied to each shipment is sourced from here.
-- A missing rate card = no label can be printed for that org.
-- ==========================================================

CREATE TABLE rate_cards (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    carrier_code        carrier_code_enum NOT NULL,
    service_level       TEXT,                           -- NULL = applies to all services for this carrier
    markup_type         markup_type_enum NOT NULL DEFAULT 'PERCENTAGE',
    markup_percentage   DECIMAL(7,4),                   -- e.g. 0.1500 = 15%. NULL if markup_type = 'FLAT'
    markup_flat_fee     DECIMAL(18,4),                  -- e.g. 2.0000 = $2.00 flat. NULL if markup_type = 'PERCENTAGE'
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    effective_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    deprecated_date     DATE,                           -- NULL = currently active
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, carrier_code, service_level, effective_date)
);

COMMENT ON TABLE rate_cards IS
    'Source of truth for markup rules. Single-Ceiling pipeline reads from here.';
COMMENT ON COLUMN rate_cards.service_level IS
    'NULL applies to all services for the carrier. Specific service (e.g. GROUND) takes precedence.';
COMMENT ON COLUMN rate_cards.markup_percentage IS
    'Stored as a decimal fraction: 0.15 = 15%. Applied to raw_carrier_cost before ceiling.';
COMMENT ON COLUMN rate_cards.deprecated_date IS
    'When set, this rule is historical. Rate engine always uses the active (NULL deprecated_date) rule.';

ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_rate_cards"
    ON rate_cards FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "org_members_read_own_rate_cards"
    ON rate_cards FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 4: METERS
-- Pre-paid USPS postage wallet. One meter per org.
-- current_balance is a computed/cached value —
-- the authoritative balance is always SUM(meter_transactions).
-- Treat current_balance as a read cache, not the source of truth.
-- ==========================================================

CREATE TABLE meters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    current_balance     DECIMAL(18,4) NOT NULL DEFAULT 0.0000,  -- Cache only. Source of truth = meter_transactions sum.
    min_threshold       DECIMAL(18,4) NOT NULL DEFAULT 100.0000, -- Auto-reload triggers when balance drops below this
    reload_amount       DECIMAL(18,4) NOT NULL DEFAULT 500.0000, -- Gross amount charged to payment method on reload
    apply_cc_fee        BOOLEAN NOT NULL DEFAULT FALSE,          -- TRUE if client pays via CC (3% fee applies)
    cc_fee_percentage   DECIMAL(5,4) NOT NULL DEFAULT 0.0300,    -- 3% standard. Covers merchant processing cost.
    primary_pm_id       TEXT,                                    -- Stripe/Fortis payment method token (never raw card data)
    backup_pm_id        TEXT,                                    -- Failover payment method token
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meters IS
    'USPS pre-paid postage wallet. One per org. Balance is a cache — always verify against meter_transactions.';
COMMENT ON COLUMN meters.current_balance IS
    'Cached running balance. Updated atomically with each meter_transactions insert. Never update directly.';
COMMENT ON COLUMN meters.apply_cc_fee IS
    'When TRUE, 3% CC processing fee is deducted from reload gross before crediting net postage balance.';
COMMENT ON COLUMN meters.primary_pm_id IS
    'Tokenized payment method from Stripe/Fortis. Raw card data never stored in Cactus.';

ALTER TABLE meters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_meters"
    ON meters FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "org_members_read_own_meter"
    ON meters FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 5: METER_TRANSACTIONS
-- Append-only ledger for all meter activity.
-- NEVER UPDATE OR DELETE rows here. All corrections via
-- MANUAL_CREDIT or MANUAL_DEBIT entries with audit trail.
-- This is the source of truth for meter balance.
-- ==========================================================

CREATE TABLE meter_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id            UUID NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    transaction_type    meter_transaction_type_enum NOT NULL,
    gross_amount        DECIMAL(18,4) NOT NULL,         -- Amount charged to payment method (reloads) or deducted (purchases)
    fee_amount          DECIMAL(18,4) NOT NULL DEFAULT 0.0000,  -- CC processing fee (if applicable)
    net_amount          DECIMAL(18,4) NOT NULL,         -- gross_amount - fee_amount. This hits the postage balance.
    balance_after       DECIMAL(18,4) NOT NULL,         -- Meter balance immediately after this transaction
    tracking_number     TEXT,                           -- Populated for LABEL_PURCHASE and APV_ADJUSTMENT types
    carrier_code        carrier_code_enum,              -- Always USPS for meter transactions
    description         TEXT,                           -- Human-readable detail (e.g. 'Auto-reload triggered at $98.42 balance')
    idempotency_key     TEXT UNIQUE,                    -- Prevents double-charges from WMS retry storms
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    -- No updated_at — this table is append-only by design
);

COMMENT ON TABLE meter_transactions IS
    'Immutable ledger for all meter activity. Never update or delete. Source of truth for balance.';
COMMENT ON COLUMN meter_transactions.net_amount IS
    'The amount that actually affects the postage balance. gross_amount minus any CC processing fee.';
COMMENT ON COLUMN meter_transactions.balance_after IS
    'Snapshot of meter balance after this transaction. Enables point-in-time balance reconstruction.';
COMMENT ON COLUMN meter_transactions.idempotency_key IS
    'Set by the calling service. If a WMS resends the same request, the existing result is returned — no double charge.';

ALTER TABLE meter_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_meter_transactions"
    ON meter_transactions FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "org_members_read_own_meter_transactions"
    ON meter_transactions FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 6: CARRIER_INVOICE_MAPPINGS
-- Normalization layer. Translates messy carrier invoice headers
-- into Cactus Standard fields for reconciliation.
-- Versioned — carrier code changes are tracked over time,
-- not silently overwritten.
-- ==========================================================

CREATE TABLE carrier_invoice_mappings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code            carrier_code_enum NOT NULL,
    raw_header_name         TEXT NOT NULL,              -- Exactly as it appears on carrier invoice (e.g. 'FUE', 'Fuel_Surch')
    cactus_standard_field   TEXT NOT NULL,              -- Cactus canonical name (e.g. 'fuel_surcharge')
    effective_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    deprecated_date         DATE,                       -- NULL = currently active mapping
    notes                   TEXT,                       -- Optional: reason for deprecation or edge case notes
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(carrier_code, raw_header_name, effective_date)
);

COMMENT ON TABLE carrier_invoice_mappings IS
    'Carrier invoice normalization. Versioned to survive carrier code changes without data corruption.';
COMMENT ON COLUMN carrier_invoice_mappings.raw_header_name IS
    'Copied verbatim from carrier invoice. Case-sensitive. Carrier changes this = new row, old row gets deprecated_date.';
COMMENT ON COLUMN carrier_invoice_mappings.deprecated_date IS
    'When a carrier renames a code, set this to the cutover date and insert a new row. Do not update or delete.';

ALTER TABLE carrier_invoice_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_carrier_invoice_mappings"
    ON carrier_invoice_mappings FOR ALL
    USING (auth.role() = 'service_role');

-- Read-only for all authenticated users (normalization data is not sensitive)
CREATE POLICY "authenticated_read_carrier_mappings"
    ON carrier_invoice_mappings FOR SELECT
    USING (auth.role() = 'authenticated');


-- ==========================================================
-- SECTION 7: SHIPMENT_LEDGER
-- The Single-Ceiling math engine output.
-- One row per shipment. Records raw carrier cost, the rate card
-- rule applied, and the final ceiling-rounded merchant rate.
-- Append-only — corrections via new rows with amended flags.
-- ==========================================================

CREATE TABLE shipment_ledger (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    rate_card_id            UUID REFERENCES rate_cards(id) ON DELETE SET NULL, -- Which markup rule was applied
    tracking_number         TEXT NOT NULL UNIQUE,
    carrier_code            carrier_code_enum NOT NULL,
    service_level           TEXT,
    -- Raw cost from carrier (what Cactus pays)
    raw_carrier_cost        DECIMAL(18,4) NOT NULL,
    -- Single-Ceiling pipeline columns
    markup_percentage       DECIMAL(7,4),               -- Snapshot of rate_card markup at time of shipment
    markup_flat_fee         DECIMAL(18,4),              -- Snapshot of flat fee at time of shipment (if applicable)
    pre_ceiling_amount      DECIMAL(18,4) NOT NULL,     -- raw_carrier_cost after markup applied, before ceiling
    final_merchant_rate     DECIMAL(18,4) NOT NULL,     -- CEILING(pre_ceiling_amount, 0.01) — what client is billed
    -- Reconciliation
    carrier_invoiced_amount DECIMAL(18,4),              -- Populated when carrier invoice is reconciled (Phase 1)
    reconciled              BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at           TIMESTAMPTZ,
    -- Metadata
    label_printed_at        TIMESTAMPTZ,                -- When the WMS printed the label
    idempotency_key         TEXT UNIQUE,                -- Prevents duplicate label purchases from WMS retries
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    -- No updated_at — append-only. Reconciliation updates only reconciled + reconciled_at columns.
);

COMMENT ON TABLE shipment_ledger IS
    'Immutable shipment record. Single-Ceiling output lives here. Source of truth for billing.';
COMMENT ON COLUMN shipment_ledger.pre_ceiling_amount IS
    'raw_carrier_cost * (1 + markup_percentage) + markup_flat_fee. Input to CEILING function.';
COMMENT ON COLUMN shipment_ledger.final_merchant_rate IS
    'CEILING(pre_ceiling_amount * 100) / 100. Applied once per shipment total. This is what the client is billed.';
COMMENT ON COLUMN shipment_ledger.markup_percentage IS
    'Snapshot of the rate card at time of shipment. Rate card may change later — this preserves billing history.';
COMMENT ON COLUMN shipment_ledger.carrier_invoiced_amount IS
    'The amount the carrier actually charged Cactus. NULL until carrier invoice is ingested and reconciled.';

ALTER TABLE shipment_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_shipment_ledger"
    ON shipment_ledger FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "org_members_read_own_shipments"
    ON shipment_ledger FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 8: CACTUS_INVOICES
-- Weekly post-paid invoices for non-USPS carriers.
-- Auto-pull triggered on due_date by background job.
-- One invoice aggregates all shipment_ledger rows for the
-- billing period that have not yet been invoiced.
-- ==========================================================

CREATE TABLE cactus_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    billing_period_start DATE NOT NULL,
    billing_period_end   DATE NOT NULL,
    total_amount        DECIMAL(18,4) NOT NULL,
    due_date            DATE NOT NULL,
    status              invoice_status_enum NOT NULL DEFAULT 'UNPAID',
    paid_at             TIMESTAMPTZ,
    qbo_invoice_id      TEXT,                           -- QuickBooks Online sync reference
    payment_attempt_count INT NOT NULL DEFAULT 0,       -- Tracks auto-pull retry attempts
    last_payment_error  TEXT,                           -- Last payment processor error message (for Alamo visibility)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cactus_invoices IS
    'Weekly post-paid invoices for non-USPS shipments. Auto-pull fires on due_date.';
COMMENT ON COLUMN cactus_invoices.total_amount IS
    'Sum of final_merchant_rate from shipment_ledger rows in this billing period.';
COMMENT ON COLUMN cactus_invoices.payment_attempt_count IS
    'Incremented on each auto-pull attempt. Alamo alerts when this exceeds threshold.';

ALTER TABLE cactus_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_cactus_invoices"
    ON cactus_invoices FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "org_members_read_own_invoices"
    ON cactus_invoices FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 9: LOCATIONS
-- Phase 1: Ship-from addresses for rate shopping.
-- Phase 3: Expands to full warehouse mapping (aisles/bins).
-- The location_type enum is the extensibility hook.
-- ==========================================================

CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    location_type   location_type_enum NOT NULL DEFAULT 'SHIP_FROM',
    address_line1   TEXT NOT NULL,
    address_line2   TEXT,
    city            TEXT NOT NULL,
    state           CHAR(2) NOT NULL,
    postal_code     TEXT NOT NULL,
    country         CHAR(2) NOT NULL DEFAULT 'US',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    -- Phase 3 WMS hooks (NULL in Phase 1 — do not remove)
    warehouse_zone  TEXT,
    aisle           TEXT,
    bin             TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE locations IS
    'Ship-from addresses in Phase 1. Expands to full warehouse mapping in Phase 3.';
COMMENT ON COLUMN locations.warehouse_zone IS
    'Phase 3 WMS field. NULL in Phase 1. Do not populate until WMS module is active.';

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_locations"
    ON locations FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "org_members_read_own_locations"
    ON locations FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 10: AUDIT_LOGS
-- Append-only integrity log for all meaningful system actions.
-- Every rate lookup, markup change, invoice generation, and
-- admin override must produce a row here.
-- Never update or delete rows in this table.
-- ==========================================================

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES organizations(id) ON DELETE SET NULL, -- NULL for Cactus-internal (Alamo) actions
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,    -- NULL for system/background jobs
    action_type TEXT NOT NULL,      -- e.g. 'RATE_LOOKUP', 'MARKUP_CHANGED', 'INVOICE_GENERATED', 'METER_RELOADED'
    entity_type TEXT,               -- e.g. 'shipment_ledger', 'rate_cards', 'meters'
    entity_id   UUID,               -- The id of the row that was affected
    description TEXT,               -- Human-readable summary
    metadata    JSONB,              -- Structured payload (old value, new value, request context, etc.)
    ip_address  INET,               -- Caller IP for security audits
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    -- No updated_at — this table is append-only by design
);

COMMENT ON TABLE audit_logs IS
    'Append-only integrity log. Every meaningful action leaves a trace here. Never update or delete.';
COMMENT ON COLUMN audit_logs.metadata IS
    'Flexible JSONB payload. For markup changes: {old_rate, new_rate}. For rate lookups: {carrier, service, raw_cost}.';

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_audit_logs"
    ON audit_logs FOR ALL
    USING (auth.role() = 'service_role');

-- Alamo (internal admin) users can read all audit logs
-- Org members can read only their own org audit trail
CREATE POLICY "org_members_read_own_audit_logs"
    ON audit_logs FOR SELECT
    USING (
        auth.role() = 'service_role'
        OR org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1)
    );


-- ==========================================================
-- SECTION 11: INDEXES
-- Performance indexes for the most common query patterns.
-- Added after table creation — do not inline into CREATE TABLE.
-- ==========================================================

-- Organizations
CREATE INDEX idx_organizations_parent ON organizations(parent_org_id) WHERE parent_org_id IS NOT NULL;
CREATE INDEX idx_organizations_active ON organizations(is_active) WHERE is_active = TRUE;

-- Org Users (critical for RLS policy performance)
CREATE INDEX idx_org_users_user_id ON org_users(user_id);
CREATE INDEX idx_org_users_org_id ON org_users(org_id);

-- Rate Cards (rate engine hot path)
CREATE INDEX idx_rate_cards_org_carrier ON rate_cards(org_id, carrier_code);
CREATE INDEX idx_rate_cards_active ON rate_cards(org_id, carrier_code, service_level)
    WHERE deprecated_date IS NULL AND is_active = TRUE;

-- Meters
CREATE INDEX idx_meters_org_id ON meters(org_id);

-- Meter Transactions (dashboard queries and balance audits)
CREATE INDEX idx_meter_transactions_meter_id ON meter_transactions(meter_id);
CREATE INDEX idx_meter_transactions_org_id ON meter_transactions(org_id);
CREATE INDEX idx_meter_transactions_created ON meter_transactions(created_at DESC);
CREATE INDEX idx_meter_transactions_type ON meter_transactions(transaction_type);

-- Carrier Invoice Mappings (normalization engine hot path)
CREATE INDEX idx_carrier_mappings_active ON carrier_invoice_mappings(carrier_code, raw_header_name)
    WHERE deprecated_date IS NULL;

-- Shipment Ledger (the most queried table)
CREATE INDEX idx_shipment_ledger_org_id ON shipment_ledger(org_id);
CREATE INDEX idx_shipment_ledger_tracking ON shipment_ledger(tracking_number);
CREATE INDEX idx_shipment_ledger_carrier ON shipment_ledger(carrier_code);
CREATE INDEX idx_shipment_ledger_unreconciled ON shipment_ledger(org_id, reconciled)
    WHERE reconciled = FALSE;
CREATE INDEX idx_shipment_ledger_created ON shipment_ledger(created_at DESC);

-- Cactus Invoices
CREATE INDEX idx_cactus_invoices_org_id ON cactus_invoices(org_id);
CREATE INDEX idx_cactus_invoices_due ON cactus_invoices(due_date) WHERE status = 'UNPAID';
CREATE INDEX idx_cactus_invoices_status ON cactus_invoices(status);

-- Locations
CREATE INDEX idx_locations_org_id ON locations(org_id);

-- Audit Logs
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);


-- ==========================================================
-- SECTION 12: UPDATED_AT TRIGGERS
-- Automatically keeps updated_at current on any row change.
-- Applied to all tables that have an updated_at column.
-- ==========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rate_cards_updated_at
    BEFORE UPDATE ON rate_cards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_meters_updated_at
    BEFORE UPDATE ON meters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cactus_invoices_updated_at
    BEFORE UPDATE ON cactus_invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();