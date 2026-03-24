-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: database-setup.sql
-- VERSION: 1.3.0
-- UPDATED: 2026-03-23
-- FOCUS: Phase 1 — Full Billing & Rating Engine Foundation
--
-- STRUCTURE:
--   Section 0: Enums
--   Section 1: All 16 tables (no RLS yet)
--   Section 2: All RLS policies
--   Section 3: Indexes
--   Section 4: Triggers
--
-- NEW IN v1.3.0:
--   - org_carrier_accounts: carrier account profiles per org
--     with lassoed/dark mode, markup, and is_cactus_account flag
--   - carrier_invoices: tracks each uploaded carrier invoice batch
--   - invoice_line_items: individual lines from carrier invoices
--     with full matching, billing, and dispute tracking
--   - rate_cards re-parented from organizations to
--     org_carrier_accounts
--   - locations updated: normalized_address, is_billing_address,
--     multiple addresses per org supported
--   - shipment_ledger updated: shipment_source column added
--
-- BILLING BRAIN RULES (enforced in application layer):
--   1. Always bill from carrier invoice data, never label print
--   2. lassoed accounts: match by tracking_number
--   3. dark accounts: match by ship_from normalized address
--   4. Markup lives at carrier account level
--   5. Rate cards are optional children of carrier accounts
--   6. If rate card exists: use rate card price, apply account
--      markup on top (set to 0 if markup baked into rate card)
--   7. Single-Ceiling applied once to shipment total
--   8. Variance above dispute_threshold: flag, hold from billing
-- ==========================================================


-- ==========================================================
-- SECTION 0: ENUMS
-- ==========================================================

CREATE TYPE org_type_enum AS ENUM (
    '3PL',
    'MERCHANT',
    'SUB_CLIENT'
);

CREATE TYPE invoice_status_enum AS ENUM (
    'UNPAID',
    'PAID',
    'FAILED',
    'VOID'
);

CREATE TYPE meter_transaction_type_enum AS ENUM (
    'RELOAD',           -- Funds added to meter (ACH or CC)
    'LABEL_PURCHASE',   -- USPS label deduction
    'APV_ADJUSTMENT',   -- USPS Automated Package Verification correction
    'CC_FEE',           -- 3% merchant processing fee on CC reloads
    'MANUAL_CREDIT',    -- Admin-issued credit
    'MANUAL_DEBIT'      -- Admin-issued debit
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
    'RATE_REQUESTED',
    'LABEL_CREATED',
    'LABEL_VOIDED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERY_ATTEMPTED',
    'DELIVERED',
    'RETURNED_TO_SENDER',
    'LOST',
    'EXCEPTION',
    'APV_ADJUSTMENT',
    'ADDRESS_CORRECTED',
    'DAMAGED'
);

-- carrier_account_mode_enum
-- WHAT IS THIS?
-- Every carrier account in Cactus is either "lassoed" or "dark."
-- lassoed_carrier_account: WMS/OMS integrated. Cactus sees every
--   label at print time. Full reconciliation available.
-- dark_carrier_account: Client entered Cactus credentials directly
--   into their platform (e.g. ShipStation). Cactus has no visibility
--   until the carrier invoice arrives. Billing only, no reconciliation.
CREATE TYPE carrier_account_mode_enum AS ENUM (
    'lassoed_carrier_account',
    'dark_carrier_account'
);

CREATE TYPE shipment_source_enum AS ENUM (
    'RATING_ENGINE',    -- Came through Cactus at label print (lassoed)
    'INVOICE_IMPORT'    -- Discovered from carrier invoice upload (dark)
);

CREATE TYPE carrier_invoice_status_enum AS ENUM (
    'UPLOADED',       -- File received, not yet processed
    'NORMALIZING',    -- AI is mapping headers to Cactus Standard
    'REVIEW',         -- Awaiting human review of AI suggestions
    'APPROVED',       -- Human approved, ready to process
    'PROCESSING',     -- Matching lines to orgs, applying markup
    'COMPLETE',       -- All lines processed, invoices generated
    'FAILED'          -- Processing error, needs attention
);

