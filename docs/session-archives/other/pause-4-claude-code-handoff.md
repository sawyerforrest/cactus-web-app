# Pause 4 — GOFO Standard Parser + Commit Wiring

**Spec:** `docs/session-archives/specs/rate-cards-parser-spec.md` (rev 3 — DHL-shaped; this handoff carries the rev-4 deltas inline)
**Status entering this handoff:** Pause 3 + 3.5 done. DHL eCom Domestic landed (126 cards, 30,888 cells, dim_factor=166), committed-rate-card viewer shipped, all 4 GOFO source workbooks probed end-to-end.
**Your goal:** wire up GOFO Standard PU and DO ingestion. New parser, two new Server Actions, status-card hookup. Same architectural shape as DHL but with carrier-specific structural differences captured below.

---

## DB side — already done

- Migration `v1.10.0-038` applied. Function `analysis_rate_cards_commit_gofo_standard(p_upload_session_id uuid, p_fulfillment_mode fulfillment_mode_enum)` exists with `SECURITY DEFINER` and `EXECUTE` grants for `authenticated` + `service_role`.
- Guard verified: invokes with non-existent session raise `'No GOFO Standard / <mode> rows staged for session <uuid>'`.
- The RPC strictly expects **9 cards per fulfillment mode** (8 physical hubs + 1 `US_REMOTE_AREAS`). Truncate-replace is scoped to the specific fulfillment mode so PU and DO don't disturb each other.
- Comprehensive supply check passed: zero unhandled NOT NULL canonical columns. The Pause 3 6-fix-loop will not recur.

---

## File-probe findings (locked in — pre-discovered)

I opened all four GOFO workbooks before writing this handoff. Here's what the parser needs to handle that the original spec didn't anticipate:

1. **Header row is row 4**, not row 1. R1 is title metadata ("US Shipping Standard..."), R2-R3 blank, R4 holds `Weight | Zone 1&2 | Zone 3 | ... | Zone 8`. Same defensive scan pattern as DHL — scan rows 1-20 for header signature.

2. **Weight + unit are a single string cell** (`"1 oz"`, `"13 lbs"`). Parser regex: `/^(\d+(?:\.\d+)?)\s+(oz|lbs?)$/i`. Note: GOFO uses `"lbs"` (plural); normalize to `"lb"` before staging so `upper()` cast in the RPC produces a valid `weight_unit_enum`.

3. **Surcharges sidebar in column J onward**. Per-sheet metadata extracted from R5-R49 of column J (label) + L (value):
   - R5 J/L: Fuel Surcharge / Waived
   - R6: Residential Surcharge / Waived
   - R7: Delivery Area Surcharge / Waived\*
   - R8: Remote Area Surcharge / "Refer to separate sheet"
   - R9: Peak Season Surcharge / "Announced By GOFO"
   - R10: Overlabeling Fee / 0.7
   - R12: Oversize Surcharge / 15
   - **R14: Dimensional Weight / 166** (the dim factor — auto-extract; if missing, parse fails loudly)
   - R17: Rates effective / 2026-04-09 (the effective_date)
   - R18: Rates valid until / 2026-12-31 (the deprecated_date)
   - R34: Re-ship of returned / "$3.00 + postage"

4. **STD-prefix workbook codes map to physical hub codes** (Sawyer-confirmed):

   | Workbook STD code | Physical hub | Origin ZIP3 |
   |---|---|---|
   | STDWE | LAX | 900 |
   | STDCE | ORD | 606 |
   | STDNJ | EWR | 071 |
   | STDNE | JFK | 114 |
   | STDSO | DFW | 752 |
   | STDEA | ATL | 303 |
   | STDSE | MIA | 331 |
   | STDSL | SLC | 841 |

   **Variant column stores the physical hub code, NOT the STD label.** Parser maps STD→physical via const dictionary at parse time. Aligns with `gofo_hubs`, `gofo_hub_enum`, `carrier_zone_matrices`, and Pause 5 Regional. If GOFO ever renames their STD codes, only the parser dictionary changes; DB stays stable.

