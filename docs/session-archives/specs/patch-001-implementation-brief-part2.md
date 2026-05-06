# PATCH-001 — Implementation Brief Part 2 Updates

**Source:** `pld-analysis-engine-v1-implementation-brief-part2.md` v1.0
**Target version:** v1.1
**Reason:** Add Top 3 lanes panel, Top 5 weights panel, and DIM-billed callout to client PDF. Confirmed by Sawyer 2026-05-04.

This patch is additive — no removals, no replacements. Apply alongside the original part 2 brief; Claude Code should treat this patch as authoritative for the changed sections.

---

## Patch 1 — Phase 6 (Section 8): Update aggregations_client JSONB schema

**Location:** Section 8 (Phase 6: Run Execution + Progress Tracking) → "Aggregations to compute (stored as JSONB)" → `aggregations_client` block.

**Original schema:**

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
  "by_service": [...],
  "by_zone": [...],
  "international_summary": {...}
}
```

**Updated schema (v1.1):**

```json
{
  "totals": {
    "total_shipments": 3153,
    "total_invoice_charge": 17613.71,
    "total_cactus_quoted": 16057.59,
    "total_savings": 1556.12,
    "savings_pct": 8.83,
    "avg_savings_per_package": 0.49,
    "shipments_dim_billed": 247,
    "shipments_dim_billed_pct": 7.83
  },
  "by_service": [...],
  "by_zone": [...],
  "international_summary": {...},
  "top_lanes": [
    {
      "rank": 1,
      "origin_zip3": "282",
      "dest_zip3": "100",
      "shipment_count": 187,
      "total_spend": 1023.45
    },
    {
      "rank": 2,
      "origin_zip3": "282",
      "dest_zip3": "606",
      "shipment_count": 142,
      "total_spend": 891.20
    },
    {
      "rank": 3,
      "origin_zip3": "282",
      "dest_zip3": "300",
      "shipment_count": 128,
      "total_spend": 743.80
    }
  ],
  "top_weights": [
    {
      "rank": 1,
      "weight_label": "8 oz",
      "weight_value": 8,
      "weight_unit": "OZ",
      "shipment_count": 412,
      "total_spend": 1847.30
    },
    {
      "rank": 2,
      "weight_label": "1 lb",
      "weight_value": 1,
      "weight_unit": "LB",
      "shipment_count": 387,
      "total_spend": 2104.55
    },
    ...up to 5 entries
  ]
}
```

### Aggregation computation rules

**`top_lanes` (Top 3 lanes ranked):**
- Group successfully rated shipments by `(source_origin_zip[0:3], source_dest_zip[0:3])` — the ZIP3 prefixes
- Compute `shipment_count` and `total_spend` (sum of `source_current_carrier_charge`) per lane
- Rank by `shipment_count` DESC, then by `total_spend` DESC as tiebreaker
- Take top 3 only
- For domestic-only display: filter to shipments where `source_dest_country = 'US'`. Confirm with Sawyer if intl lanes should appear in the same list, currently treating as domestic-only.
- Skip rows where origin or destination ZIP is missing

**`top_weights` (Top 5 package weights):**
- Group successfully rated shipments by `(source_weight_value, source_weight_unit)` exactly as entered (not by billable weight, not by rate-card weight break)
- Compute `shipment_count` and `total_spend` per unique weight value/unit pair
- Rank by `shipment_count` DESC, then by `total_spend` DESC as tiebreaker
- Take top 5
- `weight_label` is the human-readable form (e.g., `"8 oz"`, `"1 lb"`, `"2.5 lb"`) — useful for direct PDF rendering without reformatting

**`shipments_dim_billed`:**
- Count of `pld_analysis_shipments` rows where `is_dim_billed = TRUE` AND `rating_status = 'OK'`
- `shipments_dim_billed_pct` = `shipments_dim_billed / total_shipments × 100`, rounded to 2 decimals

### Notes for Phase 6 worker implementation

These three new aggregation fields are computed during the same `computeAggregations()` step as the existing fields. Add three new helper functions:

```typescript
// In aggregations-builder.ts

