# Pause 3 — Claude Code Handoff

**Spec:** `docs/session-archives/specs/rate-cards-parser-spec.md` (rev 3)
**Status entering this handoff:** Pause 2 complete. UI scaffold rendering. Production invariant intact at 953/967/3. Status function returns 0 rows. RPC `analysis_rate_cards_commit_dhl_ecom(uuid)` deployed via `v1.10.0-030` and verified (guard fires correctly on fake session id).
**Your goal:** Wire the DHL eCom Domestic parser end-to-end. After this pause, Sawyer can upload the DHL workbook, see a preview, click commit, and watch status card 1 fill in with 126/30,888.

---

## Architectural calls already made (do not relitigate)

1. **One migration per pause.** `v1.10.0-028` was Pause 1, `-029` was the status function, `-030` is the DHL commit RPC (already deployed). GOFO Standard / Regional commit RPCs will land as `-031` / `-032` in Pauses 4 / 5. Don't bundle.
2. **Server Actions, not API routes.** Spec §11 lists API routes; reality (per Pause 2) is Server Actions. Match what's already established.
3. **Stage preview pattern: card picker + aggregate sanity bar.** Top bar = aggregate stats from the parse return ("126 cards staged · 30,888 cells · 0 nulls · 0 unknown DCs · 0 unknown products"). Below = a card selector dropdown defaulting to the first (DC, Product), with the selected card's full table rendered. Fetch per-card data on demand — do NOT render all 30,888 cells at once.
4. **Path conventions.** Continue the actual `src/alamo/app/pld-analysis/reference-data/rate-cards/` colocation pattern from Pause 2. No `src/components/pld-analysis/`.

---

## DB state (verify before starting if you want)

- Migration `v1.10.0-030` applied. Function `public.analysis_rate_cards_commit_dhl_ecom(uuid)` exists, `SECURITY DEFINER`, `GRANT EXECUTE TO authenticated, service_role`.
- Function signature: takes `p_upload_session_id uuid`, returns `TABLE(rate_cards_inserted int, cells_inserted bigint)`.
- Calling with an unknown UUID raises `P0001: No DHL_ECOM rows staged for session <uuid>`.
- All staging tables empty. All canonical analysis tables empty. Production invariant intact.

---

## Investigate first

1. **`dhl_ecom_dcs` row contents.** Pattern 5 validation queries this table for the canonical 18 DC codes. Find out the column name for the DC code (likely `code`, `dc_code`, or similar) and the exact 18 values. The parser will use these as a strict subset check against the file's distinct DC codes.
2. **SheetJS availability and import idiom.** The project either uses `xlsx` (SheetJS) or another XLSX library on prior 2b parsers (Diesel Prices, Fuel Tiers, etc.). Find the existing parser, copy the import + read pattern. Don't introduce a new XLSX dep if one's already in use.
3. **Server Action error-surfacing pattern.** Pause 2 used `useActionState` + Server Action returning `{ ok: false, error: string }` for the stub. Match that shape for the real parser so the UI plumbing doesn't need to change.
4. **Bulk insert pattern.** Find how prior 2b parsers do bulk inserts (`.insert([...])` chunked? `.upsert`? raw `pg` driver? RPC?). Match the convention. Important: stage inserts return `stage_row_id` — you need the RETURNING values to build the parent_stage_row_id map for cells.
5. **Stage table cleanup on parse re-run.** If the operator parses a file, then parses again without committing, the first session's stage rows linger until the 24h reaper runs (which is broken — see post-2b polish list). Two options: (a) accept the orphaned rows, they'll get reaped eventually; (b) explicit cleanup at parse-start by deleting any stage rows older than 1h for the current operator. Recommend (a) for now — keep this pause's scope tight, raise (b) as a Pause 7 polish item if the orphan accumulation becomes annoying during testing.

---

## Files to create

### `src/alamo/app/pld-analysis/reference-data/rate-cards/dhl-ecom-products.ts`

