-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: database-setup.sql
-- VERSION: 1.2.0
-- UPDATED: 2026-03-23
-- FOCUS: Phase 1 — Single-Ceiling, Billing & Rating Engine
--        + AI-Native Foundation (Shadow Ledger, Event Sourcing)
--
-- STRUCTURE OF THIS FILE:
--   Section 0: Enums
--   Section 1: All 12 tables (no RLS yet)
--   Section 2: All RLS policies (after all tables exist)
--   Section 3: Indexes
--   Section 4: Triggers
--
-- NEW IN v1.2.0:
--   - rate_shop_log: The "Shadow Ledger." Logs every rate
--     request even if no label is purchased. Becomes the
--     AI training dataset for rate prediction and carrier
--     intelligence over time.
--   - shipment_events: Event Sourcing layer. Every status
--     change on a shipment is an immutable event row, not
--     an update. Gives AI the full timeline of every package.
--   - metadata JSONB added to shipment_ledger for unstructured
--     AI context storage.
--
-- WHY THIS ORDER?
--   RLS policies reference other tables. Creating ALL tables
--   first, then applying ALL policies prevents forward-reference
--   errors that would cause the script to fail mid-run.
-- ==========================================================


-- ==========================================================
-- SECTION 0: ENUMS
--
-- WHAT IS AN ENUM?
-- An enum (enumeration) is a column type that only accepts
-- a specific list of values. Like a dropdown menu — the
-- database rejects anything not on the list. This prevents
-- typos and inconsistent data from corrupting your records.
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

CREATE TYPE shipment_event_type_enum AS ENUM (
    -- Pre-transit
    'RATE_REQUESTED',       -- A rate was requested for this shipment
    'LABEL_CREATED',        -- Label purchased and printed
    'LABEL_VOIDED',         -- Label voided before carrier pickup
    -- In transit
    'PICKED_UP',            -- Carrier has the package
    'IN_TRANSIT',           -- Package moving through carrier network
    'OUT_FOR_DELIVERY',     -- On the delivery vehicle
    'DELIVERY_ATTEMPTED',   -- Carrier attempted delivery, no success
    -- Terminal states
    'DELIVERED',            -- Successfully delivered
    'RETURNED_TO_SENDER',   -- Package returned
    'LOST',                 -- Carrier confirmed lost
    -- Exceptions
    'EXCEPTION',            -- General carrier exception
    'APV_ADJUSTMENT',       -- USPS postage correction applied
    'ADDRESS_CORRECTED',    -- Address correction fee applied
    'DAMAGED'               -- Package reported damaged
);


-- ==========================================================
-- SECTION 1: TABLES
-- All 12 tables created before any RLS policies are written.
-- ==========================================================

-- ----------------------------------------------------------
-- TABLE 1: organizations
-- The tenant root. Every record in every other table
-- must have an org_id that points to a row here.
-- ----------------------------------------------------------

CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_org_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    org_type        org_type_enum NOT NULL DEFAULT 'MERCHANT',
    terms_days      INT NOT NULL DEFAULT 7,
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


-- ----------------------------------------------------------
-- TABLE 2: org_users
-- Maps Supabase auth users to organizations.
-- This is the anchor table that all RLS policies use to
-- answer: "which org does this logged-in user belong to?"
-- ----------------------------------------------------------

CREATE TABLE org_users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'MEMBER',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, user_id)
);

COMMENT ON TABLE org_users IS
    'Maps auth users to orgs. The anchor for all RLS policies.';
COMMENT ON COLUMN org_users.role IS
    'ADMIN = full org access. MEMBER = standard access. READ_ONLY = view only.';


-- ----------------------------------------------------------
-- TABLE 3: rate_cards
-- Defines org-specific markup rules per carrier and service.
-- Every shipment markup is sourced from a row here.
-- Versioned: deprecated_date marks old rules, never deleted.
-- ----------------------------------------------------------

CREATE TABLE rate_cards (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    carrier_code        carrier_code_enum NOT NULL,
    service_level       TEXT,
    markup_type         markup_type_enum NOT NULL DEFAULT 'PERCENTAGE',
    markup_percentage   DECIMAL(7,4),
    markup_flat_fee     DECIMAL(18,4),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    effective_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    deprecated_date     DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, carrier_code, service_level, effective_date)
);

