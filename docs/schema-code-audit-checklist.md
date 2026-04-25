# SCHEMA-VS-CODE AUDIT CHECKLIST

**Purpose:** Detect schema-vs-code mismatches before they cause silent failures in production.

**Background:** During Session B (2026-04-20) we discovered every `audit_logs` INSERT in the codebase had been silently failing since the codebase was scaffolded. The code used `action:` and `details:` but the actual schema columns are `action_type` and `metadata`. PostgREST/Supabase accept INSERTs with unknown column names without raising an error — they "succeed" but write nothing useful. Verified empirically: 0 rows in `audit_logs` despite many Match runs that should have generated entries.

This checklist exists so that pattern doesn't lurk elsewhere undetected.

---

## When to run this audit

**Comprehensive sweep:** Run the full checklist BEFORE starting Stage 6 (Rate Engine) work, ideally right after Session B merges to main. Goal is a clean schema baseline before more code is written that could compound the problem.

**Lightweight check:** Run the "fast path" (steps 1-3 below) at the start of every major Claude Code session that touches database operations. Catches drift early.

**After major migrations:** Re-run the full checklist after any v1.x.0 schema migration to catch code that wasn't updated to match.

---

## Diagnostic lesson: foreign-key partitioning

**When row counts differ between database and output, check foreign-key
partitioning BEFORE concluding there's a filter bug.**

Example: On 2026-04-23, the team investigated a suspected "CSV 11-row
gap" where a carrier invoice had 950 line items in the database but
the client CSV showed only 939. Three rounds of SQL diagnostics ran
against `carrier_invoice_id` assuming the "missing" rows were being
filtered out somewhere. The actual explanation: the 11 rows belonged
to a DIFFERENT client's cactus_invoice (same wholesale carrier invoice,
different client org). The CSV generator was correctly filtering by
`cactus_invoice_id` to partition wholesale bills into per-client
invoices — correct multi-org billing behavior.

**The diagnostic rule that would have caught this faster:**

For any one-to-many relationship (carrier_invoice → cactus_invoice,
org → location, user → session), when row counts differ between source
and output:

1. First check if the output is filtering by the *child* foreign key
   (e.g., `cactus_invoice_id`) while the source query is grouping by
   the *parent* (e.g., `carrier_invoice_id`)
2. If yes, the "missing" rows are probably correctly partitioned to
   other children — query `SELECT child_fk, COUNT(*) FROM junction
   GROUP BY child_fk` to confirm
3. Only after ruling out partitioning should you assume a filter bug

**Applies to:** Any table with a one-to-many or many-to-many
relationship where the output is scoped to one side of the relationship.

---

## Fast path (5-10 minutes — run before every major session)

### Step 1 — Inventory every table the code touches

```bash
cd "<repo root>"
grep -rEn "from\(['\"][a-z_]+['\"]\)" --include="*.ts" --include="*.tsx" src/ | \
  grep -oE "from\(['\"][a-z_]+['\"]\)" | sort -u
```

This lists every Supabase table referenced in the codebase. Eyeball the list — does anything look surprising (typos, deprecated tables, etc.)?

### Step 2 — Inventory every INSERT/UPDATE field used in code

For each table from Step 1, find every INSERT and UPDATE that touches it:

```bash
TABLE="audit_logs"  # change this for each table
grep -rn -A 20 "from('${TABLE}')\.\(insert\|update\)" --include="*.ts" --include="*.tsx" src/
```

Note all the field names being used. Compare against the actual schema (Step 3).

### Step 3 — Diff against actual schema

In Supabase SQL Editor:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

Save the output. Cross-reference against the field names found in Step 2. Any code-side field that doesn't appear in the schema is a silent-failure risk.

---

## Comprehensive sweep (60-90 minutes — run before major milestones)

### Step 1 — Generate definitive table-by-table schema reference

```sql
-- Run in Supabase SQL Editor; save as docs/schema-snapshot-YYYY-MM-DD.md
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

This is the source of truth. Every code-side INSERT/UPDATE field name must match a row in this output.

### Step 2 — Build a code-side field inventory

For each of the 19 tables in the briefing's Section 10:

```bash
# For each table, capture all field names used in INSERT and UPDATE calls
TABLES=(
  organizations org_users locations org_carrier_accounts rate_cards
  meters meter_transactions carrier_invoice_mappings shipment_ledger
  carrier_invoices invoice_line_items cactus_invoices
  cactus_invoice_line_items rate_shop_log shipment_events audit_logs
  carrier_invoice_formats carrier_charge_routing notification_preferences
)