```typescript
// Canonical DHL eCom Domestic product strings — verbatim from the source
// workbook. These land in analysis_rate_cards.service_level exactly as listed.
// No normalization, no upper-snake, no display-vs-storage split.
//
// Source: dhl_ecommerce_cactus_base_rates_2026.xlsx (Pause 3 reference file).
// Validated at parse time: every distinct Product value in the uploaded file
// must be a member of this 7-element set. Unknown product → fail upload with
// the unknown value surfaced verbatim.

export const DHL_ECOM_PRODUCTS = [
  'BPM Expedited',
  'BPM Ground',
  'Expedited Max',
  'SM LWP Expedited',
  'SM LWP Ground',
  'SM Parcel Plus Expedited',
  'SM Parcel Plus Ground',
] as const;

export type DhlEcomProduct = typeof DHL_ECOM_PRODUCTS[number];

export const DHL_ECOM_PRODUCT_SET: ReadonlySet<string> =
  new Set<string>(DHL_ECOM_PRODUCTS);
```

### `src/alamo/app/pld-analysis/reference-data/rate-cards/parseDhlEcomRates.ts`

Server-side parser. **Not a Server Action itself** — pure function called from the action. Takes a Buffer (or ArrayBuffer) + a Supabase client + form metadata; returns either a parse result or a parse error.

```typescript
type ParseInput = {
  fileBuffer: ArrayBuffer;
  filename: string;
  notes: string | null;
  effectiveDate: string | null;       // optional, from form
  deprecatedDate: string | null;      // optional, from form
  dimFactor: number | null;           // optional, from form
  uploadSessionId: string;            // generated upstream (gen_random_uuid in TS or DB)
  supabase: SupabaseClient;
};

type ParseSuccess = {
  ok: true;
  uploadSessionId: string;
  summary: {
    totalCards: number;          // expected 126
    totalCells: number;          // expected 30,888
    nullCellsByZone: Record<string, number>;  // e.g. { "Zone 11": 24, "Zone 12": 24, "Zone 13": 24 }
    cardsByDc: Record<string, number>;        // e.g. { "ATL": 7, "BOS": 7, ... }
    cardsByProduct: Record<string, number>;   // e.g. { "BPM Expedited": 18, ... }
  };
};

type ParseFailure = {
  ok: false;
  error: string;                 // operator-facing, surfaces in the UI
  details?: unknown;             // structured detail for logs
};
```

**Pipeline (per spec §5a):**

1. Read workbook with SheetJS. Use the first sheet. If multiple sheets, fail with "DHL workbook must have a single rate sheet, found N".
2. Parse header. Required columns (case-sensitive match — log the actual headers if mismatch):
   ```
   DC code | Product | Weight value | Weight unit |
     Zone 1&2 | Zone 3 | Zone 4 | Zone 5 | Zone 6 | Zone 7 | Zone 8 | Zone 11-13
   ```
   Be defensive on whitespace and case in the header strings — DHL is known to ship workbooks with subtle header drift. Trim, normalize internal whitespace, then exact-match.
3. Read body rows. Skip empty rows.
4. **Pattern 5 strict-subset validation:**
   - Query `select code from dhl_ecom_dcs` (use the actual column name from your investigation step 1). Build `Set<string>`.
   - Compute distinct DC codes in the file. If any not in the set, fail with: `Unknown DC code(s) not in dhl_ecom_dcs: [X, Y]. Land a migration to add them before re-uploading.`
   - Compute distinct products in the file. Validate against `DHL_ECOM_PRODUCT_SET`. If any unknown, fail with: `Unknown product(s): [X, Y]. Expected one of: BPM Expedited, BPM Ground, Expedited Max, SM LWP Expedited, SM LWP Ground, SM Parcel Plus Expedited, SM Parcel Plus Ground.`
