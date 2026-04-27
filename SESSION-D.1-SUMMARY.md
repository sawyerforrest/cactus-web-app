# SESSION D.1 — DARK-PATH ADJUSTMENT-ONLY FIX

**Date:** 2026-04-27
**Branch:** `claude/distracted-euclid-e4d14e`
**Base:** `main` @ `3c168a1` (post-DN-12)
**Spec:** `docs/session-archives/specs/cactus-session-d1-dark-path-adjustment-only-fix-spec.md`
**Resolves:** DN-2 outstanding TODO (policy resolved 2026-04-20; dark-path implementation deferred until now)

---

## What changed

Two surgical edits, identical pattern, mirrored across the dark-path
matching site and the manual-resolve site. Both sites already had
TODO comments prescribing the exact change.

### `src/alamo/app/invoices/[id]/actions/match.ts`

| Change | Landed at | Description |
|---|---|---|
| 1A — SELECT | line 242 | Added `is_adjustment_only` to the PENDING-line SELECT |
| 1B — call site | lines 479–481 | Pass `{ isAdjustmentOnly: lineItem.is_adjustment_only }` to `computeSingleCeiling` in the dark-path branch |
| 1C — TODO removal | (was lines 478–485) | Deleted the DN-2 follow-up comment block above the call |

Net diff: +4 / −10 lines.

### `src/alamo/app/invoices/[id]/actions/resolve.ts`

| Change | Landed at | Description |
|---|---|---|
| 2A — SELECT | line 134 | Added `is_adjustment_only` to the HELD-line SELECT |
| 2B — call site | lines 166–168 | Pass `{ isAdjustmentOnly: lineItem.is_adjustment_only }` to `computeSingleCeiling` in the resolve loop |
| 2C — TODO removal | (was lines 165–170) | Deleted the DN-2 follow-up comment block above the call |

Net diff: +4 / −8 lines.

> **Spec line-number drift note:** The spec referenced `match.ts` SELECT
> "around line 178" — actual location was line 240 pre-edit, 242 post-edit.
> The spec's `resolve.ts` reference to "around line 134" was accurate.
> Structure of the BEFORE blocks matched the file verbatim in both cases,
> so this was cosmetic spec drift, not a real conflict.

---

## DN-2 final resolution

Before D.1, DN-2 was in a split state:

- **Lassoed path** (`billing-calc.ts`) — already correctly suppressed flat
  markup on `is_adjustment_only` lines. Resolved 2026-04-20.
- **Dark path** (`match.ts`) and **manual-resolve path** (`resolve.ts`) —
  carried explicit TODOs noting the SELECT didn't load the flag, so flat
  markup was unconditionally added to `shipment_ledger.final_billed_rate`.

Post-D.1: all three sites use the same `computeSingleCeiling(charge, ctx,
{ isAdjustmentOnly })` pattern. The ledger now agrees with the invoice
on adjustment-only flat-markup behavior across every code path.

---

## Latent vs manifested

**Real production exposure today: zero.** Desert Boutique is the only
dark account in the database (13 line items, 0 adjustment-only — verified
live 2026-04-27).

**Real production exposure becomes non-zero when any of these fire:**
- 5 Logistics' DHL eCommerce account enters `match.ts`/`resolve.ts`
  (cycle 2, mid-June 2026). DHL invoices have adjustment-only lines
  similar to UPS (~22% of FRT rows in Session A's UPS data).
- A new dark-account client onboards.
- A historical reprocess of a dark-account invoice runs.

So D.1 is a "fix before cycle 2" item, not a hot bug. The fix preserves
existing behavior on Desert Boutique's data (option bag evaluates to
`{ isAdjustmentOnly: false }` for every existing row).

---

## Upstream signature (verified)

The third parameter on `computeSingleCeiling` was already optional and
already implemented to skip flat markup when `isAdjustmentOnly === true`.
See `src/alamo/lib/markup-context.ts:90-114`. No upstream changes needed
in D.1 — the helper was written ahead of demand on 2026-04-20 and just
needed callers to start using it on the dark side.

Strict comparison (`options?.isAdjustmentOnly === true`) means
`undefined`, `null`, and `false` all preserve current behavior — so
Sawyer can roll back either commit independently with no math drift.

---

## Schema

No migrations. `invoice_line_items.is_adjustment_only` was already:

- `boolean`, `NOT NULL`, default `false`
- Verified live 2026-04-27 via direct Supabase query

---

## TypeScript baseline

**Not run by Claude in this session.** The worktree at
`.claude/worktrees/distracted-euclid-e4d14e/src/alamo/` does not have
`node_modules` populated — per `docs/dev-workflow-notes.md`, worktrees
need a fresh `npm install` and Turbopack rejects symlinks pointing
outside the worktree filesystem root.

Pre-merge `tsc --noEmit` is on Sawyer's checklist below. Per spec, the
baseline should land at 11 ± 3 errors with zero new errors from D.1
(both edits are against a verified-optional signature on a
`NOT NULL boolean` column).

---

## Acceptance-criteria status

| AC | Status |
|---|---|
| 1. `match.ts` SELECT + call-site option + TODO deleted | ✅ |
| 2. `resolve.ts` SELECT + call-site option + TODO deleted | ✅ |
| 3. TS baseline 11 ± 3 with zero new errors | ⏳ deferred to merge step |
| 4. Desert Boutique math preserved (0 adjustment-only rows → no behavior change) | ✅ by inspection |
| 5. Lassoed-path code untouched | ✅ — only the dark `else` branch in `match.ts` was edited; the `if (ledgerRow)` lassoed branch is byte-identical |

---

## Commits

1. `48cccfb` — `fix(match): suppress flat markup on dark-path adjustment-only lines (DN-2)`
2. `35c1ac9` — `fix(resolve): suppress flat markup on adjustment-only resolved lines (DN-2)`
3. (this doc)

Each commit is independently safe to revert: the SELECT addition is
harmless without the option pass-through (extra column unused), and the
option pass-through is harmless without the SELECT update (passes
`undefined`, which `computeSingleCeiling` treats as the pre-fix path).

---

## Merge instructions for Sawyer

1. Review commit diffs:
   - `match.ts` line 242 (SELECT) and lines 479–481 (call site).
   - `resolve.ts` line 134 (SELECT) and lines 166–168 (call site).
2. Install deps and run TS check in the worktree:
   ```bash
   cd .claude/worktrees/distracted-euclid-e4d14e/src/alamo
   cp ../../../../src/alamo/.env.local .
   npm install
   npx tsc --noEmit
   ```
   Confirm 11 ± 3 errors total, all pre-existing in
   `app/invoices/...` Supabase generic-error narrowing. No new errors
   from D.1 files.
3. Optional manual test: re-run matching on Desert Boutique's existing
   carrier invoice (13 lines, 0 adjustment-only) and confirm
   `shipment_ledger` rows are unchanged. Behavior-preservation test,
   not a bug-reproduction test — the path that changed isn't exercised
   by Desert's data.
4. Merge to main via `--no-ff`.
5. Push to origin.

---

## Post-merge follow-ups (separate Cowork instructions doc)

- Mark **DN-2** fully RESOLVED in Section 12a DN log (the policy was
  RESOLVED 2026-04-20; this fix completes the resolution).
- Add Session D.1 to Section 12 "Completed and verified".
- Drop item #1 (Dark-path adjustment-only fix) from Section 12
  "Next task" — remaining items rebump 2→1, 3→2, etc.
- Add D.1 as a corroborating data point on the ~11-error TS baseline
  (per C.2 cleanup).
