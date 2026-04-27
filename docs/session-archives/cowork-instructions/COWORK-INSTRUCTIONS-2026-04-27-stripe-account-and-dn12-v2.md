# COWORK INSTRUCTIONS — DN-12 + Stripe account setup milestone (v2)

**Generated:** 2026-04-27 (v2 — supersedes earlier 2-edit draft)
**Source chat:** Payment processor evaluation + Stripe account creation
**Target file:** `cactus-master-briefing.md` (5 edits)

**Why v2:** The earlier 2-edit draft would have left the briefing
internally inconsistent — DN-12 says payment processing is decided,
but three other places in the briefing still flagged Stripe as
pending. This v2 folds in cleanup of those stale references so the
briefing is internally coherent after Cowork applies the edits.

---

## How to use this document

Hand this file to Cowork:

> "Apply the five edits described in this document to cactus-master-briefing.md."

All five edits are in Section 12 or Section 13. Review the diff in
your text editor before saving / committing.

---

## EDIT 1 — File DN-12 in the DN log

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12a (OPEN DECISIONS — DN LOG), immediately
after the DN-11 entry (rate-card lifecycle, ending around line 1737).
Insert as a new entry before the `---` horizontal rule that precedes
Section 13 BUSINESS FORMATION STATUS.

**Content to insert (verbatim, with leading blank line for spacing):**

```markdown

### DN-12 — Payment processing architecture (Stripe + future QuickBooks)
**Status:** PARTIALLY RESOLVED 2026-04-27. Stripe account live;
integration architecture session deferred (target: after rate-card
architecture session). QuickBooks Online deferred until 2-3 manual
cycles processed and chart of accounts is clearer.

**Decision:** Stripe for client invoice collection (ACH Direct Debit
primary, card fallback with surcharging passed to client). QuickBooks
Online for accounting layer when the time comes. Single processor,
single accounting platform — no multi-tool sprawl in Phase 1.

This decision supersedes earlier "Stripe vs Fortis" framing in the
briefing's Open Questions section.

**Why Stripe over Modern Treasury / Dwolla / others:**
- ACH Direct Debit at 0.8% capped at $5 per transaction is structurally
  correct for B2B invoice volumes ($10K-$30K+ per cycle for 5 Logistics).
  At 10 clients × ~$20K weekly average over 6 months, processing fees
  total ~$1,200 — negligible at this stage.
- Native card surcharging support in US states that allow it (Utah does;
  must verify for each client's state of incorporation before first
  invoice — California, Connecticut, Massachusetts have restrictions).
- International expansion path exists (135+ currencies) without migration
  when Canadian or EU 3PLs onboard later.
- API and webhook model fits Cactus's "generate invoice in our system,
  use processor as rails only" approach. We are NOT using Stripe
  Invoicing — Cactus generates the invoice; Stripe is the payment rails.
- Modern Treasury is structurally better for bank-rail-heavy B2B at scale
  but is enterprise-priced and assumes multi-bank infrastructure Cactus
  doesn't have. Revisit at $5M+ ARR / 30+ clients / post-DN-10 partner-fee
  architecture live.
- Dwolla is ACH-only; would force a second processor for card fallback.
  Worse stack complexity, no compensating benefit.

**Why QuickBooks Online over Xero:**
- US-based accountant ecosystem is overwhelmingly QuickBooks. Future
  fractional CFO or CPA will assume QBO. Xero's strengths (international,
  unlimited users, cleaner UI) don't apply to Cactus's current stage.
- Stripe ↔ QBO native integration is mature; reconciles deposits and
  fees correctly.

**Stripe account setup (completed 2026-04-27):**
- Account created at stripe.com under Cactus Logistics LLC
- Mercury checking + savings linked
- Automatic daily payouts enabled (Mercury checking is payout destination)
- Test mode active by default; production switchover happens once,
  intentionally, when the integration session ships
- API keys (publishable + secret, separate for test and live) noted in
  Stripe dashboard → Developers; will land in `.env.local` when integration
  starts. Never committed to git.

**Stripe setup still TODO (not blocking, do when ready):**
- Activate ACH Direct Debit (Settings → Payment methods). Stripe may
  request additional business verification before approval — volume
  estimates, customer base description. Worth doing soon so it's ready
  when 5 Logistics needs to authorize.
- Set statement descriptor (Settings → Business → Public details) to
  something recognizable like "CACTUS LOGISTICS" so client bank
  statements don't read as suspicious withdrawals.
- Configure webhook endpoint (Settings → Developers → Webhooks) when
  the Cactus webhook handler is built. URL will be
  `https://[domain]/api/stripe/webhooks`. Use Stripe CLI for local-dev
  webhook forwarding during integration work.

