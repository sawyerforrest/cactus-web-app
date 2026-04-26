# SESSION B.1b SPEC — FIX CSV 11-ROW GAP (DN-5)

**Branch:** New `claude/*` worktree, based on current main (commit `e79c062` or later)
**Prerequisites:** Session B + B.1 merged to main
**Estimated duration:** 30-60 minutes
**Risk level:** Low — isolated bug, one file to investigate, clear success criterion

---

## THE BUG (ONE PARAGRAPH)

The Session B 85-column client CSV generator renders 939 data rows for carrier invoice `904d933a-daa1-4006-acf9-c3983547f679`. The database has 950 `invoice_line_items` rows for that invoice. All 950 rows have `billing_status = 'INVOICED'`, populated `cactus_invoice_id`, and matching entries in the `cactus_invoice_line_items` junction. Yet the CSV generator silently excludes 11 rows. This would cause a real client to be under-billed by ~$214 (11 shipments × ~$19.44 average) and would undermine trust in the invoicing system. The bug is somewhere inside `src/alamo/app/billing/[id]/actions/csv.ts` or its query logic.

Tracked in the master briefing as DN-5 in Section 12a.

---

## WHAT WE ALREADY KNOW (DON'T RE-DIAGNOSE THESE)

Diagnostic SQL was run against the live test Supabase on 2026-04-21. Results:

**1. Row counts in the database**
```
SELECT COUNT(*) FROM invoice_line_items
WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679';
-- Returns: 950
```

**2. All 950 are INVOICED and have populated cactus_invoice_id**
```
SELECT COUNT(*) AS total,
       COUNT(tracking_number) AS with_tracking,
       COUNT(DISTINCT tracking_number) AS distinct_tracking,
       COUNT(*) FILTER (WHERE org_id IS NULL) AS null_org,
       COUNT(*) FILTER (WHERE carrier_charge IS NULL) AS null_carrier_charge
FROM invoice_line_items
WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679';
-- Returns: 950, 950, 950, 0, 0
```

**3. Zero rows missing from the junction**
```
SELECT COUNT(*) AS total_lines,
       COUNT(*) FILTER (WHERE cj.invoice_line_item_id IS NULL) AS missing_from_junction
FROM invoice_line_items ili
LEFT JOIN cactus_invoice_line_items cj ON ili.id = cj.invoice_line_item_id
WHERE ili.carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679';
-- Returns: 950 total, 0 missing_from_junction
```

**4. Adjustment-only rows are NOT the filter**
- 8 rows have `is_adjustment_only = TRUE`
- All 8 ARE present in the CSV output (verified by text search of the rendered file)

**5. CSV row count confirmed**
The rendered CSV file has:
- 1 header row
- 939 data rows (unique tracking numbers)
- 1 footnote row (text: "Shipment Total... is authoritative...")
- Total 941 physical rows, 939 data rows

So the gap is exactly **11 rows**. Deterministic. Reproducible.

---

## WHAT TO INVESTIGATE

The bug lives in the CSV generation path. Start here:

### Step 1 — Read csv.ts end to end

```bash
cd src/alamo
cat app/billing/[id]/actions/csv.ts
```

Read the entire file. Do NOT skim. The bug is almost certainly in the SELECT query or a downstream filter.

### Step 2 — Read the supporting lib files

```bash
cat lib/csv/column-spec.ts
cat lib/csv/transforms.ts
cat lib/csv/format.ts
cat lib/csv/writer.ts
```

### Step 3 — Identify the filter

Look specifically for:

**Hypothesis A — Implicit PostgREST row limit.** Supabase's default row limit per query is 1000. That's > 950, so shouldn't be the cause. BUT: if the query has a join that fans out (e.g. joining line items to shipment_events where some line items have many events), the PostgREST result set could include duplicate rows that get deduplicated in memory. Check for `.select('... shipment_events (...)')` or similar fanning joins.

**Hypothesis B — Explicit `.limit()` call.** Search for `.limit(` in csv.ts. If there's a limit set to, say, 939 or some other non-obvious number, that's the bug. (939 would be oddly specific; could be a PostgREST page size the author forgot to paginate.)

**Hypothesis C — A WHERE clause excluding some status combination.** Look for `.eq('match_status', ...)`, `.in('billing_status', [...])`, etc. The generator might filter by a specific combination that excludes some edge case of the 950 rows.

**Hypothesis D — A JOIN condition losing rows.** Look for `!inner` joins in the Supabase select syntax. An inner join on a related table would drop rows missing the join target.

**Hypothesis E — Pagination missing.** PostgREST paginates at 1000 rows by default but the codebase may be configured differently. Check `supabase` client initialization for any range/pagination defaults. If there's a `.range(0, 938)` anywhere, that explains 939 rows exactly.

