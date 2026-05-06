# Migration Patterns

**Audience:** Anyone (human or AI assistant) authoring a database migration in this repo.
**Status:** Living document — append a new pattern whenever a migration teaches us something non-obvious.
**Read this before:** Authoring any new migration in `database/migrations/`.

---

## Pattern 1: Verify schema before authoring

**Rule:** Before writing any migration that references an existing table, query the deployed schema. Do not draft migrations from memory of what columns "should" exist.

**Why:** The implementation brief and master briefing have specified column sets that don't always match what got deployed in earlier migrations. Mismatch surfaces only at apply time as a column-not-found error, which means the migration's `BEGIN/COMMIT` rolls back and you start over with the actual columns. Up-front check is one query and saves the round trip.

**How:**
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<target_table>'
ORDER BY ordinal_position;
```

**Examples where this caught us:** v1.10.0-013 (dhl_ecom_fuel_tiers had different audit columns than the brief specified); v1.10.0-019 (gofo_hubs uses `hub_name`/`city`/`state`/`primary_zip5`, not `name`/`address`).

---

## Pattern 2: ALTER TYPE ADD VALUE requires migration split when used in same script

**Rule:** Postgres' `ALTER TYPE <enum> ADD VALUE` cannot run in the same transaction as code that uses the new value. Supabase's MCP `apply_migration` wraps each call in a single transaction. Therefore: **enum-extending migrations that also INSERT data using the new value must be split into two `apply_migration` calls.**

**Why:** Postgres rejects with `55P04: unsafe use of new value "FOO"`. The transaction rolls back cleanly (no partial state risk), but you have to apply twice.

**How:**

The committed `.sql` file in the repo stays a **single canonical document** with both phases inline — that's the source of truth and what someone running it via `psql` would execute end-to-end. The split is purely an MCP application detail.

When applying via MCP:
1. First `apply_migration` call: name suffix `_phase1_enum`. Contains only the `ALTER TYPE ... ADD VALUE` statements.
2. Second `apply_migration` call: name suffix `_phase2_data`. Contains the `INSERT`/`UPDATE`/etc. that uses the new value.

**Example:** v1.10.0-019 (split EWR_JFK into EWR + JFK). Applied as `v1_10_0_019_split_ewr_jfk_phase1_enum` then `v1_10_0_019_split_ewr_jfk_phase2_data`. Single `.sql` file in the repo.

**When this doesn't apply:** if the migration only adds enum values and doesn't immediately use them (e.g., the values are for future application code), one call works fine.

---

## Pattern 3: Large seed migrations may need chunked apply

**Rule:** MCP `apply_migration` has a payload size limit. Migrations with thousands of `INSERT VALUES` rows (≥ ~80KB SQL) will fail to apply in one call.

**How:**

The committed `.sql` file stays as a **single canonical document** with one big INSERT statement — that's the source of truth.

When applying via MCP, split the `INSERT VALUES` clause into N sequential `apply_migration` calls under names suffixed `_chunk1`, `_chunk2`, etc. Each chunk:
- INSERTs ~200 rows
- References the same target table
- Does NOT include the surrounding `BEGIN/COMMIT` of the canonical file (each chunk is its own implicit transaction)
- Does NOT include `TRUNCATE` after the first chunk (only chunk 1 truncates if needed)

**When chunked apply is correct vs wrong:**
- ✅ Correct: pure reference data with no interleaved logic (centroids, ZIP coverage lists, country codes).
- ❌ Wrong: data with derivation chains or trigger interactions where the rows must land atomically. Use the upload-UI path instead (per Phase 2b decision for the GOFO Regional zone matrix at ~58k rows).

**Example:** v1.10.0-016 (zip3_centroids seed, 896 rows ≈ 89KB). Applied as 5 chunks. Single `.sql` in the repo.

---

## Pattern 4: Source-mutating migrations refresh derivations atomically

**Rule:** When a migration changes a source table that has a derived table downstream, the same migration must re-run the derivation. Do not split source mutation and derivation refresh across migrations.

**Why:** Per master briefing Rule 10. See `docs/derived-data-dependencies.md` for the full list of derivation chains. Leaving the system in a state where source ≠ derivation silently breaks downstream lookups.

**Concrete instance:** Any migration that mutates `zip3_centroids` or `gofo_hubs` must include the `gofo_hub_proximity` Haversine recompute in the same migration (or in the same admin UI atomic action). v1.10.0-019 demonstrates the pattern.

**How (template):**
```sql
BEGIN;
-- 1. Mutate source table
DELETE FROM <source_table> WHERE ...;
INSERT INTO <source_table> ...;