function computeTopLanes(shipments: ShipmentRow[]): TopLane[] {
  const domesticShipments = shipments.filter(
    s => s.rating_status === 'OK' 
      && s.source_dest_country === 'US' 
      && s.source_origin_zip 
      && s.source_dest_zip
  );
  
  const lanesMap = new Map<string, { count: number; spend: Decimal }>();
  for (const s of domesticShipments) {
    const originZip3 = s.source_origin_zip.substring(0, 3);
    const destZip3 = s.source_dest_zip.substring(0, 3);
    const key = `${originZip3}|${destZip3}`;
    const existing = lanesMap.get(key) || { count: 0, spend: new Decimal(0) };
    existing.count += 1;
    existing.spend = existing.spend.plus(s.source_current_carrier_charge);
    lanesMap.set(key, existing);
  }
  
  const lanes = Array.from(lanesMap.entries())
    .map(([key, val]) => {
      const [originZip3, destZip3] = key.split('|');
      return {
        origin_zip3: originZip3,
        dest_zip3: destZip3,
        shipment_count: val.count,
        total_spend: val.spend.toNumber(),
      };
    })
    .sort((a, b) => 
      b.shipment_count - a.shipment_count 
      || b.total_spend - a.total_spend
    )
    .slice(0, 3)
    .map((lane, idx) => ({ rank: idx + 1, ...lane }));
  
  return lanes;
}

function computeTopWeights(shipments: ShipmentRow[]): TopWeight[] {
  const okShipments = shipments.filter(s => s.rating_status === 'OK');
  
  const weightsMap = new Map<string, { count: number; spend: Decimal; value: number; unit: string }>();
  for (const s of okShipments) {
    const key = `${s.source_weight_value.toString()}|${s.source_weight_unit}`;
    const existing = weightsMap.get(key) || { 
      count: 0, 
      spend: new Decimal(0), 
      value: s.source_weight_value.toNumber(), 
      unit: s.source_weight_unit 
    };
    existing.count += 1;
    existing.spend = existing.spend.plus(s.source_current_carrier_charge);
    weightsMap.set(key, existing);
  }
  
  const weights = Array.from(weightsMap.values())
    .sort((a, b) => 
      b.count - a.count 
      || b.spend.toNumber() - a.spend.toNumber()
    )
    .slice(0, 5)
    .map((w, idx) => ({
      rank: idx + 1,
      weight_label: formatWeightLabel(w.value, w.unit),
      weight_value: w.value,
      weight_unit: w.unit,
      shipment_count: w.count,
      total_spend: w.spend.toNumber(),
    }));
  
  return weights;
}

function formatWeightLabel(value: number, unit: string): string {
  // 8 → "8 oz", 1.5 → "1.5 lb", 0.5 → "0.5 lb"
  const formatted = Number.isInteger(value) ? value.toString() : value.toString();
  return `${formatted} ${unit.toLowerCase()}`;
}

