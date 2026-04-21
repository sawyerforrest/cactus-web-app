# CACTUS LOGISTICS OS — MASTER BRIEFING DOCUMENT
# VERSION: 1.6.0 | UPDATED: 2026-04-18
#
# HOW TO USE:
# Paste this entire document as the first message in any new
# Claude chat session. Claude will have full context and can
# pick up immediately without re-explaining the project.
#
# KEEP UPDATED: After each session update Section 12.

---

## YOUR ROLE

You are the Senior Architect and lead developer for the Cactus
Logistics OS project. The person you are working with is Sawyer —
the founder and solo builder of Cactus. Sawyer is learning to
program as he builds. Always explain what you are doing and why.
Reveal the full name of any acronym the first time you use it.
Teach as you build. Flag any architectural risks, logical friction,
or business model concerns you notice along the way.

---

## 1. IDENTITY & VISION

**Purpose Statement:**
Rooted in gratitude, curiosity, faith, and creation, Cactus is an
AI-native operating system pioneering e-commerce logistics in the
age of abundance — harmonized data, friendly technology, and
global delivery.

**Motto:** "Logistics with Soul."
**Core Values:** Gratitude | Curiosity | Faith | Creation
**Legal Entity:** Cactus Logistics LLC (Utah — formed March 2026)
**Brand Name:** Cactus
**Future Brand:** Cactus OS (when full WMS vision is realized)
**AI Philosophy:** AI is the central nervous system — not a feature.
**Solo founder:** Sawyer (bootstrap, learning to code)
**Stack:** TypeScript/Node.js, Next.js, PostgreSQL via Supabase,
Anthropic Claude API, GitHub, Cursor IDE.

---

## 2. THREE-PHASE ROADMAP

**Phase 1 — Rating & Billing Engine (CURRENT)**
- Multi-carrier rate shopping (UPS, FedEx priority launch)
- Carrier invoice ingestion with AI normalization
- Lassoed and dark carrier account modes
- Single-Ceiling markup pipeline
- Invoice reconciliation with dispute flagging
- Pre-paid USPS metered wallet
- Post-paid weekly client invoicing with QuickBooks sync
- Warehance WMS integration (first lassoed integration)
- The Alamo: internal admin dashboard
- Cactus Portal: client-facing dashboard

**Phase 2 — Growth Carriers & Analytics**
- USPS, UniUni, GOFO, ShipX, DHL eCommerce, DHL Express
- Sub-client markup (3PLs billing their own merchants)
- Analytics dashboard: trends, cost-per-package, margin health
- Vector embeddings for semantic normalization
- Rate volatility predictions from Shadow Ledger
- PLD/Rate Analysis (PLD Analysis Engine internally) — two-layer sales tool:
    Layer 1: Cactus runs PLD/Rate Analysis to win 3PL clients
    Layer 2: 3PL clients run PLD/Rate Analysis to win merchant clients
    Engine calls live carrier APIs for real-time rating with all surcharges
    Rate cards + hardcoded surcharges used where API not available
      (USPS, UniUni, GOFO, ShipX, DHL eCommerce)
    Powered by Shadow Ledger rate intelligence over time
    Key differentiator vs DiversiFi: built on reconciled invoice data depth

**Phase 3 — Full WMS & B2B Expansion**
- Cactus builds its own WMS — full end-to-end logistics OS
- Warehouse management: aisles, bins, pick/pack, inventory, SKU tracking
- LTL (Less-Than-Truckload) and FTL (Full Truckload) freight
- Ocean freight container event tracking
- Landmark Global, OSM, OnTrac carrier integrations
- Carrier scorecard intelligence by lane and geography

---

## 3. PRODUCT EVOLUTION — MIDDLEWARE → FULL OS

**Phase 1-2: Cactus as Middleware**
WMS platforms (Warehance, etc.) call the Cactus Rating API.
Cactus calls carriers, applies markup, returns marked-up rates.
WMS handles display and selection UI.
Cactus handles billing, invoicing, reconciliation.

**Phase 3: Cactus as Full OS**
Cactus builds its own WMS — complete end-to-end stack ownership.
The Shadow Ledger accumulated during Phase 1-2 makes the
Cactus WMS launch with years of AI intelligence built in.

---

## 4. CARRIER ROADMAP

**Phase 1 — Launch**
- FedEx: Integrator Developer account ✅
  Integrator ID: 70157774 | Billing Account: 210682153
- UPS: Developer portal submitted, pending approval ⏳

**Phase 2 — Growth**
- USPS: Path decision needed (direct vs licensed reseller)
- UniUni: Regional last-mile. No residential/fuel surcharge.
- GOFO (formerly Cirro): Regional gig drivers + USPS national.
  No residential or fuel surcharge.
- ShipX: Regional gig drivers + USPS national.
  Fuel surcharge. No residential surcharge.
- DHL eCommerce: Domestic + international. Sales relationship needed.
  Requires daily manifest job — unique to DHL eCommerce.
- DHL Express: International premium. Sales relationship needed.

**Phase 3 — Scale**
- Landmark Global: International
- OSM: Postal consolidator (USPS final mile)
- OnTrac: Regional

**Last-Mile Carrier Notes (UniUni, GOFO, ShipX):**
These carriers self-filter by ZIP coverage.
No rate returned = not serviceable = excluded from results.
No ZIP code lookup tables needed in Cactus.
Coverage expansions are automatic — no code changes required.

**All carrier contacts came through BukuShip.**
Approach only after leaving BukuShip cleanly.

**carrier_code_enum (v1.4.0):**
UPS | FEDEX | USPS | UNIUNI | GOFO | SHIPX |
DHL_ECOM | DHL_EXPRESS | LANDMARK | ONTRAC | OSM
(LSO removed in v1.4.0)
AMAZON: pending — add when available:
  ALTER TYPE carrier_code_enum ADD VALUE 'AMAZON';

---

## 5. CARRIER ACCOUNT ARCHITECTURE

### Two Modes — Official Cactus Terminology

**`lassoed_carrier_account`**
WMS/OMS integrated. Full label-print visibility. shipment_ledger
row created at print time. Full reconciliation available.
Invoice matching: tracking_number → shipment_ledger → org_id

**`dark_carrier_account`**
Client entered Cactus credentials in their own platform (e.g.
ShipStation). Zero visibility at label print. Invoice-only.
No reconciliation — billing only.
Invoice matching: address_sender_normalized → locations table
shipment_ledger rows created at invoice import time.

### is_cactus_account Flag
TRUE (default) = Cactus earns margin, apply markup.
FALSE = pass-through, no owned revenue, skip markup.
Lives on org_carrier_accounts — not on invoices.

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

## 6. FINANCIAL OS — NON-NEGOTIABLE RULES

### Rule 1: No floats. Ever.
Database: `DECIMAL(18,4)`. Application: `decimal.js`.

### Rule 2: Carrier invoice is ALWAYS the billing source of truth
Never bill from label print data or rating engine quotes.
```
CORRECT: bill from carrier_invoice_line.carrier_charge
WRONG:   bill from shipment_ledger.final_billed_rate
```
Rating engine quote used ONLY for reconciliation comparison.

### Rule 3: Markup applied per markup_type — Single-Ceiling for percentage

Two markup types are supported:

PERCENTAGE markup: applied to each charge component, summed, then
Single-Ceiling on total. Itemized columns on client CSV show marked-up
values. Sum equals final_billed_rate (within fractional cent rounding
tolerance, footnoted on CSV).

  base × (1 + markup) = base_marked
  fuel × (1 + markup) = fuel_marked
  residential × (1 + markup) = residential_marked
  ... etc per component
  SUM(all marked components) = pre_ceiling_total
  CEILING(pre_ceiling_total to next cent) = final_billed_rate

FLAT markup: applied ONCE to base_charge only. Surcharges pass through
raw. NO separate markup column on client invoice — flat fee folds into
base_charge_billed for display.

  base_charge_billed = raw base + flat fee
  surcharge_billed = surcharge (unchanged)
  total = raw carrier total + flat fee = final_billed_rate

Why this works for transparency:
- Dark accounts know there is a Cactus markup (disclosed at onboarding)
- Lassoed accounts saw the marked-up rate at label purchase via rate-shop
- Total amount on invoice matches what client saw at label purchase
  (minor variance for accessorials added post-print)

### Rule 4: Markup hierarchy + source tracking
Account-level markup is primary. Rate cards are optional children that
replace the BASE rate only — surcharges pass through raw.

If using rate card with markup baked in: set account markup to 0.

Stored on every invoice_line_items row at Stage 5 Billing Calc:
  markup_type_applied   ('percentage' | 'flat')
  markup_value_applied  (e.g. 0.150000 for 15%, or 1.000000 for $1.00)
  markup_source         ('carrier_account' | 'rate_card')

markup_source describes where the BASE RATE came from (not where the
markup percentage came from). Enables analytics like rate-carded vs
API-rated margin comparison.

Rate card use case examples: USPS, UniUni, GOFO (no surcharges).
DHL with 15% rate card markup + 0% account markup so fuel surcharge
passes through raw.

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

### Rule 9: Storage approach for billed values
Store raw carrier values + markup context per line item. Compute
per-charge billed values at READ time (CSV / PDF / Portal display)
from raw values × markup context.

final_billed_rate is materialized (stored) at Stage 5 because it is
the authoritative invoice total — never recomputed at read time.

Per-charge billed values are computed at display time. Bug fixes in
display logic flow through to all historical invoices without
violating immutability of invoice_line_items.

Margin = SUM(final_billed_rate - carrier_charge) GROUP BY org_id, week.
No parallel raw-cost table needed.

---

## 7. RATING ENGINE ARCHITECTURE

### WMS Integration Flow
```
WMS sends rate request → Cactus Rating API
  (org_id, origin, destination, weight, dimensions)
Cactus looks up active carrier accounts for this org
Cactus calls all carrier APIs simultaneously
Carriers self-filter by ZIP coverage
  (no rate = not serviceable = excluded automatically)
Cactus applies markup + Single-Ceiling to each rate
Cactus logs all rates to rate_shop_log (async)
Cactus returns ALL rated options to WMS
WMS displays and handles rate selection UI
User selects → WMS calls Cactus Label Purchase API
Cactus purchases label → returns tracking number
WMS prints label
```

### Rate Sorting
Default: `final_billed_rate ASC` (cheapest first)
Optional toggle: `transit_days ASC` then `final_billed_rate ASC`
Never: carrier-weighted or manually promoted results

