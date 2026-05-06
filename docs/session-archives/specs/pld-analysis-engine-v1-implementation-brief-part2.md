# PLD Analysis Engine v1 — Implementation Brief (Part 2 of 2)

Continuation of `pld-analysis-engine-v1-implementation-brief-part1.md`. Read Part 1 first.

---

## Section 6 — Phase 4: Multi-Carrier Orchestrator

### Goal
Build the orchestrator that runs the rating engine across multiple Cactus carriers per shipment and selects winners.

### Module: `src/core/pld-analysis/orchestrator.ts`

```typescript
export class MultiCarrierOrchestrator {
  async rateShipment(
    shipment: NormalizedShipment,
    selectedCarriers: CarrierCode[],
    serviceMappings: Map<string, CarrierServiceMapping[]>, // keyed by source service level
    runStrategies: Map<CarrierCode, MarkupStrategy>,
    fuelTreatmentMode: 'full' | 'base_only',
  ): Promise<MultiCarrierResult> {
    
    const sourceService = shipment.sourceServiceLevel;
    const mappings = serviceMappings.get(sourceService);
    
    if (!mappings || mappings.length === 0) {
      return { 
        status: 'NEEDS_MAPPING', 
        statusMessage: `No mapping defined for source service '${sourceService}'`,
        rates: [],
      };
    }
    
    const carrierResults: RatingResult[] = [];
    
    for (const carrier of selectedCarriers) {
      const mapping = mappings.find(m => m.cactusCarrier === carrier);
      if (!mapping) {
        // No mapping for this carrier; skip silently
        continue;
      }
      
      const strategy = runStrategies.get(carrier);
      if (!strategy) {
        throw new Error(`No markup strategy attached for carrier ${carrier}`);
      }
      
      const baseCostCardId = await getActiveBaseCostCard(carrier, mapping.cactusServiceLevel);
      const quotedCardId = strategy.strategy_type === 'RATE_CARD' ? strategy.rate_card_id : null;
      
      const result = await RatingEngine.rate({
        shipment,
        cactusCarrier: carrier,
        cactusServiceLevel: mapping.cactusServiceLevel,
        baseCostCardId,
        quotedCardId,
        markupStrategy: strategy,
        fuelTreatmentMode,
      });
      
      carrierResults.push({ ...result, carrierCode: carrier, serviceLevel: mapping.cactusServiceLevel });
    }
    
    // Pick winner
    const okResults = carrierResults.filter(r => r.status === 'OK');
    
    if (okResults.length === 0) {
      // No carriers could rate
      const firstFailureMessage = carrierResults[0]?.statusMessage || 'No carriers could rate';
      return {
        status: carrierResults[0]?.status || 'UNMATCHED',
        statusMessage: firstFailureMessage,
        rates: carrierResults,
        winningCarrier: null,
      };
    }
    
    // Find lowest quotedRate
    const sortedByRate = okResults.sort((a, b) => a.quotedRate.cmp(b.quotedRate));
    const lowestRate = sortedByRate[0].quotedRate;
    
    // Find all carriers tied at lowest
    const tied = sortedByRate.filter(r => r.quotedRate.eq(lowestRate));
    const isTied = tied.length > 1;
    
    let winner: RatingResult;
    if (isTied) {
      // Apply DHL preference rule
      const dhl = tied.find(r => r.carrierCode === 'DHL_ECOM');
      winner = dhl || tied[0];
    } else {
      winner = sortedByRate[0];
    }
    
    return {
      status: 'OK',
      statusMessage: null,
      rates: carrierResults,
      winningCarrier: winner.carrierCode,
      winningServiceLevel: winner.serviceLevel,
      winningRate: winner.quotedRate,
      winningResult: winner,
      isTied,
    };
  }
}
```

### Acceptance criteria for Phase 4
- [ ] Orchestrator unit-tested with: single carrier, two carriers (DHL wins), two carriers (GOFO wins), tied rates (DHL wins by preference), no eligible carriers (NEEDS_MAPPING or UNMATCHED), GOFO Regional NO_COVERAGE fallthrough
- [ ] Returns `isTied = true` when multiple carriers quote same rate
- [ ] Honors DHL preference rule on ties
- [ ] Skips carriers with no service mapping silently (does not fail entire shipment)

---

## Section 7 — Phase 5: CSV Upload + Parser + Mapping UI

### Goal
Build the user-facing intake flow: upload CSV → validate → resolve warehouses → resolve service mappings → ready to rate.

### Sub-phase 5a — CSV Parser

**Location:** `src/alamo/lib/pld-analysis/csv-parser.ts`

**Required column headers (exact match, case-sensitive):**
```
tracking_number,ship_date,carrier,service_level,origin_zip,dest_zip,dest_country,weight_value,weight_unit,length,width,height,dim_unit,current_carrier_charge
```

**Suggested column headers (optional, parser tolerates absence):**
```
order_number,zone,residential_flag
```

