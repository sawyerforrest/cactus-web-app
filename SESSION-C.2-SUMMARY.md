# Session C.2 — Flat-markup Input on Carrier-account Form

**Branch:** `claude/crazy-shannon-8c6296`
**Date:** 2026-04-25
**Resolves:** DN-8, DN-9
**Spec:** `docs/session-archives/specs/cactus-session-c2-flat-markup-form-spec.md`

---

## Files Touched (6 total: 3 new, 3 modified, plus 3 display-surface edits)

### New
- `src/alamo/lib/markup.ts` — shared `formatMarkup(account)` helper
- `src/alamo/app/orgs/[id]/carriers/new/MarkupConfigSection.tsx` — client component for the markup-type radio + value input
- `src/alamo/app/orgs/[id]/carriers/new/AccountConfigFields.tsx` — client wrapper that owns `is_cactus_account` + `use_rate_card` state and conditionally renders `MarkupConfigSection` (or one of two notice messages when markup is not applicable)

### Modified
- `src/alamo/app/orgs/[id]/carriers/new/page.tsx` — wires up the new client components; rewrote the server action with state-aware validation using decimal.js (no `parseFloat`)
- `src/alamo/app/orgs/[id]/page.tsx` — display surface 1 (org-detail carriers list)
- `src/alamo/app/orgs/[id]/carriers/[carrierId]/page.tsx` — display surface 2 (account-detail stat card)
- `src/alamo/app/carriers/[carrier]/page.tsx` — display surface 3 (carrier sidebar list); also added `markup_flat_fee` to the explicit column SELECT

`/carriers/page.tsx` (top-level Carrier Accounts) shows aggregate per-carrier counts only — no per-account markup display, so no helper application needed there.

No edit form exists at `/orgs/[id]/carriers/[carrierId]/edit` (Halt #2 was inapplicable). Once an edit form is built, the same client components and helper apply unchanged.

---

## DN-8 Resolution — Flat-markup Input

The form now exposes a Markup-type radio (Percentage | Flat fee) inside a single client component. Selecting "Flat fee" reveals a `$`-prefixed currency input with default `1.50`. The server action reads `markup_type` + `markup_value` and writes the correct column (`markup_percentage` or `markup_flat_fee`), defaulting the unused column to `0`.

A flat-markup account can now be created entirely through the UI — no DB seed required.

## DN-9 Resolution — Client-owned Accounts Cannot Have Markup

The `Account ownership` select is now controlled state in `AccountConfigFields`. When set to "Pass-through (client-owned)" the markup section is replaced with an explanatory notice; no markup form fields render, so the form physically cannot submit non-zero markup. The server action mirrors this with a `Decimal` check that rejects any non-zero `markup_value` when `is_cactus_account === false`.

## Rate-card Extension

The form now also exposes a `Billing source` select (Live carrier rates + markup | Rate card). Selecting "Rate card" hides the markup section behind a notice pointing to per-account rate-card configuration; both markup columns are forced to `0` on insert. The server action's third branch handles this case explicitly. Previously `use_rate_card` was hardcoded `false` on insert with no UI control.

## Shared Display Helper

`formatMarkup(account)` returns:

| Account state | Output |
|---|---|
| `is_cactus_account = false` | `"None (client-owned)"` |
| `use_rate_card = true` | `"Rate card"` |
| `markup_flat_fee > 0` | `"flat $1.50"` |
| `markup_percentage > 0` | `"15.0%"` |
| All zero | `"None"` |

Three previously-inline `(markup_percentage * 100).toFixed(1)%` expressions were replaced with `formatMarkup(account)` calls.

## Decimal.js Throughout

Per Rule 1 (no floats), the server action uses `new Decimal(...)` for every numeric handoff: `markup_value`, `dispute_threshold`, the DN-1 cross-check, and the DN-9 `gt(0)` enforcement. Values are passed to Supabase as strings cast `as unknown as number` (existing codebase pattern).

---

## Test Scenarios Verified (Code-level)

1. ✅ Form renders four account states correctly (percentage / flat / rate-card / client-owned)
2. ✅ Server action rejects both-fields-positive payload (DN-1)
3. ✅ Server action rejects non-zero markup on client-owned accounts (DN-9)
4. ✅ Server action defaults both markup columns to `0` for rate-card accounts
5. ✅ `formatMarkup` covers all four account states + the all-zero edge case
6. ✅ TypeScript: no new errors introduced by C.2 changes (11 pre-existing baseline errors in `app/invoices/...` are unrelated Supabase generic-error narrowing — none in any file C.2 touches)

Live in-browser submission for each state remains for the merger to verify per the spec's merge-instruction step 2.

---

## Commit Sequence

1. `Session C.2 [1/5]: MarkupConfigSection client component (DN-8 base)`
2. `Session C.2 [2/5]: AccountConfigFields reactivity (DN-9 + rate-card)`
3. `Session C.2 [3/5]: formatMarkup helper at src/alamo/lib/markup.ts`
4. `Session C.2 [4/5]: apply formatMarkup across 3 display surfaces`
5. `Session C.2 [5/5]: summary doc` *(this commit)*

---

## Merge Instructions (for Sawyer)

1. Review commit diffs — `git log claude/crazy-shannon-8c6296 --oneline ^main`
2. Test create flow in dev:
   - Percentage account at 20% → expect `markup_percentage = 0.2000`, `markup_flat_fee = 0.0000`
   - Flat account at $2.50 → expect `markup_percentage = 0.0000`, `markup_flat_fee = 2.5000`
   - Rate-card account → markup section hidden; expect both columns = 0
   - Client-owned account → markup section hidden; expect both columns = 0
3. Verify list/detail/sidebar display:
   - `/orgs/[id]` carriers list
   - `/orgs/[id]/carriers/[carrierId]` stat card
   - `/carriers/[carrier]` per-carrier sidebar list
4. Spot-check existing 6 accounts render correctly:
   - Cactus 3PL HQ × 4 → `"12.0%"` / `"15.0%"` / etc
   - Desert Boutique → percentage rendering for dark account
   - Pineridge Direct → `"flat $1.50"`
5. Merge via `git merge --no-ff claude/crazy-shannon-8c6296` from `main`
6. Push to origin

---

## Post-merge Briefing Updates (Cowork)

- Mark **DN-8** RESOLVED in Section 12 DN log
- Mark **DN-9** RESOLVED in Section 12 DN log
- Add Session C.2 to Section 12 "Completed and verified"
- Drop item #1 (Session C.2) from Section 12 "Next task" list
- Drop the embedded item #5 reference (folded into C.2)

Remaining "Next task" items after C.2:
- Item #2: Dark-path adjustment-only fix (30 min)
- Item #3: Supabase CLI + type regen workflow (30 min)
- Item #4: Session B.2 CSV revision (3-4 hours, spec exists)
- *New top priority post-C.2:* 5 Logistics manual-processing prep + rate-card architecture session
