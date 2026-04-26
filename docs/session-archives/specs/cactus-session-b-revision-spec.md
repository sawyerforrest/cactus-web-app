# SESSION B REVISION SPEC — MIGRATION BACKFILL + DN-2 POLICY + PINERIDGE FIX + AUDIT_LOGS SCHEMA FIX

**Branch:** `claude/exciting-hypatia-2336bd` (continue on the existing worktree)
**Based on:** Last commit on this branch (Phase 7A, sha `92d3d33`)
**Estimated duration:** 45-60 minutes
**New commits:** 4 (one per change), stacked on top of the existing 7

---

## CONTEXT — what changed since the original Session B spec

Sawyer reviewed the Session B output with the Senior Architect (Claude chat) before merging. Three findings emerged:

1. **shipment_ledger has 953 existing rows** (not zero as the original spec assumed). They came from Session A's Match runs against the UPS test invoice for Cactus 3PL HQ (939 rows) and an older test org (13 rows), plus 1 stray RATING_ENGINE row. All have `markup_percentage = 0.1800` reflecting the markup config at the time those rows were created. Per Rule 6 (immutable records), we must preserve them through the schema change.

2. **DN-2 is being resolved.** The product policy: flat markup applies once per shipment to the base/freight charge only, NOT to surcharges, and NOT to `is_adjustment_only = TRUE` lines (because there's no base charge to apply it to). The current code preserves Session A's behavior of always adding flat fee — that needs to change.

3. **audit_logs has been silently broken since the codebase was scaffolded.** Every audit_logs INSERT in the codebase uses `action:` and `details:` as field names, but the actual schema columns are `action_type` and `metadata`. Supabase/PostgREST accepts INSERTs with unknown column names without raising an error — they succeed but write nothing useful. Verified empirically: `SELECT COUNT(*) FROM audit_logs` returns 0 despite multiple Match runs that should have generated entries. Affects 5 INSERT sites across 4 files in the worktree (and the same files in main, where 3 of those sites also exist).

This revision spec bundles four changes:

- **Change 1 — Migration revision**: convert the v1.6.1 migration from "ADD + DROP destructively" to "ADD + BACKFILL + DROP" so the 953 historical rows preserve their markup context.
- **Change 2 — DN-2 implementation**: skip flat markup on `is_adjustment_only = TRUE` lines.
- **Change 3 — Pineridge seed regeneration**: row 14 final_billed_rate becomes $3.50 (was $5.00), cactus_invoices total_amount becomes $354.27 (was $355.77).
- **Change 4 — audit_logs schema fix**: rename `action` → `action_type` and `details` → `metadata` at all 5 INSERT sites so audit logs actually persist going forward.

Each change gets its own commit. Commit messages prefixed `Session B revision:` so they're distinct from the original 7 phase commits.

---

## GROUND RULES

1. Read each existing file in full before editing.
2. Run `npx tsc --noEmit` after each code change to confirm baseline (~1634 errors) holds.
3. Commit after each change. Three discrete commits.
4. Do NOT amend or rebase the existing 7 phase commits — stack new commits on top.
5. Do NOT push to origin. Sawyer handles the push manually after he reviews.

---

# CHANGE 1 — Migration revision (v1.6.1 ADD + BACKFILL + DROP)

## File to modify

`database/migrations/v1.6.1-shipment-ledger-markup-unification.sql`

## Why

The current migration assumes `shipment_ledger` is empty and drops `markup_percentage` / `markup_flat_fee` destructively. The actual database has 953 rows with real markup data (Session A's Match runs). Per Rule 6 (immutable records: shipment_ledger | meter_transactions | audit_logs | rate_shop_log | shipment_events | invoice_line_items), destroying that information is the wrong move even on test data — it sets a bad precedent and loses historical billing context.

Solution: add the three new context columns nullable, BACKFILL them from the legacy markup_percentage/markup_flat_fee, then DROP the legacy columns. Net effect on schema is identical to what Session B intended; net effect on data is preservation instead of loss.

## Replace the file's contents with this

```sql
-- ==========================================================================
-- MIGRATION v1.6.1 — shipment_ledger markup unification (REVISED)
-- Date: 2026-04-20 (revised same day)
-- Purpose: Extend the v1.6.0 markup context model (markup_type_applied,
--          markup_value_applied, markup_source) from invoice_line_items to
--          shipment_ledger, BACKFILL the new columns from the existing
--          markup_percentage / markup_flat_fee values, and then drop the
--          legacy columns.
--
-- Author: Cactus Logistics — pipeline refactor Session B
--
-- REVISION NOTE: The original Session B migration assumed shipment_ledger
--          was empty. Pre-flight in the live test Supabase showed 953
--          existing rows from Session A's Match runs. Per Rule 6
--          (immutable records), we preserve those rows through the schema
--          change instead of wiping them. The flow is now:
--               1. ADD new columns (nullable)
--               2. BACKFILL from legacy markup_percentage/markup_flat_fee
--               3. ADD CHECK constraints
--               4. DROP legacy columns
--
-- Backfill rule (matches deriveMarkupContext() logic in
-- src/alamo/lib/markup-context.ts):
--          - markup_flat_fee > 0  → markup_type_applied = 'flat',
--                                   markup_value_applied = markup_flat_fee
--          - else                 → markup_type_applied = 'percentage',
--                                   markup_value_applied = markup_percentage
--                                   (defaults to 0 if NULL)
--          - markup_source        → 'carrier_account' for all backfilled rows
--                                   (rate cards weren't in production use
--                                    when these rows were created; rate_card
--                                    becomes a possibility starting with
--                                    v1.6.0+ Billing Calc)
--
-- Does NOT touch: org_carrier_accounts.markup_percentage /
--                 org_carrier_accounts.markup_flat_fee. Those columns are
--                 the source of truth for admin-set markup config and
--                 continue to exist unchanged.
-- ==========================================================================

BEGIN;

-- 1. ADD the three new markup context columns (nullable initially so that
--    backfill can populate them before NOT NULL constraints, if any, are
--    enforced. Schema design keeps them nullable permanently — the CHECK
--    constraints below allow NULL for forward-compatibility with rows
--    inserted before the markup is determined.)
ALTER TABLE shipment_ledger
  ADD COLUMN markup_type_applied  TEXT,
  ADD COLUMN markup_value_applied DECIMAL(10,6),
  ADD COLUMN markup_source        TEXT;

-- 2. BACKFILL — derive the new context from existing markup_percentage and
--    markup_flat_fee. Same priority rule as deriveMarkupContext: flat wins
--    when greater than zero.
UPDATE shipment_ledger
SET
  markup_type_applied = CASE
    WHEN COALESCE(markup_flat_fee, 0) > 0 THEN 'flat'
    ELSE 'percentage'
  END,
  markup_value_applied = CASE
    WHEN COALESCE(markup_flat_fee, 0) > 0 THEN markup_flat_fee
    ELSE COALESCE(markup_percentage, 0)
  END,
  markup_source = 'carrier_account';

-- 3. ADD CHECK constraints (after backfill so existing rows already conform).
ALTER TABLE shipment_ledger
  ADD CONSTRAINT shipment_ledger_markup_type_check
    CHECK (markup_type_applied IS NULL
           OR markup_type_applied IN ('percentage', 'flat')),
  ADD CONSTRAINT shipment_ledger_markup_source_check
    CHECK (markup_source IS NULL
           OR markup_source IN ('carrier_account', 'rate_card'));

-- 4. DROP the legacy columns now that the data has been preserved on the
--    new columns.
ALTER TABLE shipment_ledger
  DROP COLUMN markup_percentage,
  DROP COLUMN markup_flat_fee;

-- 5. Emit a NOTICE with row counts for human verification in the Supabase
--    SQL Editor output pane.
DO $$
DECLARE
  total_rows  INT;
  backfilled  INT;
  flat_rows   INT;
  pct_rows    INT;
  col_list    TEXT;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM shipment_ledger;
  SELECT COUNT(*) INTO backfilled FROM shipment_ledger
    WHERE markup_type_applied IS NOT NULL;
  SELECT COUNT(*) INTO flat_rows FROM shipment_ledger
    WHERE markup_type_applied = 'flat';
  SELECT COUNT(*) INTO pct_rows FROM shipment_ledger
    WHERE markup_type_applied = 'percentage';
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO col_list
    FROM information_schema.columns
    WHERE table_name = 'shipment_ledger'
      AND column_name IN ('markup_type_applied', 'markup_value_applied',
                           'markup_source', 'markup_percentage',
                           'markup_flat_fee');
  RAISE NOTICE 'shipment_ledger v1.6.1 complete: % total rows, % backfilled (% flat, % percentage)',
    total_rows, backfilled, flat_rows, pct_rows;
  RAISE NOTICE 'shipment_ledger markup columns after migration: %', col_list;
  -- Expected:
  --   "shipment_ledger v1.6.1 complete: 953 total rows, 953 backfilled (0 flat, 953 percentage)"
  --   "shipment_ledger markup columns after migration: markup_source, markup_type_applied, markup_value_applied"
END $$;

COMMIT;
```

## Verification

There is no code-side verification for this change — it's pure SQL, will run when Sawyer applies it in Supabase. The NOTICE output is the verification.

After saving the file, confirm it parses as valid SQL by visual inspection. Do not attempt to execute it locally.

## Commit

```
git add database/migrations/v1.6.1-shipment-ledger-markup-unification.sql
git commit -m "Session B revision: migration v1.6.1 ADD+BACKFILL+DROP for shipment_ledger
preserves 953 existing rows by backfilling markup context from legacy
markup_percentage/markup_flat_fee before dropping. Honors Rule 6
(immutable records) on test data as practice for production discipline."
```

---

# CHANGE 2 — DN-2 implementation (skip flat markup on is_adjustment_only)

## Files to modify

- `src/alamo/lib/markup-context.ts` (extend `computeSingleCeiling` signature)
- `src/alamo/app/invoices/[id]/actions/billing-calc.ts` (pass `is_adjustment_only` through)

## Why

Sawyer's stated policy for flat markup:

> Flat mark-up should only apply to each tracking number once, specifically to the base transportation or freight charge, not to any surcharges. The idea is that it is a flat mark-up for each unique shipment tracking number and applied specifically to the base charge, which then rolls up into the total rate for each shipment.

Implication: when `is_adjustment_only = TRUE`, there is no base charge (it's all in `apv_adjustment`), so flat fee should NOT be added. The current code adds flat fee unconditionally, which over-charges adjustment lines by the flat fee amount.

For non-adjustment lines, the math under the new policy is mathematically identical to the current code:

```
Current: final = carrier_charge + flat_fee
         (where carrier_charge = base + fuel + resi + ... already)

New:     final = base + flat_fee + fuel + resi + ...
         (algebraically identical to: carrier_charge + flat_fee)
```

So normal shipments are unaffected. Only `is_adjustment_only = TRUE` lines change behavior.

## Edit 1 — `src/alamo/lib/markup-context.ts`

Find the `computeSingleCeiling` function. Modify its signature to accept an optional `options` parameter:

```typescript
// BEFORE
export function computeSingleCeiling(
  carrierCharge: Decimal,
  context: MarkupContext
): { preCeilingAmount: Decimal; finalBilledRate: Decimal } {
  const value = new Decimal(context.markup_value_applied)

  const preCeiling =
    context.markup_type_applied === 'flat'
      ? carrierCharge.plus(value)
      : carrierCharge.times(new Decimal(1).plus(value))

  const final = preCeiling.times(100).ceil().dividedBy(100)
  return { preCeilingAmount: preCeiling, finalBilledRate: final }
}
```

Replace with:

```typescript
// AFTER
export function computeSingleCeiling(
  carrierCharge: Decimal,
  context: MarkupContext,
  options?: {
    /**
     * When true, flat markup is NOT applied — the line has no base charge
     * to attach the flat fee to (per DN-2 policy resolved 2026-04-20).
     * Has no effect when context.markup_type_applied === 'percentage'.
     */
    isAdjustmentOnly?: boolean
  }
): { preCeilingAmount: Decimal; finalBilledRate: Decimal } {
  const value = new Decimal(context.markup_value_applied)
  const isFlat = context.markup_type_applied === 'flat'
  const skipFlat = isFlat && options?.isAdjustmentOnly === true

  const preCeiling = skipFlat
    ? carrierCharge                                 // adjustment-only flat: pass through
    : isFlat
      ? carrierCharge.plus(value)                   // normal flat: add fee
      : carrierCharge.times(new Decimal(1).plus(value))  // percentage

  const final = preCeiling.times(100).ceil().dividedBy(100)
  return { preCeilingAmount: preCeiling, finalBilledRate: final }
}
```

Also update the comment block above the function to reflect the new policy:

```typescript
// =============================================================
// SINGLE-CEILING MARKUP MATH — the ONE authoritative
// implementation, used by:
//   - match.ts         (for shipment_ledger row creation,
//                       because shipment_ledger.final_billed_rate
//                       is NOT NULL)
//   - billing-calc.ts  (for invoice_line_items final_billed_rate)
//
// Semantics (per briefing): carrier_charge is ALWAYS the basis.
//   PERCENTAGE: preCeiling = carrier_charge * (1 + markup_value)
//   FLAT:       preCeiling = carrier_charge + markup_value
//               (flat conceptually applies to base, but since
//                surcharges pass through unchanged the math
//                works out the same as adding to carrier_charge)
//   ADJUSTMENT-ONLY + FLAT (DN-2 policy 2026-04-20):
//               preCeiling = carrier_charge (no flat applied —
//                            no base charge to attach fee to)
//   final = ceil(preCeiling * 100) / 100  — single ceiling
//
// Behavior-preserving w.r.t. Session A for non-adjustment lines.
// Adjustment-only flat lines now pass through carrier_charge
// without adding the flat fee, per DN-2.
// =============================================================
```

### A note about match.ts callers

`match.ts` calls `computeSingleCeiling` from inside the dark-account shipment_ledger insert path. Since dark accounts at the time of Match might or might not include adjustment-only lines, you should pass `isAdjustmentOnly: line.is_adjustment_only` from the relevant caller. Read the current match.ts to find the call site (it should be in the dark-path branch where the shipment_ledger insert happens). If `is_adjustment_only` isn't yet available in scope at that point, either load it on the line query or default to `false` and add a `// TODO` comment noting that match.ts dark-path adjustment-only handling is a future concern (this is fine — adjustment-only dark-account lines are a rare-to-nonexistent edge case in practice).

Same applies to `resolve.ts` if it calls `computeSingleCeiling`. Read it and update accordingly.

## Edit 2 — `src/alamo/app/invoices/[id]/actions/billing-calc.ts`

The `EligibleLine` type already includes `is_adjustment_only` (verified in the review). The SELECT in Step 1 already loads it. The change is just in Step 3 — pass it through to `computeSingleCeiling`:

Find this block in the `for (const line of eligible)` loop:

```typescript
// BEFORE
const context = deriveMarkupContext(account)
const carrierCharge = new Decimal(line.carrier_charge)
const { preCeilingAmount, finalBilledRate } =
  computeSingleCeiling(carrierCharge, context)
```

Replace with:

```typescript
// AFTER
const context = deriveMarkupContext(account)
const carrierCharge = new Decimal(line.carrier_charge)
const { preCeilingAmount, finalBilledRate } =
  computeSingleCeiling(carrierCharge, context, {
    isAdjustmentOnly: line.is_adjustment_only,
  })
```

Also update the EDGE CASES comment at the top of the file to reflect the resolved policy:

```typescript
// EDGE CASES (resolved policies):
//   - is_adjustment_only = TRUE with flat markup: flat fee is NOT
//     applied (DN-2 resolved 2026-04-20). Adjustment lines pass
//     through with final_billed_rate = carrier_charge. Per Sawyer:
//     "flat mark-up applies once per tracking number to the base
//     charge; adjustment-only lines have no base to apply it to."
//   - Account has both markup_percentage > 0 AND markup_flat_fee
//     > 0: preserves Session A behavior (flat wins). Documented
//     as DN-1; the Alamo org_carrier_accounts editor should
//     reject this configuration at save time (future work).
```

## Verification

After both edits, run:

```bash
cd src/alamo && npx tsc --noEmit 2>&1 | wc -l
```

Expected: ~1634 (unchanged from baseline). If it grows, investigate.

Also spot-check by reading both files end-to-end after the edit.

## Commit

```
git add src/alamo/lib/markup-context.ts
git add src/alamo/app/invoices/[id]/actions/billing-calc.ts
git add src/alamo/app/invoices/[id]/actions/match.ts    # if you updated the match.ts call site
git add src/alamo/app/invoices/[id]/actions/resolve.ts  # if you updated the resolve.ts call site
git commit -m "Session B revision: DN-2 — skip flat markup on adjustment-only lines
Per Sawyer's policy decision 2026-04-20: flat fee applies once per
tracking number to the base charge; adjustment-only lines have no
base charge so flat is not applied. Non-adjustment behavior unchanged."
```

---

# CHANGE 3 — Pineridge seed regeneration (row 14 + total)

## File to modify

`database/seeds/v1.6.1-pineridge-flat-markup-seed.sql`

## Why

Pineridge row 14 is the adjustment-only test case. With the original Session B math (flat applied to all lines), row 14 had:
- carrier_charge = $3.50 (just apv_adjustment)
- final_billed_rate = $5.00 ($3.50 + $1.50 flat)

Under DN-2, flat is no longer applied to adjustment-only lines:
- carrier_charge = $3.50 (unchanged)
- final_billed_rate = $3.50 (no flat added)

That's a $1.50 reduction on row 14. Cascade to the cactus_invoice total: $355.77 → $354.27.

## Edits

Find row 14's INSERT in the `invoice_line_items` block. Update its `final_billed_rate` and `pre_ceiling_amount` from the old values to the new ones (the exact OLD values are whatever Claude Code originally seeded — read the current file to find them; the NEW values are below).

Row 14 — invoice_line_items entry — should have:
- `carrier_charge` = `3.50` (unchanged)
- `pre_ceiling_amount` = `3.50` (was `5.00`)
- `final_billed_rate` = `3.50` (was `5.00`)
- `is_adjustment_only` = `TRUE` (unchanged)
- `markup_type_applied` = `'flat'` (unchanged — documents the configured markup)
- `markup_value_applied` = `1.5000` (unchanged — documents what WOULD have been applied; the is_adjustment_only flag indicates it was suppressed per policy)
- `markup_source` = `'carrier_account'` (unchanged)

Also find the `cactus_invoices` INSERT and update its `total_amount`:
- `total_amount` = `354.27` (was `355.77`)

The carrier_invoice's `total_carrier_amount` stays at `333.27` (carrier's amount is independent of Cactus markup).

Update the inline comment in the seed file to reflect the new policy:

```sql
-- --------------------------------------------------------------------------
-- 6. Invoice line items (15 rows) + cactus_invoice_line_items junction
--
-- Pattern for final_billed_rate under flat markup:
--   final_billed_rate = carrier_charge + 1.50
-- Single-Ceiling does not change anything because flat fees
-- don't introduce fractional cents.
--
-- DN-2 EXCEPTION (resolved 2026-04-20): row 14 (is_adjustment_only = TRUE).
-- Flat fee is NOT applied to adjustment-only lines because there is no
-- base charge to attach the fee to. Row 14's final_billed_rate equals
-- carrier_charge ($3.50) — flat fee is suppressed even though
-- markup_value_applied = 1.5000 documents what was configured.
-- --------------------------------------------------------------------------
```

## Verification

After editing, sanity-check by computing the totals manually:

- 14 normal rows × (carrier_charge + $1.50) = whatever they sum to
- 1 adjustment-only row × $3.50

Sum of all 15 final_billed_rate values should equal `354.27`. Verify by reading the file's row-by-row final_billed_rate values and adding them up.

If the total doesn't come to `354.27`, something else is off in the seed — STOP and document.

## Commit

```
git add database/seeds/v1.6.1-pineridge-flat-markup-seed.sql
git commit -m "Session B revision: Pineridge seed reflects DN-2 policy
Row 14 (adjustment-only) final_billed_rate $5.00 -> $3.50 (no flat
applied per DN-2). cactus_invoice total $355.77 -> $354.27."
```

---

# CHANGE 4 — audit_logs schema fix (action → action_type, details → metadata)

## Files to modify

Five INSERT call sites across four files in the worktree:

1. `src/alamo/app/invoices/actions/generate.ts:318` — WEEKLY_BILLING_RUN
2. `src/alamo/app/invoices/[id]/actions/match.ts:572` — MATCHING_ENGINE_RUN
3. `src/alamo/app/invoices/[id]/actions/billing-calc.ts:284` — BILLING_CALC_RUN (new in Session B)
4. `src/alamo/app/invoices/[id]/actions/resolve.ts:228` — RESOLVE_PARTIAL_FAILURE (new in Session B)
5. `src/alamo/app/invoices/[id]/actions/resolve.ts:313` — DISPUTE_RESOLVED

## Why

The actual `audit_logs` table schema in Supabase has these columns (verified 2026-04-20):

```
id, org_id, user_id, action_type, entity_type, entity_id,
description, metadata, ip_address, created_at
```

Every audit_logs INSERT in the codebase passes `action:` (should be `action_type:`) and `details:` (should be `metadata:`). PostgREST silently accepts INSERTs with unknown column names — they "succeed" (return no error) but write nothing useful. Empirical confirmation: `SELECT COUNT(*) FROM audit_logs;` returns 0 despite multiple Match runs that should have generated entries during Session A and Session B development.

This bug has existed since the codebase was scaffolded. The fix is mechanical, but it MUST be done before merging Session B to main — otherwise Session B's new BILLING_CALC_RUN entries will silently fail too, and we'll continue operating without an audit trail.

## What "metadata" looks like in the schema

`metadata` is a JSONB column. The current code passes a JS object as `details:` which Supabase serializes to JSONB on the way in. Renaming to `metadata:` requires no other change — same JSONB-shaped data, just in the correct column.

## Edits

For EACH of the five call sites, perform two text replacements within the INSERT object:

```typescript
// BEFORE
await supabase.from('audit_logs').insert({
  entity_type: '...',
  entity_id: ...,
  action: 'SOME_ACTION_NAME',          // ← rename
  details: { ... },                      // ← rename
})

// AFTER
await supabase.from('audit_logs').insert({
  entity_type: '...',
  entity_id: ...,
  action_type: 'SOME_ACTION_NAME',     // ← was 'action'
  metadata: { ... },                     // ← was 'details'
})
```

Specific files and current state to find:

### Site 1 — `src/alamo/app/invoices/actions/generate.ts` (line 318 area)

Currently has:
```typescript
action: 'WEEKLY_BILLING_RUN',
details: {
  totalOrgs: result.totalOrgs,
  // ...
},
```

Change to:
```typescript
action_type: 'WEEKLY_BILLING_RUN',
metadata: {
  totalOrgs: result.totalOrgs,
  // ...
},
```

### Site 2 — `src/alamo/app/invoices/[id]/actions/match.ts` (line 572 area)

Currently has:
```typescript
action: 'MATCHING_ENGINE_RUN',
details: {
  totalProcessed: result.totalProcessed,
  // ...
},
```

Change to:
```typescript
action_type: 'MATCHING_ENGINE_RUN',
metadata: {
  totalProcessed: result.totalProcessed,
  // ...
},
```

### Site 3 — `src/alamo/app/invoices/[id]/actions/billing-calc.ts` (line 284 area)

Currently has:
```typescript
action: 'BILLING_CALC_RUN',
details: {
  total_eligible: result.total_eligible,
  // ...
},
```

Change to:
```typescript
action_type: 'BILLING_CALC_RUN',
metadata: {
  total_eligible: result.total_eligible,
  // ...
},
```

### Site 4 — `src/alamo/app/invoices/[id]/actions/resolve.ts` (line 228 area)

Currently has:
```typescript
action: 'RESOLVE_PARTIAL_FAILURE',
details: {
  message: 'shipment_ledger written but invoice_line_items update failed',
  // ...
},
```

Change to:
```typescript
action_type: 'RESOLVE_PARTIAL_FAILURE',
metadata: {
  message: 'shipment_ledger written but invoice_line_items update failed',
  // ...
},
```

### Site 5 — `src/alamo/app/invoices/[id]/actions/resolve.ts` (line 313 area)

Currently has:
```typescript
action: 'DISPUTE_RESOLVED',
details: {
  resolvedBy,
  // ...
},
```

Change to:
```typescript
action_type: 'DISPUTE_RESOLVED',
metadata: {
  resolvedBy,
  // ...
},
```

## Be surgical

Do NOT rename `action:` or `details:` anywhere ELSE in the codebase. These are common variable names in many contexts (React handlers use `action:`, error responses often have `details:`). The renames apply ONLY inside the five `audit_logs').insert({...})` calls listed above.

A safe way to verify scope before editing: run `grep -rn -B 2 "action: '" --include="*.ts" --include="*.tsx" src/` to see every line with `action:` — confirm visually that the surrounding context is an audit_logs insert before changing it. Same for `details: {`.

## Verification

After all five edits, run TypeScript check:

```bash
cd src/alamo && npx tsc --noEmit 2>&1 | wc -l
```

Expected: ~1634 (unchanged from baseline). The renames don't affect TypeScript inference because Supabase types are loosely-typed enough that both old and new field names compile (which is part of why the bug went undetected for so long).

After Sawyer applies migrations and re-runs Match in Supabase, he can verify the fix worked by running:

```sql
SELECT COUNT(*), action_type, MIN(created_at), MAX(created_at)
FROM audit_logs
GROUP BY action_type
ORDER BY action_type;
```

Expected: rows for MATCHING_ENGINE_RUN and BILLING_CALC_RUN with timestamps from after the merge.

## Commit

```
git add src/alamo/app/invoices/actions/generate.ts
git add src/alamo/app/invoices/[id]/actions/match.ts
git add src/alamo/app/invoices/[id]/actions/billing-calc.ts
git add src/alamo/app/invoices/[id]/actions/resolve.ts
git commit -m "Session B revision: fix audit_logs schema mismatch
Schema columns are action_type and metadata, not action and details.
PostgREST was silently dropping the wrong-named fields, causing every
audit_logs INSERT in the codebase to write nothing useful. Verified
empirically (audit_logs row count was 0 despite many Match runs).
Renames action -> action_type and details -> metadata at all 5
INSERT call sites. No other behavior change."
```

---

# COMPLETION SUMMARY

After all four commits land, append a section to `SESSION-B-SUMMARY.md` at the repo root:

```markdown
## REVISION (2026-04-20, post-review)

Four follow-up commits added on top of the original 7 phase commits:

1. **Migration revision** (sha: TBD) — v1.6.1 migration converted from
   destructive ADD+DROP to safe ADD+BACKFILL+DROP. Preserves 953 historical
   shipment_ledger rows from Session A. Honors Rule 6 (immutable records).

2. **DN-2 implementation** (sha: TBD) — flat markup no longer applies to
   `is_adjustment_only = TRUE` lines per Sawyer's policy decision. Affects
   `markup-context.ts:computeSingleCeiling()` (new optional `isAdjustmentOnly`
   parameter) and `billing-calc.ts` (passes the flag through). Non-adjustment
   line behavior is unchanged.

3. **Pineridge seed update** (sha: TBD) — row 14 final_billed_rate $5.00
   → $3.50, cactus_invoices total $355.77 → $354.27 to match the new policy.

4. **audit_logs schema fix** (sha: TBD) — every audit_logs INSERT in the
   codebase has been silently failing since the codebase was scaffolded
   because `action:` and `details:` are not the actual schema column names
   (correct: `action_type:` and `metadata:`). Renamed at all 5 call sites
   in generate.ts, match.ts, billing-calc.ts, and resolve.ts. From this
   point forward, audit_logs will actually persist.

DN-1 (both percentage AND flat set on same account) and DN-3 (carrier_charge
basis) remain as documented — DN-1 still needs Alamo validation work,
DN-3 is the resolved policy (carrier_charge is the billing basis per briefing).
```

Replace the TBD shas with the actual commit hashes after the four commits land.

---

# FOLLOW-UPS BEYOND THIS REVISION

These are not part of this revision spec but should be tracked. Add a new file at `docs/schema-code-audit-checklist.md` (Sawyer will provide the contents separately) so this isn't lost.

1. **Comprehensive schema-vs-code audit before Stage 6 (Rate Engine) work.** The audit_logs bug (Change 4 above) is unlikely to be the only schema-vs-code mismatch in the codebase. Tables that are written-and-walked-away-from (rate_shop_log, shipment_events, meter_transactions) are highest risk because silent failures wouldn't surface in normal operation. Run the comprehensive sweep in `docs/schema-code-audit-checklist.md` before adding more code that could compound the problem.

2. **Add a "history of audits" entry** to `docs/schema-code-audit-checklist.md` after the Session B.1 fix lands. Date: 2026-04-20. Scope: audit_logs only. Findings: `action` → `action_type`, `details` → `metadata`, fixed across 5 INSERT call sites.

3. **Investigate whether PostgREST has a "strict mode"** that rejects INSERTs/UPDATEs with unknown column names. If so, enabling it would prevent this whole class of bug going forward. As of 2026-04-20 the default behavior is permissive — unknown columns are silently dropped.

---

# FINAL CHECKS BEFORE HANDING BACK

1. Four new commits on the branch (one per change), all with `Session B revision:` prefix.
2. TypeScript baseline holds (~1634 errors).
3. `git log --oneline` shows 11 total Session B commits (7 original + 4 revision).
4. Sawyer can resume the merge sequence from the pre-flight check, knowing the migration now safely preserves the 953 existing rows AND the code reflects the resolved DN-2 policy AND audit_logs writes will actually persist.

Hand control back to Sawyer when these four commits are clean and TypeScript baseline is held.
