# Cowork Command — Master Briefing Update for PLD Analysis Engine v1

**Target file:** `cactus-master-briefing.md`
**Current version:** v1.9.0 (2026-04-29)
**New version after these edits:** v1.10.0
**Edit type:** Surgical — preserve all existing content not touched by these instructions.

---

## Edit 1 — Header version bump

**Find:**

```
# CACTUS LOGISTICS OS — MASTER BRIEFING DOCUMENT
# VERSION: 1.9.0 | UPDATED: 2026-04-29
```

**Replace with:**

```
# CACTUS LOGISTICS OS — MASTER BRIEFING DOCUMENT
# VERSION: 1.10.0 | UPDATED: 2026-05-04
```

---

## Edit 2 — Section 2 (Three-Phase Roadmap), Phase 1 bullet list

**Context:** PLD/Rate Analysis is being pulled forward from Phase 2 to Phase 1 with initial carrier coverage of DHL eCom + GOFO.

**Find** (in the "Phase 1 — Rating & Billing Engine (CURRENT)" block):

```
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
```

**Replace with:**

```
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
- PLD Analysis Engine v1 (pulled forward from Phase 2)
    Internal sales tool living in the Alamo
    Initial carrier coverage: DHL eCom + GOFO
    Rate-card-based; no carrier API integration required
    Multi-carrier rating with winning-rate selection
    Per-shipment savings + margin analysis
    Polished client-facing PDF deliverable + internal margin view
```

---

## Edit 3 — Section 2 (Three-Phase Roadmap), Phase 2 bullet list

**Context:** Remove PLD/Rate Analysis from Phase 2 since it's now in Phase 1, but preserve the broader expansion roadmap (additional carriers, three-layer sales architecture).

**Find:**

```
- PLD/Rate Analysis (PLD Analysis Engine internally) — two-layer sales tool:
    Layer 1: Cactus runs PLD/Rate Analysis to win 3PL clients
    Layer 2: 3PL clients run PLD/Rate Analysis to win merchant clients
    Engine calls live carrier APIs for real-time rating with all surcharges
    Rate cards + hardcoded surcharges used where API not available
      (USPS, UniUni, GOFO, ShipX, DHL eCommerce)
    Powered by Shadow Ledger rate intelligence over time
    Key differentiator vs DiversiFi: built on reconciled invoice data depth
```

**Replace with:**

```
- PLD Analysis Engine — Phase 2 expansion:
    v1 launched in Phase 1 with DHL eCom + GOFO (Alamo-only, internal use)
    Phase 2 expands carrier coverage: USPS, UniUni, ShipX rate cards
    Phase 2 adds carrier API rating: FedEx, UPS, DHL Express
    Phase 2 enables Layer 2: 3PL clients run PLD/Rate Analysis from Cactus Portal
    Phase 2 adds Shadow Ledger rate intelligence integration
    Key differentiator vs DiversiFi: built on reconciled invoice data depth
```

---

## Edit 4 — Section 10 (Database Schema), table count and inventory

**Context:** PLD Analysis Engine v1 adds approximately 21 new tables to the schema. The "19 TABLES" header and table list need to be updated.

**Find:**

```
## 10. DATABASE SCHEMA (v1.7.0 — 19 TABLES — LIVE IN SUPABASE)

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
```

**Replace with:**

