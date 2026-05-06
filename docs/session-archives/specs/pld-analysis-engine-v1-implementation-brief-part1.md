# PLD Analysis Engine v1 — Implementation Brief

**Document type:** Senior Architect handoff to Claude Code
**Project:** Cactus Logistics OS — Phase 1 expansion
**Module name:** PLD Analysis Engine (internal) / PLD/Rate Analysis (future external)
**Target environment:** `cactus-web-app/src/alamo/pld-analysis/`
**Schema version:** v1.10.0 (Supabase project `wfzscshukatnxlnebstj`)
**Author:** Claude (Senior Architect, in conversation with Sawyer)
**Date:** 2026-05-04

---

## Section 0 — How to Use This Brief

You are Claude Code. You are receiving this brief from the Senior Architect (Claude in chat). The Senior Architect has had a full design conversation with Sawyer, the Cactus founder, and produced this document as the binding specification for v1.

**Reading order:**
1. Read Section 0 (this section) and Section 1 (project context) end-to-end before starting any work.
2. Read all of Section 2 (architecture decisions) before writing any code.
3. Read Sections 3-10 (phased implementation) sequentially, executing one phase at a time.
4. Each phase has acceptance criteria. Do not advance to the next phase until the current phase passes its acceptance criteria.
5. If anything in this brief contradicts the master briefing (`cactus-master-briefing.md`), this brief takes precedence for PLD Analysis Engine work specifically. The master briefing should be updated in parallel via the cowork command provided.

**When to escalate to chat (Senior Architect):**
- Any architectural decision not explicitly covered in this brief
- Any conflict between this brief and the master briefing that isn't about PLD work
- Any technical blocker that requires more than 30 minutes of debugging without clear progress
- Any time you discover a design assumption in this brief that doesn't match real-world data
- Any UI design question not resolved by the wireframe descriptions provided

**Conventions used in this brief:**
- File paths in backticks: `src/alamo/pld-analysis/some-file.ts`
- Schema names in backticks: `pld_analysis_runs`
- TypeScript identifiers in backticks: `RatingEngine`, `ratingEngine.computeRate(...)`
- Algorithm pseudocode in fenced code blocks
- Required precision on monetary calculations: ALL math uses `decimal.js`. Never use native JS Number for currency.

---

## Section 1 — Project Context

### What this tool does

The PLD Analysis Engine is Cactus's internal sales tool. A sales rep (currently Sawyer, eventually a sales team) takes a prospect's historical shipment data — a CSV file with one row per shipment over some period — and runs it through the engine. The engine re-rates every shipment against Cactus's contracted rate cards across selected carriers, then produces three outputs:

1. **Polished client-facing PDF** showing the prospect's potential savings if they switched to Cactus
2. **Per-shipment verification CSV** the prospect can audit
3. **Internal margin view** showing Cactus's profit per shipment (Cactus eyes only)

This is a high-leverage tool: it converts an opaque "we'll save you money on shipping" pitch into a concrete dollar figure backed by line-by-line analysis. Sawyer's hypothesis is that the tool's existence and quality will materially improve close rates on prospects.

### v1 scope

**Carriers:** DHL eCommerce + GOFO. Both rate-card-based; no carrier API integration required.

**Users:** Internal Cactus team (currently Sawyer alone, schema and code prepared for multi-user v1.5).

