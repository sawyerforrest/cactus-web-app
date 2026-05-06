# Rate Cards Parser — Sub-Phase 2b Capstone Spec

**Status:** Rev 3. Greenlit for migration apply. Pause 1 verification follows in chat.
**Branch base:** `claude/youthful-carson-41b709` (47 commits ahead)
**Migration target:** `v1.10.0-028`
**Production data invariant:** `shipment_ledger=953 / invoice_line_items=967 / cactus_invoices=3` (must remain unchanged)
**End-state:** 148 rate cards across 5 scopes, surfaced as 5 status cards on the screen

**Rev 3 changelog (vs rev 2):**

1. **Critical fix:** UNIQUE constraint now uses `NULLS NOT DISTINCT` (PG 15+ syntax; we're on PG 17). Without it, the constraint silently allows duplicate scope keys for any row where `lead_id IS NULL` (which is every row in this screen). Q3 verification updated to assert the `NULLS NOT DISTINCT` clause appears in `pg_get_constraintdef`.
2. Cell-count fix in §4: GOFO Standard PU and DO scopes are 2,880 cells each (8 cards × 45 weight rows × 8 *downstream* zones), not 2,520. Rev 2 erroneously used 7 source zones in the multiplication.
3. Q4 expected DHL cell count pinned: 30,888 (2,808 source rows × 11 downstream zones).
4. §5b PU↔DO diff comment changed from a fixed prediction to an empirical bound: `0 < diff ≤ 2,880`. Reasoning: the source description ("315 cells differ per hub" = 7 source zones × 45 weight rows = 100% of source cells) means post-Zone-1&2-replication every downstream cell could differ, capping at 2,880. Record actual value during Pause 4.
5. Defensive `NOT NULL` added to `analysis_rate_cards_stage.variant` — every parser in this spec always populates it.

**Rev 2 changelog (vs rev 1):**

1. Carrier codes corrected: GOFO scopes use `carrier_code='GOFO'` with `service_level IN ('Standard','Regional')`. The `GOFO_STANDARD` / `GOFO_REGIONAL` carrier codes do not exist.
2. Production invariant tables corrected: `shipment_ledger / invoice_line_items / cactus_invoices` (not `rate_cards / rate_card_cells / surcharge_schedules`, which don't have those counts and in two cases don't exist).
3. `source_filename` → `source` everywhere (matches existing `analysis_rate_cards` column name and all prior 2b loads).
4. DHL zones: 8 source columns (not 9), two replications required: `Zone 1&2 → Zone 1, Zone 2` and `Zone 11-13 → Zone 11, Zone 12, Zone 13`. Downstream count of 11 unchanged.
5. Stage→canonical JOIN includes `fulfillment_mode` defensively.
6. Pattern 5 explicitly enumerates the DC subset rule against `dhl_ecom_dcs`.
7. Migration comment corrected: `analysis_rate_cards` has no existing scope-key unique constraint — the `DROP IF EXISTS` is a no-op kept for idempotency, the `ADD CONSTRAINT` is the substantive change.
8. DHL canonical products resolved (7 verbatim strings).
9. Status aggregate function reworked to handle GOFO's split-on-service_level, with explicit `scope_label` output.
10. Two-table staging noted as Pattern 9 candidate for post-2b PATTERNS.md.

---

## 0. Pre-flight context (read before coding)

The Rate Cards screen is the analytical home for **Cactus base costs** — what *we* pay carriers per package, by carrier × service × variant × zone × weight. It is the ammunition the rating engine uses to compute Cactus's cost basis on every shipment. It is intentionally separate from any production billing path.

Three carriers feed this screen, each with its own file shape and PU/DO behavior:

| Mode (UI tab) | Files per scope | Fulfillment modes | Variants per scope | Cards per scope |
|---|---|---|---|---|
| DHL eCom Domestic | 1 | `na` only | 18 DCs × 7 products | 126 |
| GOFO Standard | 1 (PU or DO) | `pickup` and `dropoff` (separate uploads) | 8 hubs | 8 |
| GOFO Regional | 1 (PU or DO) | `pickup` and `dropoff` (separate uploads) | 3 rate tabs (Regional, REGSE, REGSL) | 3 |

Each upload commits one **scope** atomically. Operator clicks twice when re-uploading both PU and DO of a GOFO file. Truncate-and-replace on scope key, identical to every prior 2b screen.

**Scope key:** `(carrier_code, service_level, variant, fulfillment_mode, purpose, lead_id)` where `purpose='CACTUS_BASE_COST'` and `lead_id IS NULL` for everything in this screen.

**Carrier-code consistency with prior 2b loads:** the existing `dhl_ecom_zone_matrices` and `gofo_standard_zone_matrices` tables already use `carrier_code='DHL_ECOM'` and `carrier_code='GOFO'` respectively. Rate cards inherit that vocabulary.

---

## 1. Migration `v1.10.0-028`

File: `supabase/migrations/v1.10.0-028_rate_cards_fulfillment_mode_and_surcharge.sql`

```sql
-- v1.10.0-028: Rate Cards — fulfillment mode + surcharge config + staging tables
BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. fulfillment_mode_enum
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfillment_mode_enum') THEN
    CREATE TYPE public.fulfillment_mode_enum AS ENUM ('pickup', 'dropoff', 'na');
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- 2. analysis_rate_cards: add fulfillment_mode + surcharge_config
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_rate_cards
  ADD COLUMN IF NOT EXISTS fulfillment_mode public.fulfillment_mode_enum
    NOT NULL DEFAULT 'na';

ALTER TABLE public.analysis_rate_cards
  ADD COLUMN IF NOT EXISTS surcharge_config jsonb
    NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.analysis_rate_cards.fulfillment_mode IS
  'Carrier fulfillment mode. ''na'' for DHL eCom Domestic (no PU/DO distinction). ''pickup'' or ''dropoff'' for GOFO Standard / Regional.';
COMMENT ON COLUMN public.analysis_rate_cards.surcharge_config IS
  'Per-card surcharge metadata: waived/announced markers, GOFO non-compliance fees, US Remote Areas references, etc. Schema is per-carrier; see docs/session-archives/specs/rate-cards-parser-spec.md §8.';

-- ─────────────────────────────────────────────────────────────
-- 3. ADD scope-key uniqueness including fulfillment_mode.
--    NOTE: analysis_rate_cards currently has NO unique constraint
--    on these columns. DROP IF EXISTS is kept purely for idempotency
--    (e.g., re-running the migration after a partial apply). The
--    substantive change is the ADD CONSTRAINT below.
--
--    NULLS NOT DISTINCT (PG 15+; we're on PG 17) is mandatory here:
--    every row in this screen has lead_id IS NULL, so the default
--    NULLS-distinct behavior would allow unlimited duplicates per
--    scope key. With NULLS NOT DISTINCT, two NULL lead_ids count
--    as equal for uniqueness purposes.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_rate_cards
  DROP CONSTRAINT IF EXISTS analysis_rate_cards_scope_key;

ALTER TABLE public.analysis_rate_cards
  ADD CONSTRAINT analysis_rate_cards_scope_key
  UNIQUE NULLS NOT DISTINCT
    (carrier_code, service_level, variant, fulfillment_mode, purpose, lead_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Staging tables (mirror analysis_rate_cards / cells, plus session id).
--    Pattern 9 candidate (two-table staging that mirrors canonical shape).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analysis_rate_cards_stage (
  stage_row_id           bigserial PRIMARY KEY,
  upload_session_id      uuid NOT NULL,
  carrier_code           text NOT NULL,
  service_level          text NOT NULL,
  variant                text NOT NULL,
  fulfillment_mode       public.fulfillment_mode_enum NOT NULL,
  purpose                text NOT NULL DEFAULT 'CACTUS_BASE_COST',
  lead_id                uuid,
  effective_date         date,
  deprecated_date        date,
  dim_factor             numeric(8,2),
  source                 text,
  surcharge_config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analysis_rate_card_cells_stage (
  stage_row_id           bigserial PRIMARY KEY,
  upload_session_id      uuid NOT NULL,
  parent_stage_row_id    bigint NOT NULL REFERENCES public.analysis_rate_cards_stage(stage_row_id)
                            ON DELETE CASCADE,
  zone                   text NOT NULL,
  weight_value           numeric(10,4) NOT NULL,
  weight_unit            text NOT NULL,
  rate                   numeric(18,4),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_rate_cards_stage_session
  ON public.analysis_rate_cards_stage(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_rate_card_cells_stage_session
  ON public.analysis_rate_card_cells_stage(upload_session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_rate_card_cells_stage_parent
  ON public.analysis_rate_card_cells_stage(parent_stage_row_id);

-- ─────────────────────────────────────────────────────────────
-- 5. RLS on staging tables — same posture as other 2b stage tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_rate_cards_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_rate_card_cells_stage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stage_rate_cards_authenticated_all"
  ON public.analysis_rate_cards_stage;
CREATE POLICY "stage_rate_cards_authenticated_all"
  ON public.analysis_rate_cards_stage FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stage_rate_card_cells_authenticated_all"
  ON public.analysis_rate_card_cells_stage;
CREATE POLICY "stage_rate_card_cells_authenticated_all"
  ON public.analysis_rate_card_cells_stage FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;
```

**Why each piece:**

- The enum lives at the type level so we get a hard rejection on any other string. `na` is its own value (not nullable) so the unique constraint can include it without the NULL-treatment-in-unique-constraints landmine.
- `surcharge_config` defaults to `'{}'::jsonb NOT NULL` — never null, always queryable, no `COALESCE` noise downstream.
- The unique-constraint ADD is the first scope-key constraint on the table. Once it lands, all future `analysis_rate_cards` writes (any screen) must respect this six-tuple uniqueness.
- Staging tables mirror canonical shape exactly so the commit RPC is a clean projection (Pattern 9 candidate).
- RLS is permissive on staging tables (matches prior 2b screens). Commit RPC enforces the actual posture.

---

## 2. Scope keys & uniqueness

After migration, every row in `analysis_rate_cards` for this screen has:

```
purpose          = 'CACTUS_BASE_COST'
lead_id          = NULL
carrier_code     IN ('DHL_ECOM', 'GOFO')
fulfillment_mode IN ('na', 'pickup', 'dropoff')
service_level    = carrier-specific (see §5)
variant          = DC code (DHL) or hub/region code (GOFO)
```

**Scope = one upload.** A scope is the set of rate cards that share `(carrier_code, service_level_group, fulfillment_mode)` for this screen, where `service_level_group` collapses DHL's 7 products into one scope and keeps GOFO's `Standard`/`Regional` separate. Five total scopes:

| Scope # | carrier_code | service_level (group) | fulfillment_mode | Cards | Source file |
|---|---|---|---|---|---|
| 1 | `DHL_ECOM` | (varies — 7 products) | `na` | 126 | `dhl_ecommerce_cactus_base_rates_2026.xlsx` |
| 2 | `GOFO` | `Standard` | `pickup` | 8 | `2026_GOFO_Standard_Cactus_4_28_PU.xlsx` |
| 3 | `GOFO` | `Standard` | `dropoff` | 8 | `2026_GOFO_Standard_Cactus_4_28_drop_off.xlsx` |
| 4 | `GOFO` | `Regional` | `pickup` | 3 | `2026_GOFO_CIRRO_Regional_Cactus_4_28_PU.xlsx` |
| 5 | `GOFO` | `Regional` | `dropoff` | 3 | `2026_GOFO_Regional_Cactus_4_28_Drop_off_.xlsx` |

**Truncate-and-replace semantics:** committing a scope deletes all existing rows in `analysis_rate_cards` matching that scope's filter (and cascades to `analysis_rate_card_cells`), then inserts the new payload.

---

## 3. Service-mode tab UI shape

`src/app/admin/pld-analysis/rate-cards/page.tsx`

Layout:

```
┌─ Rate Cards (Cactus Base Costs) ─────────────────────────────────┐
│                                                                  │
│  [Mode tabs]   DHL eCom Domestic  │  GOFO Standard  │  GOFO Regional │
│                                                                  │
│  ┌─ Status cards (5 once fully loaded, server-aggregated) ───┐  │
│  │  Scope 1 │ Scope 2 │ Scope 3 │ Scope 4 │ Scope 5          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─ Active mode panel ───────────────────────────────────────┐  │
│  │  • DHL eCom Domestic: single uploader (no PU/DO toggle)   │  │
│  │  • GOFO Standard:     two uploaders side-by-side          │  │
│  │                          ┌── Pickup ──┐  ┌── Dropoff ──┐  │  │
│  │  • GOFO Regional:     two uploaders side-by-side          │  │
│  │                          ┌── Pickup ──┐  ┌── Dropoff ──┐  │  │
│  │                                                           │  │
│  │  Each uploader: file picker, optional notes textarea,     │  │
│  │                 "Parse" button, then a stage-results       │  │
│  │                 preview table, then "Commit" button.       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Reuse:** the mode-tab selector pattern is the same as the Zone Matrices screen — extract into `src/components/pld-analysis/shared/ModeTabSelector.tsx` if not already shared (worth checking; Zone Matrices likely already promoted it).

**Filters on the page body:** per Cactus UI standard, list/report pages have search + filters at the top. Rate Cards is an upload screen, not a list/report page, so the standard does not apply here. Status cards stand in for at-a-glance state.

**Notes field:** plain `<textarea>`, optional, max 500 chars, stored on every rate card row in the scope (so re-upload preserves the rationale). Useful for entries like "v1 placeholder pending DHL SLC over-1lb update."

---

## 4. Status cards (5 once fully loaded)

Server-side aggregate function (Pattern 7), reworked to handle GOFO's split-on-service_level:

```sql
CREATE OR REPLACE FUNCTION public.analysis_rate_cards_status_aggregate()
RETURNS TABLE (
  scope_label          text,
  carrier_code         text,
  service_level_group  text,    -- 'Standard'/'Regional' for GOFO, NULL for DHL_ECOM
  fulfillment_mode     public.fulfillment_mode_enum,
  rate_card_count      int,
  cell_count           bigint,
  variant_count        int,
  variants             text[],
  service_levels       text[],
  most_recent_upload   timestamptz,
  source               text,
  notes                text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      rc.id,
      rc.carrier_code,
      rc.service_level,
      rc.variant,
      rc.fulfillment_mode,
      rc.created_at,
      rc.source,
      rc.notes,
      -- DHL collapses 7 products into one card; GOFO splits Standard vs Regional.
      CASE
        WHEN rc.carrier_code = 'DHL_ECOM' THEN NULL
        WHEN rc.carrier_code = 'GOFO'     THEN rc.service_level
      END AS service_level_group
    FROM public.analysis_rate_cards rc
    WHERE rc.purpose = 'CACTUS_BASE_COST'
      AND rc.lead_id IS NULL
      AND rc.carrier_code IN ('DHL_ECOM', 'GOFO')
  ),
  cell_counts AS (
    SELECT rate_card_id, count(*) AS n
    FROM public.analysis_rate_card_cells
    GROUP BY rate_card_id
  )
  SELECT
    CASE
      WHEN s.carrier_code = 'DHL_ECOM' THEN 'DHL eCom Domestic'
      WHEN s.carrier_code = 'GOFO' AND s.service_level_group = 'Standard' AND s.fulfillment_mode = 'pickup'  THEN 'GOFO Standard — Pickup'
      WHEN s.carrier_code = 'GOFO' AND s.service_level_group = 'Standard' AND s.fulfillment_mode = 'dropoff' THEN 'GOFO Standard — Dropoff'
      WHEN s.carrier_code = 'GOFO' AND s.service_level_group = 'Regional' AND s.fulfillment_mode = 'pickup'  THEN 'GOFO Regional — Pickup'
      WHEN s.carrier_code = 'GOFO' AND s.service_level_group = 'Regional' AND s.fulfillment_mode = 'dropoff' THEN 'GOFO Regional — Dropoff'
    END                                                          AS scope_label,
    s.carrier_code,
    s.service_level_group,
    s.fulfillment_mode,
    count(*)::int                                                AS rate_card_count,
    coalesce(sum(cc.n), 0)::bigint                               AS cell_count,
    count(DISTINCT s.variant)::int                               AS variant_count,
    array_agg(DISTINCT s.variant ORDER BY s.variant)             AS variants,
    array_agg(DISTINCT s.service_level ORDER BY s.service_level) AS service_levels,
    max(s.created_at)                                            AS most_recent_upload,
    (array_agg(s.source ORDER BY s.created_at DESC))[1]          AS source,
    (array_agg(s.notes ORDER BY s.created_at DESC) FILTER (WHERE s.notes IS NOT NULL))[1] AS notes
  FROM scoped s
  LEFT JOIN cell_counts cc ON cc.rate_card_id = s.id
  GROUP BY s.carrier_code, s.service_level_group, s.fulfillment_mode
  ORDER BY
    CASE s.carrier_code WHEN 'DHL_ECOM' THEN 1 WHEN 'GOFO' THEN 2 END,
    CASE s.service_level_group WHEN 'Standard' THEN 1 WHEN 'Regional' THEN 2 ELSE 0 END,
    s.fulfillment_mode;
$$;

GRANT EXECUTE ON FUNCTION public.analysis_rate_cards_status_aggregate()
  TO authenticated, service_role;
```

**Expected end-state output:**

| scope_label | carrier_code | service_level_group | fulfillment_mode | rate_card_count | cell_count | variant_count |
|---|---|---|---|---|---|---|
| DHL eCom Domestic | DHL_ECOM | NULL | na | 126 | (sum) | 18 |
| GOFO Standard — Dropoff | GOFO | Standard | dropoff | 8 | 2,880 | 8 |
| GOFO Standard — Pickup | GOFO | Standard | pickup | 8 | 2,880 | 8 |
| GOFO Regional — Dropoff | GOFO | Regional | dropoff | 3 | 960 | 3 |
| GOFO Regional — Pickup | GOFO | Regional | pickup | 3 | 960 | 3 |

The function returns one row per scope; the UI renders one card per row, in the order the function returns them. Empty scopes (not yet uploaded) render as outlined "not loaded" cards — the UI computes the missing scopes by diffing the function's returned rows against the canonical 5-scope list defined in `src/lib/pld-analysis/rate-cards/scopes.ts`.

---

## 5. Per-carrier parser logic

All three parsers run server-side (Node, not in the browser). Files arrive via the upload route, get written to a temp path, and get streamed through `xlsx` (SheetJS). All three follow the same shape:

```
1. validate file (extension, size ≤ MAX_PLD_UPLOAD_BYTES, sheet count, sheet names)
2. parse into a normalized list of (rate_card_meta, cells[])
3. validate against reference data (Pattern 5: dhl_ecom_dcs, gofo_hubs, etc.)
4. write to staging tables under a fresh upload_session_id
5. return preview + parse warnings to the UI
6. on operator "Commit" click → call the per-carrier commit RPC
```

### 5a. DHL eCom Domestic

**Input:** `dhl_ecommerce_cactus_base_rates_2026.xlsx`, single sheet, 2,808 long-form rows.

**Source columns** (8 zone columns, two of which are merged ranges):

```
DC code | Product | Weight value | Weight unit |
  Zone 1&2 | Zone 3 | Zone 4 | Zone 5 | Zone 6 | Zone 7 | Zone 8 | Zone 11-13
```

**Two replications required:**

- `Zone 1&2 → Zone 1, Zone 2` (same value to both cells)
- `Zone 11-13 → Zone 11, Zone 12, Zone 13` (same value to all three cells)

After replication, downstream zone columns = **11**: `(1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13)`. The 24 nulls in SLC's `Zone 11-13` flow as null to all three of (11, 12, 13). The rating engine fails loudly on null at lookup time; the parser does not.

**Canonical product strings** (verbatim — no normalization, no upper-snake, just match the file):

```
BPM Expedited
BPM Ground
Expedited Max
SM LWP Expedited
SM LWP Ground
SM Parcel Plus Expedited
SM Parcel Plus Ground
```

Codify in `src/lib/pld-analysis/rate-cards/dhl-ecom-products.ts` as a const array. Used for parser-time validation (every distinct `Product` string in the file must be one of these 7) and for UI display sort order. No translation layer — these strings land in `service_level` exactly as listed.

**Parse steps:**

1. Read sheet into rows. Skip header.
2. Group rows by `(DC code, Product)`. Each group = one rate card. Expected: 18 × 7 = **126 groups**.
3. **Pattern 5 validation, DHL DCs (authoritative):** every distinct DC code in the file must already exist in `dhl_ecom_dcs` (the canonical 18-row DC table). DC codes are a strict subset, never a superset. If the file introduces a new DC code, the upload **fails with a clear error message naming the unknown code**, and the operator must land a separate migration to add the new DC to `dhl_ecom_dcs` before retrying. This is intentional — DCs are reference data that other 2b screens (DAS ZIPs, Domestic Zones) already depend on; rate cards must not be the table that silently introduces new DC identifiers.
4. **Pattern 5 validation, products:** every distinct `Product` value must be in the 7-string canonical list above. Any unknown product → fail upload.
5. For each group:
   - Stage one `analysis_rate_cards_stage` row with:
     - `carrier_code = 'DHL_ECOM'`
     - `service_level = <Product>` (verbatim from file)
     - `variant = <DC code>`
     - `fulfillment_mode = 'na'`
     - `purpose = 'CACTUS_BASE_COST'`, `lead_id = NULL`
     - `dim_factor`, `effective_date`, `deprecated_date` from form / file metadata
     - `source = <uploaded file name>`
     - `surcharge_config = {…}` (see §8)
     - `notes = <form notes>`
   - For each weight row in the group, emit cells across **11 zones** (1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13) with the two replications applied.
6. Surface to the UI: count per (DC, Product), null count by zone, total cells.

### 5b. GOFO Standard

**Inputs:** two files per fully-loaded state — `2026_GOFO_Standard_Cactus_4_28_PU.xlsx` and `..._drop_off.xlsx`. Each upload covers exactly one `fulfillment_mode`. Operator picks the file, picks PU vs DO via the uploader they're using, then parses & commits.

**Sheet layout per file (9 sheets):**

```
STDWE | STDCE | STDNJ | STDNE | STDSO | STDEA | STDSE | STDSL | US Remote Areas
```

The 8 hub sheets share an identical schema:

```
Weight value | Weight unit | Zone 1&2 (merged) | Zone 3 | Zone 4 | Zone 5 | Zone 6 | Zone 7 | Zone 8
```

45 weight rows per sheet (15 oz rows + 30 lb rows). 7 source-zone columns. After **Zone 1&2 replication**, downstream zone columns = 8 (Zone 1, Zone 2, 3, 4, 5, 6, 7, 8) where Zone 1 == Zone 2 always.

**Parse steps:**

1. Validate sheet names. The 8 hub names must each map to a row in `gofo_hubs` (Pattern 5; same subset rule as §5a step 3). `US Remote Areas` is parsed last and stored as a per-card surcharge_config key (see below); it is not a rate card.
2. For each of the 8 hub sheets:
   - Stage one `analysis_rate_cards_stage` row with:
     - `carrier_code = 'GOFO'`
     - `service_level = 'Standard'`
     - `variant = <hub code>` (STDWE, STDCE, …)
     - `fulfillment_mode = 'pickup' | 'dropoff'` (from uploader context, not from file)
     - other metadata as DHL
   - Emit 45 weight rows × 8 downstream zones = 360 cells. Replicate Zone 1&2 → both Zone 1 and Zone 2.
3. Parse `US Remote Areas` sheet once. Capture its full contents into `surcharge_config.us_remote_areas` and replicate that same blob onto **each of the 8 hub rate cards**. Cost: ~8× duplication of a tiny payload. Benefit: every rate card carries its own complete surcharge picture; no JOINs needed at rating time.
4. **Loud-load** the 26-30 lb weight rows. Per locked decision, this is intentional GOFO design, not parser noise. Stage `surcharge_config.non_compliance_fee_over_30lb_usd = 50` on every card. The rating engine is responsible for failing loudly on >30 lb shipments.

**Re-upload diff hint:** PU vs DO files differ on 315 cells per hub tab. After both scopes are loaded, this is independently verifiable in the DB:

```sql
SELECT count(*)
FROM analysis_rate_card_cells pu_cell
JOIN analysis_rate_cards pu        ON pu.id = pu_cell.rate_card_id
JOIN analysis_rate_cards do_card
  ON do_card.carrier_code     = pu.carrier_code
 AND do_card.service_level    = pu.service_level
 AND do_card.variant          = pu.variant
 AND do_card.fulfillment_mode = 'dropoff'
JOIN analysis_rate_card_cells do_cell
  ON do_cell.rate_card_id = do_card.id
 AND do_cell.zone         = pu_cell.zone
 AND do_cell.weight_value = pu_cell.weight_value
 AND do_cell.weight_unit  = pu_cell.weight_unit
WHERE pu.carrier_code     = 'GOFO'
  AND pu.service_level    = 'Standard'
  AND pu.fulfillment_mode = 'pickup'
  AND pu_cell.rate <> do_cell.rate;
-- Expected: 0 < diff ≤ 2,880. Source description says 315 source cells differ
-- per hub (= 7 source zones × 45 weight rows = 100% of source cells), so
-- post-Zone-1&2-replication the downstream diff could reach the full 2,880.
-- Record the actual value during Pause 4 verification — do not gate on a
-- specific number.
```

### 5c. GOFO Regional

**Inputs:** `2026_GOFO_CIRRO_Regional_Cactus_4_28_PU.xlsx` and `2026_GOFO_Regional_Cactus_4_28_Drop_off_.xlsx` (note the inconsistent naming — the parser routes purely on the uploader context, not the filename, but it stores the actual filename in `source` for traceability).

**Sheet layout per file (5 sheets):**

```
Regional  |  REGSE  |  REGSL  |  Zip Code List  |  FAQ
```

- `Regional`: rate sheet covering all hubs **except** Miami and Salt Lake City. `variant = 'REGIONAL'`.
- `REGSE`: Miami rate sheet. `variant = 'REGSE'`.
- `REGSL`: Salt Lake City rate sheet. `variant = 'REGSL'`.
- `Zip Code List`: reference data. **Not** parsed into rate cards. Captured into `surcharge_config.regional_zip_coverage` on each of the 3 rate cards.
- `FAQ`: ignored by the parser (logged, not staged).

The 3 rate sheets share an identical schema:

```
Weight value | Weight unit | Zone 1 | Zone 2 | Zone 3 | Zone 4 | Zone 5 | Zone 6 | Zone 7 | Zone 8
```

40 weight rows per sheet (15 oz + 25 lb). **8 source-zone columns** — Zone 1 and Zone 2 are **separate**. **No replication.** This is the key structural difference from GOFO Standard.

**Parse steps:**

1. Validate sheet names. Reject if any of `Regional`, `REGSE`, `REGSL` is missing.
2. For each of the 3 rate sheets:
   - Stage one rate card row with:
     - `carrier_code = 'GOFO'`
     - `service_level = 'Regional'`
     - `variant ∈ {REGIONAL, REGSE, REGSL}`
     - `fulfillment_mode` from uploader context
   - Emit 40 weight rows × 8 zones = 320 cells. **No replication** — Zone 1 and Zone 2 are loaded directly from their respective columns.
3. Parse `Zip Code List` once. Replicate into `surcharge_config.regional_zip_coverage` on each of the 3 cards.
4. The 25 lb max for Regional is captured as `surcharge_config.max_weight_lb = 25`. **GOFO Regional non-compliance fee is deferred** to operational confirmation — leave `surcharge_config.non_compliance_fee_over_max_lb_usd` absent (do not invent a value). Flagged in §12.

**Re-upload diff hint:** PU vs DO differ on 960 cells across the 3 rate tabs. Verify with the same JOIN query as 5b, scoped to `carrier_code='GOFO' AND service_level='Regional'`.

---

## 6. Staging tables — operational behavior

Every parse run:

1. Generates a fresh `upload_session_id = gen_random_uuid()`.
2. Inserts into `analysis_rate_cards_stage` and `analysis_rate_card_cells_stage` under that session id.
3. Returns the session id to the UI.
4. UI renders preview from staging by `upload_session_id`.
5. On commit, the commit RPC reads from staging by `upload_session_id` and writes to the canonical tables.
6. After commit, the RPC deletes its session's staging rows.
7. Sessions older than 24h are reaped by the existing nightly stage-cleanup job (gap noted in post-2b polish — same `.remove()` issue applies, but does not block this spec).

**Why staging at all (and not parse-and-commit-in-one-shot):** rate cards are operator-facing material. Sawyer (or any future operator) needs to see what's about to land before it lands. Stage-then-commit lets the UI render a preview table per card (top 5 weight rows × all zones) so a typo or off-by-one is caught visually before it hits the canonical table.

**Pattern 9 candidate:** the two-table staging that mirrors canonical shape (this spec) is a stronger pattern than the single-table jsonb-payload staging used in earlier 2b screens. Worth promoting and back-porting opportunistically.

---

## 7. Commit RPCs

One commit RPC per carrier mode. Each takes `upload_session_id` (and `fulfillment_mode` for the GOFO ones) and does the truncate-and-replace on its scope.

### 7a. DHL eCom Domestic

```sql
CREATE OR REPLACE FUNCTION public.analysis_rate_cards_commit_dhl_ecom(
  p_upload_session_id uuid
)
RETURNS TABLE (rate_cards_inserted int, cells_inserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cards_in   int;
  v_cells_in   bigint;
BEGIN
  -- 1. Validate session exists in stage
  IF NOT EXISTS (
    SELECT 1 FROM public.analysis_rate_cards_stage
    WHERE upload_session_id = p_upload_session_id
      AND carrier_code = 'DHL_ECOM'
  ) THEN
    RAISE EXCEPTION 'No DHL_ECOM rows staged for session %', p_upload_session_id;
  END IF;

  -- 2. Sanity check: stage must have exactly 126 rate cards
  IF (SELECT count(*) FROM public.analysis_rate_cards_stage
      WHERE upload_session_id = p_upload_session_id
        AND carrier_code = 'DHL_ECOM') <> 126
  THEN
    RAISE EXCEPTION 'DHL_ECOM stage expected 126 rate cards, found %',
      (SELECT count(*) FROM public.analysis_rate_cards_stage
       WHERE upload_session_id = p_upload_session_id
         AND carrier_code = 'DHL_ECOM');
  END IF;

  -- 3. Reject any null rates in stage
  IF EXISTS (
    SELECT 1
    FROM public.analysis_rate_card_cells_stage cs
    JOIN public.analysis_rate_cards_stage ps
      ON ps.stage_row_id = cs.parent_stage_row_id
    WHERE cs.upload_session_id = p_upload_session_id
      AND ps.carrier_code = 'DHL_ECOM'
      AND cs.rate IS NULL
  ) THEN
    RAISE EXCEPTION 'DHL_ECOM stage contains null rates — fix source file or replicate explicitly';
  END IF;

  -- 4. Truncate the scope in the canonical table
  DELETE FROM public.analysis_rate_cards
  WHERE carrier_code     = 'DHL_ECOM'
    AND fulfillment_mode = 'na'
    AND purpose          = 'CACTUS_BASE_COST'
    AND lead_id IS NULL;
  -- cells cascade via FK ON DELETE CASCADE on analysis_rate_card_cells

  -- 5. Insert new cards, capturing the new id per stage_row_id
  WITH inserted AS (
    INSERT INTO public.analysis_rate_cards (
      carrier_code, service_level, variant, fulfillment_mode,
      purpose, lead_id, effective_date, deprecated_date,
      dim_factor, source, surcharge_config, notes
    )
    SELECT
      carrier_code, service_level, variant, fulfillment_mode,
      purpose, lead_id, effective_date, deprecated_date,
      dim_factor, source, surcharge_config, notes
    FROM public.analysis_rate_cards_stage
    WHERE upload_session_id = p_upload_session_id
      AND carrier_code = 'DHL_ECOM'
    RETURNING id, carrier_code, service_level, variant, fulfillment_mode
  ),
  -- Map stage_row_id → new analysis_rate_cards.id.
  -- JOIN includes fulfillment_mode defensively; for DHL it's always 'na'
  -- in this RPC, but the pattern matches the GOFO RPCs and protects
  -- against future fulfillment-mode expansion within DHL.
  stage_to_new AS (
    SELECT s.stage_row_id, i.id AS new_card_id
    FROM public.analysis_rate_cards_stage s
    JOIN inserted i
      ON i.carrier_code     = s.carrier_code
     AND i.service_level    = s.service_level
     AND i.variant          = s.variant
     AND i.fulfillment_mode = s.fulfillment_mode
    WHERE s.upload_session_id = p_upload_session_id
      AND s.carrier_code = 'DHL_ECOM'
  ),
  cells_inserted AS (
    INSERT INTO public.analysis_rate_card_cells (
      rate_card_id, zone, weight_value, weight_unit, rate
    )
    SELECT stn.new_card_id, cs.zone, cs.weight_value, cs.weight_unit, cs.rate
    FROM public.analysis_rate_card_cells_stage cs
    JOIN stage_to_new stn ON stn.stage_row_id = cs.parent_stage_row_id
    WHERE cs.upload_session_id = p_upload_session_id
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM inserted),
    (SELECT count(*) FROM cells_inserted)
  INTO v_cards_in, v_cells_in;

  -- 6. Reap this session's stage rows
  DELETE FROM public.analysis_rate_card_cells_stage
    WHERE upload_session_id = p_upload_session_id;
  DELETE FROM public.analysis_rate_cards_stage
    WHERE upload_session_id = p_upload_session_id;

  RETURN QUERY SELECT v_cards_in, v_cells_in;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analysis_rate_cards_commit_dhl_ecom(uuid)
  TO authenticated, service_role;
```

### 7b. GOFO Standard

```sql
CREATE OR REPLACE FUNCTION public.analysis_rate_cards_commit_gofo_standard(
  p_upload_session_id uuid,
  p_fulfillment_mode  public.fulfillment_mode_enum
)
RETURNS TABLE (rate_cards_inserted int, cells_inserted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cards_in   int;
  v_cells_in   bigint;
BEGIN
  IF p_fulfillment_mode NOT IN ('pickup', 'dropoff') THEN
    RAISE EXCEPTION 'GOFO Standard commit requires pickup or dropoff, got %', p_fulfillment_mode;
  END IF;

  IF (SELECT count(*) FROM public.analysis_rate_cards_stage
      WHERE upload_session_id = p_upload_session_id
        AND carrier_code = 'GOFO'
        AND service_level = 'Standard'
        AND fulfillment_mode = p_fulfillment_mode) <> 8
  THEN
    RAISE EXCEPTION 'GOFO Standard stage expected 8 rate cards, found %',
      (SELECT count(*) FROM public.analysis_rate_cards_stage
       WHERE upload_session_id = p_upload_session_id
         AND carrier_code = 'GOFO'
         AND service_level = 'Standard'
         AND fulfillment_mode = p_fulfillment_mode);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.analysis_rate_card_cells_stage cs
    JOIN public.analysis_rate_cards_stage ps
      ON ps.stage_row_id = cs.parent_stage_row_id
    WHERE cs.upload_session_id = p_upload_session_id
      AND ps.carrier_code = 'GOFO'
      AND ps.service_level = 'Standard'
      AND ps.fulfillment_mode = p_fulfillment_mode
      AND cs.rate IS NULL
  ) THEN
    RAISE EXCEPTION 'GOFO Standard stage contains null rates';
  END IF;

  DELETE FROM public.analysis_rate_cards
  WHERE carrier_code     = 'GOFO'
    AND service_level    = 'Standard'
    AND fulfillment_mode = p_fulfillment_mode
    AND purpose          = 'CACTUS_BASE_COST'
    AND lead_id IS NULL;

  WITH inserted AS (
    INSERT INTO public.analysis_rate_cards (
      carrier_code, service_level, variant, fulfillment_mode,
      purpose, lead_id, effective_date, deprecated_date,
      dim_factor, source, surcharge_config, notes
    )
    SELECT
      carrier_code, service_level, variant, fulfillment_mode,
      purpose, lead_id, effective_date, deprecated_date,
      dim_factor, source, surcharge_config, notes
    FROM public.analysis_rate_cards_stage
    WHERE upload_session_id = p_upload_session_id
      AND carrier_code = 'GOFO'
      AND service_level = 'Standard'
      AND fulfillment_mode = p_fulfillment_mode
    RETURNING id, carrier_code, service_level, variant, fulfillment_mode
  ),
  stage_to_new AS (
    SELECT s.stage_row_id, i.id AS new_card_id
    FROM public.analysis_rate_cards_stage s
    JOIN inserted i
      ON i.carrier_code     = s.carrier_code
     AND i.service_level    = s.service_level
     AND i.variant          = s.variant
     AND i.fulfillment_mode = s.fulfillment_mode
    WHERE s.upload_session_id = p_upload_session_id
      AND s.carrier_code = 'GOFO'
      AND s.service_level = 'Standard'
      AND s.fulfillment_mode = p_fulfillment_mode
  ),
  cells_inserted AS (
    INSERT INTO public.analysis_rate_card_cells (
      rate_card_id, zone, weight_value, weight_unit, rate
    )
    SELECT stn.new_card_id, cs.zone, cs.weight_value, cs.weight_unit, cs.rate
    FROM public.analysis_rate_card_cells_stage cs
    JOIN stage_to_new stn ON stn.stage_row_id = cs.parent_stage_row_id
    WHERE cs.upload_session_id = p_upload_session_id
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FROM inserted),
    (SELECT count(*) FROM cells_inserted)
  INTO v_cards_in, v_cells_in;

  DELETE FROM public.analysis_rate_card_cells_stage
    WHERE upload_session_id = p_upload_session_id;
  DELETE FROM public.analysis_rate_cards_stage
    WHERE upload_session_id = p_upload_session_id;

  RETURN QUERY SELECT v_cards_in, v_cells_in;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analysis_rate_cards_commit_gofo_standard(uuid, public.fulfillment_mode_enum)
  TO authenticated, service_role;
```

### 7c. GOFO Regional

Identical body shape to 7b, with these substitutions:

- Function name: `analysis_rate_cards_commit_gofo_regional`
- Service-level scope filter: `service_level = 'Regional'`
- Expected card count: **3** (not 8)
- All error messages reference "GOFO Regional"

GRANT EXECUTE … TO authenticated, service_role.

**Why a JOIN-on-(carrier_code, service_level, variant, fulfillment_mode) to map stage rows to new ids:** within a single scope, this four-tuple is unique by construction. The defensive inclusion of `fulfillment_mode` in the join keys (per Senior Architect rev) protects against any future scenario where a single commit RPC handles multiple fulfillment_modes — even though the RPCs as written only ever process one. Costs nothing; insures against silent join-explosion bugs in future edits.

---

## 8. `surcharge_config` jsonb shape

Per-carrier shape, intentionally not normalized across carriers (each carrier's surcharge schedule is independent — locked decision (a)/(c)).

**DHL eCom Domestic:**
```jsonb
{
  "source_workbook_sheet": "Sheet1",
  "fuel_table_ref":        "dhl_ecom_fuel_tiers",
  "das_zips_ref":          "dhl_ecom_das_zips",
  "waived":                [],
  "announced":             []
}
```

**GOFO Standard (per card):**
```jsonb
{
  "source_workbook_sheet": "STDWE",
  "non_compliance_fee_over_30lb_usd": 50,
  "us_remote_areas": {
    "fee_per_piece_usd": <number>,
    "zips":              [<string>, ...]
  },
  "waived":    [],
  "announced": []
}
```

**GOFO Regional (per card):**
```jsonb
{
  "source_workbook_sheet": "Regional",
  "regional_zip_coverage": {
    "zips_by_hub": { "<HUB>": [<zip>, ...] }
  },
  "max_weight_lb":         25,
  "waived":    [],
  "announced": []
}
```

(`non_compliance_fee_over_max_lb_usd` deliberately omitted from GOFO Regional — see §12.)

**Schema columns vs jsonb (recap of locked decision):**

- Things that have a numeric/temporal/text type and are queried by the rating engine → real columns (`dim_factor`, `effective_date`, `deprecated_date`, `source`, plus the existing surcharge schedule columns on `analysis_rate_cards`).
- Things that are sparse, carrier-specific, or evolving (waiver markers, ZIP lists, sheet provenance) → `surcharge_config` jsonb.

---

## 9. Pause-point sequencing

Six pauses. Each ends with a verification step that you run before greenlighting the next.

**Pause 1 — Migration applied + schema verified.** Apply `v1.10.0-028`. Run §10 verification queries 1-3 plus Q7. Confirm enum exists, columns exist on `analysis_rate_cards`, scope-key constraint shape is correct, staging tables exist with RLS on. Production data still 953/967/3.

**Pause 2 — UI scaffold + status aggregate function deployed.** Render the page with mode tabs, the 5 status cards (all showing "not loaded" placeholders), and the per-mode uploader skeleton. No parsers wired. Verify the status aggregate function returns 0 rows on an empty DB. Re-run Q7.

**Pause 3 — DHL parser + commit complete.** Upload `dhl_ecommerce_cactus_base_rates_2026.xlsx`. Verify staging gets 126 cards. Commit. Verify §10 Q4 returns 126. Verify status card 1 fills in. Re-run Q7.

**Pause 4 — GOFO Standard parser + commit complete (both PU and DO).** Two uploads, two commits. Verify §10 Q5 returns 16 (8 PU + 8 DO). Run the PU↔DO diff query in §5b and record the actual diff count (expected `0 < diff ≤ 2,880`). Verify status cards 2 and 3 fill in. Re-run Q7.

**Pause 5 — GOFO Regional parser + commit complete (both PU and DO).** Two uploads, two commits. Verify §10 Q6 returns 6 (3 PU + 3 DO). Verify status cards 4 and 5 fill in. Re-run Q7.

**Pause 6 — Index page row + end-to-end re-upload test.** Add the standard "Rate Cards" row to `src/app/admin/pld-analysis/page.tsx`. Re-upload one of the GOFO files (any) with a fresh `notes` value. Verify the scope was truncated and replaced, count unchanged, notes updated, `most_recent_upload` advanced. Re-run Q7 — confirm production data still 953/967/3.

---

## 10. Verification queries

**Q1 — enum exists:**
```sql
SELECT typname, enumlabel
FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
WHERE typname = 'fulfillment_mode_enum'
ORDER BY enumsortorder;
-- expect 3 rows: pickup, dropoff, na
```

**Q2 — columns exist:**
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'analysis_rate_cards'
  AND column_name IN ('fulfillment_mode', 'surcharge_config')
ORDER BY column_name;
-- expect both rows present, both NOT NULL with defaults
```

**Q3 — scope-key constraint includes fulfillment_mode AND uses NULLS NOT DISTINCT:**
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.analysis_rate_cards'::regclass
  AND contype  = 'u';
-- expect a UNIQUE constraint whose definition contains BOTH:
--   (1) the column list (carrier_code, service_level, variant, fulfillment_mode, purpose, lead_id)
--   (2) the literal text "NULLS NOT DISTINCT"
-- If "NULLS NOT DISTINCT" is missing, the constraint is decorative — duplicate
-- scope keys can land via any write path because every row has lead_id IS NULL.
```

**Q4 — DHL committed scope:**
```sql
SELECT count(*) FROM public.analysis_rate_cards
WHERE carrier_code='DHL_ECOM' AND fulfillment_mode='na'
  AND purpose='CACTUS_BASE_COST' AND lead_id IS NULL;
-- expect 126

SELECT count(*) FROM public.analysis_rate_card_cells c
JOIN public.analysis_rate_cards r ON r.id = c.rate_card_id
WHERE r.carrier_code='DHL_ECOM' AND r.fulfillment_mode='na';
-- expect 30,888 cells (2,808 source rows × 11 downstream zones after replication)
```

**Q5 — GOFO Standard committed scopes:**
```sql
SELECT fulfillment_mode, count(*)
FROM public.analysis_rate_cards
WHERE carrier_code='GOFO' AND service_level='Standard'
  AND purpose='CACTUS_BASE_COST' AND lead_id IS NULL
GROUP BY fulfillment_mode;
-- expect: pickup=8, dropoff=8
```

**Q6 — GOFO Regional committed scopes:**
```sql
SELECT fulfillment_mode, variant, count(*) AS cell_count
FROM public.analysis_rate_cards r
JOIN public.analysis_rate_card_cells c ON c.rate_card_id = r.id
WHERE r.carrier_code='GOFO' AND r.service_level='Regional'
  AND r.purpose='CACTUS_BASE_COST' AND r.lead_id IS NULL
GROUP BY fulfillment_mode, variant
ORDER BY fulfillment_mode, variant;
-- expect 6 rows: each with cell_count = 320
```

**Q7 — production unchanged (run before and after each commit):**
```sql
SELECT
  (SELECT count(*) FROM public.shipment_ledger)     AS shipment_ledger,    -- expect 953
  (SELECT count(*) FROM public.invoice_line_items)  AS invoice_line_items, -- expect 967
  (SELECT count(*) FROM public.cactus_invoices)     AS cactus_invoices;    -- expect 3
```

**Q8 — status aggregate end-state:**
```sql
SELECT scope_label, carrier_code, service_level_group, fulfillment_mode, rate_card_count
FROM public.analysis_rate_cards_status_aggregate();
-- expect 5 rows in the order:
--   DHL eCom Domestic       | DHL_ECOM | NULL     | na      | 126
--   GOFO Standard — Dropoff | GOFO     | Standard | dropoff | 8
--   GOFO Standard — Pickup  | GOFO     | Standard | pickup  | 8
--   GOFO Regional — Dropoff | GOFO     | Regional | dropoff | 3
--   GOFO Regional — Pickup  | GOFO     | Regional | pickup  | 3
```

---

## 11. Files to create / modify

**New (migration):**
- `supabase/migrations/v1.10.0-028_rate_cards_fulfillment_mode_and_surcharge.sql`

**New (server-side parsers):**
- `src/lib/pld-analysis/rate-cards/parseDhlEcomRates.ts`
- `src/lib/pld-analysis/rate-cards/parseGofoStandardRates.ts`
- `src/lib/pld-analysis/rate-cards/parseGofoRegionalRates.ts`
- `src/lib/pld-analysis/rate-cards/dhl-ecom-products.ts` (verbatim 7-string canonical list + display sort order)
- `src/lib/pld-analysis/rate-cards/zone-replication.ts` (shared helpers: replicateMergedZone, validateZoneCoverage)
- `src/lib/pld-analysis/rate-cards/scopes.ts` (canonical 5-scope list for UI placeholder rendering)

**New (API routes):**
- `src/app/api/pld-analysis/rate-cards/upload/route.ts` (POST: file + mode + fulfillment_mode + notes → returns upload_session_id + preview)
- `src/app/api/pld-analysis/rate-cards/commit/route.ts` (POST: upload_session_id + carrier_mode → calls correct commit RPC)
- `src/app/api/pld-analysis/rate-cards/status/route.ts` (GET: returns aggregate function output)

**New (UI):**
- `src/app/admin/pld-analysis/rate-cards/page.tsx`
- `src/components/pld-analysis/rate-cards/RateCardsParser.tsx`
- `src/components/pld-analysis/rate-cards/StatusCards.tsx`
- `src/components/pld-analysis/rate-cards/UploaderPanel.tsx` (the per-mode panel; props pick which uploaders to show)
- `src/components/pld-analysis/rate-cards/StagePreviewTable.tsx`

**Modified:**
- `src/app/admin/pld-analysis/page.tsx` (add the Rate Cards index row)

**Naming compliance check:**
- Files / folders: kebab-case ✓
- DB tables / columns: snake_case ✓
- TS exports: camelCase / PascalCase per type ✓
- DB enum value `na` is lowercase per existing PLD enum convention ✓

---

## 12. Risks & open questions

**Open and deferred:**

1. **GOFO Regional non-compliance fee over 25 lb.** Per Senior Architect: defer to operational confirmation. Default to absent in `surcharge_config`. Confirm with the GOFO contact before the rating engine integration begins (Stage 8 work). Until confirmed, the rating engine should fail loudly on GOFO Regional shipments >25 lb (same posture as GOFO Standard >30 lb).

2. **US Remote Areas tab shape.** Spec assumes the tab is a small ZIP+fee schedule that fits comfortably in jsonb. If on first parse the tab turns out to be a larger structured rate sheet, this becomes a follow-up: add `gofo_us_remote_areas` table similar to `dhl_ecom_das_zips` and reference it from `surcharge_config.us_remote_areas_ref` instead of inlining the data. Decision point is at first upload during Pause 4 — if the inlined blob exceeds ~10 KB per card, escalate.

**Carry-over from prior 2b screens (do not address in this spec):**

3. Stage cleanup `.remove()` failure across all flows — affects the 24h reaper, not the commit-time reap inside the RPC. Listed in post-2b polish.
4. Pattern 8 centralized `MAX_PLD_UPLOAD_BYTES` constant — used by this spec implicitly via the existing per-route check; don't refactor here.
5. Mint cleanup, index page row standardization — both already covered in post-2b polish list.

**Architectural items worth naming:**

6. **Pattern 9 candidate (post-2b PATTERNS.md).** The two-table staging pattern adopted here (stage tables that mirror canonical shape, joined on full scope-key on commit) is stronger than the single-table jsonb-payload staging used in earlier 2b screens. Worth promoting and back-porting opportunistically.

7. **Replicated surcharge blobs.** `us_remote_areas` and `regional_zip_coverage` blobs are replicated onto every rate card in their scope (rather than normalized into a side table). This is the right call for read-time simplicity at rating time, but it means a future change to GOFO's remote-area policy requires a re-upload of the scope to propagate. Consistent with all prior 2b operational patterns. Ratified by Senior Architect.

8. **DC subset rule (Pattern 5 strict form).** New DHL DCs cannot be introduced via rate card upload — they must land in `dhl_ecom_dcs` first via a dedicated migration. This is a deliberate operational guardrail: DCs are reference data shared across multiple 2b screens, and rate cards must not be the table that silently expands the DC namespace.

**Resolved during this review (no further inspection needed):**

- DHL zone column count: 8 source columns (Zone 1&2 | 3 | 4 | 5 | 6 | 7 | 8 | Zone 11-13). Two replications. Downstream: 11 zones.
- DHL canonical product strings: 7 verbatim — `BPM Expedited`, `BPM Ground`, `Expedited Max`, `SM LWP Expedited`, `SM LWP Ground`, `SM Parcel Plus Expedited`, `SM Parcel Plus Ground`.
- GOFO carrier code: `GOFO` (not `GOFO_STANDARD` / `GOFO_REGIONAL`); service_level differentiates Standard vs Regional.
- `analysis_rate_cards.source` (not `source_filename`) is the column name.
- Production invariant tables: `shipment_ledger=953`, `invoice_line_items=967`, `cactus_invoices=3`.

---

**End of spec — rev 3.** Greenlit. Migration apply + Pause 1 verification queries follow in chat.