**Parsing rules:**
- Use `papaparse` library for streaming CSV parse (handles 100k+ rows without memory issues)
- Reject file if any required header is missing
- Reject file if header order is unconventional but headers all present (optional: bonus to support reordered columns)
- For each row:
  - `tracking_number`: string, trim whitespace, must be non-empty
  - `ship_date`: try ISO 8601 first (YYYY-MM-DD), fall back to US format (MM/DD/YYYY), reject if neither parses
  - `carrier`: must match a value in `carrier_code_enum`
  - `service_level`: trim, lowercase normalize for matching, but preserve original case for display
  - `origin_zip`, `dest_zip`: strip leading zeros not allowed; pad to 5 digits if numeric input dropped a leading zero
  - `dest_country`: 2-character ISO code, uppercase
  - `weight_value`: parse as Decimal, must be > 0
  - `weight_unit`: must be 'OZ', 'LB', or 'KG' (case-insensitive)
  - `length`, `width`, `height`: parse as Decimal, must be all-or-nothing (all 3 populated or all 3 empty)
  - `dim_unit`: 'IN' or 'CM' (case-insensitive); required if any L/W/H populated
  - `current_carrier_charge`: parse as Decimal, must be >= 0
  - `residential_flag`: parse as boolean ('true', 'false', '1', '0', 'yes', 'no' all accepted)

**Error reporting:**
- Per-row errors collected, returned as a list with row numbers
- File-level errors fail the parse with a clear message
- Soft warnings (e.g., row missing optional dim_unit but has L/W/H) noted but not blocking

### Sub-phase 5b — Upload page

**Route:** `/alamo/pld-analysis/runs/new`

**UI flow:**
1. Page asks "Which lead is this analysis for?" (Lead picker dropdown)
2. After lead selected: drag-and-drop file upload area
3. On file dropped: client-side validates extension (.csv), size (<100 MB)
4. POST to `/api/pld-analysis/runs/upload` (server action)
5. Server: stores file in Supabase Storage at `pld-uploads/{lead_id}/{run_id}.csv`
6. Server: creates `pld_analysis_runs` row with status='DRAFT', source_file_path populated
7. Server: parses CSV header to validate required columns present
8. Server: returns run_id
9. Client: redirects to `/alamo/pld-analysis/runs/{run_id}/setup`

### Sub-phase 5c — Setup page

**Route:** `/alamo/pld-analysis/runs/{run_id}/setup`

**Three setup steps shown sequentially:**

**Step 1: Carrier selection**
- Multi-select checkboxes for Cactus carriers to rate against
- For v1: DHL_ECOM, GOFO (later: USPS, UNIUNI, etc.)
- Save to `pld_analysis_runs.selected_carriers`

**Step 2: Markup strategy per carrier**
- For each selected carrier, dropdown to pick a markup strategy
- Filter: show strategies where lead_id IS NULL (global) or lead_id = current lead
- For DHL_ECOM strategies: also show fuel_markup_treatment (COMPOUND/ADDITIVE)
- Inline link "Create new markup strategy" → opens modal with strategy creation form
- Save to `pld_analysis_run_strategies` with snapshot

**Step 3: Service level mappings**
- Run a quick scan of source CSV: extract distinct values from `service_level` column
- Pre-populate mappings from:
  1. `lead_service_level_mappings` (per-lead history)
  2. `global_service_level_mapping_defaults` (seeded synonyms)
- Show table:
  - Column 1: source service level (from CSV)
  - Column 2-N: dropdown per selected Cactus carrier showing available services
  - "No equivalent" option per carrier
- Validation: every source service must map to at least one selected Cactus carrier (else those shipments fail)
- Save to `pld_analysis_run_service_mappings` AND upsert `lead_service_level_mappings`

**Step 4: Warehouse mapping**
- Run quick scan of source CSV: extract distinct values from `origin_zip`
- Show table:
  - Column 1: source origin ZIP
  - Column 2: shipment count
  - Column 3: dropdown of `lead_warehouses` for this lead
- Auto-match: for each origin ZIP, find nearest existing warehouse by Haversine distance from `zip3_centroids`. Pre-populate dropdown with the match.
- Allow user to "Create new warehouse" inline (opens modal)
- Save mapping (per-row resolved_warehouse_id will be set during rating)

**Final:** "Run Analysis" button. Status moves to READY_TO_RATE → RATING.

### Acceptance criteria for Phase 5
- [ ] CSV upload works for files up to 100 MB
- [ ] Parser correctly identifies all required columns
- [ ] Parser handles ISO and US date formats
- [ ] Mapping UI pre-fills from global defaults and lead history
- [ ] Mapping UI validates that every source service has at least one Cactus mapping before allowing run
- [ ] Auto-match for origin ZIPs uses Haversine distance
- [ ] Inline modal for creating new warehouse / new markup strategy works without leaving page

---

## Section 8 — Phase 6: Run Execution + Progress Tracking

### Goal
Background worker that processes a run from READY_TO_RATE → COMPLETE, updating progress as it goes.

### Architecture

**Background worker:** Supabase Edge Function `supabase/functions/pld-analysis-rate-run/index.ts`