**Where it lives:** Inside the Alamo (Cactus's internal admin dashboard) at `cactus-web-app/src/alamo/pld-analysis/`.

**Future expansion (NOT in v1, but architecture must accommodate):**
- v1.5: USPS, UniUni, ShipX rate cards
- v1.5: Automated EIA diesel price fetcher (already in v1 scope; see Phase 7)
- v2: FedEx, UPS, DHL Express via carrier APIs
- v2: Cactus Portal access (Layer 2 — 3PL clients run analyses for their merchants)

### What "done" means for v1

- Sawyer can upload a CSV via the Alamo UI
- The engine rates every shipment against selected Cactus carriers
- The system produces all three outputs (PDF, per-shipment CSV, internal view)
- The 5 Logistics regression test passes (Test A: exact $1,556.12 reproduction in base-only mode)
- The same engine works for any future prospect's CSV without code changes
- All financial math uses `decimal.js` with `DECIMAL(18,4)` storage
- All tables have RLS enabled
- All immutable tables honor Rule 6 from the master briefing
- The dynamic methodology footnote on the PDF accurately describes each unique run

---

## Section 2 — Architecture Decisions (Locked, Do Not Revisit)

These are decisions made in the design conversation. They are LOCKED. If implementation reveals one of these is wrong, escalate to chat — do not silently change.

### 2.1 Schema separation
PLD Analysis tables are SEPARATE from production rate cards. Production billing uses `public.rate_cards` and related tables. PLD Analysis uses `analysis_rate_cards` and the `pld_analysis_*` family. They share the `organizations` table (for converted leads), `auth.users` table (for created_by), and `carrier_code_enum` (extended in this brief).

### 2.2 Naming
- Internal/code/database name: `pld_analysis_*`
- External/UI name (when client-facing portal launches): "PLD/Rate Analysis"
- v1 internal UI labels: "PLD Analysis"
- Folder: `src/alamo/pld-analysis/` and `src/core/pld-analysis/`
- All names follow snake_case for DB, camelCase for TS variables, PascalCase for TS types and React components, kebab-case for files and folders

### 2.3 CSV input format
Plain CSV file. 14 required columns + 3 suggested. Headers exact-match (case-sensitive). Any header mismatch is a hard validation error returned to the user.

### 2.4 Multi-carrier rating
User selects which Cactus carriers to rate against. Engine rates every shipment against every selected carrier where service-level mapping exists. Winner is the lowest quoted_rate where rating_status = OK. Ties broken by carrier preference (DHL > GOFO). Tied shipments flagged for manual review post-run.

### 2.5 Markup model
Four strategy types: RATE_CARD, FIXED_AMOUNT, FIXED_PERCENTAGE, TIERED.
- RATE_CARD: client rate card cell IS the quoted rate. Margin = client cell minus base cost cell.
- FIXED_AMOUNT: quoted = base + flat $/shipment.
- FIXED_PERCENTAGE: quoted = base × (1 + %). Has fuel_markup_treatment field for DHL: COMPOUND or ADDITIVE.
- TIERED: per-tier rules in `markup_strategy_tiers`. Each tier independently FIXED_AMOUNT or FIXED_PERCENTAGE.

Strategies are reusable (lead_id NULL = global) or lead-specific (lead_id populated).

### 2.6 Fuel surcharge model (DHL eCom only in v1)
DHL fuel is per-pound dollar amount, indexed to weekly national diesel price. Sub-1-lb packages billed as 1 lb minimum (`fuel_billable_lb = MAX(billable_weight_lb, 1.0)`). Fuel only applies to DHL eCom in v1; GOFO has no fuel.

Diesel price stored in `diesel_price_history` table, weekly. Fetched automatically every Monday via Supabase Edge Function from EIA's public API. Manual entry also supported.

DHL fuel tier table stored in `dhl_ecom_fuel_tiers`, loaded from DHL's published PDF. New schedule per effective_date when DHL publishes one.

### 2.7 Compound vs Additive
- COMPOUND: quoted = (base + fuel) × (1 + markup%)
- ADDITIVE: quoted = (base × (1 + markup%)) + fuel

Per markup strategy, defaults to COMPOUND (industry standard). Only meaningful for DHL strategies.

### 2.8 Zone resolution per carrier
Three modes:
- ORIGIN_DEST_ZIP3: DHL eCom domestic, GOFO Standard, future USPS
- ORIGIN_COUNTRY_DEST_COUNTRY: DHL eCom international
- INJECTION_POINT_DEST_ZIP5: GOFO Regional

Zone is always recomputed from origin/dest ZIP. Source-provided zone is audit-only — mismatches flagged.

### 2.9 GOFO Regional hub assignment
At warehouse creation, system computes nearest hub from warehouse ZIP via `gofo_hub_proximity` table (Haversine pre-computed). Stored in `lead_warehouses.preferred_gofo_hub`. User can override before rating. All shipments from that warehouse use that hub for GOFO Regional rating.

### 2.10 GOFO Standard remote variant
GOFO Standard has a separate "remote" rate card variant for non-continental US ZIPs. Engine checks `gofo_remote_zip3s` for the destination's ZIP3; if match, use the remote variant rate card. Otherwise use the standard variant.

### 2.11 Coverage handling
GOFO Regional only covers ~70% of US ZIPs (8,361 ZIPs across 7 hubs). For non-serviceable destinations:
- If multi-carrier selected, fall through to other selected carriers
- If only GOFO Regional selected, mark NO_COVERAGE
- Disclosed in PDF methodology footnote

### 2.12 Service level mapping
- Strict enum on Cactus side (DHL_ECOM:Ground, DHL_ECOM:Expedited, etc.)
- Source service levels (free text from CSV) mapped to Cactus enum via per-lead `lead_service_level_mappings`
- Global defaults seeded in `global_service_level_mapping_defaults` (e.g., "GMP" → DHL_ECOM:Ground)
- Mapping UI shown pre-run (must complete before rating starts)
- Editable post-run (triggers re-rate, creating a new run version via `parent_run_id`)

### 2.13 Run versioning
Runs are append-only. Editing mappings post-run creates a NEW run with `parent_run_id` linking back. Original run preserved. `pld_analysis_shipments` is immutable once parent run.status = 'COMPLETE'.

### 2.14 Soft-delete
Soft-delete on: `leads`, `pld_analysis_runs`, `analysis_rate_cards`, `markup_strategies`. Children inherit via parent's `deleted_at`. Database views (`active_*`) provide filtered access without scattering `WHERE deleted_at IS NULL` across the codebase.

### 2.15 Currency
USD only for v1. All monetary columns include `currency_code CHAR(3) NOT NULL DEFAULT 'USD'` for future-proofing. PDF displays plain `$1,556` without currency code.

### 2.16 Decimal precision
All monetary values: `DECIMAL(18,4)` in DB, `decimal.js` in TypeScript. Never native JS Number. This honors Rule 1 of the master briefing.

### 2.17 Upload limits
- Max file size: 100 MB
- Max rows: no hard limit, but expect realistic upper bound around 100,000 rows
- Processing: async via background worker. Progress tracked on `pld_analysis_runs.progress_pct`

### 2.18 Annualization
Sample window detected from min/max ship_date:
- 1 day → ×260 (working days/year)
- 2-7 days → ×52 (weekly)
- 8-31 days → ×12 (monthly)
- 32-92 days → ×4 (quarterly)
- 93-365 days → ratio-based projection to full year
- >365 days → no annualization, show actual

### 2.19 PDF generation
`@react-pdf/renderer`. Single-page client-facing PDF. Cactus brand colors (Forest #2D5A27, Amber #D97706, Sand #F0EEE9, Ink #0D1210). Cactus logo letterhead band at top, Forest title bar below. No shadows, no gradients, 0.5px borders.

### 2.20 Three deliverables per run
1. Client PDF (savings only, no margin/cost)
2. Per-shipment verification CSV (safe for prospect, no margin)
3. Internal margin view (Cactus only, full breakdown)

### 2.21 Methodology footnote
Generated dynamically per run, stored on run record (`methodology_footnote_text TEXT`). Reproducible — re-rendering produces same footnote. Components conditional on run parameters (period, carriers, fuel mode, coverage gaps, annualization).

### 2.22 DIM weight
Per rate card. `dim_factor`, `dim_min_weight_lb`, `dim_min_volume_cuin` columns on `analysis_rate_cards`. v1 known factors:
- DHL eCom Domestic: 139
- DHL eCom International: 166
- GOFO Standard: 166
- GOFO Regional: 194

DIM applies only when actual_weight > dim_min_weight_lb AND volume > dim_min_volume_cuin. Billable weight = max(actual, DIM if applicable).

### 2.23 Weight rounding
- Domestic ≤16 oz → ceil to next OZ
- Domestic >16 oz → ceil to next LB
- International → ceil to next 1/16 lb break

### 2.24 Lead-to-org conversion
Manual button "Convert lead to org" in Alamo with confirmation dialog. Creates organizations row, sets `leads.converted_to_org_id` and `leads.converted_at`. Analyses stay attached to lead — query through `leads.converted_to_org_id` for customer history.

### 2.25 Audit logging
Write `audit_logs` rows for: lead created, lead converted, run started, run completed, run re-rated, markup strategy attached/changed, service level mapping created/edited.

---

## Section 3 — Phase 1: Schema Migrations

### Goal
Apply 9 SQL migrations to Supabase, bringing the database from v1.7.0 (19 tables) to v1.10.0 (40 tables).

### Pre-flight checklist
- [ ] Verify Supabase project `wfzscshukatnxlnebstj` is the target
- [ ] Verify current schema version matches v1.7.0 expectations (19 tables, listed in master briefing Section 10)
- [ ] Create a Supabase development branch for testing migrations
- [ ] Read `docs/schema-code-audit-checklist.md` (per master briefing Section 14) before touching schema

### Migration files to produce
Create these as separate files in `database/migrations/`:

1. **`v1.10.0-001-extend-carrier-enum.sql`** — extends `carrier_code_enum` with AMAZON, EPOST_GLOBAL, CIRRO, SPEEDX, ASENDIA. Use `ALTER TYPE ... ADD VALUE IF NOT EXISTS` (non-destructive).

2. **`v1.10.0-002-pld-enums.sql`** — creates 13 new enums:
   - `lead_company_profile_enum`
   - `lead_label_software_enum`
   - `lead_source_type_enum`
   - `lead_stage_enum`
   - `gofo_hub_enum`
   - `analysis_rate_card_purpose_enum`
   - `markup_strategy_type_enum`
   - `markup_tier_type_enum`
   - `zone_resolution_mode_enum`
   - `analysis_run_status_enum`
   - `shipment_rating_status_enum`
   - `fuel_markup_treatment_enum`
   - `weight_unit_enum` (OZ, LB, KG)

3. **`v1.10.0-003-leads-tables.sql`** — creates `leads`, `lead_current_carriers`, `lead_warehouses`, `lead_service_level_mappings`. Plus indexes.

4. **`v1.10.0-004-zone-data.sql`** — creates `carrier_zone_matrices`, `carrier_country_zone_matrices`, `gofo_regional_zone_matrix`, `gofo_hubs`, `zip3_centroids`, `gofo_hub_proximity`, `service_coverage_zips`, `gofo_remote_zip3s`. Includes seed data for `gofo_hubs` (7 rows hardcoded with lat/long from this brief). Other tables seeded later via admin upload UI.

5. **`v1.10.0-005-rate-cards.sql`** — creates `analysis_rate_cards`, `analysis_rate_card_cells`. Includes the parent-child constraint (LEAD_QUOTED requires parent_rate_card_id and lead_id).

6. **`v1.10.0-006-markup-strategies.sql`** — creates `markup_strategies`, `markup_strategy_tiers`. Includes the strategy-type-fields constraint.

7. **`v1.10.0-007-pld-runs.sql`** — creates `pld_analysis_runs`, `pld_analysis_run_strategies`, `pld_analysis_run_service_mappings`, `global_service_level_mapping_defaults`. Includes JSONB columns for cached aggregations.

8. **`v1.10.0-008-pld-shipments.sql`** — creates `pld_analysis_shipments`, `pld_analysis_shipment_rates`. Includes immutability trigger that prevents UPDATE/DELETE on shipments where parent run.status = 'COMPLETE'.

9. **`v1.10.0-009-fuel-tables.sql`** — creates `dhl_ecom_fuel_tiers`, `diesel_price_history`. Indexes for ship_date lookup.

10. **`v1.10.0-010-rls-policies.sql`** — enables RLS on all 21 new tables and creates policies. v1: `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — single-user, all-access. Multi-user RLS hardening deferred to v1.5.

11. **`v1.10.0-011-views.sql`** — creates database views for soft-delete:
    - `active_leads`
    - `active_pld_analysis_runs`
    - `active_analysis_rate_cards`
    - `active_markup_strategies`
    Application code reads from views; admin/audit code reads base tables.

12. **`v1.10.0-012-seed-reference.sql`** — seed data for:
    - `gofo_hubs` (already in 004 — verify only)
    - `gofo_remote_zip3s` (29 ZIP3 prefixes from GOFO Standard remote area file)
    - `dhl_ecom_fuel_tiers` (18 tiers from DHL May 2026 published schedule)
    - `global_service_level_mapping_defaults` (initial 30-50 common synonyms — see Section 11.2)

### Schema specifics

The exact column definitions for each table are detailed in conversation history. Key requirements you must honor:

**`leads`:**
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  company_profile lead_company_profile_enum NOT NULL,
  label_generation_software lead_label_software_enum,
  label_generation_software_other TEXT,
  website TEXT,
  lead_source_type lead_source_type_enum NOT NULL,
  lead_source_name TEXT,
  primary_contact_name TEXT NOT NULL,
  primary_contact_email TEXT NOT NULL,
  primary_contact_phone TEXT,
  monthly_label_volume INTEGER,
  estimated_monthly_margin NUMERIC(18, 4),
  estimated_monthly_margin_currency CHAR(3) NOT NULL DEFAULT 'USD',
  stage lead_stage_enum NOT NULL DEFAULT 'NEW',
  converted_to_org_id UUID REFERENCES organizations(id),
  converted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);
```

**`pld_analysis_runs`:**
```sql
CREATE TABLE pld_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  run_name TEXT NOT NULL,
  run_version INTEGER NOT NULL DEFAULT 1,
  parent_run_id UUID REFERENCES pld_analysis_runs(id),
  source_file_name TEXT,
  source_file_path TEXT,
  source_row_count INTEGER,
  status analysis_run_status_enum NOT NULL DEFAULT 'DRAFT',
  progress_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  period_start_date DATE,
  period_end_date DATE,
  selected_carriers carrier_code_enum[] NOT NULL,
  fuel_treatment_mode TEXT NOT NULL DEFAULT 'full' CHECK (fuel_treatment_mode IN ('full', 'base_only')),
  aggregations_internal JSONB,
  aggregations_client JSONB,
  methodology_footnote_text TEXT,
  has_coverage_gaps BOOLEAN NOT NULL DEFAULT FALSE,
  has_tied_shipments BOOLEAN NOT NULL DEFAULT FALSE,
  has_stale_data BOOLEAN NOT NULL DEFAULT FALSE,
  has_peak_season BOOLEAN NOT NULL DEFAULT FALSE,
  annualization_factor NUMERIC(8, 4),
  annualization_period TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  rated_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);
```

**Immutability trigger for `pld_analysis_shipments`:**
```sql
CREATE OR REPLACE FUNCTION prevent_completed_run_shipment_mutation()
RETURNS TRIGGER AS $$
DECLARE
  parent_status analysis_run_status_enum;
BEGIN
  SELECT status INTO parent_status FROM pld_analysis_runs WHERE id = OLD.run_id;
  IF parent_status = 'COMPLETE' THEN
    RAISE EXCEPTION 'Cannot mutate shipments of a COMPLETE run. Re-rate via new run instead.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pld_analysis_shipments_immutable_when_complete
  BEFORE UPDATE OR DELETE ON pld_analysis_shipments
  FOR EACH ROW EXECUTE FUNCTION prevent_completed_run_shipment_mutation();
```

### GOFO hub seed data (load in migration 004)
```sql
INSERT INTO gofo_hubs (hub_code, hub_name, city, state, primary_zip5, latitude, longitude) VALUES
  ('LAX',     'Los Angeles',          'Los Angeles',     'CA', '90045', 33.9416, -118.4085),
  ('DFW',     'Dallas/Fort Worth',    'Dallas',          'TX', '75261', 32.8998,  -97.0403),
  ('ORD',     'Chicago O''Hare',      'Chicago',         'IL', '60666', 41.9742,  -87.9073),
  ('EWR_JFK', 'New York/New Jersey',  'Newark',          'NJ', '07114', 40.6895,  -74.1745),
  ('ATL',     'Atlanta',              'Atlanta',         'GA', '30320', 33.6407,  -84.4277),
  ('MIA',     'Miami',                'Miami',           'FL', '33126', 25.7959,  -80.2870),
  ('SLC',     'Salt Lake City',       'Salt Lake City',  'UT', '84122', 40.7899, -111.9791);
```

### Acceptance criteria for Phase 1
- [ ] All 12 migration files apply cleanly to a fresh dev branch (no errors)
- [ ] `Supabase:list_tables` returns 40 tables in the public schema
- [ ] Carrier code enum contains all expected values (run `SELECT enum_range(NULL::carrier_code_enum)`)
- [ ] All 13 new enums exist
- [ ] `gofo_hubs` has exactly 7 rows
- [ ] `gofo_remote_zip3s` has 29 rows
- [ ] `dhl_ecom_fuel_tiers` has 18 rows for effective_date 2026-05-30
- [ ] `global_service_level_mapping_defaults` has at least 30 rows (synonyms; see Section 11.2)
- [ ] All 21 new tables have RLS enabled
- [ ] All 4 active_* views work (e.g., `SELECT * FROM active_leads` runs without error)
- [ ] Immutability trigger on `pld_analysis_shipments` is active
- [ ] Smoke test: insert one lead → insert one warehouse → insert one analysis run → query through `active_leads` view → all succeed

### Phase 1 ready signal
Run `Supabase:list_tables` with `verbose=false`. Expect 40 tables. Report results back to chat for review before advancing to Phase 2.

---

## Section 4 — Phase 2: Reference Data Loaders

### Goal
Build admin UIs (Alamo screens) for loading reference data into the new tables. This is data infrastructure — Phase 3 (rating engine) needs this data populated to function.

### Reference data items and load methods

| Data | Source | Load method | Cadence |
|---|---|---|---|
| `zip3_centroids` | US Census ZCTA | One-time seed script | Annual update (rare) |
| `gofo_hub_proximity` | Computed from above | Migration script (Haversine) | Recompute on hub change |
| `gofo_regional_zone_matrix` | GOFO published file | Admin upload UI (XLSX) | Per matrix_version |
| `service_coverage_zips` | GOFO published file | Admin upload UI (XLSX) | Per update |
| `dhl_ecom_fuel_tiers` | DHL published PDF | Admin upload UI (extract from PDF) or manual entry | Per effective_date |
| `diesel_price_history` | EIA public API | Automated weekly fetch + manual override | Weekly |
| `analysis_rate_cards` (Cactus base cost) | Cactus internal | Admin upload UI (XLSX) | Per version |
| `analysis_rate_cards` (lead-quoted) | Cactus negotiated | Admin upload UI (XLSX) or manual entry | Per lead, per version |
| `carrier_zone_matrices` | DHL published files | Admin upload UI (XLSX) | Per matrix_version |
| `carrier_country_zone_matrices` | DHL published files | Admin upload UI (XLSX) | Per matrix_version |

### Sub-phase 2a — One-time seeds (run as migrations)
1. ZIP3 centroids from Census ZCTA data. Source: https://www.census.gov/geographies/reference-files.html (ZCTA Gazetteer files). Load ~920 rows.
2. GOFO hub proximity: compute Haversine distance from each ZIP3 to all 7 hubs, rank, store. ~6,440 rows. Computed in a JS/TS migration helper, not raw SQL.
3. GOFO remote ZIP3s: 29 entries from `gofo_remote_areas_zip_list.xlsx`.
4. DHL eCom fuel tiers: 18 rows from `dec-us-fuel-surcharges-domestic-effective-053026.pdf`.

### Sub-phase 2b — Admin upload UIs
Build at `src/alamo/pld-analysis/reference-data/`:

**Pages:**
- `/alamo/pld-analysis/reference-data` — index page listing all reference data sources with status (last loaded, row counts, version)
- `/alamo/pld-analysis/reference-data/zone-matrices` — upload zone matrix XLSX files (DHL eCom domestic, intl, GOFO Standard, GOFO Regional)
- `/alamo/pld-analysis/reference-data/coverage-zips` — upload service coverage ZIP lists
- `/alamo/pld-analysis/reference-data/fuel-tiers` — upload or manually enter DHL fuel tier table
- `/alamo/pld-analysis/reference-data/diesel-prices` — view weekly diesel price history, manual entry, manual trigger of EIA fetch
- `/alamo/pld-analysis/reference-data/rate-cards` — upload analysis rate cards (XLSX), preview cells before commit, set as active version

**Upload flow pattern:**
1. User uploads file
2. System parses, shows preview (first 50 rows + summary)
3. User reviews and confirms
4. System inserts in batches of 1,000 inside a transaction
5. On success, increments version and updates "active version" pointer
6. Audit log entry written

### Sub-phase 2c — EIA diesel price automation
**Edge Function:** `supabase/functions/fetch-eia-diesel/index.ts`

```typescript
// Pseudocode
async function fetchEIADiesel() {
  const apiKey = Deno.env.get('EIA_API_KEY');
  const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[product][]=EPD2D&facets[duoarea][]=NUS&start=${lastSundayMinus30Days}&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=10`;
  const response = await fetch(url);
  const data = await response.json();
  
  // Insert any new weeks not already in diesel_price_history
  for (const row of data.response.data) {
    await supabase.from('diesel_price_history').upsert({
      effective_week_start: row.period,
      effective_week_end: addDays(row.period, 6),
      national_avg_price: row.value,
      source: 'EIA',
      source_url: 'https://www.eia.gov/petroleum/gasdiesel/',
    }, { onConflict: 'effective_week_start', ignoreDuplicates: true });
  }
}
```

Schedule via Supabase pg_cron extension to run every Monday at 11:00 UTC (7 AM ET). Send notification to admin if fetch fails.

### Acceptance criteria for Phase 2
- [ ] All four one-time seeds applied (zip3_centroids, gofo_hub_proximity, gofo_remote_zip3s, dhl_ecom_fuel_tiers)
- [ ] All admin upload UIs functional with at least DHL eCom Charlotte custom card uploaded as test
- [ ] At least 5 GOFO Regional zone matrix entries loaded as smoke test
- [ ] EIA Edge Function deployed and successfully fetches at least 4 weeks of historical diesel data
- [ ] EIA scheduled cron job confirmed to run weekly
- [ ] Reference data index page shows all data sources with current row counts

---

## Section 5 — Phase 3: Rating Engine Core

### Goal
Build the carrier-agnostic rating engine in `src/core/pld-analysis/rating-engine.ts`. This module accepts a normalized shipment + carrier + service + markup strategy, returns a complete rate result.

### Module structure

```
src/core/pld-analysis/
  rating-engine.ts              ← orchestrator
  zone-resolver.ts              ← computes zone given carrier + origin + dest
  weight-calculator.ts          ← actual vs DIM, weight rounding
  rate-card-lookup.ts           ← given (card_id, zone, weight, unit), return rate
  fuel-calculator.ts            ← DHL fuel calculation
  markup-applier.ts             ← applies strategy to base + fuel
  service-matcher.ts            ← maps source service → cactus service
  carrier-router.ts             ← determines which Cactus carriers can rate this shipment
  types.ts                      ← TypeScript types for inputs and outputs
  __tests__/                    ← unit tests
```

### Core types

```typescript
// types.ts
import Decimal from 'decimal.js';

export interface NormalizedShipment {
  trackingNumber: string;
  shipDate: Date;
  sourceCarrier: CarrierCode;
  sourceServiceLevel: string;
  originZip: string;       // 5-digit, validated
  destZip: string | null;  // null for intl
  destCountry: string;     // ISO-3166 alpha-2
  weightValue: Decimal;
  weightUnit: 'OZ' | 'LB' | 'KG';
  length: Decimal | null;
  width: Decimal | null;
  height: Decimal | null;
  dimUnit: 'IN' | 'CM' | null;
  currentCarrierCharge: Decimal;
  residentialFlag: boolean | null;
  sourceZone: string | null;
  warehouseId: string;     // resolved upstream
}

export interface RatingRequest {
  shipment: NormalizedShipment;
  cactusCarrier: CarrierCode;
  cactusServiceLevel: string;       // already mapped
  baseCostCardId: string;
  quotedCardId: string | null;      // null when markup strategy is FIXED_AMOUNT or FIXED_PERCENTAGE
  markupStrategy: MarkupStrategy;
  fuelTreatmentMode: 'full' | 'base_only';
}

export interface RatingResult {
  status: ShipmentRatingStatus;
  statusMessage: string | null;
  resolvedZone: string | null;
  zoneMismatch: boolean;
  computedDimWeight: Decimal | null;
  billableWeight: Decimal;
  billableWeightUnit: string;
  weightBreakUsed: string;          // for audit
  isDimBilled: boolean;
  baseCost: Decimal;
  fuelAmount: Decimal;
  markupAmount: Decimal;
  markupTierId: string | null;       // when TIERED strategy
  quotedRate: Decimal;
  margin: Decimal;
  marginPct: Decimal;
  savings: Decimal;
  savingsPct: Decimal;
  gofoHubUsed: GofoHub | null;
}
```

### Rating engine algorithm (full flow)

```
Function rate(request: RatingRequest): RatingResult
  
  // Step 1: Resolve zone
  zoneResolution = ZoneResolver.resolve(
    request.cactusCarrier,
    request.cactusServiceLevel,
    request.shipment.originZip,
    request.shipment.destZip,
    request.shipment.destCountry,
    request.shipment.warehouseId  // for GOFO Regional hub
  )
  
  IF zoneResolution.serviceable == false:
    RETURN { status: NO_COVERAGE, statusMessage: "Destination not serviceable for {carrier}.{service}" }
  
  resolvedZone = zoneResolution.zone
  zoneMismatch = (request.shipment.sourceZone IS NOT NULL AND request.shipment.sourceZone != resolvedZone)
  
  // Step 2: Compute billable weight
  rateCard = loadRateCard(request.baseCostCardId)  // includes dim_factor, dim_min_weight_lb, dim_min_volume_cuin
  
  weightCalc = WeightCalculator.compute(
    actualWeight: request.shipment.weightValue,
    actualUnit: request.shipment.weightUnit,
    dimensions: { L, W, H, unit },
    dimRules: rateCard
  )
  
  billableWeight = weightCalc.billableWeight
  billableWeightUnit = weightCalc.unit
  isDimBilled = weightCalc.isDim
  computedDimWeight = weightCalc.dimWeight
  
  // Step 3: Round weight to next available cell
  roundedWeight = WeightCalculator.roundToCell(
    billableWeight,
    billableWeightUnit,
    rateCard
  )
  
  // Step 4: Lookup base cost
  baseCostCell = RateCardLookup.lookup(request.baseCostCardId, resolvedZone, roundedWeight, weightUnit)
  
  IF baseCostCell IS NULL:
    RETURN { status: UNMATCHED, statusMessage: "No rate found in card for zone={resolvedZone}, weight={roundedWeight}{unit}" }
  
  baseCost = baseCostCell.rate
  
  // Step 5: Compute fuel (DHL only, when fuelTreatmentMode = full)
  fuelAmount = Decimal(0)
  IF request.fuelTreatmentMode == 'full' AND request.cactusCarrier == 'DHL_ECOM':
    fuelAmount = FuelCalculator.compute(
      shipDate: request.shipment.shipDate,
      billableWeight: billableWeight,
      billableWeightUnit: billableWeightUnit
    )
  
  // Step 6: Apply markup
  markupResult = MarkupApplier.apply(
    strategy: request.markupStrategy,
    baseCost: baseCost,
    fuelAmount: fuelAmount,
    quotedCardId: request.quotedCardId,  // for RATE_CARD strategy
    zone: resolvedZone,
    weight: billableWeight,
    weightUnit: billableWeightUnit,
    carrier: request.cactusCarrier,
    service: request.cactusServiceLevel
  )
  
  quotedRate = markupResult.quotedRate
  markupAmount = markupResult.markupAmount
  markupTierId = markupResult.tierIdApplied
  
  // Step 7: Compute economics
  totalCost = baseCost.plus(fuelAmount)
  margin = quotedRate.minus(totalCost)
  marginPct = margin.div(quotedRate).times(100)
  savings = request.shipment.currentCarrierCharge.minus(quotedRate)
  savingsPct = savings.div(request.shipment.currentCarrierCharge).times(100)
  
  RETURN {
    status: OK,
    resolvedZone, zoneMismatch, computedDimWeight, billableWeight, billableWeightUnit,
    weightBreakUsed: `${roundedWeight}${weightUnit}`, isDimBilled,
    baseCost, fuelAmount, markupAmount, markupTierId, quotedRate, margin, marginPct, savings, savingsPct,
    gofoHubUsed: zoneResolution.hubUsed
  }
```

### ZoneResolver detail

```typescript
// zone-resolver.ts
export class ZoneResolver {
  static async resolve(
    carrier: CarrierCode,
    service: string,
    originZip: string,
    destZip: string | null,
    destCountry: string,
    warehouseId: string,
  ): Promise<ZoneResolution> {
    // Determine resolution mode from carrier + service
    const mode = await getZoneResolutionMode(carrier, service);
    
    if (mode === 'ORIGIN_DEST_ZIP3') {
      const originZip3 = originZip.substring(0, 3);
      const destZip3 = destZip?.substring(0, 3);
      const result = await db.query(
        `SELECT zone FROM carrier_zone_matrices 
         WHERE carrier_code = $1 AND service_level = $2 
         AND origin_zip3 = $3 AND dest_zip3 = $4
         AND (deprecated_date IS NULL OR deprecated_date >= CURRENT_DATE)`,
        [carrier, service, originZip3, destZip3]
      );
      return { serviceable: !!result.zone, zone: result?.zone };
    }
    
    if (mode === 'ORIGIN_COUNTRY_DEST_COUNTRY') {
      // For DHL eCom international
      const result = await db.query(
        `SELECT zone FROM carrier_country_zone_matrices 
         WHERE carrier_code = $1 AND service_level = $2 
         AND origin_country = 'US' AND dest_country = $3`,
        [carrier, service, destCountry]
      );
      return { serviceable: !!result.zone, zone: result?.zone };
    }
    
    if (mode === 'INJECTION_POINT_DEST_ZIP5') {
      // For GOFO Regional
      // Step 1: Get warehouse's preferred GOFO hub
      const warehouse = await db.query(
        `SELECT preferred_gofo_hub FROM lead_warehouses WHERE id = $1`,
        [warehouseId]
      );
      const hub = warehouse.preferred_gofo_hub;
      
      // Step 2: Look up zone for (hub, dest_zip5)
      const result = await db.query(
        `SELECT zone FROM gofo_regional_zone_matrix 
         WHERE injection_point = $1 AND dest_zip5 = $2
         AND (deprecated_date IS NULL OR deprecated_date >= CURRENT_DATE)`,
        [hub, destZip]
      );
      
      return { 
        serviceable: !!result?.zone, 
        zone: result?.zone, 
        hubUsed: hub 
      };
    }
  }
}
```

### WeightCalculator detail

```typescript
// weight-calculator.ts
export class WeightCalculator {
  static compute(actualWeight: Decimal, actualUnit: string, dimensions, dimRules): WeightCalcResult {
    // Convert actual weight to LB for DIM comparison
    const actualLb = convertToLb(actualWeight, actualUnit);
    
    if (!dimensions.L || !dimensions.W || !dimensions.H) {
      return {
        billableWeight: actualWeight,
        unit: actualUnit,
        dimWeight: null,
        isDim: false,
      };
    }
    
    // Convert dimensions to inches
    const lIn = convertToInches(dimensions.L, dimensions.unit);
    const wIn = convertToInches(dimensions.W, dimensions.unit);
    const hIn = convertToInches(dimensions.H, dimensions.unit);
    
    const volumeCuIn = lIn.times(wIn).times(hIn);
    
    // Check DIM minimums
    if (actualLb.lte(dimRules.dim_min_weight_lb) || volumeCuIn.lte(dimRules.dim_min_volume_cuin)) {
      return {
        billableWeight: actualWeight,
        unit: actualUnit,
        dimWeight: null,
        isDim: false,
      };
    }
    
    // Compute DIM weight in LB
    const dimWeightLb = volumeCuIn.div(dimRules.dim_factor);
    
    // Use larger of actual or DIM
    if (dimWeightLb.gt(actualLb)) {
      return {
        billableWeight: dimWeightLb,
        unit: 'LB',
        dimWeight: dimWeightLb,
        isDim: true,
      };
    }
    
    return {
      billableWeight: actualWeight,
      unit: actualUnit,
      dimWeight: dimWeightLb,
      isDim: false,
    };
  }
  
  static roundToCell(weight: Decimal, unit: string, rateCard): RoundedWeight {
    if (unit === 'OZ' && weight.lte(16)) {
      return { value: weight.ceil().toNumber(), unit: 'OZ' };
    }
    if (unit === 'OZ' && weight.gt(16)) {
      const lb = weight.div(16);
      return { value: lb.ceil().toNumber(), unit: 'LB' };
    }
    if (unit === 'LB') {
      // For DHL Intl: ceil to next 1/16 lb
      if (rateCard.zone_resolution_mode === 'ORIGIN_COUNTRY_DEST_COUNTRY') {
        const sixteenths = weight.times(16);
        const ceiled = sixteenths.ceil();
        return { value: ceiled.div(16).toNumber(), unit: 'LB' };
      }
      // Domestic: ceil to next LB
      return { value: weight.ceil().toNumber(), unit: 'LB' };
    }
    // KG: convert to LB then proceed
    if (unit === 'KG') {
      const lb = weight.times(2.20462);
      return this.roundToCell(lb, 'LB', rateCard);
    }
  }
}
```

### FuelCalculator detail

```typescript
// fuel-calculator.ts
export class FuelCalculator {
  static async compute(shipDate: Date, billableWeight: Decimal, weightUnit: string): Promise<Decimal> {
    // Step 1: Look up diesel price for ship_date
    const dieselPrice = await db.query(
      `SELECT national_avg_price FROM diesel_price_history 
       WHERE $1 BETWEEN effective_week_start AND effective_week_end`,
      [shipDate]
    );
    if (!dieselPrice) {
      throw new Error(`No diesel price found for ship_date ${shipDate}`);
    }
    
    // Step 2: Look up fuel per lb tier
    const tier = await db.query(
      `SELECT fuel_per_lb FROM dhl_ecom_fuel_tiers 
       WHERE $1 >= diesel_price_min AND $1 < diesel_price_max
       AND effective_date <= $2
       ORDER BY effective_date DESC LIMIT 1`,
      [dieselPrice.national_avg_price, shipDate]
    );
    if (!tier) {
      throw new Error(`No fuel tier for diesel price ${dieselPrice.national_avg_price}`);
    }
    
    // Step 3: Compute billable weight in LB with sub-1-lb minimum
    const weightLb = convertToLb(billableWeight, weightUnit);
    const fuelBillableLb = Decimal.max(weightLb, new Decimal(1));
    
    // Step 4: Multiply
    return fuelBillableLb.times(tier.fuel_per_lb);
  }
}
```

### MarkupApplier detail

```typescript
// markup-applier.ts
export class MarkupApplier {
  static async apply(
    strategy: MarkupStrategy,
    baseCost: Decimal,
    fuelAmount: Decimal,
    quotedCardId: string | null,
    zone: string,
    weight: Decimal,
    weightUnit: string,
    carrier: CarrierCode,
    service: string,
  ): Promise<MarkupResult> {
    
    const totalCost = baseCost.plus(fuelAmount);
    
    if (strategy.strategy_type === 'RATE_CARD') {
      // Quoted = client rate card cell directly. Fuel still added on top.
      const quotedCell = await RateCardLookup.lookup(
        quotedCardId, zone, weight, weightUnit
      );
      const quotedRate = quotedCell.rate.plus(fuelAmount);
      const markupAmount = quotedCell.rate.minus(baseCost);
      return { quotedRate, markupAmount, tierIdApplied: null };
    }
    
    if (strategy.strategy_type === 'FIXED_AMOUNT') {
      const quotedRate = baseCost.plus(strategy.fixed_amount).plus(fuelAmount);
      return { quotedRate, markupAmount: strategy.fixed_amount, tierIdApplied: null };
    }
    
    if (strategy.strategy_type === 'FIXED_PERCENTAGE') {
      const pct = strategy.fixed_percentage.div(100);
      let quotedRate;
      let markupAmount;
      
      if (strategy.fuel_markup_treatment === 'COMPOUND') {
        // (base + fuel) × (1 + markup%)
        quotedRate = totalCost.times(Decimal(1).plus(pct));
        markupAmount = totalCost.times(pct);
      } else {
        // (base × (1 + markup%)) + fuel
        const markedBase = baseCost.times(Decimal(1).plus(pct));
        quotedRate = markedBase.plus(fuelAmount);
        markupAmount = baseCost.times(pct);
      }
      
      return { quotedRate, markupAmount, tierIdApplied: null };
    }
    
    if (strategy.strategy_type === 'TIERED') {
      // Find the matching tier
      const tier = await this.findMatchingTier(strategy.id, weight, weightUnit, zone, carrier, service);
      if (!tier) {
        throw new Error(`No tier matched in strategy ${strategy.id} for shipment`);
      }
      
      let quotedRate;
      let markupAmount;
      
      if (tier.tier_type === 'FIXED_AMOUNT') {
        quotedRate = baseCost.plus(tier.tier_amount).plus(fuelAmount);
        markupAmount = tier.tier_amount;
      } else {
        // FIXED_PERCENTAGE within the tier
        const pct = tier.tier_amount.div(100);
        // Default to compound for tiered (or look up tier-level fuel treatment if added later)
        quotedRate = totalCost.times(Decimal(1).plus(pct));
        markupAmount = totalCost.times(pct);
      }
      
      return { quotedRate, markupAmount, tierIdApplied: tier.id };
    }
  }
  
  private static async findMatchingTier(strategyId, weight, weightUnit, zone, carrier, service) {
    // Tiers ordered by priority ASC. Returns first match.
    const tiers = await db.query(
      `SELECT * FROM markup_strategy_tiers WHERE strategy_id = $1 ORDER BY priority ASC`,
      [strategyId]
    );
    
    for (const tier of tiers) {
      if (tier.weight_min !== null && weight.lt(tier.weight_min)) continue;
      if (tier.weight_max !== null && weight.gt(tier.weight_max)) continue;
      if (tier.zone !== null && tier.zone !== zone) continue;
      if (tier.carrier_code !== null && tier.carrier_code !== carrier) continue;
      if (tier.service_level !== null && tier.service_level !== service) continue;
      return tier;
    }
    return null;
  }
}
```

### Acceptance criteria for Phase 3
- [ ] All 8 modules in `src/core/pld-analysis/` exist with proper TypeScript types
- [ ] Unit tests cover at least: zone resolution (all 3 modes), weight rounding (all combinations), DIM calculation, fuel calculation (with sub-1-lb minimum), all 4 markup strategy types
- [ ] Test coverage report shows >85% on the rating engine modules
- [ ] One end-to-end test: rate a single hardcoded shipment against a known rate card, expect exact dollar match
- [ ] All `Decimal` math — no native JS Number for monetary values
- [ ] Error handling for missing data (rate card cell not found, fuel tier not found, etc.) produces clear status messages, not exceptions that bubble up