5. **9 cards per scope, not 8.** The `US Remote Areas` sheet is treated as a 9th rate card variant: `variant='US_REMOTE_AREAS'`. Self-contained 45-weight × 9-zone rate sheet (one extra Zone 9 vs hub sheets). Embedded `(zip3, hub) → zone` mapping from columns K-T goes into `surcharge_config.us_remote_areas_zip_zones` jsonb on this single card. ~25 ZIPs covering Puerto Rico, Virgin Islands, Military APOs, Hawaii, Guam, Alaska.

6. **Rate matrix dimensions per card:**
   - 8 hub cards: 45 weight rows (15 oz + 30 lb) × 8 downstream zones (after Zone 1&2 → Zone 1, Zone 2 replication, source has 7 zone columns). 360 cells per card. Total: 8 × 360 = 2,880 cells.
   - 1 US_REMOTE_AREAS card: 45 weight rows × 9 downstream zones. 405 cells. Total: 405 cells.
   - **Per scope: 9 cards, 3,285 cells.**
   - Across PU + DO: 18 cards, 6,570 cells.

7. **Dim factor in the workbook = 166** (matches DHL value coincidentally; parser extracts dynamically — see Decision 1 below).

8. **Effective date 2026-04-09, deprecated date 2026-12-31** — parser auto-extracts; no `current_date` fallback like DHL needed.

---

## Architectural decisions (Sawyer-ratified)

**D1: Dim factor handling.** Parser auto-extracts from R14 col L of each sheet. Stages as numeric. RPC casts to int4 and inserts. **No COALESCE fallback** in RPC — if parser fails to find dim factor, it fails at parse time with a clear error message. Don't silently default to 166.

**D2: US Remote Areas as 9th variant.** `variant='US_REMOTE_AREAS'`, `service_level='Standard'`, same `card_version`/`weight_unit`/`zone_resolution_mode` literals as hub cards. The 9-zone rate sheet stages 405 cells; the embedded ZIP-zone matrix becomes `surcharge_config.us_remote_areas_zip_zones`.

**D3: Regional ZIP Code List (Pause 5 — flagged here for context).** Already loaded as `gofo_regional_zone_matrix` (66,884 rows, matrix_version `2026-04-28`, 8 hubs, no DEN). Pause 4 doesn't touch this. Pause 5's parser will not re-load it; surcharge_config stores `"zone_resolution_matrix_ref": "gofo_regional_zone_matrix"`.

**D4: DEN asymmetry.** PU workbook has a DEN column in its Zip Code List that DO doesn't. Sawyer is asking GOFO rep; for now we assume **no DEN regional hub**. If GOFO confirms DEN exists, that's a separate Zone Matrices screen update + `gofo_hub_enum` extension + `gofo_hubs` row addition. Parser-side: if a DEN column appears in any GOFO Standard sheet, fail loudly (Pattern 5 strict subset against `gofo_hubs ∪ {US_REMOTE_AREAS}`).

**D5: Surcharges in jsonb, not schema columns.** Premature schema rigor; revisit in Pause 6 polish once rating engine surfaces actual filter patterns.

---

## Files to create

### `src/alamo/app/pld-analysis/reference-data/rate-cards/parsers/parseGofoStandardRates.ts`

New parser, parallel to `parseDhlEcomRates.ts`. Skeleton:

