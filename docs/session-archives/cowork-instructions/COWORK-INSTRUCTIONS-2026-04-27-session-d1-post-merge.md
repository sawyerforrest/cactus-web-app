# COWORK INSTRUCTIONS — Session D.1 post-merge cleanup

**Generated:** 2026-04-27 (post-Session-D.1 merge)
**Source chat:** D.1 dark-path adjustment-only fix (DN-2 closure)
**Target file:** `cactus-master-briefing.md` (4 edits)

---

## How to use this document

D.1 is already merged to main. These edits update the briefing to
reflect the resolved state.

Hand this file to Cowork:

> "Apply the four edits described in this document to cactus-master-briefing.md."

Review the diffs in your text editor before saving / committing.

---

## EDIT 1 — Mark DN-2 fully RESOLVED in Section 12a DN log

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12a (OPEN DECISIONS — DN LOG), the existing
DN-2 entry titled `### DN-2 — Flat markup on is_adjustment_only = TRUE lines`.

**Action:** The current entry has the policy marked RESOLVED 2026-04-20
but carries an "Outstanding TODO from Session B.1" paragraph that's no
longer outstanding. Replace the entire body of the DN-2 entry (everything
from the `**Status:**` line through the end of the TODO paragraph, up to
but not including the next `### DN-` heading) with the fully-resolved
version below. Do NOT modify the `### DN-2 — ...` heading itself.

**Find the existing Status line:**

```markdown
**Status:** RESOLVED 2026-04-20. Policy: flat markup applies once per
```

**Replace it (and the entire body beneath, up to but not including the
`### DN-3` heading) with:**

```markdown
**Status:** FULLY RESOLVED 2026-04-27. Policy was set 2026-04-20 (flat
markup applies once per tracking number to the base/freight charge, not
to surcharges, not to adjustment-only lines — no base charge to attach
the fee to). Implementation completed across all three sites:

- **invoice_line_items side** (lassoed and dark): handled correctly by
  `billing-calc.ts` since Session B.1 (2026-04-20).
- **shipment_ledger side, dark match-time path** (`match.ts`): resolved
  in Session D.1 (2026-04-27, merge commit `<merge-sha>`). SELECT now
  loads `is_adjustment_only`; `computeSingleCeiling()` call passes
  `{ isAdjustmentOnly: lineItem.is_adjustment_only }` option bag.
- **shipment_ledger side, manual-resolve path** (`resolve.ts`): resolved
  in Session D.1 (same commit). Same SELECT addition and option-bag
  pass-through.

The skip logic in `computeSingleCeiling()` uses strict equality
(`options?.isAdjustmentOnly === true`), so passing `false` or `undefined`
preserves pre-fix behavior. The fix is non-breaking by construction.

**Production exposure at fix time:** zero. Desert Boutique is the only
dark account in the database (13 line items, 0 adjustment-only).
Verified live 2026-04-27. Bug was preventive — fixes before cycle 2 of
5 Logistics in mid-June 2026, when DHL eCommerce invoices flowing
through the production pipeline will contain adjustment-only lines.
```

After Cowork applies this edit, manually replace `<merge-sha>` with the
actual merge commit SHA from `git log --oneline -3 main`. The merge
commit is the most recent commit on main with two parents — easy to
spot.

---