Triggered by Postgres function notification when `pld_analysis_runs.status` transitions to 'RATING' (via `pg_notify`).

OR, simpler for v1: triggered explicitly by the "Run Analysis" button via fetch to the Edge Function URL.

### Worker flow

```
async function runAnalysis(runId: string) {
  const run = await db.run.fetch(runId);
  
  // Mark as RATING
  await db.run.update(runId, { status: 'RATING', progress_pct: 0 });
  
  // Load source CSV from Storage
  const csvText = await storage.download(run.source_file_path);
  const shipments = parseCSV(csvText);
  
  // Load all reference data needed
  const strategies = await loadStrategiesForRun(runId);
  const serviceMappings = await loadServiceMappingsForRun(runId);
  const warehouseMap = await loadWarehouseMap(run.lead_id);
  
  const totalRows = shipments.length;
  let processedCount = 0;
  const batchSize = 1000;
  
  // Detect period range
  let minDate = null, maxDate = null;
  
  // Process in batches
  for (let i = 0; i < shipments.length; i += batchSize) {
    const batch = shipments.slice(i, i + batchSize);
    const ratedBatch = [];
    const ratesBatch = [];
    
    for (const sourceRow of batch) {
      // Resolve warehouse
      const warehouseId = resolveWarehouse(sourceRow.origin_zip, warehouseMap);
      
      // Build NormalizedShipment
      const normalizedShipment = {
        trackingNumber: sourceRow.tracking_number,
        shipDate: parseDate(sourceRow.ship_date),
        sourceCarrier: sourceRow.carrier,
        sourceServiceLevel: sourceRow.service_level,
        originZip: sourceRow.origin_zip,
        destZip: sourceRow.dest_zip,
        destCountry: sourceRow.dest_country,
        weightValue: new Decimal(sourceRow.weight_value),
        weightUnit: sourceRow.weight_unit,
        length: sourceRow.length ? new Decimal(sourceRow.length) : null,
        width: sourceRow.width ? new Decimal(sourceRow.width) : null,
        height: sourceRow.height ? new Decimal(sourceRow.height) : null,
        dimUnit: sourceRow.dim_unit,
        currentCarrierCharge: new Decimal(sourceRow.current_carrier_charge),
        residentialFlag: sourceRow.residential_flag,
        sourceZone: sourceRow.zone,
        warehouseId,
      };
      
      // Track period range
      if (!minDate || normalizedShipment.shipDate < minDate) minDate = normalizedShipment.shipDate;
      if (!maxDate || normalizedShipment.shipDate > maxDate) maxDate = normalizedShipment.shipDate;
      
      // Rate it
      const result = await MultiCarrierOrchestrator.rateShipment(
        normalizedShipment,
        run.selected_carriers,
        serviceMappings,
        strategies,
        run.fuel_treatment_mode
      );
      
      // Build pld_analysis_shipments row
      ratedBatch.push({
        run_id: runId,
        row_number: i + ratedBatch.length + 1,
        source_tracking_number: sourceRow.tracking_number,
        source_order_number: sourceRow.order_number,
        source_ship_date: normalizedShipment.shipDate,
        source_carrier: normalizedShipment.sourceCarrier,
        source_service_level: normalizedShipment.sourceServiceLevel,
        source_origin_zip: normalizedShipment.originZip,
        source_dest_zip: normalizedShipment.destZip,
        source_dest_country: normalizedShipment.destCountry,
        source_weight_value: normalizedShipment.weightValue,
        source_weight_unit: normalizedShipment.weightUnit,
        source_length: normalizedShipment.length,
        source_width: normalizedShipment.width,
        source_height: normalizedShipment.height,
        source_dim_unit: normalizedShipment.dimUnit,
        source_residential_flag: normalizedShipment.residentialFlag,
        source_zone: normalizedShipment.sourceZone,
        source_current_carrier_charge: normalizedShipment.currentCarrierCharge,
        resolved_warehouse_id: warehouseId,
        resolved_zone: result.winningResult?.resolvedZone,
        zone_mismatch: result.winningResult?.zoneMismatch || false,
        computed_dim_weight: result.winningResult?.computedDimWeight,
        billable_weight_value: result.winningResult?.billableWeight,
        billable_weight_unit: result.winningResult?.billableWeightUnit,
        winning_carrier: result.winningCarrier,
        winning_service_level: result.winningServiceLevel,
        winning_quoted_rate: result.winningResult?.quotedRate,
        winning_base_cost: result.winningResult?.baseCost,
        winning_margin: result.winningResult?.margin,
        winning_savings: result.winningResult?.savings,
        rating_status: result.status,
        status_message: result.statusMessage,
        gofo_hub_used: result.winningResult?.gofoHubUsed,
        is_tied_at_rate: result.isTied || false,
        is_dim_billed: result.winningResult?.isDimBilled || false,
      });
      
      // Build per-carrier rates rows (one per carrier rated, including non-winners)
      for (const rate of result.rates) {
        ratesBatch.push({
          // shipment_id will be assigned after batch insert
          carrier_code: rate.carrierCode,
          service_level: rate.serviceLevel,
          base_cost: rate.baseCost,
          fuel_amount: rate.fuelAmount,
          markup_applied_amount: rate.markupAmount,
          quoted_rate: rate.quotedRate,
          margin: rate.margin,
          margin_pct: rate.marginPct,
          savings: rate.savings,
          savings_pct: rate.savingsPct,
          rating_status: rate.status,
          status_message: rate.statusMessage,
        });
      }
    }
    
    // Batch insert to pld_analysis_shipments
    const insertedShipments = await db.shipments.bulkInsert(ratedBatch);
    
    // Attach shipment IDs to rates and bulk insert
    // (Implementation: use returning IDs from bulkInsert, map by row_number)
    await db.shipmentRates.bulkInsert(ratesBatchWithShipmentIds);
    
    // Update progress
    processedCount += batch.length;
    const progressPct = (processedCount / totalRows * 100).toFixed(2);
    await db.run.update(runId, { progress_pct: progressPct });
  }
  
  // Compute aggregations
  const aggregations = await computeAggregations(runId);
  
  // Generate methodology footnote
  const methodologyFootnote = await buildMethodologyFootnote(runId);
  
  // Detect flags
  const today = new Date();
  const monthsOld = (today - maxDate) / (1000 * 60 * 60 * 24 * 30);
  const hasStaleData = monthsOld > 18;
  const hasPeakSeason = isPeakSeasonOverlap(minDate, maxDate); // true if Oct-Dec dates included
  const hasCoverageGaps = await db.shipments.anyWithStatus(runId, 'NO_COVERAGE');
  const hasTiedShipments = await db.shipments.anyTied(runId);
  
  // Detect annualization factor
  const sampleDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
  let annualizationFactor, annualizationPeriod;
  if (sampleDays <= 1) { annualizationFactor = 260; annualizationPeriod = 'working day'; }
  else if (sampleDays <= 7) { annualizationFactor = 52; annualizationPeriod = 'week'; }
  else if (sampleDays <= 31) { annualizationFactor = 12; annualizationPeriod = 'month'; }
  else if (sampleDays <= 92) { annualizationFactor = 4; annualizationPeriod = 'quarter'; }
  else if (sampleDays <= 365) { annualizationFactor = 365 / sampleDays; annualizationPeriod = 'period'; }
  else { annualizationFactor = null; annualizationPeriod = null; }
  
  // Mark as COMPLETE
  await db.run.update(runId, {
    status: 'COMPLETE',
    progress_pct: 100,
    rated_at: new Date(),
    period_start_date: minDate,
    period_end_date: maxDate,
    aggregations_internal: aggregations.internal,
    aggregations_client: aggregations.client,
    methodology_footnote_text: methodologyFootnote,
    has_coverage_gaps: hasCoverageGaps,
    has_tied_shipments: hasTiedShipments,
    has_stale_data: hasStaleData,
    has_peak_season: hasPeakSeason,
    annualization_factor: annualizationFactor,
    annualization_period: annualizationPeriod,
  });
  
  // Audit log
  await db.audit.log({
    action: 'pld_run_completed',
    entity_id: runId,
    description: `Run ${runId} completed: ${totalRows} shipments rated`,
  });
}
```

