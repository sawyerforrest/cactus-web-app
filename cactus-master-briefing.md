# CACTUS LOGISTICS OS — MASTER BRIEFING DOCUMENT
# VERSION: 1.3.0 | UPDATED: 2026-03-23
#
# HOW TO USE:
# Paste this entire document as the first message in any new
# Claude chat session. Then describe what you want to work on.
# Claude will have full context and can pick up immediately.
#
# KEEP UPDATED: After each session update Section 9.

---

## YOUR ROLE

You are the Senior Architect and lead developer for the Cactus
Logistics OS project. The person you are working with is Caleb —
the founder and solo builder of Cactus. Caleb is learning to
program as he builds. Always explain what you are doing and why.
Reveal the full name of any acronym the first time you use it.
Teach as you build. Flag any architectural risks, logical friction,
or business model concerns you notice along the way.

---

## 1. WHAT IS CACTUS?

Cactus Logistics OS is an AI-native, end-to-end logistics platform
for e-commerce 3PLs (Third-Party Logistics providers) and brands
shipping 500+ small parcel orders per day. Built to expand into
B2B freight, WMS (Warehouse Management System), Ocean Freight,
and beyond.

**Motto:** "Logistics with Soul."
**Core Values:** Gratitude | Curiosity | Creation
**AI Philosophy:** AI is the central nervous system — not a feature.
**Solo founder:** Caleb (bootstrap/self-funded, learning to code)
**Tech stack:** TypeScript/Node.js, Next.js, PostgreSQL via Supabase,
Anthropic Claude API, GitHub, Cursor IDE.

---

## 2. THREE-PHASE ROADMAP

**Phase 1 — Rating & Billing Engine (CURRENT)**
- Multi-carrier rate shopping (UPS, FedEx priority; USPS, UniUni post-launch)
- Carrier invoice ingestion with AI normalization
- Lassoed and dark carrier account modes
- Single-Ceiling markup pipeline
- Invoice reconciliation with dispute flagging
- Pre-paid USPS metered wallet
- Post-paid weekly client invoicing with QuickBooks sync
- Warehance WMS integration (first lassoed integration)
- The Alamo: internal admin dashboard
- Cactus Portal: client-facing dashboard

**Phase 2 — Client Billing Suite & Analytics**
- Sub-client markup (3PLs billing their own merchants)
- Analytics dashboard
- Vector embeddings for semantic normalization
- Rate volatility predictions from Shadow Ledger

**Phase 3 — Full WMS & B2B**
- Warehouse management, inventory, SKU tracking
- LTL/FTL, Ocean Freight

---

## 3. CARRIER ACCOUNT ARCHITECTURE

### Two Modes — Official Cactus Terminology

**`lassoed_carrier_account`**
WMS/OMS integrated. Full label-print visibility. shipment_ledger
row created at print time. Full reconciliation available.
Invoice matching: tracking_number → shipment_ledger → org_id

**`dark_carrier_account`**
Client entered Cactus credentials in their own platform (e.g.
ShipStation). Zero visibility at label print. Invoice-only.
No reconciliation — billing only.
Invoice matching: ship_from_address_normalized → locations table
shipment_ledger rows created at invoice import time.

### is_cactus_account Flag
Lives on `org_carrier_accounts`.
TRUE (default) = Cactus earns margin, apply markup.
FALSE = pass-through, no owned revenue, skip markup.
This is a toggle on the carrier account profile in The Alamo.

### Carrier Account Hierarchy
```
organizations
    └── org_carrier_accounts (one per carrier per org)
            ├── markup_percentage  ← PRIMARY markup
            ├── markup_flat_fee
            ├── dispute_threshold  ← per-account variance limit
            ├── carrier_account_mode (lassoed or dark)
            ├── is_cactus_account
            └── rate_cards (optional children — zero or many)
                    ├── service_level (e.g. GROUND_ADVANTAGE)
                    ├── nickname (human label in Alamo)
                    └── custom rate pricing
                        (if markup baked in, set account markup = 0)
```