```typescript
import { Workbook, type Worksheet } from 'exceljs';
import type { ParseResult, ParsedRateCard } from '../types';

// STD-to-physical hub mapping (locked-in from carrier_zone_matrices alignment)
const STD_TO_PHYSICAL: Record<string, string> = {
  STDWE: 'LAX',
  STDCE: 'ORD',
  STDNJ: 'EWR',
  STDNE: 'JFK',
  STDSO: 'DFW',
  STDEA: 'ATL',
  STDSE: 'MIA',
  STDSL: 'SLC',
};

const US_REMOTE_AREAS_SHEET = 'US Remote Areas';
const US_REMOTE_AREAS_VARIANT = 'US_REMOTE_AREAS';

const WEIGHT_CELL_RE = /^(\d+(?:\.\d+)?)\s+(oz|lbs?)$/i;

export async function parseGofoStandardRates(
  buffer: ArrayBuffer,
  fulfillmentMode: 'pickup' | 'dropoff'
): Promise<ParseResult> {
  // 1. Load workbook via ExcelJS (matches DHL pattern)
  // 2. Verify expected 9 sheets: 8 STD-prefix + 'US Remote Areas'
  // 3. For each STD sheet:
  //    a. Locate header row by signature scan (rows 1-20 for "Weight" + "Zone 1&2")
  //    b. Read 45 weight rows; parse each weight cell with WEIGHT_CELL_RE
  //    c. Read 7 zone columns; replicate Zone 1&2 → Zone 1 + Zone 2
  //    d. Map STD code → physical hub via STD_TO_PHYSICAL; fail if STD code not in dict
  //    e. Pattern 5: validate physical code exists in gofo_hubs (Server Action passes hub list to parser)
  //    f. Extract surcharges sidebar (col J/L, R5-R49)
  //    g. Extract dim factor R14 col L; required, fail if missing
  //    h. Extract effective_date R17 col L, deprecated_date R18 col L
  //    i. Stage one card with variant=physical_hub_code, 360 cells
  // 4. For 'US Remote Areas' sheet:
  //    a. Same header scan (different layout — 9 zone columns now)
  //    b. Read 45 weight rows × 8 source zone columns (Zone 1&2 + Zone 3-8 + Zone 9)
  //    c. Replicate Zone 1&2; total 9 downstream zones
  //    d. Read embedded ZIP-zone matrix from columns K-T:
  //       columns K = zip3, L = region, M-T = LAX/ORD/JFK/NJ/ATL/SLC/DFW/MIA injection zones
  //       (Note: workbook column header says 'NJ Injection' = EWR per our mapping)
  //    e. Build surcharge_config.us_remote_areas_zip_zones as:
  //       { "by_hub": { "LAX": {"006": 8, "007": 8, ...}, "ORD": {...}, ... } }
  //    f. Stage one card with variant='US_REMOTE_AREAS', 405 cells
  // 5. Verify 9 staged cards total before returning
  // 6. Return ParseResult with aggregate sanity counts
}
```

**Important parser-side validations:**

- **Sheet inventory check.** Expect exactly: `STDWE, STDCE, STDNJ, STDNE, STDSO, STDEA, STDSE, STDSL, US Remote Areas`. Different set → parse fails with diff message.
- **STD code subset.** Every sheet name in the 8-hub set must be a key in `STD_TO_PHYSICAL`. No unknown STD codes. (DEN protection.)
- **Pattern 5.** Server Action loads `gofo_hubs.hub_code` array, passes to parser. Parser validates each mapped physical code is in that array. `US_REMOTE_AREAS` is allowed as a synthetic 9th value (parser handles this branch explicitly).
- **Weight cell regex.** Cells that don't match the regex fail parsing — surfaces typos like `"1 ozz"` or `"1 lb"` (no plural — current spec says `lbs`).
- **Dim factor extraction.** R14 col L must contain a number (probably 166). If not, fail — don't default.
- **Surcharge consistency.** All 8 hub sheets should share identical sidebar values (fuel, residential, peak season, dim factor, effective dates). Parser warns if they differ; doesn't fail. Store per-sheet in surcharge_config.
- **Effective/deprecated date types.** ExcelJS may surface dates as JS `Date` objects or as strings depending on cell formatting. Coerce to ISO date string `YYYY-MM-DD` for staging.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/actions.ts` (modify)

Add two server actions alongside the existing DHL ones:

```typescript
export async function parseGofoStandardRateCard(
  formData: FormData,
  fulfillmentMode: 'pickup' | 'dropoff'
): Promise<ParseResult>

