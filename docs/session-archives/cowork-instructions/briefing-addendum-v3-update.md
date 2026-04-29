# BRIEFING ADDENDUM — v1.8.0 → v1.9.0
# Subject: v3 Cross-Document Continuity Review and Template Harmonization
# Date: 2026-04-29
# Source session: continuation of legal contracts drafting (2026-04-28),
#                 cross-document review and v3 regeneration session
# Merge target: cactus-master-briefing.md
#
# This addendum:
#   (1) bumps the briefing version 1.8.0 → 1.9.0
#   (2) adds a new Section 12 Completed and Verified entry
#   (3) updates two bullets in Section 12 "Open before first signed client"
#   (4) adds DN-18
#   (5) updates Section 22.1 (document inventory table) to v3
#   (6) updates Section 22.6 (compensation architecture) — fixes section
#       reference 9.4 → 11.4 and corrects outdated non-solicit description
#   (7) updates Section 22.9 (required infrastructure) — fixes section
#       reference and removes legal@/billing@ email alias bullets
#   (8) updates Section 22.10 (folder structure) to v3 filenames
#   (9) adds new Section 22.11 covering BD Partner v3 expansions

================================================================================
DIRECTIVE 1 — Version header bump
================================================================================

REPLACE this exact text at the top of the briefing:

    # VERSION: 1.8.0 | UPDATED: 2026-04-28

WITH:

    # VERSION: 1.9.0 | UPDATED: 2026-04-29

================================================================================
DIRECTIVE 2 — Add Section 12 Completed and Verified entry
================================================================================

INSERT the following entry at the TOP of `### Completed and verified`
(immediately after the heading, before the existing 2026-04-28 entry).

Entries in this section are most-recent-first.

```
- [x] **v3 cross-document continuity review and template harmonization
      (2026-04-29):** All four legal templates regenerated as v3 after
      systematic cross-document review. Substantive additions to BD
      Partner Agreement: self-contained Confidential Information
      definition (Section 8, no longer dependent on NDA being signed),
      Marketing and Branding clause (Section 9, governs Partner's use of
      Cactus Marks), Mutual Indemnification clause (Section 10, both
      parties indemnify for breach of their obligations and IP claims),
      force majeure clause added to General section. BD Partner section
      structure expanded from 10 to 12 sections; cross-references in
      Section 7.6 (breach-triggered continuation) updated to point to new
      Section 11.3. Payment Authorization structural gaps closed: Cactus
      principal place of business added to opening, comprehensive
      notices clause added (Section 9), venue clause added (Salt Lake
      County), counterparts clause added, Address field added to Client
      signature block. MSA defined term "Services" renamed to "Cactus
      Services" throughout for cross-document consistency with BD
      Partner. NACHA return code parenthetical (R01/R07/R29) simplified
      to generic language. Universal cleanup across all four documents:
      every email reference standardized to sawyer@cactus-logistics.com
      pending alias creation; signature blocks redesigned to remove
      redundant Entity Name field (entity established in parties section
      only); Cactus principal place of business pre-filled on all four
      templates. Templates stored as
      Cactus_Mutual_NDA_Template_v3.docx,
      Cactus_MSA_Template_v3.docx,
      Cactus_Payment_Authorization_Template_v3.docx, and
      Cactus_BD_Partner_Agreement_Template_v3.docx. v1 and v2 of all
      four templates can be archived; v3 supersedes. All decisions
      captured in DN-18.
```

================================================================================
DIRECTIVE 3 — Update Section 12 "Open before first signed client" subsection
================================================================================

3A. REPLACE this exact bullet:

```
- [ ] **Book attorney consult.** Goal: ~2 hours of Utah business
      attorney time, all four contract templates reviewed at once.
      Particular attention to MSA Section 5 (Carrier Liability /
      Limited Agency), Payment Authorization Sections 4/7/8 (NACHA
      compliance), BD Partner Section 9.4 (termination tail). Budget
      $1,500-$3,500. Block this BEFORE 5 Logistics MSA is signed.
```

WITH:

```
- [ ] **Book attorney consult.** Goal: ~2 hours of Utah business
      attorney time, all four v3 contract templates reviewed at once.
      Particular attention to MSA Section 5 (Carrier Liability /
      Limited Agency), MSA Section 14 (Limitation of Liability),
      Payment Authorization Sections 4/7/8 (NACHA compliance), BD
      Partner Section 7 (Restrictive Covenants — dual-condition
      Restricted Period, breach-triggered continuation in 7.6), BD
      Partner Section 10 (Mutual Indemnification), BD Partner Section
      11.4 (termination effects on commissions). Budget $1,500-$3,500.
      Block this BEFORE 5 Logistics MSA is signed.
```