**Integration architecture (deferred to its own session):**
The Cactus-Stripe integration is non-trivial and deserves a dedicated
architecture session. Sketch of what it will need to address:

- **Client onboarding flow:** new client triggers a Stripe Setup Intent;
  client receives a hosted-by-Stripe authorization link; client enters
  bank credentials (typically via Plaid integration Stripe wraps); client
  signs electronic NACHA mandate; Stripe stores tokenized PaymentMethod
  attached to a Customer object.
- **`client_payment_methods` table** (new): links Cactus organizations to
  their Stripe Customer ID, default PaymentMethod ID, mandate status,
  authorization date, last verified date. Tracks the authorization
  lifecycle Cactus-side so the app knows which clients can be auto-pulled
  vs which need re-authorization.
- **`/api/invoice` endpoint:** at invoice creation time, create a Stripe
  PaymentIntent referencing the stored PaymentMethod and confirm it
  immediately ("off-session" payment). Money lands in Stripe balance in
  3-5 business days, then payouts to Mercury daily.
- **Webhook handler:** subscribe to `payment_intent.succeeded`,
  `payment_intent.payment_failed`, `mandate.updated` (revocation),
  `payout.paid`. On succeeded, mark `client_invoices.payment_status =
  PAID` + write `payment_received_at` + insert reconciliation row. On
  failed, flag invoice for manual follow-up + email client a fresh
  authorization link + offer card fallback. On mandate revoked, flag
  client account as needing re-authorization.
- **Card fallback path:** when ACH fails or for one-off card payments,
  generate per-invoice payment link (Stripe Checkout or Payment Link
  product). Surcharge added at checkout per state law. Card payments
  settle faster (next business day) but cost ~3% — pass-through to client.
- **Reconciliation against Mercury deposits:** Stripe payouts to Mercury
  show as aggregate deposits (multiple invoice payments combined into
  one ACH credit). Cactus needs to reconcile each Mercury deposit
  against the underlying Stripe invoice payments via `payout.paid`
  webhook. Critical for accounting accuracy and future QBO sync.
- **`payment_status` lifecycle on `client_invoices`:** new column or
  enum — UNPAID → PROCESSING → PAID, with FAILED branch and RETRY
  state. Defines invoice state machine for the app to render correctly
  and for Mercury reconciliation to match against.

**Mercury cash flow architecture (also deferred):** Mercury supports
multiple checking accounts under one business relationship (functionally
sub-accounts). When DN-10 partner-fee architecture lands, recommend
splitting cash into: Main operating, Carrier payables, Partner payables,
Tax reserve, Operating reserve / runway. Current state (single checking
+ savings) is fine for Phase 1 with one client; revisit when adding
client #2 or when partner-fee architecture ships, whichever comes
first.

**Open before integration session:**
- Confirm 5 Logistics will accept ACH Direct Debit pulls (some clients
  are push-only by policy). If push-only, integration architecture
  changes — Cactus needs a receive-only flow with reconciliation by
  invoice reference.
- Verify Utah state law on card surcharging (last known: allowed) and
  spot-check 5 Logistics' state of incorporation.
- Decide whether to use Stripe Customer Portal for clients to manage
  their own payment methods, or build a Cactus-portal-native flow. Tradeoff:
  Stripe Portal is free and battle-tested; Cactus-native is more cohesive
  UX but more code to maintain.

**Sequencing in build queue:**
Stripe integration session sits after rate-card architecture and DHL
parser sessions. May 11 5 Logistics first invoice will be processed
manually (cycle 1 manual processing already agreed). Cycle 2 target is
mid-June; Stripe integration must ship before cycle 2 to avoid manual
processing creep.
```

---

## EDIT 2 — Add Stripe account setup to "Completed and verified"

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Completed and verified`
subsection (line 663). The most recent existing entry begins at line
664 with `- [x] Session C.2 (2026-04-26):`.

