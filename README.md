# 🌵 CACTUS Logistics OS
**End-to-End Logistics | Small Parcel Focus | "Logistics with Soul."**

---

## 1. Vision & Core Values

Cactus is an AI-assisted logistics ecosystem built for e-commerce
3PLs (Third-Party Logistics providers) and brands shipping 500+
small parcel orders per day.

**Core Values:** Gratitude | Curiosity | Creation

**What makes Cactus different:**
- Margin-based revenue model — Cactus earns on the spread between
  negotiated carrier rates and marked-up client rates
- Financial integrity built into the database — immutable ledgers,
  single-ceiling rounding, and full audit trails from day one
- Modular architecture — built to expand from rating engine to
  full WMS without ever rebuilding the foundation

---

## 2. The Three-Phase Roadmap

### Phase 1 — Rating & Billing Engine (Current)
- Multi-carrier rate shopping engine (UPS, FedEx, USPS, DHL, and
  regional carriers)
- WMS/TMS/OMS integration layer via the Adapter Pattern
- Single-Ceiling markup pipeline (see Financial OS below)
- Pre-paid USPS metered wallet with auto-reload
- Post-paid weekly invoicing for all non-USPS carriers
- Carrier invoice normalization layer
- Cactus Portal: client dashboard for shipments, tracking, and meter
- The Alamo: internal admin dashboard for rate cards and audit logs

### Phase 2 — Client-Facing Billing Suite & Analytics
- Sub-client markup support (3PLs billing their own merchants)
- Invoice reconciliation: carrier invoice vs. label print data
- Analytics dashboard: shipping trends, cost-per-package, margin health
- APV (Automated Package Verification) dispute workflow

### Phase 3 — Full WMS & B2B Expansion
- Warehouse management: aisles, bins, pick/pack workflows
- Inventory management and SKU-level tracking
- LTL (Less Than Truckload) and FTL (Full Truckload) support

---

## 3. Product Architecture

### The Two Portals

**Cactus Portal** (client-facing)
The interface clients log into. Shows shipment history, tracking,
meter balance, transaction history, and invoices. Never exposes
raw carrier costs or Cactus markup rates.

**The Alamo** (internal — Cactus admin only)
Mission control for the Cactus team. Manages rate cards, carrier
credentials, normalization mappings, audit logs, and billing overrides.

### The Cactus API
High-performance integration layer that WMS, TMS, and OMS platforms
connect to for rate shopping and label purchasing.

---

## 4. Financial OS

### A. Bifurcated Settlement
Two separate billing flows based on carrier type:

**Pre-Paid (USPS only)**
Clients maintain a metered postage wallet. When the balance drops
below `min_threshold`, an auto-reload of `reload_amount` fires
against the stored payment method. CC reloads incur a 3%
processing fee. ACH reloads have no fee.

**Post-Paid (all other carriers)**
Shipments accumulate throughout the week. A consolidated invoice
is generated weekly and auto-pulled on the `due_date`.

### B. The Single-Ceiling Pipeline
All currency uses `DECIMAL(18,4)` — never floats.

```
Step 1: raw_carrier_cost × (1 + markup_percentage) = pre_ceiling_amount
Step 2: CEILING(pre_ceiling_amount to next whole cent) = final_merchant_rate
```

The ceiling is applied **once** to the shipment total — never
per individual surcharge. This protects clients from systematic
over-charges while ensuring Cactus never absorbs rounding losses.

**Example:**
```
raw_carrier_cost:    $12.3456
markup (15%):        $12.3456 × 1.15 = $14.19744
after ceiling:       $14.20  ← what the client is billed
```

---

## 5. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Database | PostgreSQL via Supabase | Primary data store |
| Backend | TypeScript / Node.js | API and rating engine |
| Frontend | Next.js + Tailwind CSS | Cactus Portal and Alamo UI |
| Auth | Supabase Auth | User login and session management |
| Payments | Stripe / Fortis | Meter reloads and invoice auto-pull |
| Version Control | GitHub | Code backup and history |
| IDE | Cursor | AI-assisted development environment |

---

## 6. Database Schema (v1.1.0)

Ten tables. Every record in every table traces back to an
`org_id` in `organizations`.

```
organizations          → The tenant root
org_users              → Maps users to orgs (RLS anchor)
rate_cards             → Markup rules per org per carrier
meters                 → USPS postage wallet per org
meter_transactions     → Immutable ledger of all meter activity
carrier_invoice_mappings → Carrier header normalization (versioned)
shipment_ledger        → One row per shipment (immutable)
cactus_invoices        → Weekly post-paid invoices
locations              → Ship-from addresses (Phase 3: warehouse bins)
audit_logs             → Append-only integrity log
```

---

## 7. Setup Instructions

### First-time setup (fresh Supabase project)

1. In Supabase SQL Editor, run `database/database-setup.sql`
2. Run `database/seed-data.sql`
3. Run `database/verify-data.sql` to confirm everything is correct

### Environment variables
Create a `.env` file in the project root (never commit this):
```
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Naming Conventions
- Files & folders: `kebab-case`
- Database tables & columns: `snake_case`
- Application code: `camelCase`
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
Financial records (shipments, meter transactions, audit logs) are
never updated or deleted. All corrections are new rows. This gives
Cactus a perfect audit trail and protects against accidental or
malicious data loss.

**Why Single-Ceiling instead of rounding?**
Rounding can go down, meaning Cactus absorbs fractions of cents
on every shipment. At scale (500+ shipments/day), this erodes margin.
Ceiling always rounds up, ensuring every shipment is revenue-neutral
or better for Cactus.

**Why build the WMS after the rating engine?**
Building the rating engine first establishes Cactus as a neutral
integration partner for all WMS platforms. When the WMS is built
later, it targets clients who don't have a WMS yet — not replacing
existing partners.