Residential and fuel surcharges already included in carrier
API responses. Cheapest first IS the smartest sort.

### Carrier API Error Handling
If a carrier API returns an error (not just no rate):
→ Silently exclude from results
→ Log to audit_logs
→ Never fail the entire rate shopping response

---

## 8. INVOICE PIPELINE — 8 STAGES (v1.6.0)

STAGE 1: INGESTION
  Admin uploads carrier invoice in The Alamo
  Selects carrier + format (DETAIL or SUMMARY)
  File stored in Supabase Storage
  carrier_invoices row created (status: UPLOADED)

STAGE 2: PARSING / NORMALIZATION
  Reads file from Supabase Storage
  Applies carrier-specific column template (carrier_invoice_formats)
  Groups rows by tracking number
  Routes charges via carrier_charge_routing table
  INF rows: extract dims only, never billed
  ADJ rows: accumulate into apv_adjustment + detail JSONB
  Splits AG (entered dims) and HR (carrier dims) into L/W/H
  service_level read from primary FRT row's Charge Description
    (NOT from Original Service Description which is always empty)
  is_adjustment_only flag set when only adjustment FRT rows exist
  date_invoiced parsed from Invoice Date (handles MM/DD/YY)
  date_shipped from Transaction Date (default; lassoed overwritten in Stage 3)
  Builds address_sender_normalized for dark matching
  Inserts invoice_line_items rows with carrier_charge populated,
    final_billed_rate NULL, billing_status PENDING
  status: COMPLETE

STAGE 3: MATCHING (UNIVERSAL — separated from Billing Calc in v1.6.0)
  Lassoed: tracking_number → shipment_ledger → org_id
    Pull date_shipped from shipment_events.LABEL_CREATED
    Pull date_delivered from shipment_events.DELIVERED (if present)
    Calculate variance = carrier_charge - raw_carrier_cost
    ABS(variance) > dispute_threshold → HELD + dispute_flag
    is_adjustment_only=TRUE → skip variance calc
    ELSE → AUTO_MATCHED
  Dark: address_sender_normalized → locations → org_id
    date_shipped stays as Transaction Date proxy (with caveat)
    date_delivered stays NULL until tracking webhooks (Phase 2+)
    Exactly one match → AUTO_MATCHED + match_location_id stored
    Zero/multiple → FLAGGED → HELD
  Sets match_status, billing_status stays PENDING for matched, HELD for flagged
  No markup applied at this stage

STAGE 4: DISPUTE RESOLUTION
  Admin reviews /invoices/[id]/disputes
  Manually assigns org to FLAGGED items
  Approves or overrides variance disputes
  dispute_notes per line item
  Resolved → ready for Billing Calc (still no markup applied)

STAGE 5: BILLING CALCULATION (NEW SEPARATE STAGE in v1.6.0)
  Runs on AUTO_MATCHED + resolved-dispute lines
  Loads org_carrier_account for each line
    Determines markup_type, markup_value, markup_source
    IF use_rate_card AND active rate card → base = rate_card.base_rate, source = 'rate_card'
    ELSE → base = raw carrier base, source = 'carrier_account'
  Applies markup per markup_type rules (see Section 6 Rule 3)
  Writes final_billed_rate (authoritative total)
  Writes markup_type_applied, markup_value_applied, markup_source
  Sets billing_status = APPROVED
  IMMUTABLE — invoice_line_items row sealed at this point

STAGE 6: INVOICE GENERATION
  Groups APPROVED lines by org_id
  One cactus_invoices row per org per billing period
  cactus_invoice_line_items junction rows created
  billing_status → INVOICED
  due_date = today + organizations.terms_days
  Generates client-facing 85-column detail CSV
  Generates one-page PDF summary

STAGE 7: DELIVERY TO CACTUS PORTAL
  cactus_invoices visible in Cactus Portal
  Display rules per carrier_account_mode:
    lassoed lines → final_billed_rate only
    dark lines → carrier_charge + final_billed_rate
  PDF download: one-page summary
    Total due, total shipments
    By carrier: shipments + amount
    By origin location: shipments + amount
  CSV download: 85-column detail format
  Payment status: UNPAID → PAID

STAGE 8: PAYMENT
  USPS → pre-paid meter already settled
  All others → auto-pull on due_date via Stripe/Fortis
  invoice_status → PAID
  audit_logs entry

### Why Stage 3 (Match) is separated from Stage 5 (Billing Calc) in v1.6.0
1. Auditability — distinct match timestamp vs billing timestamp
2. Reprocessing — fix billing logic without re-running matching
3. Dispute clarity — see "what would this cost at current markup" before resolving
4. Future flexibility — sub-client billing, special pricing, plug into Stage 5 cleanly

### Address Normalization Format
`"1234 MAIN ST, PHOENIX, AZ, 85001, US"`
Uppercase. Abbreviated street type. State abbreviation.
Applied consistently before storage and before matching.

---

## 9. AI ARCHITECTURE

### FedEx Data Usage Restriction
Per FedEx Integrator Agreement (Section 6k):
FedEx End User Data may NOT be used to determine prices,
estimate market prices, or develop predictive pricing analyses.
Shadow Ledger stores FedEx rate data for reconciliation ONLY.
AI price prediction features must use Cactus margin and
client behavior data — not raw FedEx rate data.

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

## 10. DATABASE SCHEMA (v1.6.0 — 19 TABLES — LIVE IN SUPABASE)

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
| `carrier_invoice_formats` | Column templates for headerless carrier invoice files |
| `carrier_charge_routing` | Self-improving charge routing table |
| `notification_preferences` | User email notification settings per org |

### Key Enums
- `carrier_account_mode_enum`: lassoed_carrier_account, dark_carrier_account
- `shipment_source_enum`: RATING_ENGINE, INVOICE_IMPORT
- `carrier_invoice_status_enum`: UPLOADED, NORMALIZING, REVIEW, APPROVED, PROCESSING, COMPLETE, FAILED
- `match_method_enum`: TRACKING_NUMBER, SHIP_FROM_ADDRESS, MANUAL
- `match_status_enum`: AUTO_MATCHED, FLAGGED, MANUAL_ASSIGNED
- `billing_status_enum`: PENDING, HELD, APPROVED, INVOICED
- `org_type_enum`: 3PL, MERCHANT, SUB_CLIENT
- `invoice_status_enum`: UNPAID, PULLED, PAID, FAILED, VOID, OVERDUE
- `carrier_code_enum`: UPS, FEDEX, USPS, UNIUNI, GOFO, SHIPX, DHL_ECOM, DHL_EXPRESS, LANDMARK, ONTRAC, OSM
- `shipment_event_type_enum`: RATE_REQUESTED, LABEL_CREATED, LABEL_VOIDED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERY_ATTEMPTED, DELIVERED, RETURNED_TO_SENDER, LOST, EXCEPTION, APV_ADJUSTMENT, ADDRESS_CORRECTED, DAMAGED
- `portal_role_enum`: ADMIN, FINANCE, STANDARD
- `notification_type_enum`: METER_RELOAD, INVOICE_READY, TRACKING_STATUS_ALERTS, PAYMENT_FAILED

### v1.6.0 Schema Changes (applied 2026-04-18)

invoice_line_items:
  RENAMED  final_merchant_rate → final_billed_rate
  ADDED    markup_type_applied   TEXT
  ADDED    markup_value_applied  DECIMAL(10,6)
  ADDED    markup_source         TEXT
  ADDED    is_adjustment_only    BOOLEAN NOT NULL DEFAULT FALSE
  DROPPED  markup_percentage
  DROPPED  markup_flat_fee

shipment_ledger:
  RENAMED  final_merchant_rate → final_billed_rate
  (markup_percentage and markup_flat_fee NOT YET migrated —
   Session B will unify the markup context model across both tables)

rate_shop_log:
  RENAMED  final_merchant_rate → final_billed_rate

cactus_invoice_line_items:
  RENAMED  final_merchant_rate → final_billed_rate

Backfill: 952 existing rows backfilled with markup context derived
from org_carrier_accounts at backfill time. 950 rows on test invoice
904d933a backfilled with service_level, date_shipped, date_invoiced
from raw_line_data JSONB. 8 adjustment-only lines flagged.

Migration files (in repo):
  database/migrations/v1.6.0-pipeline-foundation.sql
  database/migrations/v1.6.0-backfill-existing-rows.sql

NOTE: org_carrier_accounts STILL HAS markup_percentage and
markup_flat_fee columns — these are the SOURCE OF TRUTH for carrier
account markup configuration (set by admins in the Alamo). Only the
markup APPLIED on invoice_line_items moved to the new context columns.

### v1.6.1 Schema Changes (applied 2026-04-20)

shipment_ledger:
  ADDED    markup_type_applied   TEXT
  ADDED    markup_value_applied  DECIMAL(10,6)
  ADDED    markup_source         TEXT
  DROPPED  markup_percentage
  DROPPED  markup_flat_fee

CHECK constraints added:
  shipment_ledger_markup_type_check (allows NULL or 'percentage'/'flat')
  shipment_ledger_markup_source_check (allows NULL or 'carrier_account'/'rate_card')

Backfill: 953 existing rows backfilled with markup context derived
from legacy markup_percentage/markup_flat_fee. Breakdown:
  - 940 rows at markup_value_applied = 0.150000 (Cactus 3PL HQ)
  - 13 rows at markup_value_applied = 0.180000 (older test org)
All 953 rows: markup_type_applied = 'percentage', markup_source = 'carrier_account'.

Migration file (in repo):
  database/migrations/v1.6.1-shipment-ledger-markup-unification.sql

Migration approach: ADD nullable columns → BACKFILL from legacy →
ADD CHECK constraints → DROP legacy columns. Honors Rule 6 (immutable
records) — historical markup values preserved through the schema change
even though the test data has no real audit value yet. Practiced as
discipline for production-data migrations later.

shipment_ledger and invoice_line_items now use the same markup
context model — quote-time and bill-time write the same shape.

Pineridge Direct test seed (in repo):
  database/seeds/v1.6.1-pineridge-flat-markup-seed.sql
  - 15 invoice_line_items, $333.27 carrier_charge total, $354.27 final
  - flat $1.50 markup on 14 normal rows
  - row 14 is adjustment-only (no flat fee per DN-2)
  - cactus_invoice id: 11111111-4000-0000-0000-000000000001

---

## 11. NAMING CONVENTIONS