COMMENT ON TABLE rate_cards IS
    'Source of truth for org markup rules. Single-Ceiling pipeline reads from here.';
COMMENT ON COLUMN rate_cards.service_level IS
    'NULL applies to all services for the carrier. Specific service takes precedence.';
COMMENT ON COLUMN rate_cards.markup_percentage IS
    'Stored as a decimal fraction: 0.15 = 15%. Applied to raw_carrier_cost before ceiling.';
COMMENT ON COLUMN rate_cards.deprecated_date IS
    'When set, this rule is historical. Rate engine uses the active (NULL deprecated_date) rule.';


-- ----------------------------------------------------------
-- TABLE 4: meters
-- Pre-paid USPS postage wallet. One meter per org.
-- current_balance is a cache — source of truth is always
-- the sum of meter_transactions rows.
-- ----------------------------------------------------------

CREATE TABLE meters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    current_balance     DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    min_threshold       DECIMAL(18,4) NOT NULL DEFAULT 100.0000,
    reload_amount       DECIMAL(18,4) NOT NULL DEFAULT 500.0000,
    apply_cc_fee        BOOLEAN NOT NULL DEFAULT FALSE,
    cc_fee_percentage   DECIMAL(5,4) NOT NULL DEFAULT 0.0300,
    primary_pm_id       TEXT,
    backup_pm_id        TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meters IS
    'USPS pre-paid postage wallet. One per org. Balance is a cache — verify against meter_transactions.';
COMMENT ON COLUMN meters.current_balance IS
    'Cached running balance. Updated atomically with each meter_transactions insert.';
COMMENT ON COLUMN meters.apply_cc_fee IS
    'When TRUE, 3% CC fee is deducted from reload gross before crediting net postage balance.';
COMMENT ON COLUMN meters.primary_pm_id IS
    'Tokenized payment method from Stripe/Fortis. Raw card data never stored in Cactus.';


-- ----------------------------------------------------------
-- TABLE 5: meter_transactions
-- Append-only ledger for all meter activity.
-- NEVER UPDATE OR DELETE rows here.
-- Corrections = new MANUAL_CREDIT or MANUAL_DEBIT rows.
-- ----------------------------------------------------------

CREATE TABLE meter_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id            UUID NOT NULL REFERENCES meters(id) ON DELETE RESTRICT,
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    transaction_type    meter_transaction_type_enum NOT NULL,
    gross_amount        DECIMAL(18,4) NOT NULL,
    fee_amount          DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    net_amount          DECIMAL(18,4) NOT NULL,
    balance_after       DECIMAL(18,4) NOT NULL,
    tracking_number     TEXT,
    carrier_code        carrier_code_enum,
    description         TEXT,
    idempotency_key     TEXT UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meter_transactions IS
    'Immutable ledger for all meter activity. Never update or delete rows here.';
COMMENT ON COLUMN meter_transactions.net_amount IS
    'The amount that affects the postage balance. gross_amount minus any CC processing fee.';
COMMENT ON COLUMN meter_transactions.balance_after IS
    'Snapshot of balance after this transaction. Enables point-in-time balance reconstruction.';
COMMENT ON COLUMN meter_transactions.idempotency_key IS
    'Prevents double-charges from WMS retry storms. Set by the calling service.';


-- ----------------------------------------------------------
-- TABLE 6: carrier_invoice_mappings
-- Normalization layer. Translates messy carrier invoice
-- headers into Cactus Standard fields.
-- Versioned: old mappings are deprecated, never deleted.
-- Phase 2: vector embeddings will be added to this table
-- for AI-assisted semantic mapping suggestions.
-- ----------------------------------------------------------

CREATE TABLE carrier_invoice_mappings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code            carrier_code_enum NOT NULL,
    raw_header_name         TEXT NOT NULL,
    cactus_standard_field   TEXT NOT NULL,
    effective_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    deprecated_date         DATE,
    notes                   TEXT,
    ai_suggested            BOOLEAN NOT NULL DEFAULT FALSE,
    ai_confidence_score     DECIMAL(5,4),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(carrier_code, raw_header_name, effective_date)
);

