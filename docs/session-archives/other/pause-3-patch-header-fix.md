# Pause 3 — DHL Parser Patch

**Issue:** Parser fails with "Could not locate the required header row in the first 10 rows. Row 1 actually contained: 'Effective Date'."

**Root cause:** Spec/handoff specified incorrect column header names. The parser is otherwise sound — header-row scan logic is working as designed. The fix is updating which strings to scan for.

**Verified against the actual file** (`dhl_ecommerce_cactus_base_rates_2026.xlsx`, 2,810 rows, sheet `ALL DC RATES`):

- Row 1: `'Effective Date'` in column A, all other columns null. No actual date value present.
- Row 2: actual headers — `Distribution Center | Product | Weight Break | Unit | Zone 1&2 | Zone 3 | Zone 4 | Zone 5 | Zone 6 | Zone 7 | Zone 8 | Zone 11-13`
- Rows 3-2810: 2,808 data rows
- 18 DCs × 7 products = 126 (DC, Product) pairs ✓
- Distinct DCs match `dhl_ecom_dcs` exactly: ATL, BOS, CAK, CLT, CVG, DEN, DFW, EWR, IAD, IAH, LAX, MCI, MCO, ORD, PHX, SEA, SFO, SLC ✓
- Distinct products match `DHL_ECOM_PRODUCTS` exactly ✓
- Source nulls: zero in Zones 1&2/3/4/5/6/7/8, **720 in Zone 11-13** (40 per DC, all corresponding to the Expedited Max product, which doesn't ship to AK/HI/PR/territories)

---

## Code changes

### 1. Update required header strings in `parseDhlEcomRates.ts`

Wherever the parser defines the canonical header set (the list it's scanning for), replace the three incorrect names. Zone columns stay exactly as they are.

```typescript
// BEFORE
const REQUIRED_HEADERS = [
  'DC code',
  'Product',
  'Weight value',
  'Weight unit',
  'Zone 1&2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 11-13',
] as const;

// AFTER
const REQUIRED_HEADERS = [
  'Distribution Center',
  'Product',
  'Weight Break',
  'Unit',
  'Zone 1&2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 11-13',
] as const;
```

If you have a column-key map elsewhere (e.g., `const COLUMN_KEYS = { dcCode: 'DC code', ... }`), update those keys too. The internal variable names in TS code (`dcCode`, `weightValue`, `weightUnit`) can stay — only the string literals being matched against the file change.

### 2. Normalize unit values to lowercase before staging

The file ships `'LB'` and `'OZ'`; we want `'lb'` and `'oz'` in the DB so the rating engine has consistent comparisons later.

In the row-processing loop, after extracting the `Unit` cell value:

```typescript
// BEFORE
const weightUnit = String(row[unitColIdx]);  // 'LB' or 'OZ'

// AFTER
const rawUnit = String(row[unitColIdx]).trim().toLowerCase();
if (rawUnit !== 'lb' && rawUnit !== 'oz') {
  // fail upload with operator-facing message
  throw new ParseError(`Unknown weight unit '${row[unitColIdx]}' on row N. Expected LB or OZ.`);
}
const weightUnit = rawUnit;  // 'lb' or 'oz'
```

### 3. Header-row scan: no logic change needed, but verify it skips row 1

The scan-first-10-rows logic is already correct. With the headers updated, it will skip row 1 (which only contains `'Effective Date'` in column A) and find the real headers in row 2. No changes required to the scan loop itself.

**Optional improvement** (not required for Pause 3, but good for resilience): if you want to be extra defensive against DHL adding more metadata rows in future versions, scan up to row 20 instead of row 10. The cost is negligible.

### 4. Optional — capture effective_date if it ever shows up in row 1

Currently row 1 has the literal text `'Effective Date'` in column A and nulls elsewhere. There's nothing to extract right now. But if DHL ever populates a date in column B of row 1 (or if the next year's file does), we want to auto-capture it instead of asking Sawyer to type it.

Add a one-shot scan before the header-row scan:

```typescript
// Try to extract effective_date from a metadata row above the headers.
// Looks for a row where column A contains 'Effective Date' (case-insensitive)
// and column B contains a Date or date-parseable string.
let extractedEffectiveDate: string | null = null;
for (let r = 1; r <= 5; r++) {
  const colA = ws.getCell(r, 1).value;
  if (colA && String(colA).trim().toLowerCase() === 'effective date') {
    const colB = ws.getCell(r, 2).value;
    if (colB instanceof Date) {
      extractedEffectiveDate = colB.toISOString().slice(0, 10);
    } else if (colB && !isNaN(Date.parse(String(colB)))) {
      extractedEffectiveDate = new Date(String(colB)).toISOString().slice(0, 10);
    }
    break;
  }
}
```

Then in the per-card stage write: prefer `formData.effectiveDate ?? extractedEffectiveDate ?? null`. Form-supplied value wins (operator override), file-extracted value next, null otherwise.

This is groundwork for the broader "carrier metadata auto-capture" thread that came up as Pause 3 judgment call #2. Worth doing now since it's 10 lines and we already know we want this behavior.

### 5. Update verification expectations in surface-back

The handoff said "72 null rates" as the expected aggregate-bar value. That was wrong. **Real expected value: 2,160 null rates**, distributed:

- 0 nulls in Zone 1, Zone 2 (replicated from Zone 1&2 — no source nulls)
- 0 nulls in Zone 3, 4, 5, 6, 7, 8
- 720 nulls in each of Zone 11, Zone 12, Zone 13 (replicated from Zone 11-13's 720 source nulls)
- Total: 2,160 nulls

These nulls are intentional — they represent the Expedited Max product's lack of coverage for Zones 11/12/13 across all 18 DCs. Don't try to "fix" them.

---

## Updated expected aggregate-bar after applying patch

```
126 cards staged · 30,888 cells · 2,160 null rates · 0 unknown DCs · 0 unknown products
```

The 2,160 should display in **Bloom (`#D81B7A`)** per the original handoff's "any non-zero value renders in Bloom" rule for the aggregate bar. That's correct — 2,160 nulls *is* notable. The operator should see the alarm color, then read the stage preview to confirm they're all in Zone 11/12/13 of Expedited Max cards (which is expected). The Bloom color isn't saying "broken", it's saying "unusual, look at me."

If the operator hovers/expands the null count (worth a small UX improvement if easy): show the breakdown by zone — `Zone 11: 720 · Zone 12: 720 · Zone 13: 720`. That makes the pattern instantly readable.

---

## Re-verification checklist after patch

1. TS clean
2. Lint clean
3. Upload `dhl_ecommerce_cactus_base_rates_2026.xlsx`
4. Aggregate bar shows: `126 cards · 30,888 cells · 2,160 nulls · 0 unknown DCs · 0 unknown products`
5. Pick any (DC, Product) pair where Product = "Expedited Max" → confirm Zones 11/12/13 are all "—"
6. Pick any other product (e.g., "BPM Expedited") → confirm Zones 11/12/13 have actual numeric values
7. Commit
8. Q4: 126 rate cards, 30,888 cells in DB
9. Q5 (new): null-rate count in DB:
   ```sql
   SELECT count(*)
   FROM public.analysis_rate_card_cells c
   JOIN public.analysis_rate_cards r ON r.id = c.rate_card_id
   WHERE r.carrier_code='DHL_ECOM' AND r.fulfillment_mode='na'
     AND c.rate IS NULL;
   -- expect 2,160
   ```
10. Q6 (new): null-rate distribution by zone (sanity check that all 2,160 are in Zone 11/12/13):
    ```sql
    SELECT c.zone, count(*) AS null_count
    FROM public.analysis_rate_card_cells c
    JOIN public.analysis_rate_cards r ON r.id = c.rate_card_id
    WHERE r.carrier_code='DHL_ECOM' AND r.fulfillment_mode='na'
      AND c.rate IS NULL
    GROUP BY c.zone
    ORDER BY c.zone;
    -- expect 3 rows: Zone 11=720, Zone 12=720, Zone 13=720
    ```
11. Status card 1 fills in (variant_count = 18, NOT 7 — see Pause 3 surface-back review)
12. Q7 unchanged at 953/967/3
13. Screenshot

---

## Going to spec rev 4 (carry-forward list)

Adding to the running list of corrections for the eventual rev 4:

- DHL workbook column headers: `Distribution Center` / `Weight Break` / `Unit` (not `DC code` / `Weight value` / `Weight unit`)
- DHL workbook has metadata row 1 (`Effective Date` label, currently no value); real headers in row 2
- DHL unit values arrive uppercase (`LB`/`OZ`), normalize to lowercase for storage
- Zone 11-13 nulls: 720 source / 2,160 downstream — universal across all 18 DCs, corresponding to Expedited Max product's coverage gap. Replace the spec's "24 SLC nulls" claim entirely.
- Effective Date auto-capture from row 1 col B if present; form override wins
