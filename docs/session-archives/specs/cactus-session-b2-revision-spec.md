# SESSION B.2 SPEC — CLIENT INVOICE CSV REVISION + HUMAN-READABLE INVOICE NUMBERS

**Branch:** New `claude/*` worktree, based on current main
**Prerequisites:** Session B + B.1 merged to main (commit sha `5084fc1` or later)
**Estimated duration:** 3-4 hours
**Risk level:** Medium — touches schema, parser, CSV generator, and invoice numbering. Financial-critical paths involved.

---

## CONTEXT

Sawyer reviewed the Session B 85-column client-facing CSV on 2026-04-21 and identified multiple items requiring revision before the CSV is ready to send to real clients. This spec bundles the revisions plus two new features (human-readable invoice numbers, weight restructure) that were surfaced by the review.

This is NOT part of the pre-Stage 6 cleanup pass that was already documented in the briefing (schema audit, naming cleanup, dark-path fix, Supabase CLI, Alamo flat-markup display). That cleanup pass is still the right first move. This session happens AFTER that cleanup — the CSV revision is lower-urgency but higher-scope.

Suggested ordering: do the pre-Stage 6 cleanup session first, then this CSV revision session, then Stage 6 Rate Engine. However, items 1 (date format) and 3 (remove carrier-cost columns) are small enough to bundle into the cleanup session if convenient.

---

## GROUND RULES

1. **Read the actual files before editing.** `src/alamo/app/billing/[id]/actions/csv.ts`, `src/alamo/lib/csv/*`, any schema migration files. Do NOT edit based on assumptions about structure.
2. **Each change gets its own commit** with `Session B.2:` prefix. Enables cherry-picking if something goes wrong.
3. **Stop and ask on genuine ambiguity.** This spec resolves most design decisions, but flag anything unclear rather than guessing.
4. **Financial paths need extra care.** Column removal and weight changes both affect how clients see their billable amounts. Double-check the math.
5. **Keep the briefing as source of truth.** If this spec contradicts the briefing, the briefing wins — STOP and report.
6. **No schema rename bundling.** The `address_*_zip → postal_code` / `address_*_line1 → line_1` renames documented in the briefing's "Next task" list should be done in their own focused session, not bundled here.

---

## CHANGE 1 — DATE FORMAT FIX

### Problem

Currently the CSV writes dates as `2026-03-14` (ISO YYYY-MM-DD). When the CSV is opened in Excel, Excel auto-converts these strings to the local date format (M/DD/YY in US locale). Different clients in different locales see different-looking dates, which is confusing and unprofessional.

### Affected columns

Every date column: 7 (Date Shipped), 8 (Date Delivered), 9 (Date Invoiced), 10 (Date Billed), 77 (Billing Period Start), 78 (Billing Period End), 79 (Due Date), 81 (Parsed At).

Column 83 (Billed At) is a timestamp, not a date — different handling needed (see below).

### Fix

Tab-prefix every date value the same way tracking numbers are tab-prefixed. `\t` at the start of a cell forces Excel to treat the value as text, not auto-parse as a date.

Implementation: in `src/alamo/lib/csv/format.ts`, change `formatDate()` to prepend `\t`:

```typescript
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const iso = typeof value === 'string' ? value : value.toISOString();
  return '\t' + iso.slice(0, 10);
}
```

For timestamps (column 83, Billed At): similar treatment. Prepend `\t` to keep Excel from re-parsing.

### Verification

After the change, regenerate the Cactus 3PL HQ CSV. Open it in Excel. Dates should render exactly as `2026-03-14` (no conversion to M/DD/YY).

### Commit message

```
Session B.2: tab-prefix dates to prevent Excel locale conversion
```

---

## CHANGE 2 — HUMAN-READABLE INVOICE NUMBERS

### Problem

Column 2 (Cactus Invoice Number) currently shows `248dc801` — the first 8 characters of the cactus_invoices UUID. Clients see this and think "what is this? Not a real invoice number." It's neither a human-readable identifier nor a full UUID.