COMMENT ON TABLE carrier_invoice_mappings IS
    'Carrier invoice normalization. Versioned. AI suggestion columns ready for Phase 2.';
COMMENT ON COLUMN carrier_invoice_mappings.raw_header_name IS
    'Copied verbatim from carrier invoice. Carrier renames it = new row, old gets deprecated_date.';
COMMENT ON COLUMN carrier_invoice_mappings.ai_suggested IS
    'TRUE if this mapping was suggested by the AI normalization engine (Phase 2).';
COMMENT ON COLUMN carrier_invoice_mappings.ai_confidence_score IS
    'AI confidence in the suggested mapping (0.0000 to 1.0000). NULL for human-created mappings.';


-- ----------------------------------------------------------
-- TABLE 7: shipment_ledger
-- The Single-Ceiling math engine output.
-- One row per shipment. Append-only.
-- metadata JSONB column stores AI context and carrier-specific
-- data that doesn't fit neatly into typed columns.
-- ----------------------------------------------------------

CREATE TABLE shipment_ledger (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    rate_card_id            UUID REFERENCES rate_cards(id) ON DELETE SET NULL,
    tracking_number         TEXT NOT NULL UNIQUE,
    carrier_code            carrier_code_enum,
    service_level           TEXT,
    -- Single-Ceiling pipeline columns
    raw_carrier_cost        DECIMAL(18,4) NOT NULL,
    markup_percentage       DECIMAL(7,4),
    markup_flat_fee         DECIMAL(18,4),
    pre_ceiling_amount      DECIMAL(18,4) NOT NULL,
    final_merchant_rate     DECIMAL(18,4) NOT NULL,
    -- Reconciliation
    carrier_invoiced_amount DECIMAL(18,4),
    reconciled              BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at           TIMESTAMPTZ,
    -- Metadata
    label_printed_at        TIMESTAMPTZ,
    idempotency_key         TEXT UNIQUE,
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE shipment_ledger IS
    'Immutable shipment record. Single-Ceiling output lives here. Source of truth for billing.';
COMMENT ON COLUMN shipment_ledger.pre_ceiling_amount IS
    'raw_carrier_cost * (1 + markup_percentage) + markup_flat_fee. Input to CEILING function.';
COMMENT ON COLUMN shipment_ledger.final_merchant_rate IS
    'CEILING(pre_ceiling_amount * 100) / 100. Applied once per shipment. What the client is billed.';
COMMENT ON COLUMN shipment_ledger.metadata IS
    'JSONB store for carrier-specific fields, WMS context, and AI-generated insights.';


-- ----------------------------------------------------------
-- TABLE 8: cactus_invoices
-- Weekly post-paid invoices for non-USPS carriers.
-- Auto-pull triggered on due_date by background job.
-- ----------------------------------------------------------

CREATE TABLE cactus_invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    billing_period_start    DATE NOT NULL,
    billing_period_end      DATE NOT NULL,
    total_amount            DECIMAL(18,4) NOT NULL,
    due_date                DATE NOT NULL,
    status                  invoice_status_enum NOT NULL DEFAULT 'UNPAID',
    paid_at                 TIMESTAMPTZ,
    qbo_invoice_id          TEXT,
    payment_attempt_count   INT NOT NULL DEFAULT 0,
    last_payment_error      TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cactus_invoices IS
    'Weekly post-paid invoices for non-USPS shipments. Auto-pull fires on due_date.';
COMMENT ON COLUMN cactus_invoices.total_amount IS
    'Sum of final_merchant_rate from shipment_ledger rows in this billing period.';
COMMENT ON COLUMN cactus_invoices.payment_attempt_count IS
    'Incremented on each auto-pull attempt. Alamo alerts when this exceeds threshold.';


-- ----------------------------------------------------------
-- TABLE 9: locations
-- Phase 1: Ship-from addresses for rate shopping.
-- Phase 3: Expands to full warehouse mapping (aisles/bins).
-- ----------------------------------------------------------

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
    -- Phase 3 WMS hooks (NULL in Phase 1)
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


-- ----------------------------------------------------------
-- TABLE 10: audit_logs
-- Append-only integrity log for all meaningful system actions.
-- Never update or delete rows here.
-- ----------------------------------------------------------

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id   UUID,
    description TEXT,
    metadata    JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS
    'Append-only integrity log. Every meaningful action leaves a trace here. Never update or delete.';
COMMENT ON COLUMN audit_logs.metadata IS
    'Flexible JSONB payload: {old_value, new_value, request_context, ai_model_used, etc.}';


-- ----------------------------------------------------------
-- TABLE 11: rate_shop_log  ← NEW IN v1.2.0
--
-- THE SHADOW LEDGER — AI Training Dataset
--
-- WHAT IS THIS?
-- Every time a WMS asks Cactus for a shipping rate, we log
-- that request here — even if no label is ever printed.
-- This builds a rich dataset over time that answers questions
-- like: "Which carrier is cheapest for packages under 1lb
-- going to a residential address in Texas on a Tuesday?"
--
-- WHY DOES THIS MATTER FOR AI?
-- An AI model cannot predict or optimize what it has never
-- seen. By logging every rate request from day one, Cactus
-- accumulates a proprietary dataset that no competitor has.
-- After 6 months of real traffic, this table will contain
-- millions of rows that teach the AI:
--   - Rate volatility patterns by lane and carrier
--   - Which service level clients actually choose vs. shop
--   - Seasonal surcharge behavior
--   - Carrier performance by geography
--
-- This is the foundation for future features like:
--   - "AI recommends FedEx today — fuel surcharge spike
--     predicted for UPS on this lane tomorrow"
--   - Carrier scorecards by client and lane
--   - Proactive cost-saving alerts for clients
-- ----------------------------------------------------------

CREATE TABLE rate_shop_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- Request context
    origin_postal       TEXT NOT NULL,
    destination_postal  TEXT NOT NULL,
    destination_country CHAR(2) NOT NULL DEFAULT 'US',
    is_residential      BOOLEAN,
    weight_oz           DECIMAL(10,4) NOT NULL,
    length_in           DECIMAL(8,4),
    width_in            DECIMAL(8,4),
    height_in           DECIMAL(8,4),
    -- Rate response
    carrier_code        carrier_code_enum NOT NULL,
    service_level       TEXT NOT NULL,
    quoted_rate         DECIMAL(18,4) NOT NULL,
    final_merchant_rate DECIMAL(18,4) NOT NULL,
    transit_days        INT,
    -- Outcome tracking (did the client pick this rate?)
    was_selected        BOOLEAN NOT NULL DEFAULT FALSE,
    shipment_ledger_id  UUID REFERENCES shipment_ledger(id) ON DELETE SET NULL,
    -- AI context
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rate_shop_log IS
    'Shadow Ledger. Logs every rate request including unselected options. AI training dataset.';
COMMENT ON COLUMN rate_shop_log.was_selected IS
    'TRUE if the client chose this rate and printed a label. FALSE = shopped but not selected.';
COMMENT ON COLUMN rate_shop_log.shipment_ledger_id IS
    'Links to shipment_ledger if a label was purchased for this rate. NULL if not selected.';
COMMENT ON COLUMN rate_shop_log.weight_oz IS
    'Package weight stored in ounces for precision. Convert to lbs in application layer.';
COMMENT ON COLUMN rate_shop_log.metadata IS
    'AI context: {wms_source, requested_service_levels, surcharges_applied, model_version, etc.}';


-- ----------------------------------------------------------
-- TABLE 12: shipment_events  ← NEW IN v1.2.0
--
-- EVENT SOURCING LAYER — The Full Story of Every Package
--
-- WHAT IS EVENT SOURCING?
-- Instead of updating a single "status" column on a shipment
-- (which destroys history), we append a new row every time
-- something happens. The shipment's current state is always
-- the sum of all its events.
--
-- EXAMPLE — A Normal Delivery:
--   Row 1: LABEL_CREATED    — 2026-03-22 09:14 AM
--   Row 2: PICKED_UP        — 2026-03-22 05:30 PM
--   Row 3: IN_TRANSIT       — 2026-03-23 02:11 AM
--   Row 4: OUT_FOR_DELIVERY — 2026-03-24 08:45 AM
--   Row 5: DELIVERED        — 2026-03-24 02:17 PM
--
-- EXAMPLE — An Exception:
--   Row 1: LABEL_CREATED       — 2026-03-22 09:14 AM
--   Row 2: PICKED_UP           — 2026-03-22 05:30 PM
--   Row 3: IN_TRANSIT          — 2026-03-23 02:11 AM
--   Row 4: EXCEPTION           — 2026-03-24 08:00 AM
--   Row 5: DELIVERY_ATTEMPTED  — 2026-03-24 11:00 AM
--   Row 6: DELIVERED           — 2026-03-25 01:30 PM
--
-- WHY DOES THIS MATTER FOR AI?
-- An AI can read the event stream and:
--   - Flag "at-risk" shipments before the customer notices
--   - Identify which carriers have more exceptions on which
--     lanes (carrier scorecard intelligence)
--   - Detect patterns: "shipments going to this ZIP code
--     have a 34% exception rate with UPS — recommend FedEx"
--   - Power the "Cactus Pulse" proactive monitoring feature
--
-- WHY DOES THIS MATTER FOR OCEAN FREIGHT / LTL (Phase 3)?
-- A container sitting at a port for 10 days has a complex
-- event timeline. This exact same table structure handles it
-- without any schema changes — just new event_type values.
-- ----------------------------------------------------------

CREATE TABLE shipment_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_ledger_id  UUID NOT NULL REFERENCES shipment_ledger(id) ON DELETE RESTRICT,
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    event_type          shipment_event_type_enum NOT NULL,
    -- Carrier-reported data at the time of this event
    carrier_code        carrier_code_enum,
    carrier_timestamp   TIMESTAMPTZ,
    carrier_location    TEXT,
    carrier_message     TEXT,
    -- AI context
    ai_flagged          BOOLEAN NOT NULL DEFAULT FALSE,
    ai_flag_reason      TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE shipment_events IS
    'Event sourcing layer. Immutable timeline of everything that happens to a shipment.';
COMMENT ON COLUMN shipment_events.carrier_timestamp IS
    'The timestamp the carrier reported this event. May differ from created_at.';
COMMENT ON COLUMN shipment_events.ai_flagged IS
    'TRUE if the AI flagged this event as requiring attention (e.g. unexpected exception).';
COMMENT ON COLUMN shipment_events.ai_flag_reason IS
    'Human-readable explanation from the AI of why this event was flagged.';
COMMENT ON COLUMN shipment_events.metadata IS
    'Raw carrier webhook payload and AI analysis context stored for full auditability.';


-- ==========================================================
-- SECTION 2: ROW LEVEL SECURITY (RLS)
--
-- WHAT IS RLS?
-- Row Level Security means the database itself enforces which
-- rows each user can see. Even if a bug in your code asks for
-- all shipments, Postgres only returns that user's org's rows.
--
-- All tables created first above. Policies applied here after.
-- This prevents forward-reference errors.
-- ==========================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_organizations"
    ON organizations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_organization"
    ON organizations FOR SELECT
    USING (id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE org_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_org_users"
    ON org_users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_read_own_membership"
    ON org_users FOR SELECT USING (user_id = auth.uid());

ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_rate_cards"
    ON rate_cards FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_rate_cards"
    ON rate_cards FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_meters"
    ON meters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_meter"
    ON meters FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE meter_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_meter_transactions"
    ON meter_transactions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_meter_transactions"
    ON meter_transactions FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE carrier_invoice_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_carrier_invoice_mappings"
    ON carrier_invoice_mappings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_carrier_mappings"
    ON carrier_invoice_mappings FOR SELECT USING (auth.role() = 'authenticated');

ALTER TABLE shipment_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_shipment_ledger"
    ON shipment_ledger FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_shipments"
    ON shipment_ledger FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE cactus_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cactus_invoices"
    ON cactus_invoices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_invoices"
    ON cactus_invoices FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_locations"
    ON locations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_locations"
    ON locations FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_audit_logs"
    ON audit_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_audit_logs"
    ON audit_logs FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE rate_shop_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_rate_shop_log"
    ON rate_shop_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_rate_shop_log"
    ON rate_shop_log FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE shipment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_shipment_events"
    ON shipment_events FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_shipment_events"
    ON shipment_events FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 3: INDEXES
--
-- WHAT IS AN INDEX?
-- Like the index at the back of a book — lets Postgres jump
-- straight to the right rows instead of reading every row.
-- Critical for performance at high shipment volumes.
-- ==========================================================

-- organizations
CREATE INDEX idx_organizations_parent
    ON organizations(parent_org_id) WHERE parent_org_id IS NOT NULL;
CREATE INDEX idx_organizations_active
    ON organizations(is_active) WHERE is_active = TRUE;

-- org_users (critical for RLS policy performance)
CREATE INDEX idx_org_users_user_id ON org_users(user_id);
CREATE INDEX idx_org_users_org_id  ON org_users(org_id);

-- rate_cards (rate engine hot path)
CREATE INDEX idx_rate_cards_org_carrier ON rate_cards(org_id, carrier_code);
CREATE INDEX idx_rate_cards_active
    ON rate_cards(org_id, carrier_code, service_level)
    WHERE deprecated_date IS NULL AND is_active = TRUE;

-- meters
CREATE INDEX idx_meters_org_id ON meters(org_id);

-- meter_transactions
CREATE INDEX idx_meter_tx_meter_id ON meter_transactions(meter_id);
CREATE INDEX idx_meter_tx_org_id   ON meter_transactions(org_id);
CREATE INDEX idx_meter_tx_created  ON meter_transactions(created_at DESC);
CREATE INDEX idx_meter_tx_type     ON meter_transactions(transaction_type);

-- carrier_invoice_mappings (normalization engine hot path)
CREATE INDEX idx_carrier_mappings_active
    ON carrier_invoice_mappings(carrier_code, raw_header_name)
    WHERE deprecated_date IS NULL;

-- shipment_ledger (most queried table)
CREATE INDEX idx_shipment_ledger_org_id
    ON shipment_ledger(org_id);
CREATE INDEX idx_shipment_ledger_tracking
    ON shipment_ledger(tracking_number);
CREATE INDEX idx_shipment_ledger_carrier
    ON shipment_ledger(carrier_code);
CREATE INDEX idx_shipment_ledger_unreconciled
    ON shipment_ledger(org_id, reconciled) WHERE reconciled = FALSE;
CREATE INDEX idx_shipment_ledger_created
    ON shipment_ledger(created_at DESC);

-- cactus_invoices
CREATE INDEX idx_cactus_invoices_org_id ON cactus_invoices(org_id);
CREATE INDEX idx_cactus_invoices_due
    ON cactus_invoices(due_date) WHERE status = 'UNPAID';
CREATE INDEX idx_cactus_invoices_status ON cactus_invoices(status);

-- locations
CREATE INDEX idx_locations_org_id ON locations(org_id);

-- audit_logs
CREATE INDEX idx_audit_logs_org_id  ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- rate_shop_log (AI queries — lane analysis, carrier comparison)
CREATE INDEX idx_rate_shop_log_org_id
    ON rate_shop_log(org_id);
CREATE INDEX idx_rate_shop_log_lane
    ON rate_shop_log(origin_postal, destination_postal, carrier_code);
CREATE INDEX idx_rate_shop_log_carrier
    ON rate_shop_log(carrier_code, service_level);
CREATE INDEX idx_rate_shop_log_selected
    ON rate_shop_log(org_id, was_selected);
CREATE INDEX idx_rate_shop_log_created
    ON rate_shop_log(created_at DESC);

-- shipment_events (event sourcing queries)
CREATE INDEX idx_shipment_events_ledger_id
    ON shipment_events(shipment_ledger_id);
CREATE INDEX idx_shipment_events_org_id
    ON shipment_events(org_id);
CREATE INDEX idx_shipment_events_type
    ON shipment_events(event_type);
CREATE INDEX idx_shipment_events_ai_flagged
    ON shipment_events(ai_flagged) WHERE ai_flagged = TRUE;
CREATE INDEX idx_shipment_events_created
    ON shipment_events(created_at DESC);


-- ==========================================================
-- SECTION 4: TRIGGERS
--
-- WHAT IS A TRIGGER?
-- A function that runs automatically when something happens
-- to a table. Our trigger auto-sets updated_at on every row
-- update so you never have to remember to do it in code.
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