5. Group rows by `(DC code, Product)`. Validate exactly 126 groups (18 × 7). If not, fail with: `Expected 126 rate cards (18 DCs × 7 products), got N. Distinct DCs: A. Distinct products: B. Missing pairs: [...]`. The "missing pairs" detail is Sawyer's debugging breadcrumb.
6. For each group, build the `analysis_rate_cards_stage` row:
   ```typescript
   {
     upload_session_id: uploadSessionId,
     carrier_code: 'DHL_ECOM',
     service_level: <Product>,        // verbatim
     variant: <DC code>,
     fulfillment_mode: 'na',
     purpose: 'CACTUS_BASE_COST',
     lead_id: null,
     effective_date: effectiveDate,
     deprecated_date: deprecatedDate,
     dim_factor: dimFactor,
     source: filename,
     surcharge_config: {
       source_workbook_sheet: <sheet name>,
       fuel_table_ref: 'dhl_ecom_fuel_tiers',
       das_zips_ref: 'dhl_ecom_das_zips',
       waived: [],
       announced: [],
     },
     notes: notes,
   }
   ```
7. Bulk insert all 126 stage rows with `RETURNING stage_row_id, variant, service_level`. Build the map:
   ```typescript
   const stageRowByPair = new Map<string, number>();
   // key format: `${variant}|${service_level}`
   ```