### Solution

Add a new column `cactus_invoice_number` to the `cactus_invoices` table. Auto-populate via a Postgres sequence. Format: `CX-0001`, `CX-0002`, `CX-0003`, ... (zero-padded to 4 digits, continuous, never resets).

**Format details:**
- Prefix: `CX-` (for Cactus)
- Number: continuous, never resets
- Zero-padded to 4 digits initially (`CX-0001`), will naturally grow to 5+ digits as volume increases (`CX-10000`)
- No year segment (simpler, and avoids ambiguity when billing periods span year boundaries)

### Schema migration

Create `database/migrations/v1.6.2-cactus-invoice-numbers.sql`:

```sql
-- ==========================================================================
-- MIGRATION v1.6.2 — cactus_invoice_number for human-readable billing IDs
-- Date: [DATE RUN]
-- Purpose: Replace the 8-char-UUID display with real sequential invoice
--          numbers in the format CX-NNNN. Backfills existing cactus_invoices
--          rows, then makes the column NOT NULL going forward.
-- ==========================================================================

BEGIN;

-- 1. Create a sequence for the invoice numbers
CREATE SEQUENCE IF NOT EXISTS cactus_invoice_number_seq START 1;

-- 2. Add the column nullable initially
ALTER TABLE cactus_invoices
  ADD COLUMN cactus_invoice_number TEXT;

-- 3. Backfill in order of creation date so earliest invoices get lowest numbers
UPDATE cactus_invoices
SET cactus_invoice_number = 'CX-' || LPAD(backfill_seq.rn::text, 4, '0')
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM cactus_invoices
) AS backfill_seq
WHERE cactus_invoices.id = backfill_seq.id;

-- 4. Advance the sequence past the highest-assigned backfill number
SELECT setval('cactus_invoice_number_seq', (SELECT COUNT(*) FROM cactus_invoices));

-- 5. Make the column NOT NULL with a default that auto-generates from the sequence
ALTER TABLE cactus_invoices
  ALTER COLUMN cactus_invoice_number SET NOT NULL,
  ALTER COLUMN cactus_invoice_number
    SET DEFAULT ('CX-' || LPAD(nextval('cactus_invoice_number_seq')::text, 4, '0'));

-- 6. Unique constraint
ALTER TABLE cactus_invoices
  ADD CONSTRAINT cactus_invoices_number_unique UNIQUE (cactus_invoice_number);

-- 7. Index for lookup performance (admin UI will query by number)
CREATE INDEX cactus_invoices_number_idx ON cactus_invoices (cactus_invoice_number);

-- 8. Verification NOTICE
DO $$
DECLARE
  total_rows INT;
  min_num TEXT;
  max_num TEXT;
BEGIN
  SELECT COUNT(*), MIN(cactus_invoice_number), MAX(cactus_invoice_number)
    INTO total_rows, min_num, max_num
    FROM cactus_invoices;
  RAISE NOTICE 'cactus_invoices v1.6.2: % rows with numbers assigned (% to %)',
    total_rows, min_num, max_num;
END $$;

COMMIT;
```

### Pre-flight check

Before running the migration, confirm current state:

```sql
SELECT COUNT(*) FROM cactus_invoices;
-- Expected: 3 rows (Cactus 3PL HQ, Pineridge, older test org)
```

After migration:
```sql
SELECT id, cactus_invoice_number, created_at
FROM cactus_invoices
ORDER BY created_at;
-- Expected:
--   27a7ebce... → CX-0001 (oldest, 2026-04-16 older test org)
--   248dc801... → CX-0002 (Cactus 3PL HQ, 2026-04-16)
--   11111111... → CX-0003 (Pineridge, 2026-04-21)
```

### CSV change

In `src/alamo/lib/csv/column-spec.ts` (or wherever column 2 is defined), replace the truncated UUID transform with the full `cactus_invoice_number` field:

```typescript
// BEFORE
{ name: 'Cactus Invoice Number', source: row => row.cactus_invoice_id?.slice(0, 8) ?? '' }

// AFTER
{ name: 'Cactus Invoice Number', source: row => row.cactus_invoice_number ?? '' }
```

