# CACTUS SESSION B — PIPELINE RESTRUCTURE, MARKUP UNIFICATION, 85-COLUMN CSV, POLISH

**For:** Claude Code at Opus 4.7 1M + Extra high effort
**Estimated duration:** 3-4 hours
**Branch:** whatever claude/* worktree name Claude Code assigns
**Prerequisites:** Session A merged to main (commit 6e72310 or later), schema at v1.6.0, 950 test rows present on invoice 904d933a
**Completion target:** All 6 work streams complete OR stop at last completed stream with clear resumption notes

---

## SESSION OVERVIEW

This session finishes the Phase 1 invoice pipeline. After tonight, Cactus will have:

- Pipeline stages 3 (Match) and 5 (Billing Calc) separated into distinct server actions with proper architectural boundaries
- Lassoed dates enriched from shipment_events (not parser-guessed)
- shipment_ledger using the same markup context model as invoice_line_items (v1.6.0 unified)
- A working 85-column client-facing CSV generator with verified sample output for both markup modes
- A new test org seeded with flat-markup shipment data so flat mode has production-like coverage
- Four small polish items completed
- Legacy cleanup: broken seed/verify, orphaned PDF files, pre-existing TypeScript errors in financial paths

After tonight, Phase 1 is one small step away from being shippable to a real client.

---

## GROUND RULES

1. **Stop on ambiguity.** If you encounter a decision that isn't explicitly resolved by this spec, the master briefing, or cactus-standards.mdc, STOP that work stream, document the ambiguity in your completion summary under a "DECISIONS NEEDED" header, commit all completed work, and end the session. Do not guess on financial paths. Do not guess on schema changes. Do not guess on display rules.

2. **Checkpoint between work streams.** Each work stream has explicit verification at the end. If verification fails, stop there and report rather than proceed to the next work stream.

3. **Single branch, multiple commits.** Work on one claude/* branch. Commit after each work stream completes verification, with clear commit messages. This lets Sawyer cherry-pick partial work if something goes wrong.

4. **Read files you haven't touched.** Before editing match.ts, read match.ts in full. Before editing resolve.ts, read resolve.ts in full. Before editing page.tsx files, read them in full. Do not edit based on assumptions about current structure.

5. **Verify database state before schema changes.** Before any ALTER TABLE, run a SELECT to confirm the current state matches your expectation. If the schema has drifted from v1.6.0 in ways this spec doesn't anticipate, STOP and report.

6. **Financial paths deserve extra care.** match.ts, resolve.ts, the new billing-calc.ts, and the CSV generator all handle money. Use decimal.js never floats. Cross-check totals. Log audit_logs entries for any billing calc run.

7. **The briefing is law.** cactus-master-briefing.md at v1.6.0 is the canonical architecture. If this spec contradicts the briefing, the briefing wins and you should STOP and report the contradiction.

8. **Read briefing Section 17 before Phase 5.** The "UPS Detail Format — Real File Analysis" block at Section 17 documents which columns are always empty in production UPS invoices (Original Service Description, Shipment Date, Shipment Delivery Date) and which ones we rely on instead (Charge Description, Transaction Date). This affects how the CSV generator should handle NULL/empty values for date_delivered and service_level edge cases. Read it before writing the transform functions.

---

## WORK STREAMS — EXECUTION ORDER

Execute in this order. Do not reorder. Each stream depends on the previous.

1. [PHASE 1] shipment_ledger markup unification (schema migration v1.6.1)
2. [PHASE 2] Pipeline restructure — extract Stage 5 Billing Calc from match.ts/resolve.ts
3. [PHASE 3] Match stage shipment_events enrichment for lassoed dates
4. [PHASE 4] Seed new test org + flat-markup invoice data
5. [PHASE 5] 85-column client CSV generator + sample outputs
6. [PHASE 6] Polish items (breadcrumb, columns, drill-down, truncation)
7. [PHASE 7] Pre-existing cleanup

---

# PHASE 1 — SHIPMENT_LEDGER MARKUP UNIFICATION (v1.6.1)

## Goal

Extend the markup context model (`markup_type_applied`, `markup_value_applied`, `markup_source`) from `invoice_line_items` to `shipment_ledger`. Drop the legacy `markup_percentage` and `markup_flat_fee` columns from `shipment_ledger`. This makes quote-time (rating engine writes to shipment_ledger) and bill-time (Stage 5 writes to invoice_line_items) use the same data model.

## Pre-flight checks

Run in Supabase SQL Editor, confirm expected results before proceeding:

```sql
-- Should return: markup_percentage, markup_flat_fee, final_billed_rate present
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'shipment_ledger'
  AND column_name IN ('markup_percentage', 'markup_flat_fee', 'final_billed_rate',
                       'markup_type_applied', 'markup_value_applied', 'markup_source')
ORDER BY column_name;

-- Should return: 0 (shipment_ledger has no production data, only rate-shop test writes)
SELECT COUNT(*) FROM shipment_ledger;
```

If `shipment_ledger` has rows (unexpected), STOP and report the count. This migration assumes zero rows and drops columns destructively.

## Migration file to create

Create `database/migrations/v1.6.1-shipment-ledger-markup-unification.sql`:

```sql
-- v1.6.1 — Unify markup context on shipment_ledger
-- Extends the v1.6.0 markup model from invoice_line_items to shipment_ledger
-- so quote-time and bill-time use the same data shape.
--
-- Safe because: shipment_ledger has zero rows in test Supabase as of 2026-04-18
-- (verified in pre-flight). If this migration runs against a non-empty
-- shipment_ledger, the ALTER TABLE DROP will fail loudly — that's intentional.

BEGIN;

-- Add new columns (nullable initially)
ALTER TABLE shipment_ledger
  ADD COLUMN markup_type_applied  TEXT,
  ADD COLUMN markup_value_applied DECIMAL(10,6),
  ADD COLUMN markup_source        TEXT;

-- Add CHECK constraints to keep data clean
ALTER TABLE shipment_ledger
  ADD CONSTRAINT shipment_ledger_markup_type_check
    CHECK (markup_type_applied IS NULL OR markup_type_applied IN ('percentage', 'flat')),
  ADD CONSTRAINT shipment_ledger_markup_source_check
    CHECK (markup_source IS NULL OR markup_source IN ('carrier_account', 'rate_card'));

-- Drop the legacy columns
ALTER TABLE shipment_ledger
  DROP COLUMN markup_percentage,
  DROP COLUMN markup_flat_fee;

-- Raise a notice with final column list for verification
DO $$
DECLARE
  col_list TEXT;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO col_list
    FROM information_schema.columns
    WHERE table_name = 'shipment_ledger'
      AND column_name IN ('markup_type_applied', 'markup_value_applied',
                           'markup_source', 'markup_percentage', 'markup_flat_fee');
  RAISE NOTICE 'shipment_ledger markup columns after migration: %', col_list;
END $$;

COMMIT;
```

## Application

Claude Code cannot execute SQL directly against Supabase. After writing the migration file, note in the completion summary that Sawyer needs to run this migration in Supabase SQL Editor and verify the NOTICE output shows exactly `markup_source, markup_type_applied, markup_value_applied` (three columns, alphabetical).

## Code changes

Search the codebase for writes to `shipment_ledger.markup_percentage` and `shipment_ledger.markup_flat_fee`. Expected locations (verify by reading):

- `src/alamo/app/invoices/[id]/actions/match.ts` — dark-account shipment_ledger insert
- `src/alamo/app/invoices/[id]/actions/resolve.ts` — dispute-resolution shipment_ledger insert
- Any rate-shop or rating-engine code that writes to shipment_ledger (if present)

For each location, update the INSERT to use the new columns. Use the `deriveMarkupContext()` helper pattern established in Session A:

```typescript
// Derive markup context from the carrier account
const markupContext = deriveMarkupContext(account);

// Write to shipment_ledger with new columns
const { error: ledgerError } = await supabaseAdmin
  .from('shipment_ledger')
  .insert({
    // ... existing fields ...
    markup_type_applied:   markupContext.markup_type_applied,
    markup_value_applied:  markupContext.markup_value_applied,
    markup_source:         markupContext.markup_source,
    // (NOT markup_percentage, NOT markup_flat_fee)
  });
```

If `deriveMarkupContext` is currently defined only in match.ts, extract it to a shared module at `src/alamo/lib/markup-context.ts` so both match.ts and resolve.ts (and later billing-calc.ts) can import it from one place.

## TypeScript type updates

Search for any TypeScript type definitions that include `markup_percentage` or `markup_flat_fee` for shipment_ledger. Update them to use the new columns. Do NOT touch type definitions for `org_carrier_accounts` — those columns still exist there and are the source of truth.

## Verification

After code changes, run:

```bash
cd src/alamo && npx tsc --noEmit 2>&1 | wc -l
```

Report the line count. If it grew from Session A's baseline (1635), investigate whether the growth is caused by this work or pre-existing drift.

Attempt a parse + match run on a fresh copy of the test invoice (Sawyer may need to re-upload `ups_full_detail_invoice_anonymized.csv` — note this requirement in the completion summary) to verify the shipment_ledger insert path works end-to-end with the new schema.

## Checkpoint

Before proceeding to Phase 2, commit this work:

```
git add database/migrations/v1.6.1-shipment-ledger-markup-unification.sql
git add src/alamo/app/invoices/[id]/actions/match.ts
git add src/alamo/app/invoices/[id]/actions/resolve.ts
git add src/alamo/lib/markup-context.ts  # if you extracted the helper
git commit -m "Session B Phase 1: shipment_ledger markup unification (v1.6.1)"
```

If verification fails, STOP and report. Do not proceed to Phase 2.

---

# PHASE 2 — PIPELINE RESTRUCTURE (MATCH / BILLING CALC SPLIT)

This is the single highest-risk phase of the session. It refactors financial-critical code that currently works. Read this phase in full before starting. When in doubt, STOP and document rather than guess.

## Goal

Separate Stage 3 (Matching) from Stage 5 (Billing Calculation) per the v1.6.0 8-stage pipeline defined in the briefing. Match determines `org_id`, writes `match_status`, but NO markup is applied. Billing Calc runs on AUTO_MATCHED + resolved-dispute lines, applies markup per type, writes `final_billed_rate` and markup context, sets `billing_status = APPROVED`.

## Why this architectural change matters

Today, `match.ts` and `resolve.ts` each do three things atomically: match an org, apply markup, set APPROVED. If any step fails partway, the line is in an indeterminate state. It also means every bug fix or markup policy change requires rerunning the entire match pipeline, which is expensive and risks re-matching lines we've already disputed.

After the split, Match and Billing Calc are independently runnable. Match is idempotent on org assignment (re-running on an already-matched line is a no-op). Billing Calc is idempotent on markup application (re-running on an already-APPROVED line is a no-op). A bug in markup logic can be fixed and Billing Calc re-run without touching Match. A change in org assignment requires Match re-run, but Billing Calc then recomputes on the new org's markup automatically.

## Architecture — before and after

Before:
```
match.ts → matches + applies markup + writes final_billed_rate + sets APPROVED
resolve.ts → resolves + applies markup + writes final_billed_rate + sets APPROVED
```

After:
```
match.ts → matches, sets match_status,
             billing_status stays PENDING for matched, HELD for flagged
resolve.ts → resolves dispute, reassigns org if needed,
             billing_status stays PENDING (handoff to Billing Calc)
billing-calc.ts [NEW] → reads all PENDING lines that are AUTO_MATCHED
                        or MANUAL_ASSIGNED, applies markup, writes
                        final_billed_rate + context, sets APPROVED
```

## State machine — billing_status transitions (after refactor)

This state machine governs the financial lifecycle of every invoice line item. Billing Calc MUST respect these transitions.

```
PENDING ←──── (parser inserts)
  ↓
  ├─→ HELD         (by match.ts if variance exceeds threshold or ambiguous match)
  │    ↓
  │    └─→ PENDING (by resolve.ts after manual org assignment or variance approval)
  │
  └─→ APPROVED     (by billing-calc.ts after markup applied and final_billed_rate written)
       ↓
       └─→ INVOICED (by generate.ts when weekly billing run creates cactus_invoice)
```

Billing Calc only acts on PENDING lines with AUTO_MATCHED or MANUAL_ASSIGNED match_status. It NEVER touches HELD lines. It NEVER re-processes APPROVED or INVOICED lines.

## File changes — overview

1. NEW — `src/alamo/lib/markup-context.ts` (shared helper, if not extracted in Phase 1)
2. NEW — `src/alamo/app/invoices/[id]/actions/billing-calc.ts` (the Billing Calc server action)
3. MODIFY — `src/alamo/app/invoices/[id]/actions/match.ts` (strip markup logic, strip APPROVED writes)
4. MODIFY — `src/alamo/app/invoices/[id]/actions/resolve.ts` (strip markup logic, strip APPROVED writes)
5. MODIFY — UI components that call match/resolve (auto-trigger billing-calc after completion)

Read EACH file in full before editing. Do not edit based on what you assume the structure is.

## File 1: `src/alamo/lib/markup-context.ts` (shared helper)

If `deriveMarkupContext()` is still inlined in `match.ts` from Session A (not extracted during Phase 1 above), extract it now. The function signature:

```typescript
import type Decimal from 'decimal.js';

export interface MarkupContext {
  markup_type_applied: 'percentage' | 'flat';
  markup_value_applied: string;  // DECIMAL(10,6) as string for safe transport
  markup_source: 'carrier_account' | 'rate_card';
}

export function deriveMarkupContext(
  account: {
    markup_percentage: string | number | null;
    markup_flat_fee: string | number | null;
    use_rate_card: boolean | null;
  },
  rateCardApplied: boolean = false,
): MarkupContext {
  // Determine type: if markup_flat_fee is non-zero, it's flat. Otherwise percentage.
  // (An account with both set to zero is "no markup" — still counts as percentage type with value 0.)
  const flat = account.markup_flat_fee ? new Decimal(account.markup_flat_fee) : null;
  const pct  = account.markup_percentage ? new Decimal(account.markup_percentage) : null;

  if (flat && flat.greaterThan(0)) {
    return {
      markup_type_applied: 'flat',
      markup_value_applied: flat.toFixed(6),
      markup_source: rateCardApplied ? 'rate_card' : 'carrier_account',
    };
  }

  return {
    markup_type_applied: 'percentage',
    markup_value_applied: (pct ?? new Decimal(0)).toFixed(6),
    markup_source: rateCardApplied ? 'rate_card' : 'carrier_account',
  };
}
```

**DECISION NEEDED — HALT POINT:**

What happens if an account has BOTH markup_percentage > 0 AND markup_flat_fee > 0? The briefing doesn't explicitly address this edge case. Three possible interpretations:

(a) Validation error — treat as data integrity violation, flag the line HELD with a dispute_note  
(b) Percentage wins — ignore flat_fee if percentage is also set  
(c) Flat wins — ignore percentage if flat_fee is also set  

Without briefing guidance, STOP here and document the ambiguity. Do not guess. This could mis-bill a client.

Default behavior for now (while stopped): prefer (a) — flag as data integrity issue — because the financial implications of silently picking one over the other are potentially significant, and the Alamo should probably prevent this configuration at save time anyway.

## File 2: `src/alamo/app/invoices/[id]/actions/billing-calc.ts`

### Function signature

```typescript
'use server';

import { createAdminSupabaseClient } from '@/lib/supabase-server';
import Decimal from 'decimal.js';
import { deriveMarkupContext, type MarkupContext } from '@/lib/markup-context';

export interface BillingCalcResult {
  invoice_id: string;
  approved: number;
  skipped: number;
  errors: Array<{ line_id: string; tracking_number: string | null; message: string }>;
  started_at: string;
  completed_at: string;
}

export async function runBillingCalc(invoiceId: string): Promise<BillingCalcResult> {
  // ... implementation below
}
```

### Detailed behavior

**Step 1 — Load PENDING eligible lines with a single query.**

```typescript
const { data: lines, error: linesErr } = await supabaseAdmin
  .from('invoice_line_items')
  .select(`
    id, tracking_number, carrier_code, org_id, carrier_account_id,
    base_charge, fuel_surcharge, residential_charge,
    delivery_area_charge, dim_weight_charge, other_surcharges,
    apv_adjustment,
    is_adjustment_only,
    match_status, billing_status,
    final_billed_rate
  `)
  .eq('carrier_invoice_id', invoiceId)
  .eq('billing_status', 'PENDING')
  .in('match_status', ['AUTO_MATCHED', 'MANUAL_ASSIGNED'])
  .not('org_id', 'is', null);

if (linesErr) throw new Error(`billing-calc: failed to load lines: ${linesErr.message}`);
```

Note: the SELECT list above uses the column names from my guesses — Claude Code MUST run the column-verification SQL below BEFORE writing this query and adjust names accordingly.

**Step 2 — Verify actual column names in the schema before proceeding.**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'invoice_line_items'
  AND (column_name LIKE '%charge%'
       OR column_name LIKE '%surcharge%'
       OR column_name LIKE '%fee%'
       OR column_name LIKE '%adjustment%')
ORDER BY column_name;
```

List the returned columns. Group them into:

- **Billable charge components** (these are summed in markup math)
- **Informational / meta** (these are NOT billed — dimensions, weights, etc. — skip any that are)
- **Totals already stored** (carrier_charge, final_billed_rate — skip, we compute final_billed_rate ourselves and carrier_charge is the source-of-truth total from parser)

If any column name is ambiguous about which category it belongs to (e.g. `audit_fee`, `recovery_charge`), STOP and document under DECISIONS NEEDED. Do NOT silently decide.

**Step 3 — Group lines by carrier_account_id to batch org_carrier_account lookups.**

Naive implementation loads the account once per line (N+1). Instead:

```typescript
const uniqueAccountIds = [...new Set(lines.map(l => l.carrier_account_id))];

const { data: accounts, error: accErr } = await supabaseAdmin
  .from('org_carrier_accounts')
  .select(`
    id, org_id, carrier_code,
    markup_percentage, markup_flat_fee, use_rate_card,
    is_cactus_account
  `)
  .in('id', uniqueAccountIds);

if (accErr) throw new Error(`billing-calc: failed to load accounts: ${accErr.message}`);

const accountMap = new Map(accounts.map(a => [a.id, a]));
```

**Step 4 — For each line, compute and prepare an update.**

```typescript
const updates: Array<{
  id: string;
  final_billed_rate: string;
  markup_type_applied: MarkupContext['markup_type_applied'];
  markup_value_applied: string;
  markup_source: MarkupContext['markup_source'];
}> = [];

const errors: BillingCalcResult['errors'] = [];

for (const line of lines) {
  try {
    const account = accountMap.get(line.carrier_account_id);
    if (!account) {
      errors.push({
        line_id: line.id,
        tracking_number: line.tracking_number,
        message: `carrier_account ${line.carrier_account_id} not found`,
      });
      continue;
    }

    if (!account.is_cactus_account) {
      // Pass-through account — no markup, no billing
      errors.push({
        line_id: line.id,
        tracking_number: line.tracking_number,
        message: 'carrier_account is not a Cactus account (is_cactus_account = FALSE); skipping billing',
      });
      continue;
    }

    const context = deriveMarkupContext(account);
    const markupValue = new Decimal(context.markup_value_applied);

    let finalBilledRate: Decimal;

    if (context.markup_type_applied === 'percentage') {
      finalBilledRate = computePercentageMarkup(line, markupValue);
    } else {
      finalBilledRate = computeFlatMarkup(line, markupValue);
    }

    updates.push({
      id: line.id,
      final_billed_rate: finalBilledRate.toFixed(4),  // DECIMAL(18,4)
      markup_type_applied: context.markup_type_applied,
      markup_value_applied: context.markup_value_applied,
      markup_source: context.markup_source,
    });
  } catch (err) {
    errors.push({
      line_id: line.id,
      tracking_number: line.tracking_number,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**Step 5 — Apply updates in batched chunks.**

PostgREST has a URL length limit; `.in('id', [...])` with 950 UUIDs breaks at ~34KB. Batch the updates in chunks of 100 — same pattern as Session A's backfill.

```typescript
const CHUNK_SIZE = 100;
let approved = 0;

for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
  const chunk = updates.slice(i, i + CHUNK_SIZE);

  // Supabase does not support bulk-update-with-different-values in a single query.
  // We must issue one update per line. To avoid per-line roundtrip cost,
  // use Promise.all within each chunk.
  const chunkResults = await Promise.all(
    chunk.map(u =>
      supabaseAdmin
        .from('invoice_line_items')
        .update({
          final_billed_rate: u.final_billed_rate,
          markup_type_applied: u.markup_type_applied,
          markup_value_applied: u.markup_value_applied,
          markup_source: u.markup_source,
          billing_status: 'APPROVED',
        })
        .eq('id', u.id)
        .eq('billing_status', 'PENDING')  // CRITICAL — idempotency guard
        .select('id')
    )
  );

  for (const result of chunkResults) {
    if (result.error) {
      errors.push({
        line_id: '<batched>',
        tracking_number: null,
        message: result.error.message,
      });
    } else if (result.data && result.data.length > 0) {
      approved += 1;
    }
    // data.length === 0 means the idempotency guard filtered it out — someone else APPROVED this line between our SELECT and UPDATE. Not an error, just a no-op.
  }
}
```

**IDEMPOTENCY GUARD — the most important line in this whole file:**

```typescript
.eq('billing_status', 'PENDING')
```

This clause on the UPDATE ensures we ONLY update rows that are still PENDING. If the function is re-run (network retry, double-click, admin confusion), already-APPROVED lines are silently skipped instead of being re-processed. Without this guard, a rerun could re-apply markup to already-billed lines, inflating the invoice.

This is non-negotiable. Keep it.

**Step 6 — Write audit_logs entry.**

```typescript
await supabaseAdmin.from('audit_logs').insert({
  action: 'BILLING_CALC_RUN',
  entity_type: 'carrier_invoice',
  entity_id: invoiceId,
  details: {
    invoice_id: invoiceId,
    total_eligible: lines.length,
    approved,
    skipped: lines.length - approved - errors.length,
    errors_count: errors.length,
    errors: errors.slice(0, 20),  // cap to prevent huge log rows
    started_at,
    completed_at: new Date().toISOString(),
  },
});
```

Note: `audit_logs` is append-only per the briefing. Do NOT attempt to update or delete existing audit rows.

**Step 7 — Return the result.**

```typescript
return {
  invoice_id: invoiceId,
  approved,
  skipped: lines.length - approved - errors.length,
  errors,
  started_at,
  completed_at: new Date().toISOString(),
};
```

### Error handling philosophy for billing-calc.ts

Per-line errors (single line fails to compute) should NEVER abort the whole run. Capture them in the errors array, continue processing other lines.

Systemic errors (database connection fails, entire lines query fails) SHOULD abort and throw. These are unrecoverable within the function.

Do NOT swallow errors silently. Every caught exception goes into the errors array OR is rethrown.

Do NOT retry automatically. If a line fails, the admin sees it in the summary and decides to re-run or investigate. Automatic retry on financial code hides problems.

### Markup math functions

Define these as module-level helpers in billing-calc.ts (or in markup-context.ts if preferred):

**PERCENTAGE markup:**

```typescript
import Decimal from 'decimal.js';

function computePercentageMarkup(line: LineRecord, markupPct: Decimal): Decimal {
  // Sum all chargeable components. Goal: "apply markup to EVERY charge
  // component stored on the line, EXCLUDING informational / non-chargeable rows."
  //
  // Column names here MUST match actual schema. Verify via the SQL above.
  const components = [
    new Decimal(line.base_charge         ?? 0),
    new Decimal(line.fuel_surcharge      ?? 0),
    new Decimal(line.residential_charge  ?? 0),
    new Decimal(line.delivery_area_charge ?? 0),
    new Decimal(line.dim_weight_charge   ?? 0),
    new Decimal(line.other_surcharges    ?? 0),
    new Decimal(line.apv_adjustment      ?? 0),
    // Add any additional chargeable columns that exist on the actual schema
  ];

  const factor = new Decimal(1).plus(markupPct);
  const marked = components.map(c => c.times(factor));

  const preCeilingTotal = marked.reduce((a, b) => a.plus(b), new Decimal(0));

  // Single-Ceiling: round UP to next whole cent
  return preCeilingTotal.times(100).ceil().dividedBy(100);
}
```

**FLAT markup:**

```typescript
function computeFlatMarkup(line: LineRecord, flatFee: Decimal): Decimal {
  // Flat fee applies ONCE to base_charge; all surcharges pass through raw.
  // No ceiling — flat fees don't introduce fractional cents.
  const baseCharged = new Decimal(line.base_charge ?? 0).plus(flatFee);

  const passthrough = [
    new Decimal(line.fuel_surcharge       ?? 0),
    new Decimal(line.residential_charge   ?? 0),
    new Decimal(line.delivery_area_charge ?? 0),
    new Decimal(line.dim_weight_charge    ?? 0),
    new Decimal(line.other_surcharges     ?? 0),
    new Decimal(line.apv_adjustment       ?? 0),
  ];

  return passthrough.reduce((a, b) => a.plus(b), baseCharged);
}
```

**IMPORTANT — is_adjustment_only handling:**

Lines with `is_adjustment_only = TRUE` have `base_charge = 0` and all their value in `apv_adjustment`. The percentage math handles this correctly (0 × factor = 0; adjustment × factor is included). The flat math handles it correctly too (0 + flatFee gives the flatFee, adjustment passes through).

However, is applying a flat fee to an adjustment-only line correct? An adjustment is a post-facto correction; charging a flat handling fee on it may or may not be appropriate.

**DECISION NEEDED — HALT POINT:**

Should flat markup apply to is_adjustment_only = TRUE lines? Two defensible positions:

(a) Yes — consistent rule, flat fee always applies to base_charge even if base_charge is 0  
(b) No — adjustments are corrections; no flat handling fee should be added  

Without briefing guidance, STOP and document. Default (while stopped): (b) — do not apply flat fee to is_adjustment_only lines. Reasoning: flat fee is a per-shipment handling charge, and an adjustment is not a new shipment.

### Column-name verification before running Billing Calc

Before Billing Calc can run, Claude Code MUST:

1. Run the schema inspection SQL above
2. List all columns returned
3. Explicitly categorize each as billable / informational / total
4. Update the markup math functions to reference actual columns
5. Update the SELECT list in Step 1 to match

Document the final column categorization in the completion summary under "CSV COLUMN DECISIONS" (same section we use for the CSV generator in Phase 5).

## File 3: `src/alamo/app/invoices/[id]/actions/match.ts` — refactor

Read the current file in full. Identify every line that:

- Computes `final_billed_rate` or `pre_ceiling_amount`
- Writes to `markup_type_applied` / `markup_value_applied` / `markup_source`
- Writes `billing_status = 'APPROVED'`

Remove all of it.

After refactor, match.ts should:

1. Match every line to an org (lassoed via tracking_number → shipment_ledger; dark via address_sender_normalized → locations)
2. For lassoed: compute variance = `carrier_charge - raw_carrier_cost`. If `ABS(variance) > dispute_threshold` AND NOT `is_adjustment_only`, set `match_status = 'FLAGGED'` and `billing_status = 'HELD'` with a dispute_note
3. For is_adjustment_only=TRUE lines: skip variance calc. If org found, set `match_status = 'AUTO_MATCHED'` and `billing_status = 'PENDING'`
4. For dark: address lookup. Exactly one match → `AUTO_MATCHED`, `billing_status = 'PENDING'`, store `match_location_id`. Zero or multiple → `match_status = 'FLAGGED'`, `billing_status = 'HELD'`, dispute_note "ambiguous sender address"
5. Write shipment_ledger row for dark accounts (using the new markup context columns from Phase 1 unification)
6. Update `carrier_invoices` summary counts and status
7. Log `audit_logs` entry for `MATCH_RUN`
8. At the end, IF any lines are now `AUTO_MATCHED` with `billing_status = 'PENDING'`, call `runBillingCalc(invoiceId)` and INCLUDE its result in the response

DO NOT compute final_billed_rate. DO NOT write markup context columns. DO NOT set billing_status = APPROVED in match.ts.

### Idempotency for match.ts

Re-running match.ts on the same invoice should be safe. Before updating a line, check if it already has a match_status set:

```typescript
.eq('id', line.id)
.eq('match_status', 'UNMATCHED')  // only update unmatched lines
```

If a line is already AUTO_MATCHED, FLAGGED, or MANUAL_ASSIGNED, leave it alone. The admin can explicitly reset via the Alamo UI if they need to re-match.

### Variance calculation is UNCHANGED

The variance math stays exactly as it was in Session A. variance = carrier_charge - raw_carrier_cost (both pre-markup). If Claude Code is tempted to "improve" variance logic while refactoring, DON'T. Keep it identical to the current behavior.

## File 4: `src/alamo/app/invoices/[id]/actions/resolve.ts` — refactor

Same pattern as match.ts. Read in full. Remove:

- All markup math
- All final_billed_rate writes
- All markup context column writes
- Any `billing_status = 'APPROVED'` writes

After refactor, resolve.ts should:

1. Accept a line_id and an org assignment
2. Verify the line is currently `FLAGGED` / `billing_status = 'HELD'` (idempotency guard — don't re-resolve already-resolved lines)
3. Update `org_id`, set `match_status = 'MANUAL_ASSIGNED'`, set `billing_status = 'PENDING'`
4. For dark accounts, write shipment_ledger row (with new markup context columns)
5. Log `audit_logs` entry for `DISPUTE_RESOLVED`
6. After the resolution succeeds, call `runBillingCalc(invoiceId)` to process the now-PENDING line
7. Return a summary that includes the billing-calc result

### Partial-failure handling in resolve.ts

If step 3 (line update) succeeds but step 4 (shipment_ledger write) fails, the line is resolved but the ledger is inconsistent. This is a real risk on dark accounts.

Two options:

(a) Wrap both operations in a Postgres transaction via RPC (cleanest but requires creating a Supabase RPC function)  
(b) Order operations so the ledger write happens FIRST; if it fails, the line update doesn't happen and resolve.ts throws  

Option (b) is simpler and doesn't require new RPC infrastructure. Implement it that way:

```typescript
// FIRST: write shipment_ledger row for dark accounts (if applicable)
if (carrierAccountMode === 'dark_carrier_account') {
  const { error: ledgerErr } = await supabaseAdmin
    .from('shipment_ledger')
    .insert({ /* ... */ });

  if (ledgerErr) {
    throw new Error(`Failed to write shipment_ledger: ${ledgerErr.message}. Line NOT resolved.`);
  }
}