3B. REPLACE this exact bullet:

```
- [ ] **Set up legal@ and billing@ email aliases** referenced
      throughout the contract suite.
```

WITH:

```
- [ ] **Optional: legal@ and billing@ email aliases.** All four v3
      templates currently use sawyer@cactus-logistics.com as the single
      contact for legal notices, dispute submissions, payment
      authorization revocations, and audit-trail communications. If
      and when client-volume justifies role-based aliases, regenerate
      templates with legal@cactus-logistics.com and
      billing@cactus-logistics.com substituted in. No urgency.
```

================================================================================
DIRECTIVE 4 — Add new DN entry at the end of the DN log
================================================================================

APPEND the following at the very end of `## 12a. OPEN DECISIONS (DN LOG)`,
after DN-17, with one blank line between DN-17 and DN-18:

```
### DN-18 — v3 Email Standardization and Signature Block Redesign

**Status:** RESOLVED 2026-04-29 — universal change across all four
templates.

**Email standardization.** v1 and v2 of the templates referenced
legal@cactuslogistics.com (notices) and billing@cactuslogistics.com
(payments and audit trail). Two problems with that approach: (a) the
domain in the addresses was non-hyphenated, but Cactus's actual domain
is cactus-logistics.com (hyphenated) — so every reference was a
typo-equivalent; (b) the aliases didn't exist as real mailboxes,
meaning client communications would bounce. v3 consolidates all email
references to sawyer@cactus-logistics.com. This is the operational
reality (Sawyer is the single point of contact for all
contract-related communication). When client volume justifies it,
role-based aliases can be added and templates regenerated. No
substantive contract change — same person reads the email either way.

**Signature block redesign.** v1 and v2 included an "Entity Name"
field in counterparty signature blocks, ordered before "By". This
was redundant (entity name is already established in the parties
section at the top of the document) and consumed vertical space in
DocuSign's fixed-aspect-ratio signature anchor. v3 removes "Entity
Name" from all signature blocks and places "By" at the top as the
DocuSign signature anchor. New structure: By → Name → Title → Date
→ Email → Address. Cleaner, more conventional, and DocuSign-friendly
without sacrificing any legal content.

**No substantive legal change** is introduced by either of these
moves. The substantive v3 changes are in the BD Partner Agreement
(self-contained Confidentiality, Marketing/Branding, Mutual
Indemnification) — see DN-19 if a separate decision note is added,
or the new Section 22.11 of this briefing for the architectural
rationale.
```

================================================================================
DIRECTIVE 5 — Update Section 22.1 Document Inventory table
================================================================================

REPLACE the entire current `### 22.1 Document Inventory` block (heading
plus everything until the next `### 22.2` heading) with:

```
### 22.1 Document Inventory

Cactus's standard contract suite. Current versions (all v3, regenerated
2026-04-29 after cross-document continuity review). All four templates
pending one-time review by a Utah business attorney (estimated
$1,500–$3,500 spend; budget for it before first signed client). Files
live in `cactus_dev/legal/templates/`.

| Document | Purpose | When signed | Status |
|---|---|---|---|
| Cactus Mutual NDA (v3) | Pre-deal confidentiality (carriers, WMS partners, prospects) | Pre-deal exploration | v3 — pending lawyer review |
| Cactus MSA (v3) | Master client agreement — scope, liability, payment, term | At client onboarding | v3 — pending lawyer review |
| Cactus Payment Authorization (v3) | ACH + CC authorization referencing Stripe | At client onboarding (alongside MSA) | v3 — pending lawyer review |
| Cactus BD Partner Agreement (v3) | Sales/referral partner compensation | When engaging a BD partner | v3 — pending lawyer review |

The MSA + Payment Authorization are signed together as a two-doc
onboarding bundle (one DocuSign envelope, two documents).

The Rate Card is a separate document Cactus delivers to each prospective
client BEFORE the MSA is signed. It is referenced in the MSA but does
not require its own signature — the client's signature on the MSA
incorporates the Rate Card by reference.

v1 and v2 of all four templates are superseded by v3 and may be
archived. The audit trail of changes from v1 → v2 → v3 is captured
across DN-13 through DN-18.

```