export async function commitGofoStandardRateCard(
  uploadSessionId: string,
  fulfillmentMode: 'pickup' | 'dropoff'
): Promise<CommitResult>
```

`parseGofoStandardRateCard`:
- Reads `gofo_hubs.hub_code` for Pattern 5 validation list
- Calls `parseGofoStandardRates(buffer, fulfillmentMode)`
- Stages results to `analysis_rate_cards_stage` + `analysis_rate_card_cells_stage`
- Returns ParseResult shaped same as DHL

`commitGofoStandardRateCard`:
- Calls `analysis_rate_cards_commit_gofo_standard(uploadSessionId, fulfillmentMode)`
- Returns rows_inserted + cells_inserted from RPC

### Mode tab routing on `/pld-analysis/reference-data/rate-cards/page.tsx`

The existing "GOFO Standard" mode tab (which shows "2 panels · pickup + dropoff") should now:
- Render two separate upload panels: one for PU, one for DO
- Each panel has its own file input, parse button, preview, commit button
- `fulfillment_mode` is fixed per panel (PU panel → `'pickup'`, DO panel → `'dropoff'`)
- After successful commit on either panel, that panel's status card flips to "LOADED"
- Status cards on the index page reflect both states independently

Reuse the existing single-panel layout components; just instantiate twice with different fulfillment modes.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/scope-segments.ts` (already exists, no changes)

Already maps `gofo-standard-pickup` and `gofo-standard-dropoff` to scope keys. Just verify the URL routing works for the new scope detail pages once they have data.

### Stage preview support for GOFO Standard