| Context | Convention |
|---|---|
| Files & folders | kebab-case |
| Database tables & columns | snake_case |
| JS/TS variables & functions | camelCase |
| React components & TS types | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |
| Carrier account modes | lassoed_carrier_account, dark_carrier_account |

---

## 12. CURRENT BUILD STATE
# ← UPDATE THIS SECTION AT THE END OF EVERY SESSION

### Completed and verified
- [x] Session B (2026-04-20): Pipeline restructure — Match/Billing Calc
      split with idempotency guards, shipment_ledger markup unification
      (v1.6.1), shipment_events date enrichment, Pineridge Direct
      flat-markup test data (15 rows, $354.27 total), 85-column client
      CSV generator, polish items (service+date columns, multi-cactus
      breadcrumb, service truncation tooltip)
- [x] Session B.1 (2026-04-20): Migration backfill (preserved 953
      historical shipment_ledger rows from Session A — honors Rule 6
      immutability), DN-2 policy implementation (flat markup skipped on
      adjustment-only lines), Pineridge seed regenerated for DN-2
      (row 14 final_billed_rate $5.00 → $3.50, total $355.77 → $354.27),
      audit_logs schema fix (action → action_type, details → metadata
      across 5 INSERT call sites + 1 SELECT site that read the wrong
      column for the CSV "Matched At" field). Discovered audit_logs
      had silently failed since codebase scaffolding — see DN log entry.
- [x] Cactus Logistics LLC formed in Utah
- [x] EIN pending (Monday 8-9am MT)
- [x] FedEx Integrator Developer account (ID: 70157774)
- [x] FedEx billing account created (210682153)
- [x] FedEx API documentation suite — complete (7 APIs)
- [x] UPS Developer Portal submitted — pending approval
- [x] docs/ folder organized inside cactus-web-app
- [x] database-setup.sql v1.4.0 — carrier_code_enum updated
- [x] seed-data.sql v1.4.0
- [x] verify-data.sql v1.4.0 — 10 checks
- [x] cactus-standards.mdc v1.4.0 — in .cursor/rules/
- [x] README.md v1.4.0
- [x] cactus-master-briefing.md v1.4.0
- [x] Node.js v24 + npm v11 installed on Mac
- [x] package.json initialized
- [x] Dependencies: @supabase/supabase-js, dotenv, decimal.js,
      typescript, @types/node, ts-node
- [x] tsconfig.json configured for Node.js TypeScript
- [x] Folder structure: src/lib, src/core/ai, src/core/rating,
      src/core/billing, src/core/normalization, src/adapters,
      src/alamo, src/portal, database/, docs/
- [x] src/lib/supabase.ts — anon + admin Supabase clients
- [x] Supabase connection verified from code
- [x] GitHub: github.com/sawyerforrest/cactus-web-app
- [x] Purpose statement written
- [x] Carrier roadmap v1.4.0 finalized
- [x] Rating engine WMS architecture confirmed
- [x] Product evolution (middleware → full OS) confirmed
- [x] Supabase reset — database-setup.sql v1.4.3 live and verified
- [x] seed-data.sql + verify-data.sql — all 10 checks passing
- [x] All v1.4.0 files pushed to GitHub
- [x] Stage 2: The Alamo shell complete
      - Next.js 16.2.1 scaffolded in src/alamo/
      - proxy.ts — route protection (Next.js 16 renamed middleware)
      - Export function must be named "proxy" not "middleware"
      - Browser client: src/alamo/lib/supabase.ts
      - Server client: src/alamo/lib/supabase-server.ts (separate file required)
      - Login page — dark UI, Supabase Auth email/password
      - Dashboard page — post-login landing with seed data stats
      - Smart redirects: / → /dashboard, unauth → /login, login+auth → /dashboard
      - .env.local — Supabase keys for Next.js frontend
      - sawyer@cactus-logistics.com admin user created in Supabase Auth
- [x] Stage 3: Org + carrier management — COMPLETE
      - Dashboard rebuilt in Cactus design system
      - Geist font + CSS tokens (globals.css)
      - Shared Sidebar component (components/Sidebar.tsx)
      - Organizations list (/orgs) — live Supabase data
      - Add org form (/orgs/new) — server action
      - Org detail page (/orgs/[id]) — carrier accounts + locations
      - Add carrier account form (/orgs/[id]/carriers/new)
      - Add location form (/orgs/[id]/locations/new)
      - Carrier account detail (/orgs/[id]/carriers/[carrierId])
      - Carrier Accounts sidebar (/carriers, /carriers/[carrier])
      - Rate Cards sidebar (/rate-cards, /rate-cards/[carrier], /rate-cards/[carrier]/[service_level])
      - Computed rate card active state (use_rate_card + effective_date + deprecated_date)
      - Design system v1.0 locked in cactus-standards.mdc
      - Markup validation — server-side 0-100% enforcement
      - use_rate_card column added to org_carrier_accounts
      - is_active removed from rate_cards (now computed)
      - RLS grants fixed — service_role has ALL on ALL tables
      - admin client (createAdminSupabaseClient) for all Alamo reads + writes
- [x] Stage 4: Invoice Pipeline — pages complete
      - /invoices list page — live, reads carrier_invoices table
      - /invoices/upload — live, creates carrier_invoices row on submit
      - /invoices/[id] detail page — live, reads line items from Supabase
      - Schema migration v1.4.1 — weight + weight_unit added to invoice_line_items
      - database-setup.sql updated to v1.4.1
      - UPS invoice summary format analyzed — 32 headers confirmed
- [x] Stage 4: AI normalization engine — complete
      - Supabase Storage bucket: carrier-invoices (private)
      - carrier_invoices: file_path + raw_headers columns added
      - Upload page: parses CSV headers, uploads file to storage,
        stores raw_headers as JSONB, redirects to review page
      - Claude API integration: maps raw headers → Cactus standard
        fields, stores in carrier_invoice_mappings (ai_suggested=TRUE)
      - Review page /invoices/[id]/review: shows all 32 UPS headers,
        Claude mapped 22/32 at 99% confidence, 10 correctly skipped
      - ANTHROPIC_API_KEY added to .env.local
      - UPS summary invoice tested end-to-end successfully
- [x] Stage 4: UPS Detail invoice parser — complete
      - carrier_invoice_formats table — 250 UPS detail column positions seeded
      - carrier_charge_routing table — 42 UPS charge routing rules seeded
      - carrier_invoices: added invoice_format, has_unmapped_charges,
        unmapped_charge_types columns (v1.4.8)
      - Upload page: format selector added (DETAIL vs SUMMARY)
      - /invoices/[id]/parse page built and working
      - Parser logic:
          Reads file from Supabase Storage
          Applies carrier_invoice_formats column template
          Groups rows by tracking number
          Routes charges via carrier_charge_routing table
          INF rows: extract dims only, never add to carrier_charge
          ADJ rows: accumulate into apv_adjustment + detail JSONB
          Unknown charges: other_surcharges + flag has_unmapped_charges
          Splits AG (entered dims) and HR (carrier dims) into L/W/H
          Builds address_sender_normalized for dark matching
          Batch inserts invoice_line_items (100 per batch)
      - Tested on real anonymized UPS detail invoice:
          950 shipments parsed from 4,175 rows
          $16,482.47 total carrier amount
          All charge types recognized and routed
          Carrier dims correctly extracted (HR column)
      - next.config.ts: serverActions bodySizeLimit set to 10mb
      - GRANT ALL on carrier_invoice_formats, carrier_charge_routing,
        invoice_line_items to service_role (RLS fix)
- [x] Stage 4: Matching engine — complete
      - match.ts server action at src/alamo/app/invoices/[id]/actions/match.ts
      - Per-line-item architecture: org determined per line, not per invoice
      - Lassoed path: tracking_number → shipment_ledger → org_id
      - Dark path: address_sender_normalized → locations → org_id
      - Carrier account lookup: org_id + carrier_code + is_active + is_cactus_account = TRUE
      - Single-Ceiling billing calc applied on all AUTO_MATCHED lines
      - Variance check: carrier_charge - raw_carrier_cost vs dispute_threshold
      - HELD lines flagged with dispute_notes for human review
      - carrier_invoices updated: matched_line_items, flagged_line_items, status
      - audit_logs entry written on every run
      - Tested on real anonymized UPS detail invoice: 950 shipments
- [x] Stage 4: MatchButton client component — complete
      - src/alamo/app/invoices/[id]/MatchButton.tsx
      - Appears only when invoice.status === 'COMPLETE'
      - Shows result summary after engine runs
      - Calls runMatchingEngine() server action directly
- [x] Stage 4: Dispute resolution — complete
      - resolve.ts server action at src/alamo/app/invoices/[id]/actions/resolve.ts
      - Resolves HELD line items by manually assigning org
      - Looks up carrier account using same is_cactus_account filter
      - Applies Single-Ceiling billing calc on resolution
      - Creates shipment_ledger row (shipment_source = INVOICE_IMPORT)
      - Recalculates carrier_invoice matched/flagged counts from DB
      - audit_logs entry written on every resolution
      - Disputes page at src/alamo/app/invoices/[id]/disputes/page.tsx
      - ResolveGroup.tsx client component — groups items by dispute_notes
      - Bulk resolution: admin selects org once, approves entire group
      - Tested: 11 held items resolved, invoice moved to APPROVED
- [x] Stage 4: Full invoice pipeline tested end-to-end
      - Real anonymized UPS detail invoice: 950 shipments, $16,482.47
      - Parse → Match → Dispute Resolution → APPROVED
      - All 950 line items matched to Cactus 3PL Headquarters
      - 15% markup applied via Single-Ceiling on all lines
      - Billed amounts visible in invoice detail page
- [x] UI — Login page redesign complete
      - Real Cactus SVG logo at public/cactus-logo.svg
      - White sky + desert dunes SVG background
      - Floating card with drop shadow
      - "—— THE ALAMO ——" flanking rule header in forest green bold
      - Running stallion button icon at public/stallion.png (white)
      - "Logistics with Soul." footer in white/faded
      - CactusLogo shared component at components/CactusLogo.tsx
- [x] UI — Sidebar redesign complete
      - Real Cactus logo left-aligned at public/cactus-logo.svg
      - THE ALAMO subtitle in forest green below logo
      - Three brown stallion icons next to THE ALAMO (public/stallion_brown.png)
      - Left border active state (2px forest green) replacing dot indicators
      - Active state uses pathname.startsWith() — PENDING FIX next session
        (child pages do not currently keep parent nav item highlighted)
      - Fixed position: position fixed, width 200, height 100vh, zIndex 10
      - All pages updated to marginLeft: 200 replacing grid layout
      - Sign out button locks to bottom regardless of page scroll length
      - Logout: supabase.auth.signOut() → router.push('/login')
