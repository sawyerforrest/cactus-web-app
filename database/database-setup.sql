-- ==========================================================
-- PROJECT: CACTUS Logistics OS
-- FILENAME: database-setup.sql
-- VERSION: 1.4.7
-- UPDATED: 2026-04-08
-- FOCUS: Phase 1 — Full Billing & Rating Engine Foundation
--
-- STRUCTURE:
--   Section 0: Enums
--   Section 1: All 16 tables (no RLS yet)
--   Section 2: All RLS policies
--   Section 3: Indexes
--   Section 4: Triggers
--
-- CHANGES IN v1.4.0:
--   - carrier_code_enum: removed LSO, added GOFO, SHIPX, OSM
-- CHANGES IN v1.4.1:
--   - invoice_line_items: added weight_billed, weight_unit_billed
-- CHANGES IN v1.4.2:
--   - invoice_line_items: full field expansion (dims, addresses,
--     dates, references, international, shipment characteristics)
--   - Renamed carrier_account_number → account_number_carrier
--   - Renamed ship_from_address_* → address_sender_*
-- CHANGES IN v1.4.3:
--   - rate_shop_log: renamed origin_postal → postal_origin,
--     destination_postal → postal_destination,
--     destination_country → country_destination,
--     was_selected → is_selected
-- CHANGES IN v1.4.4:
--   - carrier_invoices: added file_path, raw_headers
-- CHANGES IN v1.4.5:
--   - invoice_line_items: removed dim_weight_adjustment,
--     added apv_adjustment_detail
-- CHANGES IN v1.4.6:
--   - carrier_invoices: file_path and raw_headers columns
--     already added in v1.4.4 — version bump for consistency
-- CHANGES IN v1.4.7:
--   - Added carrier_invoice_formats (Table 17)
--     Stores 250-column UPS detail invoice format template
--     Enables headerless invoice file ingestion by position
--   - Added carrier_charge_routing (Table 18)
--     Self-improving charge routing table for UPS detail format
--     42 UPS charge routing rules seeded
--     Unknown charges auto-route to other_surcharges + flag
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
    'RELOAD',
    'LABEL_PURCHASE',
    'APV_ADJUSTMENT',
    'CC_FEE',
    'MANUAL_CREDIT',
    'MANUAL_DEBIT'
);

CREATE TYPE markup_type_enum AS ENUM (
    'PERCENTAGE',
    'FLAT',
    'COMBINED'
);

-- carrier_code_enum v1.4.0
-- REMOVED: LSO (Lone Star Overnight) — not in carrier roadmap
-- ADDED: GOFO (formerly Cirro) — regional last-mile, gig drivers
-- ADDED: SHIPX — regional last-mile, gig drivers + USPS national
-- ADDED: OSM — postal consolidator, USPS final mile
CREATE TYPE carrier_code_enum AS ENUM (
    -- Phase 1 Launch
    'UPS',
    'FEDEX',
    -- Phase 2 Growth
    'USPS',
    'UNIUNI',
    'GOFO',
    'SHIPX',
    'DHL_ECOM',
    'DHL_EXPRESS',
    -- Phase 3 Scale
    'LANDMARK',
    'ONTRAC',
    'OSM'
);

