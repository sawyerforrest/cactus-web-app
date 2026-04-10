# CACTUS LOGISTICS OS — MASTER BRIEFING DOCUMENT
# VERSION: 1.4.6 | UPDATED: 2026-04-10
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

## 10. DATABASE SCHEMA (v1.4.7 — 18 TABLES — LIVE IN SUPABASE)

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

### Pending Phase 0 items
- [x] EIN received
- [ ] Mercury business bank account — after EIN
- [ ] UPS Developer Portal — waiting for approval
- [ ] Contact UniUni, GOFO, ShipX — after leaving BukuShip
- [ ] DHL eCommerce sales outreach — after leaving BukuShip
- [ ] Book Utah business attorney consult
- [ ] Create Stripe account under LLC

### Next task — START HERE next session

FIRST — fix sidebar active state on child pages:
  - Change pathname === item.href to pathname.startsWith(item.href)
  - Keeps parent nav item highlighted when on child routes
  - e.g. /invoices/[id] should keep Invoices highlighted

THEN — Stage 4 continued: Org matching + billing pipeline
  - Lassoed matching: tracking_number → shipment_ledger → org_id
  - Dark matching: address_sender_normalized → locations → org_id
  - Variance calculation: carrier_charge - quoted_rate
  - Dispute flagging: ABS(variance) > dispute_threshold → HELD
  - Markup + Single-Ceiling → final_merchant_rate
  - Release approved lines → cactus_invoices
  - Build /invoices/[id]/disputes page

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

---

## 13. BUSINESS FORMATION STATUS

| Item | Status |
|---|---|
| Utah LLC | ✅ Cactus Logistics LLC |
| EIN | ✅ Received |
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