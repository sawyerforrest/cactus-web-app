# COWORK INSTRUCTIONS — cactus-master-briefing.md edits

**Generated:** 2026-04-25 (post-Session-C.1, pre-Session-C.2)
**Source chat:** Architectural review for C.2 + 5 Logistics customer signing
**Target file:** `cactus-master-briefing.md`

---

## How to use this document

Hand this file to Cowork along with a simple instruction like:

> "Apply the three edits described in this document to cactus-master-briefing.md."

Cowork should make all three edits in a single pass. After Cowork completes,
review the diff in your text editor before saving / committing.

There are also two file moves to handle separately (see "FILE MOVES" at the
bottom of this document) — Cowork can do those too.

---

## EDIT 1 — Add DN-9 entry to Section 12 DN log

**Location:** Inside Section 12 (CURRENT BUILD STATE), in the Decision Notes
(DN) log area. Insert immediately after the existing DN-8 entry and before
any other content that follows DN-8 (such as Section 13 BUSINESS FORMATION
STATUS).

**Action:** Insert the following content as a new entry. Do not modify
DN-8 or any earlier DN entries.

**Content to insert (verbatim, including the leading blank line for spacing):**

```markdown

### DN-9 — Form allows non-zero markup on client-owned accounts
**Status:** OPEN. Will be resolved by Session C.2.

The `/orgs/[id]/carriers/new` form permits admins to create a carrier account
with `is_cactus_account = FALSE` and non-zero markup. Per Section 5,
client-owned lassoed accounts must have 0% / $0 markup — Cactus's value
there is portal access, tracking, claims, and analytics, not billing
reselling. The new flat-fee input from DN-8 expands the surface area for
this misconfiguration; resolving DN-8 without resolving DN-9 ships a
wider bug surface than today's. Surfaced during architectural review of
the C.2 spec on 2026-04-25.

**Resolution (C.2 Session):**
- Hide the markup section in the form when `is_cactus_account = FALSE`
- Server-side zero-force both markup columns when client-owned, regardless
  of submitted form data
- Reject any payload posting non-zero markup with `is_cactus_account = FALSE`
  (defense in depth)
- Bonus: same hide-and-zero-force logic applies when `use_rate_card = TRUE`
  (covers rate-card-billed accounts cleanly for 5 Logistics onboarding)
```

---

## EDIT 2 — Add DN-10 entry to Section 12 DN log

**Location:** Immediately after the new DN-9 entry inserted in Edit 1.

**Action:** Insert the following content as a new entry. If a DN-10 entry
already exists in the briefing for any reason, replace it entirely with
the content below.

**Content to insert (verbatim):**

```markdown

### DN-10 — Partner per-shipment fees (rev-share with WMS platforms)
**Status:** OPEN — active commitment with Warehance; expected pattern with
all future WMS partners (Packiyo, Logiwa, Extensiv). Architecture session
target after Session B.2 + rate-card architecture session + DHL eCommerce
parser session. Manual processing in the interim.

Cactus pays Warehance per label purchased through the Cactus-Warehance
API connection. Terms (verbal as of 2026-04-25, to be written):
- **Tier boundary:** weight ≥ 1.0 lb (16 oz) → $0.07/label;
  weight ≤ 15.99 oz → $0.04/label
- **Voided labels:** no fee (accrual reverses on POST /api/label/void)
- **Multi-package shipments:** per-label fee (one per tracking number)
- **Failed label purchases:** no fee (no accrual on carrier API error)
- **Payment cadence:** monthly, NET 30, day-of-month TBD
- **Reconciliation:** Warehance issues monthly invoice → Cactus audits
  against accruals → pays from Mercury Partner-Payables sub-account
- **Scope:** all labels through the Cactus-Warehance API connection
  (not referral-attributed)

COGS to Cactus, deducted from gross margin. Never visible to clients on
their invoices.

**Architecture (5 tables + 1 column addition):**
1. `partners` — Warehance, Packiyo, Logiwa, etc.
2. `partner_fee_schedules` — versioned (effective_date, deprecated_date);
   JSONB tier_logic supports `flat_per_label`, `weight_tiered_lb`, future
   strategies
3. `partner_fee_accruals` — one row per label; status ACCRUED → PAID;
   REVERSED branch on void; `accrual_source` column distinguishes
   `'API_LABEL_PRINT'` (post-Stage 8) from `'CARRIER_INVOICE_INGESTION'`
   (pre-Stage 8 fallback path)
4. `partner_invoices` — monthly partner-issued invoices ingested into Alamo
5. `partner_invoice_line_items` — partner's per-label claim; reconciled
   against accruals
6. **Add `partner_id UUID NULL REFERENCES partners(id)` to `org_carrier_accounts`**
   to link a carrier account to its rev-share partner (NULL = no partnership)

**Trigger paths (dual):**
- **API-triggered (post-Stage 8):** POST /api/label writes accrual at
  print time; POST /api/label/void flips status to REVERSED
- **Invoice-triggered (pre-Stage 8 fallback):** at carrier-invoice
  ingestion, for each line item where `org_carrier_account.partner_id IS
  NOT NULL`, generate accrual using tracking number + weight + service
  from `invoice_line_items`

**Transition-period policy (5 Logistics, May–whenever):** During the period
where 5 Logistics is moving from a homegrown WMS to Warehance, some labels
will print through Warehance and some through the homegrown WMS. Cactus
cannot reliably distinguish the two from the carrier invoice alone. Policy:
trust Warehance's monthly invoice as ground truth during transition. Audit
Warehance's per-label claim against the carrier invoice's tracking-number
list (does the tracking number exist on the DHL invoice?) rather than
against pre-computed Cactus accruals. Once 5 Logistics is fully on
Warehance and the API integration ships, the audit becomes bidirectional.

**Manual-processing interim (April 2026 → architecture session):** Sawyer
handles Warehance fee payments manually until DN-10 ships. Reconcile by
hand each month. No code changes needed during this period.

**Margin reporting (post-architecture):**
Cactus gross margin per shipment = `final_billed_rate − carrier_charge −
SUM(partner_fee_accruals WHERE shipment_ledger_id = X AND status != 'REVERSED')`

**Alamo UI deliverables (in same architecture session):**
- `/partners` index (list, add, edit) — sidebar entry alongside
  `/carriers` and `/rate-cards`
- `/partners/[id]` detail — fee schedule history, accrual totals,
  monthly invoice reconciliation
- Partner invoice upload + reconciliation workflow (mirrors carrier
  invoice ingestion architecture)

**Open before migration:**
- Get Brennan to confirm terms in writing
- Confirm `shipment_ledger.weight` storage unit to lock tier_logic
  JSONB format
- Decide payment day-of-month (affects Mercury reserve calculations)

**Do NOT solve via stacking columns on `org_carrier_accounts`.** Section 6
Rule 3 (Single-Ceiling, one markup per shipment) and DN-1 make that path
actively wrong. Partner fees are a separate financial entity from markup
— different scope, different recipient, different lifecycle, different
accounting treatment (COGS vs revenue).
```