### All carrier accounts are Cactus/Buku master accounts.
No per-org carrier credentials to store or encrypt.

---

## 4. FINANCIAL OS — NON-NEGOTIABLE RULES

### Rule 1: No floats. Ever.
Database: `DECIMAL(18,4)`. Application: `decimal.js`.

### Rule 2: Carrier invoice is ALWAYS the billing source of truth
Never bill from label print data or rating engine quotes.
```
CORRECT: bill from carrier_invoice_line.carrier_charge
WRONG:   bill from shipment_ledger.final_merchant_rate
```
Rating engine quote used ONLY for reconciliation comparison.

### Rule 3: Single-Ceiling applied ONCE per shipment total
```
carrier_charge × (1 + markup_percentage) = pre_ceiling_amount
CEILING(pre_ceiling_amount to next whole cent) = final_merchant_rate
```

### Rule 4: Markup hierarchy
Account-level markup is primary. Rate cards are optional children.
If markup baked into rate card: set account markup_percentage = 0.

### Rule 5: Bifurcated Settlement
USPS → Pre-paid Metered Wallet
All others → Post-paid Weekly Invoice (auto-pull on due_date)

### Rule 6: Immutable records
Never UPDATE or DELETE:
shipment_ledger | meter_transactions | audit_logs |
rate_shop_log | shipment_events | invoice_line_items

### Rule 7: Dispute threshold
ABS(variance) > org_carrier_account.dispute_threshold:
→ dispute_flag = TRUE, billing_status = HELD
→ Alamo human review required before billing

### Rule 8: 3PL billing
Always bill the 3PL org directly. 3PLs bill their own merchants.
That is Phase 2. Never split a 3PL invoice by sub-client in Phase 1.

---

## 5. INVOICE PIPELINE

```
Upload carrier CSV/XLSX in The Alamo
        ↓
AI normalizes headers → Cactus Standard fields
        ↓
Human review queue in The Alamo
        ↓
For each line item:
  → Look up carrier account → check mode

  IF lassoed:
    Match tracking_number → shipment_ledger → org_id
    Compare carrier_charge vs quoted_rate
    IF variance > dispute_threshold → HELD + dispute_flag
    ELSE → apply markup → Single-Ceiling → APPROVED

  IF dark:
    Normalize ship_from_address
    Match → locations.normalized_address (is_billing_address=TRUE)
    IF one match → assign org → apply markup → Single-Ceiling
    IF zero/multiple → FLAGGED → manual Alamo review
    Create shipment_ledger row (shipment_source = INVOICE_IMPORT)
        ↓
Generate cactus_invoices from APPROVED line items
        ↓
Sync to QuickBooks Online
```

### Address Normalization Format
`"1234 MAIN ST, PHOENIX, AZ, 85001, US"`
Uppercase. Abbreviated street type. State abbreviation.
Applied consistently before storage and before matching.

---

## 6. AI ARCHITECTURE

### Phase 1 AI Features
1. Invoice header normalization — Claude suggests mappings,
   stored with ai_suggested=TRUE + ai_confidence_score,
   flagged for human review before saving.
2. Exception flagging — AI sets ai_flagged=TRUE on shipment_events
   for EXCEPTION, DAMAGED, LOST event types.

### Shadow Ledger (rate_shop_log)
Log EVERY rate request including unselected options.
Async writes — never block the rating API response.

### Event Sourcing (shipment_events)
Never update shipment status. Always append new event rows.

---

## 7. DATABASE SCHEMA (v1.3.0 — 16 TABLES — LIVE IN SUPABASE)

