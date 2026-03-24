# 🌵 CACTUS Logistics OS
**End-to-End Logistics | Small Parcel Focus | "Logistics with Soul."**

---

## 1. Vision & Core Values

Cactus is an AI-native logistics ecosystem built for e-commerce
3PLs (Third-Party Logistics providers) and brands shipping 500+
small parcel orders per day. Built to expand into B2B freight,
full WMS (Warehouse Management System), and Ocean Freight.

**Core Values:** Gratitude | Curiosity | Creation

**What makes Cactus different:**
- **AI as central nervous system** — not a bolt-on feature.
  Every architectural decision asks: "Does this make Cactus
  smarter over time?"
- **Proprietary data moat** — the Shadow Ledger captures every
  rate request, building a dataset competitors can't replicate
- **Event-sourced intelligence** — full timeline of every package
  gives AI the context to predict problems before clients notice
- **Financial integrity by design** — immutable ledgers,
  single-ceiling rounding, and full audit trails from day one

---

## 2. The Three-Phase Roadmap

### Phase 1 — Rating & Billing Engine (Current)
- Multi-carrier rate shopping (UPS, FedEx, USPS, DHL, regional)
- WMS/TMS/OMS integration via the Adapter Pattern
- Single-Ceiling markup pipeline
- Pre-paid USPS metered wallet with auto-reload
- Post-paid weekly invoicing for non-USPS carriers
- Carrier invoice normalization with AI-assisted mapping
- Shadow Ledger: logs every rate request for AI training
- Event Sourcing: full shipment timeline for AI intelligence
- Cactus Portal: client dashboard
- The Alamo: internal Cactus admin dashboard

### Phase 2 — Client-Facing Billing Suite & Analytics
- Sub-client markup (3PLs billing their own merchants)
- Invoice reconciliation with AI-flagged discrepancies
- Analytics: shipping trends, cost-per-package, margin health
- Vector embeddings for semantic carrier code normalization
- Rate volatility predictions from Shadow Ledger dataset
- APV (Automated Package Verification) dispute workflow

### Phase 3 — Full WMS & B2B Expansion
- Warehouse management: aisles, bins, pick/pack workflows
- Inventory and SKU (Stock Keeping Unit)-level tracking
- LTL (Less Than Truckload) and FTL (Full Truckload) support
- Ocean freight container event tracking
- Carrier scorecard intelligence by lane and geography

---

## 3. Product Architecture

### The Two Portals

**Cactus Portal** (client-facing)
Shipment dashboard, tracking, meter balance, transaction history,
invoices, and AI-powered insights. Never exposes raw carrier costs
or Cactus markup rates.

**The Alamo** (internal — Cactus admin only)
Rate card management, carrier credentials, normalization mappings,
AI flag review queue, audit logs, billing overrides, global meter
health, and carrier scorecard dashboard.

### The AI Layer
All AI calls route through a single `ai-service.ts` module.
Phase 1 features: normalization assistance and exception flagging.
Phase 2: vector search, rate prediction, autonomous reconciliation.

---

## 4. Financial OS

### A. Bifurcated Settlement
- **Pre-Paid (USPS only):** Metered wallet. Auto-reloads when
  balance drops below min_threshold. CC reloads incur 3% fee.
- **Post-Paid (all others):** Weekly consolidated invoice.
  Auto-pull on due_date.

### B. The Single-Ceiling Pipeline
All currency uses `DECIMAL(18,4)` — never floats.

```
Step 1: raw_carrier_cost × (1 + markup_percentage) = pre_ceiling_amount
Step 2: CEILING(pre_ceiling_amount to next whole cent) = final_merchant_rate
```

Ceiling applied **once** to the shipment total. Never per component.

**Example:**
```
raw_carrier_cost:  $12.3456
markup (15%):      $12.3456 × 1.15 = $14.19744
after ceiling:     $14.20 ← billed to client
```

---

## 5. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Database | PostgreSQL via Supabase | Primary data store |
| Backend | TypeScript / Node.js | API and rating engine |
| Frontend | Next.js + Tailwind CSS | Cactus Portal and Alamo UI |
| Auth | Supabase Auth | User login and sessions |
| AI | Anthropic Claude API | Normalization, flagging, insights |
| Payments | Stripe / Fortis | Meter reloads and invoice auto-pull |
| Version Control | GitHub | Code backup and history |
| IDE | Cursor | AI-assisted development |

---

## 6. Database Schema (v1.2.0 — 12 Tables)

Every record traces back to an `org_id` in `organizations`.

```
organizations          → Tenant root
org_users              → Auth user → org mapping (RLS anchor)
rate_cards             → Markup rules per carrier (versioned)
meters                 → USPS postage wallet (cached balance)
meter_transactions     → Immutable meter ledger
carrier_invoice_mappings → Normalization layer (versioned + AI)
shipment_ledger        → Single-Ceiling output (immutable)
cactus_invoices        → Weekly post-paid invoices
locations              → Ship-from addresses (Phase 3: warehouse)
audit_logs             → Append-only action log
rate_shop_log          → Shadow Ledger — AI training dataset ← NEW
shipment_events        → Event sourcing timeline ← NEW
```

### Why rate_shop_log?
Every rate request is logged here — even rates never selected.
Over time this becomes a proprietary dataset that teaches AI:
- Which carriers win on which lanes
- Where surcharge volatility is emerging
- What clients are price-sensitive vs. speed-sensitive
No competitor can buy or replicate this dataset.

### Why shipment_events?
Instead of updating a status column (which destroys history),
every status change becomes a new immutable row. AI reads the
full timeline to flag at-risk shipments, build carrier scorecards,
and eventually power proactive client alerts.

---

## 7. Setup Instructions

### First-time setup (fresh Supabase project)
1. Supabase → SQL Editor → run `database/database-setup.sql`
2. Run `database/seed-data.sql`
3. Run `database/verify-data.sql` — confirm `PASS ✓` on Check 6

### Environment variables
Create `.env` in project root (never commit this file):
```
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### Naming Conventions
- Files & folders: `kebab-case`
- Database tables & columns: `snake_case`
- Application code variables & functions: `camelCase`
- React components & TypeScript types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`

---

## 8. Supported Carriers (Phase 1)

| Code | Carrier |
|---|---|
| `UPS` | UPS |
| `FEDEX` | FedEx |
| `USPS` | USPS |
| `DHL_ECOM` | DHL eCommerce |
| `DHL_EXPRESS` | DHL Express |
| `UNIUNI` | UniUni |
| `LANDMARK` | Landmark Global |
| `ONTRAC` | OnTrac |
| `LSO` | Lone Star Overnight |

---

## 9. Key Architectural Decisions

**Why immutable ledgers?**
Financial and event records are never updated or deleted.
Corrections are new rows. Gives Cactus a perfect audit trail
and the full data history that AI requires to find patterns.

**Why Single-Ceiling instead of round?**
Rounding can go down, eroding margin. Ceiling always rounds up.
Applied once to the total — never per surcharge component.

**Why event sourcing for shipments?**
An AI cannot reason about what happened to a shipment if you've
overwritten the status. The event timeline is the raw material
for carrier intelligence, exception prediction, and proactive
client alerts.

**Why the Shadow Ledger?**
Rate requests not selected for purchase are invisible in a
standard system. Capturing them builds a dataset that answers
"why do clients choose one carrier over another?" — the question
that unlocks rate optimization and AI-powered recommendations.

**Why build rating engine before WMS?**
Establishes Cactus as a neutral integration partner for all WMS
platforms. When WMS launches in Phase 3, it targets clients who
don't have a WMS yet — not replacing existing partners.
