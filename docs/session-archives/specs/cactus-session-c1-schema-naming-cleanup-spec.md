# SESSION C.1 SPEC — SCHEMA NAMING CLEANUP + ADDRESS NORMALIZATION HELPER

**Branch:** New `claude/*` worktree, based on current main
**Prerequisites:** Sessions B, B.1, and tonight's DN-5 investigation merged to main (commit `4034aa5` or later)
**Estimated duration:** 2-3 hours (schema migration + code updates + verification)
**Risk level:** MEDIUM-HIGH — schema migration touches foundational columns. Financial-critical paths indirectly affected.

---

## WHAT THIS SESSION ACCOMPLISHES

Two intertwined pieces of work bundled into one focused session:

### Part 1 — Schema naming cleanup (8 column renames)

Resolves the `zip` vs `postal_code` and `line1` vs `line_1` inconsistencies that the 2026-04-23 schema-vs-code audit confirmed empirically. Target canonical conventions:

- `postal_code` (not `zip`)
- `line_1` / `line_2` (not `line1` / `line2`) — matches existing `reference_1`, `reference_2` convention

### Part 2 — Shared address normalization helper + locations form bug fix

Resolves the bug discovered in tonight's audit: `/orgs/[id]/locations/new/page.tsx` INSERT does not populate `locations.normalized_address`, silently breaking dark-account matching for any newly-created location. The fix creates a shared helper so the parser and the location form use identical normalization logic.

Additionally, the parser currently omits `address_sender_line2` from normalization. This is a latent bug that causes different shipments from the same building (different suite numbers) to hash to the same normalized address, potentially routing shipments to the wrong org. Fix includes line_2 in normalization going forward.

---

## GROUND RULES

1. **Read the actual files before editing.** Schema migration file, parser (`parse/page.tsx`), location form, CSV generator, PDF generator, location/carrier pages. Never assume structure.
2. **Each change gets its own commit** with `Session C.1:` prefix. Enables cherry-picking if something goes wrong.
3. **Financial-critical paths need extra care.** Schema column renames that parser or billing touches must be applied to every reference before running any code.
4. **Follow the v1.6.1 migration discipline pattern.** Use ADD-BACKFILL-VERIFY-DROP for any column that has existing data. For pure renames (no data transformation), `ALTER TABLE ... RENAME COLUMN` is safe and atomic.
5. **Stop and ask on genuine ambiguity.** Halt points listed below — treat them seriously.
6. **Keep the briefing as source of truth.** If this spec contradicts the briefing, the briefing wins.

---

## SCOPE — THE EIGHT COLUMN RENAMES

### `invoice_line_items` (6 renames)

| Current | Target |
|---------|--------|
| `address_sender_zip` | `address_sender_postal_code` |
| `address_receiver_zip` | `address_receiver_postal_code` |
| `address_sender_line1` | `address_sender_line_1` |
| `address_sender_line2` | `address_sender_line_2` |
| `address_receiver_line1` | `address_receiver_line_1` |
| `address_receiver_line2` | `address_receiver_line_2` |

### `locations` (2 renames)

| Current | Target |
|---------|--------|
| `address_line1` | `address_line_1` |
| `address_line2` | `address_line_2` |

Note: `locations.postal_code` is already correct — no change needed.

---

## MIGRATION FILE

Create `database/migrations/v1.7.0-address-naming-cleanup.sql`:

```sql
-- ==========================================================================
-- MIGRATION v1.7.0 — Address column naming cleanup
-- Date: [TO BE FILLED AT RUN TIME]
-- Purpose: Standardize on `postal_code` (not `zip`) and `line_1`/`line_2`
--          (not `line1`/`line2`) across invoice_line_items and locations.
--          Pure RENAME — no data transformation. Data preserved atomically.
-- Affects: 8 columns across 2 tables. No dropped data.
-- ==========================================================================

BEGIN;

-- invoice_line_items (6 renames)
ALTER TABLE invoice_line_items RENAME COLUMN address_sender_zip TO address_sender_postal_code;
ALTER TABLE invoice_line_items RENAME COLUMN address_receiver_zip TO address_receiver_postal_code;
ALTER TABLE invoice_line_items RENAME COLUMN address_sender_line1 TO address_sender_line_1;
ALTER TABLE invoice_line_items RENAME COLUMN address_sender_line2 TO address_sender_line_2;
ALTER TABLE invoice_line_items RENAME COLUMN address_receiver_line1 TO address_receiver_line_1;
ALTER TABLE invoice_line_items RENAME COLUMN address_receiver_line2 TO address_receiver_line_2;

-- locations (2 renames)
ALTER TABLE locations RENAME COLUMN address_line1 TO address_line_1;
ALTER TABLE locations RENAME COLUMN address_line2 TO address_line_2;

-- Verification NOTICE
DO $$
DECLARE
  ili_renamed INT;
  loc_renamed INT;
BEGIN
  SELECT COUNT(*) INTO ili_renamed
    FROM information_schema.columns
    WHERE table_name = 'invoice_line_items'
      AND column_name IN (
        'address_sender_postal_code', 'address_receiver_postal_code',
        'address_sender_line_1', 'address_sender_line_2',
        'address_receiver_line_1', 'address_receiver_line_2'
      );
  SELECT COUNT(*) INTO loc_renamed
    FROM information_schema.columns
    WHERE table_name = 'locations'
      AND column_name IN ('address_line_1', 'address_line_2');
  RAISE NOTICE 'v1.7.0: invoice_line_items new columns present: %/6, locations new columns present: %/2',
    ili_renamed, loc_renamed;
  IF ili_renamed <> 6 OR loc_renamed <> 2 THEN
    RAISE EXCEPTION 'Rename verification failed — expected 6 + 2 new column names';
  END IF;
END $$;

COMMIT;
```

**Pre-flight verification queries** (Claude Code runs these and reports before the migration):

```sql
-- Q1: Confirm legacy column names exist
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
    'address_sender_zip', 'address_receiver_zip',
    'address_sender_line1', 'address_sender_line2',
    'address_receiver_line1', 'address_receiver_line2',
    'address_line1', 'address_line2'
  )
ORDER BY table_name, column_name;
-- Expected: 8 rows (6 from invoice_line_items, 2 from locations)

-- Q2: Row counts before rename (so we can verify no data loss)
SELECT
  (SELECT COUNT(*) FROM invoice_line_items) AS ili_rows,
  (SELECT COUNT(*) FROM locations) AS loc_rows;
-- Expected: ili_rows >= 950 (the Session A test data); loc_rows = 22
```

**Post-migration verification queries** (Claude Code runs these and reports):

```sql
-- Q3: Confirm new column names exist
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
    'address_sender_postal_code', 'address_receiver_postal_code',
    'address_sender_line_1', 'address_sender_line_2',
    'address_receiver_line_1', 'address_receiver_line_2',
    'address_line_1', 'address_line_2'
  )
ORDER BY table_name, column_name;
-- Expected: 8 rows

-- Q4: Confirm legacy names are gone
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
    'address_sender_zip', 'address_receiver_zip',
    'address_sender_line1', 'address_sender_line2',
    'address_receiver_line1', 'address_receiver_line2',
    'address_line1', 'address_line2'
  );
-- Expected: 0 rows

-- Q5: Row counts unchanged
SELECT
  (SELECT COUNT(*) FROM invoice_line_items) AS ili_rows,
  (SELECT COUNT(*) FROM locations) AS loc_rows;
-- Expected: same as Q2

-- Q6: Data preserved — spot-check a few rows
SELECT tracking_number, address_sender_line_1, address_sender_postal_code
FROM invoice_line_items
WHERE address_sender_line_1 IS NOT NULL
LIMIT 3;
-- Expected: values populated as before

SELECT name, address_line_1, postal_code
FROM locations
LIMIT 5;
-- Expected: values populated as before
```

---

## CODE CHANGES

### Change 1 — Create shared address normalization helper

Create `src/alamo/lib/address.ts`:

```typescript
/**
 * Normalizes a street address into a canonical uppercase string suitable
 * for matching one address against another. Used by:
 * - Parser (parse/page.tsx): writes invoice_line_items.address_sender_normalized
 *   when ingesting UPS detail invoices
 * - Location form (orgs/[id]/locations/new/page.tsx): writes
 *   locations.normalized_address when an admin creates a new location
 *
 * These two writers MUST use this same helper so the matching logic
 * (invoice_line_items.address_sender_normalized = locations.normalized_address
 * for dark-account org identification) works reliably.
 *
 * Design choices:
 * - Includes line_2. UPS detail invoices include both address line 1 and line 2.
 *   Without line_2, different shipments from the same building (different
 *   suites) would collide. Including line_2 keeps them distinct.
 * - Uppercases the entire result. Case-insensitive matching is the
 *   established convention.
 * - Joins fields with ", " (comma-space). Matches the existing format
 *   of invoice_line_items.address_sender_normalized in production.
 * - Filters falsy values (null, empty string) before joining, so a
 *   missing line_2 doesn't produce trailing ", ".
 * - Returns null if every field is falsy, so downstream code can
 *   distinguish "no address" from "empty string address".
 */
export function normalizeAddress(parts: {
  line_1?: string | null
  line_2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}): string | null {
  const joined = [
    parts.line_1,
    parts.line_2,
    parts.city,
    parts.state,
    parts.postal_code,
    parts.country,
  ]
    .filter(Boolean)
    .join(', ')
    .toUpperCase()
  return joined || null
}
```

**Commit as a standalone first commit before touching anything else.** Makes rollback easy if the helper has a bug.

### Change 2 — Update parser to use the helper + include line_2

File: `src/alamo/app/invoices/[id]/parse/page.tsx`

Find the `insertRows` construction (around line 553). Current:

```typescript
address_sender_normalized: [
  item.address_sender_line1,
  item.address_sender_city,
  item.address_sender_state,
  item.address_sender_zip,
  item.address_sender_country,
].filter(Boolean).join(', ').toUpperCase() || null,
```

Replace with:

```typescript
address_sender_normalized: normalizeAddress({
  line_1: item.address_sender_line_1,
  line_2: item.address_sender_line_2,
  city: item.address_sender_city,
  state: item.address_sender_state,
  postal_code: item.address_sender_postal_code,
  country: item.address_sender_country,
}),
```

Also update the field names in the same INSERT object:
- `address_sender_line1` → `address_sender_line_1`
- `address_sender_line2` → `address_sender_line_2`
- `address_sender_zip` → `address_sender_postal_code`
- `address_receiver_line1` → `address_receiver_line_1`
- `address_receiver_line2` → `address_receiver_line_2`
- `address_receiver_zip` → `address_receiver_postal_code`

Add the import at the top:
```typescript
import { normalizeAddress } from '@/alamo/lib/address'
```

(Or whatever import alias is configured — check tsconfig.)

### Change 3 — Update location form to populate normalized_address

File: `src/alamo/app/orgs/[id]/locations/new/page.tsx`

The form action reads `address_line1`, `address_line2`, etc. from FormData. Change variable names to match new schema (`address_line_1`, `address_line_2`). Add normalization step before INSERT:

```typescript
// Normalize for dark-matching
const normalized = normalizeAddress({
  line_1: address_line_1,
  line_2: address_line_2,
  city,
  state,
  postal_code,
  country,
})

const { error } = await supabase
  .from('locations')
  .insert({
    org_id: id,
    name,
    location_type,
    address_line_1,
    address_line_2,
    city,
    state,
    postal_code,
    country,
    is_billing_address,
    normalized_address: normalized,
  })
```

Add the import at the top.

### Change 4 — Update CSV generator

File: `src/alamo/app/billing/[id]/actions/csv.ts`

Lines 573-578 (approximately) reference the old column names in the SELECT query:

```typescript
address_sender_line1, address_sender_line2,
address_sender_city, address_sender_state,
address_sender_zip, address_sender_country,
address_receiver_line1, address_receiver_line2,
address_receiver_city, address_receiver_state,
address_receiver_zip, address_receiver_country,
```

Update to:

```typescript
address_sender_line_1, address_sender_line_2,
address_sender_city, address_sender_state,
address_sender_postal_code, address_sender_country,
address_receiver_line_1, address_receiver_line_2,
address_receiver_city, address_receiver_state,
address_receiver_postal_code, address_receiver_country,
```

Find any downstream code in the same file that reads these fields from the query result and rename variable references accordingly.

### Change 5 — Update PDF generator

File: `src/alamo/app/billing/[id]/actions/pdf.ts`

Lines 109-114 (approximately) reference `locations.address_line1`, `address_line2`:

```typescript
address_line1,
address_line2,
city,
state,
postal_code,
is_billing_address
```

Update to:

```typescript
address_line_1,
address_line_2,
city,
state,
postal_code,
is_billing_address
```

Rename downstream variable references accordingly.

### Change 6 — Update any other references

Search for all remaining legacy names:

```bash
grep -rn -E "(address_sender_zip|address_receiver_zip|address_sender_line1|address_sender_line2|address_receiver_line1|address_receiver_line2|address_line1(?!_)|address_line2(?!_))" --include="*.ts" --include="*.tsx" src/
```

Expected file hits to update (exhaustive list — verify against grep):
- `parse/page.tsx` (Change 2)
- `locations/new/page.tsx` (Change 3)
- `csv.ts` (Change 4)
- `pdf.ts` (Change 5)
- Possibly disputes/page.tsx, review/page.tsx, or other pages if they SELECT these fields
- Seed data files (if they INSERT with these column names)
- Verify-data SQL files

Update each file. Run grep again after updates to confirm zero hits.

### Change 7 — Backfill Utah Test location's normalized_address

Once the code changes compile cleanly, backfill the one row missing `normalized_address`:

```sql
UPDATE locations
SET normalized_address = UPPER(CONCAT_WS(', ',
  address_line_1, address_line_2, city, state, postal_code, country
))
WHERE id = '429a0963-a966-4f93-9a9e-629f8944584d';
```

Verify after:

```sql
SELECT id, name, address_line_1, normalized_address
FROM locations
WHERE normalized_address IS NULL;
-- Expected: 0 rows
```

### Change 8 — Backfill existing invoice_line_items.address_sender_normalized to include line_2

Since we're now including line_2 in normalization, existing invoice_line_items rows have `address_sender_normalized` WITHOUT line_2. For existing data, this mostly doesn't matter (matches already ran), but for consistency and future admin queries, backfill:

```sql
UPDATE invoice_line_items
SET address_sender_normalized = UPPER(CONCAT_WS(', ',
  NULLIF(address_sender_line_1, ''),
  NULLIF(address_sender_line_2, ''),
  NULLIF(address_sender_city, ''),
  NULLIF(address_sender_state, ''),
  NULLIF(address_sender_postal_code, ''),
  NULLIF(address_sender_country, '')
))
WHERE address_sender_line_1 IS NOT NULL
   OR address_sender_city IS NOT NULL;
```

Verification:

```sql
SELECT COUNT(*) AS with_normalized,
       COUNT(*) FILTER (WHERE address_sender_line_2 IS NOT NULL) AS has_line_2
FROM invoice_line_items
WHERE address_sender_normalized IS NOT NULL;
```

(Purely informational — spot-check that rows with line_2 now include it in normalization.)

### Change 9 — Update seed-data.sql and verify-data.sql

Any reference to `zip` or `line1`/`line2` in seed files must be renamed. Grep:

```bash
grep -rn -E "(address_sender_zip|address_receiver_zip|address_sender_line1|address_sender_line2|address_receiver_line1|address_receiver_line2|address_line1(?!_)|address_line2(?!_))" --include="*.sql" database/
```

Update each file found.

---

## PHASE STRUCTURE — SEQUENCE OF COMMITS

Recommended commit sequence:

1. **Commit 1**: Create `src/alamo/lib/address.ts` — the shared helper
2. **Commit 2**: Apply migration v1.7.0 (renames 8 columns)
3. **Commit 3**: Update parser (`parse/page.tsx`) — field names + use helper + include line_2
4. **Commit 4**: Update location form (`locations/new/page.tsx`) — field names + use helper + populate normalized_address
5. **Commit 5**: Update CSV generator (`csv.ts`) — field names in SELECT
6. **Commit 6**: Update PDF generator (`pdf.ts`) — field names in SELECT
7. **Commit 7**: Update all remaining references found by grep
8. **Commit 8**: Update seed-data.sql and verify-data.sql
9. **Commit 9**: Apply backfill SQL (Utah Test location + optional invoice_line_items re-normalization)
10. **Commit 10**: Session C.1 summary doc

Ordering rationale: helper first so it exists before parser uses it. Migration before parser update so the parser's new code references real columns. Form update before CSV update since form changes unblock writes while CSV only affects reads. Backfill last because it depends on all other code being correct.

Each commit is independently reviewable.

---

## HALT POINTS

Stop and report rather than proceed if:

1. **Pre-flight verification shows unexpected state.** E.g., Q1 returns fewer than 8 legacy columns (some already renamed in an earlier session?), or row counts are lower than expected.

2. **Grep in Change 6 reveals files NOT in the expected list.** Specifically, if there are references to the old column names in components, lib helpers, or test files that aren't accounted for — report the full list before updating. Don't assume the fix is mechanical.

3. **The migration's verification NOTICE fails.** The `DO $$ ... RAISE EXCEPTION IF ... $$` block is a safeguard. If it fails, the migration rolls back and Claude Code should report rather than retry.

4. **TypeScript baseline grows by more than 20 errors.** Current baseline is ~1640. Some error growth is expected (the renames will cause transient Supabase type-inference errors until types are regenerated). But a large jump suggests the renames missed a reference. Cap acceptable variance at +20.

5. **Any existing SQL function, trigger, or view references the old column names.** If the schema has functions, triggers, or views (check `information_schema.routines` and `information_schema.triggers`) that reference `address_line1`, `zip`, etc., those need updates too. Might require additional migration steps.

---

## ACCEPTANCE CRITERIA

After Claude Code completes:

1. ✅ All 8 columns renamed in schema (verify with information_schema query)
2. ✅ Zero references to old names in application code (verify with grep)
3. ✅ Parser `insertRows` uses `normalizeAddress()` helper and includes line_2
4. ✅ Location form uses `normalizeAddress()` helper and sets `normalized_address` on INSERT
5. ✅ All 22 locations have `normalized_address` populated (verify with COUNT SQL)
6. ✅ CSV generator reads new column names
7. ✅ PDF generator reads new column names (from locations table)
8. ✅ Seed-data.sql and verify-data.sql reference new names
9. ✅ TypeScript baseline holds (~1640 errors ± 20)
10. ✅ No uncommitted changes after the 10-commit sequence

---

## SESSION C.1 SUMMARY DOC

Create `SESSION-C.1-SUMMARY.md` at repo root documenting:

- Migration applied (v1.7.0)
- 8 columns renamed
- Shared helper created
- Parser updated (line_2 now included in normalization — behavior change)
- Location form bug fixed (normalized_address now populated on INSERT)
- Files modified (exhaustive list)
- SQL backfills applied
- Any halts encountered

---

## MERGE INSTRUCTIONS (for Sawyer, when Claude Code reports complete)

1. Review each commit diff in order
2. Pull down the Claude Code branch and inspect changes in Cursor
3. Apply the migration in Supabase (run v1.7.0 file in SQL Editor)
4. Run the backfill SQL
5. Regenerate Supabase types (if CLI installed by then — else skip, type errors are cosmetic)
6. `npm run dev` — verify dev server starts without errors
7. Test: navigate to `/orgs/[some-org-id]/locations/new`, create a new test location, verify it has populated `normalized_address` by querying the DB
8. Merge to main via `--no-ff`
9. Push to origin

---

## POST-MERGE FOLLOW-UPS

Update briefing via Cowork:
- Mark Section 12 item #1 (Schema audit) as COMPLETE (already done for audit, add C.1 completion)
- Mark Section 12 item #2 (Schema naming cleanup) as COMPLETE
- Add Session C.1 entry to "Completed and verified"
- Update `docs/schema-code-audit-checklist.md` with audit completion entry
