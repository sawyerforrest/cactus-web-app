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
- Pull the list from the same query that produces the count (or a parallel query in the same `Promise.all`).
- Pick a deterministic ordering (alphabetical, or by a domain-meaningful column like `primary_zip5` for hubs) so the rendered string is stable across renders.
- If the list is long, truncate visually with "X, Y, Z, … +N more" rather than hardcoding "common values" — same principle.
- Empty-state fallback: handle the case where the table has zero rows (e.g., `'(no hubs loaded)'`) so a deploy mid-seed doesn't render literal "[ ]".

**When to bend the rule:** SQL constraints, migration text, and historical-record comments may legitimately list pre-mutation state (e.g., a migration's pre-flight comment describing what was true at apply time). Those are append-only documentation of a moment in time, not live-rendered UI. Leave them as-is when state changes.

**Example:** the Reference Data index page (`src/alamo/app/pld-analysis/reference-data/page.tsx`) — `gofo_hubs` row pulls `hub_code` from the table in the same `Promise.all` that fetches the count, joins with `', '`, renders inline. Same code path produces both numbers, so they can't drift.

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