The CSV query (`csv.ts`) needs to include `cactus_invoice_number` in the cactus_invoices SELECT.

### UI changes

Search `src/alamo/` for any place that displays the truncated UUID as an invoice identifier and replace with `cactus_invoice_number`:
- `/billing` list page
- `/billing/[id]` detail page breadcrumb
- Anywhere else cactus_invoice.id is rendered as a user-facing identifier

Keep the UUID as the URL path parameter (`/billing/[id]`) — URLs use UUIDs for uniqueness; DISPLAY uses the human-readable number.

### Commit message

```
Session B.2: human-readable cactus invoice numbers (CX-0001 format)
```

---

## CHANGE 3 — REMOVE CARRIER-COST COLUMNS FROM CLIENT CSV

### Context

Per Sawyer's policy decision 2026-04-21: the client-facing CSV will never show raw carrier charges, regardless of account type (lassoed or dark). The client sees only marked-up amounts. This simplifies the client view and removes a source of potential confusion.

### Columns to REMOVE from the CSV

- **Column 46**: Carrier Charge (pre-markup)
- **Column 47**: Carrier Charge Currency
- **Column 63**: Carrier Total (pre-markup)
- **Column 67**: Variance Amount

After removal, the CSV drops from 85 columns to **81 columns**.

### Behavior for flat-markup accounts

Under flat markup, surcharges pass through at their raw carrier amount (flat fee applies only to base). This means the "billed" per-component values (columns 49-61) already equal the raw carrier amounts for surcharges.

**No additional display logic needed** — the "billed" columns already show the right values for flat-markup accounts. Their apparent absence of "markup" on those cells is exactly how flat markup is supposed to look.

### Implementation

In `src/alamo/lib/csv/column-spec.ts`, remove the four columns from the spec array. Renumber downstream columns (what was column 48 becomes column 46, etc.) in the column INDEX, but the CSV header row will simply have four fewer columns and the same header names for everything else.

### Verification

After the change:
- Cactus 3PL HQ CSV: 81 columns, all `Carrier Charge (pre-markup)` / `Carrier Total (pre-markup)` / `Carrier Charge Currency` / `Variance Amount` columns gone
- Pineridge CSV: 81 columns, same removals, flat-markup display unchanged

### Footnote update

The footnote currently says: "Shipment Total (col 66) is authoritative. Per-charge billed values may reflect fractional-cent display rounding."

After column removal, Shipment Total becomes col 62 (or wherever it lands). Update the footnote's column reference to match. Or better: remove the column number reference entirely and just say "The Shipment Total is authoritative." The column-number reference is fragile if we remove columns.

### Commit message

```
Session B.2: remove carrier-cost columns from client-facing CSV (policy decision)
```

---

## CHANGE 4 — WEIGHT COLUMN RESTRUCTURE

### Problem

Current CSV has one "Billable Weight" column (14) and one "Weight" column (12) but these are ambiguous:
- Is Billable Weight gravity-weight or DIM-weight? Carriers bill on `MAX(gravity, dim)`.
- What was the shipper's actual entered weight vs. what the carrier measured?

Clients who want to optimize for DIM charges need visibility into both values to know when DIM is driving their cost.

### New weight column structure

Replace the current Weight (col 12), Weight Unit (col 13), Billable Weight (col 14), Billable Weight Unit (col 15) with:

1. **Weight Gravity Entered** — what the shipper entered on the label (actual physical weight)
2. **Weight DIM Entered** — the DIM weight the shipper's system calculated
3. **Weight Entered Unit** — units for the entered weights (LB, KG, OZ)
4. **Weight Gravity Billed** — what the carrier measured as actual weight
5. **Weight DIM Billed** — the DIM weight the carrier calculated
6. **Weight Billed Final** — which weight the carrier actually billed (`MAX(gravity, dim)`)
7. **Weight Billed Unit** — units for the billed weights