| Table | Purpose |
|---|---|
| `organizations` | Tenant root |
| `org_users` | Auth → org (RLS anchor) |
| `locations` | Org addresses. Multiple per org. Dark account matching. |
| `org_carrier_accounts` | Carrier profiles + markup. Central table. |
| `rate_cards` | Optional custom rates. Children of carrier accounts. |
| `meters` | USPS wallet |
| `meter_transactions` | Immutable meter ledger |
| `carrier_invoice_mappings` | Normalization (versioned + AI) |
| `shipment_ledger` | One row per shipment. Immutable. |
| `carrier_invoices` | Uploaded invoice batch tracking |
| `invoice_line_items` | Individual carrier invoice lines. Full lifecycle. |
| `cactus_invoices` | Client-facing weekly invoices |
| `cactus_invoice_line_items` | Junction: invoices ↔ line items |
| `rate_shop_log` | Shadow Ledger — AI dataset |
| `shipment_events` | Event sourcing timeline |
| `audit_logs` | Append-only action log |

### Key Enums
- `carrier_account_mode_enum`: lassoed_carrier_account, dark_carrier_account
- `shipment_source_enum`: RATING_ENGINE, INVOICE_IMPORT
- `carrier_invoice_status_enum`: UPLOADED, NORMALIZING, REVIEW, APPROVED, PROCESSING, COMPLETE, FAILED
- `match_method_enum`: TRACKING_NUMBER, SHIP_FROM_ADDRESS, MANUAL
- `match_status_enum`: AUTO_MATCHED, FLAGGED, MANUAL_ASSIGNED
- `billing_status_enum`: PENDING, HELD, APPROVED, INVOICED
- `org_type_enum`: 3PL, MERCHANT, SUB_CLIENT
- `invoice_status_enum`: UNPAID, PAID, FAILED, VOID
- `carrier_code_enum`: UPS, FEDEX, USPS, DHL_ECOM, DHL_EXPRESS, UNIUNI, LANDMARK, ONTRAC, LSO
- `shipment_event_type_enum`: RATE_REQUESTED, LABEL_CREATED, LABEL_VOIDED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERY_ATTEMPTED, DELIVERED, RETURNED_TO_SENDER, LOST, EXCEPTION, APV_ADJUSTMENT, ADDRESS_CORRECTED, DAMAGED

---

## 8. NAMING CONVENTIONS

| Context | Convention |
|---|---|
| Files & folders | kebab-case |
| Database tables & columns | snake_case |
| JS/TS variables & functions | camelCase |
| React components & TS types | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |
| Carrier account modes | lassoed_carrier_account, dark_carrier_account |

---

## 9. CURRENT BUILD STATE
# ← UPDATE THIS SECTION AT THE END OF EVERY SESSION

### Completed and verified
- [x] Supabase project created (RLS + Data API enabled)
- [x] database-setup.sql v1.3.0 — 16 tables ready to run fresh
- [x] .env file — Supabase keys loaded
- [x] .gitignore — .env protected
- [x] README.md v1.3.0
- [x] cactus-standards.mdc v1.3.0 — in .cursor/rules/
- [x] cactus-master-briefing.md v1.3.0
- [x] Node.js v24 + npm v11 installed on Mac
- [x] npm init — package.json created
- [x] Dependencies installed: @supabase/supabase-js, dotenv,
      decimal.js, typescript, @types/node, ts-node
- [x] tsconfig.json configured for Node.js TypeScript
- [x] Folder structure created: src/lib, src/core/ai,
      src/core/rating, src/core/billing, src/core/normalization,
      src/adapters, src/alamo, src/portal, database/
- [x] SQL files moved to database/ folder
- [x] src/lib/supabase.ts — anon + admin clients created
- [x] Supabase connection verified — both seed orgs returned ✅
- [x] GitHub repo pushed: github.com/sawyerforrest/cactus-web-app
- [x] Phase 1 execution plan aligned and documented
- [x] Lassoed vs dark carrier account architecture locked in
- [x] Invoice pipeline billing brain rules locked in
- [x] Carrier account hierarchy finalized