CREATE TYPE location_type_enum AS ENUM (
    'WAREHOUSE',
    'SHIP_FROM',
    'STORAGE',
    'RETURNS'
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

CREATE TYPE carrier_account_mode_enum AS ENUM (
    'lassoed_carrier_account',
    'dark_carrier_account'
);

CREATE TYPE shipment_source_enum AS ENUM (
    'RATING_ENGINE',
    'INVOICE_IMPORT'
);

CREATE TYPE carrier_invoice_status_enum AS ENUM (
    'UPLOADED',
    'NORMALIZING',
    'REVIEW',
    'APPROVED',
    'PROCESSING',
    'COMPLETE',
    'FAILED'
);

CREATE TYPE match_method_enum AS ENUM (
    'TRACKING_NUMBER',
    'SHIP_FROM_ADDRESS',
    'MANUAL'
);

CREATE TYPE match_status_enum AS ENUM (
    'AUTO_MATCHED',
    'FLAGGED',
    'MANUAL_ASSIGNED'
);

CREATE TYPE billing_status_enum AS ENUM (
    'PENDING',
    'HELD',
    'APPROVED',
    'INVOICED'
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
    warehouse_zone          TEXT,
    aisle                   TEXT,
    bin                     TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE locations IS
    'All addresses for an org. Multiple per org supported. Used for invoice line matching.';
COMMENT ON COLUMN locations.normalized_address IS
    'Uppercase standardized address. Format: "1234 MAIN ST, PHOENIX, AZ, 85001, US". Used for dark account invoice matching.';
COMMENT ON COLUMN locations.is_billing_address IS
    'When TRUE, this address is checked during carrier invoice line matching for dark accounts.';


-- ----------------------------------------------------------
-- TABLE 4: org_carrier_accounts
--
-- Central table for Phase 1. All billing and rating
-- decisions trace through here.
--
-- CARRIER ACCOUNT MODES:
--   lassoed_carrier_account: WMS integrated, full label-print
--     visibility, full reconciliation available.
--   dark_carrier_account: Client entered Cactus credentials
--     directly into their platform (e.g. ShipStation). No
--     visibility until carrier invoice arrives. Billing only.
--
-- is_cactus_account:
--   TRUE  = Cactus earns margin. Apply markup.
--   FALSE = Pass-through. No owned revenue. Skip markup.
--
-- MARKUP LIVES HERE, not on rate_cards.
-- Rate cards are optional children of this table.
-- ----------------------------------------------------------

CREATE TABLE org_carrier_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    carrier_code            carrier_code_enum NOT NULL,
    account_number          TEXT NOT NULL,
    account_nickname        TEXT NOT NULL,
    carrier_account_mode    carrier_account_mode_enum NOT NULL DEFAULT 'lassoed_carrier_account',
    is_cactus_account       BOOLEAN NOT NULL DEFAULT TRUE,
    use_rate_card           BOOLEAN NOT NULL DEFAULT FALSE,
    markup_percentage       DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
    markup_flat_fee         DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
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
COMMENT ON COLUMN org_carrier_accounts.dispute_threshold IS
    'Dollar variance above which an invoice line is flagged and held for human review.';
COMMENT ON COLUMN org_carrier_accounts.use_rate_card IS
    'FALSE = use carrier API for rating. TRUE = use rate cards instead of carrier API.';


-- ----------------------------------------------------------
-- TABLE 5: rate_cards
--
-- Optional custom rate cards per carrier account and service
-- level. Children of org_carrier_accounts.
-- When present, rate card price is used instead of raw
-- carrier cost. Account markup applied on top.
-- If markup baked into rate card: set account markup = 0.
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
COMMENT ON COLUMN rate_cards.org_id IS
    'Denormalized for RLS scoping. Must match org_carrier_account.org_id.';


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
    raw_carrier_cost        DECIMAL(18,4) NOT NULL,
    markup_percentage       DECIMAL(7,4),
    markup_flat_fee         DECIMAL(18,4),
    pre_ceiling_amount      DECIMAL(18,4) NOT NULL,
    final_merchant_rate     DECIMAL(18,4) NOT NULL,
    carrier_invoiced_amount DECIMAL(18,4),
    reconciled              BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at           TIMESTAMPTZ,
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
-- TABLE 10: cactus_invoices
-- Created before invoice_line_items to resolve FK reference.
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
-- TABLE 11: carrier_invoices
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
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    file_path               TEXT,
    raw_headers             JSONB,
    invoice_format          TEXT DEFAULT 'SUMMARY',
    has_unmapped_charges    BOOLEAN NOT NULL DEFAULT FALSE,
    unmapped_charge_types   JSONB
);

COMMENT ON TABLE carrier_invoices IS
    'One row per uploaded carrier invoice file. Individual lines in invoice_line_items.';
COMMENT ON COLUMN carrier_invoices.file_path IS
  'Path to uploaded invoice file in Supabase Storage bucket carrier-invoices.';
COMMENT ON COLUMN carrier_invoices.raw_headers IS
  'JSON array of raw column header strings extracted at upload time. Used by AI normalization.';
COMMENT ON COLUMN carrier_invoices.invoice_format IS
  'DETAIL or SUMMARY. Set by admin at upload time. Determines which parser runs.';
COMMENT ON COLUMN carrier_invoices.has_unmapped_charges IS
  'TRUE if parser encountered charge types not in carrier_charge_routing. Requires admin review.';
COMMENT ON COLUMN carrier_invoices.unmapped_charge_types IS
  'JSONB array of unrecognized charge descriptions found during parsing. Used for routing table expansion.';


-- ----------------------------------------------------------
-- TABLE 12: invoice_line_items
--
-- MATCHING LOGIC:
--   lassoed accounts: tracking_number → shipment_ledger
--   dark accounts: address_sender_normalized → locations
--
-- BILLING RULE:
--   Always bill from carrier_charge. Never from quoted rate.
-- ----------------------------------------------------------

CREATE TABLE invoice_line_items (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_invoice_id              UUID NOT NULL REFERENCES carrier_invoices(id) ON DELETE CASCADE,
    org_id                          UUID REFERENCES organizations(id) ON DELETE SET NULL,
    org_carrier_account_id          UUID REFERENCES org_carrier_accounts(id) ON DELETE SET NULL,
    shipment_ledger_id              UUID REFERENCES shipment_ledger(id) ON DELETE SET NULL,
    tracking_number                 TEXT,
    tracking_number_lead            TEXT,
    account_number_carrier          TEXT,
    address_sender_raw              TEXT,
    address_sender_normalized       TEXT,
    address_sender_line1            TEXT,
    address_sender_line2            TEXT,
    address_sender_city             TEXT,
    address_sender_state            TEXT,
    address_sender_zip              TEXT,
    address_sender_country          TEXT,
    address_receiver_line1          TEXT,
    address_receiver_line2          TEXT,
    address_receiver_city           TEXT,
    address_receiver_state          TEXT,
    address_receiver_zip            TEXT,
    address_receiver_country        TEXT,
    carrier_charge                  DECIMAL(18,4) NOT NULL,
    base_charge                     DECIMAL(18,4),
    fuel_surcharge                  DECIMAL(18,4),
    residential_surcharge           DECIMAL(18,4),
    address_correction              DECIMAL(18,4),
    delivery_area_surcharge         DECIMAL(18,4),
    additional_handling             DECIMAL(18,4),
    apv_adjustment                  DECIMAL(18,4),
    apv_adjustment_detail           JSONB,
    other_surcharges                DECIMAL(18,4),
    other_surcharges_detail         JSONB,
    weight_billed                   DECIMAL(10,4),
    weight_unit_billed              TEXT DEFAULT 'LB',
    weight_entered                  DECIMAL(10,4),
    weight_unit_entered             TEXT DEFAULT 'LB',
    length_entered                  DECIMAL(8,4),
    width_entered                   DECIMAL(8,4),
    height_entered                  DECIMAL(8,4),
    dim_weight_entered              DECIMAL(10,4),
    length_carrier                  DECIMAL(8,4),
    width_carrier                   DECIMAL(8,4),
    height_carrier                  DECIMAL(8,4),
    dim_weight_carrier              DECIMAL(10,4),
    dim_divisor                     DECIMAL(6,2),
    dim_increase                    DECIMAL(10,4),
    is_dim_billed                   BOOLEAN DEFAULT FALSE,
    service_level                   TEXT,
    zone                            TEXT,
    date_shipped                    DATE,
    date_delivered                  DATE,
    date_invoiced                   DATE,
    is_residential                  BOOLEAN,
    pieces_count                    INT,
    bundle_number                   TEXT,
    payor                           TEXT,
    packaging_type                  TEXT,
    reference_1                     TEXT,
    reference_2                     TEXT,
    reference_3                     TEXT,
    reference_4                     TEXT,
    reference_5                     TEXT,
    reference_6                     TEXT,
    reference_7                     TEXT,
    reference_8                     TEXT,
    customs_value                   DECIMAL(18,4),
    customs_currency_code           TEXT,
    status_international            TEXT,
    confirmation_delivery           TEXT,
    match_method                    match_method_enum,
    match_status                    match_status_enum,
    markup_percentage               DECIMAL(7,4),
    markup_flat_fee                 DECIMAL(18,4),
    pre_ceiling_amount              DECIMAL(18,4),
    final_merchant_rate             DECIMAL(18,4),
    quoted_rate                     DECIMAL(18,4),
    variance_amount                 DECIMAL(18,4),
    dispute_flag                    BOOLEAN NOT NULL DEFAULT FALSE,
    dispute_notes                   TEXT,
    billing_status                  billing_status_enum NOT NULL DEFAULT 'PENDING',
    cactus_invoice_id               UUID REFERENCES cactus_invoices(id) ON DELETE SET NULL,
    raw_line_data                   JSONB,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoice_line_items IS
    'One row per carrier invoice line. Full lifecycle from raw upload to client invoice.';
COMMENT ON COLUMN invoice_line_items.carrier_charge IS
    'What the carrier actually billed. ALWAYS the basis for client billing.';
COMMENT ON COLUMN invoice_line_items.quoted_rate IS
    'What Cactus quoted at label print. NULL for dark accounts.';
COMMENT ON COLUMN invoice_line_items.variance_amount IS
    'carrier_charge minus quoted_rate. Positive = carrier charged more than quoted.';


-- ----------------------------------------------------------
-- TABLE 13: cactus_invoice_line_items
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
    'Links client invoices to individual carrier invoice line items.';


-- ----------------------------------------------------------
-- TABLE 14: rate_shop_log (Shadow Ledger)
--
-- Logs EVERY rate request including unselected options.
-- Primary AI training dataset. Use async writes — never
-- block the rating API response.
--
-- NOTE: Per the FedEx Integrator Agreement, FedEx rate data
-- stored here may only be used for operational reconciliation.
-- Do NOT use FedEx-sourced rate data to train AI price
-- prediction models. Use Cactus margin and client behavior
-- data for AI features instead.
-- ----------------------------------------------------------

CREATE TABLE rate_shop_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    org_carrier_account_id  UUID REFERENCES org_carrier_accounts(id) ON DELETE SET NULL,
    postal_origin           TEXT NOT NULL,
    postal_destination      TEXT NOT NULL,
    country_destination     CHAR(2) NOT NULL DEFAULT 'US',
    is_residential          BOOLEAN,
    weight_oz               DECIMAL(10,4) NOT NULL,
    length_in               DECIMAL(8,4),
    width_in                DECIMAL(8,4),
    height_in               DECIMAL(8,4),
    carrier_code            carrier_code_enum NOT NULL,
    service_level           TEXT NOT NULL,
    quoted_rate             DECIMAL(18,4) NOT NULL,
    final_merchant_rate     DECIMAL(18,4) NOT NULL,
    transit_days            INT,
    is_selected            BOOLEAN NOT NULL DEFAULT FALSE,
    shipment_ledger_id      UUID REFERENCES shipment_ledger(id) ON DELETE SET NULL,
    metadata                JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE rate_shop_log IS
    'Shadow Ledger. Logs every rate request including unselected options. Primary AI training dataset.';
COMMENT ON COLUMN rate_shop_log.postal_origin IS
  'Origin postal code for zone calculation. Normalized to 5-digit US ZIP or international postal code.';
COMMENT ON COLUMN rate_shop_log.postal_destination IS
  'Destination postal code for zone calculation. Normalized to 5-digit US ZIP or international postal code.';
COMMENT ON COLUMN rate_shop_log.country_destination IS
  'Destination country code. Default US. Used for domestic vs international routing.';
COMMENT ON COLUMN rate_shop_log.is_selected IS
  'TRUE if client chose this rate and printed a label. FALSE = shopped but not selected. Core Shadow Ledger intelligence field.';


-- ----------------------------------------------------------
-- TABLE 15: shipment_events (Event Sourcing)
--
-- Never update a shipment status. Always append a new row.
-- The current state = the latest event in the timeline.
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
-- TABLE 16: audit_logs
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
-- TABLE 17: carrier_invoice_formats
-- ----------------------------------------------------------

CREATE TABLE carrier_invoice_formats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code        carrier_code_enum NOT NULL,
    format_type         TEXT NOT NULL,
    column_position     INT NOT NULL,
    column_letter       TEXT NOT NULL,
    header_name         TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    effective_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    deprecated_date     DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(carrier_code, format_type, column_position, effective_date)
);

COMMENT ON TABLE carrier_invoice_formats IS
    'Column position templates for headerless carrier invoice files. One row per column per format. UPS detail invoices have no headers — this table provides them.';
COMMENT ON COLUMN carrier_invoice_formats.format_type IS
    'DETAIL or SUMMARY. UPS has both. Other carriers may have different format types.';
COMMENT ON COLUMN carrier_invoice_formats.column_position IS
    '1-based column position in the invoice file.';
COMMENT ON COLUMN carrier_invoice_formats.column_letter IS
    'Excel-style column letter for human reference. e.g. A, B, AA, BA.';
COMMENT ON COLUMN carrier_invoice_formats.header_name IS
    'Official carrier column name. Used to match normalization mappings.';


-- ----------------------------------------------------------
-- TABLE 18: carrier_charge_routing
-- ----------------------------------------------------------

CREATE TABLE carrier_charge_routing (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    carrier_code                    carrier_code_enum NOT NULL,
    charge_classification_code      TEXT,
    charge_category_code            TEXT,
    charge_category_detail_code     TEXT,
    charge_description              TEXT,
    cactus_field                    TEXT,
    is_skip                         BOOLEAN NOT NULL DEFAULT FALSE,
    is_dimension_row                BOOLEAN NOT NULL DEFAULT FALSE,
    is_adjustment                   BOOLEAN NOT NULL DEFAULT FALSE,
    notes                           TEXT,
    is_active                       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(carrier_code, charge_classification_code, charge_category_detail_code, charge_description)
);

COMMENT ON TABLE carrier_charge_routing IS
    'Self-improving charge routing table. Maps carrier charge codes and descriptions to Cactus charge fields. Unknown charges route to other_surcharges and flag for admin review. Admin maps once — learned forever.';
COMMENT ON COLUMN carrier_charge_routing.charge_classification_code IS
    'UPS: FRT=freight, FSC=fuel, ACC=accessorial, INF=informational(dimension row), MSC=misc';
COMMENT ON COLUMN carrier_charge_routing.charge_category_code IS
    'UPS: SHP=shipment, ADJ=adjustment, RTN=return';
COMMENT ON COLUMN carrier_charge_routing.charge_category_detail_code IS
    'UPS: ISS=issued, SCC=shipping charge correction, RADJ=rate adjustment, ADC=address correction, RTS=return to sender, CADJ=billing adjustment';
COMMENT ON COLUMN carrier_charge_routing.cactus_field IS
    'Target field on invoice_line_items. NULL when is_dimension_row=TRUE.';
COMMENT ON COLUMN carrier_charge_routing.is_skip IS
    'TRUE = ignore this row entirely.';
COMMENT ON COLUMN carrier_charge_routing.is_dimension_row IS
    'TRUE = extract dimensions only, never add Net Amount to carrier_charge. UPS INF rows.';
COMMENT ON COLUMN carrier_charge_routing.is_adjustment IS
    'TRUE = post-audit correction. Net Amount goes to apv_adjustment + apv_adjustment_detail.';


-- ==========================================================
-- SECTION 2: ROW LEVEL SECURITY
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

ALTER TABLE cactus_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cactus_invoices"
    ON cactus_invoices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "org_members_read_own_invoices"
    ON cactus_invoices FOR SELECT
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

ALTER TABLE carrier_invoice_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_carrier_invoice_formats"
    ON carrier_invoice_formats FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE carrier_charge_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_carrier_charge_routing"
    ON carrier_charge_routing FOR ALL USING (auth.role() = 'service_role');

-- ==========================================================
-- SECTION 3: INDEXES
-- ==========================================================

-- organizations
CREATE INDEX idx_organizations_parent
    ON organizations(parent_org_id) WHERE parent_org_id IS NOT NULL;
CREATE INDEX idx_organizations_active
    ON organizations(is_active) WHERE is_active = TRUE;

-- org_users (critical for RLS performance)
CREATE INDEX idx_org_users_user_id ON org_users(user_id);
CREATE INDEX idx_org_users_org_id  ON org_users(org_id);

-- locations
CREATE INDEX idx_locations_org_id ON locations(org_id);
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
CREATE INDEX idx_rate_cards_org_id ON rate_cards(org_id);
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
CREATE INDEX idx_carrier_invoices_org_id    ON carrier_invoices(org_id);
CREATE INDEX idx_carrier_invoices_carrier   ON carrier_invoices(carrier_code);
CREATE INDEX idx_carrier_invoices_status    ON carrier_invoices(status);
CREATE INDEX idx_carrier_invoices_created   ON carrier_invoices(created_at DESC);

-- invoice_line_items
CREATE INDEX idx_invoice_line_items_carrier_invoice
    ON invoice_line_items(carrier_invoice_id);
CREATE INDEX idx_invoice_line_items_org_id
    ON invoice_line_items(org_id);
CREATE INDEX idx_invoice_line_items_tracking
    ON invoice_line_items(tracking_number);
CREATE INDEX idx_invoice_line_items_address_sender_normalized
    ON invoice_line_items(address_sender_normalized);

CREATE INDEX idx_invoice_line_items_address_receiver_zip
    ON invoice_line_items(address_receiver_zip);

CREATE INDEX idx_invoice_line_items_is_dim_billed
    ON invoice_line_items(is_dim_billed)
    WHERE is_dim_billed = TRUE;

CREATE INDEX idx_invoice_line_items_is_residential
    ON invoice_line_items(is_residential)
    WHERE is_residential = TRUE;

CREATE INDEX idx_invoice_line_items_tracking_number_lead
    ON invoice_line_items(tracking_number_lead)
    WHERE tracking_number_lead IS NOT NULL;

CREATE INDEX idx_invoice_line_items_date_shipped
    ON invoice_line_items(date_shipped);

CREATE INDEX idx_invoice_line_items_service_zone
    ON invoice_line_items(service_level, zone);
CREATE INDEX idx_invoice_line_items_billing_status
    ON invoice_line_items(billing_status);
CREATE INDEX idx_invoice_line_items_dispute
    ON invoice_line_items(dispute_flag) WHERE dispute_flag = TRUE;
CREATE INDEX idx_invoice_line_items_match_status
    ON invoice_line_items(match_status);

-- cactus_invoices
CREATE INDEX idx_cactus_invoices_org_id ON cactus_invoices(org_id);
CREATE INDEX idx_cactus_invoices_due
    ON cactus_invoices(due_date) WHERE status = 'UNPAID';
CREATE INDEX idx_cactus_invoices_status ON cactus_invoices(status);

-- cactus_invoice_line_items
CREATE INDEX idx_cactus_invoice_line_items_invoice
    ON cactus_invoice_line_items(cactus_invoice_id);
CREATE INDEX idx_cactus_invoice_line_items_org
    ON cactus_invoice_line_items(org_id);

-- rate_shop_log
CREATE INDEX idx_rate_shop_log_org_id
    ON rate_shop_log(org_id);
CREATE INDEX idx_rate_shop_log_lane
    ON rate_shop_log(postal_origin, postal_destination, carrier_code);
CREATE INDEX idx_rate_shop_log_selected
    ON rate_shop_log(org_id, is_selected);
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

-- carrier_invoice_formats
CREATE INDEX idx_carrier_invoice_formats_lookup
    ON carrier_invoice_formats(carrier_code, format_type, column_position)
    WHERE is_active = TRUE;

-- carrier_charge_routing
CREATE INDEX idx_carrier_charge_routing_lookup
    ON carrier_charge_routing(carrier_code, charge_classification_code, charge_category_detail_code)
    WHERE is_active = TRUE;


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

CREATE TRIGGER trg_carrier_charge_routing_updated_at
    BEFORE UPDATE ON carrier_charge_routing
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();