- [x] UI — Typography updates
      - JetBrains Mono added via Google Fonts import in globals.css
      - --font-mono updated to prefer JetBrains Mono in globals.css
      - monospace removed from filenames and page headings
      - monospace kept on tracking numbers only via var(--font-mono)
- [x] Cowork setup — complete
      - Claude Desktop installed and Cowork tab active
      - Global instructions set with Cactus project context
      - Cactus Logistics OS project created in Cowork
      - Pointed at ~/Documents/Developer Projects/cactus_dev/cactus-web-app/
      - Will be used for: briefing updates, codebase audits,
        cross-file consistency checks, documentation generation
- [x] Schema migration v1.4.9
      - invoice_line_items: added match_location_id
        UUID FK to locations(id) ON DELETE SET NULL
        Used for invoice summary breakdown by origin location
        and Cactus Portal location filtering
      - Decision: no nickname column on locations —
        locations.name already serves this purpose
        Convention: use short descriptive names e.g. "Phoenix WH"
- [x] Schema migration v1.5.0 — complete
      - portal_role_enum: ADMIN, FINANCE, STANDARD
      - org_users.role: TEXT → portal_role_enum, default STANDARD
      - notification_type_enum: 4 types added
      - notification_preferences table (Table 19)
      - Auto-seed trigger on org_users insert:
          ADMIN + FINANCE → all notifications ON by default
          STANDARD → all notifications OFF by default
      - Users can toggle individually in Cactus Portal
      - Trigger has exception handler — never blocks user creation
      - Tested and verified in Supabase
- [x] Email notification architecture — designed and locked
      Three notification types:
        METER_RELOAD: auto-reload fired, sent to ADMIN + FINANCE
        INVOICE_READY: new cactus_invoice generated, HTML summary
          in email body + portal link to download PDF and CSV
          (no attachments — better deliverability)
        TRACKING_LABEL_STALE: shipment stuck in LABEL_CREATED
          beyond threshold (default 3 business days, configurable)
        PAYMENT_FAILED: auto-pull failed on invoice due date
      Email provider: Resend (native Next.js SDK)
      Templates: React Email components, one per type
      User roles confirmed:
        ADMIN: full access, all notifications ON by default
        FINANCE: full access, all notifications ON by default
        STANDARD: all but sub-client billing, all notifications OFF
      Notification preferences UI in Cactus Portal:
        Toggle on/off per type per user
        Default seeded by role at user creation
- [x] Schema migrations v1.5.1 + v1.5.2 — complete
      v1.5.1:
        organizations: added tracking_alert_threshold_days
          INT NOT NULL DEFAULT 3
          Configurable per org in Cactus Portal settings
        shipment_events: added two performance indexes
          idx_shipment_events_type_created (event_type, created_at DESC)
          idx_shipment_events_ledger_created (shipment_ledger_id, created_at DESC)
          WHY: protect daily alert job query performance at scale
      v1.5.2:
        notification_type_enum: TRACKING_LABEL_STALE renamed to
          TRACKING_STATUS_ALERTS — expanded scope covers all
          tracking anomalies not just stale labels
- [x] Tracking alert architecture — locked
      Single TRACKING_STATUS_ALERTS notification covers:
        NO_MOVEMENT: LABEL_CREATED > threshold days with no scan
        STALE_IN_TRANSIT: IN_TRANSIT/PICKED_UP > threshold days
        DAMAGED: shipment_events.event_type = DAMAGED
        UNDELIVERABLE: DELIVERY_ATTEMPTED with no DELIVERED follow-up
        RETURNED_TO_SENDER: shipment_events.event_type = RETURNED_TO_SENDER
      Daily digest fires at 7:00am
      Scans previous 14 days of shipment data
      Email shows sum totals per category — no individual tracking numbers
      Client clicks portal link to see full filtered list
      Threshold: organizations.tracking_alert_threshold_days (default 3)
      Scale plan:
        Phase 1 (now): query shipment_events directly with indexes
        Phase 2 (1,000+ orgs): add shipment_alert_cache table
        Phase 3 (10,000+ labels/day): read replica + staggered timing
- [x] Business formation progress
      - Mercury business bank account — applied
      - Chase Ink Preferred credit card — applied
      - Utah DBA "Cactus" — filed with state
      - Utah taxpayer account — opened on tap.tax.utah.gov
      - EIN received (previously pending)

- [x] cactus-logistics.com marketing website — complete and live
      - Single-file HTML site deployed on Vercel (Hobby plan)
      - GitHub repo: github.com/sawyerforrest/cactus-marketing (separate from cactus-web-app)
      - Domain: cactus-logistics.com (DNS via Squarespace → Vercel)
        A record: @ → 76.76.21.21
        CNAME: www → cname.vercel-dns.com
      - Stack: Pure HTML/CSS/JS, self-contained single file, no framework
      - Fonts: Cormorant Garamond (display serif) + Geist (body sans)
      - Design: matches Cactus brand system (Forest, Amber, Sand, Bloom)
      - Contact form: Formspree — YOUR_FORM_ID placeholder must be configured
      - To deploy updates: edit index.html → git push → Vercel auto-deploys in ~30s
      - Favicon: cactus icon extracted from logo SVG, embedded as data URI
      - Carrier marquee: 9 carriers scrolling left to right (UPS, FedEx, DHL, USPS,
        GOFO, UniUni, OSM Worldwide, Landmark Global, OnTrac)
      - Core values in footer: Gratitude → Curiosity → Faith → Creation

- [x] Stage 5: Weekly billing engine — complete
      - generate.ts server action at src/alamo/app/invoices/actions/generate.ts
      - Sweeps ALL APPROVED invoice_line_items system-wide (not per carrier invoice)
      - Groups by org_id — one cactus_invoices row per org per billing run
      - total_amount = SUM(final_billed_rate) via decimal.js (no floats)
      - billing_period_start/end = MIN/MAX(date_shipped)
      - due_date = today + organizations.terms_days
      - Creates cactus_invoice_line_items junction rows
      - Updates invoice_line_items.billing_status → INVOICED
      - Error isolation per org — one failure does not block others
      - Batched in chunks of 100 rows — fixes PostgREST URL length limit
        (.in() with 950 UUIDs = ~34KB URL, exceeds PostgREST limit)
      - Billing lock: button disables when no APPROVED lines remain
      - Single audit_logs entry per run with full details
      - Orphaned invoice cleanup: delete cactus_invoices row cascades
        to cactus_invoice_line_items via ON DELETE CASCADE
      - Tested: 939 line items, $18,468.42, Cactus 3PL Headquarters

- [x] Stage 5: GenerateBillingButton.tsx — complete
      - src/alamo/app/invoices/GenerateBillingButton.tsx
      - Only renders when hasApproved = true
      - Disabled + "Running..." during execution (prevents double-click)
      - Result card: green (success), amber (partial), bloom (errors), neutral (nothing to bill)
      - Per-org breakdown with line item count and amount

- [x] Stage 5: InvoiceFilters.tsx — complete
      - src/alamo/app/invoices/InvoiceFilters.tsx
      - Search by invoice_file_name
      - Filter: carrier_code (all enum values)
      - Filter: status (all carrier_invoice_status_enum values)
      - Filter: date range FROM/TO on created_at with Alamo label style
      - Export CSV of filtered invoice list
      - All client-side state, no page reloads

- [x] Stage 5: Invoices list page updated
      - GenerateBillingButton rendered above table
      - InvoiceFilters rendered above table
      - hasApproved check uses .select('id').limit(1) — NOT head:true
        (head:true with admin client silently returns null count)
      - Parallel fetch of invoices + approved count

- [x] Stage 5: PDF summary generator — complete
      - FILE: src/alamo/app/invoices/[id]/actions/pdf.ts
      - API route: src/alamo/app/api/invoices/[id]/pdf/route.ts
      - Client button: src/alamo/app/invoices/[id]/DownloadPDFButton.tsx
      - Renders on invoice detail page when a cactus_invoice exists
      - pdfkit used for generation (serverExternalPackages: ['pdfkit'] in next.config.ts)
      - Logo: SVG converted to PNG via sharp, stored at public/cactus-logo-pdf.png
      - LAYOUT constants object at top of file — all geometry in one place
      - Header: logo + INVOICE wordmark | BILLED TO | FROM (Cactus address) | invoice meta
      - Cactus address: 1956 N 1450 E, Provo, Utah 84604 | (801) 669-1157 | billing@cactus-logistics.com
      - Invoice meta: INVOICE NO (first 8 chars), INVOICE PERIOD (start/end collapsed if same date), DUE DATE (forest green bold)
      - Summary by carrier: shipments + amount per carrier_code
      - Summary by origin location: capped at 12 rows, "+ N more — see CSV" overflow line
      - Display rules enforced: lassoed = final_billed_rate only, dark = carrier_charge + final_billed_rate
      - Total Due row: total shipments count left, total amount right in forest green 18pt
      - Payment instruction: "Payment will be automatically collected on the due date via your payment method on file."
      - Values footer: Gratitude · Curiosity · Faith · Creation (middle dot separator — → arrow breaks pdfkit font encoding)
      - Footer: Cactus Logistics LLC | cactus-logistics.com | Generated [date]
      - Dynamic row height compression when many locations — min 12pt floor
      - autoFirstPage: false to prevent pdfkit auto-pagination
      - Footer pinned to absolute Y position — never flows off page

- [x] Alamo sidebar icons — complete
      - lucide-react installed in src/alamo/package.json
      - Icons added to all 10 nav items: LayoutDashboard, Building2, ArrowLeftRight, Tag, FileText, Flag, Gauge, BarChart2, ScrollText, LogOut
      - 16px size, inherits active/inactive color from existing nav styles
      - Section group labels (WORKSPACE, BILLING, TOOLS) intentionally left without icons
      - Sign Out inline SVG replaced with Lucide LogOut icon
      - "—— Alamo ——" divider below logo replaces stallion horse icons

