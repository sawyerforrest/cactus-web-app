# SESSION C.2 SPEC — FLAT-MARKUP INPUT ON CARRIER-ACCOUNT FORM

**Branch:** New `claude/*` worktree, based on C.1-merged main
**Prerequisites:** C.1 merged
**Estimated duration:** 60-75 minutes (revised from 30-45 after architectural review folded DN-9 and rate-card-hides-markup logic into scope)
**Risk level:** LOW — UI form change + server action update + shared display helper. No schema changes. No business-logic changes downstream of the form.
**Resolves:** DN-8 (form lacks flat-markup input) and DN-9 (form allows non-zero markup on client-owned accounts)

---

## THE BUGS

**DN-8** — `/orgs/[id]/carriers/new` INSERT does not set `markup_flat_fee`. Schema has the column, UI has no input. Flat-markup carrier accounts today can only be created via direct DB seed (how Pineridge was set up). Pre-onboarding blocker.

**DN-9** — Same form permits admins to configure non-zero markup on accounts where `is_cactus_account = FALSE`. Per Section 5 of the briefing, client-owned lassoed accounts must have 0% / $0 markup — Cactus's value there is portal access, tracking, claims, and analytics, not billing reselling. The new flat-fee input expands the surface for this misconfiguration; resolving DN-8 without resolving DN-9 ships a wider bug surface than today's.

**Rate-card extension** — The first paying customer (5 Logistics) is a rate-card-billed account. Their `org_carrier_accounts` row will have `use_rate_card = TRUE` and both markup fields = 0. The form must not require markup input when rate-card billing is selected, and the display must surface "Rate card" rather than "0.0%" for these accounts.

---

## WHAT TO BUILD

Markup configuration on the carrier-account creation form supports four account states:

| State | `is_cactus_account` | `use_rate_card` | Markup section behavior |
|---|---|---|---|
| Cactus-owned, percentage markup | TRUE | FALSE | Show; user enters `markup_percentage` |
| Cactus-owned, flat markup | TRUE | FALSE | Show; user enters `markup_flat_fee` |
| Cactus-owned, rate-card billed | TRUE | TRUE | Hide; both markup fields force to 0 |
| Client-owned | FALSE | (any) | Hide; both markup fields force to 0 |

Exactly one of `markup_percentage` or `markup_flat_fee` may be > 0 (DN-1). Both 0 is valid for the rate-card and client-owned states.

---

## UX DESIGN — Radio toggle inside reactive markup section

**Markup section visibility logic** (client-side, reactive to two existing form fields):
```
visible = is_cactus_account === true && use_rate_card === false
```

When visible:
```
Markup type: ( ) Percentage   ( ) Flat fee

[selected branch shows the corresponding input]
  Percentage:  [____] %     (e.g., 15.0 for 15%)
  Flat fee:    $[____]      (e.g., 1.50 for $1.50/shipment)
```

Default radio: Percentage (most common).

When hidden because `is_cactus_account = FALSE`, replace section with:
> *"Client-owned accounts pass the carrier bill directly to the client. Cactus's value here is portal access, tracking, and claims — no markup is configured."*

When hidden because `use_rate_card = TRUE`, replace section with:
> *"This account bills from a rate card. Configure rate-card pricing under Rate Cards. Markup is not set at the account level."*

---

## IMPLEMENTATION

### Files to modify

1. **`src/alamo/app/orgs/[id]/carriers/new/page.tsx`** — form UI + server action (DN-8, DN-9, rate-card extension)
2. **`src/alamo/app/orgs/[id]/page.tsx`** — org detail page; carrier accounts list display (existing in spec)
3. **`src/alamo/app/orgs/[id]/carriers/[carrierId]/page.tsx`** — carrier account detail page display (Add-1)
4. **`src/alamo/app/carriers/[carrier]/page.tsx`** — Carrier Accounts sidebar list display (Add-1)
5. **`src/alamo/lib/markup.ts`** *(new)* — shared `formatMarkup(account)` helper to prevent display drift across the three surfaces

If `/carriers/page.tsx` (top-level Carrier Accounts list) also displays markup per account, fold it in as well — verify during dry-run.

### Form state management

The radio toggle plus the reactive hide-markup-section logic together require a client component for the markup configuration block. The simplest factoring: extract a `<MarkupConfigSection>` client component that takes `isCactusAccount` and `useRateCard` as props (or reads them from form state via React state). The rest of the form can stay server-rendered.

If `is_cactus_account` and `use_rate_card` are currently rendered as static checkboxes on the server-rendered form, they need to be elevated into client-side state so `<MarkupConfigSection>` can react to changes. One approach: a parent client component wrapping the entire markup-relevant portion (account-mode toggles + markup section), with the rest of the form still server-rendered.