## EDIT 2 — Add Session D.1 to "Completed and verified"

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Completed and verified`
subsection. The most recent existing entry is the Stripe account setup
milestone from 2026-04-27 (which sits above the Session C.2 entry from
2026-04-26).

**Action:** Insert as a new top-level checklist item IMMEDIATELY ABOVE
the Stripe account setup entry (matching most-recent-first ordering).

**Content to insert (verbatim, including the leading `- [x]` and a
single trailing newline before the existing Stripe entry):**

```markdown
- [x] Session D.1 (2026-04-27): Dark-path adjustment-only fix completes
      DN-2 resolution. Two surgical edits per file in `match.ts` and
      `resolve.ts`: SELECT statement adds `is_adjustment_only` column;
      `computeSingleCeiling()` call passes `{ isAdjustmentOnly:
      lineItem.is_adjustment_only }` option bag; resolved-by-this-fix
      TODO comment block deleted. 2 files modified, 1 new
      (`SESSION-D.1-SUMMARY.md`). 3 commits sequenced per spec on
      `claude/distracted-euclid-e4d14e` (48cccfb match.ts → 35c1ac9
      resolve.ts → 07fb018 summary doc), merged --no-ff to main on
      2026-04-27. Post-edit landing line numbers: `match.ts` SELECT @
      242, `computeSingleCeiling` call @ 479-481; `resolve.ts` SELECT
      @ 134, `computeSingleCeiling` call @ 166-168. Spec referenced
      stale numbers (178, 134) that were corrected in the summary.
      TS baseline verification on the worktree: `npx tsc --noEmit`
      returned exactly 11 errors in 4 files, all pre-existing Supabase
      generic-error narrowing in `app/invoices/...` files
      (billing-calc.ts × 1, match.ts × 1, resolve.ts × 4, disputes/
      page.tsx × 5). Zero new errors from D.1's edits — the new SELECT
      column and option-bag pass-through compile cleanly. Halt-point
      verification before execution: TODO blocks present and intact,
      `computeSingleCeiling` signature unchanged at
      `markup-context.ts:90`, exactly one call per file confirmed via
      grep, no naming collisions, lassoed branch in `match.ts`
      untouched per AC #5. No production exposure at fix time
      (Desert Boutique × 13 lines, 0 adjustment-only); fix is
      preventive ahead of 5 Logistics cycle 2. Spec at
      `docs/session-archives/specs/cactus-session-d1-dark-path-adjustment-only-fix-spec.md`;
      summary at repo root `SESSION-D.1-SUMMARY.md`.
```

---

## EDIT 3 — Replace the "Next task — START HERE next session" subsection

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, find the subsection beginning with the
heading `### Next task — START HERE next session`.

**Action:** Replace the entire subsection — from the `### Next task`
heading through to (but NOT including) the next `### ` heading that
follows it (which is `### Deferred follow-ups (from Session B)`).