// THEN: update the line
const { error: updateErr } = await supabaseAdmin
  .from('invoice_line_items')
  .update({
    org_id: assignedOrgId,
    match_status: 'MANUAL_ASSIGNED',
    billing_status: 'PENDING',
  })
  .eq('id', lineId)
  .eq('billing_status', 'HELD');  // idempotency guard

if (updateErr) {
  // The ledger was written but the line wasn't updated. This is bad.
  // Log loudly to audit_logs and throw so admin knows to investigate.
  await supabaseAdmin.from('audit_logs').insert({
    action: 'RESOLVE_PARTIAL_FAILURE',
    entity_type: 'invoice_line_item',
    entity_id: lineId,
    details: {
      message: 'shipment_ledger written but line update failed',
      error: updateErr.message,
    },
  });
  throw new Error(`Partial failure in resolve: ledger written, line not updated. Check audit_logs for line_id ${lineId}.`);
}
```

## File 5: UI components that call match/resolve

Search the codebase for callers of `runMatchingEngine` and `resolveDispute`. Expected locations:

- `src/alamo/app/invoices/[id]/MatchButton.tsx`
- `src/alamo/app/invoices/[id]/disputes/ResolveGroup.tsx` (or similar)

After the refactor, these components don't need structural changes — `match.ts` and `resolve.ts` now auto-trigger `runBillingCalc` internally, so the UI still just calls one function.

However, the result shape changes slightly (now includes billing-calc result). Update the TypeScript types and any "Result card" display logic to show billing-calc outcomes:

```tsx
{result.billing_calc && (
  <div className="text-sm">
    Billing Calc: {result.billing_calc.approved} approved,
    {' '}{result.billing_calc.errors.length} errors
  </div>
)}
```

If a billing-calc error appears, surface it to the admin clearly (bloom color per design system).

## Concurrency considerations

Two admins hitting "Match" on the same invoice simultaneously is unlikely in practice (there's one admin right now: Sawyer), but the pipeline should not corrupt state if it happens.

Safety mechanisms already in place:

1. Match idempotency guard (only updates UNMATCHED lines)
2. Billing Calc idempotency guard (only updates PENDING lines with matching status)
3. audit_logs append-only records every run

These are sufficient. Do NOT add explicit locking (Postgres row locks, Redis mutexes, etc.) in this session. That's over-engineering for current load.

## Migration ordering — critical

The sequence of operations for Phase 2 is:

1. Create `billing-calc.ts` with full implementation
2. Modify `match.ts` to remove markup logic AND auto-call runBillingCalc at end
3. Modify `resolve.ts` to remove markup logic AND auto-call runBillingCalc at end
4. Run the full pipeline end-to-end on the test invoice
5. Verify output matches pre-refactor Session A output within $0.01 per line

If you modify `match.ts` or `resolve.ts` BEFORE `billing-calc.ts` exists, the codebase is in a broken state (match writes PENDING but nothing sets APPROVED, so no lines become billable). Create billing-calc.ts first.

## Verification — detailed

### Correctness verification

Run the full pipeline end-to-end:

1. (If test data is stale) Sawyer re-uploads the test invoice via /invoices/upload and runs Parse
2. Click Match. Observe:
   - Match status set correctly per line
   - billing_status = PENDING for AUTO_MATCHED, HELD for FLAGGED
   - Billing Calc auto-runs immediately after
   - Billing Calc result in the response shows 950 approved, 0 errors (for the Cactus 3PL HQ test invoice)
3. Run this SQL:

```sql
SELECT billing_status, COUNT(*)
FROM invoice_line_items
WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679'
GROUP BY billing_status
ORDER BY billing_status;
```

Expected: APPROVED: 950. No PENDING, no HELD (for this test invoice — all matched cleanly in Session A).

4. Spot-check 5 rows: final_billed_rate should match Session A's pre-refactor values within $0.01.

```sql
SELECT tracking_number,
       carrier_charge,
       final_billed_rate,
       markup_type_applied, markup_value_applied, markup_source,
       billing_status
