# COWORK INSTRUCTIONS — Session C.2 post-merge cleanup (v2)

**Generated:** 2026-04-26 (post-merge — supersedes the v1 doc generated pre-merge)
**Source chat:** Same architectural review session that produced the C.2 spec
**Target files:**
- `cactus-master-briefing.md` (6 edits)
- `AGENTS.md` (1 edit)
- `docs/dev-workflow-notes.md` (1 edit)

**Why v2:** The original v1 doc's EDIT 8 (worktree dependency setup)
recommended symlinking `node_modules` from the main repo. We discovered
during C.2 merge prep that Turbopack rejects symlinks that point outside
the worktree's filesystem root. The corrected guidance below recommends
`npm install` directly in the worktree's `src/alamo/` directory, which
works reliably. EDITs 1-7 are unchanged from v1.

---

## How to use this document

C.2 is already merged to main as of `82e6a53`. These edits update docs to
reflect that resolved state.

Hand this file to Cowork:

> "Apply the eight edits described in this document. Six are inside
> cactus-master-briefing.md, one is in AGENTS.md, and one appends to
> docs/dev-workflow-notes.md."

Review the diffs in your text editor before saving / committing.

---

## EDIT 1 — Mark DN-8 as RESOLVED

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12 (CURRENT BUILD STATE), in the DN log,
the existing DN-8 entry titled `### DN-8 — Carrier-account creation form lacks flat-markup input`.

**Action:** Replace the existing `**Status:**` line and any "Resolution
(C.2 Session):" content beneath it with the resolved status block below.
Do NOT modify the heading or the original problem-description paragraph
above the Status line — that history stays intact.

**Find this Status line:**

```markdown
**Status:** OPEN. Will be resolved by Session C.2.
```

**Replace it (and any subsequent resolution-plan content beneath, up to
but not including the next `### DN-` heading) with:**

```markdown
**Status:** RESOLVED 2026-04-26 in Session C.2 (merge commit 82e6a53).

The `/orgs/[id]/carriers/new` form now supports flat-markup input via a
radio toggle (Percentage vs Flat fee) inside a reactive `MarkupConfigSection`
client component. Server action routes payload by markup type, writes
explicit zeros to the unselected column, and validates the DN-1
both-fields-set rule defensively. New `formatMarkup()` helper in
`src/alamo/lib/markup.ts` standardizes display across three surfaces
(org detail, carrier detail, sidebar list). DB writes verified live
across all four account states; display verified across all three
surfaces.
```

---

## EDIT 2 — Mark DN-9 as RESOLVED

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12 DN log, the DN-9 entry filed earlier in
this session.

**Action:** Replace the existing `**Status:**` line and the "Resolution
(C.2 Session):" bullet block beneath it with the resolved status block
below. Do NOT modify the heading or the problem-description paragraph.

**Find this Status line:**

```markdown
**Status:** OPEN. Will be resolved by Session C.2.
```

**Replace it (and the entire `**Resolution (C.2 Session):**` bulleted
block beneath, up to but not including the `### DN-10` heading) with:**

```markdown
**Status:** RESOLVED 2026-04-26 in Session C.2 (merge commit 82e6a53).

The carrier-account form now hides the markup section when
`is_cactus_account = FALSE` and replaces it with a one-liner explaining
that client-owned accounts pass the carrier bill directly. Server-side
zero-forces both markup columns regardless of submitted form data, and
rejects any payload posting non-zero markup with `is_cactus_account = FALSE`
as defense-in-depth. The same hide-and-zero-force logic applies when
`use_rate_card = TRUE`, which closes the rate-card-billed account state
cleanly for 5 Logistics onboarding. State logic centralized in the
`AccountConfigFields` client component. Verified live: Test Client Owned
account written with markup_percentage=0 and markup_flat_fee=0 despite
the form being submittable.
```

---

