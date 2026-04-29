# BRIEFING ADDENDUM — LEGAL CONTRACTS FRAMEWORK
# Session: Legal Contracts Drafting (2026-04-28)
#
# How to fold this into cactus-master-briefing.md:
# - Append Section 22 to the body of the briefing (renumber if you've
#   added other sections in the meantime)
# - Append DN-13 through DN-17 to the Decision Notes section
# - Append the session entry to Section 12 (CURRENT BUILD STATE)
#
# Bump briefing version to 1.8.0 when you do.

---

## 22. LEGAL CONTRACTS FRAMEWORK

### 22.1 Document Inventory

Cactus's standard contract suite, drafted 2026-04-28. All four are
templates pending one-time review by a Utah business attorney
(estimated $1,500–$3,500 spend; budget for it before first signed
client). Files live in `cactus_dev/legal/templates/`.

| Document | Purpose | When signed | Status |
|---|---|---|---|
| Cactus Mutual NDA | Pre-deal confidentiality (carriers, WMS partners, prospects) | Pre-deal exploration | v1 — pending lawyer review |
| Cactus MSA (v2) | Master client agreement — scope, liability, payment, term | At client onboarding | v2 — pending lawyer review |
| Cactus Payment Authorization (v2) | ACH + CC authorization referencing Stripe | At client onboarding (alongside MSA) | v2 — pending lawyer review |
| Cactus BD Partner Agreement | Sales/referral partner compensation | When engaging a BD partner | v1 — pending lawyer review |

The MSA + Payment Authorization are signed together as a two-doc
onboarding bundle (one DocuSign envelope, two documents).

The Rate Card is a separate document Cactus delivers to each prospective
client BEFORE the MSA is signed. It is referenced in the MSA but does
not require its own signature — the client's signature on the MSA
incorporates the Rate Card by reference.

### 22.2 Limited Agency Framework — Why Cactus Can Bill Clients for Carrier Charges

The MSA establishes Cactus as Client's **limited agent** for two purposes:
(a) procuring carrier shipping services on Client's behalf at rates
Client has approved (via Rating API or Portal), and (b) remitting
carrier charges using funds Client has authorized. Outside that narrow
scope, Cactus has no agency authority and no fiduciary duties.

This is the legal mechanism that justifies passing all carrier charges
through to the client (including post-purchase APV adjustments). Client
is the principal and shipper of record; Cactus is the agent. The
underlying carrier obligation is genuinely the client's, not Cactus's.

Without this framework, the MSA would be relying on contract language
alone to assign carrier liability. With it, the MSA is relying on
contract language + agency law — meaningfully stronger.

### 22.3 Rate Card Pricing Model — No Markup Language in MSA

The MSA does not mention "markup," "Cactus margin," or any
percentage/flat-fee methodology. Pricing is expressed exclusively as
**"Agreed Rates"** drawn from the **"Rate Card"** delivered to Client
prior to signing.

This was a deliberate departure from the v1 draft. Reasons:

1. **Confidentiality of internal cost components.** MSA Section 6.1
   states that Cactus's internal cost components (including the Carrier
   Charge and any internal pricing methodology) are confidential and
   not subject to client disclosure or audit. This is the strongest
   contractual position on hiding markup. Sophisticated clients may
   push back; soften only on attorney advice.

2. **Anchors conversation around the rate, not the margin.** Renewal
   conversations, dispute conversations, and "can you do better on
   pricing" conversations should center on the rate the client agreed
   to — not on what Cactus's internal markup looks like.

3. **Operationally invisible to client.** Whether Cactus uses Single-
   Ceiling percentage or flat per-shipment markup is internal to the
   billing pipeline. Client sees Final Billed Rate (renamed
   final_billed_rate in schema v1.6.0) which equals the Agreed Rate.

