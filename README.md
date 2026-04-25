# 🌵 Cactus
**AI-Native Logistics Operating System | "Logistics with Soul."**

---

> *Rooted in gratitude, curiosity, faith, and creation, Cactus is an
> AI-native operating system pioneering e-commerce logistics in the
> age of abundance — harmonized data, friendly technology, and
> global delivery.*

---

## Identity

**Brand:** Cactus
**Legal Entity:** Cactus Logistics LLC (Utah)
**Future Brand:** Cactus OS
**Core Values:** Gratitude | Curiosity | Faith | Creation
**AI Philosophy:** AI is the central nervous system — not a feature.

---

## Product Vision — Three Phases

### Phase 1-2: Cactus as Middleware
WMS platforms call the Cactus Rating API. Cactus calls carriers,
applies markup, and returns rates. The WMS handles display and
selection. Cactus handles billing, invoicing, and reconciliation.

### Phase 3: Cactus as Full OS
Cactus builds its own WMS — complete end-to-end ownership of
the logistics stack. No dependency on third-party platforms.
Full warehouse management, inventory, pick/pack, and beyond.

The strategic advantage: by Phase 3, the Shadow Ledger will
have accumulated millions of shipments of intelligence from
third-party WMS integrations. The Cactus WMS launches already
smart — not starting from zero.

---

## Three-Phase Roadmap

### Phase 1 — Rating & Billing Engine (Current)
- Multi-carrier rate shopping (UPS, FedEx priority launch)
- Carrier invoice ingestion with AI-assisted normalization
- Lassoed and dark carrier account modes
- Single-Ceiling markup pipeline
- Invoice reconciliation with dispute flagging
- Pre-paid USPS metered wallet
- Post-paid weekly client invoicing with QuickBooks sync
- Warehance WMS integration (first lassoed integration)
- The Alamo: internal admin dashboard
- Cactus Portal: client-facing dashboard

### Phase 2 — Growth Carriers & Analytics
- USPS, UniUni, GOFO, ShipX, DHL eCommerce, DHL Express
- Sub-client markup (3PLs billing their own merchants)
- Analytics dashboard: trends, cost-per-package, margin health
- Vector embeddings for semantic carrier code normalization
- Rate volatility predictions from Shadow Ledger

### Phase 3 — Full WMS & B2B Expansion
- Cactus builds its own WMS — full logistics OS
- Warehouse management: aisles, bins, pick/pack, inventory
- LTL (Less-Than-Truckload) and FTL (Full Truckload) freight
- Ocean freight container event tracking
- Landmark Global, OSM, OnTrac carrier integrations
- Carrier scorecard intelligence by lane and geography

---

## Product Architecture

### The Two Portals

**Cactus Portal** (client-facing)
Shipment dashboard, tracking, meter balance, transaction
history, invoices, AI-powered insights. Never exposes raw
carrier costs or markup rates.

**The Alamo** (internal — Cactus admin only)
- Org and carrier account management
- Invoice upload, AI normalization, human review queue
- Dispute review and resolution
- Rate card management
- Audit logs, meter health, carrier scorecards

---

## Carrier Account Modes

### Lassoed Carrier Accounts
WMS/OMS integrated. Full label-print visibility.
Full reconciliation available.
Invoice matching: tracking number → shipment_ledger

### Dark Carrier Accounts
Client entered Cactus credentials directly into their platform
(e.g. ShipStation). No Cactus visibility at label print.
Billing only — no reconciliation.
Invoice matching: ship-from address → locations table

### The is_cactus_account Flag
- `TRUE` (default): Cactus earns margin, markup applied
- `FALSE`: Pass-through account, no owned revenue, skip markup

---

## Financial OS

### Billing Source of Truth
**The carrier invoice is ALWAYS the billing basis.**
Never bill from label print data or rating engine quotes.

### Bifurcated Settlement
- **USPS → Pre-paid Metered Wallet**
- **All others → Post-paid Weekly Invoice**

### Markup Pipeline (v1.6.0)
Two markup types are supported:

**PERCENTAGE markup** — applied to each charge component, summed,
then Single-Ceiling on total. Itemized columns on client CSV show
marked-up values.
```
base × (1 + markup) = base_marked
fuel × (1 + markup) = fuel_marked
... etc per component
SUM(marked components) = pre_ceiling_total
CEILING(pre_ceiling_total to next cent) = final_billed_rate
```

**FLAT markup** — applied ONCE to base_charge only. Surcharges pass
through raw. No separate markup column on client invoice — flat fee
folds into base_charge_billed.

Storage approach: raw carrier values + markup context stored per
line item. Per-charge billed values computed at READ time.
`final_billed_rate` materialized at Stage 5 as the authoritative
invoice total.

### Markup Hierarchy + Source Tracking (v1.6.0)
```
org_carrier_accounts.markup_percentage   ← admin-set primary markup
org_carrier_accounts.markup_flat_fee     ← admin-set flat fee alternative
  └── rate_cards (optional children)
        ← replace the BASE rate only; surcharges pass through raw
        ← if markup baked into rate card: set account markup = 0
```

Stored per invoice_line_items row at Stage 5 Billing Calc:
  `markup_type_applied`   'percentage' | 'flat'
  `markup_value_applied`  DECIMAL(10,6)
  `markup_source`         'carrier_account' | 'rate_card'

### Dispute Threshold
When carrier_charge vs. raw_carrier_cost variance
(both pre-markup — never compare to final_billed_rate) exceeds
`org_carrier_accounts.dispute_threshold`:
→ Line item flagged and held from billing
→ Alamo review required before releasing to client invoice

Note: `is_adjustment_only=TRUE` lines skip variance calc (no original
quote exists for standalone adjustments).

### Rate Sorting
Default: cheapest first (`final_billed_rate ASC`).
Residential and fuel surcharges already included in carrier
API responses — no special weighting needed.

---

## Invoice Display Rules (v1.6.0)
Per carrier_account_mode on each org_carrier_account:
  lassoed_carrier_account → client sees ONLY final_billed_rate
    (per-charge billed values computed at read time from raw +
     markup context — they sum to final_billed_rate within
     fractional cent rounding tolerance)
    Never expose: carrier_charge, markup details, variance
  dark_carrier_account → client sees carrier_charge + final_billed_rate
Checked per line item — an org can have lassoed UPS + dark DHL simultaneously

## Client Invoice Format
PDF: One-page summary only
  Total amount due + total shipments
  Breakdown by carrier (shipments + amount)
  Breakdown by origin location via locations.name (shipments + amount)
CSV: 85-column detail format (v1.6.0 — DEPRECATED the 58-column hybrid)
  Pass-through columns: tracking, dates, dims/weights, addresses, etc.
  Charge columns: per-charge billed values computed at read time
  Shipment Total = `final_billed_rate` (authoritative)
  Footnote: line items may show fractional-cent rounding

## User Roles (Cactus Portal)

| Role | Access | Notifications Default |
|---|---|---|
| ADMIN | Full access including user management | All ON |
| FINANCE | Full access except user management | All ON |
| STANDARD | All except sub-client billing | All OFF |

## Email Notifications
Four notification types — user-controlled in Cactus Portal:
- METER_RELOAD: sent when auto-reload fires
- INVOICE_READY: HTML summary + portal link for PDF/CSV download
- TRACKING_STATUS_ALERTS: daily 7am digest covering all anomalies
  NO_MOVEMENT, STALE_IN_TRANSIT, DAMAGED, UNDELIVERABLE,
  RETURNED_TO_SENDER — totals per category, portal link for detail
- PAYMENT_FAILED: auto-pull failed on invoice due date

Provider: Resend + React Email templates

---

## Carrier Roadmap

### Phase 1 — Launch
| Code | Carrier | Status |
|---|---|---|
| `UPS` | UPS | ⏳ Pending approval |
| `FEDEX` | FedEx | ✅ Developer account created |