```
## 10. DATABASE SCHEMA (v1.10.0 — 40 TABLES — LIVE IN SUPABASE)

### Production tables (19 — Phase 1 Rating & Billing Engine)

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

### PLD Analysis Engine tables (21 — added v1.10.0)

| Table | Purpose |
|---|---|
| `leads` | Sales leads. Promote to organizations on conversion. |
| `lead_current_carriers` | Many-to-many: which carriers a lead currently uses. |
| `lead_warehouses` | Multi-warehouse support per lead. Includes preferred GOFO hub. |
| `lead_service_level_mappings` | Persistent per-lead source → Cactus service-level mappings. |
| `global_service_level_mapping_defaults` | Seed table of common service level synonyms. |
| `analysis_rate_cards` | Lead-scoped or global rate cards used by the PLD engine. Separate from production `rate_cards`. |
| `analysis_rate_card_cells` | Rate matrix cells for analysis rate cards. |
| `markup_strategies` | 4 strategy types: rate_card, fixed_amount, fixed_percentage, tiered. |
| `markup_strategy_tiers` | Per-tier rules for TIERED markup strategies. |
| `pld_analysis_runs` | Header for an analysis run. Versioned via parent_run_id. |
| `pld_analysis_run_strategies` | Snapshots which markup strategy applied to which carrier per run. |
| `pld_analysis_run_service_mappings` | Per-run snapshot of service level mappings used. |
| `pld_analysis_shipments` | Per-shipment analysis row. Immutable once parent run = COMPLETE. |
| `pld_analysis_shipment_rates` | Per-shipment per-carrier rate detail (multi-carrier winner picker). |
| `carrier_zone_matrices` | ZIP3-based zone resolution (DHL eCom, GOFO Std, future USPS). |
| `carrier_country_zone_matrices` | Country-based zone resolution (DHL eCom international). |
| `gofo_regional_zone_matrix` | GOFO Regional injection-point-based zones. |
| `gofo_hubs` | GOFO injection point reference (lat/long for proximity calc). |
| `gofo_hub_proximity` | Precomputed Haversine ZIP3 → hub ranking. |
| `zip3_centroids` | US Census ZIP3 lat/long lookup. |
| `service_coverage_zips` | Admin-editable ZIP coverage for restricted-footprint services. |
| `gofo_remote_zip3s` | ZIP3 prefixes triggering GOFO Standard remote variant. |
| `dhl_ecom_fuel_tiers` | DHL eCom fuel surcharge tiers indexed to diesel price. |
| `diesel_price_history` | Weekly EIA national diesel price (auto-fetched + manual entry). |

### New enums (v1.10.0)

- `carrier_code_enum`: extended with AMAZON, EPOST_GLOBAL, CIRRO, SPEEDX, ASENDIA
- `lead_company_profile_enum`: MERCHANT, THREE_PL, OTHER
- `lead_label_software_enum`: WAREHANCE, SHIPSTATION, PACKIYO, EXTENSIV, DEPOSCO, LOGIWA, CUSTOM, OTHER
- `lead_source_type_enum`: BD_PARTNER, COLD_PROSPECTING, MARKETING, REFERRAL
- `lead_stage_enum`: NEW, ENGAGED, ANALYSIS_RUN, QUOTED, WON, LOST, ARCHIVED
- `gofo_hub_enum`: LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC
- `analysis_rate_card_purpose_enum`: CACTUS_BASE_COST, LEAD_QUOTED
- `markup_strategy_type_enum`: RATE_CARD, FIXED_AMOUNT, FIXED_PERCENTAGE, TIERED
- `markup_tier_type_enum`: FIXED_AMOUNT, FIXED_PERCENTAGE
- `zone_resolution_mode_enum`: ORIGIN_DEST_ZIP3, INJECTION_POINT_DEST_ZIP5, ORIGIN_COUNTRY_DEST_COUNTRY
- `analysis_run_status_enum`: DRAFT, READY_TO_RATE, RATING, COMPLETE, FAILED, ARCHIVED
- `shipment_rating_status_enum`: OK, UNMATCHED, NO_COVERAGE, EXCLUDED, NEEDS_MAPPING
- `fuel_markup_treatment_enum`: COMPOUND, ADDITIVE
```

(Existing `### Key Enums` subsection and all `### v1.6.0`, `### v1.6.1`, `### v1.7.0` change-log subsections must be left untouched — they remain in the briefing as historical record.)

---