-- 2. Refresh derivation atomically
TRUNCATE TABLE <derived_table>;
INSERT INTO <derived_table>
SELECT ... FROM <source_table> ...;
COMMIT;
```

---

## Pattern 5: UI lists of reference data must be live-queried, never hardcoded

**Rule:** When a UI surface displays a list of reference values (hub codes, carrier codes, enum members, seeded constants), query the source-of-truth table at render time. Do not hardcode comma-separated strings of those values into JSX, even when the underlying data is "constant."

**Why:** The classic failure mode is "count is queried, list is hardcoded" — the count updates when the data changes, but the list doesn't, so the page contradicts itself in a way that's invisible to type-checking and tests. v1.10.0-019 split the EWR_JFK hub into EWR + JFK, the live count went from 7 → 8 immediately, but the Reference Data index page kept rendering "LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC. 8 hubs" until manually noticed.

**How:**

Wrong (the failure mode):
```typescript
// Reference Data index page — GOFO Hubs row
const hubCount = await supabase.from('gofo_hubs').select('*', { count: 'exact', head: true });
return (
  <Row
    title="GOFO Hubs"
    primary={`${hubCount.count} hubs`}
    secondary="System constant — LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC. Edits require a migration."
  />
);
```

Right:
```typescript
const { data: hubs } = await supabase
  .from('gofo_hubs')
  .select('hub_code')
  .order('hub_code');

const hubList = hubs.map(h => h.hub_code).join(', ');
return (
  <Row
    title="GOFO Hubs"
    primary={`${hubs.length} hubs`}
    secondary={`System constant — ${hubList}. Edits require a migration.`}
  />
);
```

The same query produces both the count and the list. They cannot drift.

Additional guidance:
- Pull the list from the same query that produces the count (or a parallel query in the same `Promise.all`).
- Pick a deterministic ordering (alphabetical, or by a domain-meaningful column like `primary_zip5` for hubs) so the rendered string is stable across renders.
- If the list is long, truncate visually with "X, Y, Z, … +N more" rather than hardcoding "common values" — same principle.
- Empty-state fallback: handle the case where the table has zero rows (e.g., `'(no hubs loaded)'`) so a deploy mid-seed doesn't render literal "[ ]".

**Migration author's responsibility:** When authoring a migration that changes a reference data set (adds/removes/splits/renames rows, modifies an enum), grep the codebase for hardcoded references to the values being changed:

```bash
grep -rn "EWR_JFK" src/ docs/ --include="*.ts" --include="*.tsx" --include="*.md"
```

Update any UI text that hardcodes the list. Better still: refactor that UI text to query the table live, eliminating the possibility of recurrence. Each migration that follows Pattern 5 leaves the codebase one step closer to fully-live reference data displays.

**When to bend the rule:** SQL constraints, migration text, and historical-record comments may legitimately list pre-mutation state (e.g., a migration's pre-flight comment describing what was true at apply time). Those are append-only documentation of a moment in time, not live-rendered UI. Leave them as-is when state changes.

**Example:** the Reference Data index page (`src/alamo/app/pld-analysis/reference-data/page.tsx`) — `gofo_hubs` row pulls `hub_code` from the table in the same `Promise.all` that fetches the count, joins with `', '`, renders inline. Same code path produces both numbers, so they can't drift.

---

## Pattern 6: Tables with RLS still need explicit role GRANTs

**Rule:** When a migration creates a table and enables Row Level Security with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus a `CREATE POLICY`, that is not sufficient to allow application access. You must also issue table-level `GRANT` statements to the Supabase roles (`anon`, `authenticated`, `service_role`) that the application uses. Both checks must pass: the role must have the underlying SQL privilege, AND the RLS policy must permit the row.

**Why:** Postgres applies role-level GRANTs *before* RLS policies. If a role has no `GRANT SELECT` on the table, the query fails with `permission denied` before any policy is ever evaluated. The RLS policy is invisible — it never gets a chance to run. The error message says "permission denied for table X," which can mislead the author into thinking the policy is wrong, when actually the GRANT is missing entirely.

This is a silent-until-it-breaks pattern. Migrations that worked in earlier Phase 1 builds (where Supabase's project-wide default-privileges had been pre-configured to grant standard roles SELECT on new public tables) silently inherited those defaults. Migrations authored fresh in later phases — or migrations that explicitly create new schemas, alter the search path, or run during periods when defaults have drifted — will not inherit the GRANTs and will fail.

**How:**

Wrong (what we did the first time on `dhl_ecom_dcs` in v1.10.0-022 — RLS without GRANTs):

```sql
CREATE TABLE dhl_ecom_dcs (
  dc_code CHAR(3) PRIMARY KEY,
  ...
);