### Aggregations to compute (stored as JSONB)

**`aggregations_client` (safe for client PDF):**
```json
{
  "totals": {
    "total_shipments": 3153,
    "total_invoice_charge": 17613.71,
    "total_cactus_quoted": 16057.59,
    "total_savings": 1556.12,
    "savings_pct": 8.83,
    "avg_savings_per_package": 0.49
  },
  "by_service": [
    { "service": "DHL_ECOM:Ground", "shipments": 975, "savings": 593, "savings_pct": 10.97, ... },
    ...
  ],
  "by_zone": [
    { "zone": "1 & 2", "shipments": 152, "savings": 64, "savings_pct": 8.22, ... },
    ...
  ],
  "international_summary": {
    "shipments": 79,
    "savings": 199,
    "savings_pct": 18.67,
    "top_countries": ["GB", "CA", "AU"]
  }
}
```

**`aggregations_internal` (Cactus eyes only):**
```json
{
  "totals": {
    "total_shipments": 3153,
    "total_invoice_charge": 17613.71,
    "total_cactus_quoted": 16057.59,
    "total_cactus_base_cost": 14577.33,
    "total_savings": 1556.12,
    "total_margin": 1480.26,
    "margin_pct": 9.22,
    "shipments_dim_billed": 247,
    "shipments_dim_billed_pct": 7.83,
    "shipments_unmatched": 14,
    "shipments_no_coverage": 0,
    "shipments_tied_at_rate": 18
  },
  "by_service_internal": [...],
  "by_zone_internal": [...],
  "by_weight_band_internal": [...],
  "lane_analysis": [
    // Full sortable list of all (origin_zip3, dest_zip3) pairs
    { "origin_zip3": "282", "dest_zip3": "100", "shipments": 23, "current_spend": 145.30, "savings": 12.50, "margin": 14.20 },
    ...
  ]
}
```

