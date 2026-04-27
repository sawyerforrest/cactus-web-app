# SESSION D.1 SPEC — DARK-PATH ADJUSTMENT-ONLY FIX

**Branch:** New `claude/*` worktree, based on current main
**Prerequisites:** Main is at commit `3c168a1` (post-DN-12) or later
**Estimated duration:** 30 minutes
**Risk level:** LOW — two narrow changes at sites with explicit TODO comments
prescribing the exact fix. `computeSingleCeiling()` already accepts the
`isAdjustmentOnly` option (verified in `markup-context.ts`).
**Resolves:** DN-2 outstanding TODO ("Flat markup on is_adjustment_only =
TRUE lines" — policy was set 2026-04-20, dark-path implementation deferred)

---

## THE LATENT BUG

`shipment_ledger.final_billed_rate` on dark-account adjustment-only lines
gets a flat-fee markup ($1.50/$2.50/etc.) added even though `billing-calc.ts`
correctly suppresses the same markup on the `invoice_line_items` side. The
client invoice is correct (it reads from `invoice_line_items`), but the
authoritative ledger drifts from the invoice on this specific case.

**Real production exposure today: zero.** Desert Boutique is the only dark
account in the database; it has 13 line items and zero of them are
adjustment-only. Verified live 2026-04-27.

**Real production exposure becomes non-zero the moment any of these happen:**
- 5 Logistics' DHL eCommerce account begins processing through `match.ts`
  / `resolve.ts` (cycle 2, mid-June 2026) — DHL invoices contain
  adjustment-only lines just like UPS does (~22% of FRT rows in Session
  A's UPS data were adjustments)
- A future dark-account client onboards
- A historical reprocess of a dark-account invoice runs

So this is a "fix before cycle 2 of 5 Logistics" item — not blocking cycle
1 (manual processing) but blocking the production pipeline taking over.

---

## WHAT TO BUILD

Two surgical changes per file. Pattern is identical in both files; the only
differences are the SELECT statement that already exists and the
surrounding context.

### File 1: `src/alamo/app/invoices/[id]/actions/match.ts`

**Change 1A — SELECT statement (currently around line 178):**

```typescript
// BEFORE
const { data: lineItems, error: lineItemsError } = await supabase
  .from('invoice_line_items')
  .select('id, tracking_number, address_sender_normalized, carrier_charge')
  .eq('carrier_invoice_id', carrierInvoiceId)
  .eq('billing_status', 'PENDING')

// AFTER
const { data: lineItems, error: lineItemsError } = await supabase
  .from('invoice_line_items')
  .select('id, tracking_number, address_sender_normalized, carrier_charge, is_adjustment_only')
  .eq('carrier_invoice_id', carrierInvoiceId)
  .eq('billing_status', 'PENDING')
```

**Change 1B — `computeSingleCeiling` call in the dark-path branch (currently
around the TODO comment):**

```typescript
// BEFORE
const { preCeilingAmount, finalBilledRate } = account.is_cactus_account
  ? computeSingleCeiling(carrierCharge, markupCtx)
  : { preCeilingAmount: carrierCharge, finalBilledRate: carrierCharge }

// AFTER
const { preCeilingAmount, finalBilledRate } = account.is_cactus_account
  ? computeSingleCeiling(carrierCharge, markupCtx, {
      isAdjustmentOnly: lineItem.is_adjustment_only,
    })
  : { preCeilingAmount: carrierCharge, finalBilledRate: carrierCharge }
```

**Change 1C — DELETE the TODO comment block above the call** (the
`// TODO (DN-2 follow-up): ...` paragraph). The TODO is being resolved by
this change; leaving the comment would mislead future readers.

### File 2: `src/alamo/app/invoices/[id]/actions/resolve.ts`

**Change 2A — SELECT statement (currently around line 134):**

```typescript
// BEFORE
const { data: lineItems, error: lineItemsError } = await supabase
  .from('invoice_line_items')
  .select('id, tracking_number, carrier_charge, billing_status, match_location_id')
  .in('id', lineItemIds)
  .eq('billing_status', 'HELD')

// AFTER
const { data: lineItems, error: lineItemsError } = await supabase
  .from('invoice_line_items')
  .select('id, tracking_number, carrier_charge, billing_status, match_location_id, is_adjustment_only')
  .in('id', lineItemIds)
  .eq('billing_status', 'HELD')
```

**Change 2B — `computeSingleCeiling` call in the resolve loop:**

```typescript
// BEFORE
const { preCeilingAmount, finalBilledRate } = account.is_cactus_account
  ? computeSingleCeiling(carrierCharge, markupCtx)
  : { preCeilingAmount: carrierCharge, finalBilledRate: carrierCharge }

// AFTER
const { preCeilingAmount, finalBilledRate } = account.is_cactus_account
  ? computeSingleCeiling(carrierCharge, markupCtx, {
      isAdjustmentOnly: lineItem.is_adjustment_only,
    })
  : { preCeilingAmount: carrierCharge, finalBilledRate: carrierCharge }
```

**Change 2C — DELETE the TODO comment block above the call** (same reason
as 1C).

---

## VERIFICATION OF UPSTREAM SIGNATURE

Already confirmed against `src/alamo/lib/markup-context.ts` (verbatim):

```typescript
export function computeSingleCeiling(
  carrierCharge: Decimal,
  context: MarkupContext,
  options?: {
    isAdjustmentOnly?: boolean
  }
): { preCeilingAmount: Decimal; finalBilledRate: Decimal } {
  const value = new Decimal(context.markup_value_applied)
  const isFlat = context.markup_type_applied === 'flat'
  const skipFlat = isFlat && options?.isAdjustmentOnly === true

  const preCeiling = skipFlat
    ? carrierCharge
    : isFlat
      ? carrierCharge.plus(value)
      : carrierCharge.times(new Decimal(1).plus(value))

  const final = preCeiling.times(100).ceil().dividedBy(100)
  return { preCeilingAmount: preCeiling, finalBilledRate: final }
}
```

Notes:
- The third parameter is OPTIONAL — pre-fix calls pass two args and continue
  to compile cleanly. This is a non-breaking signature.
- `options?.isAdjustmentOnly === true` is a strict comparison — only
  `true` triggers flat-skip. `undefined`, `null`, `false` all preserve
  current behavior. This means `is_adjustment_only` returning falsy from
  the SELECT is safe.
- The skip ONLY applies when markup type is `flat`. Percentage markup is
  unaffected by this fix because percentage applied to $0 of base equals
  $0 anyway, and adjustment-only lines have non-zero `carrier_charge` from
  the adjustment itself; the math already works out for percentage.

---

## SCHEMA CONFIRMATION

Verified live 2026-04-27 via direct Supabase query:

```sql
-- invoice_line_items.is_adjustment_only
column_name: is_adjustment_only
data_type: boolean
is_nullable: NO
column_default: false
```

So:
- The column exists, is non-nullable, has a sensible default — no schema
  changes required.
- Every existing row has a real boolean (not NULL), so the SELECT addition
  cannot return undefined values that confuse the option bag.

---

## PHASE STRUCTURE — SEQUENCE OF COMMITS

1. **Commit 1:** Add `is_adjustment_only` to `match.ts` SELECT + pass
   option to `computeSingleCeiling` + delete TODO comment block (Changes
   1A, 1B, 1C).
2. **Commit 2:** Add `is_adjustment_only` to `resolve.ts` SELECT + pass
   option to `computeSingleCeiling` + delete TODO comment block (Changes
   2A, 2B, 2C).
3. **Commit 3:** Session D.1 summary doc.

Each commit is independently safe — the new SELECT column is harmless if
the option pass-through hasn't shipped yet, and the option pass-through
is harmless if the SELECT hasn't been updated yet (it would just pass
`undefined`, which is the current behavior). No coupled-commit hazard.

---

## HALT POINTS

Stop and report rather than proceed if:

1. **The TODO comment block is gone or the file structure has shifted
   materially** from what this spec assumes. The two specific call sites
   should match the BEFORE blocks above. If they don't, surface what's
   actually there before editing.

2. **`computeSingleCeiling`'s third-parameter signature has changed** —
   e.g., the option bag was renamed, became required, or moved positions.
   Spec assumes the verbatim signature in `markup-context.ts` quoted
   above. If different, halt and report.

3. **TypeScript surfaces unexpected errors** beyond the existing 11-error
   baseline (all pre-existing Supabase generic-error narrowing in
   `app/invoices/...`). New errors related to the SELECT shape or option
   typing are halt-points; pre-existing errors are not.

4. **Either file has additional dark-path or resolve-path call sites** to
   `computeSingleCeiling` beyond the ones identified by the TODO comments.
   Spec assumes exactly one such call per file. If there are more, surface
   the locations before editing.

---

## ACCEPTANCE CRITERIA

After Claude Code completes:

1. ✅ `match.ts` SELECT includes `is_adjustment_only`; dark-path
   `computeSingleCeiling` call passes
   `{ isAdjustmentOnly: lineItem.is_adjustment_only }`; TODO comment
   block deleted.
2. ✅ `resolve.ts` SELECT includes `is_adjustment_only`; resolve loop's
   `computeSingleCeiling` call passes the same option; TODO comment
   block deleted.
3. ✅ TypeScript baseline holds at 11 ± 3 errors via
   `tsc --noEmit` from `src/alamo/`. Zero new errors from D.1 files.
4. ✅ No regressions: existing dark-account row in database (Desert
   Boutique × 13 lines, 0 adjustment-only) still computes the same
   `final_billed_rate` after the fix — verified by spot-checking 1-2
   rows manually if a test reprocess is feasible, or by inspection of
   the math (zero adjustment-only lines → option bag is `{ isAdjustmentOnly:
   false }` → existing behavior preserved).
5. ✅ Lassoed-path code completely unchanged. The fix is dark-path-only
   per Session B's architecture. Confirm by inspection that the lassoed
   branch in `match.ts` (the `if (ledgerRow)` block) is untouched.

---

## SESSION D.1 SUMMARY DOC

Create `SESSION-D.1-SUMMARY.md` at repo root documenting:

- Files modified (2 — `match.ts`, `resolve.ts`)
- DN-2 final resolution: dark-path now matches lassoed and billing-calc.ts
  on adjustment-only handling
- Changes per file (SELECT addition + option pass-through + TODO deletion)
- TypeScript baseline post-D.1
- Latent vs manifested bug framing (zero current production exposure, but
  fixes before cycle 2 of 5 Logistics)
- Reference to the verified `computeSingleCeiling` signature in
  `markup-context.ts` that already supported this pattern

---

## MERGE INSTRUCTIONS (for Sawyer)

1. Review commit diffs — focus on `match.ts` line ~178 + the dark-path
   `computeSingleCeiling` call site, and `resolve.ts` line ~134 + the
   resolve loop's `computeSingleCeiling` call site.
2. Run `tsc --noEmit` from `src/alamo/` (with `node_modules` installed in
   the worktree per `docs/dev-workflow-notes.md`); confirm 11 ± 3 errors.
3. Optional manual test: re-run matching on Desert Boutique's existing
   carrier invoice (the one with 13 lines) and confirm `shipment_ledger`
   rows are unchanged (since 0 adjustment-only lines exist, the math
   path doesn't change). This is a behavior-preservation test, not a
   bug-reproduction test.
4. Merge to main via `--no-ff`.
5. Push to origin.

---

## POST-MERGE FOLLOW-UPS

Cowork briefing updates (separate instructions doc to be drafted post-merge):
- Mark **DN-2** fully RESOLVED in Section 12a DN log (the policy was
  RESOLVED 2026-04-20, but the outstanding TODO note carried forward;
  this fix completes the resolution)
- Add Session D.1 to Section 12 "Completed and verified"
- Drop item #1 (Dark-path adjustment-only fix) from Section 12 "Next task"
  — remaining items rebump 2→1, 3→2, etc.
- The 2379 → 11 TS-baseline calibration (already RESOLVED per C.2 cleanup)
  gets one corroborating data point: D.1 should also land at 11 ± 3.
