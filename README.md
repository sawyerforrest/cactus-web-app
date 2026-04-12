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

### The Single-Ceiling Pipeline
```
carrier_charge × (1 + markup_percentage) = pre_ceiling_amount
CEILING(pre_ceiling_amount to next whole cent) = final_merchant_rate
```
Applied once to the shipment total. Never per surcharge component.

### Markup Hierarchy
```
org_carrier_accounts.markup_percentage  ← primary markup
rate_cards (optional children)          ← custom rate pricing
  └── If rate card exists: use rate card price
      Apply account markup on top
      Set account markup = 0 if markup baked into rate card
```

### Dispute Threshold
When carrier_charge vs. raw_carrier_cost variance
(both pre-markup — never compare to final_merchant_rate) exceeds
`org_carrier_accounts.dispute_threshold`:
→ Line item flagged and held from billing
→ Alamo review required before releasing to client invoice

### Rate Sorting
Default: cheapest first (`final_merchant_rate ASC`).
Residential and fuel surcharges already included in carrier
API responses — no special weighting needed.

---

## Invoice Display Rules
Per carrier_account_mode on each org_carrier_account:
  lassoed_carrier_account → client sees ONLY final_merchant_rate
    Never expose: carrier_charge, markup_percentage, variance
  dark_carrier_account → client sees carrier_charge + final_merchant_rate
Checked per line item — an org can have lassoed UPS + dark DHL simultaneously

## Client Invoice Format
PDF: One-page summary only
  Total amount due + total shipments
  Breakdown by carrier (shipments + amount)
  Breakdown by origin location via locations.name (shipments + amount)
CSV: Full line item detail, same display rules as PDF

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
- TRACKING_LABEL_STALE: shipment stuck in label created > threshold
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

## Database Schema (v1.5.0 — 19 Tables)

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

---

## Phase 1 Build Sequence

| Stage | Focus | Status |
|---|---|---|
| 1 | Schema | ✅ Complete |
| 2 | Alamo shell | ✅ Complete |
| 3 | Org + carrier management | ✅ Complete |
| 4 | Invoice pipeline | ⏳ In Progress |
| 5 | Rating engine core | |
| 6 | UPS + FedEx API integrations | |
| 7 | Warehance WMS integration | |
| 8 | Cactus Portal | |
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