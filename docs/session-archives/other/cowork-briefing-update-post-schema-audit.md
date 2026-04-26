# BRIEFING UPDATE — POST SCHEMA AUDIT (2026-04-23 LATE)

**Purpose:** Update `cactus-master-briefing.md` to reflect tonight's completion of the schema-vs-code audit (Section 12 item #1) and capture the three new findings that emerged. Also update `docs/schema-code-audit-checklist.md` with the audit history entry.

**To execute:** Hand this entire file to Cowork as an instruction. Four edits to the briefing, one edit to the checklist. After Cowork completes, Sawyer verifies in Cursor and commits.

**Context for Cowork:** Sawyer (now full-time on Cactus as of 2026-04-23) and Claude completed the comprehensive schema-vs-code audit tonight. Zero silent-failure bugs found across all 19 tables. However, the audit surfaced three real issues that need to be addressed before the 3-week first-client-invoicing target: a shared address normalization helper is needed, the locations form has a bug where new locations never get `normalized_address`, and the carrier-account form has no flat-markup input field. Two detailed Claude Code specs (Session C.1 and C.2) have been written to address these plus the broader schema naming cleanup.

---

## EDIT 1 — Mark Section 12 item #1 complete, mark item #2 as being covered by Session C.1

REPLACE the current "Next task" block in Section 12 with this updated version:

```markdown
### Next task — START HERE next session

**Four prioritized items. Estimated total: 3-4 hours across 2-3 sessions.**

Items 1-3 should complete before any real client onboards (3-week target). Item 4 can happen in parallel with client onboarding prep.

**1. Session C.1 — Schema naming cleanup + address normalization (2-3 hours)**
   Claude Code spec saved as `cactus-session-c1-schema-naming-cleanup-spec.md`
   in the Desktop archive. Bundles:
   - 8 column renames: `zip` → `postal_code`, `line1/line2` → `line_1/line_2`
     across invoice_line_items (6 cols) and locations (2 cols)
   - Shared `normalizeAddress()` helper in `src/alamo/lib/address.ts`
   - Parser updated to use the helper AND include address_line_2 (was missing —
     causing potential collision on multi-suite shipping origins)
   - Location form bug fix: `/orgs/[id]/locations/new/page.tsx` now populates
     `locations.normalized_address` on INSERT (bug discovered during audit —
     every newly-created location was silently missing this field, breaking
     dark-account matching for new locations)
   - Backfill Utah Test location (only pre-existing row missing normalized_address)
   - Backfill existing invoice_line_items.address_sender_normalized to include
     address_line_2 for consistency

**2. Session C.2 — Flat-markup input on carrier-account creation form (30-45 min)**
   Claude Code spec saved as `cactus-session-c2-flat-markup-form-spec.md`.
   The audit revealed that `/orgs/[id]/carriers/new` form has no flat-markup
   input field — flat-markup accounts today can only be created via direct
   DB seed (how Pineridge was set up). This blocks onboarding a real
   flat-markup client through the UI. Spec adds:
   - Radio toggle for "Percentage" vs "Flat fee" markup type
   - Conditional inputs based on selection
   - Server-side DN-1 validation (rejects both markup fields set)
   - Fixes `/orgs/[id]` list display to show "flat $X.XX" instead of "0.0%"
     when flat-markup is configured (addresses old Section 12 item #5)

**3. Dark-path adjustment-only fix (30 min)**
   Extend the line SELECTs in `match.ts` and `resolve.ts` (dark-account
   branches) to include `is_adjustment_only`, then pass it to
   `computeSingleCeiling()` via `{ isAdjustmentOnly: line.is_adjustment_only }`.
   Without this fix, dark-account adjustment-only lines under flat markup
   get $1.50 incorrectly added to shipment_ledger. Adjustments are ~22%
   of UPS FRT rows in real production data — not rare.

**4. Install Supabase CLI + establish type regen workflow (30 min)**
   Currently no `npm run gen-types` in package.json. After C.1's column
   renames, regenerated types would reflect the new column names
   automatically. Without it, TypeScript noise from the renames will
   linger until the types are updated manually or the CLI is installed.

**After these 4 items: Session B.2 (Client CSV revision, 3-4 hours, spec
already exists at `cactus-session-b2-revision-spec.md` in archives).**

**After B.2: proceed with Stage 6 Rate Engine.**

### Deferred follow-ups (from Session B)

- **6C — Line-item drill-down modal** (~1-2 hours)
- **7C — TypeScript error triage** (~1 hour)
```

---

## EDIT 2 — Add 2026-04-23 late-evening completion entry

ADD this entry to the top of Section 12 "Completed and verified":

```markdown
- [x] Schema-vs-code audit complete (2026-04-23 late evening): Full 19-table
      sweep verified zero silent-failure bugs across all write operations.
      The Session B.1 audit_logs fix was the only bug of its class; no other
      tables share the pattern. Critical-path tables verified clean
      (invoice_line_items 14 writes, carrier_invoices 8 writes, shipment_ledger
      2 writes, cactus_invoices 1 write, cactus_invoice_line_items 1 write,
      audit_logs 5 writes). Lower-priority tables verified clean (organizations,
      locations, org_carrier_accounts, carrier_invoice_mappings). 5 tables
      legitimately unused by code (Phase 2/3 scope: org_users, meters,
      meter_transactions, rate_shop_log, notification_preferences). 4 tables
      read-only (static configs + shipment_events). Full findings report
      saved as `schema-audit-findings-2026-04-23.md`. Audit surfaced 3 new
      pre-onboarding issues now tracked in Next task: (1) shared address
      normalization helper needed, (2) locations form bug where
      normalized_address is never populated, (3) flat-markup input missing
      from carrier-account form. Two Claude Code specs written (C.1 and C.2)
      to address these alongside the schema naming cleanup.
```