### Phase 2 — Growth
| Code | Carrier | Notes |
|---|---|---|
| `USPS` | USPS | Path decision needed |
| `UNIUNI` | UniUni | Regional last-mile. No resi/fuel surcharge. |
| `GOFO` | GOFO (formerly Cirro) | Regional gig drivers + USPS national. No resi/fuel surcharge. |
| `SHIPX` | ShipX | Regional gig drivers + USPS national. Fuel surcharge, no resi surcharge. |
| `DHL_ECOM` | DHL eCommerce | Domestic + international. Sales relationship needed. |
| `DHL_EXPRESS` | DHL Express | International premium. Sales relationship needed. |

### Phase 3 — Scale
| Code | Carrier |
|---|---|
| `LANDMARK` | Landmark Global (international) |
| `OSM` | OSM Worldwide (postal consolidator) |
| `ONTRAC` | OnTrac (regional) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL via Supabase |
| Backend | TypeScript / Node.js |
| Frontend | Next.js + Tailwind CSS |
| Auth | Supabase Auth |
| AI | Anthropic Claude API |
| Payments | Stripe / Fortis |
| Accounting | QuickBooks Online |
| Version Control | GitHub |
| IDE | Cursor |

---

## Database Schema (v1.7.0 — 19 Tables)

```
organizations              → Tenant root
org_users                  → Auth → org (RLS anchor)
locations                  → Org addresses (multiple per org)
org_carrier_accounts       → Carrier profiles + markup
rate_cards                 → Optional custom rates
meters                     → USPS postage wallet
meter_transactions         → Immutable meter ledger
carrier_invoice_mappings   → Normalization layer (versioned + AI)
shipment_ledger            → One row per shipment (immutable)
carrier_invoices           → Uploaded invoice batches
invoice_line_items         → Individual carrier invoice lines
cactus_invoices            → Client-facing weekly invoices
cactus_invoice_line_items  → Junction: invoices ↔ line items
rate_shop_log              → Shadow Ledger (AI training dataset)
shipment_events            → Event sourcing timeline
audit_logs                 → Append-only action log
carrier_invoice_formats    → Column templates for headerless invoice files
carrier_charge_routing     → Self-improving charge routing table
notification_preferences   → User email notification settings
```

v1.6.0 schema changes: `invoice_line_items` renamed
`final_merchant_rate → final_billed_rate`, added
`markup_type_applied` / `markup_value_applied` / `markup_source` /
`is_adjustment_only`, dropped `markup_percentage` / `markup_flat_fee`.
Same rename applied to `shipment_ledger`, `rate_shop_log`,
`cactus_invoice_line_items`. See `database/migrations/v1.6.0-*.sql`
for full migration.

### Recent Changes
- **v1.7.0 (2026-04-25 — Session C.1):** Schema naming cleanup. 8 column
  renames standardizing on `postal_code` (not `zip`) and `line_1`/`line_2`
  (not `line1`/`line2`) across `invoice_line_items` and `locations`. Index
  renamed in lockstep. Shared `src/alamo/lib/address.ts` `normalizeAddress()`
  helper now used by parser and locations form. Last migration applied:
  v1.7.0 on 2026-04-25.

---

## Phase 1 Build Sequence

| Stage | Focus | Status |
|---|---|---|
| 1 | Schema v1.6.0 | ✅ Complete |
| 2 | Alamo shell | ✅ Complete |
| 3 | Org + carrier management | ✅ Complete |
| 4 | Invoice pipeline + matching + disputes | ✅ Complete |
| 5 | Invoice generation (PDF, CSV, /billing split) | ⏳ Session B completes (pipeline restructure + 85-col CSV) |
| 6 | Rating engine core | |
| 7 | UPS + FedEx API integrations | |
| 8 | Warehance WMS integration | |
| 9 | Cactus Portal | |
| Post | Phase 2 carriers | |

---

## Setup Instructions

### Fresh Supabase project
1. SQL Editor → run `database/database-setup.sql`
2. Run `database/seed-data.sql`
3. Run `database/verify-data.sql` — confirm all checks pass

### Environment variables (`.env`)
```
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Naming conventions
- Files & folders: `kebab-case`
- Database: `snake_case`
- JS/TS variables & functions: `camelCase`
- React components & TS types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Carrier account modes: `lassoed_carrier_account`, `dark_carrier_account`