CREATE TYPE match_method_enum AS ENUM (
    'TRACKING_NUMBER',      -- lassoed accounts: matched via shipment_ledger
    'SHIP_FROM_ADDRESS',    -- dark accounts: matched via locations table
    'MANUAL'                -- manually assigned by Alamo admin
);

CREATE TYPE match_status_enum AS ENUM (
    'AUTO_MATCHED',     -- System matched confidently
    'FLAGGED',          -- Could not match or collision detected
    'MANUAL_ASSIGNED'   -- Alamo admin manually assigned org
);

CREATE TYPE billing_status_enum AS ENUM (
    'PENDING',      -- Matched, markup calculated, awaiting approval
    'HELD',         -- Flagged for dispute review, not yet billable
    'APPROVED',     -- Ready to include in client invoice
    'INVOICED'      -- Included in a cactus_invoices record
);


-- ==========================================================
-- SECTION 1: TABLES
-- All 16 tables created before any RLS policies.
-- ==========================================================

-- ----------------------------------------------------------
-- TABLE 1: organizations
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
    'NULL = top-level org. Non-null = sub-client of a 3PL (Phase 2 billing).';
COMMENT ON COLUMN organizations.terms_days IS
    'Payment terms for post-paid weekly invoices. Default Net-7.';


-- ----------------------------------------------------------
-- TABLE 2: org_users
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


-- ----------------------------------------------------------
-- TABLE 3: locations
--
-- Stores all addresses for an org. Multiple locations per org
-- are supported and required for invoice matching.
--
-- is_billing_address: when TRUE, this address is used as a
-- valid ship-from match during carrier invoice line matching.
-- Not every location needs to be a billing address (e.g. a
-- returns address would have is_billing_address = FALSE).
--
-- normalized_address: a cleaned, standardized version of the
-- address used for reliable matching against carrier invoice
-- data. Carrier invoices don't always format addresses
-- consistently (St vs Street, AZ vs Arizona, etc).
-- The application layer normalizes before storing and before
-- matching. Format: "1234 MAIN ST, PHOENIX, AZ, 85001, US"
-- ----------------------------------------------------------

CREATE TABLE locations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                    TEXT NOT NULL,
    location_type           location_type_enum NOT NULL DEFAULT 'SHIP_FROM',
    address_line1           TEXT NOT NULL,
    address_line2           TEXT,
    city                    TEXT NOT NULL,
    state                   CHAR(2) NOT NULL,
    postal_code             TEXT NOT NULL,
    country                 CHAR(2) NOT NULL DEFAULT 'US',
    normalized_address      TEXT,
    is_billing_address      BOOLEAN NOT NULL DEFAULT TRUE,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    -- Phase 3 WMS hooks (NULL in Phase 1)
    warehouse_zone          TEXT,
    aisle                   TEXT,
    bin                     TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE locations IS
    'All addresses for an org. Multiple per org supported. Used for invoice line matching.';
COMMENT ON COLUMN locations.normalized_address IS
    'Uppercase, standardized address string. Format: "1234 MAIN ST, PHOENIX, AZ, 85001, US". Used for dark account invoice matching.';
COMMENT ON COLUMN locations.is_billing_address IS
    'When TRUE, this address is checked during carrier invoice line matching for dark accounts.';


-- ----------------------------------------------------------
-- TABLE 4: org_carrier_accounts
--
-- The carrier account profile for each org. This is the
-- central table for Phase 1 — almost every billing and
-- rating decision traces through here.
--
-- MARKUP LIVES HERE, not on rate_cards.
-- Rate cards are optional children of this table.
-- If a rate card exists for a service level, use it.
-- Apply account-level markup on top.
-- If markup is already baked into the rate card, set
-- markup_percentage = 0.0000 on the account.
--
-- is_cactus_account:
--   TRUE  = Cactus earns margin on this account (default)
--   FALSE = No owned revenue. Process for records only.
--           Used for pass-through or non-Cactus accounts.
--
-- carrier_account_mode:
--   lassoed_carrier_account = WMS integrated, full visibility
--   dark_carrier_account    = credentials shared, no visibility
--                             until carrier invoice arrives
-- ----------------------------------------------------------