Once you form a hypothesis, VERIFY IT before writing a fix. Add a `console.log` or a test query. Don't guess.

### Step 4 — Identify the specific 11 missing tracking numbers

Once you've narrowed the hypothesis, run a test to capture which 11 tracking numbers are being dropped. This helps verify the fix:

```typescript
// Add temporarily to csv.ts
const allIds = new Set(dbRows.map(r => r.tracking_number));
const renderedIds = new Set(outputRows.map(r => r[0].replace('\t', '')));
const missing = [...allIds].filter(id => !renderedIds.has(id));
console.log('Missing tracking numbers:', missing);
console.log('Count:', missing.length);
```

The output will identify the 11 tracking numbers. Look at them in the database — do they share a common attribute that's being filtered out? That attribute IS the bug.

### Step 5 — Fix the root cause

Once identified, fix the filter. Remove the offending limit, change the inner join to left join, or whatever the specific cause is. Do NOT paper over by adding a higher limit — fix the actual filter.

### Step 6 — Verify

Regenerate the CSV:

```typescript
// Run via your preferred local testing approach
const csv = await generateCactusInvoiceCsv('248dc801-824f-4974-b155-01a7ef699510');
// Count lines
const lines = csv.split('\r\n').filter(l => l.trim());
console.log('Total lines:', lines.length);
// Expected: 952 = 1 header + 950 data + 1 footnote
```

Or regenerate the CSV via the Alamo Download CSV button, save to disk, count rows. Expected: 952 physical rows (1 header + 950 data + 1 footnote).

---

## ACCEPTANCE CRITERIA

1. CSV for Cactus 3PL HQ invoice (`cactus_invoice_id = 248dc801-824f-4974-b155-01a7ef699510`) contains exactly 950 data rows (951 or 952 physical rows depending on whether footnote is counted). Not 939. Not 960. 950.
2. TypeScript baseline holds (~1640 errors, matching post-Session-B.1 baseline). Acceptable variance: ±5 errors.
3. Pineridge CSV still renders correctly (15 data rows). Verify the fix didn't break the flat-markup path.
4. The root cause is actually identified and fixed — not worked-around by, e.g., raising a limit without understanding why.
5. Commit message clearly explains the bug and the fix.

---

## COMMIT

Single commit on the branch:

```
git add <modified files>
git commit -m "Session B.1b: fix CSV 11-row gap (DN-5)

Root cause: [your one-sentence diagnosis]

The Session B CSV generator was silently excluding 11 of 950
invoice_line_items rows from the client-facing output. This would
cause real clients to be under-billed. Affected any carrier invoice
with > [threshold] rows / [other attribute].

Fixed by [one-sentence fix description]."
```

---

## MERGE INSTRUCTIONS (for Sawyer)

After Claude Code reports completion:

1. Review the commit — read the diff, understand what changed
2. Pull locally or inspect via GitHub
3. Merge to main via `--no-ff` merge (preserves B.1b as a distinct unit in history)
4. Push to origin
5. Open the Alamo, navigate to `/billing/248dc801-824f-4974-b155-01a7ef699510`
6. Click Download CSV
7. Open the downloaded file, verify 950 data rows present
8. Spot-check: did any of the 11 previously-missing tracking numbers now appear?

If all checks pass, Session B.1b is complete. DN-5 can be marked RESOLVED in the briefing.

---

## DECISIONS NEEDED (HALT POINTS)

Halt and report rather than proceed if you encounter:

1. **The root cause appears to be in a part of the pipeline OUTSIDE csv.ts** — e.g., the junction table is missing rows despite our verification, or some upstream write is silently skipping rows. That's a bigger bug with wider implications.

2. **The 11 "missing" rows have a common attribute that suggests deliberate exclusion** — e.g., they're all in FLAGGED/HELD status that the generator intentionally skips, OR they have `is_adjustment_only = TRUE` but the prior diagnostic said adjustment-only rows ARE included. This would mean the diagnostic was wrong somewhere.

3. **Fixing the filter causes a different count than 950** — e.g., you remove a `.limit()` and get 1200 rows instead of 950. That means there's data duplication from a fanning join that also needs handling.

In any of these cases, STOP, document findings, commit what's done, and report back to Sawyer.

---

## CONTEXT LINKS

- Master briefing: `cactus-master-briefing.md` (Section 12a has DN-5)
- Schema audit checklist: `docs/schema-code-audit-checklist.md`
- Original 85-column spec: in `cactus-session-b-spec.md` Phase 5 (see archives)
- Session B completion summary: `SESSION-B-SUMMARY.md` at repo root