**Action:** Insert as a new top-level checklist item IMMEDIATELY ABOVE
the Session C.2 entry (matching most-recent-first ordering).

**Content to insert (verbatim, including the leading `- [x]` and a
single trailing newline before the existing C.2 entry):**

```markdown
- [x] Stripe account creation + Mercury linking (2026-04-27): Created
      Stripe account under Cactus Logistics LLC; linked Mercury checking
      and savings; enabled automatic daily payouts to Mercury checking.
      Account active in test mode (production switchover deferred to
      Stripe integration session). API keys (publishable + secret, test
      and live) noted in Stripe dashboard, will land in `.env.local`
      when integration begins. Decision logged as DN-12 (Stripe + future
      QuickBooks Online). ACH Direct Debit activation, statement
      descriptor configuration, and webhook endpoint setup are
      remaining Stripe-side TODOs that don't block other work. No
      Cactus codebase changes from this milestone — pure account
      provisioning.
```

---

## EDIT 3 — Flip Stripe checkbox in Pending Phase 0 items

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Pending Phase 0 items`
subsection. Find the line (currently around line 1152):

```markdown
- [ ] Create Stripe account under LLC — needed before first real invoice is due
```

**Action:** Replace that exact line with:

```markdown
- [x] Create Stripe account under LLC — completed 2026-04-27, Mercury linked, daily payouts active, see DN-12
```

Do NOT modify any other lines in the Pending Phase 0 items list. The
QuickBooks Online line below it (`- [ ] QuickBooks Online account —
needed for Stage 5+ invoice sync`) stays as `[ ]` — DN-12 explicitly
defers QBO until 2-3 manual cycles are processed.

---

## EDIT 4 — Remove stale "Stripe vs Fortis" lines from Open Questions

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 12, in the `### Open questions / decisions
still needed` subsection. Two lines need to be removed because DN-12
resolves the Stripe vs Fortis question.

**Line A to remove (currently around line 1419):**

```markdown
- Payment processor: Stripe vs Fortis
```

**Line B to remove (currently around line 1432):**

```markdown
- Stripe vs Fortis: final payment processor decision needed before Phase 2 payment build
```

**Action:** Delete both lines entirely. Remove the line and its
trailing newline so the surrounding bullets close up cleanly without
a blank gap.

Do NOT modify any other lines in the Open Questions section. Many
neighbors mention USPS, QuickBooks API, Warehance, etc. — those stay
intact.

---

## EDIT 5 — Update Section 13 Stripe row from pending to complete

**File:** `cactus-master-briefing.md`
**Location:** Inside Section 13 BUSINESS FORMATION STATUS, in the
status table. Find the Stripe row (currently around line 1751):

```markdown
| Stripe account | ⏳ Needed before first real invoice is due |
```

**Action:** Replace that exact line with:

```markdown
| Stripe account | ✅ Created 2026-04-27 — Mercury linked, daily payouts active |
```

Do NOT modify any other rows in the Section 13 table. The QuickBooks
Online row immediately below stays at `⏳ Needed for Stage 5+ invoice
sync` — DN-12 explicitly defers QBO setup.

---

## SUMMARY OF CHANGES

After Cowork completes all five edits:

- **DN-12 filed** with full payment processing architecture decision,
  Stripe account setup state, deferred integration architecture
  sketch, and open questions for the future integration session
- **Stripe account setup logged** as a completed milestone alongside
  Session C.2 in the most-recent-first ordering of Completed and
  verified
- **Phase 0 checkbox flipped** so Pending Phase 0 list reflects reality
- **Stale Stripe vs Fortis lines removed** from Open questions (the
  decision is now made — keeping them would contradict DN-12)
- **Section 13 Stripe row updated** from pending to complete

The briefing will be internally consistent after these edits — no
contradictions between DN-12 and other sections.

---

## FILE MOVE (post-Cowork-completion)

Move this instructions doc to:

```
cactus-web-app/docs/session-archives/cowork-instructions/
```

Keeps the archive trail intact alongside the prior 2026-04-25 and
2026-04-26 instruction docs. If the v1 (2-edit) draft of this doc was
saved anywhere, leave it in place as historical record — useful to
see how the cleanup-of-stale-references pattern emerged during the
audit step.