## EDIT 3 — Add Session C.2 to "Completed and verified"

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Completed and verified`
subsection. The most recent entry is currently the Session C.1 entry
(beginning with `- [x] Session C.1 (2026-04-25):`).

**Action:** Insert the Session C.2 entry as a new top-level checklist
item IMMEDIATELY ABOVE the Session C.1 entry, matching the convention
of most-recent-first ordering. Do not modify the C.1 entry or anything
beneath it.

**Content to insert (verbatim, including the leading `- [x]` and the
indentation of continuation lines, with a single trailing newline before
the existing C.1 entry):**

```markdown
- [x] Session C.2 (2026-04-26): Flat-markup input on carrier-account
      creation form + DN-9 client-owned protection + rate-card-hides-markup
      extension. Resolves DN-8 (form previously lacked flat-markup input —
      Pineridge had to be created via direct DB seed) and DN-9 (form
      previously allowed non-zero markup on `is_cactus_account = FALSE`
      accounts, contradicting Section 5's client-owned-pass-through rule).
      7 source files (3 new: `MarkupConfigSection.tsx`, `AccountConfigFields.tsx`,
      `src/alamo/lib/markup.ts`; 4 modified: `carriers/new/page.tsx`,
      `orgs/[id]/page.tsx`, `[carrierId]/page.tsx`, `carriers/[carrier]/page.tsx`).
      5 commits sequenced per spec on `claude/crazy-shannon-8c6296`
      (6cbc8fd → 2a79643 → 17479b3 → cd0cd94 → b525422), merged --no-ff
      to main as 82e6a53 on 2026-04-26. New `formatMarkup()` helper
      centralizes display logic across three surfaces with conditional
      output for percentage / flat / rate-card / client-owned states.
      Decimal.js used at form-input boundary per Rule 1 (no floats);
      explicit zero-write to unselected markup column matches schema's
      NOT NULL DEFAULT 0 reality. UX naming refinements made by Claude
      Code (not in spec): `is_cactus_account` exposed as "Account
      Ownership" with options like "Cactus account — earn margin",
      `use_rate_card` exposed as "Billing Source" with "Live carrier
      rates + markup" vs rate-card options. Better than database-field
      language. Live verification on 2026-04-26: created four test
      accounts on a "C2 Test Org" covering all four states; DB writes
      confirmed via direct query (Test Pct 20 → 0.2000/0.0000, Test
      Flat 2.50 → 0.0000/2.5000, Test Rate Card → 0.0000/0.0000 with
      use_rate_card=true, Test Client Owned → 0.0000/0.0000 with
      is_cactus_account=false). Display verified across all three
      surfaces. Dry-run before execution surfaced four discoveries vs
      spec assumptions: (1) no edit form at `[carrierId]/edit` exists —
      Halt Point #2 inapplicable, (2) `use_rate_card` was not on the
      form (server action hardcoded false) — added as a real `<select>`,
      (3) top-level `/carriers/page.tsx` shows aggregate counts only with
      no per-account markup display, so no fold-in needed, (4) actual
      `tsc --noEmit` baseline is 11 errors (all pre-existing Supabase
      generic-error narrowing in `app/invoices/...`), not 2379 — see
      TS baseline drift entry below for resolution. Zero new TypeScript
      errors introduced. Spec saved at
      `docs/session-archives/specs/cactus-session-c2-flat-markup-form-spec.md`;
      summary at repo root `SESSION-C.2-SUMMARY.md`. Test data (`C2
      Test Org` + four `Test ...` carrier accounts) left in DB
      intentionally, to be cleaned up in a future session.
```

---

## EDIT 4 — Replace the "Next task — START HERE next session" subsection

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, find the subsection beginning with the
heading `### Next task — START HERE next session`.

**Action:** Replace the entire subsection — from the `### Next task`
heading through to (but NOT including) the next `### ` heading that
follows it (which is `### Deferred follow-ups (from Session B)`).

The replacement drops the now-shipped Session C.2 entry (was item #1)
and renumbers the remaining items.

**Replacement content (verbatim):**

```markdown
### Next task — START HERE next session

**5 Logistics is signed (2026-04-24). First DHL eCommerce invoice arrives
Monday May 11, 2026 (15 days from today). Manual-processing path agreed
for cycle 1; production pipeline target is cycle 2 (mid-June or so).**

Updated build queue, in priority order:

**1. Dark-path adjustment-only fix (30 min)**
   Carried forward. Extends `match.ts` and `resolve.ts` dark-account
   branches to load `is_adjustment_only` and pass to
   `computeSingleCeiling()`. Resolves DN-2 outstanding TODO.

**2. Supabase CLI + type regen workflow (30 min)**
   Carried forward. Note: post-C.2, the regen may also clear some or
   all of the 11 lingering `app/invoices/...` errors that are pure
   Supabase generic-error narrowing noise.

**3. C.2 test-data cleanup (5 min)**
   Delete the `C2 Test Org` plus its four `Test ...` carrier accounts
   left in the database from C.2 verification. Easy via Supabase MCP
   in any chat session.

**4. 5 Logistics manual-processing prep (1-2 hours, chat session)**
   Build a careful spreadsheet template for cycle-1 manual invoicing:
   rate-card lookup logic in formulas, surcharge passthrough, DHL invoice
   ingest checklist, Warehance fee tracking. Source the rate card from
   Sawyer's structured rate card file; this also becomes the seed file
   for the rate-card architecture session. Recommend running this as a
   chat session with Claude before any code is written.

**5. Session B.2 — Client CSV revision (3-4 hours)**
   Spec exists at `docs/session-archives/specs/cactus-session-b2-revision-spec.md`.
   Carried forward.

**6. Rate-card architecture session (~3-4 hours)**
   New `rate_card_rates` child table (weight × zone × service → rate);
   `billing-calc.ts` rate-card branch (replace base_charge from rate card,
   pass surcharges raw, fallback to carrier_charge passthrough on
   off-rate-card lookups); seed 5 Logistics rate cards; resolve DN-11
   auto-flip-on-first-upload behavior. Must ship before cycle 2 of 5
   Logistics invoicing.

**7. DHL eCommerce parser session (~2-3 hours)**
   `carrier_invoice_formats` seed for DHL eCommerce; validate parser
   against the first real 5 Logistics carrier invoice (received May 11);
   surcharge taxonomy mapping. Must ship before cycle 2.

**8. Stage 6 — Rate engine core (Phase 1 main path, parked behind 5L work)**

**9. Stage 7 — UPS + FedEx + DHL eCommerce API adapters**

**10. Partner-fee architecture session (DN-10 implementation, ~3-4 hours)**
    5 tables + `partner_id` on `org_carrier_accounts` + Alamo UI for
    `/partners` + invoice-triggered accrual logic. Sawyer paying Warehance
    manually until this ships.

**11. Stage 8 — Warehance WMS integration with API-triggered accruals**
```

---

## EDIT 5 — Mark "TS baseline drift investigation" RESOLVED in Deferred follow-ups

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Deferred follow-ups (from
Session B)` subsection. Find the bullet titled `**TS baseline drift
investigation**`.

**Action:** Replace the entire bullet (from the `- **TS baseline drift
investigation**` line through the end of its description paragraph,
up to but not including the next `- ` bullet OR the next `### ` heading)
with the resolved version below.

**Find the existing bullet, which reads approximately:**

```markdown
- **TS baseline drift investigation** (~30 min)
  Pre-C.1 dry-run measured 2375 errors against a briefing-stated baseline
  of ~1640. ~735-error drift is unaccounted for — likely Supabase type-regen
  artifacts or Next.js 16 upgrade noise. Worth a focused investigation
  before treating any future baseline as authoritative.
```

**Replace with:**

```markdown
- **TS baseline drift investigation — RESOLVED 2026-04-26**
  Resolved during Session C.2 dry-run by accidental measurement. Real
  `tsc --noEmit` baseline is 11 errors, all pre-existing Supabase
  generic-error narrowing in `app/invoices/...` files (compiler can't
  prove the discriminated-union narrowing without explicit guards;
  zero functional impact, zero billing risk). The 1640 / 2375 / 2379
  numbers cited in earlier sessions were measuring something different —
  almost certainly IDE-reported errors with broader project scope
  (Cursor counts errors across uncompiled paths the actual `tsc`
  excludes), or earlier baselines that included now-deleted files.
  Going forward, treat `tsc --noEmit` from repo root with deps installed
  at `src/alamo/node_modules/` as the canonical baseline. If the 11
  lingering errors persist after the Supabase type-regen workflow
  (Next-task item #2) ships, file as a focused cleanup session.
```

---

## EDIT 6 — File DN-11 in the DN log

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12 DN log, immediately after the DN-10 entry
(the partner per-shipment fees entry). Insert as a new entry before
whatever follows DN-10 (typically Section 13 BUSINESS FORMATION STATUS).

**Content to insert (verbatim, with leading blank line for spacing):**

```markdown

### DN-11 — Rate-card lifecycle on org_carrier_accounts
**Status:** OPEN. Address during the rate-card architecture session
(Next-task item #6).

Today `use_rate_card` is set manually via the carrier-account form
(C.2 added this as a real toggle; previously hardcoded false in the
server action with no UI exposure). Two lifecycle improvements queued
for the rate-card architecture session:

- **Auto-flip on first rate-card upload:** when a rate card is added
  to a carrier account where `use_rate_card = FALSE`, automatically
  flip the parent account's flag to TRUE. Convenience — admin should
  not have to remember a two-step setup (create account → flip flag →
  upload rate card).
- **Manual toggle preserved:** the form keeps the manual toggle for
  cases like (a) flat-markup migration where the customer changes
  pricing model from rate-card to flat or percentage, (b) temporary
  deactivation while rate cards are being revised, (c) historical
  preservation — turning rate cards "off" without deleting them.
- **Rate cards preserved on toggle-off:** `use_rate_card = FALSE` does
  NOT cascade to `rate_cards`. Cards stay in the table, recoverable.
  Use `rate_cards.deprecated_date` to mark them inactive if needed.
  Rate-card data is additive — new rows with new effective_date, never
  overwrites — so historical billing audit trail is preserved through
  toggle changes.

**Implementation options (decide during architecture session):**
- Postgres trigger on `rate_cards INSERT` checks parent account's
  `use_rate_card`; if FALSE and this is the first non-deprecated rate
  card for the account, flip to TRUE.
- Application-layer alternative: add the auto-flip logic to whatever
  Alamo route handles rate-card upload (decide once UI exists).

The trigger approach is more durable (works regardless of which path
inserts the rate card — UI, seed, future API); the application-layer
approach is more visible in code review.

**Surfaced during:** Session C.2 review on 2026-04-26, after Claude
Code added `use_rate_card` as a real form toggle (it had been hardcoded
false in the server action). Sawyer flagged the workflow ambiguity:
which comes first, the toggle or the rate cards?
```

---

## EDIT 7 — Update AGENTS.md to remove the broken `node_modules/next/dist/docs/` reference

**File:** `AGENTS.md` (at repo root)
**Location:** Find the existing reference to `node_modules/next/dist/docs/`.

**Action:** Replace the reference (and any surrounding sentence that
specifically instructs reading from that path) with the durable in-repo
redirect language below. The exact surrounding text varies — Cowork
should locate the `node_modules/next/dist/docs/` string, identify the
sentence or instruction it's part of, and replace that whole instruction.

**Replacement content:**

```markdown
For Next.js 16 patterns, refer to existing form implementations under
`src/alamo/app/` — the codebase uses standard Next.js 16 conventions:
`params: Promise<…>` typing, `'use server'` directives on server
actions, async server components with `await` on params. For framework
details beyond what's evident in existing code, consult the official
Next.js docs at https://nextjs.org/docs.
```

**Why:** The original path doesn't exist in the current Next.js install
— Next.js doesn't ship docs inside `node_modules/` anymore. Every future
Claude Code session would hit a "path doesn't exist" dead-end. In-repo
references survive dependency upgrades and Next.js doc-site
reorganizations; external URL is a fallback.

If Cowork cannot find the original `node_modules/next/dist/docs/`
string in AGENTS.md, halt and report — the file may have already been
updated, or the reference may use a different exact phrasing.

---

## EDIT 8 — Append worktree alamo deps section to dev-workflow-notes.md

**File:** `docs/dev-workflow-notes.md`
**Location:** Append to the end of the file as a new section.

**Action:** Add the section below as a new heading at the bottom of the
file. If the file already has trailing whitespace or a blank line at the
end, normalize to a single blank line before the new heading.

**Content to append:**

````markdown

## Worktree alamo deps — install fresh, don't symlink

When testing Claude Code worktree branches that touch `src/alamo/`, the
worktree won't have `src/alamo/node_modules/` populated. The alamo
subfolder has its own `node_modules/` that lives locally (gitignored
implicitly), and Git worktrees don't carry over installed dependencies
from the main repo.

**Symlinking does not work.** Turbopack (Next.js 16's bundler) rejects
symlinks that point outside the worktree's filesystem root with the error:

> `Symlink [project]/src/alamo/node_modules is invalid, it points out of
> the filesystem root`

Even if `ls` resolves the symlink correctly, Turbopack refuses to traverse
it. Don't waste time trying.

**Correct approach: install fresh in the worktree.**

```bash
cd <worktree-path>/src/alamo
npm install
```

Takes 1-3 minutes the first time, faster on subsequent worktrees if npm's
cache is warm. The deps are local to the worktree — no symlink cleanup
needed when the worktree is removed.

**Also copy `.env.local` from the main repo:**

```bash
cp <main-repo-path>/src/alamo/.env.local .env.local
```

Without this, login and database calls will silently fail at runtime even
though the dev server starts cleanly. The Supabase keys live in
`.env.local` and aren't checked into Git.

**Verification before running tsc or dev server:**

```bash
ls node_modules | head -5    # should show @supabase, next, react, etc.
ls -la .env.local             # should show ~600-800 bytes
```

If both look good, `npm run dev` should boot cleanly and serve the
worktree's branch state at `localhost:3000`.

Discovered during Session C.2 merge prep (2026-04-26) when an initial
symlink approach failed against Turbopack. Folded into this doc to save
the next session 5+ minutes of rediscovery.
````

---

## SUMMARY OF CHANGES

After Cowork completes all eight edits:

**Briefing (cactus-master-briefing.md):**
- DN-8 marked RESOLVED with implementation summary + merge commit ref
- DN-9 marked RESOLVED with implementation summary + merge commit ref
- Session C.2 added as the most recent "Completed and verified" entry,
  with full detail matching the C.1 entry's level of rigor
- "Next task" subsection renumbered — Session C.2 dropped, C.2 test-data
  cleanup added as new item #3, remaining items rebumped, now an 11-item
  queue ordered around the May 11 5 Logistics deadline
- "TS baseline drift investigation" marked RESOLVED in Deferred
  follow-ups with the actual `tsc` baseline (11) and methodology note
- DN-11 filed for rate-card lifecycle (auto-flip-on-first-upload +
  manual-toggle-preserved + rate-cards-survive-toggle-off)

**AGENTS.md:**
- Broken `node_modules/next/dist/docs/` reference replaced with
  durable in-repo redirect

**docs/dev-workflow-notes.md:**
- Worktree alamo deps install pattern documented (with explicit
  warning that symlinks don't work against Turbopack)

---

## FILE MOVE (post-Cowork-completion)

Move this instructions doc to:

```
cactus-web-app/docs/session-archives/cowork-instructions/
```

Keeps a record of what was applied and when. Filename stays as Cowork
saved it. If the v1 of this doc was archived earlier, leave the v1 in
place — historical record of how the workflow evolved during real
ship pressure. Cowork can do the move directly since it has access to
that folder via the existing project mount.

After this move and Cowork commits the doc edits, C.2 is fully closed.
DN-8 + DN-9 RESOLVED, DN-11 filed, baseline drift resolved, three docs
updated, and `82e6a53` is on origin/main.
