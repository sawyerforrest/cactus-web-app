# PATTERNS.md Addendum — Pattern 5: Live-query reference data lists

**Target file:** `cactus-web-app/database/migrations/PATTERNS.md`
**Edit type:** Append a new pattern + update document history footer
**Trigger:** Surfaced during sub-phase 2b when v1.10.0-019 split `EWR_JFK` into `EWR` + `JFK` enum values. The Reference Data index page's "GOFO Hubs" row description showed `8 hubs` (queried live) but listed `LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC` (hardcoded string) — the count updated automatically while the list went stale silently. Mismatch caught on visual inspection three commits later.

---

## What to do

This addendum has two surgical edits. The first inserts a new "Pattern 5" section between the existing Pattern 4 and the "How to add a new pattern to this doc" section. The second updates the document history footer to record the change.

---

## Edit 1 — Insert Pattern 5 section

**Find** (the boundary between Pattern 4 and the section that follows):

```
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

## How to add a new pattern to this doc
```

**Replace with** (preserves Pattern 4 exactly, adds Pattern 5 between, leaves the section header following):

```
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

## Pattern 5: Reference data lists should be queried live, not hardcoded

**Rule:** When the UI displays a list derived from a reference table (e.g., "all GOFO hubs," "all DHL fuel tiers," "all serviceable carriers"), query the table at render time rather than encoding the list as a string constant. Counts and contents must come from the same source — both queried live, or neither.

**Why:** When a migration changes a reference table — splits an enum value, adds a new row, deprecates an old one, renames a code — hardcoded UI strings go stale silently. Counts usually update automatically because they come from `SELECT count(*)`. Hardcoded lists do not. Result: the UI displays "N items" but shows N-1 or N+1 of them, and the inconsistency only gets caught on visual inspection.

This failure mode is silent in two ways: there's no error thrown, and the count looks right by itself. You only spot it by reading the surrounding text and noticing the mismatch.

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

**Migration author's responsibility:** When authoring a migration that changes a reference data set (adds/removes/splits/renames rows, modifies an enum), grep the codebase for hardcoded references to the values being changed:

```bash
grep -rn "EWR_JFK" src/ docs/ --include="*.ts" --include="*.tsx" --include="*.md"
```

Update any UI text that hardcodes the list. Better still: refactor that UI text to query the table live, eliminating the possibility of recurrence. Each migration that follows Pattern 5 leaves the codebase one step closer to fully-live reference data displays.

**Example failure mode:** v1.10.0-019 split `EWR_JFK` into `EWR` + `JFK`. The Reference Data index page's GOFO Hubs row updated its count automatically (`8 hubs`) because the count was a live query. The hub-code list stayed at the original 7-code hardcoded string including the obsolete `EWR_JFK`. Result: visible inconsistency — 8 hubs with 7 listed. Caught on visual inspection. Fixed by refactoring to a live query (the "Right" example above).

**Doesn't apply to:** content that is genuinely a constant (e.g., the literal text of master briefing rules, copyright notices, fixed brand strings). The rule is specifically about lists derived from database tables. If the data lives in a table, the UI should read from that table.

---

## How to add a new pattern to this doc
```

---

## Edit 2 — Update document history footer

**Find** (at the very bottom of the file):

```
## Document history

- **2026-05-05 (v1.10.0):** Initial creation. Captures patterns 1-4 from Phase 1 + Phase 2 build.
```

**Replace with:**

```
## Document history

- **2026-05-05 (v1.10.0):** Initial creation. Captures patterns 1-4 from Phase 1 + Phase 2 build.
- **2026-05-05 (v1.10.0):** Added Pattern 5 (Live-query reference data lists). Surfaced during sub-phase 2b after v1.10.0-019 hub split exposed a stale hardcoded list on the Reference Data index page.
```

---

## End-of-edit verification checklist

After applying both edits, verify:

- [ ] PATTERNS.md now lists 5 patterns (was 4)
- [ ] Pattern 5 appears between Pattern 4 and the "How to add a new pattern to this doc" section
- [ ] Pattern 5 contains: Rule / Why / How (with both Wrong and Right code examples) / Migration author's responsibility / Example failure mode / Doesn't apply to
- [ ] Document history footer has 2 entries (was 1)
- [ ] No other text changed
- [ ] File is committed in both the main repo and the worktree per the existing PATTERNS.md placement

---

## Notes for whoever applies this

- This is a documentation-only edit. No schema impact. No migration needed.
- Apply to the canonical copy at `database/migrations/PATTERNS.md` in both the main repo working tree AND the worktree (`.claude/worktrees/youthful-carson-41b709/database/migrations/PATTERNS.md`). The worktree copy was added in commit 84c878b; this addendum updates both.
- Optionally, the "alamo: dynamic hub list on Reference Data index + EWR/JFK split cleanup" commit (the fix surfaced earlier) can include this Pattern 5 update in the same commit, since they're conceptually the same lesson learned.

---

End of addendum.