8. For each weight row in each group, emit cells across **11 zones** with two replications:
   - Zone 1 = Zone 2 = source `Zone 1&2`
   - Zone 3, 4, 5, 6, 7, 8 = direct copy
   - Zone 11 = Zone 12 = Zone 13 = source `Zone 11-13` (24 nulls in SLC's column flow as null to all three)

   Cell row shape:
   ```typescript
   {
     upload_session_id: uploadSessionId,
     parent_stage_row_id: stageRowByPair.get(`${variant}|${service_level}`),
     zone: 'Zone 1' | 'Zone 2' | ... | 'Zone 13',  // string, exactly as stored
     weight_value: <number>,
     weight_unit: 'oz' | 'lb',
     rate: <number | null>,
   }
   ```
9. Bulk insert all cells. Chunk if necessary — the Supabase JS client has a default request size limit; check what prior 2b parsers do (DHL Domestic Zones at 16,740 rows is a good reference for chunking strategy).
10. Compute summary stats:
    - `totalCards`: 126
    - `totalCells`: count actually inserted
    - `nullCellsByZone`: groupBy zone, count where rate is null
    - `cardsByDc`: groupBy DC, count cards (should be 7 per DC)
    - `cardsByProduct`: groupBy product, count cards (should be 18 per product)
11. Return `{ ok: true, uploadSessionId, summary }`.

**On any error during the pipeline:** roll back by deleting any stage rows already written under this `uploadSessionId`. The cells_stage cascades on parent_stage_row_id, so deleting from `analysis_rate_cards_stage` is sufficient.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/actions.ts` (modify)

Add two new Server Actions alongside the existing `parseRateCardStub`:

```typescript
// 1. Real parser for DHL Domestic mode. Replaces parseRateCardStub for DHL only.
//    GOFO modes still call parseRateCardStub.
export async function parseDhlEcomRateCard(
  prevState: ParseState,
  formData: FormData
): Promise<ParseState>

// 2. Commit. Calls the analysis_rate_cards_commit_dhl_ecom RPC.
export async function commitDhlEcomRateCard(
  prevState: CommitState,
  formData: FormData  // contains uploadSessionId
): Promise<CommitState>
```

`ParseState` shape (extends what Pause 2 established):
```typescript
type ParseState =
  | { status: 'idle' }
  | { status: 'parsing' }
  | { status: 'parsed'; uploadSessionId: string; summary: ParseSummary }
  | { status: 'error'; error: string };
```

`CommitState`:
```typescript
type CommitState =
  | { status: 'idle' }
  | { status: 'committing' }
  | { status: 'committed'; rateCardsInserted: number; cellsInserted: number }
  | { status: 'error'; error: string };
```

After successful commit: call `revalidatePath('/pld-analysis/reference-data/rate-cards')` and `revalidatePath('/pld-analysis/reference-data')` so the status cards and index row both refresh.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/StagePreviewTable.tsx`

Client component. Renders after `parseDhlEcomRateCard` returns successfully.

**Props:**
```typescript
type Props = {
  uploadSessionId: string;
  summary: ParseSummary;
  carrierMode: 'dhl-ecom-domestic' | 'gofo-standard' | 'gofo-regional';
  fulfillmentMode?: 'pickup' | 'dropoff';   // ignored for DHL
};
```

**Layout:**

```
┌─ Aggregate sanity bar ──────────────────────────────────────────────┐
│ 126 cards staged · 30,888 cells · 0 null rates · 0 unknown DCs ·    │
│ 0 unknown products                                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─ Card selector ─────────────────────────────────────────────────────┐
│ View card: [ ATL · BPM Expedited        ▾ ]   (126 cards available) │
└─────────────────────────────────────────────────────────────────────┘

┌─ Selected card preview ─────────────────────────────────────────────┐
│ ATL · BPM Expedited                                                 │
│ Source: dhl_ecommerce_cactus_base_rates_2026.xlsx                   │
│                                                                     │
│ ┌──────────┬────────┬────────┬────────┬─────┬─────────┐            │
│ │ Weight   │ Zone 1 │ Zone 2 │ Zone 3 │ ... │ Zone 13 │            │
│ ├──────────┼────────┼────────┼────────┼─────┼─────────┤            │
│ │ 1 oz     │ $1.23  │ $1.23  │ $1.45  │ ... │ $4.56   │            │
│ │ 2 oz     │ ...    │ ...    │ ...    │ ... │ ...     │            │
│ │ ...      │        │        │        │     │         │            │
│ └──────────┴────────┴────────┴────────┴─────┴─────────┘            │
│                                                                     │
│ Visual confirmation: Zone 1 == Zone 2 (replicated from Zone 1&2),   │
│                      Zone 11 == Zone 12 == Zone 13 (replicated      │
│                      from Zone 11-13).                              │
└─────────────────────────────────────────────────────────────────────┘

[ Cancel (discard staged data) ]              [ Commit 126 rate cards ]
```

**Behavior:**

- Card selector: dropdown of all 126 (DC, Product) pairs, sorted by DC then Product. Default selection = first pair alphabetically.
- On selection change: fetch the selected card's stage row + all its cells via a Server Component or RPC. Don't preload all 126 cards.
- Aggregate bar updates: any field that's >0 for unknowns or nulls renders in Bloom (`#D81B7A`) — visual alarm. Zero values render in default ink.
- Cell values: numeric, right-aligned, default sans (per the mono-for-IDs-only rule from Pause 2 review).
- Null rates: render as "—" in muted color. Don't render "null" or "0" — visually distinct from real zero rates.
- Replication confirmation note: small text below the table, matter-of-fact, helps Sawyer eyeball-verify the parser did the right thing on first run.

**On Cancel:** Server Action that deletes all stage rows for the uploadSessionId (cells cascade), revert UI to the parse-prompt state.

**On Commit:** call `commitDhlEcomRateCard(uploadSessionId)`. On success, surface a green confirmation ("Committed: 126 rate cards, 30,888 cells. Status updated.") and revalidate.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/UploaderPanel.tsx` (modify)

Currently uses `parseRateCardStub` for all modes. For Pause 3:

- DHL Domestic mode (`mode === 'dhl-ecom-domestic'`): use `parseDhlEcomRateCard`. On success, render `<StagePreviewTable>` instead of the inline error.
- GOFO modes: keep using `parseRateCardStub` (still returns the "parser not yet implemented" error). Don't touch.

Keep the action choice at the top of the component, branching on `mode`:
```typescript
const action = mode === 'dhl-ecom-domestic'
  ? parseDhlEcomRateCard
  : parseRateCardStub;
```

---

## Files to NOT touch (out of scope)

- GOFO Standard parser
- GOFO Regional parser
- GOFO commit RPCs (Pauses 4 / 5)
- The status aggregate function (already deployed)
- Any prior 2b screens
- The mono-font cleanup on prior screens (post-2b polish)

---

## Verification before surfacing back

Run in order. All must pass.

1. **TS clean.** `npm run typecheck` — same 11 baseline errors, zero new.
2. **Lint clean.** Add `npm run lint` (or whatever the project uses) to your pause-end checklist now per Senior Architect's process note. Zero new lint warnings.
3. **Upload the DHL workbook.** From the chat history: `dhl_ecommerce_cactus_base_rates_2026.xlsx` (200,263 bytes). Click Parse on DHL Domestic mode.
4. **Stage preview renders.** Aggregate bar shows: `126 cards · 30,888 cells · 0 nulls in non-Zone-11/12/13 columns · 24 nulls each in Zone 11/12/13 (SLC) · 0 unknown DCs · 0 unknown products`.
5. **Card picker works.** Select 3-4 different (DC, Product) pairs, confirm each renders correct cell values.
6. **Visual sanity-check on replication.** For any selected card: Zone 1 column == Zone 2 column for every weight row. Zone 11 == Zone 12 == Zone 13 for every weight row. (For SLC, Zone 11/12/13 are all "—".)
7. **Commit.** Click commit. Confirm success toast/banner.
8. **Q4 verification (DB):**
   ```sql
   SELECT count(*) FROM public.analysis_rate_cards
   WHERE carrier_code='DHL_ECOM' AND fulfillment_mode='na'
     AND purpose='CACTUS_BASE_COST' AND lead_id IS NULL;
   -- expect 126
   ```
   ```sql
   SELECT count(*) FROM public.analysis_rate_card_cells c
   JOIN public.analysis_rate_cards r ON r.id = c.rate_card_id
   WHERE r.carrier_code='DHL_ECOM' AND r.fulfillment_mode='na';
   -- expect 30,888
   ```
9. **Status card 1 fills in.** Status card now reads "Loaded · 126 cards · 30,888 cells · 18 variants" (or however your StatusCards component formats it).
10. **Stage tables empty post-commit.**
    ```sql
    SELECT count(*) FROM public.analysis_rate_cards_stage;
    SELECT count(*) FROM public.analysis_rate_card_cells_stage;
    -- both expect 0
    ```
11. **Q7 unchanged.** 953 / 967 / 3.
12. **Re-upload test.** Upload the same file again with different notes ("re-upload test"). Parse → preview → commit. Confirm:
    - Q4 still returns 126 (truncate-and-replace worked, didn't double up to 252)
    - The status card's `notes` field reflects the new text
    - The `most_recent_upload` timestamp advanced
    - Q7 still 953/967/3
13. **Negative test (optional, instructive).** Manually open the workbook, change one DC code to "ZZZ", save as a temp file, upload that. Confirm parser fails with the unknown-DC error and zero stage writes occurred (`SELECT count(*) FROM public.analysis_rate_cards_stage;` returns 0).
14. **Index page row updates.** Navigate to `/pld-analysis/reference-data/`, confirm Rate Cards row reads "1 of 5 scopes loaded" instead of "0 of 5".
15. **Screenshot.** Capture the post-commit state of the rate cards screen showing status card 1 filled in.

---

## Surface-back format

In chat:

- File list + line counts of what was created/modified
- Confirmation of all 15 verification items
- Aggregate bar values from item 4 (the actual numbers — useful for the Senior Architect's review)
- Screenshot from item 15
- The Q4 cell count: should be exactly 30,888. If it's not, that means the replication logic in step 8 of the parser has a bug and we need to debug before continuing.
- Any judgment calls or pre-existing patterns that didn't quite fit

Do NOT begin Pause 4 (GOFO Standard) work without explicit Senior Architect greenlight.

---

## Notes for the surface-back

- The 24 nulls in SLC's Zone 11-13 are expected and correct. Spec §0 documents this as v1 placeholder pending DHL's SLC over-1lb update. Don't try to "fix" them.
- If the parser-time validation flags an unknown DC or product, the upload should fail cleanly with a specific message — not a generic "parse failed". The whole point of Pattern 5 strict subset is that Sawyer learns exactly what to fix without diving into the file.
- If the cell count comes out as 30,888 + something or 30,888 − something, the replication is wrong. Expected math: 2,808 source rows × 11 downstream zones = 30,888. Anything else means either the file has a different row count than expected (spec said 2,808) or the replication isn't applying to all source rows.