ALTER TABLE dhl_ecom_dcs ENABLE ROW LEVEL SECURITY;

CREATE POLICY dhl_ecom_dcs_authenticated_select ON dhl_ecom_dcs
  FOR SELECT TO authenticated USING (true);
```

Looks complete. Application says: `permission denied for table dhl_ecom_dcs`.

Right (what migration `v1_10_0_022_fix_dhl_ecom_dcs_grants` retroactively added):

```sql
CREATE TABLE dhl_ecom_dcs (
  dc_code CHAR(3) PRIMARY KEY,
  ...
);

ALTER TABLE dhl_ecom_dcs ENABLE ROW LEVEL SECURITY;

CREATE POLICY dhl_ecom_dcs_authenticated_select ON dhl_ecom_dcs
  FOR SELECT TO authenticated USING (true);

-- These two GRANTs are not optional:
GRANT SELECT ON dhl_ecom_dcs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE 
  ON dhl_ecom_dcs TO service_role;
```

The `service_role` GRANT is the full set because Server Actions and the cleanup cron operate as `service_role` and need to bypass RLS for administrative tasks. The `authenticated` GRANT is just `SELECT` because end-user code should never write reference data through the API.

**Migration template:** every migration that creates a new public table must include explicit GRANTs to `authenticated` and `service_role`. The minimum set:

```sql
-- Read access for end users
GRANT SELECT ON <table> TO authenticated;

-- Full access for Server Actions and cron jobs (RLS still applies unless 
-- bypassed via SECURITY DEFINER functions)
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE 
  ON <table> TO service_role;
```

If the table is intentionally read-only outside of migrations, the `authenticated` grant stays as `SELECT` only. If the table accepts user-driven writes (rare for reference data), expand the `authenticated` grants accordingly.

**Doesn't apply to:** tables in non-public schemas (which need their own GRANT model), or tables intentionally locked down to `postgres` only (rare). For everything in the `public` schema that the Alamo or rating engine queries, both layers must pass.

**Verification command:** after applying any new-table migration, confirm with:

```sql
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = '<table>' AND table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;
```

If the result shows fewer than the expected entries, the GRANTs are missing and the table will fail at runtime.

**Example failure mode:** Migration v1.10.0-022 created `dhl_ecom_dcs` with RLS + a SELECT policy for authenticated. Sub-phase 2b's Zone Matrices upload screen tried to query the table to validate uploaded DC codes against the canonical 18-DC set. The query failed with `permission denied for table dhl_ecom_dcs` — looking like an RLS issue but actually a missing GRANT. Hotfix migration `v1_10_0_022_fix_dhl_ecom_dcs_grants` added the missing GRANTs. The canonical migration file was patched in commit `6be6bff` so future replays from scratch wouldn't reproduce the bug.

---

## Pattern 7: Counts and aggregates must be computed server-side, not from row samples

**Rule:** When the UI needs a count, distinct count, max, or any aggregate over a database table, compute it server-side via SQL (`SELECT count(*) ...`, `SELECT count(DISTINCT col) ...`) and return only the aggregate result. Do not fetch a row sample (e.g., `.limit(N)`) and aggregate it client-side. The PostgREST row cap is well below most "I'll just fetch enough" thresholds, and the resulting bug is invisible at small scale.

**Why:** PostgREST defaults cap response sizes at well under 20,000 rows (often 1,000 by default; configurable). Even if the application code says `.limit(20000)`, the actual response may be truncated. When the truncated slice happens to under-represent the distinct values you're aggregating client-side, the count is wrong — and silently so.

The bug is especially insidious when rows tie on the column used for default ordering (typically `created_at` — every row written in a single transaction shares the same timestamp). Postgres breaks ties non-deterministically, but the *first slice returned* will tend to be biased toward whichever physical heap pages are returned first. You can get back a "representative" sample at low row counts and a "concentrated" sample at high row counts — producing different aggregate results from the same query.

**How:**

Wrong (what surfaced on the Reference Data index page and Zone Matrices LoadedCard):

```typescript
const { data } = await admin
  .from('carrier_zone_matrices')
  .select('origin_zip3, created_at, effective_date')
  .eq('carrier_code', 'DHL_ECOM')
  .eq('service_level', 'Ground')
  .limit(20000);  // intent: "fetch all rows"