function computeDimBilledStats(shipments: ShipmentRow[]): { 
  shipments_dim_billed: number; 
  shipments_dim_billed_pct: number 
} {
  const okShipments = shipments.filter(s => s.rating_status === 'OK');
  const dimBilledCount = okShipments.filter(s => s.is_dim_billed === true).length;
  const totalCount = okShipments.length;
  return {
    shipments_dim_billed: dimBilledCount,
    shipments_dim_billed_pct: totalCount > 0 
      ? Math.round((dimBilledCount / totalCount) * 10000) / 100 
      : 0,
  };
}
```

These three computations run on the in-memory shipment array during `computeAggregations()`. Should add no measurable runtime cost on a 100k-row run.

---

## Patch 2 — Phase 7 (Section 9): Update Client PDF layout

**Location:** Section 9 (Phase 7: PDF Generation) → "Sub-phase 7a — Client PDF" → "Layout" subsection.

**Original layout** (existing 9 elements numbered 1-9):
1. Header band (logo + confidential)
2. Title bar (Forest)
3. 4 hero metric boxes
4. Annual projection callout (Forest)
5. Savings by Service table
6. Domestic Savings by Zone table
7. International callout
8. Methodology footnote
9. Footer bar (Forest)

**Updated layout (v1.1)** — three new elements inserted, original elements renumbered:

1. Header band (logo + confidential) — unchanged
2. Title bar (Forest) — unchanged
3. 4 hero metric boxes — unchanged
4. Annual projection callout (Forest) — unchanged
5. Savings by Service table — unchanged
6. Domestic Savings by Zone table — unchanged
7. **NEW: Top 3 Lanes panel** (Sand background, 0.5px Line border)
8. **NEW: Top 5 Package Weights panel** (Sand background, 0.5px Line border)
9. **NEW: DIM-billed callout** (small inline panel, single line)
10. International callout — unchanged
11. Methodology footnote — unchanged
12. Footer bar (Forest) — unchanged

### Element 7 — Top 3 Lanes panel

**Visual:** Single row with three equal-width columns. Each column has:
- Small rank label ("LANE #1") in muted grey, 8pt
- Origin → destination in bold ink, 11pt: e.g., **`282 → 100`**
- Below that, in regular text: `187 packages · $1,023`

**Layout note:** If a run has fewer than 3 distinct lanes (rare, only on tiny datasets), only render the lanes that exist. Don't pad with empty cards.

**Section header above the panel:** "TOP DESTINATION LANES" in uppercase 10pt bold ink, followed by a small subtitle "By package volume" in muted grey 8pt.

### Element 8 — Top 5 Package Weights panel

**Visual:** A small horizontal table with 5 rows (or fewer if dataset has fewer unique weights):

| Rank | Weight | Packages | Total Spend |
|------|--------|----------|-------------|
| 1 | 8 oz | 412 | $1,847 |
| 2 | 1 lb | 387 | $2,105 |
| ... | ... | ... | ... |

Same Sand-bg + 0.5px Line styling as the Savings by Service table.

**Section header above:** "MOST COMMON PACKAGE WEIGHTS" in uppercase 10pt bold ink.

### Element 9 — DIM-billed callout

**Visual:** Single horizontal panel, Sand background, 0.5px Line border, ~half the width of the page:

> **DIM weight billing** · **247 of 3,153 packages (7.8%)** were billed on dimensional weight rather than actual weight. Cactus can help identify packaging optimization opportunities.

When DIM-billed count is 0 or unavailable (e.g., no dimensions provided in CSV), this callout is **omitted entirely** — don't show "0 packages" since it implies the analysis was done.

When DIM-billed count is below 1% (rare but possible for low-DIM-impact files), still show the callout — the absolute number is interesting even at low percentages.

### Layout reasoning

The three new panels go *between* the existing Domestic Zone table and the International callout. They're additional dimensions of the same data already shown in the body. Keeps the document flow:

- *What's the savings?* → hero metrics + annual projection (top of page)
- *How is it broken down?* → service + zone tables (existing)
- *Where are you shipping?* → lanes + weights + DIM (new)
- *International note* (if applicable)
- *Methodology* (footnote)

### Page-fit verification

After Phase 7 is implemented, render the 5 Logistics regression PDF and verify:
- All 12 elements fit on one page at standard letter size (8.5" × 11") with 0.4" top/bottom margins, 0.55" side margins
- If overflow happens, reduce vertical padding on the new panels first; do not reduce the existing element sizes
- If overflow still happens, escalate to chat — may need to compress the methodology footnote font from 7.5pt to 7pt

---

## Patch 3 — Phase 7 (Section 9): Update Per-Shipment CSV (no change)

The per-shipment CSV continues to include the `is_dim_billed` boolean column as already specified in Section 9, Sub-phase 7b. No changes here — just confirming this stays as-is.

---

## Patch 4 — Phase 7 (Section 9): Internal Margin View — keep DIM-billed analysis

The internal margin view continues to show DIM-billed analysis as already specified (Section 9, sub-phase 7c, item 6 "DIM-billed analysis"). The DIM-billed metric is now shown in **both** the client PDF (high-level callout) and the internal view (deeper analysis with top-impacted shipments). No removal — additive only.

The full sortable lane table also stays in the internal view as specified. The client PDF's Top 3 Lanes panel is a curated subset; the internal view retains the full 500+ row table for diagnostic use.

---

## Patch 5 — Section 11.1 (Folder Structure): No changes

No new modules required. The new aggregation helpers go in the existing `aggregations-builder.ts`. The new PDF panels go in the existing `client-pdf.tsx`.

---

## Patch 6 — Phase 8 (Section 10): Update Test A regression assertion

**Location:** Section 10 (Phase 8: Regression Test) → Test A code block.

**Original assertion:**

```typescript
expect(run.aggregations_client.totals.total_shipments).toBe(3153);
const totalSavings = new Decimal(run.aggregations_client.totals.total_savings);
expect(totalSavings.toFixed(2)).toBe('1556.12');  // EXACT MATCH REQUIRED
```

**Updated assertion (v1.1)** — same checks plus new ones for the new aggregations:

```typescript
expect(run.aggregations_client.totals.total_shipments).toBe(3153);
const totalSavings = new Decimal(run.aggregations_client.totals.total_savings);
expect(totalSavings.toFixed(2)).toBe('1556.12');  // EXACT MATCH REQUIRED