The `StagePreviewTable` and shared `CellTable` components from Pause 3.5 should work as-is for GOFO Standard — same shape (variant + service_level picker, weight × zone cell grid). The only deltas:
- Card picker shows 9 entries: 8 physical hubs (LAX, ORD, EWR, JFK, DFW, ATL, MIA, SLC) + "US Remote Areas"
- US_REMOTE_AREAS card has 9 columns instead of 8 (Zone 9 extra) — CellTable handles dynamic zone count already
- Sort: alphabetic by physical hub code with US Remote Areas pinned to bottom (it's not a hub)

If the existing CellTable/StagePreviewTable assume DHL-specific zone shapes (Zone 11/12/13 muting, etc.), generalize that — Zone 11+ muting is DHL-specific, doesn't apply here. The mute treatment should be carrier-conditional or driven by data (e.g., zones with all-null cells get muted).

### Scope detail page — already wired by Pause 3.5

`/pld-analysis/reference-data/rate-cards/gofo-standard-pickup/` and `/gofo-standard-dropoff/` should now render their respective 9 cards once committed. No new code needed — the existing dynamic route from Pause 3.5 handles it.

---

## Verification checklist (15 items)

Pre-commit:
1. **TS clean** — same baseline errors, zero new
2. **Lint clean**
3. **PU upload + parse:**
   - File: `2026_GOFO_Standard_Cactus_4_28_PU.xlsx`
   - Aggregate bar reads: **9 cards · 3,285 cells · 0 nulls**
   - Card picker shows: LAX, ORD, EWR, JFK, DFW, ATL, MIA, SLC, US Remote Areas (9 entries)
4. **PU stage preview spot-checks:**
   - Pick `LAX` (was STDWE in workbook): `1 oz @ Zone 1` should be `3.5` (matches workbook R5 col B of STDWE)
   - Pick `US Remote Areas`: `1 oz @ Zone 9` should be `6.16209` (matches workbook R5 col I of US Remote Areas sheet)
   - Pick `MIA` (was STDSE): `1 oz @ Zone 1` should be `3.54`
5. **PU commit:**
   - Returns `rate_cards_inserted=9, cells_inserted=3285`
   - Success banner shown
   - Stage cleared (next page reload shows no draft state)
6. **PU status card:**
   - "GOFO Standard — Pickup" card shows: 9 cards · 3,285 cells · 9 variants
   - Last upload timestamp + source filename
   - Card is now clickable
7. **PU detail page** (`/rate-cards/gofo-standard-pickup/`):
   - Header reads "GOFO Standard — Pickup"
   - Metadata strip: dim_factor=166, effective_date=2026-04-09, deprecated_date=2026-12-31, source filename
   - Picker shows 9 cards
   - Pick US Remote Areas: 9 zones populated; jsonb sidebar shows `us_remote_areas_zip_zones` data (you can spot-check by querying canonical, see SQL below)
8. **DO upload + parse + commit:** repeat steps 3-7 with `2026_GOFO_Standard_Cactus_4_28_drop_off.xlsx` and the dropoff status card / detail page
9. **Both scopes loaded simultaneously:**
   - Index page shows "DHL eCom Domestic", "GOFO Standard — Pickup", "GOFO Standard — Dropoff" all as LOADED
   - "GOFO Standard — Dropoff" totals: 9 cards · 3,285 cells
10. **Re-upload PU** — same file, see truncate-replace work cleanly. Counts stay at 9/3,285. DO untouched.

DB-side queries (run after commits via Supabase SQL editor):
11. Q4 (canonical counts):
    ```sql
    SELECT fulfillment_mode, count(*) AS cards,
      (SELECT count(*) FROM analysis_rate_card_cells c
        JOIN analysis_rate_cards r ON r.id=c.rate_card_id
        WHERE r.carrier_code='GOFO' AND r.service_level='Standard'
          AND r.fulfillment_mode=arc.fulfillment_mode) AS cells
    FROM analysis_rate_cards arc
    WHERE carrier_code='GOFO' AND service_level='Standard'
    GROUP BY fulfillment_mode
    ORDER BY fulfillment_mode;
    ```
    Expected: `pickup: 9 cards / 3285 cells`, `dropoff: 9 cards / 3285 cells`
12. Q5 (null cells):
    ```sql
    SELECT count(*) FROM analysis_rate_card_cells c
    JOIN analysis_rate_cards r ON r.id=c.rate_card_id
    WHERE r.carrier_code='GOFO' AND r.service_level='Standard'
      AND c.rate IS NULL;
    ```
    Expected: 0 (no coverage gaps in GOFO Standard, unlike DHL's Expedited Max)
13. Q6 (zone distribution sanity):
    ```sql
    SELECT r.variant, c.zone, count(*) AS cells
    FROM analysis_rate_card_cells c
    JOIN analysis_rate_cards r ON r.id=c.rate_card_id
    WHERE r.carrier_code='GOFO' AND r.service_level='Standard'
      AND r.fulfillment_mode='pickup'
    GROUP BY r.variant, c.zone
    ORDER BY r.variant, c.zone;
    ```
    Expected: each hub × 8 zones × 45 weights = 45 each; US_REMOTE_AREAS × 9 zones × 45 = 45 each
14. Q7 production invariant unchanged: `953 / 967 / 3`
15. **Two screenshots:**
   - PU detail page showing a hub card (e.g., LAX) with all 8 zones populated
   - PU detail page showing US Remote Areas card with all 9 zones populated (note Zone 9 column visible)

---

## Surface-back format

Same as Pause 3.5:
- Commit hash + branch
- File list with LOC
- 15-item verification matrix (which you can self-verify, which need Sawyer's dev environment)
- Two screenshots
- Any judgment calls or pre-existing patterns that needed adjustment
- Q7 invariant confirmation

When that lands, we move to **Pause 5 (GOFO Regional)** — same parser shape but 3 cards per scope, 8 source zone columns (Zone 1, Zone 2 not merged), 40 weight rows, dim factor 194, the `Zip Code List` sheet ignored entirely (deferred to existing `gofo_regional_zone_matrix`).