- [x] Stage 5 Step 8: /billing section split from carrier invoices — complete (commit 5ab47ff merged 2026-04-17)
      - New "Client Invoices" sidebar nav at /billing
      - "Carrier Invoices" sidebar nav renamed from "Invoices" at /invoices
      - Billing list page (/billing) with org/date/status filters
      - Billing detail page (/billing/[id]) with PDF + CSV download buttons
      - PDF generator moved from /invoices/[id]/actions/pdf.ts to /billing/[id]/actions/pdf.ts
      - CSV generator created at /billing/[id]/actions/csv.ts (current 9-col version)
      - API routes at /api/billing/[id]/pdf and /api/billing/[id]/csv
      - Verified: 950 line items render on /billing/[id] for Cactus 3PL HQ
      - PENDING: "Billed in {org} — week of {date} →" link in carrier invoice
        breadcrumb (specced but not implemented in that session, deferred to Session B)

- [x] Schema migration v1.6.0 — Pipeline Foundation — complete (commit 6e72310 merged 2026-04-18)
      Renamed final_merchant_rate → final_billed_rate (4 tables: invoice_line_items,
        shipment_ledger, rate_shop_log, cactus_invoice_line_items)
      Added to invoice_line_items: markup_type_applied, markup_value_applied,
        markup_source, is_adjustment_only
      Dropped from invoice_line_items: markup_percentage, markup_flat_fee
      Backfilled 952 rows with markup context
      Backfilled 950 test rows with service_level, date_shipped, date_invoiced
      Verified end-to-end: schema columns correct, all rows populated, no
        billed-but-not-backfilled rows
      shipment_ledger NOT YET unified (still has markup_percentage/markup_flat_fee)
        — Session B will extend the new markup context pattern there

- [x] UPS detail parser bug fixes — complete (commit 6e72310)
      parseDate() now handles 2-digit year format (M/D/YY → 2026 if 00-49, 1926 if 50-99)
      service_level read from primary FRT row's Charge Description
        (Original Service Description is always empty in real UPS detail invoices)
      is_adjustment_only flag set when tracking number has only adjustment FRT rows
      date_shipped populated from Transaction Date as universal default
        (Session B will overwrite for lassoed lines from shipment_events.LABEL_CREATED)
      Verified: 950/950 service_level populated, 950/950 dates populated, 8 adjustment-only flagged

