# Pause 3.5 — Committed Rate Card Viewer

**Spec:** `docs/session-archives/specs/rate-cards-parser-spec.md` (rev 3 — read-side feature, not in spec)
**Status entering this handoff:** Pause 3 fully complete. 126 DHL cards committed, dim_factor backfilled to 166, status function confirms 1 of 5 scopes loaded. Production invariant intact.
**Your goal:** make committed rate cards viewable. Click a "Loaded" status card → navigate to a scope detail page showing all cards in that scope with the same picker + cell-table pattern as the stage preview.

---

## Already done (DB side)

- Migration `v1.10.0-037` applied. `authenticated` role now has `SELECT` on `analysis_rate_cards` and `analysis_rate_card_cells`. RLS policy `pld_v1_authenticated_all` is fully permissive (`USING true WITH CHECK true FOR ALL`), so reads from the authenticated Supabase client work end-to-end.
- Service Actions can hit canonical directly without elevating to service_role. No SECURITY DEFINER RPC needed for reads.
- Production invariant 953/967/3 unchanged.

---

## Architectural calls

1. **One route per scope, dynamic segment.** URL: `/pld-analysis/reference-data/rate-cards/[scope]/`. Scope segment is kebab-case from the existing `mode + fulfillment_mode` tuple:
   - `dhl-ecom-domestic`
   - `gofo-standard-pickup`
   - `gofo-standard-dropoff`
   - `gofo-regional-pickup`
   - `gofo-regional-dropoff`

2. **Read-only, no edit affordances.** Spec says edits happen via re-upload by design; this view enforces that contract visually. No "edit rate" buttons, no "fix this cell" UX. Notes field is display-only.

3. **Reuse the cell table component.** The CellTable inside `StagePreviewTable.tsx` does the right thing: oz-then-lb sort, muted Zone 11+, 0.5px divider. Extract it to a shared component (`CellTable.tsx` in the rate-cards directory) and use it in both stage preview and committed view. Same comparator (`compareCells` already in `actions.ts`).

4. **Status card click behavior:** loaded → link to scope page; not-loaded → not clickable. Use a subtle hover affordance (cursor + slight shift in border tone) so the operator can tell which are interactive without reading every label.

5. **404 on invalid scope segment.** Use Next.js `notFound()` if the URL segment doesn't match one of the 5 canonical scopes.

---

## Files to create

### `src/alamo/app/pld-analysis/reference-data/rate-cards/CellTable.tsx`

Extracted from the inline `CellTable` inside `StagePreviewTable.tsx`. Same visual treatment, same sort, same Zone 11+ divider + opacity rule. Props:

```typescript
type CellRow = {
  zone: string;
  weight_value: number;
  weight_unit: 'oz' | 'lb' | 'OZ' | 'LB';   // accept either case; helper normalizes for display
  rate: number | null;
};

type Props = {
  cells: CellRow[];   // already sorted by caller; component just renders
};
```