// New aggregations should be present and sane
expect(run.aggregations_client.top_lanes).toBeDefined();
expect(run.aggregations_client.top_lanes.length).toBeGreaterThan(0);
expect(run.aggregations_client.top_lanes.length).toBeLessThanOrEqual(3);
expect(run.aggregations_client.top_lanes[0].rank).toBe(1);

expect(run.aggregations_client.top_weights).toBeDefined();
expect(run.aggregations_client.top_weights.length).toBeGreaterThan(0);
expect(run.aggregations_client.top_weights.length).toBeLessThanOrEqual(5);
expect(run.aggregations_client.top_weights[0].rank).toBe(1);

expect(run.aggregations_client.totals.shipments_dim_billed).toBeDefined();
expect(typeof run.aggregations_client.totals.shipments_dim_billed_pct).toBe('number');
```

**Note on regression strictness:** The exact $1,556.12 savings figure is the binding regression. Top lanes / top weights / DIM-billed counts are not strict regressions because the original 5 Logistics analysis didn't compute these metrics. We only assert that they're present and structurally valid. Once Phase 8 has run the new system once, capture the actual top-3 lanes, top-5 weights, and DIM-billed count produced — store those as a separate "expected" snapshot for future regression on the same source file.

---

## Patch 7 — Phase 7 acceptance criteria addition

**Location:** Section 9 (Phase 7) → "Acceptance criteria for Phase 7" list.

**Add the following items to the existing acceptance list:**

- [ ] Top 3 Lanes panel renders with correct rank order on the 5 Logistics regression PDF
- [ ] Top 5 Package Weights panel renders with correct rank order on the 5 Logistics regression PDF
- [ ] DIM-billed callout renders when shipments_dim_billed > 0
- [ ] DIM-billed callout omitted when shipments_dim_billed = 0
- [ ] PDF still fits on a single letter-sized page after additions
- [ ] aggregations_client JSONB contains top_lanes, top_weights, shipments_dim_billed fields

---

## Patch 8 — Acceptance criteria for Phase 6 addition

**Location:** Section 8 (Phase 6) → "Acceptance criteria for Phase 6" list.

**Add the following items:**

- [ ] aggregations_client.top_lanes contains up to 3 ranked entries with origin_zip3, dest_zip3, shipment_count, total_spend
- [ ] aggregations_client.top_weights contains up to 5 ranked entries with weight_label, weight_value, weight_unit, shipment_count, total_spend
- [ ] aggregations_client.totals.shipments_dim_billed and shipments_dim_billed_pct are populated
- [ ] Top lanes ranked by shipment_count DESC, ties broken by total_spend DESC
- [ ] Top weights ranked by shipment_count DESC, ties broken by total_spend DESC
- [ ] Lanes correctly use ZIP3 prefixes (3 chars), not full 5-digit ZIPs

---

## End of patch

This patch should be applied alongside the original implementation brief. Claude Code reads both documents — original + patch — and treats the patch as authoritative for the changed sections.

When Claude Code begins Phase 6, it should reference this patch first to know the full aggregations_client schema. When it begins Phase 7, it should reference this patch first to know the full PDF layout. All other phases (1-5, 8) are unaffected by this patch except for the Phase 8 acceptance criteria additions noted above.

— Senior Architect
2026-05-04