The Rate Card includes a 30-day prior-notice requirement for material
rate increases (MSA Section 6.3), with client's right to terminate
without penalty if they reject the change. Two carve-outs: (a) adding
new optional carriers/services, and (b) pass-through carrier surcharge
republications (e.g., UPS fuel surcharge updates).

### 22.4 Per-Carrier NET Terms vs. Weekly Friday Pull

The MSA codifies per-carrier NET terms as the **contractual maximum
payment period**:

| Carrier | NET Terms |
|---|---|
| UPS | NET 5 |
| FedEx | NET 5 |
| DHL Express | NET 5 |
| GOFO | NET 7 |
| UniUni | NET 7 |
| DHL eCommerce | NET 7 |
| USPS | Prepaid (metered) |

The operational Friday weekly pull is always within the shortest NET
term. Invoice generation Mon-Wed → Friday pull = 2-4 days post-invoice,
well inside NET 5.

Where a single Cactus Invoice contains amounts attributable to multiple
carriers with differing NET terms, Cactus's right to debit is governed
by the shortest applicable NET term. This is a contractual framework
choice (Option A) — see DN-13 for the alternative.

### 22.5 CC Fee Waiver Mechanism (Operational Pattern)

The MSA and Payment Authorization both establish 3% as the standard
credit-card processing fee. Cactus has explicit unilateral discretion
to waive or reduce this fee in writing for specific clients, invoices,
time periods, or scenarios.

**Critical contractual protection:** any waiver is specific to the
matters expressly identified, does NOT constitute a continuing waiver,
and does NOT affect Cactus's right to charge the fee at the standard
3% rate on any other invoice or in any other circumstance. This is
reinforced in MSA Section 15(f) (No Waiver clause).

**Why the protection matters.** Without it, a course of informal
waivers could be argued to permanently modify the contract under
contract law's "course of dealing" doctrine. With it, Cactus can grant
waivers freely without losing the right to revert to standard pricing.

**Operational pattern for granting a waiver** (template email):

> "Per Section 7.5 of the Master Services Agreement and Section 5 of
> the Payment Authorization Agreement, Cactus hereby waives the 3%
> credit-card processing fee for [Client Name] on Cactus Invoices
> issued from [start date] through [end date]. After [end date], the
> standard 3% CC Fee will apply unless extended in writing.
> — [Sawyer], Cactus Logistics LLC"

Save the email in `cactus_dev/legal/clients/[client-folder]/cc-fee-waivers/`
for the audit trail. The email IS the waiver — no Stripe configuration
is required (the Cactus billing pipeline applies or doesn't apply the
fee per the org's `cc_fee_waived` flag in the organizations table,
which mirrors the contractual waiver).

### 22.6 BD Partner Agreement — Compensation Architecture

**Standard commission:** 25% of Net Margin per Qualified Account, paid
monthly (30 days after month-end), continuing for so long as the
account remains active and revenue-generating with positive margin.

**Net Margin definition** (BD Partner Agreement Section 3.3):
- Gross Revenue *excluding* pure pass-throughs (3% CC Fee, sales/use
  tax) and *excluding* client-owned-account passthrough revenue
- *Less* Carrier Charges remitted to carriers (or USPS meter debits)
- *Less* third-party partner fees and rev-share costs (Warehance
  per-label fees, future WMS partner fees, rate provider rev-share)
- *Less* credits, refunds, adjustments, chargebacks, bad debt

**Commission is earned when Cactus collects, not when Cactus invoices.**
This is the mandatory clawback provision — without it, Cactus would be
paying 25% on revenue it never received.

**Negative-margin carry-forward:** if Net Margin is negative in any
month for a Qualified Account (e.g., due to APV true-ups, partner-fee
true-ups, bad debt), the negative balance carries forward and offsets
future positive Net Margin from the same account before further
commission becomes payable.

**Special Offers** (Section 3.2): Cactus may offer alternative
commission terms in writing for specific accounts/campaigns/scenarios.
A Special Offer governs over the standard terms for the matters it
covers. This is the contractual mechanism for one-off promotional or
strategic deals.