## Edit 5 — Section 10 (Database Schema), append v1.10.0 changelog subsection

**Context:** Add a new changelog subsection after the existing `### v1.7.0 Schema Changes` subsection. Maintains the established changelog pattern in the briefing.

**Find** (the last line of the v1.7.0 changelog block, immediately before the `---` separator that ends Section 10):

```
Companion code change: shared address normalization helper added at
src/alamo/lib/address.ts. `normalizeAddress()` is now used by both
the parser and the locations form — keeps writers consistent so
dark-account matching works regardless of write path.

---
```

**Replace with:**

```
Companion code change: shared address normalization helper added at
src/alamo/lib/address.ts. `normalizeAddress()` is now used by both
the parser and the locations form — keeps writers consistent so
dark-account matching works regardless of write path.

### v1.10.0 Schema Changes (PLD Analysis Engine v1)

21 new tables added to support the PLD Analysis Engine. All tables
RLS-enabled per existing convention. Soft-delete on `leads`,
`pld_analysis_runs`, `analysis_rate_cards`, `markup_strategies` via
nullable `deleted_at` column. Database views (`active_leads`,
`active_pld_analysis_runs`, etc.) provided so application code reads
filtered data without scattering `WHERE deleted_at IS NULL` clauses
across the codebase.

`pld_analysis_shipments` honors Rule 6 (immutable records) once the
parent `pld_analysis_runs.status = 'COMPLETE'`. Re-rates create a new
run row via `parent_run_id` — historical shipment data preserved.

Enum extension: `carrier_code_enum` adds AMAZON, EPOST_GLOBAL, CIRRO,
SPEEDX, ASENDIA for lead-side current-carrier tracking. ALTER TYPE ADD
VALUE is non-destructive; existing rows unaffected.

Reference data seeded at migration time:
  - GOFO hubs: 7 rows (LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC)
  - GOFO remote ZIP3s: ~29 rows (Hawaii, Alaska, PR, VI, Guam, Military)
  - DHL eCom fuel tiers: 18 tier rows from May 2026 published schedule
  - ZIP3 centroids: ~920 rows from US Census ZCTA data
  - GOFO hub proximity: ~6,440 rows (920 ZIP3s × 7 hubs ranked)

Reference data loaded by admin via Alamo upload UI (not migration):
  - DHL eCom domestic + international zone matrices (per service version)
  - GOFO Regional zone matrix (8,361 ZIPs × 7 injection points)
  - Cactus base cost rate cards (DHL eCom + GOFO)

Migration files (in repo):
  database/migrations/v1.10.0-pld-analysis-foundation.sql
  database/migrations/v1.10.0-pld-analysis-rls.sql
  database/migrations/v1.10.0-pld-analysis-views.sql
  database/migrations/v1.10.0-pld-analysis-seed.sql

Companion code at:
  src/alamo/pld-analysis/    — Alamo UI routes
  src/core/pld-analysis/     — carrier-agnostic rating engine logic

---
```

---

## Edit 6 — Section 12a (Open Decisions / DN Log) — close two open questions

**Context:** Two PLD-related open questions are now resolved. Mark them resolved in place rather than removing them, to preserve audit trail.

**Find:**

```
- PLD Analysis Engine: standard template file format to provide prospects
  (what column headers, what order, what file type — CSV or XLSX?)
- PLD Analysis Engine: how to handle mixed unit of weight in same file
  (some rows LB, some rows OZ?)
```

**Replace with:**

```
- ~~PLD Analysis Engine: standard template file format to provide prospects~~
  RESOLVED 2026-05-04: Plain CSV with 14 required + 3 suggested columns,
  exact-match (case-sensitive) snake_case headers. See Section 15 for spec.
- ~~PLD Analysis Engine: how to handle mixed unit of weight in same file~~
  RESOLVED 2026-05-04: Per-row `weight_unit` field (OZ, LB, KG). No file-
  level assumption. Engine normalizes per row. See Section 15 for spec.
```