const distinctDcs = new Set(data.map(r => r.origin_zip3)).size;
// At 16,740 rows all sharing one created_at, the response slice
// contained ~2 DCs' worth of rows. distinctDcs = 2. Wrong by 9×.
```

Symptom: page reads "16,740 matrix rows · 2 DCs" when it should read "18 DCs."

Right (server-side aggregation via a parameterized PG function):

```sql
-- Migration v1.10.0-024
CREATE OR REPLACE FUNCTION carrier_zone_matrix_status(
  p_carrier carrier_code_enum, 
  p_service text
) RETURNS TABLE (
  total_rows bigint,
  distinct_dcs bigint,
  latest_effective date,
  latest_created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    count(*),
    count(DISTINCT origin_zip3),
    max(effective_date),
    max(created_at)
  FROM carrier_zone_matrices
  WHERE carrier_code = p_carrier
    AND service_level = p_service
    AND deprecated_date IS NULL;
$$;
```

Application code:

```typescript
const { data } = await admin
  .rpc('carrier_zone_matrix_status', { 
    p_carrier: 'DHL_ECOM', 
    p_service: 'Ground' 
  });

// data = { total_rows: 16740, distinct_dcs: 18, latest_effective: '2026-03-22', ... }
// Single round trip, no row cap, no client-side aggregation.
```

The function is generalized over `(carrier_code, service_level)` so future carriers (GOFO Standard, etc.) reuse the same RPC without code changes — same Pattern 5 discipline applied to aggregation.

**Migration author's responsibility:** when a new table is being queried to produce an aggregate displayed in the UI, author the helper RPC alongside the table's CRUD migrations. Do not leave aggregate computation as an exercise for the application code — application code will reach for `.limit(N)` and create this exact bug.

**Sanity test for any existing aggregate query:** if the codebase contains any pattern matching `.from(X).select(...).limit(N)` followed by `.length`, `new Set(...)`, `Math.max(...)`, or `.reduce(...)` for aggregation, it has this bug or a latent version of it. Replace with an RPC.

**Doesn't apply to:** queries that genuinely need the row data (e.g., rendering a paginated table). Those are not aggregations — they're reads. Pattern 7 is specifically about UI elements that show "N rows," "M distinct values," "latest update at T," etc., where only the aggregate is shown to the user.

**Example failure mode:** Sub-phase 2b's Zone Matrices LoadedCard and Reference Data index page both did `.from('carrier_zone_matrices').limit(20000)` then computed `count(DISTINCT origin_zip3)` client-side. After committing 16,740 rows in a single transaction (all sharing one `created_at`), the response slice contained only 2 DCs. UI displayed "2 DCs" instead of 18. Database state was perfect; the bug was purely in the read path. Migration v1.10.0-024 added a generalized `carrier_zone_matrix_status(carrier, service)` PG function. Both surfaces now call `.rpc()` and return correct counts. Bug fix in commit `ff12789`.

**Themed observation:** Patterns 6 and 7 share a common theme — *don't trust the apparent simplicity of a query*. Both bugs looked correct on inspection (RLS policy was there; `.limit(20000)` was generous). Both failed because the contract between the application code and the data layer was violated by an invisible mechanism (role-level GRANT precedence; PostgREST row caps). The discipline: verify the actual contract end-to-end, not the surface that the code presents.

---

## How to add a new pattern to this doc

When a migration teaches us something the existing patterns don't cover:
1. Add a new `## Pattern N: <one-line summary>` section.
2. Include: Rule (what to do), Why (the failure mode if you don't), How (mechanics), Example (commit SHA or migration version).
3. Commit alongside the migration that surfaced the pattern.
4. Reference this doc from the migration's header comment if the migration was specifically designed to follow the pattern.

---

## Document history

- **2026-05-05 (v1.10.0):** Initial creation. Captures patterns 1-4 from Phase 1 + Phase 2 build.
- **2026-05-05 (v1.10.0):** Pattern 5 added after v1.10.0-019 hub split surfaced a stale hardcoded list on the Reference Data index page.
- **2026-05-05 (v1.10.0):** Added Patterns 6 (RLS + GRANTs) and 7 (Server-side aggregates). Both surfaced during sub-phase 2b's Zone Matrices build. Pattern 6: migration v1.10.0-022 created dhl_ecom_dcs with RLS + policy but no GRANTs, causing "permission denied" at runtime; hotfix in `v1_10_0_022_fix_dhl_ecom_dcs_grants` and canonical .sql patched in commit 6be6bff. Pattern 7: PostgREST row caps interacted with tied created_at values to produce wrong distinct counts; fixed via `carrier_zone_matrix_status()` PG function in migration v1.10.0-024.