**Termination tail asymmetry** (Section 9.4):
- Cactus terminates for convenience OR partner terminates for Cactus's
  uncured material breach → perpetual commissions continue
- Partner terminates for convenience → 12-month commission tail, then
  commissions stop regardless of account status
- Cactus terminates for cause → commissions cease immediately

This asymmetry is the negotiation lever sophisticated partners may
push back on. The principle: a partner who walks shouldn't get
perpetual income from accounts they're no longer servicing.

**No non-compete; non-solicit + non-circumvent for 12 months
post-term.** Non-competes are increasingly unenforceable and hostile
to legitimate sales reps; non-solicit + non-circumvent is the right
balance.

### 22.7 E-Signature Platform — DocuSign

DocuSign is the chosen e-signature platform for all Cactus contracts
going forward. Reasons:

- Industry standard for carrier and 3PL business development teams.
  Carriers like UPS/FedEx/DHL receive DocuSign envelopes daily; sending
  a DocuSign envelope from Cactus avoids the "what is this signature
  service?" friction that a budget tier (SignWell, BoldSign) might
  trigger with a Tier-1 carrier's legal team.
- Compliant with ESIGN, UETA, eIDAS — no questions raised about
  enforceability of signed documents.
- Templates pay for themselves — same MSA/Payment Auth bundle goes to
  every client, set up once.

**Plan:** DocuSign Standard (~$45/month, $540/year billed annually)
gives unlimited envelopes. Personal plan ($15/month) is too restrictive
at 5 envelopes/month.

**Critical: never put raw credit card numbers or bank account numbers
into DocuSign or any e-signature document.** Payment credentials are
captured exclusively in Stripe. The Payment Authorization Agreement
references the Stripe-stored Payment Method Token, not the underlying
credentials. See Section 22.8 for the architecture.

### 22.8 Stripe Multi-Payment-Method Architecture (Onboarding Flow)

Stripe natively supports multiple PaymentMethods per Customer object.
The "primary vs backup" labeling is implemented in Cactus's database
(organizations.payment_method enum: ACH | CC | ACH_PRIMARY_CC_BACKUP),
not in Stripe.

**Onboarding flow** (to be built in deferred Stripe integration session):

1. Client signs MSA + Payment Authorization in DocuSign envelope
2. Cactus creates Stripe Customer object, stores stripe_customer_id on
   organizations row
3. Cactus generates Stripe-hosted onboarding link (via SetupIntent
   with client_secret returned to Cactus Portal)
4. Client lands on Stripe Payment Element configured for both
   `us_bank_account` and `card` types — can add both in one session
5. Bank verification via Stripe Financial Connections (instant; ~$1.50
   per successful link). Microdeposit alternative is cheaper but adds
   1-2 business day delay before first debit can clear.
6. Card verification via small reversible authorization charge
7. Both PaymentMethods attach to the same Customer; Cactus stores both
   PaymentMethod IDs and which is designated primary vs backup
8. Stripe's `customer.invoice_settings.default_payment_method` set to
   the primary

**Fallback logic is built in Cactus, not Stripe.** Stripe does NOT
automatically retry against a different PaymentMethod when one fails.
The Cactus webhook handler must:

1. Listen for `payment_intent.payment_failed`
2. Check the org's payment_method config — if `ACH_PRIMARY_CC_BACKUP`
   AND the failure was on the ACH primary, automatically create a new
   PaymentIntent against the backup card with the 3% CC Fee added
3. If the card also fails (or no backup is configured), mark the
   invoice OVERDUE and trigger MSA Section 8.3 suspension flow

**ACH return-code asynchrony — gotcha for the integration session.**
ACH returns can surface 1–5 business days AFTER the original debit.
The most common returns to handle:

- R01 — Insufficient funds (most common)
- R07 — Authorization revoked by customer (treat as material event;
  re-flag invoice and require re-authorization before next pull)