### Server action — full validation logic

```typescript
import Decimal from 'decimal.js'

// Read form fields
const isCactusAccount = formData.get('is_cactus_account') === 'true'
const useRateCard = formData.get('use_rate_card') === 'true'
const markupType = formData.get('markup_type') as 'percentage' | 'flat' | null
const markupValueRaw = formData.get('markup_value') as string | null

// Default both to '0' (string for decimal.js handoff to NUMERIC column)
let markupPercentage: string = '0'
let markupFlatFee: string = '0'

if (!isCactusAccount) {
  // DN-9: client-owned accounts must have zero markup
  if (markupValueRaw && new Decimal(markupValueRaw).gt(0)) {
    throw new Error(
      'Client-owned accounts cannot have markup configured. ' +
      'Cactus value here is portal access, tracking, claims, and analytics.'
    )
  }
  // Both fields stay '0'
} else if (useRateCard) {
  // Rate-card-billed: markup lives in the rate card, not on the account
  // Both fields stay '0'
} else {
  // Cactus-owned, not rate-card: standard markup
  if (markupType === 'percentage') {
    // UI shows "15.0", DB stores "0.1500"
    markupPercentage = new Decimal(markupValueRaw ?? '0').div(100).toString()
  } else if (markupType === 'flat') {
    // UI and DB both "1.50"
    markupFlatFee = new Decimal(markupValueRaw ?? '0').toString()
  } else {
    throw new Error(
      'Markup type must be "percentage" or "flat" for Cactus-owned accounts not using rate cards.'
    )
  }
}

// DN-1 defense in depth: UI should prevent both > 0, but server validates anyway
if (new Decimal(markupPercentage).gt(0) && new Decimal(markupFlatFee).gt(0)) {
  throw new Error(
    'Cannot set both markup_percentage and markup_flat_fee. Choose one markup type.'
  )
}

const insertPayload = {
  org_id: id,
  account_nickname,
  account_number,
  carrier_code,
  carrier_account_mode,
  is_cactus_account: isCactusAccount,
  use_rate_card: useRateCard,
  markup_percentage: markupPercentage as unknown as number,
  markup_flat_fee: markupFlatFee as unknown as number,
  dispute_threshold,
}

const { error } = await supabase
  .from('org_carrier_accounts')
  .insert(insertPayload)
```

### Schema reality (verified during architectural review)

Both markup columns are `NUMERIC NOT NULL DEFAULT 0.0000`. Storage formats:
- `markup_percentage` — fraction (0.1500 = 15%); NUMERIC(7,4)
- `markup_flat_fee` — dollar amount (1.5000 = $1.50); NUMERIC(18,4)

Confirmed against existing data: Cactus 3PL HQ accounts at 0.1200–0.2000 with flat 0.0000; Pineridge Direct at percentage 0.0000 with flat 1.5000. The unset markup is always 0, never NULL.

### Decimal handling at the boundary

Per Rule 1 (no floats ever), the form's server action must use `decimal.js` for any markup arithmetic — never `parseFloat()`. Pass `.toString()` values to Supabase; Postgres NUMERIC parses them cleanly. Cast `as unknown as number` when the Supabase TypeScript type complains; this pattern already exists elsewhere in the codebase.

### Shared display helper

New file `src/alamo/lib/markup.ts`:

```typescript
import Decimal from 'decimal.js'

interface CarrierAccount {
  is_cactus_account: boolean
  use_rate_card: boolean
  markup_percentage: number | string
  markup_flat_fee: number | string
}

export function formatMarkup(account: CarrierAccount): string {
  if (!account.is_cactus_account) return 'None (client-owned)'
  if (account.use_rate_card) return 'Rate card'

  const flat = new Decimal(account.markup_flat_fee ?? 0)
  const pct = new Decimal(account.markup_percentage ?? 0)

  if (flat.gt(0)) return `flat $${flat.toFixed(2)}`
  if (pct.gt(0)) return `${pct.mul(100).toFixed(1)}%`

  return 'None'
}
```

Apply `formatMarkup(account)` at all three (or four) display surfaces. Replace any inline `markup_percentage * 100` formatting that exists today.

---

## PHASE STRUCTURE — SEQUENCE OF COMMITS