================================================================================
DIRECTIVE 6 — Update Section 22.6 BD Partner Compensation Architecture
================================================================================

REPLACE this exact paragraph in Section 22.6:

```
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
```

WITH:

```
**Termination tail asymmetry** (BD Partner Agreement Section 11.4 in v3):
- Cactus terminates for convenience OR partner terminates for Cactus's
  uncured material breach → perpetual commissions continue
- Partner terminates for convenience → 12-month commission tail, then
  commissions stop regardless of account status
- Cactus terminates for cause → commissions cease immediately

This asymmetry is the negotiation lever sophisticated partners may
push back on. The principle: a partner who walks shouldn't get
perpetual income from accounts they're no longer servicing.

**Restrictive covenants are dual-condition, not fixed-duration.** No
non-compete is imposed; instead, the BD Partner Agreement (Section
7.4 in v3) defines a "Restricted Period" that travels with the
commission relationship: it ends only after BOTH (a) Partner ceases
to be entitled to receive commissions, AND (b) twelve (12) months
have passed since the last commission payment. A Partner who
continues earning commissions on long-tenured accounts remains bound
by non-solicit, non-circumvent, and personnel non-solicit obligations
throughout that period plus the 12-month tail. Section 7.5
explicitly carves out the right to engage in competitive industry
activity (provided the non-solicit/non-circumvent/confidentiality
obligations are honored) — the abundance signal. Section 7.6 closes
a loophole: if the Partner's commissions cease because of Partner's
own breach, the 12-month clock runs from the termination date,
preventing the Partner from shortening their own obligations through
breach. Full architectural rationale in Section 22.11.
```

================================================================================
DIRECTIVE 7 — Update Section 22.9 Required Infrastructure Before First Signed Client
================================================================================

REPLACE the entire current `### 22.9` block (heading plus everything
until the next `### 22.10` heading) with:

```
### 22.9 Required Infrastructure Before First Signed Client

Before sending the first MSA to a real client, the following must be
in place:

- [ ] **Attorney consult completed.** All four v3 legal templates
      reviewed by a Utah business attorney. Budget $1,500-$3,500 for
      one-time review. Particular attention to: MSA Section 5
      (Carrier Liability), MSA Section 14 (Limitation of Liability),
      Payment Authorization Sections 4/7/8 (NACHA compliance), BD
      Partner Section 7 (Restrictive Covenants — dual-condition
      Restricted Period and breach-triggered continuation), BD Partner
      Section 10 (Mutual Indemnification), BD Partner Section 11.4
      (termination effects on commissions).
- [ ] **DocuSign Standard plan active.** All four v3 templates loaded
      as DocuSign templates with named recipient roles.
- [ ] **Stripe ACH Direct Debit activated** in Stripe Dashboard.
      Already on the Stripe setup TODO list (briefing Section 12).
- [ ] **Statement descriptor configured** to "CACTUS LOGISTICS" or
      similar so client bank statements don't read as suspicious.
- [ ] **Cactus E&O / cyber liability insurance.** Not a legal-document
      requirement, but the MSA's limitation of liability cap is more
      defensible if Cactus carries reasonable insurance. Get quotes
      before first client.

Email aliases are deferred. All four v3 templates currently route
client communications (legal notices, dispute submissions, payment
authorization revocations, audit-trail confirmations) to
sawyer@cactus-logistics.com. When client volume justifies role-based
aliases, create legal@cactus-logistics.com and
billing@cactus-logistics.com on the cactus-logistics.com domain and
regenerate the templates with the substituted addresses. Until then,
sawyer@ is the single source of truth and avoids the bounce risk of
referencing inactive mailboxes.

```

================================================================================
DIRECTIVE 8 — Update Section 22.10 Document Folder Structure
================================================================================

REPLACE this exact code block in Section 22.10:

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

WITH:

```
cactus_dev/legal/
  templates/
    Cactus_Mutual_NDA_Template_v3.docx
    Cactus_MSA_Template_v3.docx
    Cactus_Payment_Authorization_Template_v3.docx
    Cactus_BD_Partner_Agreement_Template_v3.docx
  archive/
    v1/  (pre-cross-document-review templates)
    v2/  (post-initial-revision templates)
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

================================================================================
DIRECTIVE 9 — Add new Section 22.11
================================================================================

APPEND the following NEW SECTION at the end of Section 22, after
Section 22.10's closing prose ("Sawyer maintains the executed PDFs as
authoritative copies. DocuSign also retains originals, but independent
local storage avoids vendor-lock-in risk.") and before the trailing
`---` separator:

```