- R29 — Corporate customer advises not authorized (similar to R07)
- R10 — Customer advises not authorized (similar to R07)

A debit that "succeeded" Friday could come back as failed the
following Tuesday. The payment_events table (migration v1.6.0) tracks
the lifecycle correctly; ensure the webhook handler treats late
returns as material events rather than informational logs.

### 22.9 Required Infrastructure Before First Signed Client

Before sending the first MSA to a real client, the following must be
in place:

- [ ] **Attorney consult completed.** All four legal templates reviewed
      by a Utah business attorney. Budget $1,500-$3,500 for one-time
      review. Particular attention to: MSA Section 5 (Carrier Liability),
      Payment Authorization Sections 4/7/8 (NACHA compliance), BD
      Partner Section 9.4 (termination tail).
- [ ] **legal@cactuslogistics.com** email address active. Referenced in
      all four documents as the legal notice address.
- [ ] **billing@cactuslogistics.com** email address active. Referenced
      in MSA dispute provisions and Payment Authorization revocation
      provisions.
- [ ] **DocuSign Standard plan active.** All four templates loaded as
      DocuSign templates with named recipient roles.
- [ ] **Stripe ACH Direct Debit activated** in Stripe Dashboard.
      Already on the Stripe setup TODO list (briefing Section 12).
- [ ] **Statement descriptor configured** to "CACTUS LOGISTICS" or
      similar so client bank statements don't read as suspicious.
- [ ] **Cactus E&O / cyber liability insurance.** Not a legal-document
      requirement, but the MSA's limitation of liability cap is more
      defensible if Cactus carries reasonable insurance. Get quotes
      before first client.

### 22.10 Document Folder Structure

Recommended folder layout under `cactus_dev/`:

```
cactus_dev/legal/
  templates/
    Cactus_Mutual_NDA_Template.docx
    Cactus_MSA_Template_v2.docx
    Cactus_Payment_Authorization_Template_v2.docx
    Cactus_BD_Partner_Agreement_Template.docx
  ndas/
    [counterparty-name]-YYYY/
      executed.pdf
      registration-notes.md
  clients/
    [client-name]/
      msa-and-payment-auth-executed.pdf
      rate-card-vYYYYMMDD.pdf
      docusign-envelope-id.txt
      cc-fee-waivers/
        YYYYMMDD-waiver-from-sawyer.eml
  partners/
    [partner-name]-bd/
      executed-agreement.pdf
      qualified-accounts-ledger.md
      special-offers/
        YYYYMMDD-special-offer-name.pdf
```

Sawyer maintains the executed PDFs as authoritative copies. DocuSign
also retains originals, but independent local storage avoids vendor-
lock-in risk.

---

## DECISION NOTES — ADD TO EXISTING DN-X SECTION

### DN-13 — Per-Carrier NET Terms vs. Single Org-Level terms_days

**Status:** RESOLVED 2026-04-28 — contractual framework chosen, no
schema change needed in Phase 1.

The MSA assigns per-carrier NET terms (UPS/FedEx/DHL Express NET 5;
GOFO/UniUni/DHL eCom NET 7; USPS prepaid). The current schema has a
single `organizations.terms_days` column and `due_date = today +
organizations.terms_days` per cactus_invoice.

**Resolution (Option A in legal-drafting session):** The MSA frames
per-carrier NET terms as the *contractual maximum*. The Friday weekly
pull is always within the shortest applicable NET term (NET 5 with
invoice generated Wed → due Mon → Friday pull is Day 2). No schema
work required.

**Deferred Option B:** If a future client requires per-carrier sub-
invoices with per-carrier due dates (e.g., for accounting reasons),
schema work needed: add `cactus_invoices.carrier_code`, restructure
weekly billing to issue one cactus_invoice per (org, carrier, week)
combination, and run multiple Stripe pulls per week. Defer until a
real client demands it.