CREATE TABLE org_carrier_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    carrier_code            carrier_code_enum NOT NULL,
    account_number          TEXT NOT NULL,
    account_nickname        TEXT NOT NULL,
    carrier_account_mode    carrier_account_mode_enum NOT NULL DEFAULT 'lassoed_carrier_account',
    is_cactus_account       BOOLEAN NOT NULL DEFAULT TRUE,
    markup_percentage       DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
    markup_flat_fee         DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
    -- Dispute threshold: variance above this amount triggers
    -- a hold and human review before billing the client.
    -- Set per account to allow flexibility per client agreement.
    dispute_threshold       DECIMAL(18,4) NOT NULL DEFAULT 2.0000,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_id, carrier_code, account_number)
);

COMMENT ON TABLE org_carrier_accounts IS
    'Carrier account profile per org. Primary markup lives here. Rate cards are optional children.';
COMMENT ON COLUMN org_carrier_accounts.is_cactus_account IS
    'TRUE = Cactus earns margin. FALSE = pass-through, no owned revenue, skip markup.';
COMMENT ON COLUMN org_carrier_accounts.carrier_account_mode IS
    'lassoed = WMS integrated, full visibility. dark = credentials shared, invoice-only visibility.';
COMMENT ON COLUMN org_carrier_accounts.markup_percentage IS
    'Primary markup for this carrier account. Set to 0.0000 if markup is baked into a rate card.';
COMMENT ON COLUMN org_carrier_accounts.dispute_threshold IS
    'Dollar variance above which an invoice line is flagged and held for human review.';


-- ----------------------------------------------------------
-- TABLE 5: rate_cards
--
-- Optional custom rate cards assigned to a specific carrier
-- account and service level. When present, the rate card
-- price is used instead of the raw carrier cost.
-- Account-level markup is still applied on top unless
-- markup_percentage on the account is set to 0.0000.
-- ----------------------------------------------------------

CREATE TABLE rate_cards (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_carrier_account_id      UUID NOT NULL REFERENCES org_carrier_accounts(id) ON DELETE CASCADE,
    org_id                      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    service_level               TEXT NOT NULL,
    nickname                    TEXT NOT NULL,
    effective_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    deprecated_date             DATE,
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(org_carrier_account_id, service_level, effective_date)
);

COMMENT ON TABLE rate_cards IS
    'Optional custom rate cards per carrier account and service level. Children of org_carrier_accounts.';
COMMENT ON COLUMN rate_cards.org_carrier_account_id IS
    'Parent carrier account. Rate card applies to this account + service_level combination.';
COMMENT ON COLUMN rate_cards.org_id IS
    'Denormalized for RLS scoping and query performance. Must match org_carrier_account.org_id.';
COMMENT ON COLUMN rate_cards.service_level IS
    'e.g. GROUND_ADVANTAGE, PRIORITY_MAIL, UPS_GROUND. Rate card applies to this service only.';
COMMENT ON COLUMN rate_cards.nickname IS
    'Human-friendly label in The Alamo. e.g. "USPS GA Q1 2026 Custom Rates"';


-- ----------------------------------------------------------
-- TABLE 6: meters
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
    'USPS pre-paid postage wallet. One per org. current_balance is a cache — source of truth is meter_transactions sum.';


-- ----------------------------------------------------------
-- TABLE 7: meter_transactions
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


-- ----------------------------------------------------------
-- TABLE 8: carrier_invoice_mappings
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


-- ----------------------------------------------------------
-- TABLE 9: shipment_ledger
--
-- shipment_source tells us how this row was created:
--   RATING_ENGINE: came through Cactus at label print (lassoed)
--   INVOICE_IMPORT: created when carrier invoice was processed (dark)
-- ----------------------------------------------------------