---

## EDIT 3 — Add DN-6 to Section 12a (DN LOG)

INSERT this new DN entry at the end of Section 12a, after DN-5:

```markdown
### DN-6 — locations.normalized_address not populated by form
**Status:** OPEN. Discovered during 2026-04-23 audit. Will be resolved by Session C.1.

The `/orgs/[id]/locations/new/page.tsx` form INSERT does not set
`locations.normalized_address`. No trigger exists on the table to
auto-populate it. Result: every location created through the UI has
`normalized_address = NULL`, which silently breaks dark-account
matching for that location (invoice_line_items.address_sender_normalized
= locations.normalized_address comparison returns false for NULL).

Current state:
- 21 of 22 locations have populated normalized_address (from earlier
  seed/backfill)
- 1 location (Utah Test under Desert Boutique, id 429a0963-...) has NULL
- Any new locations created via the form going forward will have NULL

Impact:
- For the 3-week first-client target, this would cause the first
  dark-account client's shipments to fail matching if their locations
  were added through the form. Zero margin for error.

Resolution (C.1 Session):
- Extract normalization logic into shared helper `src/alamo/lib/address.ts`
- Parser and location form both call the helper
- Location form populates normalized_address on INSERT
- One-time backfill for the Utah Test row
- Parser update also includes address_line_2 in normalization (was missing —
  latent bug that could have caused collision between different suites at
  the same building)

### DN-7 — Parser omits address_line_2 from normalization
**Status:** OPEN. Will be resolved by Session C.1 alongside DN-6.

Parser at `parse/page.tsx:577-584` builds `address_sender_normalized`
from line1, city, state, zip, country — but NOT line2. UPS detail
invoices include address line 2. Omitting it causes different
shipments from the same building (different suites) to produce
identical normalized strings, potentially routing shipments to the
wrong org or to no org.

Confirmed during 2026-04-23 audit that UPS detail format includes
address_line_2. Fix bundled into C.1 since both DN-6 and DN-7 share
the same shared helper.

### DN-8 — Carrier-account creation form lacks flat-markup input
**Status:** OPEN. Will be resolved by Session C.2.

The `/orgs/[id]/carriers/new` form INSERT does not set `markup_flat_fee`.
Schema has the column; UI has no input. Flat-markup accounts today must
be created via direct DB seed (how Pineridge was set up). This blocks
onboarding a real flat-markup client through the UI.

Resolution (C.2 Session):
- Radio toggle for Percentage vs Flat fee markup type
- Conditional inputs based on selection
- DN-1 validation (rejects both markup fields set at save time)
- Updates /orgs/[id] carrier-accounts list to show "flat $X.XX" instead
  of "0.0%" when flat-markup is configured
```

---

## EDIT 4 — Update Section 14 or wherever specs/archives are referenced

If the briefing has a section listing archived specs, add:

```markdown
- `cactus-session-c1-schema-naming-cleanup-spec.md` — 8 schema column
  renames + address normalization helper + locations form fix + parser
  line_2 fix. Written 2026-04-23.
- `cactus-session-c2-flat-markup-form-spec.md` — Radio toggle for
  percentage vs flat-markup on carrier-account creation form. Written
  2026-04-23.
- `schema-audit-findings-2026-04-23.md` — Complete audit findings report
  documenting zero silent failures found across 19 tables.
```

If no such section exists, skip this edit.

---

## EDIT 5 — Verify after Cowork edits

After Cowork completes all edits, verify:

1. Section 12 "Next task" now has 4 numbered items (C.1, C.2, dark-path fix, Supabase CLI)
2. Schema audit is listed as completed in "Completed and verified"
3. DN-6, DN-7, DN-8 added to Section 12a
4. Archive references updated (if that section exists)
5. All previous Next task items that are now covered by C.1/C.2 are gone or marked complete
6. Deferred follow-ups (6C and 7C) still preserved
7. No other content accidentally removed

If any are missing, run a follow-up Cowork command.

---

## SEPARATE TASK FOR SAWYER (after Cowork edits the briefing)

Append this entry to the history table in `docs/schema-code-audit-checklist.md`:

```markdown
| 2026-04-23 (late) | Sawyer + Claude (full-time kickoff) | Full 19-table comprehensive sweep | ZERO silent failures found. All critical-path writes clean (6 tables, 31 writes). All low-priority writes clean (4 tables, 4 writes). 5 tables legitimately unused (Phase 2/3 scope). Confirmed schema naming inconsistency between locations (clean) and invoice_line_items (prefixed) — addressed by Session C.1. Surfaced 3 new pre-onboarding follow-ups tracked as DN-6 (locations.normalized_address bug), DN-7 (parser line_2 omission), DN-8 (flat-markup form field missing). |
```

Also update the "Tables most at risk for silent failures" section — remove `rate_shop_log` from the highest-risk list since it's never touched by code (different risk class entirely; the table exists but Shadow Ledger capability isn't being exercised). Replace with a short note:

```markdown
Tables previously flagged as high-risk that are ACTUALLY inert (never touched
by code): rate_shop_log, meter_transactions, notification_preferences.
These can't have silent failures since no code writes to them. The different
risk for these tables is that their intended capabilities (Shadow Ledger,
USPS wallet, notifications) are not yet exercised — that's a product gap,
not a data-integrity risk.
```