FROM invoice_line_items
WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679'
ORDER BY tracking_number
LIMIT 5;
```

### Idempotency verification

After the pipeline runs successfully, run `runBillingCalc('904d933a...')` again (via a quick test script or SQL):

```typescript
// Should return: { approved: 0, skipped: 950, errors: [] }
// because all lines are already APPROVED, idempotency guard skips them
```

If this second run shows approved > 0, the idempotency guard isn't working. STOP and fix before committing.

### Audit log verification

Check that audit_logs has entries for MATCH_RUN and BILLING_CALC_RUN:

```sql
SELECT action, entity_id, details->>'approved' AS approved_count, created_at
FROM audit_logs
WHERE entity_id = '904d933a-daa1-4006-acf9-c3983547f679'
  AND action IN ('MATCH_RUN', 'BILLING_CALC_RUN')
ORDER BY created_at DESC
LIMIT 5;
```

Both entries should be present. BILLING_CALC_RUN should show `approved_count = 950`.

### TypeScript check

```bash
cd src/alamo && npx tsc --noEmit 2>&1 | tail -20
```

Error count should stay at Session A's baseline (~1635) or drop slightly. If it grows by more than 5, investigate — likely a real regression in the refactor.

## Checkpoint

Commit:

```
git add src/alamo/lib/markup-context.ts  # if extracted here
git add src/alamo/app/invoices/[id]/actions/match.ts
git add src/alamo/app/invoices/[id]/actions/resolve.ts
git add src/alamo/app/invoices/[id]/actions/billing-calc.ts
git add <any UI files modified>
git commit -m "Session B Phase 2: pipeline restructure — Match/Billing Calc split with idempotency"
```

If correctness verification fails, STOP. Do not proceed. If idempotency verification fails, STOP. Do not proceed. The risk of proceeding with broken financial logic into later phases (which depend on Billing Calc output) is too high.

### Shared helper module: `src/alamo/lib/markup-context.ts`

If not already extracted in Phase 1, extract `deriveMarkupContext()` here. Export from this file. Both match.ts/resolve.ts (for shipment_ledger writes) and billing-calc.ts (for invoice_line_items writes) import from here.

## Verification

Run the full pipeline end-to-end on a test invoice:

1. Parse → should populate carrier_charge, is_adjustment_only, service_level, dates
2. Match → should set match_status, billing_status should be PENDING (NOT APPROVED)
3. Billing Calc (triggered automatically after Match) → should set billing_status = APPROVED, write final_billed_rate and markup context
4. Spot-check 5 rows: their final_billed_rate should equal the same math as Session A produced

Run this SQL to confirm the values after Billing Calc:

```sql
SELECT tracking_number,
       base_charge, fuel_surcharge, residential_charge,
       final_billed_rate,
       markup_type_applied, markup_value_applied, markup_source,
       billing_status