Move the existing inline pivot + render logic here. Keep the comparator in `actions.ts` (it's data-shape, not view-shape — caller sorts before passing in).

Update `StagePreviewTable.tsx` to import and use this shared component instead of its inline version. Don't rewrite the visual treatment — preserve it exactly.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/scope-segments.ts`

Maps URL kebab-case segment ↔ `ScopeKey` from existing `scopes.ts`. Helps the dynamic route resolve to a scope.

```typescript
import { RATE_CARD_SCOPES, type ScopeKey } from './scopes';

// URL segment for each canonical scope (matches mode + fulfillment_mode).
// 'na' fulfillment elides the suffix (DHL Domestic has no PU/DO).
function scopeToSegment(s: ScopeKey): string {
  if (s.fulfillment_mode === 'na') return s.mode;
  return `${s.mode}-${s.fulfillment_mode}`;
}

export const SEGMENT_TO_SCOPE: Record<string, ScopeKey> =
  Object.fromEntries(RATE_CARD_SCOPES.map(s => [scopeToSegment(s), s]));

export const SCOPE_TO_SEGMENT: Map<ScopeKey, string> =
  new Map(RATE_CARD_SCOPES.map(s => [s, scopeToSegment(s)]));

export function getScopeSegment(s: ScopeKey): string {
  return SCOPE_TO_SEGMENT.get(s)!;
}

export function resolveScope(segment: string): ScopeKey | null {
  return SEGMENT_TO_SCOPE[segment] ?? null;
}
```

### `src/alamo/app/pld-analysis/reference-data/rate-cards/actions.ts` (modify)

Add two read-side Server Actions alongside the existing parse/commit/cancel ones:

```typescript
// Returns metadata for all committed cards in a scope.
// One row per (variant, service_level) pair within the scope.
export async function getCommittedCardsForScope(scope: ScopeKey): Promise<CommittedCardSummary[]>

// Returns sorted cells for one specific committed card (by id).
export async function getCommittedCardCells(rateCardId: string): Promise<CellRow[]>
```

`CommittedCardSummary` shape:
```typescript
type CommittedCardSummary = {
  id: string;                 // analysis_rate_cards.id (uuid)
  variant: string;            // DC code or hub code
  service_level: string;      // verbatim product name
  effective_date: string;     // ISO date
  deprecated_date: string | null;
  dim_factor: number | null;
  card_version: string;
  source: string | null;
  notes: string | null;
  most_recent_upload: string; // ISO timestamp (created_at)
};
```

Both actions use the authenticated Supabase client. Filter by `purpose='CACTUS_BASE_COST'`, `lead_id IS NULL`, plus the scope's `(carrier_code, service_level_group_filter, fulfillment_mode)` triple. For DHL: ignore service_level (the scope spans 7 products); for GOFO: filter to `service_level = 'Standard'` or `'Regional'` per scope.

For `getCommittedCardCells`: sort using the existing `compareCells` comparator from this same file. Keep the comparator in one place.

### `src/alamo/app/pld-analysis/reference-data/rate-cards/[scope]/page.tsx`

Server Component. Resolves the URL segment, fetches data, renders the layout.

```typescript
type Params = { params: { scope: string } };

export default async function ScopeDetailPage({ params }: Params) {
  const scope = resolveScope(params.scope);
  if (!scope) notFound();

  const cards = await getCommittedCardsForScope(scope);
  if (cards.length === 0) notFound();   // scope is valid but unloaded — bounce to upload screen

  return <ScopeDetailView scope={scope} cards={cards} />;
}
```

### `src/alamo/app/pld-analysis/reference-data/rate-cards/[scope]/ScopeDetailView.tsx`

Client Component. Owns card-picker state, fetches cells on selection change, renders the cell table.

Layout:
```
┌─ Breadcrumb: PLD Roundup › Reference Data › Rate Cards › <scope_label>
│
│  ← Back to Rate Cards
│
│  <scope_label>
│  126 cards · 30,888 cells · last upload <timestamp>
│
│  ┌─ Metadata strip ───────────────────────────────────────────┐
│  │ Card version: 2026  ·  Dim factor: 166  ·  Effective: …    │
│  │ Source: dhl_ecommerce_cactus_base_rates_2026.xlsx          │
│  │ Notes: <if any>                                            │
│  └────────────────────────────────────────────────────────────┘
│
│  ┌─ Card picker ──────────────────────────────────────────────┐
│  │ View card: [ ATL · BPM Expedited ▾ ]   (126 cards)         │
│  └────────────────────────────────────────────────────────────┘
│
│  ┌─ Selected card cell table (CellTable component) ───────────┐
│  │ <full pivot, oz-first sort, muted Zone 11/12/13>           │
│  └────────────────────────────────────────────────────────────┘
└
```

The metadata strip values come from the first selected card (or any — they should all match within a scope for our use case). If they ever DON'T match (e.g., notes differ across cards in a scope after a re-upload corner case), display "varies by card" rather than picking one arbitrarily — easy to detect: any field with >1 distinct value across `cards[]`.

---

## Files to modify

### `src/alamo/app/pld-analysis/reference-data/rate-cards/StatusCards.tsx`

Make loaded scope cards clickable. Loaded → wrap in `<Link>` to `rate-cards/${getScopeSegment(scope)}`. Not-loaded → no wrapper, no hover affordance change. Use `cursor: pointer` + a 0.5px border-color shift on hover for loaded cards (subtle, matches the rest of the design system).

### `src/alamo/app/pld-analysis/reference-data/rate-cards/StagePreviewTable.tsx`

Replace the inline `CellTable` definition with import + use of the new shared `CellTable.tsx`. No behavior change, no visual change.

---

## Out of scope for Pause 3.5 (do not implement)

- Editing rates or metadata in place (re-upload is the editing workflow by spec)
- Comparison views (current vs previous version of a card) — Pause 6 polish
- CSV export — Pause 6 polish
- Search/filter within the cell table — Pause 6 polish
- Bulk operations across multiple cards — out of scope for analysis-layer entirely

---

## Verification before surfacing back

1. **TS clean** — same 11 baseline errors, zero new
2. **Lint clean**
3. **Status card link affordance:**
   - DHL eCom Domestic card is clickable (cursor: pointer, hover state)
   - Other 4 (NOT LOADED) cards are not clickable
4. **Navigation:**
   - Click DHL card → lands on `/pld-analysis/reference-data/rate-cards/dhl-ecom-domestic/`
   - Breadcrumb shows correct path
   - Back link returns to rate-cards index
5. **Page contents:**
   - Header reads "DHL eCom Domestic" (or whatever the scope_label is)
   - Card picker shows all 126 (DC, Product) pairs
   - Default selection is first alphabetically (`ATL · BPM Expedited`)
   - Metadata strip shows: card_version=2026, dim_factor=166, effective_date=2026-05-06, source=dhl_ecommerce_cactus_base_rates_2026.xlsx, notes=<empty>
6. **Cell table behavior:**
   - Selected card renders the same way as stage preview did — oz first, lb second, sorted by weight value within unit
   - Zones 1-8 in default opacity, Zones 11-13 muted with 0.5px divider before Zone 11
   - Pick a non-Expedited-Max card (e.g., `ATL · BPM Expedited`): all 11 zones have numeric values
   - Pick `ATL · Expedited Max`: zones 11/12/13 show "—"
7. **Card switching is responsive** — selecting a different card from the dropdown updates the table without a full page reload (client-side fetch via Server Action)
8. **Invalid scope handling:**
   - `/pld-analysis/reference-data/rate-cards/bogus-scope/` → 404
   - `/pld-analysis/reference-data/rate-cards/gofo-standard-pickup/` (valid scope, no data yet) → 404 with "scope not loaded — go upload" semantics
9. **Q7 unchanged** — 953 / 967 / 3
10. **Screenshot** of the detail page showing a non-Expedited-Max card with all 11 zones populated, plus a screenshot of an Expedited Max card showing the muted "—" treatment

---

## Surface-back format

In chat:
- File list + line counts of new/modified files
- Confirmation of all 10 verification items
- Two screenshots (item 10)
- Any judgment calls or pre-existing patterns that didn't quite fit

When that lands, we go back to Pause 4 (GOFO Standard parser + commit RPC).
