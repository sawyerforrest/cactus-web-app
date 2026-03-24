# 🌵 CACTUS Logistics OS
**End-to-End Logistics | Small Parcel Focus | "Logistics with Soul."**

---

## 1. Vision & Core Values

Cactus is an AI-native logistics ecosystem for e-commerce 3PLs
and brands shipping 500+ small parcel orders per day.
Built to expand into B2B freight, WMS, and Ocean Freight.

**Core Values:** Gratitude | Curiosity | Creation
**AI Philosophy:** AI is the central nervous system — not a feature.

---

## 2. Three-Phase Roadmap

### Phase 1 — Rating & Billing Engine (Current)
- Multi-carrier rate shopping (UPS, FedEx, USPS, DHL, regional)
- Carrier invoice ingestion with AI-assisted normalization
- Lassoed and dark carrier account modes
- Single-Ceiling markup pipeline
- Invoice reconciliation with dispute flagging
- Pre-paid USPS metered wallet
- Post-paid weekly client invoicing with QuickBooks sync
- Warehance WMS integration (first lassoed integration)
- The Alamo: internal admin dashboard
- Cactus Portal: client-facing dashboard

### Phase 2 — Client-Facing Billing Suite & Analytics
- Sub-client markup (3PLs billing their own merchants)
- Analytics dashboard: trends, cost-per-package, margin health
- Vector embeddings for semantic carrier code normalization
- Rate volatility predictions from Shadow Ledger

### Phase 3 — Full WMS & B2B Expansion
- Warehouse management: aisles, bins, pick/pack
- LTL/FTL freight support
- Ocean freight container event tracking

---

## 3. Product Architecture

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

## 4. Carrier Account Modes

### Lassoed Carrier Accounts
WMS/OMS integrated. Cactus has full label-print visibility.
Full reconciliation available.
Invoice matching: tracking number → shipment_ledger

### Dark Carrier Accounts
Client entered Cactus credentials directly into their platform
(e.g. ShipStation). No Cactus visibility at label print.
Billing only — no reconciliation.
Invoice matching: ship-from address → locations table

### The is_cactus_account Flag
On every carrier account profile:
- `TRUE` (default): Cactus earns margin, markup applied
- `FALSE`: Pass-through account, no owned revenue, skip markup

---

## 5. Financial OS

### A. Billing Source of Truth
**The carrier invoice is ALWAYS the billing basis.**
Never bill from label print data or rating engine quotes.
Rating engine quotes are for reconciliation comparison only.

### B. Bifurcated Settlement
- **USPS → Pre-paid Metered Wallet**
- **All others → Post-paid Weekly Invoice**

### C. The Single-Ceiling Pipeline
```
carrier_charge × (1 + markup_percentage) = pre_ceiling_amount
CEILING(pre_ceiling_amount to next whole cent) = final_merchant_rate
```
Applied once to the shipment total. Never per surcharge component.

### D. Markup Hierarchy
```
org_carrier_accounts.markup_percentage  ← primary markup
rate_cards (optional)                   ← custom rate pricing
  └── If rate card exists: use rate card price
      Apply account markup on top
      Set account markup = 0 if baked into rate card
```

### E. Dispute Threshold
When carrier charge vs. quoted rate variance exceeds
`org_carrier_accounts.dispute_threshold`:
→ Line item flagged and held from billing
→ Alamo review required before releasing to client invoice

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL via Supabase |
| Backend | TypeScript / Node.js |
| Frontend | Next.js + Tailwind CSS |
| Auth | Supabase Auth |
| AI | Anthropic Claude API |
| Payments | Stripe / Fortis |
| Version Control | GitHub |
| IDE | Cursor |

---

## 7. Database Schema (v1.3.0 — 16 Tables)

```
organizations              → Tenant root
org_users                  → Auth → org mapping (RLS anchor)
locations                  → Org addresses (multiple per org)
org_carrier_accounts       → Carrier profiles + markup per org
rate_cards                 → Optional custom rates (children of carrier accounts)
meters                     → USPS postage wallet
meter_transactions         → Immutable meter ledger
carrier_invoice_mappings   → Normalization layer (versioned + AI)
shipment_ledger            → One row per shipment (immutable)
carrier_invoices           → Uploaded invoice batch tracking
invoice_line_items         → Individual carrier invoice lines
cactus_invoices            → Client-facing weekly invoices
cactus_invoice_line_items  → Junction: invoices ↔ line items
rate_shop_log              → Shadow Ledger (AI training dataset)
shipment_events            → Event sourcing timeline
audit_logs                 → Append-only action log
```

---

## 8. Phase 1 Build Sequence

| Stage | Focus |
|---|---|
| 1 | Schema v1.3.0 ✅ |
| 2 | The Alamo shell |
| 3 | Org + carrier account management |
| 4 | Invoice pipeline (upload → normalize → match → bill) |
| 5 | Rating engine core |
| 6 | UPS + FedEx API integrations |
| 7 | Warehance WMS integration |
| 8 | Cactus Portal |
| Post | USPS + UniUni integrations |

---

## 9. Supported Carriers (Phase 1)

| Code | Carrier | Priority |
|---|---|---|
| `UPS` | UPS | Launch |
| `FEDEX` | FedEx | Launch |
| `USPS` | USPS | Post-launch |
| `UNIUNI` | UniUni | Post-launch |
| `DHL_ECOM` | DHL eCommerce | Roadmap |
| `DHL_EXPRESS` | DHL Express | Roadmap |
| `LANDMARK` | Landmark Global | Roadmap |
| `ONTRAC` | OnTrac | Roadmap |
| `LSO` | Lone Star Overnight | Roadmap |

---

## 10. Setup Instructions

### Fresh Supabase project
1. SQL Editor → run `database/database-setup.sql`
2. Run `database/seed-data.sql`
3. Run `database/verify-data.sql`

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