FROM invoice_line_items
WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679'
LIMIT 5;
```

If `final_billed_rate` matches pre-refactor Session A output within $0.01 for all 5 rows, Phase 2 is verified.

## Checkpoint

Commit:

```
git add src/alamo/app/invoices/[id]/actions/match.ts
git add src/alamo/app/invoices/[id]/actions/resolve.ts
git add src/alamo/app/invoices/[id]/actions/billing-calc.ts
git add src/alamo/lib/markup-context.ts
git add <any UI files modified>
git commit -m "Session B Phase 2: pipeline restructure — Match/Billing Calc split"
```

---

# PHASE 3 — MATCH STAGE SHIPMENT_EVENTS ENRICHMENT

## Goal

For lassoed lines only: during Match, populate `date_shipped` from `shipment_events.LABEL_CREATED` (overriding the Transaction Date proxy written by the parser) and populate `date_delivered` from `shipment_events.DELIVERED` if present.

Dark lines: do nothing. Transaction Date stays as date_shipped proxy; date_delivered stays NULL.

## Implementation

Modify match.ts. In the lassoed branch (after tracking_number → shipment_ledger → org_id succeeds):

```typescript
// Lassoed path: enrich dates from shipment_events
const { data: labelEvent } = await supabaseAdmin
  .from('shipment_events')
  .select('carrier_timestamp')
  .eq('shipment_ledger_id', ledger.id)
  .eq('event_type', 'LABEL_CREATED')
  .order('carrier_timestamp', { ascending: true })
  .limit(1)
  .maybeSingle();

const { data: deliveredEvent } = await supabaseAdmin
  .from('shipment_events')
  .select('carrier_timestamp')
  .eq('shipment_ledger_id', ledger.id)
  .eq('event_type', 'DELIVERED')
  .order('carrier_timestamp', { ascending: false })
  .limit(1)
  .maybeSingle();

// Build the line update
const lineUpdate = {
  org_id: ledger.org_id,
  match_status: 'AUTO_MATCHED',
  // ... other fields ...
  // Only overwrite date_shipped if shipment_events has LABEL_CREATED
  ...(labelEvent?.carrier_timestamp
      ? { date_shipped: labelEvent.carrier_timestamp.slice(0, 10) }  // YYYY-MM-DD
      : {}),
  // Only set date_delivered if shipment_events has DELIVERED
  ...(deliveredEvent?.carrier_timestamp
      ? { date_delivered: deliveredEvent.carrier_timestamp.slice(0, 10) }
      : {}),
};
```

The slicing `.slice(0, 10)` converts ISO timestamp (`2026-03-03T14:22:00Z`) to ISO date (`2026-03-03`). Verify this is correct by checking how `shipment_events.carrier_timestamp` is actually stored. If it's stored as DATE already, no slicing needed. If stored as TIMESTAMPTZ, slicing is correct for the date-only field.

**DECISION NEEDED — HALT POINT:**

The current test data on invoice 904d933a is ALL lassoed UPS lines for Cactus 3PL HQ. Do the corresponding shipment_ledger rows actually exist? Check:

```sql
SELECT COUNT(*) FROM shipment_ledger WHERE tracking_number IN (
  SELECT tracking_number FROM invoice_line_items
  WHERE carrier_invoice_id = '904d933a-daa1-4006-acf9-c3983547f679'
  LIMIT 10
);
```

If this returns 0, the test invoice's "lassoed" classification is actually based on the carrier account being `lassoed_carrier_account` mode — but there are no corresponding shipment_ledger rows from a rating engine run. That means the enrichment code can't be tested against the current data.

If this is the case, two options:
A) Document the limitation in the completion summary; the enrichment code is written correctly but can't be verified without rate-engine shipment_ledger data (which doesn't exist until Phase 2 Stage 6 of the build)
B) Seed a few fake shipment_ledger + shipment_events rows manually for 10 test tracking numbers to verify the code path works

If you go with A, note clearly in the summary that Phase 3 is written but unverified. If B, create a seeding script under `database/seeds/v1.6.1-fake-shipment-events.sql` that Sawyer can run manually to verify.

Recommend option A — rate engine is Stage 6 of Phase 1 and will provide real test data. Don't burn session time on fake data for an unreachable test.

## Verification

If option A, run `npm run build` and verify no new TypeScript errors. Done.

If option B, run the seeding, run match on the test invoice, confirm date_shipped now reads from the seeded LABEL_CREATED events on those 10 rows.

## Checkpoint

Commit:

```
git add src/alamo/app/invoices/[id]/actions/match.ts
git add <any seed files if option B>
git commit -m "Session B Phase 3: Match stage shipment_events enrichment for lassoed dates"
```

---

# PHASE 4 — SEED NEW TEST ORG + FLAT-MARKUP INVOICE DATA

## Goal

Create a new test organization with a flat-markup carrier account configuration, and seed a small invoice with flat-markup-ready line items. This gives the CSV generator (Phase 5) real data to verify flat-mode display rules.

## Data plan

**New organization:** "Pineridge Direct" — a fictional 3PL
**Carrier account:** UPS, lassoed mode, is_cactus_account = TRUE, flat fee $1.50 per shipment
**Locations:** One location, "Pineridge Main WH", in a different state from Cactus 3PL HQ's warehouses
**Invoice:** Small — 15-25 shipments, real UPS detail format
**Markup config on carrier account:** `markup_flat_fee = 1.5000`, `markup_percentage = 0.0000`, `use_rate_card = FALSE`

## Seeding approach

Create `database/seeds/v1.6.1-pineridge-flat-markup-seed.sql`:

```sql
-- v1.6.1 seed: Pineridge Direct for flat-markup testing
-- Creates a minimal org + carrier account + location + carrier invoice
-- so the CSV generator can be tested against flat-markup behavior.

BEGIN;

-- 1. Create the org
INSERT INTO organizations (id, name, org_type, terms_days, dispute_threshold_default, tracking_alert_threshold_days)
VALUES (
  'pineridge-0000-0000-0000-000000000001'::uuid,
  'Pineridge Direct',
  '3PL',
  10,
  2.00,
  3
);

-- 2. Create a location
INSERT INTO locations (id, org_id, name, address_line_1, city, state, postal_code, country,
                        normalized_address, is_billing_address)
VALUES (
  'pineridge-loc-0000-0000-000000000001'::uuid,
  'pineridge-0000-0000-0000-000000000001'::uuid,
  'Pineridge Main WH',
  '8750 E PINE RIDGE DR',
  'Boise',
  'ID',
  '83716',
  'US',
  '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
  TRUE
);

-- 3. Create a UPS carrier account for Pineridge with flat markup
INSERT INTO org_carrier_accounts (id, org_id, carrier_code, account_nickname, carrier_account_mode,
                                    is_cactus_account, markup_percentage, markup_flat_fee,
                                    use_rate_card, is_active, dispute_threshold)
VALUES (
  'pineridge-car-0000-0000-000000000001'::uuid,
  'pineridge-0000-0000-0000-000000000001'::uuid,
  'UPS',
  'Pineridge UPS',
  'lassoed_carrier_account',
  TRUE,
  0.0000,
  1.5000,
  FALSE,
  TRUE,
  2.00
);

-- 4. Create a minimal carrier_invoices row (synthetic — no real file uploaded)
-- Status APPROVED so it skips to billing calc directly for testing
INSERT INTO carrier_invoices (id, carrier_code, invoice_file_name, invoice_format,
                               status, total_amount, line_items_count, matched_line_items,
                               flagged_line_items, has_unmapped_charges)
VALUES (
  'pineridge-inv-0000-0000-000000000001'::uuid,
  'UPS',
  'pineridge-test-invoice-v1.csv',
  'DETAIL',
  'COMPLETE',
  0.00,  -- will be recomputed by billing calc
  15,
  0,
  0,
  FALSE
);

-- 5. Create 15 invoice_line_items with varied charges
-- Pattern: different service levels, zones, weights, with realistic UPS charge breakdowns
-- Mix of Ground Commercial, Ground Residential, 2nd Day Air, with/without residential surcharges

-- Tracking numbers (use obvious fake pattern so these are never confused with real data)
-- 1ZPINERIDGE000001 through 1ZPINERIDGE000015

INSERT INTO invoice_line_items (id, carrier_invoice_id, tracking_number, carrier_code, org_id,
                                  carrier_account_id, match_status, billing_status,
                                  service_level, date_shipped, date_invoiced,
                                  zone, weight_value, weight_unit,
                                  length_carrier, width_carrier, height_carrier,
                                  address_sender_line_1, address_sender_city, address_sender_state,
                                  address_sender_postal_code, address_sender_country,
                                  address_sender_normalized,
                                  address_receiver_line_1, address_receiver_city, address_receiver_state,
                                  address_receiver_postal_code, address_receiver_country,
                                  base_charge, fuel_surcharge, residential_charge,
                                  carrier_charge, is_adjustment_only,
                                  match_location_id,
                                  raw_line_data)
VALUES
  -- Row 1: Ground Commercial, zone 5, 2 lb
  ('pineridge-row-000001-000000000001'::uuid,
   'pineridge-inv-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000001', 'UPS',
   'pineridge-0000-0000-0000-000000000001'::uuid,
   'pineridge-car-0000-0000-000000000001'::uuid,
   'AUTO_MATCHED', 'PENDING',
   'Ground Commercial', '2026-04-14', '2026-04-17',
   '005', 2.0, 'LB',
   8.0, 6.0, 4.0,
   '8750 E PINE RIDGE DR', 'Boise', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '123 MAIN ST', 'Denver', 'CO', '80202', 'US',
   12.50, 1.25, 0.00, 13.75, FALSE,
   'pineridge-loc-0000-0000-000000000001'::uuid,
   '{"seed": true, "pattern": "ground_commercial_light"}'::jsonb),

  -- Row 2: Ground Residential, zone 7, 5 lb, with resi surcharge
  ('pineridge-row-000002-000000000001'::uuid,
   'pineridge-inv-0000-0000-000000000001'::uuid,
   '1ZPINERIDGE000002', 'UPS',
   'pineridge-0000-0000-0000-000000000001'::uuid,
   'pineridge-car-0000-0000-000000000001'::uuid,
   'AUTO_MATCHED', 'PENDING',
   'Ground Residential', '2026-04-14', '2026-04-17',
   '007', 5.0, 'LB',
   12.0, 10.0, 6.0,
   '8750 E PINE RIDGE DR', 'Boise', 'ID', '83716', 'US',
   '8750 E PINE RIDGE DR, BOISE, ID, 83716, US',
   '456 OAK AVE', 'Austin', 'TX', '78701', 'US',
   15.80, 1.58, 4.95, 22.33, FALSE,
   'pineridge-loc-0000-0000-000000000001'::uuid,
   '{"seed": true, "pattern": "ground_residential_medium"}'::jsonb);
  -- ... etc — repeat pattern for 13 more rows with varied services/zones/weights

