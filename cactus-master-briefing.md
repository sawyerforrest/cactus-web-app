# CACTUS LOGISTICS OS — MASTER BRIEFING DOCUMENT
# VERSION: 1.4.1 | UPDATED: 2026-03-28
#
# HOW TO USE:
# Paste this entire document as the first message in any new
# Claude chat session. Claude will have full context and can
# pick up immediately without re-explaining the project.
#
# KEEP UPDATED: After each session update Section 9.

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
Invoice matching: ship_from_address_normalized → locations table
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
Default: `final_merchant_rate ASC` (cheapest first)
Optional toggle: `transit_days ASC` then `final_merchant_rate ASC`
Never: carrier-weighted or manually promoted results

Residential and fuel surcharges already included in carrier
API responses. Cheapest first IS the smartest sort.

### Carrier API Error Handling
If a carrier API returns an error (not just no rate):
→ Silently exclude from results
→ Log to audit_logs
→ Never fail the entire rate shopping response

---

## 8. INVOICE PIPELINE

```
Upload carrier CSV/XLSX in The Alamo
AI normalizes headers → Cactus Standard fields
Human review queue in The Alamo
For each line item → check carrier_account_mode:

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

Generate cactus_invoices from APPROVED line items
Sync to QuickBooks Online
```

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

## 10. DATABASE SCHEMA (v1.4.0 — 16 TABLES — LIVE IN SUPABASE)

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
- `carrier_code_enum`: UPS, FEDEX, USPS, UNIUNI, GOFO, SHIPX, DHL_ECOM, DHL_EXPRESS, LANDMARK, ONTRAC, OSM
- `shipment_event_type_enum`: RATE_REQUESTED, LABEL_CREATED, LABEL_VOIDED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERY_ATTEMPTED, DELIVERED, RETURNED_TO_SENDER, LOST, EXCEPTION, APV_ADJUSTMENT, ADDRESS_CORRECTED, DAMAGED

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
- [x] Supabase reset — database-setup.sql v1.4.0 live and verified
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
- [x] Stage 3 in progress
      - Dashboard rebuilt in Cactus design system
      - Geist font + CSS tokens (globals.css)
      - Shared Sidebar component (components/Sidebar.tsx)
      - Organizations list page (/orgs) — live Supabase data
      - Add org form (/orgs/new) — Server Action writes to Supabase
      - + Add org button wired up on dashboard and orgs pages

### Pending Phase 0 items
- [ ] EIN from irs.gov — Monday 8-9am MT (5am MT = 7am ET open)
- [ ] Mercury business bank account — after EIN
- [ ] UPS Developer Portal — waiting for approval
- [ ] Contact UniUni, GOFO, ShipX — after leaving BukuShip
- [ ] DHL eCommerce sales outreach — after leaving BukuShip
- [ ] Book Utah business attorney consult
- [ ] Create Stripe account under LLC

### Next task — START HERE next session
Continue Stage 3:
  - Test Add org form — create a real org, verify in Supabase
  - Carrier accounts page (/carriers)
  - Add carrier account form
  - Location management

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
- Single-Ceiling applied once to total — never per surcharge component
- Shadow Ledger (rate_shop_log) logs ALL rate requests async
- Event sourcing: always append shipment_events, never update status
- AI is central nervous system — not a feature
- WMS handles rate display/selection UI in Phase 1-2
- Cactus builds own WMS in Phase 3
- Rate sort: cheapest first (final_merchant_rate ASC)
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

---

## 13. BUSINESS FORMATION STATUS

| Item | Status |
|---|---|
| Utah LLC | ✅ Cactus Logistics LLC |
| EIN | ⏳ Monday 8-9am MT |
| Business bank account | ⏳ After EIN (Mercury) |
| Business credit card | ⏳ After LLC + EIN |
| Stripe account | ⏳ After LLC |
| Attorney consult | ⏳ Schedule this week |
| FedEx developer account | ✅ Integrator ID: 70157774 |
| UPS developer account | ⏳ Pending 24hr approval |

---

## 14. GITHUB REPOSITORY
https://github.com/sawyerforrest/cactus-web-app

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