The replacement drops the now-shipped Session D.1 entry (was item #1)
and renumbers the remaining items. Day-counter updated from 15 to 14.

**Replacement content (verbatim):**

```markdown
### Next task — START HERE next session

**5 Logistics is signed (2026-04-24). First DHL eCommerce invoice arrives
Monday May 11, 2026 (14 days from today). Manual-processing path agreed
for cycle 1; production pipeline target is cycle 2 (mid-June or so).**

Updated build queue, in priority order:

**1. Supabase CLI + type regen workflow (30 min)**
   Carried forward. Note: post-D.1, the regen may also clear some or
   all of the 11 lingering `app/invoices/...` errors that are pure
   Supabase generic-error narrowing noise.

**2. C.2 test-data cleanup (5 min)**
   Delete the `C2 Test Org` plus its four `Test ...` carrier accounts
   left in the database from C.2 verification. Easy via Supabase MCP
   in any chat session.

**3. 5 Logistics manual-processing prep (1-2 hours, chat session)**
   Build a careful spreadsheet template for cycle-1 manual invoicing:
   rate-card lookup logic in formulas, surcharge passthrough, DHL invoice
   ingest checklist, Warehance fee tracking. Source the rate card from
   Sawyer's structured rate card file; this also becomes the seed file
   for the rate-card architecture session. Recommend running this as a
   chat session with Claude before any code is written.

**4. Session B.2 — Client CSV revision (3-4 hours)**
   Spec exists at `docs/session-archives/specs/cactus-session-b2-revision-spec.md`.
   Carried forward.

**5. Rate-card architecture session (~3-4 hours)**
   New `rate_card_rates` child table (weight × zone × service → rate);
   `billing-calc.ts` rate-card branch (replace base_charge from rate card,
   pass surcharges raw, fallback to carrier_charge passthrough on
   off-rate-card lookups); seed 5 Logistics rate cards; resolve DN-11
   auto-flip-on-first-upload behavior. Must ship before cycle 2 of 5
   Logistics invoicing.

**6. DHL eCommerce parser session (~2-3 hours)**
   `carrier_invoice_formats` seed for DHL eCommerce; validate parser
   against the first real 5 Logistics carrier invoice (received May 11);
   surcharge taxonomy mapping. Must ship before cycle 2.

**7. Stripe integration architecture session (~3-4 hours)**
   Per DN-12: `client_payment_methods` table, Setup Intent flow at
   onboarding, PaymentIntent creation in `/api/invoice`, webhook
   handler, `payment_status` lifecycle on `client_invoices`,
   reconciliation against Mercury deposits. Must ship before cycle 2
   to avoid manual-processing creep on inbound payments.

**8. Stage 6 — Rate engine core (Phase 1 main path, parked behind 5L work)**

**9. Stage 7 — UPS + FedEx + DHL eCommerce API adapters**

**10. Partner-fee architecture session (DN-10 implementation, ~3-4 hours)**
    5 tables + `partner_id` on `org_carrier_accounts` + Alamo UI for
    `/partners` + invoice-triggered accrual logic. Sawyer paying Warehance
    manually until this ships.

**11. Stage 8 — Warehance WMS integration with API-triggered accruals**
```

---

## EDIT 4 — Add corroborating data point to TS baseline drift entry

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Deferred follow-ups (from
Session B)` subsection. Find the bullet titled `**TS baseline drift
investigation — RESOLVED 2026-04-26**`.

**Action:** Append a single new sentence to the end of the entry's
description paragraph, before whatever follows. The existing description
ends with "If the 11 lingering errors persist after the Supabase
type-regen workflow (Next-task item #2) ships, file as a focused cleanup
session." (or similar — exact wording from the C.2 cleanup pass).

**Find the existing trailing sentence:**

```markdown
If the 11 lingering errors persist after the Supabase type-regen
workflow (Next-task item #2) ships, file as a focused cleanup session.
```

**Replace it with:**

```markdown
If the 11 lingering errors persist after the Supabase type-regen
workflow (Next-task item #1, post-D.1 renumbering) ships, file as a
focused cleanup session. Corroborated 2026-04-27 in Session D.1's
worktree typecheck: same 11 errors, same 4 files, same `GenericStringError`
narrowing pattern. The baseline is stable across sessions.
```

Note the parenthetical update from "item #2" to "item #1, post-D.1
renumbering" — D.1 dropped what was item #1, so the Supabase CLI item
shifts up.

---

## SUMMARY OF CHANGES

After Cowork completes all four edits:

- **DN-2 marked FULLY RESOLVED** with implementation summary across all
  three sites and merge commit reference (manually fill in `<merge-sha>`
  post-Cowork)
- **Session D.1 added** as the most recent "Completed and verified"
  entry, with full detail matching prior sessions' rigor, including the
  actual landing line numbers (240/479-481 for match.ts; 134/166-168 for
  resolve.ts)
- **"Next task" subsection renumbered** — Session D.1 dropped, remaining
  items rebumped 2→1, 3→2, etc., now a 11-item queue including the
  Stripe integration session that was added during DN-12 work
- **TS baseline drift entry corroborated** with D.1's typecheck data
  point (same 11 errors, same files, baseline is stable)

The briefing will be internally consistent after these edits — DN-2
fully closed, no remaining outstanding TODOs from D.1's scope, queue
priorities accurately reflect the May 11 deadline at 14 days out.

---

## MANUAL POST-COWORK STEP

After Cowork applies the four edits:

1. Run `git log --oneline -3 main` to find the D.1 merge commit SHA
2. Open `cactus-master-briefing.md` in your editor
3. Find the `<merge-sha>` placeholder in the DN-2 entry (Edit 1)
4. Replace with the actual SHA (the merge commit, which has two
   parents — visible in `git log` as the line right above the
   `Merge branch...` text, or use `git log --merges -1 --oneline`)
5. Save, then commit + push the briefing changes

---

## FILE MOVE (post-Cowork-completion)

Move this instructions doc to:

```
cactus-web-app/docs/session-archives/cowork-instructions/
```

Keeps the archive trail intact alongside the prior 2026-04-25, 04-26,
and 04-27 instruction docs.