-- After inserts, update carrier_invoices totals
UPDATE carrier_invoices
  SET total_amount      = (SELECT COALESCE(SUM(carrier_charge), 0) FROM invoice_line_items WHERE carrier_invoice_id = 'pineridge-inv-0000-0000-000000000001'::uuid),
      line_items_count  = (SELECT COUNT(*) FROM invoice_line_items WHERE carrier_invoice_id = 'pineridge-inv-0000-0000-000000000001'::uuid),
      matched_line_items = (SELECT COUNT(*) FROM invoice_line_items WHERE carrier_invoice_id = 'pineridge-inv-0000-0000-000000000001'::uuid AND match_status = 'AUTO_MATCHED')
  WHERE id = 'pineridge-inv-0000-0000-000000000001'::uuid;

COMMIT;
```

Expand the seed to 15 total rows with reasonable variation:
- Mix of Ground Commercial, Ground Residential, 2nd Day Air, 2nd Day Air Residential
- Zones 002-008
- Weights 1-20 lb
- Some with residential surcharges, some without
- Some with delivery_area_charge, some without
- One row with is_adjustment_only = TRUE (no base_charge, just apv_adjustment)
- Total carrier_charge across all rows should be in $200-400 range

After seed runs, invoking `runBillingCalc('pineridge-inv-0000-0000-000000000001')` should produce `final_billed_rate` values that follow the flat markup rule: base_charge + $1.50, all surcharges pass through. CSV generation (Phase 5) should then render this correctly.

## Verification

After seed runs:

```sql
-- Should return 15 rows
SELECT COUNT(*) FROM invoice_line_items WHERE carrier_invoice_id = 'pineridge-inv-0000-0000-000000000001'::uuid;

-- Trigger billing calc manually via a node script or via the UI
-- After billing calc:
SELECT tracking_number, base_charge, fuel_surcharge, residential_charge,
       final_billed_rate, markup_type_applied, markup_value_applied, markup_source
FROM invoice_line_items
WHERE carrier_invoice_id = 'pineridge-inv-0000-0000-000000000001'::uuid
ORDER BY tracking_number;

-- Expected for flat: markup_type_applied = 'flat', markup_value_applied = 1.500000
-- final_billed_rate = base + 1.50 + fuel + resi + other (no ceiling)
```

Spot-check 3 rows manually — confirm `final_billed_rate = base_charge + 1.50 + fuel_surcharge + residential_charge` exactly.

## Checkpoint

Commit:

```
git add database/seeds/v1.6.1-pineridge-flat-markup-seed.sql
git commit -m "Session B Phase 4: seed Pineridge Direct for flat-markup testing"
```

---

# PHASE 5 — 85-COLUMN CLIENT CSV GENERATOR + SAMPLE OUTPUTS

## Goal

Rewrite `src/alamo/app/billing/[id]/actions/csv.ts` to produce the full 85-column "detail format" that is now Cactus's canonical client-facing CSV standard. Generate sample CSVs for both Cactus 3PL HQ (percentage markup) and Pineridge Direct (flat markup) and save them for human review.

## Column specification

The 85 columns, in exact order, with source and transformation rules.

For each column, the notation is:

```
[N] column_name — source (transformation) — display rule
```

Source key:
- `ili.X` = `invoice_line_items.X`
- `org.X` = `organizations.X`
- `loc.X` = `locations.X` (from match_location_id)
- `ledger.X` = `shipment_ledger.X` (lassoed only)
- `events.X` = computed from `shipment_events` (lassoed only)
- `computed` = derived from multiple sources
- `static` = hardcoded value

### Identifiers (columns 1-6)

```
[1]  Tracking Number                  — ili.tracking_number — prefix with tab char '\t' to prevent Excel sci notation
[2]  Cactus Invoice Number             — cactus_invoices.id (first 8 chars) — always populated
[3]  Cactus Line Item ID               — ili.id — full UUID
[4]  Carrier Invoice File              — ili.carrier_invoice_id → carrier_invoices.invoice_file_name
[5]  Carrier                           — ili.carrier_code
[6]  Service Level                     — ili.service_level — empty if NULL
```

### Dates (columns 7-10)

```
[7]  Date Shipped                      — ili.date_shipped (ISO YYYY-MM-DD)
[8]  Date Delivered                    — ili.date_delivered (ISO YYYY-MM-DD) — empty if NULL
[9]  Date Invoiced                     — ili.date_invoiced (ISO YYYY-MM-DD)
[10] Date Billed (Cactus invoice)      — cactus_invoices.created_at (ISO date)
```

### Shipment meta (columns 11-16)

```
[11] Zone                              — ili.zone — empty if NULL
[12] Weight                            — ili.weight_value (decimal, 2 places)
[13] Weight Unit                       — ili.weight_unit
[14] Billable Weight                   — ili.billable_weight (decimal, 2 places) — empty if NULL
[15] Billable Weight Unit              — ili.billable_weight_unit — empty if NULL
[16] Residential Flag                  — computed: 'Y' if service_level contains 'Residential', else 'N'
```

### Dimensions — entered (columns 17-20)

```
[17] Length Entered                    — ili.length_entered (decimal, 2 places) — empty if NULL
[18] Width Entered                     — ili.width_entered (decimal, 2 places) — empty if NULL
[19] Height Entered                    — ili.height_entered (decimal, 2 places) — empty if NULL
[20] Dim Unit Entered                  — ili.dim_unit_entered — empty if NULL
```

### Dimensions — carrier measured (columns 21-24)

```
[21] Length Carrier                    — ili.length_carrier (decimal, 2 places) — empty if NULL
[22] Width Carrier                     — ili.width_carrier (decimal, 2 places) — empty if NULL
[23] Height Carrier                    — ili.height_carrier (decimal, 2 places) — empty if NULL
[24] Dim Unit Carrier                  — ili.dim_unit_carrier — empty if NULL
```

### Sender address (columns 25-32)

```
[25] Sender Name                       — ili.address_sender_name (empty if NULL)
[26] Sender Company                    — ili.address_sender_company (empty if NULL)
[27] Sender Address Line 1             — ili.address_sender_line_1
[28] Sender Address Line 2             — ili.address_sender_line_2 (empty if NULL)
[29] Sender City                       — ili.address_sender_city
[30] Sender State                      — ili.address_sender_state
[31] Sender Postal Code                — ili.address_sender_postal_code
[32] Sender Country                    — ili.address_sender_country
```

### Receiver address (columns 33-40)

```
[33] Receiver Name                     — ili.address_receiver_name (empty if NULL)
[34] Receiver Company                  — ili.address_receiver_company (empty if NULL)
[35] Receiver Address Line 1           — ili.address_receiver_line_1
[36] Receiver Address Line 2           — ili.address_receiver_line_2 (empty if NULL)
[37] Receiver City                     — ili.address_receiver_city
[38] Receiver State                    — ili.address_receiver_state
[39] Receiver Postal Code              — ili.address_receiver_postal_code
[40] Receiver Country                  — ili.address_receiver_country
```

### References (columns 41-45)

```
[41] Reference 1                       — ili.reference_1 (empty if NULL)
[42] Reference 2                       — ili.reference_2 (empty if NULL)
[43] Reference 3                       — ili.reference_3 (empty if NULL)
[44] PO Number                         — ili.po_number (empty if NULL)
[45] Invoice Number (client PO ref)    — ili.client_invoice_number (empty if NULL)
```

### Carrier cost (columns 46-47) — display rule: DARK ACCOUNTS ONLY

```
[46] Carrier Charge (pre-markup)       — ili.carrier_charge — LASSOED: empty; DARK: populated
[47] Carrier Charge Currency           — static 'USD' — LASSOED: empty; DARK: populated
```

### Billed charge components (columns 48-62) — display rule: computed per markup type

For PERCENTAGE markup lines: each component shows the raw value × (1 + markup_value_applied), displayed to 2 decimal places. The sum of these across a single line is within $0.01 of final_billed_rate (fractional-cent rounding).

For FLAT markup lines: columns 48 shows `base_charge + markup_value_applied`; all other charge columns show the raw value. Sum exactly equals final_billed_rate.

```
[48] Base Charge (Billed)              — computed: see markup rules above
[49] Fuel Surcharge (Billed)           — computed: see markup rules above
[50] Residential Surcharge (Billed)    — computed: see markup rules above
[51] Delivery Area Surcharge (Billed)  — computed: see markup rules above
[52] DIM Weight Charge (Billed)        — computed: see markup rules above
[53] Saturday Delivery (Billed)        — computed: see markup rules above (if column exists on ili)
[54] Signature Charge (Billed)         — computed: see markup rules above (if column exists on ili)
[55] Address Correction (Billed)       — computed: see markup rules above (if column exists on ili)
[56] Large Package (Billed)            — computed: see markup rules above (if column exists on ili)
[57] Additional Handling (Billed)      — computed: see markup rules above (if column exists on ili)
[58] Hazmat (Billed)                   — computed: see markup rules above (if column exists on ili)
[59] Return to Sender (Billed)         — computed: see markup rules above (if column exists on ili)
[60] Other Surcharges (Billed)         — computed: see markup rules above
[61] Adjustment (Billed)               — computed: see markup rules above
[62] Currency                          — static 'USD'
```

**IMPORTANT for columns 53-59:** These columns may or may not exist on invoice_line_items. Check the schema first. If a column doesn't exist, OMIT that CSV column entirely (shifting downstream column numbers) AND adjust the total column count to match. Alternatively, include the column header in the CSV but leave all values empty. Choose the approach that's most consistent with how the parser handles these surcharges — if the parser routes them to `other_surcharges`, don't make a dedicated CSV column for them.

Document your choice explicitly in the completion summary under "CSV column decisions."

### Totals (columns 63-66)

```
[63] Carrier Total (pre-markup)        — ili.carrier_charge — LASSOED: empty; DARK: populated
[64] Markup Type                       — ili.markup_type_applied ('percentage' or 'flat')
[65] Markup Value                      — ili.markup_value_applied (decimal, 6 places for percentage; 2 places for flat)
[66] Shipment Total (Billed)           — ili.final_billed_rate — AUTHORITATIVE — always populated
```

### Variance & disputes (columns 67-70)

```
[67] Variance Amount                   — ili.variance_amount — empty if NULL or is_adjustment_only
[68] Dispute Flag                      — 'Y' if ili.dispute_flag = TRUE, else 'N'
[69] Dispute Status                    — ili.dispute_status — empty if NULL
[70] Is Adjustment Only                — 'Y' if TRUE else 'N'
```

### Organizational (columns 71-76)

```
[71] Org Name                          — org.name
[72] Origin Location Name              — loc.name — empty if match_location_id is NULL
[73] Carrier Account Mode              — ili.carrier_account_mode (denormalized; or join via carrier_account_id)
[74] Is Cactus Account                 — 'Y' if is_cactus_account = TRUE else 'N'
[75] Match Method                      — ili.match_method (TRACKING_NUMBER | SHIP_FROM_ADDRESS | MANUAL)
[76] Match Status                      — ili.match_status (AUTO_MATCHED | MANUAL_ASSIGNED | FLAGGED)
```

### Timing (columns 77-80)

```
[77] Billing Period Start              — cactus_invoices.billing_period_start (ISO date)
[78] Billing Period End                — cactus_invoices.billing_period_end (ISO date)
[79] Due Date                          — cactus_invoices.due_date (ISO date)
[80] Terms (days)                      — org.terms_days
```

### Audit / traceability (columns 81-85)

```
[81] Parsed At                         — ili.created_at (ISO date, Alamo-internal only — consider hiding in production)
[82] Matched At                        — computed: audit_logs entry for MATCH_RUN on this invoice, empty if missing
[83] Billed At                         — cactus_invoices.created_at (ISO datetime)
[84] Markup Source                     — ili.markup_source (carrier_account | rate_card)
[85] Notes                             — ili.dispute_notes OR parser notes, free-text, empty if none
```

## File format conventions (reinforced)

From v1.6.0 briefing:
- Tracking numbers: tab-prefix with `'\t'` char
- Dates: ISO YYYY-MM-DD (empty string, not 'NULL', if missing)
- Currency: plain decimal, 2 decimal places, no symbol
- CSV dialect: RFC 4180, CRLF line endings (`\r\n`), UTF-8 with BOM (`\xEF\xBB\xBF` at start)
- Quoting: standard RFC 4180 — quote fields containing commas/quotes/newlines
- Column headers: row 1 (no metadata rows above)
- Filename: `{org-slug}-cactus-invoice-{week-end-date}.csv`
  - org-slug = kebab-cased org name, e.g. "cactus-3pl-headquarters"
  - week-end-date = cactus_invoices.billing_period_end in YYYY-MM-DD format
- Footnote: last row of CSV, single cell containing: `"Shipment Total (col 66) is authoritative. Per-charge billed values may reflect fractional-cent display rounding."`

## Implementation architecture

The CSV generator is a server action that runs in response to a user clicking "Download CSV" on `/billing/[id]`. It has three distinct phases: LOAD (fetch all data), TRANSFORM (compute values per row per markup type), and WRITE (format and stream back to browser).

### File structure

```
src/alamo/app/billing/[id]/actions/csv.ts   # server action — orchestrator
src/alamo/lib/csv/column-spec.ts            # column definitions, display rules
src/alamo/lib/csv/transforms.ts             # per-row transformations
src/alamo/lib/csv/writer.ts                 # RFC 4180 compliant writer with BOM
src/alamo/lib/csv/format.ts                 # formatting helpers (dates, decimals)
```

Split the logic so the transform module (the hardest-to-get-right part) can be unit-testable independently. Even without writing formal tests in this session, isolating pure functions makes debugging the sample CSVs much easier.

### LOAD phase — query strategy

The naive approach — SELECT * FROM invoice_line_items + per-row joins — would issue 950+ queries and take minutes. Instead, use a single composite query with left joins:

```typescript
const { data: rows, error } = await supabaseAdmin
  .from('invoice_line_items')
  .select(`
    *,
    org:organizations!invoice_line_items_org_id_fkey (
      id, name, terms_days
    ),
    location:locations!invoice_line_items_match_location_id_fkey (
      id, name, address_line_1, city, state
    ),
    carrier_invoice:carrier_invoices!invoice_line_items_carrier_invoice_id_fkey (
      id, invoice_file_name, carrier_code
    ),
    carrier_account:org_carrier_accounts!invoice_line_items_carrier_account_id_fkey (
      id, carrier_account_mode, is_cactus_account
    )
  `)
  .eq('carrier_invoice_id', invoiceId)  // or filter by cactus_invoice relationship
  .order('tracking_number', { ascending: true });