The MSA contractual language (Section 7.3) accommodates either option
without requiring re-papering.

### DN-14 — Markup Confidentiality vs. Rate-Card-Only Disclosure

**Status:** RESOLVED 2026-04-28.

The v1 MSA exposed Cactus's pricing methodology in the contract (per-
component Single-Ceiling vs. flat fee, etc.). The v2 MSA replaces all
markup language with "Agreed Rate" / "Rate Card" framing, and Section
6.1 explicitly states that Cactus's internal cost components and
pricing methodology are confidential and not subject to client
disclosure or audit.

**Tradeoff accepted:** Sophisticated clients (especially mid-market
3PLs and any client with procurement involvement) may push back on
the "no audit" provision. If pushed, response is: "Cactus's pricing
to you is the Rate Card. Cactus's internal cost structure is Cactus's
business. If you don't believe the Rate Card is competitive for your
volume, request a re-quote." Soften only on attorney advice or to win
a strategic account.

**Operational implication:** Internal billing pipeline mechanics
(Single-Ceiling, flat fee, percentage markup, rate cards) remain
unchanged. The only change is *contract-facing language*. The
schema (`markup_type_applied`, `markup_value_applied`,
`markup_source` on invoice_line_items and shipment_ledger) continues
to track everything internally.

### DN-15 — CC Fee Waiver Discretion

**Status:** RESOLVED 2026-04-28.

The MSA and Payment Authorization establish a 3% standard CC fee with
explicit Cactus discretion to waive in writing. Critical addition:
"Any such waiver is specific to the matters expressly identified...
does not constitute a continuing waiver." This protects against the
common-law "course of dealing" doctrine that could otherwise convert a
pattern of waivers into a permanent contract modification.

The waiver mechanism is operational — by email — not contractual. No
amendment needed, no Stripe configuration change required. The Cactus
billing pipeline reads the `organizations.cc_fee_waived` flag (already
on schema per migration v1.6.0); the email is the audit trail of why
that flag is set.

### DN-16 — BD Partner Termination Tail Asymmetry

**Status:** RESOLVED 2026-04-28 — contractual asymmetry preserved.

The BD Partner Agreement (Section 9.4) treats three termination
scenarios differently:

- Cactus-for-convenience or partner-for-Cactus-breach → perpetual
  commissions continue
- Partner-for-convenience → 12-month tail, then commissions cease
- Cactus-for-cause → commissions cease immediately

**Reasoning preserved for future negotiation:** The asymmetry exists
because perpetual commissions to a partner who has stopped
servicing accounts is hard to defend economically. Strong partners
may negotiate the 12-month tail upward (24-36 months are common
counter-proposals). Holding the line at 12 months is the recommended
default; raise only for strategic partners and only as a calculated
concession.

**Risk factor for fundraising:** Fully perpetual commission
arrangements (no termination cap at all) materially complicate
acquisition diligence. Acquirers price unbounded liabilities
aggressively. The 12-month tail on partner-for-convenience preserves
acquisition optionality without significantly weakening the partner's
incentive to refer in the first place.

### DN-17 — Stripe Multi-Payment-Method Architecture

**Status:** SCOPED 2026-04-28; integration deferred to its own
session per existing briefing roadmap.

**Architectural confirmation:** Stripe natively supports multiple
PaymentMethods per Customer. The primary/backup distinction is
implemented in Cactus's database (`organizations.payment_method` enum
already in place). Stripe handles default payment method via
`customer.invoice_settings.default_payment_method`.

**Build implications for the deferred Stripe integration session:**

1. Use Stripe Financial Connections (not microdeposit verification)
   for instant ACH bank verification at onboarding. Cost ~$1.50 per
   successful link; worth it for first-Friday-pull-after-onboarding
   timing.
2. Use SetupIntents (not PaymentIntents) for capturing payment
   credentials at onboarding. SetupIntents save credentials without
   charging, which is correct for the off-session weekly-pull model.
