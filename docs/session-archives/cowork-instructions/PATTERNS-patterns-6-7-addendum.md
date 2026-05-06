# PATTERNS.md Addendum — Patterns 6 & 7

**Target file:** `cactus-web-app/database/migrations/PATTERNS.md` (worktree copy at `.claude/worktrees/youthful-carson-41b709/database/migrations/PATTERNS.md`)
**Edit type:** Append two new patterns + update document history footer
**Trigger:** Two distinct bugs surfaced during sub-phase 2b's Zone Matrices build (DHL eCom Domestic, 18-DC × 930 ZIP3 matrix). Both fall under the discipline "don't trust the apparent simplicity of a query — verify the contract that connects code to data."

---

## What to do

This addendum has three surgical edits:
1. Insert Pattern 6 between the existing Pattern 5 and the "How to add a new pattern to this doc" section
2. Insert Pattern 7 immediately after Pattern 6
3. Update the document history footer to record the additions

---

## Edit 1 — Insert Pattern 6

**Find** (the boundary between Pattern 5 and the section that follows — the exact text near the end of Pattern 5):

```
**Doesn't apply to:** content that is genuinely a constant (e.g., the literal text of master briefing rules, copyright notices, fixed brand strings). The rule is specifically about lists derived from database tables. If the data lives in a table, the UI should read from that table.

---

## How to add a new pattern to this doc
```

**Replace with** (preserves the end of Pattern 5, inserts Pattern 6 between, leaves the section header following):

```
**Doesn't apply to:** content that is genuinely a constant (e.g., the literal text of master briefing rules, copyright notices, fixed brand strings). The rule is specifically about lists derived from database tables. If the data lives in a table, the UI should read from that table.

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
```

---

## Edit 2 — Update document history footer

**Find** (at the very bottom of the file):

```
## Document history

- **2026-05-05 (v1.10.0):** Initial creation. Captures patterns 1-4 from Phase 1 + Phase 2 build.
- **2026-05-05 (v1.10.0):** Added Pattern 5 (Live-query reference data lists). Surfaced during sub-phase 2b after v1.10.0-019 hub split exposed a stale hardcoded list on the Reference Data index page.
```

**Replace with:**

```
## Document history

- **2026-05-05 (v1.10.0):** Initial creation. Captures patterns 1-4 from Phase 1 + Phase 2 build.
- **2026-05-05 (v1.10.0):** Added Pattern 5 (Live-query reference data lists). Surfaced during sub-phase 2b after v1.10.0-019 hub split exposed a stale hardcoded list on the Reference Data index page.
- **2026-05-05 (v1.10.0):** Added Patterns 6 (RLS + GRANTs) and 7 (Server-side aggregates). Both surfaced during sub-phase 2b's Zone Matrices build. Pattern 6: migration v1.10.0-022 created dhl_ecom_dcs with RLS + policy but no GRANTs, causing "permission denied" at runtime; hotfix in `v1_10_0_022_fix_dhl_ecom_dcs_grants` and canonical .sql patched in commit 6be6bff. Pattern 7: PostgREST row caps interacted with tied created_at values to produce wrong distinct counts; fixed via `carrier_zone_matrix_status()` PG function in migration v1.10.0-024.
```

---

## End-of-edit verification checklist

After applying all three edits, verify:

- [ ] PATTERNS.md now lists 7 patterns (was 5)
- [ ] Pattern 6 appears between Pattern 5 and Pattern 7
- [ ] Pattern 7 appears between Pattern 6 and the "How to add a new pattern to this doc" section
- [ ] Pattern 6 contains: Rule / Why / How (Wrong/Right examples) / Migration template / Doesn't apply to / Verification command / Example failure mode
- [ ] Pattern 7 contains: Rule / Why / How (Wrong/Right examples) / Migration author's responsibility / Sanity test / Doesn't apply to / Example failure mode / Themed observation
- [ ] Document history footer has 3 entries (was 2)
- [ ] No other text changed (Patterns 1-5 are byte-identical to before)
- [ ] File is committed in the worktree (main repo doesn't have PATTERNS.md yet — propagation happens at branch merge)

---

## Notes for whoever applies this (Cowork or Claude Code)

- This is a documentation-only edit. No schema impact. No migration needed.
- Apply to the **worktree copy** at `.claude/worktrees/youthful-carson-41b709/database/migrations/PATTERNS.md`. Do not touch the main repo — main does not have PATTERNS.md yet (Pattern 5 addendum already established this; it'll arrive on main when the `claude/youthful-carson-41b709` branch eventually merges).
- This addendum can travel with the post-sub-phase-2b polish commit (the same commit that handles any "ui-polish-followups" mint cleanup, etc.) or stand alone as its own commit. Either is fine.
- Suggested commit message if applied alone: `docs: PATTERNS.md — add Patterns 6 (RLS+GRANTs) and 7 (server-side aggregates)`

---

End of addendum.