```

Verify the exact foreign key names in your schema — Supabase autogenerates these and they may not match my guesses. Run:

```sql
SELECT constraint_name, column_name
FROM information_schema.key_column_usage
WHERE table_name = 'invoice_line_items'
  AND constraint_name LIKE '%fkey%'
ORDER BY constraint_name;
```

Update the `!fk_name` hints in the SELECT to match actual constraint names. If Supabase's PostgREST syntax for FK joins fails (which happens when multiple FKs point to the same table), fall back to separate queries followed by in-memory joining.

### LOAD phase — cactus_invoices join

`cactus_invoices` data (billing_period_start, billing_period_end, due_date, created_at) is needed for columns 10, 77-79, 83. Load it separately since the relationship is through `cactus_invoice_line_items` junction:

```typescript
// Find which cactus_invoice(s) cover these line items
const { data: junctionRows } = await supabaseAdmin
  .from('cactus_invoice_line_items')
  .select('cactus_invoice_id, invoice_line_item_id')
  .in('invoice_line_item_id', rows.map(r => r.id));

const cactusInvoiceIds = [...new Set(junctionRows.map(j => j.cactus_invoice_id))];

const { data: cactusInvoices } = await supabaseAdmin
  .from('cactus_invoices')
  .select('id, billing_period_start, billing_period_end, due_date, created_at')
  .in('id', cactusInvoiceIds);

const cactusInvoiceMap = new Map(cactusInvoices.map(ci => [ci.id, ci]));
const lineItemToCactusInvoice = new Map(junctionRows.map(j => [j.invoice_line_item_id, j.cactus_invoice_id]));
```

### LOAD phase — audit_logs for column 82 (Matched At)

Column 82 is the timestamp of the MATCH_RUN audit_logs entry for this invoice. There's one MATCH_RUN entry per carrier invoice, so load it once:

```typescript
const { data: matchLog } = await supabaseAdmin
  .from('audit_logs')
  .select('created_at')
  .eq('action', 'MATCH_RUN')
  .eq('entity_id', invoiceId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

const matchedAt = matchLog?.created_at ?? null;
```

### TRANSFORM phase — the per-row computation

For each row, produce an array of 85 (or adjusted count) string values in column order. Each column has its own transform function.

The transform boundary is where NULL → empty string happens. Upstream, values can be any type. Downstream of transform, every cell is a string ready to write.

Column 48-61 (billed charge components) need special handling per markup type. Structure this as a dispatcher:

```typescript
import Decimal from 'decimal.js';

interface BilledCharges {
  base: string;
  fuel: string;
  residential: string;
  delivery_area: string;
  dim_weight: string;
  other: string;
  adjustment: string;
  // ... plus any additional surcharge columns included
}

function computeBilledCharges(
  row: RowWithJoins,
  markupType: 'percentage' | 'flat',
  markupValue: Decimal,
): BilledCharges {
  if (markupType === 'percentage') {
    const factor = new Decimal(1).plus(markupValue);
    return {
      base:          new Decimal(row.base_charge          ?? 0).times(factor).toFixed(2),
      fuel:          new Decimal(row.fuel_surcharge       ?? 0).times(factor).toFixed(2),
      residential:   new Decimal(row.residential_charge   ?? 0).times(factor).toFixed(2),
      delivery_area: new Decimal(row.delivery_area_charge ?? 0).times(factor).toFixed(2),
      dim_weight:    new Decimal(row.dim_weight_charge    ?? 0).times(factor).toFixed(2),
      other:         new Decimal(row.other_surcharges     ?? 0).times(factor).toFixed(2),
      adjustment:    new Decimal(row.apv_adjustment       ?? 0).times(factor).toFixed(2),
    };
  }

  // FLAT markup: flat fee applies once to base; surcharges pass through raw
  // Exception: is_adjustment_only — see Phase 2 decision; default = no flat fee applied
  const baseWithFlat = row.is_adjustment_only
    ? new Decimal(0)
    : new Decimal(row.base_charge ?? 0).plus(markupValue);

  return {
    base:          baseWithFlat.toFixed(2),
    fuel:          new Decimal(row.fuel_surcharge       ?? 0).toFixed(2),
    residential:   new Decimal(row.residential_charge   ?? 0).toFixed(2),
    delivery_area: new Decimal(row.delivery_area_charge ?? 0).toFixed(2),
    dim_weight:    new Decimal(row.dim_weight_charge    ?? 0).toFixed(2),
    other:         new Decimal(row.other_surcharges     ?? 0).toFixed(2),
    adjustment:    new Decimal(row.apv_adjustment       ?? 0).toFixed(2),
  };
}
```

All money values use `toFixed(2)` to produce exactly two decimal places. Do NOT use `Number.toFixed()` — that's float math. Use `Decimal.toFixed()`.

### TRANSFORM phase — dark-account suppression for columns 46-47, 63

Carrier cost fields are blank for lassoed accounts (client shouldn't see our cost) and populated for dark accounts (they were told we bill based on their carrier invoice).

```typescript
const isLassoed = row.carrier_account?.carrier_account_mode === 'lassoed_carrier_account';

const col46_carrier_charge = isLassoed ? '' : new Decimal(row.carrier_charge ?? 0).toFixed(2);
const col47_carrier_currency = isLassoed ? '' : 'USD';
const col63_carrier_total = isLassoed ? '' : new Decimal(row.carrier_charge ?? 0).toFixed(2);
```

### TRANSFORM phase — formatting helpers

Create pure functions for consistent formatting:

```typescript
// Dates: ISO YYYY-MM-DD; empty if null
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const iso = typeof value === 'string' ? value : value.toISOString();
  return iso.slice(0, 10);  // YYYY-MM-DD
}

// Timestamps: full ISO 8601; empty if null
export function formatTimestamp(value: string | Date | null | undefined): string {
  if (!value) return '';
  return typeof value === 'string' ? value : value.toISOString();
}

// Decimals: fixed 2-place, never null
export function formatMoney(value: string | number | Decimal | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return new Decimal(value).toFixed(2);
}

// Decimals with custom precision
export function formatDecimal(value: string | number | Decimal | null | undefined, places: number): string {
  if (value === null || value === undefined || value === '') return '';
  return new Decimal(value).toFixed(places);
}

// Tracking numbers: tab-prefixed
export function formatTracking(value: string | null | undefined): string {
  if (!value) return '';
  return '\t' + value;
}

// Booleans → Y/N
export function formatYN(value: boolean | null | undefined): string {
  return value === true ? 'Y' : 'N';
}

// Strings with null fallback
export function formatString(value: string | null | undefined): string {
  return value ?? '';
}
```

### WRITE phase — the writer

Write directly, do NOT use `csv-stringify` without verifying it emits all the right bytes. The risk is that a library emits LF instead of CRLF, or skips the BOM, and then the client's Excel doesn't read the file correctly.

```typescript
const CRLF = '\r\n';
const UTF8_BOM = '\ufeff';