3. Build webhook handler to handle async ACH return codes (R01, R07,
   R10, R29). Critical: a debit that "succeeded" Friday can come back
   as failed the following Tuesday. Treat late returns as material
   events that re-flag the invoice, not as informational logs.
4. Build automatic fallback logic: when a primary ACH PaymentIntent
   fails AND the org is configured `ACH_PRIMARY_CC_BACKUP`, auto-
   create a new PaymentIntent against the backup card with 3% CC Fee
   added. Stripe does NOT do this automatically.
5. R07 ("authorization revoked by customer") and R10 should re-flag
   the org as needing re-authorization. Suspend further auto-pulls
   until a new Payment Authorization is signed.

**Open question for the integration session:** whether to use Stripe
Customer Portal (Stripe-hosted, free, battle-tested) for clients to
manage their own payment methods, or build a Cactus-Portal-native
flow (more cohesive UX but more code to maintain). Default
recommendation: Stripe Customer Portal for v1; Cactus-native if
client demand justifies the build cost.

---

## ENTRY FOR SECTION 12 (CURRENT BUILD STATE)

Add this entry under "Completed and verified":

- [x] **Legal contracts framework drafted (2026-04-28):** Four
      Cactus standard contract templates produced and validated:
      Mutual NDA, MSA v2, Payment Authorization v2, BD Partner
      Agreement v1. All four pending one-time Utah business attorney
      review (~$1,500-$3,500 budget). Templates stored in
      `cactus_dev/legal/templates/`. Key architectural decisions
      captured in DN-13 through DN-17. MSA v2 supersedes v1 (folded in
      Limited Agency clause from Buku review, replaced markup language
      with Rate Card framing, removed Order Form/Schedule A pattern in
      favor of Rate Card delivered pre-signing, bumped dispute window
      to 30 days, added CC fee waiver discretion clause with
      no-continuing-waiver protection, added Rate Card update
      mechanism with 30-day notice and client termination right).
      Payment Authorization v2 mirrors MSA v2 CC fee waiver language
      and references Stripe-tokenized PaymentMethod (no raw payment
      credentials in document). BD Partner Agreement uses 25%-of-Net-
      Margin perpetual commission model with mandatory clawback,
      negative-margin carry-forward, 12-month tail on partner-for-
      convenience termination, and Special Offers mechanism for
      strategic deals. DocuSign Standard ($45/month) chosen as
      e-signature platform for industry credibility with carriers.
      Required infrastructure for first-client readiness: legal@ and
      billing@ email aliases, attorney consult, DocuSign account, ACH
      Direct Debit activated in Stripe, statement descriptor
      configured, E&O/cyber liability insurance.

Add this to "Next session candidates" or "Open before first client":

- [ ] **Book attorney consult.** Goal: ~2 hours of Utah business
      attorney time, all four contract templates reviewed at once.
      Particular attention to MSA Section 5 (Carrier Liability /
      Limited Agency), Payment Authorization Sections 4/7/8 (NACHA
      compliance), BD Partner Section 9.4 (termination tail). Budget
      $1,500-$3,500. Block this BEFORE 5 Logistics MSA is signed.
- [ ] **Set up legal@ and billing@ email aliases** referenced
      throughout the contract suite.
- [ ] **DocuSign Standard plan activated** and three templates
      loaded (Mutual NDA, MSA + Payment Auth bundle, BD Partner
      Agreement).
- [ ] **First Rate Card drafted** for 5 Logistics ahead of MSA
      signing. Rate Card includes per-carrier Agreed Rates, any
      service-level fees, CC fee waiver status (default 3%, waived
      only if explicitly stated).
- [ ] **Cactus E&O / cyber liability insurance quotes** obtained
      from broker (independent of attorney consult). MSA's limitation
      of liability cap is more defensible with insurance in place.

---

# END ADDENDUM
