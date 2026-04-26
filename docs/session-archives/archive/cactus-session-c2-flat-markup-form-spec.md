# SESSION C.2 SPEC — FLAT-MARKUP INPUT ON CARRIER-ACCOUNT FORM

**Branch:** New `claude/*` worktree, based on current main (or C.1-merged main if C.1 lands first)
**Prerequisites:** Can run independently of C.1, but ideally C.1 ships first (no reason beyond clean sequencing)
**Estimated duration:** 30-45 minutes
**Risk level:** LOW — UI form change + server action update. No schema changes.

---

## THE BUG

Tonight's audit (2026-04-23) found that `/orgs/[id]/carriers/new` INSERT does not set `markup_flat_fee`. The schema has the column, but the UI form has no input for it. Flat-markup carrier accounts today can only be created via direct DB seed (how Pineridge was set up). This is a pre-onboarding blocker: Cactus cannot onboard a real flat-markup client through the UI.

---

## WHAT TO BUILD

Add flat-markup input to the carrier-account creation form such that admins can create either:
- A **percentage-markup** account (existing behavior)
- A **flat-markup** account (new)

Exactly one must be set. Never both (that's DN-1 in the briefing — needs to be prevented at save time).

---

## UX DESIGN

Two acceptable approaches. Pick whichever feels cleaner for this codebase's form pattern:

### Option A — Radio toggle (recommended)

Top of markup section:
```
Markup type: ( ) Percentage   ( ) Flat fee
```

Below the radio:
- If "Percentage" selected: show existing `markup_percentage` input (e.g., "15.0" → 15% markup)
- If "Flat fee" selected: show new `markup_flat_fee` input (e.g., "1.50" → $1.50 per shipment flat fee)

Only the selected type's input is visible and required. The other is hidden.

### Option B — Both fields visible with validation

Show both inputs side-by-side. Validation on submit:
- Exactly one must be > 0
- Both zero or both non-zero → validation error

**Recommendation: Option A.** Cleaner UX. No risk of "both filled" user error. Default radio selection: Percentage (most common).

---

## IMPLEMENTATION

### Files to modify

1. `src/alamo/app/orgs/[id]/carriers/new/page.tsx` — form UI + server action
2. Possibly a shared form component if the styling is extracted — check first

### Form state management

This is a React Server Component with a form action. The radio state needs to be tracked in the form, either:
- As a hidden form field updated by radio's onChange (if component is a client component)
- As a form field that the server action reads and routes on

Look at how the existing form handles conditional inputs (if any). If the form is purely server-rendered with no client interactivity, add a small client component for the markup section OR post the raw form data and let the server action decide routing.

### Server action update

Current INSERT (approximately line 42-53):

```typescript
.insert({
  org_id: id,
  account_nickname,
  account_number,
  carrier_code,
  carrier_account_mode,
  markup_percentage,
  dispute_threshold,
  is_cactus_account,
  use_rate_card: false,
})
```

New INSERT: based on radio selection, set either `markup_percentage` or `markup_flat_fee`, leave the other as NULL. Example logic:

```typescript
const markupType = formData.get('markup_type') as 'percentage' | 'flat'
const markupValueRaw = formData.get('markup_value') as string

const insertPayload: Record<string, unknown> = {
  org_id: id,
  account_nickname,
  account_number,
  carrier_code,
  carrier_account_mode,
  dispute_threshold,
  is_cactus_account,
  use_rate_card: false,
}

if (markupType === 'percentage') {
  insertPayload.markup_percentage = parseFloat(markupValueRaw) / 100  // UI shows 15.0, DB stores 0.15
  insertPayload.markup_flat_fee = null
} else if (markupType === 'flat') {
  insertPayload.markup_percentage = null
  insertPayload.markup_flat_fee = parseFloat(markupValueRaw)  // UI and DB both show 1.50
} else {
  throw new Error('Markup type must be either "percentage" or "flat"')
}

const { error } = await supabase
  .from('org_carrier_accounts')
  .insert(insertPayload)
```

**IMPORTANT**: Confirm whether the schema stores `markup_percentage` as a fraction (0.15 for 15%) or as a percent (15 for 15%). Look at existing rows:

```sql
SELECT account_nickname, markup_percentage, markup_flat_fee
FROM org_carrier_accounts
WHERE markup_percentage IS NOT NULL OR markup_flat_fee IS NOT NULL
LIMIT 5;
```

Match the existing storage format. If existing values are like 0.15, store as fraction. If 15.00, store as percent. Adjust the form's conversion accordingly.

### Validation (DN-1 prevention)

Server action must reject any payload where BOTH `markup_percentage` and `markup_flat_fee` would be non-null. Even if the radio UI prevents it, defense in depth matters for financial-critical code.

### Display the markup correctly after save

After the INSERT redirects back to `/orgs/[id]`, the carrier accounts list renders the new account. Per tonight's briefing (Section 12 item #5, now to be done as part of this spec optionally), the list currently shows only `markup_percentage`. If the newly-created account has `markup_flat_fee` instead, the list will show "0.0%" which is misleading.

**Within scope of this spec** (bundled): Also update the list display so flat-markup accounts show "flat $X.XX" instead of "0.0%". Find the list rendering (search for "markup" in `/orgs/[id]/page.tsx` or wherever the carrier accounts table renders) and add conditional display logic.

### TypeScript types

If Supabase types are regenerated (Change 4 from Session C.1 or a separate step), they'll already include `markup_flat_fee` in the insert payload type. If not regenerated, may need to cast or use `as any` temporarily. Don't let type errors block the work — note them and move on.

---

## PHASE STRUCTURE — SEQUENCE OF COMMITS

1. **Commit 1**: Add markup type radio + conditional inputs to the form
2. **Commit 2**: Update server action to route payload based on markup type
3. **Commit 3**: Add server-side validation preventing both markup fields set
4. **Commit 4**: Update `/orgs/[id]` carrier accounts list to display "flat $X.XX" correctly
5. **Commit 5**: Session C.2 summary doc

---

## HALT POINTS

Stop and report rather than proceed if:

1. **`markup_percentage` schema format is ambiguous** — i.e., the existing rows in the database have inconsistent representations (some 0.15, some 15). This suggests the column's intended format was never settled.

2. **The form rendering uses a pattern not covered by this spec** — e.g., if it's using a React Hook Form wrapper or similar library, the radio toggle implementation may be different. Report the form library used and request guidance.

3. **Creating a test carrier account fails with a constraint violation** — would indicate a CHECK constraint or trigger on `org_carrier_accounts` that rejects certain combinations. Report the exact error.

---

## ACCEPTANCE CRITERIA

After Claude Code completes:

1. ✅ Admin can navigate to `/orgs/[id]/carriers/new`, select "Flat fee" radio, enter `1.50`, submit, and see a new carrier account created with `markup_flat_fee = 1.50` and `markup_percentage = null`
2. ✅ Admin can still create a percentage-markup account (backward compatible)
3. ✅ Server rejects any payload that somehow has both fields set
4. ✅ `/orgs/[id]` list shows "flat $1.50" for the new account, not "0.0%"
5. ✅ TypeScript baseline holds (~1640 errors ± 10)
6. ✅ No regressions: existing carrier accounts (Pineridge flat, Cactus 3PL HQ percentage, Desert Boutique dark) still display and work correctly

---

## SESSION C.2 SUMMARY DOC

Create `SESSION-C.2-SUMMARY.md` at repo root documenting:

- Files modified
- How the form now handles flat vs percentage
- DN-1 validation logic
- List display update
- Test scenarios verified

---

## MERGE INSTRUCTIONS (for Sawyer)

1. Review commit diffs
2. Test: create a test org, add a carrier account with flat $2.50 markup, verify DB has it correctly
3. Test: create another carrier account with 20% percentage markup, verify DB
4. Test: verify the /orgs/[id] list shows both correctly
5. Merge to main via `--no-ff`
6. Push to origin

---

## POST-MERGE FOLLOW-UPS

Update briefing via Cowork:
- Mark Session 12 Next task items #3 (dark-path) — NO wait, this is item #5 — as COMPLETE
- Add Session C.2 to "Completed and verified"

Remaining Next task items after C.1 + C.2:
- Item #3: Dark-path adjustment-only fix (30 min)
- Item #4: Supabase CLI + type regen workflow
- Item #6: Session B.2 CSV revision