---

## Edit 7 — Section 15 (PLD Analysis Engine Spec) — full replacement

**Context:** Section 15's existing spec was a Phase 2 placeholder. Replace it with the v1 implementation spec that has been designed in detail.

**Find** the entire Section 15, beginning with `## 15. PLD ANALYSIS ENGINE SPEC` and ending immediately before `## 16. INVESTOR DOCUMENT CONTEXT`. (The complete current Section 15 spans approximately lines 2259–2323 in v1.9.0.)

**Replace with:**

```
## 15. PLD ANALYSIS ENGINE SPEC (v1)

### Internal Name: PLD Analysis Engine
### External Name (when client-facing portal launches in Phase 2): PLD/Rate Analysis

### Status
v1 launched in Phase 1 (2026-05). Internal tool — Alamo only.
Client-facing access via Cactus Portal deferred to Phase 2.

### What it does
Analyzes a prospect's historical Package Level Data (PLD) — a CSV file
of their shipments — by re-rating every shipment against Cactus's
quoted rate cards, then producing a polished client-facing PDF
showing the prospect's potential savings, plus an internal margin
view showing Cactus's profit per shipment.

### v1 carrier coverage
- DHL eCommerce (Ground, Expedited, MAX, Intl Direct, Intl Standard)
- GOFO (Standard with remote variant, Regional with injection-point zones)

### v1.5+ planned additions
- USPS, UniUni, ShipX rate cards
- FedEx, UPS, DHL Express via carrier APIs
- Phase 2: Layer 2 client-facing access from Cactus Portal

### CSV Template (v1)

**Required fields (14):**
| Field | Format | Notes |
|---|---|---|
| `tracking_number` | string | Unique per row. Required for join + dedup. |
| `ship_date` | ISO 8601 (YYYY-MM-DD) or US (MM/DD/YYYY) | Auto-detected, normalized to ISO. |
| `carrier` | enum | Source carrier (e.g., FEDEX, UPS, DHL_ECOM). |
| `service_level` | string | Source service level. Mapped to Cactus services via mapping UI. |
| `origin_zip` | 5-digit US ZIP | Required for zone resolution. |
| `dest_zip` | 5-digit US ZIP or empty for intl | Empty allowed when dest_country != US. |
| `dest_country` | ISO-3166 alpha-2 | US for domestic, otherwise destination country. |
| `weight_value` | decimal | Per-row numeric weight. |
| `weight_unit` | enum (OZ, LB, KG) | Explicit per row — never inferred. |
| `length` | decimal | DIM weight calc. Required if any L/W/H populated. |
| `width` | decimal | DIM weight calc. |
| `height` | decimal | DIM weight calc. |
| `dim_unit` | enum (IN, CM) | Required when any L/W/H populated. |
| `current_carrier_charge` | decimal | All-in invoice total. |

**Suggested fields (3):**
| Field | Format | Notes |
|---|---|---|
| `order_number` | string | Reference for client recognition in reports. |
| `zone` | string | Source-provided zone. Audit-only — Cactus recomputes. |
| `residential_flag` | boolean | Surcharge driver hint. v1 doesn't apply residential. |

Headers must match exactly (case-sensitive). Plain CSV file format.

### Rating Algorithm (per shipment)

1. **Resolve warehouse from origin_zip.** Auto-match to nearest existing
   `lead_warehouses` record. Unmapped origin → flag for admin override.
2. **Compute Cactus zone.** Lookup against carrier-specific zone matrix
   keyed on origin/dest ZIP3 (or country, or injection point per carrier).
   Compare to source-provided zone — flag mismatch as audit signal.
3. **Compute DIM weight** if L/W/H populated:
   `dim_weight = (L × W × H) / dim_factor`
   DIM applies only when `actual_weight > dim_min_weight_lb`
   AND `(L × W × H) > dim_min_volume_cuin`. Per rate card.
4. **Determine billable weight** = max(actual, DIM if applicable).
5. **Round weight up** to next available rate card cell:
   - Domestic ≤16 oz → ceil to next OZ
   - Domestic >16 oz → ceil to next LB
   - International → ceil to next 1/16 lb break
6. **Lookup rate** in rate card via (zone, weight, weight_unit).
7. **Compute fuel** (DHL eCom only in v1):
   - Look up diesel price for ship_date in `diesel_price_history`
   - Look up corresponding $/lb tier in `dhl_ecom_fuel_tiers`
   - Sub-1-lb shipments: `fuel_billable_lb = MAX(billable_weight_lb, 1.0)`
   - `fuel_amount = fuel_billable_lb × fuel_per_lb`
8. **Apply markup** per strategy:
   - RATE_CARD type: quoted = client rate card cell directly
   - FIXED_AMOUNT: quoted = base_cost + markup_amount
   - FIXED_PERCENTAGE compound: quoted = (base + fuel) × (1 + markup%)
   - FIXED_PERCENTAGE additive: quoted = (base × (1 + markup%)) + fuel
   - TIERED: apply tier rules per (zone, weight, carrier, service)
9. **Repeat steps 1-8 for each selected Cactus carrier.**
10. **Pick winner.** Lowest quoted_rate where rating_status = OK.
    Ties broken by carrier preference (DHL > GOFO).
    Tied shipments flagged for manual review.

### Multi-Carrier Coverage Handling
- GOFO Regional has restricted ZIP coverage (~70% of US, 8,361 ZIPs).
- Non-serviceable destinations get rating_status = NO_COVERAGE for that carrier.
- If user selected multiple Cactus carriers, shipment falls through to
  next eligible carrier (e.g., GOFO Standard, DHL).
- If only GOFO Regional selected, NO_COVERAGE shipments are not rated.
- Coverage gap is disclosed in PDF methodology footnote.

### DIM Factor Reference
- DHL eCom Domestic: 139 (verify per rate card upload)
- DHL eCom International / SmartMail Plus: 166
- GOFO Standard: 166
- GOFO Regional: 194
- USPS, UPS, FedEx (when added): 139

DIM factors live on `analysis_rate_cards.dim_factor`. Set at card upload.

### Run Lifecycle
- Status flow: DRAFT → READY_TO_RATE → RATING → COMPLETE / FAILED / ARCHIVED
- Re-rate: edits to mappings create a new run with `parent_run_id` linking
  back to the original. Both versions queryable; old runs immutable.
- Soft-delete via `deleted_at` timestamp. Runs persist forever for audit.

### Outputs (3 deliverables per run)
1. **Client-facing PDF** (one page, polished, no margin/cost data exposed)
   - Hero metrics: total savings, savings %, packages analyzed, avg/package
   - Annualized projection (with caveat language)
   - Savings by service breakdown
   - Domestic savings by zone breakdown
   - International callout
   - Dynamic methodology footnote tailored to run parameters
   - Cactus logo header + Forest title bar (brand-aligned)

2. **Per-shipment CSV (verification)**
   - Source CSV columns + Cactus quoted rate + savings + status flags
   - Safe to share with prospect for audit
   - DOES NOT include Cactus base cost or margin

3. **Internal margin view (Cactus eyes only)**
   - Per-shipment: base cost, markup applied, quoted, margin, savings
   - Aggregations: margin by service, by zone, by weight band
   - Lane analysis: full sortable ranked table of all (origin ZIP3 → dest ZIP3) pairs
     with shipment count, total spend, total savings, total margin
   - DIM-billed vs actual-weight-billed shipment counts
   - Stale data flag (shipments > 18 months old)
   - Peak season flag (data includes Oct–Dec)
   - Tied-rate flag (shipments where multiple carriers quoted same rate)

### Methodology Footnote — Dynamic Generation
Footnote text generated at run completion and stored on the run record
(`pld_analysis_runs.methodology_footnote_text`). Reproducible — re-rendering
the PDF months later produces identical footnote. Components flex based on
run parameters: comparison basis (full vs base-only), period framing,
carriers compared, multi-carrier optimization note, coverage gap disclosure,
exclusions, rounding note, annualization caveat.

### Reference Data Sources
- DHL fuel tier table: published by DHL, manually loaded per effective_date
- Diesel price: US Energy Information Administration (EIA) — automated
  weekly fetch via Supabase Edge Function (Mondays, 7 AM ET)
- GOFO Regional zones: published by GOFO, manually loaded per matrix_version
- ZIP3 centroids: US Census ZCTA data, seeded at migration time
- Rate cards: per-carrier published files, admin upload via Alamo

### Annualization Logic
Sample window detected from min/max ship_date across run:
- 1 day → ×260 (working days/year)
- 2-7 days → ×52 (weekly cycles)
- 8-31 days → ×12 (monthly cycles)
- 32-92 days → ×4 (quarterly)
- 93-365 days → projected to full year via ratio
- >365 days → no annualization, show actual

### Two-Test Regression Framework
Test A (binding): `fuel_treatment_mode = 'base_only'` reproduces the
exact $1,556.12 savings figure from the manually-built 5 Logistics analysis.
Same code paths, fuel zeroed out. Per-shipment CSV must match byte-for-byte
(modulo column ordering).

Test B (sanity): `fuel_treatment_mode = 'full'` runs the same data through
the full fuel-aware engine. Numbers differ from Test A but should be
directionally similar. Validates fuel-on-both-sides math is sound.

```