CREATE TABLE shipment_ledger (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    org_carrier_account_id  UUID REFERENCES org_carrier_accounts(id) ON DELETE SET NULL,
    rate_card_id            UUID REFERENCES rate_cards(id) ON DELETE SET NULL,
    tracking_number         TEXT NOT NULL UNIQUE,
    carrier_code            carrier_code_enum,
    service_level           TEXT,
    shipment_source         shipment_source_enum NOT NULL DEFAULT 'RATING_ENGINE',
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
    'One row per shipment. Single-Ceiling output. Immutable. Source of truth for billing.';
COMMENT ON COLUMN shipment_ledger.shipment_source IS
    'RATING_ENGINE = came through Cactus at label print. INVOICE_IMPORT = created from carrier invoice upload.';
COMMENT ON COLUMN shipment_ledger.final_merchant_rate IS
    'CEILING(pre_ceiling_amount * 100) / 100. What the client is billed. Always from carrier invoice data.';


-- ----------------------------------------------------------
-- TABLE 10: carrier_invoices
--
-- Tracks each uploaded carrier invoice file as a batch.
-- One row per uploaded file. Individual line items live
-- in invoice_line_items.
-- ----------------------------------------------------------

CREATE TABLE carrier_invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID REFERENCES organizations(id) ON DELETE SET NULL,
    carrier_code            carrier_code_enum NOT NULL,
    org_carrier_account_id  UUID REFERENCES org_carrier_accounts(id) ON DELETE SET NULL,
    invoice_file_name       TEXT NOT NULL,
    invoice_period_start    DATE,
    invoice_period_end      DATE,
    status                  carrier_invoice_status_enum NOT NULL DEFAULT 'UPLOADED',
    total_carrier_amount    DECIMAL(18,4),
    total_line_items        INT,
    matched_line_items      INT DEFAULT 0,
    flagged_line_items      INT DEFAULT 0,
    uploaded_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ai_processing_notes     TEXT,
    processed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE carrier_invoices IS
    'One row per uploaded carrier invoice file. Individual lines in invoice_line_items.';
COMMENT ON COLUMN carrier_invoices.ai_processing_notes IS
    'Summary of what the AI found during normalization — new headers, low confidence mappings, etc.';
COMMENT ON COLUMN carrier_invoices.flagged_line_items IS
    'Count of lines flagged for human review (unknown address, variance above threshold, etc).';


-- ----------------------------------------------------------
-- TABLE 11: cactus_invoices
-- Created before invoice_line_items so the FK reference
-- on invoice_line_items.cactus_invoice_id resolves correctly.
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
    'Client-facing weekly invoices. Line items come from invoice_line_items where billing_status = APPROVED.';


-- ----------------------------------------------------------
-- TABLE 12: invoice_line_items
--
-- The beating heart of the invoice pipeline.
-- One row per line item on a carrier invoice.
-- Tracks the full lifecycle: raw upload → normalization →
-- org matching → markup → billing → client invoice.
--
-- MATCHING LOGIC:
--   lassoed accounts: match_method = TRACKING_NUMBER
--     → tracking_number links to shipment_ledger → org_id known
--   dark accounts: match_method = SHIP_FROM_ADDRESS
--     → ship_from_address_normalized matched against
--       locations.normalized_address where is_billing_address = TRUE
--
-- BILLING RULE:
--   Always bill from carrier_charge (what carrier invoiced).
--   Never bill from shipment_ledger.final_merchant_rate.
--   Reconcile the two and flag variances above dispute_threshold.
-- ----------------------------------------------------------

CREATE TABLE invoice_line_items (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_invoice_id              UUID NOT NULL REFERENCES carrier_invoices(id) ON DELETE CASCADE,
    org_id                          UUID REFERENCES organizations(id) ON DELETE SET NULL,
    org_carrier_account_id          UUID REFERENCES org_carrier_accounts(id) ON DELETE SET NULL,
    shipment_ledger_id              UUID REFERENCES shipment_ledger(id) ON DELETE SET NULL,
    -- Raw carrier data
    tracking_number                 TEXT,
    carrier_account_number          TEXT,
    ship_from_address_raw           TEXT,
    ship_from_address_normalized    TEXT,
    carrier_charge                  DECIMAL(18,4) NOT NULL,
    -- Normalized surcharge fields (Cactus Standard)
    base_charge                     DECIMAL(18,4),
    fuel_surcharge                  DECIMAL(18,4),
    residential_surcharge           DECIMAL(18,4),
    address_correction              DECIMAL(18,4),
    delivery_area_surcharge         DECIMAL(18,4),
    additional_handling             DECIMAL(18,4),
    dim_weight_adjustment           DECIMAL(18,4),
    apv_adjustment                  DECIMAL(18,4),
    other_surcharges                DECIMAL(18,4),
    other_surcharges_detail         JSONB,
    -- Matching
    match_method                    match_method_enum,
    match_status                    match_status_enum,
    -- Billing calculation (populated after org match)
    markup_percentage               DECIMAL(7,4),
    markup_flat_fee                 DECIMAL(18,4),
    pre_ceiling_amount              DECIMAL(18,4),
    final_merchant_rate             DECIMAL(18,4),
    -- Reconciliation
    quoted_rate                     DECIMAL(18,4),
    variance_amount                 DECIMAL(18,4),
    dispute_flag                    BOOLEAN NOT NULL DEFAULT FALSE,
    dispute_notes                   TEXT,
    -- Billing status
    billing_status                  billing_status_enum NOT NULL DEFAULT 'PENDING',
    cactus_invoice_id               UUID REFERENCES cactus_invoices(id) ON DELETE SET NULL,
    -- Metadata
    raw_line_data                   JSONB,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoice_line_items IS
    'One row per carrier invoice line. Full lifecycle from raw upload to client invoice.';
COMMENT ON COLUMN invoice_line_items.carrier_charge IS
    'What the carrier actually billed. This is ALWAYS the basis for client billing.';
COMMENT ON COLUMN invoice_line_items.quoted_rate IS
    'What the Cactus rating engine quoted at label print (from shipment_ledger). NULL for dark accounts.';
COMMENT ON COLUMN invoice_line_items.variance_amount IS
    'carrier_charge minus quoted_rate. Positive = carrier charged more than quoted.';
COMMENT ON COLUMN invoice_line_items.dispute_flag IS
    'TRUE when ABS(variance_amount) exceeds org_carrier_account.dispute_threshold.';
COMMENT ON COLUMN invoice_line_items.ship_from_address_raw IS
    'Address exactly as it appears on the carrier invoice. Never modified.';
COMMENT ON COLUMN invoice_line_items.ship_from_address_normalized IS
    'Uppercase, standardized version used for matching against locations table.';
COMMENT ON COLUMN invoice_line_items.raw_line_data IS
    'Full raw carrier invoice row stored as JSONB for auditability and re-processing.';
COMMENT ON COLUMN invoice_line_items.other_surcharges_detail IS
    'JSONB breakdown of any surcharges that do not map to a named Cactus Standard column.';


-- ----------------------------------------------------------
-- TABLE 13: rate_shop_log (Shadow Ledger)
-- ----------------------------------------------------------

CREATE TABLE rate_shop_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    org_carrier_account_id UUID REFERENCES org_carrier_accounts(id) ON DELETE SET NULL,
    origin_postal       TEXT NOT NULL,
    destination_postal  TEXT NOT NULL,
    destination_country CHAR(2) NOT NULL DEFAULT 'US',
    is_residential      BOOLEAN,
    weight_oz           DECIMAL(10,4) NOT NULL,
    length_in           DECIMAL(8,4),
    width_in            DECIMAL(8,4),
    height_in           DECIMAL(8,4),
    carrier_code        carrier_code_enum NOT NULL,
    service_level       TEXT NOT NULL,
    quoted_rate         DECIMAL(18,4) NOT NULL,
    final_merchant_rate DECIMAL(18,4) NOT NULL,
    transit_days        INT,
    was_selected        BOOLEAN NOT NULL DEFAULT FALSE,
    shipment_ledger_id  UUID REFERENCES shipment_ledger(id) ON DELETE SET NULL,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rate_shop_log IS
    'Shadow Ledger. Logs every rate request including unselected options. Primary AI training dataset.';


-- ----------------------------------------------------------
-- TABLE 14: shipment_events (Event Sourcing)
-- ----------------------------------------------------------

CREATE TABLE shipment_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_ledger_id  UUID NOT NULL REFERENCES shipment_ledger(id) ON DELETE RESTRICT,
    org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    event_type          shipment_event_type_enum NOT NULL,
    carrier_code        carrier_code_enum,
    carrier_timestamp   TIMESTAMPTZ,
    carrier_location    TEXT,
    carrier_message     TEXT,
    ai_flagged          BOOLEAN NOT NULL DEFAULT FALSE,
    ai_flag_reason      TEXT,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE shipment_events IS
    'Event sourcing layer. Immutable timeline of everything that happens to a shipment. Never update or delete.';


-- ----------------------------------------------------------
-- TABLE 15: audit_logs
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


-- ----------------------------------------------------------
-- TABLE 16: cactus_invoice_line_items
-- Junction table linking cactus_invoices to invoice_line_items.
-- Allows one client invoice to aggregate multiple carrier
-- invoice line items across carriers and billing periods.
-- ----------------------------------------------------------

CREATE TABLE cactus_invoice_line_items (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cactus_invoice_id       UUID NOT NULL REFERENCES cactus_invoices(id) ON DELETE CASCADE,
    invoice_line_item_id    UUID NOT NULL REFERENCES invoice_line_items(id) ON DELETE RESTRICT,
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    final_merchant_rate     DECIMAL(18,4) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(cactus_invoice_id, invoice_line_item_id)
);

COMMENT ON TABLE cactus_invoice_line_items IS
    'Links client invoices to individual carrier invoice line items. One-to-many aggregation.';


-- ==========================================================
-- SECTION 2: ROW LEVEL SECURITY
-- All tables created above. Policies applied here.
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

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_locations"
    ON locations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_locations"
    ON locations FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE org_carrier_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_org_carrier_accounts"
    ON org_carrier_accounts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_carrier_accounts"
    ON org_carrier_accounts FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

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

ALTER TABLE carrier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_carrier_invoices"
    ON carrier_invoices FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_invoice_line_items"
    ON invoice_line_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_invoice_line_items"
    ON invoice_line_items FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE cactus_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cactus_invoices"
    ON cactus_invoices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_invoices"
    ON cactus_invoices FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE cactus_invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cactus_invoice_line_items"
    ON cactus_invoice_line_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_cactus_invoice_line_items"
    ON cactus_invoice_line_items FOR SELECT
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

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_audit_logs"
    ON audit_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_audit_logs"
    ON audit_logs FOR SELECT
    USING (org_id = (SELECT org_id FROM org_users WHERE user_id = auth.uid() LIMIT 1));


-- ==========================================================
-- SECTION 3: INDEXES
-- ==========================================================

-- organizations
CREATE INDEX idx_organizations_parent
    ON organizations(parent_org_id) WHERE parent_org_id IS NOT NULL;
CREATE INDEX idx_organizations_active
    ON organizations(is_active) WHERE is_active = TRUE;

-- org_users
CREATE INDEX idx_org_users_user_id ON org_users(user_id);
CREATE INDEX idx_org_users_org_id  ON org_users(org_id);

-- locations
CREATE INDEX idx_locations_org_id
    ON locations(org_id);
CREATE INDEX idx_locations_billing
    ON locations(org_id, is_billing_address)
    WHERE is_billing_address = TRUE AND is_active = TRUE;
CREATE INDEX idx_locations_normalized_address
    ON locations(normalized_address)
    WHERE is_billing_address = TRUE AND is_active = TRUE;

-- org_carrier_accounts
CREATE INDEX idx_org_carrier_accounts_org_id
    ON org_carrier_accounts(org_id);
CREATE INDEX idx_org_carrier_accounts_carrier
    ON org_carrier_accounts(carrier_code);
CREATE INDEX idx_org_carrier_accounts_account_number
    ON org_carrier_accounts(account_number);
CREATE INDEX idx_org_carrier_accounts_active
    ON org_carrier_accounts(org_id, carrier_code)
    WHERE is_active = TRUE;

-- rate_cards
CREATE INDEX idx_rate_cards_carrier_account
    ON rate_cards(org_carrier_account_id);
CREATE INDEX idx_rate_cards_org_id
    ON rate_cards(org_id);
CREATE INDEX idx_rate_cards_active
    ON rate_cards(org_carrier_account_id, service_level)
    WHERE deprecated_date IS NULL AND is_active = TRUE;

-- meters
CREATE INDEX idx_meters_org_id ON meters(org_id);

-- meter_transactions
CREATE INDEX idx_meter_tx_meter_id ON meter_transactions(meter_id);
CREATE INDEX idx_meter_tx_org_id   ON meter_transactions(org_id);
CREATE INDEX idx_meter_tx_created  ON meter_transactions(created_at DESC);
CREATE INDEX idx_meter_tx_type     ON meter_transactions(transaction_type);

-- carrier_invoice_mappings
CREATE INDEX idx_carrier_mappings_active
    ON carrier_invoice_mappings(carrier_code, raw_header_name)
    WHERE deprecated_date IS NULL;

-- shipment_ledger
CREATE INDEX idx_shipment_ledger_org_id
    ON shipment_ledger(org_id);
CREATE INDEX idx_shipment_ledger_tracking
    ON shipment_ledger(tracking_number);
CREATE INDEX idx_shipment_ledger_carrier_account
    ON shipment_ledger(org_carrier_account_id);
CREATE INDEX idx_shipment_ledger_unreconciled
    ON shipment_ledger(org_id, reconciled) WHERE reconciled = FALSE;
CREATE INDEX idx_shipment_ledger_source
    ON shipment_ledger(shipment_source);
CREATE INDEX idx_shipment_ledger_created
    ON shipment_ledger(created_at DESC);

-- carrier_invoices
CREATE INDEX idx_carrier_invoices_org_id
    ON carrier_invoices(org_id);
CREATE INDEX idx_carrier_invoices_carrier
    ON carrier_invoices(carrier_code);
CREATE INDEX idx_carrier_invoices_status
    ON carrier_invoices(status);
CREATE INDEX idx_carrier_invoices_created
    ON carrier_invoices(created_at DESC);

-- invoice_line_items
CREATE INDEX idx_invoice_line_items_carrier_invoice
    ON invoice_line_items(carrier_invoice_id);
CREATE INDEX idx_invoice_line_items_org_id
    ON invoice_line_items(org_id);
CREATE INDEX idx_invoice_line_items_tracking
    ON invoice_line_items(tracking_number);
CREATE INDEX idx_invoice_line_items_normalized_address
    ON invoice_line_items(ship_from_address_normalized);
CREATE INDEX idx_invoice_line_items_billing_status
    ON invoice_line_items(billing_status);
CREATE INDEX idx_invoice_line_items_dispute
    ON invoice_line_items(dispute_flag) WHERE dispute_flag = TRUE;
CREATE INDEX idx_invoice_line_items_match_status
    ON invoice_line_items(match_status);

-- cactus_invoices
CREATE INDEX idx_cactus_invoices_org_id  ON cactus_invoices(org_id);
CREATE INDEX idx_cactus_invoices_due
    ON cactus_invoices(due_date) WHERE status = 'UNPAID';
CREATE INDEX idx_cactus_invoices_status  ON cactus_invoices(status);

-- cactus_invoice_line_items
CREATE INDEX idx_cactus_invoice_line_items_invoice
    ON cactus_invoice_line_items(cactus_invoice_id);
CREATE INDEX idx_cactus_invoice_line_items_org
    ON cactus_invoice_line_items(org_id);

-- rate_shop_log
CREATE INDEX idx_rate_shop_log_org_id
    ON rate_shop_log(org_id);
CREATE INDEX idx_rate_shop_log_lane
    ON rate_shop_log(origin_postal, destination_postal, carrier_code);
CREATE INDEX idx_rate_shop_log_selected
    ON rate_shop_log(org_id, was_selected);
CREATE INDEX idx_rate_shop_log_created
    ON rate_shop_log(created_at DESC);

-- shipment_events
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

-- audit_logs
CREATE INDEX idx_audit_logs_org_id  ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);


-- ==========================================================
-- SECTION 4: TRIGGERS
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

CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_org_carrier_accounts_updated_at
    BEFORE UPDATE ON org_carrier_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rate_cards_updated_at
    BEFORE UPDATE ON rate_cards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_meters_updated_at
    BEFORE UPDATE ON meters
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_carrier_invoices_updated_at
    BEFORE UPDATE ON carrier_invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoice_line_items_updated_at
    BEFORE UPDATE ON invoice_line_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cactus_invoices_updated_at
    BEFORE UPDATE ON cactus_invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();