---

## EDIT 3 — Replace the "Next task — START HERE next session" subsection

**Location:** Inside Section 12, find the subsection beginning with the
heading `### Next task — START HERE next session`.

**Action:** Replace the entire subsection — from the `### Next task` heading
through to (but NOT including) the next `### ` heading that follows it
(currently `### Deferred follow-ups (from Session B)` based on the briefing
state at the start of this chat).

If `### Deferred follow-ups (from Session B)` is the next heading, leave
that subsection intact and untouched. Only the "Next task" subsection
itself is being replaced.

**Replacement content (verbatim):**

```markdown
### Next task — START HERE next session

**5 Logistics is signed (2026-04-24). First DHL eCommerce invoice arrives
Monday May 11, 2026 (16 days from today). Manual-processing path agreed for
cycle 1; production pipeline target is cycle 2 (mid-June or so).**

Updated build queue, in priority order:

**1. Session C.2 — Flat-markup input + DN-9 + rate-card-hides-markup (60-75 min)**
   Spec at `cactus-session-c2-flat-markup-form-spec.md` (revised 2026-04-25
   after architectural review). Resolves DN-8 and DN-9. Adds shared
   `formatMarkup()` helper applied across 3-4 display surfaces. Form now
   correctly handles all four account states (Cactus-owned percentage,
   Cactus-owned flat, Cactus-owned rate-card, client-owned).

**2. Dark-path adjustment-only fix (30 min)**
   Carried forward from previous queue. Extends `match.ts` and `resolve.ts`
   dark-account branches to load `is_adjustment_only` and pass to
   `computeSingleCeiling()`. Resolves DN-2 outstanding TODO.

**3. Supabase CLI + type regen workflow (30 min)**
   Carried forward.

**4. 5 Logistics manual-processing prep (1-2 hours)**
   Build a careful spreadsheet template for cycle-1 manual invoicing:
   rate-card lookup logic in formulas, surcharge passthrough, DHL invoice
   ingest checklist, Warehance fee tracking. Source the rate card from
   Sawyer's structured rate card file; this also becomes the seed file for
   the rate-card architecture session.

**5. Session B.2 — Client CSV revision (3-4 hours)**
   Spec exists at `cactus-session-b2-revision-spec.md`. Carried forward.

**6. Rate-card architecture session (~3-4 hours)**
   New `rate_card_rates` child table (weight × zone × service → rate);
   billing-calc.ts rate-card branch (replace base_charge from rate card,
   pass surcharges raw, fallback to carrier_charge passthrough on
   off-rate-card lookups); seed 5 Logistics rate cards. Must ship before
   cycle 2 of 5 Logistics invoicing.

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

## FILE MOVES (separate from briefing edits)

These are file operations Cowork can also handle:

**Move 1:** Take the file `cactus-session-c2-flat-markup-form-spec.md`
(downloaded from the same Claude chat that produced this instruction
document) and place it at:

```
~/Desktop/cactus-session-archives/cactus-session-c2-flat-markup-form-spec.md
```

If a file with that name already exists at that location (the original
pre-amendment spec), replace it. The new file is a complete, drop-in
replacement that supersedes the original — no merge needed.

**Move 2:** This instructions file itself (`COWORK-INSTRUCTIONS-2026-04-25.md`
or whatever Cowork named it on save) can be archived to:

```
~/Desktop/cactus-session-archives/cowork-instructions/
```

so there's a record of what was applied and when. If that subfolder doesn't
exist yet, create it.

---

## SUMMARY OF CHANGES

After Cowork completes all three edits and both file moves:

- **DN-9** logged in briefing as OPEN — will be marked RESOLVED post-Session-C.2
- **DN-10** fully detailed in briefing with 5-table architecture, dual-trigger
  accruals, transition-period policy, and manual-processing interim
- **Section 12 "Next task"** reflects 5 Logistics priorities and the 16-day
  timeline to first DHL eCommerce invoice (May 11, 2026)
- **C.2 spec** in archives folder, ready to hand to Claude Code

---

## POST-SESSION-C.2 FOLLOW-UP

After Session C.2 ships, a follow-up Cowork instructions document will be
needed to mark DN-8 and DN-9 as RESOLVED in the briefing. That document
will be generated in a separate Claude chat at the end of the session.