**The value proposition**: clients can instantly compare Weight Gravity Entered vs Weight DIM Entered to see when DIM exceeds gravity. If Weight DIM Entered > Weight Gravity Entered, their package is "DIM-driven" and they could save money by packing denser.

### Schema changes

Add to `invoice_line_items`:
- `weight_gravity_entered DECIMAL(10,2)`
- `weight_dim_entered DECIMAL(10,2)`
- `weight_entered_unit TEXT`
- `weight_gravity_carrier DECIMAL(10,2)`  (currently stored as `weight_carrier` or similar — investigate actual column name)
- `weight_dim_carrier DECIMAL(10,2)`
- `weight_billed_final DECIMAL(10,2)`
- `weight_billed_unit TEXT`

Add the same columns to `shipment_ledger` (so quote-time and bill-time store the same shape — consistent with the v1.6.1 philosophy from Session B).

Remove or deprecate the legacy single-value columns once all code references are updated.

**DECISION NEEDED — HALT POINT:**

Current schema has some weight columns already (`weight`, `weight_unit`, `billable_weight`, `billable_weight_unit` — or similar names). Before writing the migration:

1. Run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoice_line_items' AND column_name LIKE '%weight%' ORDER BY column_name;` to confirm what exists
2. Decide: REPLACE old columns with new ones (drop old + add new, like v1.6.1), OR ADD new alongside old (deprecate later)
3. My recommendation: REPLACE, same ADD-BACKFILL-DROP pattern as v1.6.1. Clean break.

If unclear, STOP and ask.

### Parser changes

The UPS detail parser currently populates `weight_billed` and `weight_unit_billed`. It needs to be extended to:

1. Extract both gravity weight and DIM weight from the source data. UPS detail invoices may include these as separate rows or fields — investigate the carrier_invoice_formats and carrier_charge_routing seed data to see what's available.
2. Determine `weight_billed_final` as `MAX(gravity, dim)` after parsing
3. For shippers whose WMS integrates with Cactus (lassoed): read entered weights from shipment_ledger (if captured)
4. For dark accounts: entered weights are unknown, leave them NULL

### Unit translation

Fix the parser's weight unit translation:
- UPS uses 'L' → translate to 'LB'
- UPS uses 'K' → translate to 'KG'
- UPS uses 'O' → translate to 'OZ'

This was discovered in the Session B review — the CSV shows single-letter units on Cactus 3PL HQ data but proper two-letter units on Pineridge (hardcoded in the seed).

### Shipment_ledger impact

Stage 6 Rate Engine (future) will write weight data to shipment_ledger when labels are created. Make sure the shipment_ledger schema supports all seven new weight fields so no re-migration is needed later.

### CSV changes

Update column-spec.ts to replace the old weight columns with the new seven. Approximate new CSV column positions (after Change 3 removes 4 columns):

- Column 12: Weight Gravity Entered
- Column 13: Weight DIM Entered
- Column 14: Weight Entered Unit
- Column 15: Weight Gravity Billed
- Column 16: Weight DIM Billed
- Column 17: Weight Billed Final
- Column 18: Weight Billed Unit

### Verification

Regenerate both CSVs. Spot-check:
- Cactus 3PL HQ rows should show `Weight Billed Final = MAX(Gravity, DIM)` with proper unit "LB"
- Entered weights will be NULL for Cactus HQ (no WMS integration yet) — that's expected, columns render empty
- Pineridge rows should maintain their seeded values (flat 5.00 LB or whatever the seed has)

### Commit message

```
Session B.2: weight column restructure (gravity vs DIM split, final-billed-weight visibility)
```

---

## CHANGE 5 — PARSER SURCHARGE ROUTING INVESTIGATION

### Context

Session B review noted that CSV columns 52, 53, 54, 56, 58, 59 (DIM Weight Charge, Saturday Delivery, Signature Charge, Large Package, Hazmat, Return to Sender) are ALWAYS EMPTY on the test invoice. Investigation showed this test invoice simply doesn't contain those charge types — not a parser bug. But we don't know if the parser WOULD correctly route them if they appeared.