(End of Section 15 replacement. Section 16 follows immediately as before.)

---

## Edit 8 — End-of-document checklist

**Context:** After applying all edits, verify each of the following holds in the resulting briefing.

- [ ] Header version reads `1.10.0` and date `2026-05-04`
- [ ] Section 2 Phase 1 includes "PLD Analysis Engine v1 (pulled forward from Phase 2)"
- [ ] Section 2 Phase 2 PLD bullet reframes as expansion plan, not initial launch
- [ ] Section 10 header reads "v1.10.0 — 40 TABLES — LIVE IN SUPABASE"
- [ ] Section 10 contains both "Production tables (19 ...)" and "PLD Analysis Engine tables (21 ...)" sub-sections
- [ ] Section 10 lists all 13 new enums under "New enums (v1.10.0)"
- [ ] Section 10 has a complete `### v1.10.0 Schema Changes` subsection between `### v1.7.0` and the closing `---`
- [ ] Section 12a's two PLD open questions are crossed out with "RESOLVED 2026-05-04" notes
- [ ] Section 15 begins with `## 15. PLD ANALYSIS ENGINE SPEC (v1)` (note "(v1)" suffix)
- [ ] Section 15 contains CSV template, rating algorithm, run lifecycle, three deliverables, dynamic methodology footnote, reference data sources, annualization logic, two-test regression framework
- [ ] All other sections (1, 3-9, 11-14, 16-22) untouched
- [ ] No orphaned references — every "Phase 2 PLD" reference reframed
- [ ] All other DN log entries in Section 12a untouched

---

## Notes for Cowork

- This is a `surgical` edit — no whole-section rewrites except Section 15.
- All version references should bump `1.9.0` → `1.10.0` consistently.
- Date `2026-04-29` → `2026-05-04` only in the header. Elsewhere, dates are
  per-event and should remain as-is.
- The 21-table count for PLD additions is correct. Double-check against the
  PLD Analysis Engine tables list — should match.
- Section 15's old spec is preserved nowhere — this is a true replacement.
  Acceptable because Section 15's old version was a placeholder spec that
  pre-dated the detailed design work.

---

End of cowork command.