### 22.11 BD Partner v3 — Restrictive Covenants, Branding, and Indemnification

The v3 BD Partner Agreement (regenerated 2026-04-29) introduced three
substantive expansions over v2 that warrant their own architectural
treatment.

**Self-contained Confidentiality (Section 8).** v1 and v2 of the BD
Partner Agreement defined Confidential Information by reference to
Cactus's standard Mutual NDA, with language saying the parties "may"
also execute the NDA. The "may" was the problem: a Partner who signed
only the BD Partner Agreement was bound by confidentiality obligations
without ever seeing what the underlying definition covered. v3 adds a
self-contained five-subsection Confidential Information definition
(Definition, Obligations, Exclusions, Compelled Disclosure, Survival)
ported from the MSA's structure. The BD Partner can now stand alone.
A closing sentence preserves the option: if the parties also sign the
Mutual NDA separately, those obligations stack rather than replace.

**Marketing and Branding (Section 9).** v3 introduces a three-subsection
clause governing the Partner's use of "Cactus Marks" (the Cactus name,
logo, and trademarks). Subsection 9.1 requires written pre-approval
for marketing materials and adherence to brand and usage guidelines.
Subsection 9.2 confirms Cactus retains all ownership and that goodwill
from Partner's use accrues to Cactus (standard trademark-licensee
language). Subsection 9.3 requires cessation of all use upon
termination. This closes a real gap — without it, an aggressive
Partner could put the Cactus logo on their website with no contractual
basis to compel removal. This is also the protection the mutual
indemnification clause depends on (Cactus only indemnifies for
trademark claims arising from compliant use).

**Mutual Indemnification (Section 10).** v1 and v2 had no
indemnification at all in the BD Partner Agreement. v3 adds a three-
subsection mutual structure. Subsection 10.1 requires Partner to
indemnify Cactus for: breach of Sections 1, 7, 8, or 9; false or
misleading representations; legal violations in referral activity;
unauthorized Mark usage; IP infringement. Subsection 10.2 requires
Cactus to indemnify Partner for: Cactus's material breach; trademark
claims arising from Partner's compliant use of the Cactus Marks.
Subsection 10.3 sets out standard indemnification procedure (prompt
notice, control of defense, cooperation, no settlement imposing
non-monetary obligations without consent). The mutual structure was
chosen over one-way (Partner-to-Cactus only) for symmetry — it
signals that Cactus accepts reciprocal accountability and is the
appropriate posture for a relationship intended to be long-running.

**Section 11 renumbering.** What was Section 9 (Term and Termination)
in v1/v2 is now Section 11 in v3. Section 7.6 (Breach-Triggered
Continuation) cross-reference updated from "Section 9.3" to "Section
11.3". Section 11.5 Survival clause expanded to enumerate all
surviving sections (7, 8, 9.2, 9.3, 10, 11.4, 12) for clarity.

**Force majeure** added to Section 12 (General). MSA already had this;
parity restored.

**The reformation clause (Section 12(f)) was already strengthened in
v2** to specifically anticipate that a court might find the duration
or scope of any restrictive covenant unreasonable, and to direct the
court to reform rather than strike. This protection carries forward
into v3 unchanged. Critical because the dual-condition Restricted
Period (Section 7.4) is intentionally indefinite in maximum duration
— a Partner with long-tenured accounts could be bound for many years
— and a court seeing that may want to narrow it. Reformation
language directs the narrowing rather than permitting wholesale
invalidation.

```

================================================================================
END OF ADDENDUM
================================================================================

POST-MERGE VERIFICATION CHECKLIST (run these greps to confirm the merge
landed correctly):

1. Header version reads "1.9.0 | UPDATED: 2026-04-29"
2. `grep -c "DN-18"` returns ≥ 2 (one in completed entry, one in DN heading)
3. `grep -c "v3"` returns several hits in Section 22.1 table and 22.10 folder structure
4. `grep "Section 9.4"` in Section 22.6 returns nothing (replaced with 11.4)
5. `grep "legal@cactuslogistics\.com"` returns 0 hits (removed; alias path mentioned only as future possibility with hyphenated domain)
6. `grep "billing@cactuslogistics\.com"` returns 0 hits (same)
7. Section 22.11 heading exists and section runs to the closing `---` of Section 22