for TABLE in "${TABLES[@]}"; do
  echo "=== ${TABLE} ==="
  grep -rEn -A 30 "from\(['\"]${TABLE}['\"]\)\.\(insert|update|upsert\)" \
    --include="*.ts" --include="*.tsx" src/ \
    | grep -E "^\s+[a-z_]+:" \
    | grep -oE "[a-z_]+:" \
    | sort -u
  echo ""
done > /tmp/code-field-inventory.txt
```

(That's a one-shot inventory. The grep is loose — it'll catch some non-field-name `key:` patterns from nested objects. Eyeball the output for false positives.)

### Step 3 — Cross-reference each table

For each table:

1. Get the schema columns from Step 1
2. Get the code-side field names from Step 2
3. Find the diff:
   - Code fields NOT in schema → silent-failure bug (like the audit_logs case)
   - Schema columns NEVER referenced in code → maybe-unused, worth investigating
   - Field name mismatches in either direction → bug

### Step 4 — Investigate every silent-failure candidate

For each suspect:

1. Read the actual INSERT/UPDATE code in context
2. Check whether the field is actually being passed (vs. just a key in a nested config object)
3. If a real bug: query the table for evidence (`SELECT COUNT(*) FROM <table> WHERE <suspect_column> IS NOT NULL`) — if the count is suspiciously low compared to expected, the silent failure is confirmed
4. Add to a fix list

### Step 5 — Bundle fixes into a remediation session

Write a small Claude Code spec (similar pattern to the audit_logs fix in Session B.1) that mechanically applies all the fixes in one branch, with a single commit per logical group.

### Step 6 — Add safeguard for the future

Consider adding one of:

**Option A — Explicit type validation at write time.** Wrap Supabase calls in a small helper that validates the payload shape against the generated TypeScript types before sending. Adds boilerplate but catches drift at compile time.

**Option B — Read-after-write sanity checks in critical paths.** For audit_logs specifically (and other write-and-walk-away tables), add a simple `SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '1 day'` health check that runs periodically and alerts if it returns 0.

**Option C — Stricter Supabase client configuration.** Investigate whether PostgREST has a "strict mode" that rejects unknown columns. (As of 2026-04-20, behavior is permissive by default. Worth checking if a configuration change is available.)

---

## Tables most at risk for silent failures

Based on the audit_logs precedent, these tables share the "write-and-forget" pattern that makes silent failures hard to detect:

- `audit_logs` — already discovered broken, fixed in Session B.1
- `shipment_events` — append-only event log, read mostly by future analytics

**Prioritize these in the next sweep.**

Tables previously flagged as high-risk that are ACTUALLY inert (never touched
by code): rate_shop_log, meter_transactions, notification_preferences.
These can't have silent failures since no code writes to them. The different
risk for these tables is that their intended capabilities (Shadow Ledger,
USPS wallet, notifications) are not yet exercised — that's a product gap,
not a data-integrity risk.

Tables LESS at risk because failures would be visible in normal operation:

- `invoice_line_items` — every billing flow reads from here
- `carrier_invoices` — admin UI reads constantly
- `org_carrier_accounts` — read on every Match and Billing Calc
- `organizations` — read on every Cactus Portal page load

---

## History of audits

| Date | Auditor | Scope | Findings |
|---|---|---|---|
| 2026-04-20 | Sawyer + Claude (Session B review) | audit_logs only | `action:` should be `action_type:`, `details:` should be `metadata:`. Fixed in Session B.1 across 5 INSERT call sites. |
| (next entry: comprehensive sweep before Stage 6) | | | |
| 2026-04-23 | Sawyer + Claude (DN-5 investigation) | CSV generator filter logic | NOT A BUG — row count gap was correct multi-org partitioning. Diagnostic lesson about foreign-key partitioning added above. |
| 2026-04-23 (late) | Sawyer + Claude (full-time kickoff) | Full 19-table comprehensive sweep | ZERO silent failures found. All critical-path writes clean (6 tables, 31 writes). All low-priority writes clean (4 tables, 4 writes). 5 tables legitimately unused (Phase 2/3 scope). Confirmed schema naming inconsistency between locations (clean) and invoice_line_items (prefixed) — addressed by Session C.1. Surfaced 3 new pre-onboarding follow-ups tracked as DN-6 (locations.normalized_address bug), DN-7 (parser line_2 omission), DN-8 (flat-markup form field missing). |

Add an entry every time you run this checklist.

---

## Audit closures log

2026-04-25 — Session C.1 closed three audit findings:
  - 8 schema column renames executed (zip → postal_code, line1/2 → line_1/2)
  - DN-6 RESOLVED: locations form normalized_address bug
  - DN-7 RESOLVED: parser line_2 normalization gap
Worktree-based execution + dry-run pre-flight pattern proved out — surfaced
3 unanticipated files and 1 stale index that the original spec missed.
Pattern recommended for future MEDIUM-HIGH risk sessions.