function escapeCell(value: string): string {
  // RFC 4180: quote fields containing comma, quote, or newline
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function writeRow(cells: string[]): string {
  return cells.map(escapeCell).join(',') + CRLF;
}

function buildCsv(headers: string[], dataRows: string[][], footnote?: string): string {
  let out = UTF8_BOM;
  out += writeRow(headers);
  for (const row of dataRows) {
    out += writeRow(row);
  }
  if (footnote) {
    // Footnote on its own row, single cell
    out += writeRow([footnote]);
  }
  return out;
}
```

### Complete CSV orchestrator — pseudocode

```typescript
'use server';

export async function generateCactusInvoiceCsv(cactusInvoiceId: string): Promise<string> {
  // 1. LOAD
  const rows = await loadLineItems(cactusInvoiceId);
  const cactusInvoice = await loadCactusInvoice(cactusInvoiceId);
  const matchLogs = await loadMatchLogsForInvoices(rows.map(r => r.carrier_invoice_id));

  // 2. TRANSFORM
  const dataRows: string[][] = rows.map(row => transformRow(row, cactusInvoice, matchLogs));

  // 3. BUILD HEADERS
  const headers = COLUMN_SPEC.map(c => c.name);

  // 4. WRITE
  const footnote = 'Shipment Total (col 66) is authoritative. Per-charge billed values may reflect fractional-cent display rounding.';
  return buildCsv(headers, dataRows, footnote);
}
```

### Wiring to the Download button

The existing `/api/billing/[id]/csv/route.ts` should call `generateCactusInvoiceCsv(cactusInvoiceId)`, set appropriate response headers, and stream the string back:

```typescript
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const csv = await generateCactusInvoiceCsv(params.id);
  const filename = await buildFilename(params.id);  // {org-slug}-cactus-invoice-{week-end}.csv

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

### Filename generation

```typescript
async function buildFilename(cactusInvoiceId: string): Promise<string> {
  const { data: invoice } = await supabaseAdmin
    .from('cactus_invoices')
    .select('billing_period_end, org:organizations (name)')
    .eq('id', cactusInvoiceId)
    .single();

  const orgSlug = invoice.org.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '');       // trim leading/trailing hyphens

  const weekEnd = invoice.billing_period_end.slice(0, 10);  // YYYY-MM-DD

  return `${orgSlug}-cactus-invoice-${weekEnd}.csv`;
}
```

Examples:
- Cactus 3PL Headquarters, week ending 2026-03-14 → `cactus-3pl-headquarters-cactus-invoice-2026-03-14.csv`
- Pineridge Direct, week ending 2026-04-17 → `pineridge-direct-cactus-invoice-2026-04-17.csv`

### Edge cases — explicit handling

**Empty line items list.** If no line items match, return a CSV with just the header row + footnote. Do not throw.

**Line with org but no carrier_account (should not happen, but defend against).** Log to audit_logs with action `CSV_MISSING_CARRIER_ACCOUNT`, include row in output with empty markup-related columns. Do not skip the row silently.

**Line with is_adjustment_only = TRUE in a flat-markup invoice.** Per the Phase 2 decision default, do NOT apply flat fee. `base` column shows `0.00`, `adjustment` column shows the raw adjustment value. Shipment total equals the adjustment plus any surcharges.

**Receiver address entirely NULL (edge case from parser).** All receiver columns emit as empty. Do not fabricate data.

**Very long field value (>1KB in a single cell).** RFC 4180 handles it fine — quoted field with escaped quotes. Don't truncate. Client Excel handles multi-line quoted cells.

**Newlines inside a cell value (e.g. dispute_notes with line breaks).** Preserve them. Escape the cell. Most spreadsheet apps render them as wrapped text.

### Performance expectations

For 950 rows with the composite query + in-memory transform, the full CSV should build in under 3 seconds on a dev laptop. If it takes longer, profile. The join query is the expensive part; the transform should be fast.

For 10,000 rows (future Pineridge-scale client), the target is under 10 seconds. If we exceed that later, streaming writes (instead of string concat) become important, but 10K rows as a concatenated string is still a manageable ~5-10 MB of memory.

Do NOT stream in this session. Flat return is fine.

## Sample generation

After implementation is complete, generate three sample files and save to `/mnt/user-data/outputs/`.

### Sample 1: Cactus 3PL HQ (percentage markup) — full size

Source: the cactus_invoices row associated with carrier invoice 904d933a. Should contain all 950 line items at 15% percentage markup.

Path: `/mnt/user-data/outputs/sample-csv-percentage-cactus-3pl-hq.csv`

Method: identify the cactus_invoice_id from the cactus_invoice_line_items junction table; call `generateCactusInvoiceCsv(cactusInvoiceId)`; write the result to disk.

```typescript
import fs from 'fs/promises';

const csv = await generateCactusInvoiceCsv('CACTUS_3PL_HQ_INVOICE_ID');
await fs.writeFile('/mnt/user-data/outputs/sample-csv-percentage-cactus-3pl-hq.csv', csv, 'utf8');
```

(Note: `csv` is already a string with BOM; writing with encoding 'utf8' preserves the BOM character as intended.)

### Sample 2: Pineridge Direct (flat markup) — small size

Source: the cactus_invoice for the Pineridge seed (15 line items, flat $1.50 markup).

Path: `/mnt/user-data/outputs/sample-csv-flat-pineridge.csv`

### Sample 3: Smoke test (tiny) — format-only

Same as Sample 1, but only the first 5 data rows. Use this for eyeball format verification — 5 rows is small enough to inspect every cell.

Path: `/mnt/user-data/outputs/sample-csv-smoke-test.csv`

Method: generate the full percentage CSV, parse it to extract header + first 5 rows + footnote, write that subset.

## Verification — comprehensive

The sample CSVs MUST pass every check below before the session is declared complete.

### Format checks (automated)

Run these in bash and report the output in your completion summary:

```bash
cd /mnt/user-data/outputs/

# Check 1: UTF-8 BOM present (first 3 bytes should be ef bb bf)
head -c 3 sample-csv-smoke-test.csv | xxd
# Expected: 00000000: efbb bf

# Check 2: CRLF line endings (should see 0d 0a, not just 0a)
head -c 200 sample-csv-smoke-test.csv | xxd | head -5
# Expected: multiple 0d 0a pairs

# Check 3: Column count in header (expected: 85 or adjusted count)
head -1 sample-csv-smoke-test.csv | awk -F',' '{print NF}'
# Expected: 85 (or documented adjusted count)

# Check 4: Line count in full percentage sample
wc -l sample-csv-percentage-cactus-3pl-hq.csv
# Expected: ~952 (1 header + 950 data + 1 footnote)

# Check 5: Line count in flat sample
wc -l sample-csv-flat-pineridge.csv
# Expected: 17 (1 header + 15 data + 1 footnote)

# Check 6: Tracking number tab-prefix on data rows
head -5 sample-csv-smoke-test.csv | tail -3 | cut -c 1-2 | xxd
# First byte of each data row should be 09 (tab char)
```

### Numeric checks (percentage markup sample)

Pick 3 random rows from Sample 1. For each, compute by hand:

- Sum of columns 48-61 (billed charge components)
- Compare to column 66 (Shipment Total / final_billed_rate)

They must match within $0.01 (single-ceiling rounds up to next cent; sum of per-component rounded-to-2-places can drift up to ~$0.01 due to fractional-cent accumulation).

If the drift exceeds $0.01 on any row, the math is wrong. STOP and diagnose.

### Numeric checks (flat markup sample)

Pick 3 random rows from Sample 2. For each:

- Column 48 (Base Billed) should equal raw base_charge + $1.50 (for non-adjustment rows)
- Columns 49-61 should equal their raw values exactly
- Sum of columns 48-61 should equal column 66 EXACTLY (no $0.01 drift — flat doesn't introduce fractional cents)

Also verify: if any row has is_adjustment_only = TRUE, column 48 should be `0.00` and column 61 (Adjustment) should be the raw adjustment — no flat fee applied. Row total = the adjustment. No base charge means no flat fee per the Phase 2 decision.

### Field-level checks (smoke test sample)

Open `/mnt/user-data/outputs/sample-csv-smoke-test.csv` in a text editor and eyeball:

- Column 1 (Tracking) starts with `\t` then `1ZCACTUS...` or `1ZPINERIDGE...`
- Column 7 (Date Shipped) is ISO `YYYY-MM-DD` format
- Column 12 (Weight) is a plain decimal like `2.00` not `2.0` or `2`
- Column 31 (Sender Postal Code) is a 5-digit string like `83716`, not stripped of leading zeros
- Column 64 (Markup Type) is lowercase `percentage` or `flat`
- Empty cells are literally empty (consecutive commas `,,`), not `NULL`

### Round-trip check (Excel compatibility)

If possible: open sample-csv-smoke-test.csv in Excel (or LibreOffice). Confirm:

- Tracking numbers display as text, not scientific notation
- Dates display as dates
- Currency values display as numbers with 2 decimal places
- No "data may be lost" warnings

If you can't open it in Excel from inside the session, note in completion summary that this check is pending Sawyer's review.

### Failure mode — what to do if verification fails

If any numeric check fails: STOP. Do not declare Phase 5 complete. Document the failure precisely (which row, which column, expected vs actual). The bug is almost certainly in the transform module — that's where complexity lives. Debug by adding console.log to the transform helpers, regenerating the sample, and inspecting.

If any format check fails (wrong BOM, wrong line endings, wrong column count): STOP. The writer module is wrong.

If format checks pass but numeric checks fail: the writer is right, the math is wrong. Phase 5 commit is acceptable but mark clearly that samples need human review.

If format checks fail but numeric checks pass: the writer is wrong even though the data is right. STOP and fix the writer.

## Checkpoint

Commit:

```
git add src/alamo/app/billing/[id]/actions/csv.ts
git add src/alamo/lib/csv/   # all the new lib files
git commit -m "Session B Phase 5: 85-column client CSV generator for both markup modes"
```

DO NOT commit the sample CSVs — they're outputs for Sawyer's review, not source code. Do NOT delete them — Sawyer needs them for the review step.

---

# PHASE 6 — POLISH ITEMS

Four small UI tasks. Each is independent — if one is ambiguous, skip it and note in summary.

## 6A: Service Level + Date Shipped columns on carrier invoice page

Page: `src/alamo/app/invoices/[id]/page.tsx`
Current line items table has columns: Tracking/Address, Org, Carrier Charge, Billed Amount, Variance, Status.
Add two new columns between Org and Carrier Charge: Service Level, Date Shipped.

Service column max-width 120px with ellipsis for overflow.
Date Shipped uses short format (M/D/YY) for space.

## 6B: "Billed in {org} — week of {date} →" breadcrumb link

On `src/alamo/app/invoices/[id]/page.tsx`, above the line items table, add a link visible when a cactus_invoice exists for any line item in this carrier invoice.

The link navigates to `/billing/[cactus_invoice_id]`. Text format: `Billed in {org.name} — week of {cactus_invoices.billing_period_end as M/D/YY} →`

If multiple cactus_invoices exist (multiple orgs on one carrier invoice), show one line per cactus_invoice. Styled as a small text link, not a button. Placed in the breadcrumb area next to or below the existing "Carrier Invoices / filename.csv" breadcrumb.

## 6C: Line item drill-down on /billing/[id]

Page: `src/alamo/app/billing/[id]/page.tsx`

When user clicks any row in the line items table, open a side panel or modal that displays ALL 85 fields for that single shipment. Read directly from invoice_line_items (join to org_carrier_accounts, locations, carrier_invoices, cactus_invoices as needed).

Organize the 85 fields into groups matching the CSV column structure (Identifiers, Dates, Dimensions, Addresses, Charges, etc.). Two-column layout within each group: label on left, value on right.

Close on click-outside or ESC key. No editing in this panel — read-only.

Empty values display as `—` em-dash, not empty.

## 6D: Service column truncation fix on /billing/[id]

Current behavior shows "Ground Comm..." truncated mid-word. Fix: either widen the column, or use CSS `text-overflow: ellipsis` with a hover-to-show-full tooltip.

Preferred: add `title={serviceLevel}` attribute to the cell so hover shows full value, and set `max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` CSS.

## Checkpoint

Commit:

```
git add src/alamo/app/invoices/[id]/page.tsx
git add src/alamo/app/billing/[id]/page.tsx
git commit -m "Session B Phase 6: polish — service level, date shipped, breadcrumb, drill-down, truncation"
```

---

# PHASE 7 — PRE-EXISTING CLEANUP

Lower priority than the architectural phases, but worth completing if time allows. Each sub-phase is independent — if one proves harder than expected, skip it and move to the next.

Order the sub-phases as below. 7A is the most important because it unblocks `seed-data.sql` being usable for future fresh deployments. 7B is pure hygiene. 7C can be deep and is optional.

## 7A: Update seed-data.sql and verify-data.sql for v1.6.0 schema

### Current state

Both files were written against the v1.5.x schema and have been drifting since. Per Session A notes:

- `database/seed-data.sql` writes to `invoice_line_items.markup_percentage` (dropped), references `final_merchant_rate` (renamed), references `ship_from_address_*` (renamed to `address_sender_*` in v1.4.2)
- `database/verify-data.sql` CHECK 8 selects `ili.markup_percentage` (dropped) and `ili.ship_from_address_normalized` (renamed). That check has been broken since v1.4.2, Session A just made it slightly more broken.

### Goal

After this sub-phase:
- Running `database-setup.sql` + `seed-data.sql` + all v1.6.0 migrations + v1.6.1 migration against a fresh Supabase produces a working test environment
- `verify-data.sql` runs all 10 checks and all pass

### 7A.1 — Read and understand seed-data.sql in full

Before editing, read the entire file. Identify every INSERT into `invoice_line_items`. Identify every reference to dropped or renamed columns. Make a list.

Common finds you should expect:
- `markup_percentage` on `invoice_line_items` INSERTs → remove (column no longer exists)
- `markup_flat_fee` on `invoice_line_items` INSERTs → remove
- `final_merchant_rate` → rename to `final_billed_rate`
- `ship_from_address_line_1` / `ship_from_address_city` / etc → rename to `address_sender_line_1` / `address_sender_city` / etc
- `ship_from_address_normalized` → rename to `address_sender_normalized`
- Any synthetic final_merchant_rate calculation → remove (Billing Calc produces it now; seed data can leave `final_billed_rate = NULL` and `billing_status = 'PENDING'` so that running Billing Calc populates it)

Also check if seed-data.sql has INSERTs into `shipment_ledger`. If so, those need the v1.6.1 markup context columns too (from Phase 1 of this session).

### 7A.2 — Decision on seed-data.sql approach

Two options:

(a) **Minimal fix** — just update column names, leave the seed producing PENDING line items that need Match + Billing Calc run to finish. Simpler but means any fresh deployment requires clicking Match in the Alamo to get test data to APPROVED state.

(b) **Full fix** — update column names AND pre-compute the markup context + final_billed_rate values so seed produces APPROVED lines ready for invoice generation. More work but seed alone gives a fully-ready test state.

Recommend (a) for this session — it's simpler and matches the reality that seed data should reflect the actual pipeline flow. Document the choice and note that option (b) is a future improvement.

### 7A.3 — Edit seed-data.sql

Apply the column renames. For every INSERT to `invoice_line_items`:

- Replace `markup_percentage` column in the column list and the VALUES with... nothing (drop the column entirely from the INSERT — it doesn't exist on the table anymore)
- Replace `markup_flat_fee` same way
- Replace `final_merchant_rate` with `final_billed_rate` where the name appears; OR drop the column + value entirely from INSERTs so the row is seeded as PENDING (recommended per 7A.2 option (a))
- Replace `ship_from_address_*` with `address_sender_*`
- Ensure any inserts set `billing_status = 'PENDING'` (not 'APPROVED')
- Ensure any inserts set `is_adjustment_only = FALSE` (new v1.6.0 column with NOT NULL constraint)

For INSERTs to `shipment_ledger`, update per Phase 1 of this session:
- Remove `markup_percentage`, `markup_flat_fee`
- Add `markup_type_applied`, `markup_value_applied`, `markup_source`

If the seed inserts any `shipment_ledger` rows with fake rate-shop data, use `markup_type_applied = 'percentage'`, `markup_value_applied = '0.150000'`, `markup_source = 'carrier_account'` as reasonable defaults.

### 7A.4 — Edit verify-data.sql

CHECK 8 is the broken one. Read it first, understand what it was trying to verify. Rewrite to use current schema:

```sql
-- OLD (broken):
SELECT COUNT(*) FROM invoice_line_items ili
  WHERE ili.markup_percentage IS NOT NULL
    AND ili.ship_from_address_normalized IS NULL;

-- NEW (v1.6.0 aware):
SELECT COUNT(*) FROM invoice_line_items ili
  WHERE ili.billing_status = 'APPROVED'
    AND ili.markup_type_applied IS NULL;
-- Any APPROVED line should have markup context. If this returns > 0,
-- something is wrong with Billing Calc or the data has drifted.
```

Adjust the check's semantic meaning as needed. The new check should verify a real invariant of the v1.6.0 schema. If you can't figure out what CHECK 8 was originally testing, replace it with a check that verifies `billing_status = 'APPROVED' → markup_type_applied IS NOT NULL`.

### 7A.5 — Verification

After edits:

1. In Supabase SQL Editor, run `seed-data.sql` against a FRESH schema (easier test: run against current Supabase and see if the INSERTs fail — if they succeed despite duplicates, the column names are right)
2. Run `verify-data.sql` and check that all 10 checks pass

If Sawyer's Supabase already has test data from prior sessions, SKIP the full re-seed test — just verify that the edited files parse as valid SQL with no syntax errors, and leave verification for a future clean-slate deployment. Note in completion summary.

## 7B: Delete orphaned PDF files at old paths

### Current state

Three paths exist in the repo but are unreferenced after the Stage 5 Step 8 /billing split:

- `src/alamo/app/api/invoices/[id]/pdf/route.ts`
- `src/alamo/app/invoices/[id]/DownloadPDFButton.tsx`
- `src/alamo/app/invoices/[id]/actions/pdf.ts`

Active versions now live at:
- `src/alamo/app/api/billing/[id]/pdf/route.ts`
- `src/alamo/app/billing/[id]/DownloadPDFButton.tsx`
- `src/alamo/app/billing/[id]/actions/pdf.ts`

### 7B.1 — Verify no active imports reference old paths

Run this to confirm nothing imports from the orphaned locations:

```bash
cd src/alamo
grep -rn "from.*invoices/\[id\]/actions/pdf" --include="*.ts" --include="*.tsx"
grep -rn "from.*invoices/\[id\]/DownloadPDFButton" --include="*.ts" --include="*.tsx"
grep -rn "api/invoices/\[id\]/pdf" --include="*.ts" --include="*.tsx"
```

If any of these return results OUTSIDE the orphaned files themselves, STOP. Something still references them. Investigate before deleting.

Expected: the ONLY references should be inside the orphaned files themselves (self-references). Those are safe to delete.

### 7B.2 — Delete the files

```bash
cd <repo root>
rm -rf src/alamo/app/api/invoices/
rm src/alamo/app/invoices/\[id\]/DownloadPDFButton.tsx
rm src/alamo/app/invoices/\[id\]/actions/pdf.ts
```

Note: `api/invoices/` directory can be removed whole since it only contained the PDF route. If it contains ANY other files (e.g. future API routes), delete only the `pdf/` subdirectory.

Run the grep again after deletion to confirm:

```bash
grep -rn "from.*invoices/\[id\]/actions/pdf" --include="*.ts" --include="*.tsx"
# Expected: no output
```

### 7B.3 — Build verification

```bash
cd src/alamo && npm run build
```

Build should succeed. If it fails with "module not found," the grep missed something. Investigate.

## 7C: TypeScript errors in financial paths

### Goal

Reduce or eliminate TypeScript errors in files that handle money. Not all errors need fixing — many are Supabase inference quirks that don't reflect real bugs — but the error count growing over time is a bad smell.

### 7C.1 — Establish the baseline

```bash
cd src/alamo && npx tsc --noEmit 2>&1 | tee /tmp/ts-errors-post-phase-6.log
```

Count errors in financial paths:

```bash
grep -cE "match\.ts|resolve\.ts|billing-calc\.ts|disputes/page\.tsx|billing/\[id\]" /tmp/ts-errors-post-phase-6.log
```

Report this count in the completion summary.

### 7C.2 — Classify the errors

Open `/tmp/ts-errors-post-phase-6.log` and categorize errors in financial paths:

**Category A: Supabase inference quirks** (common pattern: `Type 'string | null' is not assignable to type 'string'` on a column you know is non-null, or `Type 'GenericStringError'` artifacts)
- Document the count but DO NOT fix them
- These are library-level and fixing requires suppression or refactoring Supabase type generation — out of scope

**Category B: Genuine type errors** (e.g. passing a string where a number is expected, missing required fields)
- These are real bugs potentially. Investigate each.

**Category C: Now-fixed by Phase 2 refactor**
- Some errors from Session A were on old markup fields that no longer exist. After Phase 2, they should be gone.

### 7C.3 — Fix Category B only

For each genuine error:
1. Read the surrounding code
2. Understand what's actually wrong
3. Fix in the simplest safe way

Do NOT use `@ts-ignore` or `@ts-expect-error` to silence errors. If an error is a real bug, fix it. If it's a library quirk, leave it.

Do NOT refactor beyond the minimum needed to fix the error. This is cleanup, not rewriting.

### 7C.4 — Measure the result

```bash
npx tsc --noEmit 2>&1 | tee /tmp/ts-errors-post-phase-7c.log
grep -cE "match\.ts|resolve\.ts|billing-calc\.ts|disputes/page\.tsx|billing/\[id\]" /tmp/ts-errors-post-phase-7c.log
```

Report before/after counts in the completion summary.

### 7C.5 — Known-acceptable errors

If after your fixes there are still errors in financial paths, document EACH remaining error with:
- File path and line number
- The error message (short version)
- Category (A, B, or C)
- Why it's acceptable (if A) or why it wasn't fixed (if B)

This becomes the baseline for future cleanup passes.

## Checkpoint

Commit each sub-phase separately so partial work is recoverable:

```bash
# 7A commit
git add database/seed-data.sql database/verify-data.sql
git commit -m "Session B Phase 7A: fix seed-data.sql and verify-data.sql for v1.6.0 schema"

# 7B commit (use git rm for deleted files)
git rm -r src/alamo/app/api/invoices/
git rm src/alamo/app/invoices/\[id\]/DownloadPDFButton.tsx
git rm src/alamo/app/invoices/\[id\]/actions/pdf.ts
git commit -m "Session B Phase 7B: remove orphaned PDF files at old paths"

# 7C commit (if fixes applied)
git add <fixed files>
git commit -m "Session B Phase 7C: fix N TypeScript errors in financial paths"
```

If any sub-phase is skipped, document in the completion summary WHY it was skipped.

---

# COMPLETION SUMMARY TEMPLATE

After all phases (or after the last one you complete if you have to stop early), write a completion summary with these sections:

```
## SESSION B COMPLETE — [n/7 phases complete]

### PHASES COMPLETED
- [x] Phase 1: shipment_ledger markup unification
- [x] Phase 2: pipeline restructure
- ... etc

### PHASES INCOMPLETE (if any)
- [ ] Phase N: [reason for stopping]

### COMMITS LANDED
- commit sha: brief message
- commit sha: brief message

### DATABASE MIGRATIONS NEEDED
List any migration files Sawyer needs to apply in Supabase before merging code.

### SAMPLE CSV OUTPUTS
- /mnt/user-data/outputs/sample-csv-percentage-cactus-3pl-hq.csv
- /mnt/user-data/outputs/sample-csv-flat-pineridge.csv
- /mnt/user-data/outputs/sample-csv-smoke-test.csv
(If generated)

### DECISIONS NEEDED (if ambiguity encountered)
- Ambiguity at [location]: [description, options considered, what you did or why you stopped]

### CSV COLUMN DECISIONS
Document which of the optional surcharge columns (53-59) you included vs omitted based on actual schema.
If you omitted any, note the actual final column count.

### MERGE INSTRUCTIONS

1. Apply migration in Supabase:
   [paste migration sha/path]

2. Apply seed data:
   database/seeds/v1.6.1-pineridge-flat-markup-seed.sql

3. Review sample CSVs for format and numeric correctness

4. Merge to main:
   git checkout main
   git merge claude/{branch-name}
   git push origin main

5. Verify end-to-end on both test invoices after merge.

### FOLLOW-UPS FOR FUTURE SESSIONS
List anything you noticed that deserves attention but was outside scope.
```

---

# FINAL REMINDERS

- Use decimal.js for ALL financial math. Never floats.
- Read files before editing them. Do not edit based on assumptions.
- Stop on ambiguity in financial paths. Do not guess.
- Commit frequently with clear messages.
- Sample CSVs go to /mnt/user-data/outputs/ for Sawyer review.
- The briefing is canonical. If anything contradicts the briefing, STOP.