1. **Commit 1:** Extract `<MarkupConfigSection>` client component with radio toggle + conditional inputs (DN-8 base)
2. **Commit 2:** Add `is_cactus_account` and `use_rate_card` reactivity (DN-9 + rate-card extension); markup section hides per state matrix
3. **Commit 3:** Update server action with full state-aware validation logic (DN-1 defense-in-depth, DN-9 enforcement, decimal.js arithmetic)
4. **Commit 4:** Create `src/alamo/lib/markup.ts` `formatMarkup()` helper
5. **Commit 5:** Apply `formatMarkup()` across all three (or four) display surfaces; remove inline formatting
6. **Commit 6:** Session C.2 summary doc

---

## HALT POINTS

Stop and report rather than proceed if:

1. **Form structure does not support a partial client-component refactor cleanly.** If `is_cactus_account` and `use_rate_card` are deeply embedded in a server-rendered form pattern that would require larger architectural changes to make reactive, report and request guidance — do not bulldoze the form architecture.

2. **An edit form exists at `/orgs/[id]/carriers/[carrierId]/edit` (or similar) that lacks the same handling.** Either fold it into this session's scope OR report it as a follow-up file. Do not ship asymmetric create-vs-edit handling.

3. **A fourth markup-display surface is found during dry-run** (e.g., `/carriers/page.tsx` top-level list). Fold it in — single helper application per surface. No need to halt unless the surface uses a fundamentally different data shape.

4. **Creating a test carrier account fails with a constraint violation.** Would indicate a CHECK constraint or trigger on `org_carrier_accounts` that wasn't surfaced in the architectural review. Report exact error.

---

## ACCEPTANCE CRITERIA

After Claude Code completes:

1. ✅ Admin can navigate to `/orgs/[id]/carriers/new`, leave defaults (`is_cactus_account = TRUE`, `use_rate_card = FALSE`), select "Flat fee" radio, enter `1.50`, submit, and see a new account with `markup_flat_fee = 1.5000` and `markup_percentage = 0.0000`
2. ✅ Admin can still create a percentage-markup account (backward compatible)
3. ✅ Server rejects payload with both `markup_percentage > 0` AND `markup_flat_fee > 0` (DN-1)
4. ✅ Toggling `is_cactus_account` to FALSE hides the markup section in the UI; submitted markup forced to 0; non-zero submission rejected server-side (DN-9)
5. ✅ Toggling `use_rate_card` to TRUE hides the markup section in the UI; both markup fields forced to 0
6. ✅ `formatMarkup()` displays correctly across all surfaces:
   - Percentage account → `"15.0%"`
   - Flat account → `"flat $1.50"`
   - Rate-card account → `"Rate card"`
   - Client-owned account → `"None (client-owned)"`
7. ✅ TypeScript baseline holds (2379 ± 15) — note: pre-C.1 measured 2377; C.1 added +2; un-regenerated Supabase types may add a few more
8. ✅ No regressions on existing 6 accounts: Cactus 3PL HQ × 4 (percentage), Desert Boutique × 1 (dark percentage), Pineridge Direct × 1 (flat) all display and behave correctly

---

## SESSION C.2 SUMMARY DOC

Create `SESSION-C.2-SUMMARY.md` at repo root documenting:

- Files modified (5 expected: 1 new, 4 modified)
- DN-8 resolution: flat-markup input added with radio toggle
- DN-9 resolution: client-owned accounts now zero-forced both UI and server
- Rate-card extension: `use_rate_card = TRUE` hides markup section
- Shared `formatMarkup()` helper introduced
- Test scenarios verified

---

## MERGE INSTRUCTIONS (for Sawyer)

1. Review commit diffs
2. Test create flow: percentage account at 20%, flat account at $2.50, rate-card account, client-owned account — verify DB writes for all four states
3. Verify list/detail/sidebar display for each across all three surfaces
4. Spot-check Pineridge, Cactus 3PL HQ, Desert Boutique still render correctly (no regressions)
5. Merge to main via `--no-ff`
6. Push to origin

---

## POST-MERGE FOLLOW-UPS

Update briefing via Cowork:
- Mark **DN-8** RESOLVED in Section 12 DN log
- Mark **DN-9** RESOLVED in Section 12 DN log (entry filed pre-session — see briefing update below)
- Add Session C.2 to Section 12 "Completed and verified"
- Drop item #1 (Session C.2) from Section 12 "Next task" list
- Drop the embedded item #5 reference (now folded into C.2)

Remaining "Next task" items after C.2:
- Item #2: Dark-path adjustment-only fix (30 min)
- Item #3: Supabase CLI + type regen workflow (30 min)
- Item #4: Session B.2 CSV revision (3-4 hours, spec exists)
- *New top priority post-C.2:* 5 Logistics manual-processing prep + rate-card architecture session (see DN-10 + 5 Logistics build queue in briefing)