### Methodology footnote builder

**Module:** `src/alamo/lib/pld-analysis/methodology-builder.ts`

```typescript
export async function buildMethodologyFootnote(runId: string): Promise<string> {
  const run = await loadRunWithLead(runId);
  
  const fragments: string[] = [];
  
  // Comparison basis
  const basis = run.fuel_treatment_mode === 'full' 
    ? 'total invoice charges (base shipping + fuel surcharge)' 
    : 'base shipping charges';
  fragments.push(`Comparison based on ${basis} per shipment, as reported on the source data covering shipments dated ${formatDateRange(run.period_start_date, run.period_end_date)}.`);
  
  // Carriers
  const carrierList = run.selected_carriers.map(c => carrierDisplayName(c)).join(', ');
  fragments.push(`Cactus rates are derived from contracted rate cards prepared for ${run.lead.company_name} for ${carrierList}.`);
  
  // Multi-carrier optimization
  if (run.selected_carriers.length > 1) {
    fragments.push('Each shipment is matched to the lowest-cost Cactus carrier eligible to deliver it.');
  }
  
  // Coverage gap
  if (run.has_coverage_gaps) {
    fragments.push("Shipments to destinations outside GOFO Regional's service area were rated against alternative selected carriers.");
  }
  
  // Exclusions
  fragments.push('Other accessorials (residential, oversize, address correction, etc.) excluded — they apply equally on both sides.');
  
  // Rounding
  fragments.push('Savings amounts rounded to the nearest dollar; totals may differ by ~$1 due to rounding.');
  
  // Annualization
  if (run.annualization_factor) {
    fragments.push(`Annualized projection assumes consistent volume across ${run.annualization_factor} ${run.annualization_period} cycles.`);
  }
  
  return fragments.join(' ');
}
```

### Acceptance criteria for Phase 6
- [ ] Worker successfully processes a 3,000-row test file (5 Logistics) end-to-end
- [ ] Progress updates visible in UI during run (poll `pld_analysis_runs.progress_pct` every 2 seconds)
- [ ] Aggregations correctly computed and stored
- [ ] Methodology footnote generated and stored
- [ ] All flags (stale, peak season, coverage gaps, tied) correctly detected
- [ ] Annualization factor selected based on sample window
- [ ] Run can be re-rated by editing mappings (creates new run with parent_run_id)
- [ ] Worker handles a 100k-row file in under 5 minutes
- [ ] Failure mode: if worker crashes mid-run, run.status set to 'FAILED' with error message

---

## Section 9 — Phase 7: PDF Generation + Per-Shipment CSV Export

### Goal
Build the three deliverables: client PDF, per-shipment verification CSV, internal margin view.

### Sub-phase 7a — Client PDF

**Library:** `@react-pdf/renderer`
**Module location:** `src/alamo/lib/pld-analysis/pdf/client-pdf.tsx`

**Layout:** Mirror the 5 Logistics PDF we built in chat. Key elements:

1. **Header band:** Cactus logo (left, ~1.4" wide) + "CONFIDENTIAL · Prepared {date}" (right, muted grey)
2. **Title bar (Forest #2D5A27 background):**
   - "Shipping Savings Analysis" (white, 20pt bold)
   - "Prepared for {lead.company_name} · {warehouse.label} · Period: {period}"
3. **4 hero metric boxes (Sand background, 0.5px Line border):**
   - Total savings (rounded, $1,556)
   - Savings % (8.83%)
   - Packages analyzed (3,153)
   - Average savings per package ($0.49 — keeps cents per Sawyer's preference)
4. **Annual projection callout (Forest background):**
   - Big number: $80,918
   - Caption: "ESTIMATED ANNUAL SAVINGS — Projected from this billing period at current volume ({factor} {period} cycles). Actual savings vary with shipping mix and volume."
5. **Savings by Service table:** Service, Packages, Current Cost, Cactus Rate, Savings, % Saved
6. **Domestic Savings by Zone table:** Zone, Packages, Current Cost, Savings, % Saved
7. **International callout (small Sand panel):** package count, savings, top destinations
8. **Methodology footnote:** dynamic text from `pld_analysis_runs.methodology_footnote_text`
9. **Footer bar (Forest):** "Cactus Logistics LLC · Prepared {date} · Questions? Contact your Cactus account team."

**Brand tokens (per master briefing Section 11 + design tokens):**
```typescript
const COLORS = {
  forest: '#2D5A27',
  amber: '#D97706',
  sand: '#F0EEE9',
  ink: '#0D1210',
  grey: '#9A9A95',
  line: '#D8D5CC',
  white: '#FFFFFF',
};
```

**Logo asset:**
- Stored at `src/alamo/public/brand/cactus-logo-color.png` (transparent background, 600px wide)
- Three variants planned for v1.5 (color, white, dark)

**Generation flow:**
1. User clicks "Download Client PDF" on run results page
2. Server renders React component to PDF
3. PDF returned as response, browser downloads
4. PDF NOT stored in DB or Storage by default (re-render on demand from run data)

### Sub-phase 7b — Per-shipment Verification CSV

**Module:** `src/alamo/lib/pld-analysis/csv-exports.ts`

**Output columns (no margin/cost):**
```
airbill, order_number, ship_date, source_carrier, source_service_level,
dest_country, dest_state, dest_zip, source_zone, resolved_zone, zone_mismatch,
billed_weight, weight_unit_used, weight_break_used, is_dim_billed,
current_carrier_charge, cactus_quoted_rate, savings, savings_pct,
status, status_message, winning_carrier, winning_service_level
```

Filter: only rows where `rating_status = 'OK'` by default. Optional toggle to include unmatched rows for transparency.

### Sub-phase 7c — Internal Margin View

**Route:** `/alamo/pld-analysis/runs/{run_id}/internal`

**Page sections:**

1. **Header summary:**
   - Total revenue (sum of cactus_quoted_rate)
   - Total cost (sum of base_cost + fuel_amount)
   - Total margin (revenue - cost)
   - Margin %
   - Avg margin per shipment

2. **Tied shipments tab** (when has_tied_shipments = true):
   - List of all shipments where multiple carriers quoted same rate
   - Allow per-shipment override of winning carrier
   - "Save Override" button updates `pld_analysis_shipments.winning_carrier`
   - Note: this CAN modify a COMPLETE run (override is a special operation; immutability trigger should permit this single column update via a privileged service role)

3. **Margin by service breakdown table**

4. **Margin by zone breakdown table**

5. **Margin by weight band breakdown table**

6. **DIM-billed analysis:**
   - "X shipments billed on DIM weight (Y% of rated shipments)"
   - "Z shipments would have benefited from packaging optimization"
   - List top 10 most-impacted shipments by DIM weight delta

7. **Lane analysis:**
   - Full sortable table of all (origin_zip3 → dest_zip3) lane pairs
   - Columns: shipments, current spend, savings, margin
   - Sortable by any column
   - Paginated 50 rows/page
   - Default sort: total spend descending

8. **Negative margin cells (rate card review targets):**
   - Cells where Cactus client card cell ≤ Cactus base cost cell
   - Surface for pricing strategy review

9. **Internal margin CSV download:** all `aggregations_internal` data + per-shipment internal rows

### Acceptance criteria for Phase 7
- [ ] Client PDF generated, single page, brand-aligned
- [ ] Per-shipment CSV exports with correct columns and no internal data
- [ ] Internal margin view page renders aggregations correctly
- [ ] DIM-billed metric shown
- [ ] Lane analysis table sortable
- [ ] Tied shipments list functional with per-shipment override
- [ ] All three deliverables triggerable from run results page

---

## Section 10 — Phase 8: Regression Test (5 Logistics)

### Goal
Validate the entire system by reproducing the 5 Logistics analysis we built manually in chat. Test A is the binding regression test.

### Test A — Base-only mode binding regression

**Setup script:** `database/seeds/v1.10.0-pld-regression-5logistics.sql`

Seeds:

1. **Lead row:**
```sql
INSERT INTO leads (company_name, company_profile, lead_source_type, primary_contact_name, primary_contact_email, ...) 
VALUES ('5 Logistics', 'THREE_PL', 'COLD_PROSPECTING', 'Test Contact', 'test@5logistics.example', ...);
```

2. **Lead warehouse (Charlotte):**
```sql
INSERT INTO lead_warehouses (lead_id, label, address_line_1, city, state, zip5, ...) 
VALUES (lead_id, 'Charlotte Main', '...', 'Charlotte', 'NC', '28202', ...);
```

3. **Markup strategies:**
   - Domestic strategy: type=RATE_CARD pointing to the 5 Logistics custom DHL eCom card
   - International strategy: type=FIXED_PERCENTAGE, fixed_percentage=12, fuel_markup_treatment='COMPOUND'

4. **Rate cards loaded** (CACTUS_BASE_COST + LEAD_QUOTED with parent FK):
   - DHL eCom Ground (base + 5L custom)
   - DHL eCom Expedited (base + 5L custom)
   - DHL eCom MAX (base + 5L custom)
   - DHL eCom Intl Direct (base + intl)
   - DHL eCom Intl Standard (base + intl)

5. **Service mappings** (lead_service_level_mappings):
   - "DHL Parcel Ground" → DHL_ECOM:Ground
   - "DHL Parcel Expedited" → DHL_ECOM:Expedited
   - "DHL Parcel Expedited Max" → DHL_ECOM:MAX
   - "DHL Parcel International Direct" → DHL_ECOM:IntlDirect
   - "DHL Parcel International Standard" → DHL_ECOM:IntlStandard

6. **Source CSV** in standard format:
   - Convert `InXpress_Data_Backup_4-18-2026__2_.xlsx` to the new CSV template format
   - 3,176 rows
   - Stored in `database/seeds/test-data/5logistics-pld-2026-04.csv`

### Test A execution

**Test script:** `src/alamo/lib/pld-analysis/__tests__/regression-5logistics.test.ts`

```typescript
describe('5 Logistics regression test', () => {
  it('reproduces $1,556.12 in base-only mode', async () => {
    // Setup
    await applySeed('v1.10.0-pld-regression-5logistics.sql');
    const csvPath = 'database/seeds/test-data/5logistics-pld-2026-04.csv';
    
    // Create run
    const runId = await createRun({
      lead_id: SEEDED_LEAD_ID,
      source_file_path: csvPath,
      selected_carriers: ['DHL_ECOM'],
      fuel_treatment_mode: 'base_only',
      // strategies: domestic for ground/expedited/max, intl for intl services
    });
    
    // Execute
    await runAnalysis(runId);
    
    // Verify
    const run = await db.run.fetch(runId);
    expect(run.status).toBe('COMPLETE');
    expect(run.aggregations_client.totals.total_shipments).toBe(3153);
    
    const totalSavings = new Decimal(run.aggregations_client.totals.total_savings);
    expect(totalSavings.toFixed(2)).toBe('1556.12');  // EXACT MATCH REQUIRED
    
    // Verify per-shipment CSV matches reference
    const csv = await generatePerShipmentCsv(runId);
    const referenceCsv = await fs.read('database/seeds/test-data/5logistics-reference-output.csv');
    expectCsvMatch(csv, referenceCsv);
  });
});
```

### Test B — Full mode sanity check

```typescript
it('runs in full fuel mode without errors and produces directionally similar savings', async () => {
  // Same setup as Test A, but fuel_treatment_mode = 'full'
  await applySeed('v1.10.0-pld-regression-5logistics.sql');
  await applySeed('database/seeds/diesel-prices-april-2026.sql'); // pre-populate diesel for the period
  
  const runId = await createRun({
    lead_id: SEEDED_LEAD_ID,
    source_file_path: 'database/seeds/test-data/5logistics-pld-2026-04.csv',
    selected_carriers: ['DHL_ECOM'],
    fuel_treatment_mode: 'full',
    // strategies: same as Test A
  });
  
  await runAnalysis(runId);
  
  const run = await db.run.fetch(runId);
  expect(run.status).toBe('COMPLETE');
  
  // Sanity check: savings should be in same order of magnitude as base-only
  const savings = new Decimal(run.aggregations_client.totals.total_savings);
  expect(savings.gt(500)).toBe(true);   // not zero or negative
  expect(savings.lt(5000)).toBe(true);  // not unreasonably large
});
```

### Acceptance criteria for Phase 8
- [ ] Seed script populates all required data
- [ ] Test A passes: exact $1,556.12 savings reproduced
- [ ] Test A passes: per-shipment CSV matches reference output
- [ ] Test B passes: full mode runs without errors
- [ ] Test B passes: savings is directionally reasonable
- [ ] Both tests run as part of CI (npm test)

### What to do if Test A fails
- Compare per-shipment CSV column-by-column against reference
- Likely culprits in order:
  1. Weight rounding off-by-one (5.3 oz → 6 oz vs 5.3 oz → 5 oz)
  2. Zone resolution wrong (verify `carrier_zone_matrices` matches DHL published)
  3. Wrong rate card cell selected
  4. Markup calculation bug (rate card cell vs fixed percentage path)
  5. Decimal precision issue (using Number instead of Decimal somewhere)
- Don't change the test to pass. Find the bug.

---

## Section 11 — Reference Material

### 11.1 Folder structure (final)

```
cactus-web-app/
  src/
    alamo/
      app/
        leads/
          page.tsx                     # leads list
          new/page.tsx                 # create lead
          [id]/page.tsx                # lead detail
          [id]/edit/page.tsx           # edit lead
          [id]/convert/route.ts        # POST: convert to org
        pld-analysis/
          runs/
            new/page.tsx               # upload CSV, pick lead
            [id]/setup/page.tsx        # mapping UI
            [id]/results/page.tsx      # client-facing results view
            [id]/internal/page.tsx     # margin view
            [id]/edit-mapping/page.tsx # post-run mapping edit
          reference-data/
            page.tsx                   # index
            zone-matrices/page.tsx
            coverage-zips/page.tsx
            fuel-tiers/page.tsx
            diesel-prices/page.tsx
            rate-cards/page.tsx
            zip3-centroids/page.tsx
          markup-strategies/
            page.tsx                   # list
            new/page.tsx               # create
            [id]/edit/page.tsx
        api/
          pld-analysis/
            runs/
              upload/route.ts          # POST CSV upload
              [id]/start-rating/route.ts # POST trigger worker
              [id]/pdf/route.ts        # GET client PDF
              [id]/csv/route.ts        # GET per-shipment CSV
              [id]/internal-csv/route.ts # GET internal CSV
              [id]/override-winner/route.ts # POST per-shipment override
      lib/
        pld-analysis/
          csv-parser.ts
          methodology-builder.ts
          aggregations-builder.ts
          pdf/
            client-pdf.tsx
            internal-pdf.tsx           # future
          csv-exports.ts
    core/
      pld-analysis/
        rating-engine.ts
        zone-resolver.ts
        weight-calculator.ts
        rate-card-lookup.ts
        fuel-calculator.ts
        markup-applier.ts
        service-matcher.ts
        carrier-router.ts
        orchestrator.ts
        types.ts
        __tests__/
  database/
    migrations/
      v1.10.0-001-extend-carrier-enum.sql
      v1.10.0-002-pld-enums.sql
      v1.10.0-003-leads-tables.sql
      v1.10.0-004-zone-data.sql
      v1.10.0-005-rate-cards.sql
      v1.10.0-006-markup-strategies.sql
      v1.10.0-007-pld-runs.sql
      v1.10.0-008-pld-shipments.sql
      v1.10.0-009-fuel-tables.sql
      v1.10.0-010-rls-policies.sql
      v1.10.0-011-views.sql
      v1.10.0-012-seed-reference.sql
    seeds/
      v1.10.0-pld-regression-5logistics.sql
      test-data/
        5logistics-pld-2026-04.csv
        5logistics-reference-output.csv
        diesel-prices-april-2026.sql
  supabase/
    functions/
      fetch-eia-diesel/index.ts
      pld-analysis-rate-run/index.ts
```

### 11.2 Initial seed data: global service level mapping defaults

Common synonyms to seed into `global_service_level_mapping_defaults`:

| Source | Cactus Carrier | Cactus Service |
|---|---|---|
| DHL Parcel Ground | DHL_ECOM | Ground |
| DHL Ecom Ground | DHL_ECOM | Ground |
| DHL Smartmail Parcel Ground | DHL_ECOM | Ground |
| GMP | DHL_ECOM | Ground |
| DHL Parcel Expedited | DHL_ECOM | Expedited |
| DHL Ecom Expedited | DHL_ECOM | Expedited |
| DHL Parcel Expedited Max | DHL_ECOM | MAX |
| DHL Parcel MAX | DHL_ECOM | MAX |
| DHL Parcel International Direct | DHL_ECOM | IntlDirect |
| DHL Parcel International Standard | DHL_ECOM | IntlStandard |
| GOFO Standard | GOFO | Standard |
| GOFO STDWE | GOFO | Standard |
| GOFO Regional | GOFO | Regional |
| GOFO REG | GOFO | Regional |

### 11.3 Test data conversion notes

Converting the original `InXpress_Data_Backup_4-18-2026__2_.xlsx` to the new CSV template format requires:
- Map column AC (PRODUCT CODE) → service_level
- Map column AD (ZONE) → zone (suggested field)
- Map column AE (BILLED WEIGHT) → weight_value, weight_unit (need to determine units per row)
- Map column AL (BASE CHARGE AMOUNT) → current_carrier_charge (for Test A base-only mode)
- For Test B (full mode), use SHIPMENT TOTAL or BASE+FUEL total
- Tracking number from AIRBILL # column
- Ship date from SHIPMENT DATE column (YYYYMMDD format → ISO 8601)
- Origin ZIP from SHIPPER ZIP CODE
- Dest ZIP from CONSIGNEE ZIP CODE
- Dest country from CONSIGNEE COUNTRY CODE
- Add `dim_unit = 'IN'` for all rows

A conversion script `database/seeds/test-data/convert-inxpress-to-template.ts` should produce both:
- `5logistics-pld-2026-04.csv` (the standard template format input)
- `5logistics-reference-output.csv` (expected per-shipment output for Test A regression)

### 11.4 Final pre-launch checklist

Before declaring v1 complete and launching to internal use:

- [ ] All 8 phases pass acceptance criteria
- [ ] Test A regression passes
- [ ] Test B sanity check passes
- [ ] Master briefing updated to v1.10.0 (cowork command applied)
- [ ] Documentation updated:
  - [ ] `docs/pld-analysis/csv-template-spec.md` (the public-facing spec for prospects)
  - [ ] `docs/pld-analysis/operator-guide.md` (how Cactus team runs an analysis)
- [ ] First real-world test: Sawyer runs an analysis for an actual prospect (not 5L), reviews quality
- [ ] Backup procedure: dev branch successfully merged to main; rollback plan documented

---

## Section 12 — Closing Notes

This brief is the binding specification for v1. Everything in it has been deliberately decided in conversation between the Senior Architect and Sawyer. Where the brief is silent on a topic, escalate to chat — do not invent a design.

The phased approach is deliberate. Each phase has independent value:
- After Phase 1: schema is in place; future work can begin even if rating doesn't work yet
- After Phase 3: rating engine works in isolation; can be tested with hardcoded data
- After Phase 6: full pipeline works; just no UI polish or PDF
- After Phase 8: ship-ready

If the build runs into trouble, isolate to the failing phase rather than rolling back everything. Each phase's database migrations are reversible (drop tables, drop types) without losing prior phases' work.

The 5 Logistics regression test is the load-bearing acceptance criterion. If it passes, v1 ships. If it fails, debug until it passes.

Welcome to building Cactus. This tool will pay for itself the first deal it wins.

— Senior Architect
2026-05-04