- [x] Repo housekeeping — complete (2026-04-18)
      All 4 stale claude/* worktree branches removed and pruned
      All 16 local commits pushed to origin/main
      Repo is clean: only main branch local, only origin/main remote

### Pending Phase 0 items
- [x] EIN received
- [x] Mercury business bank account — applied (pending approval)
- [x] Chase Ink Preferred — applied (pending approval)
- [x] Utah DBA "Cactus" — filed
- [x] Utah taxpayer account (TAP) — opened
- [ ] UPS Developer Portal — still blocked, call 1-800-782-7892
- [ ] Contact UniUni, GOFO, ShipX — after leaving BukuShip
- [ ] DHL eCommerce sales outreach — after leaving BukuShip (60-90 day lead time)
- [ ] Book Utah business attorney consult — needed before first client signs
- [ ] Create Stripe account under LLC — needed before first real invoice is due
- [ ] QuickBooks Online account — needed for Stage 5+ invoice sync
- [ ] Warehance API partnership conversation — initiate before leaving BukuShip
- [x] Configure Formspree form ID in cactus-marketing/index.html — live and working

### Next task — START HERE next session

**Pre-Stage 6 cleanup pass.** Five related items, ordered by priority.
Bundle them into one or two focused Claude Code sessions before
Stage 6 (Rate Engine) work begins. Estimated total: 3-4 hours.

**1. Schema-vs-code audit (60-90 min) — HIGHEST PRIORITY**
   Comprehensive sweep using `docs/schema-code-audit-checklist.md`.
   Goal: confirm no other tables share the silent-failure pattern that
   affected audit_logs (action vs action_type, details vs metadata —
   fixed in Session B.1 on 2026-04-20). Highest-risk tables: rate_shop_log,
   shipment_events, meter_transactions (write-and-walk-away patterns).

**2. Schema naming convention cleanup (60-90 min)**
   The audit will surface naming inconsistencies. Known examples:
   - `address_*_zip` should be `address_*_postal_code`
   - `address_*_line1` should be `address_*_line_1`
   - `weight_billed` vs other naming patterns worth standardizing
   Decide canonical conventions, then do all renames in one disciplined
   pass: ALTER TABLE renames + update every code reference + regenerate
   types + update seed-data.sql + verify-data.sql + parser code.

**3. Dark-path adjustment-only fix (30 min)**
   Extend the line SELECTs in `match.ts` and `resolve.ts` (dark-account
   branches) to include `is_adjustment_only`, then pass it to
   `computeSingleCeiling()` via `{ isAdjustmentOnly: line.is_adjustment_only }`.
   Without this fix, dark-account adjustment-only lines under flat markup
   get $1.50 incorrectly added to shipment_ledger (the authoritative
   invoice_line_items value is correct, so client billing is fine, but
   the two tables diverge on a not-uncommon line type — adjustments are
   ~22% of UPS FRT rows in real production data).

**4. Install Supabase CLI + establish type regen workflow (30 min)**
   Currently no `npm run gen-types` or equivalent in package.json.
   Install supabase CLI, decide where generated types live
   (likely `src/types/supabase.ts`), decide whether to commit them
   or gitignore them, document the regen command in package.json.
   Critical for catching schema drift early.

**5. Alamo carrier-accounts list view: show flat markup (15 min)**
   The Markup column on `/orgs/[id]` carrier accounts table currently
   shows only `markup_percentage` (e.g. "0.0%" for Pineridge despite
   $1.50 flat markup configured). Display logic should show
   "flat $1.50" when flat is set, "15.0%" when percentage is set.

After this cleanup: proceed with Stage 6 Rate Engine.

### Deferred follow-ups (from Session B)

- **6C — Line-item drill-down modal** (~1-2 hours)
  All 85 fields displayed for a single shipment on /billing/[id].
  Non-trivial interactive component (ESC-close, click-outside).
  Deferred from Session B Phase 6.

- **7C — TypeScript error triage** (~1 hour)
  Current baseline ~1640 errors in src/alamo. Most are Category A
  (Supabase GenericStringError inference quirks, next/cache missing
  types). Worth a focused pass to drive baseline down where errors
  are real vs. tooling noise. Deferred from Session B Phase 7.

### Key architectural decisions (record)
- Carrier invoice is ALWAYS billing source of truth — never label print
- lassoed_carrier_account = WMS integrated, full visibility
- dark_carrier_account = credentials shared, invoice-only visibility
- Markup lives at org_carrier_account level, not rate_cards
- Rate cards are optional children of org_carrier_accounts
- is_cactus_account flag on carrier account (not on invoices)
- Dark accounts matched by ship_from_address_normalized → locations
- Lassoed accounts matched by tracking_number → shipment_ledger
- 3PL billing always to 3PL org — sub-client billing is Phase 2
- Multiple locations per org — all checked for dark account matching
- is_billing_address flag controls which locations are used for matching
- dispute_threshold lives on org_carrier_accounts (per-account)
- Variance above threshold: HELD, dispute_flag=TRUE, human review
- shipment_source: RATING_ENGINE (lassoed) or INVOICE_IMPORT (dark)
- All carrier accounts are Cactus/Buku master accounts
- Markup applied per markup_type (v1.6.0):
    PERCENTAGE: per-component, summed, Single-Ceiling on total
    FLAT: applied once to base_charge only, surcharges pass through raw
- Storage: raw carrier values + markup context. Per-charge billed values
    computed at READ time. final_billed_rate materialized at Stage 5.
- Margin analytics: SUM(final_billed_rate - carrier_charge) GROUP BY org, week
    No parallel raw-cost table needed (immutability gives point-in-time snapshot)
- Pipeline: 8 stages — Ingestion → Parsing → Matching → Dispute Resolution
    → Billing Calculation → Invoice Generation → Delivery → Payment
- Match stage SEPARATED from Billing Calculation (v1.6.0 refactor in Session B)
- 85-column DETAIL FORMAT is the client-facing CSV standard (BukuShip
    58-column hybrid template DEPRECATED)
- Shadow Ledger (rate_shop_log) logs ALL rate requests async
- Event sourcing: always append shipment_events, never update status
- AI is central nervous system — not a feature
- WMS handles rate display/selection UI in Phase 1-2
- Cactus builds own WMS in Phase 3
- Rate sort: cheapest first (final_billed_rate ASC)
- Last-mile carriers self-filter by ZIP — no lookup tables needed
- Carrier API errors: log + exclude, never fail full response
- FedEx rate data: reconciliation only, not AI price prediction
- DHL eCommerce: daily manifest job required
- Phase 1-2: Cactus as middleware → Phase 3: Cactus as full OS
- All carrier contacts came through BukuShip — approach post-departure
- Next.js 16: middleware.ts renamed to proxy.ts, function named "proxy"
- Next.js 16: browser and server Supabase clients must be separate files
- Browser client (createBrowserClient): use in 'use client' components only
- Server client (createServerClient): use in Server Components and Route Handlers
- UPS invoice: one-charge-per-line format — group by tracking_number before insert
- Invoice Section field drives charge routing: Outbound = standard, Adjustments = apv_adjustment
- Address fields kept independent + normalized concat built at parse time
- Dimensions not available in UPS summary format — DIM reconciliation is Phase 2
- weight_unit defaults to LB for UPS — normalize to OZ for Shadow Ledger comparisons
- AI normalization handles both headered and headerless invoice files
- Invoice Section field is a parser routing instruction, not a stored field
  Outbound/Shipping API → base_charge accumulator
  Adjustments & Other Charges → apv_adjustment accumulator
- UPS Adjustments Billed Charge = delta only (confirmed)
- AI normalization: Claude maps headers, stores with ai_suggested=TRUE
- Raw file stored in Supabase Storage bucket: carrier-invoices
- File path format: {CARRIER_CODE}/{timestamp}_{filename}
- Headers extracted at upload time, stored as JSONB in carrier_invoices
- XLSX files flagged as XLSX_PARSE_REQUIRED — Phase 1 targets CSV only
- UPS detail format has no headers — carrier_invoice_formats provides them
- INF rows carry dimensional data — extract dims only, never bill Net Amount
- FRT rows = base freight, FSC = fuel, ACC = accessorial, ADJ = adjustment
- Charge routing: exact match → class+detail match → class-only match
- Unknown charge types → other_surcharges + flag for admin review
- Self-improving routing: admin maps once → learned forever in DB
- Header detection: skip first row if tracking number col doesn't start with 1Z
- AG (Package Dimensions) = entered at label print → length/width/height_entered
- HR (Detail Keyed Dim) = measured by carrier → length/width/height_carrier
- BA (Net Amount) = charge source of truth for detail format
- Parser batches inserts at 100 rows to avoid Supabase size limits
- Next.js serverActions bodySizeLimit = 10mb (UPS detail files exceed 1mb default)
- Sidebar is position:fixed width:200 — all pages use marginLeft:200
- Active nav state: use pathname.startsWith(href) not exact match
- CactusLogo component is shared — used in both login and sidebar
- Public assets: cactus-logo.svg, stallion.png (white), stallion_brown.png
- Login page background is SVG-based — no image files, pure code
- JetBrains Mono via Google Fonts — tracking numbers only
- Variance logic: carrier_charge - raw_carrier_cost (both pre-markup)
  NEVER compare carrier_charge to final_billed_rate (apples to oranges)
- is_adjustment_only=TRUE skips variance calc (no original quote to compare)
- Invoice display rules locked per carrier_account_mode (v1.6.0):
    lassoed → show ONLY final_billed_rate (per-charge billed values
              acceptable since they sum to final_billed_rate within
              fractional cent rounding tolerance — display rule is per
              field, not per shipment)
    dark → show both carrier_charge AND final_billed_rate
    This is per org_carrier_account, not per org
    An org can have lassoed UPS + dark DHL simultaneously
    Each line item checked individually via org_carrier_account_id join
- PDF invoice = one page summary only (already shipped):
    Total amount due, total shipments
    Breakdown by carrier (shipments + amount)
    Breakdown by origin location (shipments + amount) via match_location_id
    Never shows carrier_charge or markup on lassoed lines
- CSV export = full 85-column detail format (Session B will deliver):
    Pass-through columns: tracking, dates, dims/weights entered + carrier,
      addresses (sender + receiver), service, zone, references, etc.
    Charge columns: per-charge billed values computed at read time
    Single Shipment Total column = final_billed_rate (authoritative)
    Footnote: line items may show fractional-cent rounding; total is authoritative
- locations.name = the human-friendly location label (no separate nickname)
    Convention: use short names e.g. "Phoenix WH", "Tempe FC"
    Used in PDF summary and Cactus Portal location filter
- match_location_id on invoice_line_items stores matched location
    Set at matching time for dark accounts
    Enables PDF location breakdown and portal filtering
- Sidebar active state: pathname.startsWith(href) not exact match
    Dashboard exception: pathname === '/dashboard' to prevent over-matching
- portal_role_enum: ADMIN, FINANCE, STANDARD on org_users
- Carrier account lookup per line item (not per invoice) — one Cactus
  master account serves multiple orgs; org determined by address/tracking
  match, then carrier account found by org_id + carrier_code +
  is_cactus_account = TRUE
- is_cactus_account = TRUE used as secondary filter to isolate the
  Cactus billing account when an org has multiple carrier accounts
- Dispute grouping by dispute_notes — items with identical notes share
  the same root cause and can be bulk-resolved in one action
- ADMIN + FINANCE: full portal access, notifications ON default
- STANDARD: full access except sub-client billing, notifications OFF
- Email notifications use Resend + React Email templates
- Invoice notification: HTML summary in email, portal link for files
  No PDF/CSV attachments — better spam filter deliverability
- notification_preferences seeded by trigger on org_users insert
- Trigger has exception handler — never blocks parent insert
- notification_type_enum is extensible — add values via migration
- Alamo has separate auth model from Cactus Portal (future)
- TRACKING_STATUS_ALERTS covers all anomalies in one daily digest
  Categories: NO_MOVEMENT, STALE_IN_TRANSIT, DAMAGED,
  UNDELIVERABLE, RETURNED_TO_SENDER
- Daily alert digest fires at 7:00am, scans previous 14 days
- Email shows category totals only — portal link for full detail
- tracking_alert_threshold_days on organizations (default 3)
  applies to NO_MOVEMENT and STALE_IN_TRANSIT categories
- Performance indexes on shipment_events protect alert job at scale
- Scale plan: direct query now → cache table at 1k orgs →
  read replica at 10k labels/day
- Lassoed requires BOTH rate API and label purchase API — rate cards alone do not enable lassoed mode
- UniUni and GOFO remain dark accounts until label purchase API agreements are signed
- Dark accounts are a valid revenue path pre-WMS integration — onboard first client dark, migrate to lassoed when Warehance is live
- Circuit breaker pattern for carrier API failures: visible Alamo dashboard banner, internal email alert, audit_logs entry, auto-recovery probe every 30s, admin manual reset
- AI integration roadmap priorities: invoice normalization (live) → exception flagging → charge routing self-improvement → dark account fuzzy address matching → PLD Analysis Engine narration → Shadow Ledger intelligence → carrier scorecard → anomaly detection
- carrier_master_accounts table deferred to Phase 2 — add when second carrier goes live or first client has multiple Cactus accounts
- Weekly billing run sweeps ALL APPROVED lines system-wide — not triggered per carrier invoice
- Billing engine groups by org_id, produces one cactus_invoice per org per run
- billing_status moves forward only: PENDING → HELD → APPROVED → INVOICED — never backwards
- .in() filter with large arrays must always be batched in chunks of 100 — PostgREST URL limit
- .select('id').limit(1) for existence checks — never head:true with admin client (silently returns null)
- ON DELETE CASCADE on cactus_invoice_line_items — deleting cactus_invoices cascades junction cleanup
- hasApproved billing lock: button disabled when zero APPROVED lines remain
- Claude Code worktree changes must be cherry-picked to main before dev server picks them up
- Payment pull always happens before carrier payment — collect Friday, pay carrier Tuesday
- 3% CC fee is always a visible separate line item, never hidden, waivable per org via Alamo toggle
- USPS meter balances are client liabilities held by Cactus — not Cactus revenue until consumed
- Disputes never delay a billing pull — pull APPROVED lines, carry disputes to next cycle
- Invoice email: HTML summary embedded in body, no attachments, portal link for full detail
- stripe_customer_id lives on organizations — one Stripe customer per Cactus org
- Warehance requires 4 Cactus API endpoints: rating, purchase label, void/cancel, tracking
- API key auth required for all WMS endpoints — key generated per org in Alamo, stored hashed
- Carrier API integration priority: 1.UPS 2.DHL eCommerce 3.UniUni 4.GOFO 5.FedEx 6.USPS
- UniUni and GOFO remain dark accounts until label purchase API agreements are signed
- Lassoed requires BOTH rate API AND label purchase API — rate cards alone do not qualify
- pdfkit requires serverExternalPackages: ['pdfkit'] in next.config.ts — Next.js bundler strips .afm font files otherwise
- PDF uses autoFirstPage: false + manual addPage() to prevent implicit pagination
- Footer pinned to absolute Y — never use doc.y for footer, always absolute coordinates
- → arrow character breaks pdfkit WinAnsi font encoding — use middle dot · (U+00B7) as separator instead
- PDF LAYOUT constants object centralizes all geometry — edit spacing in one place not scattered through file
- PDF location rows capped at 12 with overflow line — PDF is summary only, CSV has full detail
- sharp used one-time to convert cactus-logo.svg → cactus-logo-pdf.png at 400px wide
- process.cwd() resolves to src/alamo/ when dev server launched from that directory

### Open questions / decisions still needed
- USPS: direct PC Postage vs licensed reseller (Stamps.com etc)
- Payment processor: Stripe vs Fortis
- QuickBooks Online API integration approach
- Dispute threshold default ($2.00 currently in schema)
- DHL eCommerce Americas: requires sales conversation
- PLD Analysis Engine: standard template file format to provide prospects
  (what column headers, what order, what file type — CSV or XLSX?)
- PLD Analysis Engine: how to handle mixed unit of weight in same file
  (some rows LB, some rows OZ?)
- UPS Developer Portal: still blocked — call 1-800-782-7892, email apisupport@ups.com
- carrier_charge_routing needs GRANT ALL to service_role on new deployments
- carrier_invoice_formats needs GRANT ALL to service_role on new deployments
- Warehance tracking: does Warehance poll Cactus or does Cactus push via webhook?
- API key auth: confirm Warehance expects Bearer token or custom header format
- Stripe vs Fortis: final payment processor decision needed before Phase 2 payment build
- USPS: direct PC Postage vs licensed reseller path (Stamps.com etc.) — decision needed Phase 2

---

## 12a. OPEN DECISIONS (DN LOG)

Policy decisions surfaced during Session B that need product-level
resolution. Status as of 2026-04-20.

### DN-1 — Account with both markup_percentage > 0 AND markup_flat_fee > 0
**Status:** OPEN. Code preserves Session A behavior (flat wins). Should be
prevented at save time in the Alamo `/orgs/[id]/carriers/*` editor pages.
Then strengthen `deriveMarkupContext()` in `src/alamo/lib/markup-context.ts`
to throw on the invalid combination instead of silently picking one.
**When to resolve:** Before first real client onboard.

### DN-2 — Flat markup on is_adjustment_only = TRUE lines
**Status:** RESOLVED 2026-04-20. Policy: flat markup applies once per
tracking number to the base/freight charge, not to surcharges, not to
adjustment-only lines (no base charge to attach the fee to). Implemented
via `isAdjustmentOnly` parameter on `computeSingleCeiling()` in Session B.1.

**Outstanding TODO from Session B.1:** `match.ts` and `resolve.ts` dark-path
shipment_ledger writes call `computeSingleCeiling()` but their SELECTs
don't yet load `is_adjustment_only`, so they pass through as `false`.
For dark-account adjustment-only lines, this means shipment_ledger gets
$1.50 incorrectly added while the authoritative invoice_line_items value
(from `billing-calc.ts`) correctly skips the flat fee. The CLIENT invoice
is correct (reads from invoice_line_items), but shipment_ledger and
invoice_line_items will diverge on dark-account adjustment-only lines.
Adjustment-only lines are NOT rare — Session A's real UPS data showed
~22% of FRT rows were adjustments. Fix queued as item #3 in Section 12
"Next task" — estimated 30 minutes.

### DN-3 — Markup basis: carrier_charge vs sum-of-components
**Status:** RESOLVED. Policy per briefing Rule 2: carrier_charge is ALWAYS
the billing basis. Markup applies to carrier_charge directly. CSV per-
component billed values may diverge from final_billed_rate by up to $0.01
due to per-cell rounding accumulation; the CSV footnote addresses this.
The two only diverge if parser stores carrier_charge ≠ sum(components),
which shouldn't happen for clean UPS detail data.

### DN-4 — audit_logs silent failure (discovered post-Session-B)
**Status:** RESOLVED 2026-04-20. Discovered during Session B review:
audit_logs had zero rows despite many Match runs that should have
generated entries. Root cause: code uses `action:` and `details:`
field names; schema columns are `action_type` and `metadata`.
PostgREST silently accepts INSERTs with unknown column names —
they "succeed" but write nothing. Bug existed since codebase
scaffolding. Fixed across 5 INSERT call sites + 1 SELECT site
(in csv.ts, reading the column for the CSV "Matched At" column 82).

**Lesson for the future:** Schema-vs-code mismatches like this are
silent in PostgREST/Supabase. The schema-vs-code audit playbook
in `docs/schema-code-audit-checklist.md` is the systematic defense
against discovering more of these the hard way.

---

## 13. BUSINESS FORMATION STATUS

| Item | Status |
|---|---|
| Utah LLC | ✅ Cactus Logistics LLC |
| EIN | ✅ Received |
| Utah DBA "Cactus" | ✅ Filed with state |
| Utah TAP account | ✅ Opened at tap.tax.utah.gov |
| Mercury bank account | ⏳ Applied — pending approval |
| Chase Ink Preferred | ⏳ Applied — pending approval |
| Stripe account | ⏳ Needed before first real invoice is due |
| QuickBooks Online | ⏳ Needed for Stage 5+ invoice sync |
| Attorney consult | ⏳ Book immediately — before first client signs |
| FedEx developer account | ✅ Integrator ID: 70157774 |
| UPS developer account | ⏳ Blocked — call 1-800-782-7892 |

---

## 14. PROJECT STRUCTURE

### Active Repositories
```
cactus_dev/
  cactus-web-app/      ← Main Cactus OS (this repo)
  cactus-marketing/    ← Marketing website (github.com/sawyerforrest/cactus-marketing)
```

### cactus-web-app folder structure
```
cactus-web-app/
  src/
    alamo/             ← Next.js 16.2.1 internal admin dashboard
    portal/            ← Client-facing Cactus Portal (Phase 1)
    lib/               ← Shared Supabase clients
    core/              ← Rating, billing, normalization, AI
    adapters/          ← Carrier API adapters
  database/            ← database-setup.sql, seed-data.sql, verify-data.sql
  docs/                ← Carrier API documentation + internal playbooks
    amazon-shipping/
    dhl-ecommerce/
    dhl-express/
    fedex/
    gofo/
    landmark-global/
    uniuni/
    ups/
    usps/
    schema-code-audit-checklist.md
```

### docs/ — internal playbooks
- `docs/schema-code-audit-checklist.md` — playbook for detecting
  schema-vs-code field-name drift; run before major sessions and after
  migrations. Created 2026-04-20 after audit_logs silent failure was
  discovered.

### GitHub
- Main OS: https://github.com/sawyerforrest/cactus-web-app
- Marketing: https://github.com/sawyerforrest/cactus-marketing

---

## 15. PLD ANALYSIS ENGINE SPEC

### Client-Facing Name: PLD/Rate Analysis
### Internal Name: PLD Analysis Engine

### How It Works
For each row in an uploaded PLD file, Cactus runs a live rate
request against pre-selected carrier APIs — identical to the
rating engine but against historical data instead of live orders.
Same carrier abstraction layer. API where available, rate card
where not.

### Required Fields (10)
- Ship Date — sample range, annualization, peak/stale flagging
- Service Level — required for accurate rating and ensures cactus rates with equal service level
- Weight — required for rating
- Unit of Weight — LB or OZ, normalize to OZ internally
- Length — DIM weight calculation
- Width — DIM weight calculation
- Height — DIM weight calculation
- Ship From ZIP — zone calculation
- Ship From Country Code — domestic vs international routing
- Ship To ZIP — zone calculation
- Ship To Country Code — domestic vs international routing

### Preferred Fields (3 — enrich output but not required)
- Tracking or Order Number — de-duplication key
- Carrier — enables current carrier breakdown in output
- Total Shipping Cost — enables savings delta calculation
  Without it: output is Cactus rate projection only

### Ship Date — Two Purposes
1. Detects sample window → annualizes savings projection
   Example: 90 days of data → multiply savings × 4 = annual estimate
2. Flags rate context issues:
   - Stale data flag: data older than 18 months
   - Peak season flag: data includes October–December

### DIM Weight
Cactus calculates DIM weight for every shipment.
DIM weight = L × W × H ÷ 139
Carrier bills whichever is greater: actual weight or DIM weight.
Dimensions are required — without them rates are inaccurate.

### Carrier Rating Method by Carrier
- FedEx → live API (Comprehensive Rates API)
- UPS → live API (Rating API)
- USPS → rate cards + hardcoded surcharges
- UniUni → rate cards (no residential, no fuel surcharge)
- GOFO → rate cards (no residential, no fuel surcharge)
- ShipX → rate cards + fuel surcharge hardcoded
- DHL eCommerce → rate cards (pending sales relationship)

### Output Includes
- Sample date range detected
- Annualized savings projection
- Peak season flag (if data includes Oct–Dec)
- Stale data flag (if data is 18+ months old)
- Total spend in sample period vs Cactus equivalent
- Savings by carrier, service level, zone, and lane
- Top 10 lanes by spend
- DIM weight upgrade flags
- Carrier API vs rate card transparency note

---

## 16. INVESTOR DOCUMENT CONTEXT

### March 2026 MTD Performance (BukuShip book of business)
- Total gross margin: $57,458 | Total packages: 77,273
- FulfillmentEZ: $20,650 total margin | $13,579 addressable (ex-Amazon, ex-USPS) | Warehance by July
- Valencia Fulfillment: $9,234 addressable | 100% UniUni | dark account
- Jam-n Logistics: $5,207 addressable | FedEx heavy
- Total addressable margin (ex-Amazon, ex-USPS): ~$27,845/month
- Real-world margins: UniUni $0.63/label | UPS $1.90/label | FedEx $2.51/label

### Funding Plan
- Ask: $300,000 for 10% equity
- Monthly burn: $10k Sawyer salary | $10k senior dev | $5k ops = $25k/month
- Revenue targets: $15k July → $25k September → $40k+ November → $45k+ December
- Breakeven: Month 6 (September)
- Month 12 cash balance projects above starting amount

### WMS Integration Priority
1. Warehance — warm relationship, FulfillmentEZ + Only Hydration moving there July
2. Dark accounts — no WMS integration needed, lowest friction
3. Packiyo — younger, hungry for business, similar to Warehance
4. Extensiv — older, traditional, harder business case, lowest priority

### Three Investor Documents Needed (1 page each)
1. Executive Summary / Business Plan
2. Personal Resume (updated with BukuShip Senior AE role, Draper UT, Jan 2025–Present)
3. Pro Forma (24-month, based on funding plan and revenue targets above)

---

## 17. UPS INVOICE FORMAT — CONFIRMED

### Summary File (32 columns — Phase 1 target)
NOTE: All header mappings below apply to the summary file only.
The full file (250 columns, no headers) requires data-inference
mode and is a Phase 2 priority.
Headers confirmed:
Account Number, Invoice Number, Invoice Date, Amount Due,
Tracking Number, Pickup Record, Reference No.1, Reference No.2,
Reference No.3, Weight, Zone, Service Level, Pickup Date,
Sender Name, Sender Company Name, Sender Street, Sender City,
Sender State, Sender Zip Code, Receiver Name, Receiver Company Name,
Receiver Street, Receiver City, Receiver State, Receiver Zip Code,
Receiver Country or Territory, Third Party, Billed Charge,
Incentive Credit, Invoice Section, Invoice Type, Invoice Due Date

### Invoice Section values (confirmed)
- "Outbound/Shipping API" → standard shipment charge
- "Adjustments & Other Charges/Shipping Charge Corrections" → apv_adjustment

### UPS Header → Cactus Field Mapping — Summary File Only (32 columns, confirmed by AI normalization)
- Tracking Number              → tracking_number
- Account Number               → account_number_carrier
- Billed Charge                → carrier_charge (billing source of truth)
- Incentive Credit             → apv_adjustment
- Service Level                → service_level
- Weight                       → weight_billed
- Zone                         → zone
- Pickup Date                  → date_shipped
- Invoice Date                 → date_invoiced
- Sender Street                → address_sender_line1
- Sender City                  → address_sender_city
- Sender State                 → address_sender_state
- Sender Zip Code              → address_sender_zip
- Concatenated sender fields   → address_sender_normalized (dark matching)
- Receiver Street              → address_receiver_line1
- Receiver City                → address_receiver_city
- Receiver State               → address_receiver_state
- Receiver Zip Code            → address_receiver_zip
- Receiver Country or Territory → address_receiver_country
- Third Party                  → payor
- Reference No.1/2/3           → reference_1/reference_2/reference_3
- Invoice Number               → SKIP
- Amount Due                   → SKIP
- Pickup Record                → SKIP
- Sender Name                  → SKIP
- Sender Company Name          → SKIP
- Receiver Name                → SKIP
- Receiver Company Name        → SKIP
- Invoice Section              → SKIP (parser routing instruction only)
- Invoice Type                 → SKIP
- Invoice Due Date             → SKIP

### Full File (250 columns)
No headers present — data-inference mode required.
Phase 2 priority. Not needed for Phase 1 billing.

### UPS Developer Portal Status
- Application name: Cactus | Billing account: 1820RB
- Blocked by non-technical verification issue
- Submitted "Click Here to Resolve" 3+ times — no response
- Next step: call 1-800-782-7892 (API/Developer Support)
- Email: apisupport@ups.com
- Confirmed flow: Client Credentials (not Auth Code)

### AI Normalization Results (confirmed 2026-04-05)
Claude mapped 22 of 32 UPS summary headers at 99% confidence.
10 correctly skipped (Invoice Number, Amount Due, Pickup Record,
Sender Name, Sender Company, Receiver Name, Receiver Company,
Invoice Section, Invoice Type, Invoice Due Date).
Invoice Section is a parser routing instruction — not stored as
a mapped field. Used to route charge rows during line item parsing.

### UPS Detail Format Parser (confirmed 2026-04-09)
- 950 shipments correctly parsed from 4,175 invoice rows
- All 61 charge description types recognized and routed
- Carrier dims (HR column) correctly split into L/W/H
- Entered dims (AG column) split into L/W/H (NULL when not present)
- BA (Net Amount) confirmed as billing source of truth
- INF rows confirmed as dimension-only rows — never billed
- Header row detection: skip if col U (tracking) doesn't start with 1Z
- Charge routing priority: exact → class+detail → class-only

### UPS Detail Format — Real File Analysis (confirmed 2026-04-18)

Analyzed real anonymized UPS detail invoice (4,175 rows × 250 columns):

Charge Classification distribution:
  FRT (freight):       1,214 rows
  ACC (accessorial):     830 rows
  FSC (fuel surcharge): 1,211 rows
  INF (info/dims):       919 rows
  MSC (misc):              1 row

CRITICAL: Several columns in the UPS template are ALWAYS EMPTY in
real production invoices, despite being in the column header spec:

  Original Service Description (col 230)  — 0/4,175 populated
  Shipment Date (col 117)                 — 0/4,175 populated
  Shipment Delivery Date (col 122)        — 0/4,175 populated

ALWAYS-POPULATED columns we now rely on:

  Invoice Date (col 5)         — format M/D/YY (e.g. "3/14/26")
  Transaction Date (col 12)    — format M/D/YY
  Invoice Due Date (col 63)    — format M/D/YY
  Charge Description (col 46)  — service info lives here
                                 ("Ground Commercial", "Ground Residential",
                                  "2nd Day Air Residential", etc.)

Adjustment row patterns (272 of 1,214 FRT rows = ~22%):
  "Shipping Charge Correction Ground"
  "Shipping Charge Correction 2nd Day Air"
  "Shipping Charge Correction Next Day Air"
  "Residential Adjustment"
  "Address Correction Ground"
  Most paired with primary FRT row on same tracking number.
  Subset are standalone adjustments (no primary FRT row on this invoice)
    — flagged with is_adjustment_only=TRUE, variance calc skipped.

---

## 18. FULL INVOICE PIPELINE — STAGE BY STAGE

Pipeline now lives canonically in Section 8 (collapsed in v1.6.0 to
eliminate redundancy with Section 8 which previously had a stale version).
See Section 8 for the 8-stage pipeline architecture.

## 19. CACTUS PORTAL — FULL VISION

Dashboard
  Active shipments count
  This week's spend
  Tracking alerts (packages stuck > threshold)

Shipments
  Every shipment for their org
  Current tracking status
  Service level, carrier, zone, weight, dims
  Filter by location via locations.name
  Display rules: lassoed = final_billed_rate only
                 dark = carrier_charge + final_billed_rate

Tracking Alerts
  LABEL_CREATED > 3 business days (configurable per org)
  IN_TRANSIT > X days with no scan
  DELIVERY_ATTEMPTED with no follow-up
  EXCEPTION or LOST flags
  Threshold stored on organizations table (Phase 2 column)

Meter (USPS orgs only)
  Current balance
  Reload history
  Transaction log

Invoices
  All cactus_invoices for their org
  Line item drill-down per invoice
  PDF one-page summary download
  CSV full detail download
  Payment status

FUTURE — 3PL Billing Module (Phase 2)
  Assign shipments to sub-clients
  Add markup per sub-client
  Add non-shipping charges (pick/pack, storage, etc.)
  Reconcile and generate sub-client invoices
  Margin summary per sub-client
  Full P&L visibility per customer
  Infrastructure already in place:
    organizations.parent_org_id for sub-clients
    org_type_enum includes SUB_CLIENT
    Portal billing module needs UI layer only

---

## 20. PAYMENT ARCHITECTURE

### USPS — Pre-funded Meter Wallet
Client funds a USPS meter balance with Cactus via ACH or CC.
Cactus holds these funds in Mercury and manages the USPS PC Postage
account on the client's behalf.

Auto-reload flow:
  Client sets minimum balance threshold in Cactus Portal
  Client sets reload amount (Cactus recommends 2-3 days typical spend)
  Client sets payment method: ACH (free) or CC (+3% fee passed through)
  When meter balance hits threshold:
    → Auto-reload triggers via Stripe
    → ACH pull (free) or CC charge (+3% fee)
    → Funds clear in Mercury (2-3 business day ACH window)
    → Meter balance updated in Cactus
    → METER_RELOAD notification sent to client (ADMIN + FINANCE roles)

USPS PC Postage Provider connection required for Phase 2.
Enables Cactus to generate USPS labels directly as a reseller.

### All Other Carriers — Weekly Pull Cycle
Target carrier terms: NET 10. Prepare for NET 10, not NET 30.

Weekly cycle:
  Mon–Wed: Carrier invoices arrive for previous week's shipments
           Upload to Alamo → Parse → Match → Disputes → Approve
           Run Weekly Billing → Client invoices generated
           Automated email sent: HTML summary + portal link
           Client invoices live in Portal for review

  Friday:  Stripe auto-pull fires (fixed day, fixed time weekly)
           ACH debit (free) or CC charge (+3% if CC, unless waived)
           Funds land in Mercury (ACH: 2-3 business days)

  Monday:  Funds cleared in Mercury

  Tuesday: Pay carrier via ACH from Mercury (within NET 10 window)

CRITICAL RULE: Always collect from clients BEFORE paying carriers.
Never reverse this order under any circumstance.

Dispute policy: Pull all APPROVED lines on Friday regardless of
unresolved disputes. Disputed lines carry forward to next billing cycle.
Never delay a pull for an entire org because of a subset of held lines.

### 3% CC Fee Architecture
On organizations table (migration v1.6.0):
  payment_method: ACH | CC | ACH_PRIMARY_CC_BACKUP
  cc_fee_waived: boolean default false
  stripe_customer_id: TEXT

On cactus_invoices table (migration v1.6.0):
  payment_method_used: ACH | CC
  cc_fee_applied: boolean
  cc_fee_amount: DECIMAL(18,4)
  cc_fee_percentage: DECIMAL(5,4) default 0.0300
  paid_at: TIMESTAMPTZ
  payment_reference: TEXT
  stripe_payment_intent_id: TEXT

Alamo toggle per org: cc_fee_waived = true/false without touching code.
3% CC fee always appears as a separate visible line item on the invoice.
Fee is never hidden. Never bundled into the subtotal.

### Client Invoice Email Format
Subject: Your Cactus invoice is ready — $X,XXX.XX due Friday

Body:
  HTML summary table embedded in email (no PDF/CSV attachments)
  Carrier | Shipments | Amount (per carrier)
  Subtotal
  CC Fee 3% (if applicable — separate line)
  Total Due
  Due Date
  [View full invoice in Cactus Portal →]
  [Download PDF] [Download CSV] — links to Portal

No attachments. Full detail in Portal only. Better deliverability.

### Applications Required
Stripe:
  Stores client payment methods (ACH bank account + CC on file)
  Executes weekly auto-pull on fixed schedule (Vercel Cron trigger)
  Handles failed payments + automatic retries
  Fires webhooks to Cactus on payment success/failure
  stripe_customer_id stored on organizations

Mercury:
  Receives incoming Stripe settlements
  Sends outgoing ACH to carriers
  Recommended sub-accounts:
    Operating — Cactus overhead and payroll
    Carrier payables — funds earmarked for carrier payment
    USPS float — pre-funded meter funds (client liabilities)

Resend: weekly invoice email delivery (already in architecture)
Supabase: invoice lifecycle + payment event tracking

### Cash Flow Safety Rules
1. Pull before you pay — collect Friday, pay carrier Tuesday
2. Reserve policy — maintain Mercury balance >= one week of carrier payables
3. Failed payment → OVERDUE status immediately, no grace period
4. Disputes carried forward — never delay pull for unresolved lines
5. USPS float discipline — meter balances are client liabilities, not revenue
6. Never commingle USPS float with operating funds

### New Table: payment_events (migration v1.6.0)
  id: UUID PK
  cactus_invoice_id: UUID FK → cactus_invoices
  event_type: TEXT
    (PULL_INITIATED, PULL_SUCCESS, PULL_FAILED, REFUND, DISPUTE, OVERDUE_FLAGGED)
  stripe_event_id: TEXT
  amount: DECIMAL(18,4)
  created_at: TIMESTAMPTZ default now()
  notes: TEXT

### Phase 2 Build Items (Payment)
- Stripe account setup + API integration
- Weekly auto-pull Vercel Cron job
- Failed payment + OVERDUE workflow + retry logic
- USPS PC Postage Provider connection
- CC fee logic wired into invoice generation
- payment_events Stripe webhook handler
- Invoice status lifecycle: UNPAID → PULLED → PAID → OVERDUE

---

## 21. WAREHANCE WMS INTEGRATION

### Partnership Status
Brennan (CEO, Warehance) confirmed open to working together.
First target client: FulfillmentEZ (Warehance → Cactus by July 2026)

### Four Endpoints Cactus Must Build for Warehance

1. Rating endpoint — POST /api/rate
   Input: org_id, origin, destination, weight, dimensions
   Output: all available rates across all active carriers, marked up,
           sorted cheapest first (final_billed_rate ASC)
   This is the Phase 1 rating engine core.

2. Purchase label endpoint — POST /api/label
   Input: org_id, selected rate token, shipment details
   Output: tracking number, label PDF/ZPL
   Cactus calls carrier API, purchases label, writes shipment_ledger row.
   This is what makes an account LASSOED — Cactus sees the print event.

3. Void/cancel endpoint — POST /api/label/void
   Input: tracking number
   Cactus calls carrier void API, updates shipment_ledger,
   writes LABEL_VOIDED event to shipment_events.

4. Tracking endpoint — GET /api/tracking/:trackingNumber
   Input: tracking number(s)
   Output: current status + event history
   Cactus calls carrier tracking APIs, returns status,
   writes to shipment_events.

### Open Question — Tracking Delivery Method
Does Warehance poll the tracking endpoint on demand, or does Cactus
push tracking updates via webhook? Must confirm with Brennan before
building Stage 7 tracking integration.

### API Key Authentication (required for all 4 endpoints)
Generate API key per org in The Alamo.
Store hashed in organizations table.
Validate on every inbound Warehance request.
Schema addition needed: organizations.api_key_hash TEXT

### Build Sequence
Stage 6: Rating engine core → /api/rate endpoint
Stage 7: UPS + FedEx API integrations (power all 4 endpoints)
Stage 8: Warehance WMS integration (wire to all 4 endpoints)