### Action required

Claude Code should:

1. Query `carrier_invoice_formats` and `carrier_charge_routing` tables for UPS to see which charge codes are expected to be routed to each dedicated column
2. Run this SQL to enumerate every distinct charge description in the current test data:
   ```sql
   SELECT DISTINCT jsonb_array_elements(raw_line_data::jsonb)->>'charge_description' AS charge_desc,
          COUNT(*) AS rows_with_it
   FROM invoice_line_items
   WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679'
     AND raw_line_data IS NOT NULL
   GROUP BY charge_desc
   ORDER BY rows_with_it DESC;
   ```
3. Document the findings: which charge descriptions appear, which are routed correctly, which have no dedicated column

### Testing with new data

If possible, Sawyer should acquire an anonymized UPS invoice from a shipper with varied charge types (signature requirements, hazmat, large packages, Saturday delivery). Sawyer has industry access through BukuShip. Upload this new test invoice AFTER the parser is confirmed healthy, as a "rich test case."

**If Claude Code cannot acquire such test data during this session**: document the current routing state, add a "test rich-surcharge invoice" item to the follow-up list, and proceed with the rest of the revision.

### Commit message

```
Session B.2: verify parser surcharge routing, document findings
```

---

## CHANGE 6 — INVESTIGATE THE 11-ROW CSV GAP

### Problem

The Cactus 3PL HQ CSV rendered 939 data rows + 1 footnote (940 total data+footnote). The database has 950 invoice_line_items for that invoice. All 950 are:
- Properly invoiced (have `cactus_invoice_id`)
- In the junction table (`cactus_invoice_line_items`)
- Billing status `INVOICED`

Yet the CSV generator is excluding 11 rows. Diagnostic queries (run 2026-04-21 with Sawyer) confirmed:
- All 950 rows have non-NULL `cactus_invoice_id`
- All 950 rows appear in `cactus_invoice_line_items` junction (0 missing_from_junction)
- All 8 adjustment-only rows ARE in the CSV — so it's not an adjustment-filter bug

The bug must be inside `src/alamo/app/billing/[id]/actions/csv.ts` or its query/join logic.

### Action required

1. Read `src/alamo/app/billing/[id]/actions/csv.ts` in full
2. Re-trace the query that pulls line items for a cactus_invoice
3. Look for any WHERE clause, FILTER, or JOIN condition that could silently exclude rows
4. Identify the 11 specific tracking numbers that are in the database but not in the CSV
5. Fix the root cause

Suggested SQL to identify the missing 11 tracking numbers:

```sql
-- Find the 11 tracking numbers present in DB but absent from CSV
-- (Sawyer can cross-reference against the actual CSV he has)
SELECT tracking_number, is_adjustment_only, billing_status, match_status
FROM invoice_line_items
WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679'
ORDER BY tracking_number;
```

Sawyer will provide the CSV list; diff against this to find the 11.

Actually, simpler path: have Claude Code add `LIMIT 1000` explicitly to the CSV generator query and verify count returned. If PostgREST or Supabase has a default LIMIT that's smaller than expected, THAT'S the bug.

### Hypothesis to investigate first

Supabase's PostgREST has a default row limit of 1000 — but that's not 939. However, certain `.select()` calls with joins can have LOWER default limits. Check if:
1. `csv.ts` uses an explicit `.limit()` call that's set to a low number
2. Or the join implicitly limits based on some other factor

### Commit message

```
Session B.2: fix CSV row-count gap (N of 950 rows missing, root cause: [to investigate])
```

---

## CHANGE 7 — CLIENT VS ADMIN CSV SPLIT (OPTIONAL)

### Scope decision

This is the largest item in the spec and could be deferred to a future session. Recommend implementing if session time allows; defer if not.

### Design

Two separate CSV endpoints:

1. **Client endpoint**: `/api/billing/[id]/csv` (existing)
   - Outputs the revised client CSV (~60 columns after removing internal fields)
   - Columns: shipment identifiers, dates, addresses, references, billed charges, totals, dispute status
   - Excludes: Markup Source, Parsed At, Matched At, Carrier Account Mode, Match Method, Match Status, Is Cactus Account, internal audit fields

2. **Admin endpoint**: `/api/billing/[id]/csv/admin` (new)
   - Outputs the full CSV (~85+ columns)
   - Includes all internal fields AND side-by-side raw-vs-billed columns for every charge component (for dispute reconciliation)
   - Role-gated: requires role `ADMIN` or `FINANCE`. Returns 403 for `STANDARD` role.

### Role check implementation

In the admin endpoint's route handler:

```typescript
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser(request);
  if (!user || (user.role !== 'ADMIN' && user.role !== 'FINANCE')) {
    return new Response('Forbidden', { status: 403 });
  }
  // ... rest of CSV generation
}
```

### UI

- Cactus Portal (client-facing): "Download CSV" link on client invoice page — calls client endpoint only
- Alamo (admin-facing): "Download Admin CSV" button on billing detail page — calls admin endpoint
- Do NOT link to admin endpoint from Cactus Portal ever

### Commit message

```
Session B.2: split client vs admin CSV endpoints with role-gated access
```

---

## CHANGE LIST SUMMARY

| # | Change | Priority | Est. time | Notes |
|---|--------|----------|-----------|-------|
| 1 | Date format fix (tab-prefix) | High | 15 min | Small, bundle with cleanup session if convenient |
| 2 | Human-readable invoice numbers | High | 60 min | Schema + backfill + UI updates |
| 3 | Remove carrier-cost columns | High | 30 min | Policy decision implemented |
| 4 | Weight restructure | High | 90 min | Schema + parser + CSV |
| 5 | Parser surcharge investigation | Medium | 30 min | Diagnostic, then document |
| 6 | 11-row gap investigation | High | 45 min | Real bug, must fix before client ships |
| 7 | Client vs admin CSV split | Medium | 90 min | Optional; defer if time-constrained |

**Total estimated time**: 6 hours if all changes are made. Recommend two sessions:
- Session B.2a (3 hrs): Changes 1, 2, 3, 6 — the "CSV is shippable to clients" set
- Session B.2b (3 hrs): Changes 4, 5, 7 — the deeper improvements

Or split however Sawyer prefers.

---

## COMPLETION SUMMARY TEMPLATE

After all changes land, write to `SESSION-B.2-SUMMARY.md`:

```
## SESSION B.2 COMPLETE — [n/7 changes complete]

### CHANGES LANDED
- [x] Change N: description (commit sha)
- ...

### CHANGES DEFERRED
- [ ] Change M: reason

### SCHEMA MIGRATIONS APPLIED
- v1.6.2-cactus-invoice-numbers.sql (Change 2)
- [v1.6.3-weight-restructure.sql if Change 4 done]

### SAMPLE CSVs GENERATED
- /mnt/user-data/outputs/sample-csv-cactus-3pl-hq-revised.csv
- /mnt/user-data/outputs/sample-csv-pineridge-revised.csv

### DECISIONS NEEDED
- [any ambiguities encountered during execution]

### MERGE INSTRUCTIONS
1. Apply migration(s) in Supabase
2. Regenerate Supabase types (if type regen workflow exists by then)
3. Verify both CSVs render correctly after changes
4. Merge to main
5. Push to origin

### FOLLOW-UPS FOR FUTURE SESSIONS
- [anything that was out of scope but should be tracked]
```

---

## HAND-OFF TO NEXT SESSION

When Claude Code completes this session, review the sample CSVs carefully — especially:
- The 11-row gap is resolved (Cactus 3PL HQ CSV should have exactly 950 data rows)
- Dates render as YYYY-MM-DD in Excel (not locale-converted)
- Column 2 shows `CX-0002` not `248dc801`
- Columns 46, 47, 63, 67 are absent
- (If Change 4 done) Weight columns show gravity/DIM/final split

Then merge and ship.
