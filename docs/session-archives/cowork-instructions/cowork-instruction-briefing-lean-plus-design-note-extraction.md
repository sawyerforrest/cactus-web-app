# Cowork Instruction — Master Briefing Lean Update + DN-19 Design Notes File Extraction

**Generated:** 2026-05-06
**Author session:** Cactus Senior Architect (chat session)
**Target file 1:** `cactus_dev/cactus-master-briefing.md` (four surgical edits)
**Target file 2:** `cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md` (NEW — created in this instruction; create the `design-notes/` folder if it does not yet exist)

**Sequencing note:** This is a consolidated single-pass update for all Rate Provider Agreement work shipped in the 2026-05-06 session. None of the prior queued briefing instructions for Rate Provider Agreement work have been applied yet (audit confirmed). This instruction lands everything in one coherent pass and supersedes the following earlier instructions, which should NOT be applied separately:
- `cowork-instruction-briefing-rate-provider-update.md` (superseded)
- `cowork-instruction-briefing-rate-provider-update-v1.1.md` (superseded — was an obsolete intermediate)
- `cowork-instruction-briefing-dual-compensation-model.md` (superseded)

The Buku reference cleanup (`cowork-instruction-briefing-buku-cleanup.md`) and the MSA v4 addition (`cowork-instruction-msa-shipment-reporting-addition.md`) HAVE been applied. Both confirmed.

---

## Architectural rationale for this instruction's structure

The master briefing is Claude's system-prompt-on-paste at the start of every session. Every word loaded adds latency, cost, and noise to all future sessions. The bar for content inclusion in the briefing should be: *would future Claude make worse decisions without this in context?*

Long-form design rationale (the "why" behind decisions) does not pass this bar. Future Claude needs to know that DN-19 exists, what it concluded, and what schema/code branches it implies — but does not need to re-read the full reasoning at every session bootstrap. That reasoning belongs in a separate design-notes file that humans (or Claude on demand) can drill into when needed.

This instruction therefore:
1. Adds a lean DN-19 stub to the briefing — facts and pointers only
2. Creates the full long-form DN-19 in a new `design-notes/DN-19-rate-provider-agreement-architecture.md` file
3. Establishes the `design-notes/` folder as the convention for future DN extraction

DN-1 through DN-18 are not retroactively extracted in this instruction. They can be migrated to the new convention in a separate cleanup pass when convenient — not urgent.

---

## Edit 1 of 4 — Bump version header in the briefing

**Find this exact text at the top of the briefing file:**

```
# VERSION: 1.10.0 | UPDATED: 2026-05-04
```

**Replace with:**

```
# VERSION: 1.11.0 | UPDATED: 2026-05-06
```

---

## Edit 2 of 4 — Clean up obsolete DN-19 forward-reference at end of DN-18

**Find this exact text near the end of DN-18 in the briefing (line 2334 area):**

```
**No substantive legal change** is introduced by either of these
moves. The substantive v3 changes are in the BD Partner Agreement
(self-contained Confidentiality, Marketing/Branding, Mutual
Indemnification) — see DN-19 if a separate decision note is added,
or the new Section 22.11 of this briefing for the architectural
rationale.
```

**Replace with:**

```
**No substantive legal change** is introduced by either of these
moves. The substantive v3 changes are in the BD Partner Agreement
(self-contained Confidentiality, Marketing/Branding, Mutual
Indemnification) — see Section 22.11 of this briefing for the
architectural rationale. (Note: DN-19 is now used for the Rate
Provider Agreement architecture; see below.)
```

---

## Edit 3 of 4 — Add three Section 12 Completed entries (lean versions)

**Find this exact text in Section 12 of the briefing:**

```
### Completed and verified
- [x] **v3 cross-document continuity review and template harmonization
      (2026-04-29):** All four legal templates regenerated as v3 after
```

**Replace with (inserts three new entries above the existing 2026-04-29 entry, preserving reverse-chronological order):**

```
### Completed and verified
- [x] **Cactus Rate Provider Agreement v1.0-FINAL drafted, styled, and
      delivered to Shipgrid (2026-05-06):** Fifth Cactus standard
      contract template. Covers wholesale carrier-rate suppliers
      (e.g., Shipgrid). Distinct from BD Partner Agreement (referral
      partners) and from `partners` table per DN-10 (WMS rev-share).
      Supports two compensation models (Margin Share / Flat Wholesale)
      and two Authentication Mechanisms (Scoped Access Token /
      WMS Tokenized Credential Placement) elected per relationship and
      per Carrier. Section 6 invoicing and payment terms branch by
      Authentication Mechanism. Insurance section was removed before
      delivery. Stored as
      Cactus_Rate_Provider_Agreement_v1.0-FINAL.docx in
      cactus_dev/legal/templates/. Document is 16 pages, styled to
      match Cactus_MSA_Template_v3 visual conventions. Full design
      rationale and schema implications captured in DN-19 (see
      cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md).
- [x] **Cactus MSA Template v4 — conditional shipment reporting clause
      added (2026-05-06):** New Section 4(i) added to MSA template to
      support clients using a Rate Provider via WMS Tokenized
      Credential Placement. Conditional structure: activates by
      written notice from Cactus identifying a Rate Provider service
      requiring Shipment Reporting. Required fields: tracking number,
      Carrier, service level, ship date, package weight, package
      dimensions, ship-to ZIP/country, zone, total marked-up label
      cost. Daily or weekly cadence. Stored as
      Cactus_MSA_Template_v4.docx in cactus_dev/legal/templates/; v3
      preserved alongside. Existing executed MSAs continue to operate
      as v3 (no retroactive amendment required).
- [x] **Business decision: counsel review skipped pre-execution for
      first Shipgrid signing (2026-05-06):** Sawyer determined the
      commercial value of executing the Rate Provider Agreement before
      tomorrow's introduction call outweighed the residual legal risk.
      Specific accepted risks: Section 7.7 liquidated damages
      enforceability under Utah law (especially the 7.7(b) comparable-
      account methodology), Section 12 liability cap structure under
      Utah unconscionability doctrine, and Section 7.2(b) deemed-
      approval mechanism construction. Mitigations: signing as Founder
      of Cactus Logistics LLC (LLC liability protection); insurance
      section removed so Cactus is not in immediate breach for lack of
      GL/Cyber/E&O coverage; agreement is intended to be attorney-
      reviewed post-execution and any changes handled via amendment
      with Shipgrid consent.
```

Confirm placement before saving — the three new entries should appear in this order at the top of the Completed list (most-recent first), with the existing 2026-04-29 entry remaining as the fourth-newest entry.

---

## Edit 4 of 4 — Add lean DN-19 stub to the briefing

**Find this exact text** (the cleaned-up version from Edit 2):

```
**No substantive legal change** is introduced by either of these
moves. The substantive v3 changes are in the BD Partner Agreement
(self-contained Confidentiality, Marketing/Branding, Mutual
Indemnification) — see Section 22.11 of this briefing for the
architectural rationale. (Note: DN-19 is now used for the Rate
Provider Agreement architecture; see below.)
```

**Append directly after that paragraph (before the `---` divider that precedes Section 13):**

```

### DN-19 — Rate Provider Agreement Architecture

**Status:** RESOLVED 2026-05-06 — Rate Provider Agreement v1.0-FINAL
delivered to Shipgrid. Pending one-time Utah business attorney
review (pre-execution review skipped per accepted-risk decision; see
Section 12 Completed entry).

**Full design rationale and schema implications:** see
`cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md`.
This stub captures only the facts future Claude needs at session
bootstrap.

**What the agreement covers.** Wholesale carrier-rate suppliers
(e.g., Shipgrid) who provide carrier services on a wholesale basis
for Cactus to resell to Cactus Customers under Cactus's brand and
billing.

**Naming.** Use `rate_providers` for the schema table — distinct
from the existing `partners` table (DN-10, WMS rev-share). Both can
apply to a single carrier account: `org_carrier_accounts.partner_id`
references the WMS that prints the label;
`org_carrier_accounts.rate_provider_id` references the rate source.
Both nullable.

**Schema branches the future rate-providers schema must honor:**

(1) **Compensation Model** — `compensation_model_enum: MARGIN_SHARE,
FLAT_WHOLESALE`. Quarterly margin reconciliation report runs only
for MARGIN_SHARE; FLAT_WHOLESALE has no reconciliation and no
aggregate data exchange.

(2) **Authentication Mechanism** —
`authentication_mechanism_enum: SCOPED_ACCESS_TOKEN,
WMS_TOKENIZED_CREDENTIAL_PLACEMENT, OTHER`. Default at the
rate-provider level; override capability at per-carrier and
per-customer level.

(3) **Label-generation code path branches by Authentication
Mechanism.** Pattern A (SCOPED_ACCESS_TOKEN) goes through Rate
Provider's API. Pattern B (WMS_TOKENIZED_CREDENTIAL_PLACEMENT)
does NOT go through Cactus at all — labels are generated in the
3PL's WMS. Cactus's rating engine should not call Rate Provider's
API for Pattern B shipments.

(4) **Shadow Ledger blind-spot weighting.** MARGIN_SHARE provides
partial Carrier-billed cost calibration via quarterly aggregate
reconciliation. FLAT_WHOLESALE provides no Carrier-billed cost
visibility — flag as data-incomplete in PLD Engine prediction
calibration.

(5) **Billing engine branches by Authentication Mechanism.** Pattern
A: weekly invoicing, 4-cycle Pre-Payment Period graduating to NET 15.
Pattern B: post-Carrier-invoice invoicing, static Security Deposit
equal to one week of estimated Carrier-billed cost held at the
rate-provider relationship level, NET 15 from invoice receipt with
no pre-payment period.

(6) **New Shipment Report ingestion pipeline needed for Pattern B.**
Periodic ingestion job in Alamo accepting shipment reports from 3PL
clients (CSV, JSON, or API push), validating required fields per
Section 3.6 of the agreement, forwarding to the relevant Rate
Provider. New Stage of work distinct from the rate-providers schema
work.

(7) **Lead-table integration.** New
`lead_rate_provider_registrations` child table will hang off the
existing `leads` table to track prospect approval mechanism (12-month
Prospect Protection Period clock, renewals, withdrawals, conversion
events). Add new value `RATE_PROVIDER` to existing
`lead_source_type_enum` for the rare case where a Rate Provider
directly refers a lead.

**MSA cross-impact.** MSA bumped to v4 with conditional Section
4(i) Shipment Reporting clause that activates by written notice
from Cactus identifying a Pattern B Rate Provider service. See the
corresponding Section 12 Completed entry.

**Insurance section status.** Removed from v1.0-FINAL because
Cactus has no insurance in force. To be added back when Cactus
secures GL/Cyber/E&O coverage; will require amendment to any then-
existing Rate Provider Agreement(s).
```

Confirm placement before saving — DN-19 should appear immediately after the cleaned-up DN-18 paragraph (from Edit 2) and before the `---` divider that precedes Section 13.

---

## File creation — `cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md`

Create the `design-notes/` folder in `cactus_dev/` if it does not yet exist. Then create the following file inside it. The filename is significant: `DN-{number}-{kebab-case-short-title}.md`. This convention should be followed for all future extracted design notes.

**File path:** `cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md`

**File contents (verbatim):**

```markdown
# DN-19 — Rate Provider Agreement Architecture

**Status:** RESOLVED 2026-05-06 — Rate Provider Agreement v1.0-FINAL drafted, styled to match MSA conventions, and delivered to Shipgrid for signature on the same day. Pending one-time Utah business attorney review (Sawyer accepted risk of pre-execution review skip).

**Briefing reference:** Lean DN-19 stub lives in `cactus-master-briefing.md` Section 12a. This file holds the full design rationale and schema implications.

---

## What this agreement covers

The Rate Provider Agreement covers a contractual relationship type that none of the prior four Cactus templates addressed: wholesale carrier-rate suppliers (e.g., Shipgrid) who provide carrier services for Cactus to resell to Cactus Customers under Cactus's brand and billing. This relationship is structurally different from BD Partners (referral partners earning commissions on Cactus sales) and required a separate template type rather than an extension of BD Partner Agreement v3.

## Naming distinction

The codebase already uses a `partners` table for WMS rev-share partners under DN-10. Rate Providers are a different relationship type entirely — wholesale carrier-rate suppliers, not WMS platforms. When the rate-providers schema is built (queued after the Shipgrid conversation outcomes are known), it must use the table name `rate_providers` to avoid overloading the existing `partners` concept.

Both concepts may apply to a single carrier account: `org_carrier_accounts.partner_id` would reference the WMS that prints the label (e.g., Warehance, per DN-10), and a new `org_carrier_accounts.rate_provider_id` would reference the rate source (e.g., Shipgrid). Both columns nullable since most accounts have one or neither.

## Non-circumvention restricted period

24 months for Customers, 12 months for prospects. BD Partner Agreement uses a 12-month tail (DN-16) because referral partners have less ongoing relationship leverage. Rate providers carry materially more circumvention risk — they sit inside the shipment flow, see customer volumes, see merchant rates, and have an existing direct-sales motion. 24 months for converted Cactus Customers is the common B2B wholesale-supplier standard. 12 months for un-converted prospects mirrors standard channel-program deal-registration windows.

## Mutual non-circumvention

Cactus is also restricted from soliciting rate-provider-introduced carrier relationships direct. Rate Provider is restricted from poaching Cactus Customers and Approved Prospects; Cactus is restricted from using the partnership as reconnaissance to go around Rate Provider to the underlying carriers. Mutual restrictions enforce better than one-sided ones, both legally and culturally.

## Prospect approval and protection mechanism

Cactus's actual go-to-market is to use Rate Provider rates as lead bait to win net-new prospects, meaning the entity being protected from circumvention is typically not yet a Cactus Customer at the moment of greatest poaching risk. The template addresses this with a deal-registration mechanism modeled on standard B2B channel partner programs (Cisco, Salesforce, AWS):

- Cactus emails Rate Provider with a prospect's legal entity name and warehouse address requesting permission to engage
- Rate Provider responds in writing within 48 hours during business hours (4 calendar day cap) either approving or declining on one of three limited grounds (documented pre-existing relationship, active sales engagement predating the request, appearance on published exclusion list)
- Failure to respond deems the prospect approved
- Once approved, the prospect is assigned to Cactus for a 12-month Prospect Protection Period
- Cactus may renew for additional 12-month periods on written request showing evidence of active engagement
- Cactus must provide withdrawal notice when no longer pursuing

## Two protection clocks running in parallel

The 12-month Prospect Protection Period from approval and the existing 24-month Restricted Period from Agreement termination that applies to converted Customers are independent. For prospects that convert quickly, the Customer clock dominates over the long arc. For prospects that convert late or never convert, the Prospect clock provides the relevant protection during the sales cycle.

## Three-tier liquidated damages structure

Three formulas matching three breach categories:
- 24x trailing-twelve-month margin for Introduced Customer breaches
- 12x comparable-account margin for Approved Prospect breaches that have not converted (necessary because un-converted prospects have no trailing margin history)
- 12x trailing-twelve-month margin for Cactus's Section 7.5 Carrier-side breaches (parallel structure for symmetric enforcement)

Counsel review is flagged in the template for the comparable-account methodology under 7.7(b), as it is the most novel of the three and most exposed to challenge as overly speculative.

## Cactus as sole billing party

Rate Provider invoices Cactus only; never invoices Cactus Customers. NET 15 payment terms (more aggressive than the per-carrier NET terms Cactus offers its own clients in the MSA, reflecting wholesale-supplier convention). All Cactus Customer billing flows through Cactus regardless of which Rate Provider supplied the underlying carrier capacity.

## Cactus pricing discretion preserved

Section 5.3 mirrors the DN-14 markup-confidentiality stance: Rate Provider acknowledges that Cactus's customer-facing pricing methodology is Cactus Confidential Information and is not subject to Rate Provider audit, disclosure, or approval. Wholesale Rate is what Rate Provider invoices Cactus; Cactus's markup above that is Cactus's business.

## Dual compensation model architecture

The agreement supports two compensation models, elected at execution under Section 5.1 by the parties checking one of two boxes:

- **Margin Share Model:** Wholesale Rate set to maintain approximately 50/50 gross margin split, verified by quarterly aggregate reconciliation under Section 5.6
- **Flat Wholesale Model:** Wholesale Rate is the final wholesale price, no reconciliation, no aggregate data exchange, no Carrier-billed cost disclosure obligation, governed by Section 5.7

Both models share the same universal sections for Wholesale Rates, Cactus Pricing Discretion, Rate Adjustments, and Wholesale Rate Confidentiality (Sections 5.2 through 5.5). Shipgrid is signing under Margin Share Model; different rate providers will rationally prefer different models depending on their carrier portfolio's competitive positioning.

### Schema implications of dual compensation model

The future `rate_providers` table needs a `compensation_model` column with a new enum: `compensation_model_enum: MARGIN_SHARE, FLAT_WHOLESALE`. The model is selected at rate provider onboarding time and matches the Section 5.1 election in the executed agreement. Modifying the model after onboarding requires a written amendment per the agreement, so the column should be guarded with write-once semantics or audit-logged amendment events.

The quarterly margin reconciliation report — which would be a new Alamo operational tool that exchanges aggregate data with rate providers and computes the gross margin split — runs only for rate providers where `compensation_model = MARGIN_SHARE`. For rate providers where `compensation_model = FLAT_WHOLESALE`, no reconciliation report is generated and no aggregate data exchange is required.

### Shadow Ledger blind-spot per compensation model

Under MARGIN_SHARE, Cactus learns aggregate Carrier-billed cost quarterly through the reconciliation, which provides partial calibration data for the Shadow Ledger. Under FLAT_WHOLESALE, Cactus never sees Carrier-billed cost at any granularity, creating a complete blind spot in the Shadow Ledger for shipments routed through that rate provider. The PLD Engine's prediction calibration tooling should flag rate providers under FLAT_WHOLESALE as data-incomplete sources and weight their contribution accordingly.

## Dual Authentication Mechanism architecture

Section 3.5 supports two Authentication Mechanisms by which Rate Provider grants Cactus and Cactus Customers functional access to Carrier services, with the specific mechanism elected per Carrier (and per Cactus Customer where they differ from the Carrier-level default) in Schedule B:

- **Scoped Access Token (Pattern A):** Rate Provider issues a token to Cactus, Cactus calls Rate Provider's API for rating and label generation. Cactus is the real-time transaction conduit. Cactus learns Wholesale Rates at rating time, has full per-shipment data, generates labels through Rate Provider's API. Standard wholesale aggregator pattern.

- **WMS Tokenized Credential Placement (Pattern B):** Rate Provider directly enters Carrier Account Credentials into the tokenized credential vault of a Cactus Customer's WMS (e.g., Warehance, Packiyo). The Cactus Customer transacts with the Carrier directly through their WMS. Neither Cactus nor Rate Provider is in the real-time transaction path. Per-shipment data flows to both parties via Shipment Reports (3PL → Cactus → Rate Provider on a daily or weekly cadence). Carrier invoice to Rate Provider is the authoritative source for what shipped and what was billed. Shipgrid's first client engagement uses this pattern through Warehance.

The two patterns coexist in a single Rate Provider relationship — different Carriers within the same relationship can use different mechanisms, and different Cactus Customers within the same Carrier can also use different mechanisms. Schedule B captures the per-Carrier and per-Customer election.

### Schema implications of dual Authentication Mechanism

The future `rate_providers` table needs an `authentication_mechanism_default` column at the rate-provider level (typed similarly: `authentication_mechanism_enum: SCOPED_ACCESS_TOKEN, WMS_TOKENIZED_CREDENTIAL_PLACEMENT, OTHER`), with override capability at the per-carrier and per-customer level via `org_carrier_accounts.authentication_mechanism` nullable column.

The label-generation code path branches on Authentication Mechanism:
- Pattern A goes through Rate Provider's API (existing rating engine and label purchase flow)
- Pattern B does NOT go through Cactus at all (label generation happens in the 3PL's WMS). Cactus's rating engine should NOT attempt to call Rate Provider's API for shipments where the active Authentication Mechanism is `WMS_TOKENIZED_CREDENTIAL_PLACEMENT` — instead, Cactus captures the resulting shipment via the Shipment Report ingestion pipeline.

### Shipment Report ingestion pipeline (new work)

A new periodic ingestion job in Alamo is needed to accept shipment reports from 3PL clients (CSV, JSON, or API push), validate required fields (tracking number, Carrier, service level, ship date, package weight, package dimensions, ship-to ZIP/country, zone, total marked-up label cost), and forward to the relevant Rate Provider per Section 3.6 of the agreement. This is a new Stage of work distinct from the rate-providers schema work.

### Billing engine branches per Authentication Mechanism

- Pattern A: weekly invoicing, 4-cycle Pre-Payment Period graduating to NET 15
- Pattern B: post-Carrier-invoice invoicing (Rate Provider invoices Cactus within 5 business days after receiving the Carrier invoice), static Security Deposit equal to one week of estimated Carrier-billed cost held at the rate-provider relationship level, NET 15 from invoice receipt with no pre-payment period

## Wind-down for customer continuity

90 days. Asymmetric to DN-16's 12-month BD Partner tail. Different reasoning: this protects Cactus's downstream customer commitments (a 3PL whose shipments suddenly stop working creates major MSA exposure for Cactus). 90 days gives Cactus time to migrate the affected customers to alternative carrier sources without breaking service. Wind-down does not apply if Rate Provider terminates for Cactus's uncured material breach.

## Insurance section removed from v1.0-FINAL

The v1 draft included a Section 11 Insurance clause requiring Cactus to maintain $1M/$2M GL, $1M Cyber, $1M E&O. Sawyer determined that Cactus does not currently hold any of these policies, so signing with the insurance clause would put Cactus in immediate breach. The clause was removed from v1.0-FINAL prior to delivery to Shipgrid. Sections 11 through 16 of the original draft renumbered to 11 through 15 of the executed version. When Cactus secures GL/Cyber/E&O coverage, the insurance clause should be added back to the template (likely as a Section 16 if no other content shifts) and made part of any future Rate Provider Agreement amendment with Shipgrid (and a default in any new Rate Provider relationships).

## MSA cross-impact (separate template)

Pattern B requires the 3PL Cactus Customer to send periodic shipment reports to Cactus because Cactus is not in the real-time transaction path. This upstream obligation lives in Cactus's MSA with the 3PL, not in the Rate Provider Agreement. MSA Template was bumped to v4 to add a conditional Section 4(i) Shipment Reporting clause that activates by written notice from Cactus identifying a Pattern B Rate Provider service.

## Lead-table integration

A new `lead_rate_provider_registrations` child table will hang off the existing `leads` table (per the v1.10.0-003 leads schema migration), with:
- registration status enum
- protection-period clock (date approved, date expires)
- renewal events
- withdrawal events
- conversion events (link to converted_to_org_id when prospect signs MSA)

Sawyer also confirmed that a new `RATE_PROVIDER` value should be added to the existing `lead_source_type_enum` for the rare case where a Rate Provider directly refers a lead to Cactus.

## Operational discipline required

The 48-hour response window for prospect approval requires Rate Provider to maintain a defined inbound process. Cactus also takes on operational discipline:
- maintaining records of every approval, every renewal, every withdrawal
- tracking the conversion date for any prospect that becomes a Cactus Customer
- (for Pattern B) timely forwarding of Shipment Reports from 3PL Customers to the relevant Rate Provider

Per-prospect tracking should be added to the Alamo admin UI when the partnership goes live (likely under the new `/rate-providers/[id]/approved-prospects` sub-page); for the initial Shipgrid relationship, manual tracking in a dedicated spreadsheet or Notion database is sufficient until the integration architecture is built.

## Accepted risks of pre-execution counsel review skip

Sawyer determined the commercial value of executing the Rate Provider Agreement before the Shipgrid introduction call outweighed the residual legal risk of skipping the attorney review. Specific known and accepted risks:

1. **Section 7.7 liquidated damages enforceability** under Utah law not yet confirmed by counsel, especially the Section 7.7(b) comparable-account methodology which is the most novel of the three formulas
2. **Section 12 liability cap structure** not yet stress-tested against Utah unconscionability doctrine
3. **Section 7.2(b) deemed-approval mechanism** construction not yet confirmed as unambiguous under Utah contract law

Mitigations:
- Cactus has LLC liability protection and is signing as Founder of Cactus Logistics LLC (not personally)
- Insurance section was removed from the agreement so Cactus is not in immediate breach for lack of GL/Cyber/E&O coverage
- Agreement is intended to be attorney-reviewed post-execution and any counsel-recommended changes will be handled via amendment with Shipgrid consent
```

---

## Verification

After all four briefing edits AND file creation:

**Briefing checks:**
1. Search the briefing for `1.11.0` — expected: 1 hit (the new version header).
2. Search the briefing for `DN-19` — expected: at least 2 hits (the new design note stub header, and the cleaned-up reference in DN-18).
3. Search the briefing for `v1.0-FINAL` — expected: at least 2 hits (Section 12 Completed entry and storage filename reference).
4. Search the briefing for `cactus_dev/design-notes/DN-19` — expected: at least 1 hit in the lean DN-19 stub pointing to the full file.
5. Search the briefing for `compensation_model_enum` — expected: 1 hit in the lean DN-19 stub.
6. Search the briefing for `authentication_mechanism_enum` — expected: 1 hit in the lean DN-19 stub.
7. Briefing should be reasonably lean — DN-19 stub should be approximately 60 lines or less, not 200+ lines.

**File creation checks:**
8. New file exists at `cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md`.
9. New folder `cactus_dev/design-notes/` was created if it did not exist.
10. The new file contains the full long-form DN-19 content as specified in the "File creation" section above.

**Cross-reference check:**
11. The lean DN-19 stub in the briefing references the file path `cactus_dev/design-notes/DN-19-rate-provider-agreement-architecture.md`.
12. The full DN-19 file references the briefing for the lean stub location.

---

## Out of scope for this instruction

- **Retroactive extraction of DN-1 through DN-18** to the new `design-notes/` convention — these can be migrated when convenient, not urgent. Worth noting that the convention is now established for DN-19 forward.
- **The Rate Provider Agreement `.docx`** is already in the legal templates folder per the user's separate Cowork-driven workflow.
- **The MSA v4 `.docx`** is already in the legal templates folder per the prior Cowork instruction execution.
- **Future rate-providers schema migration** — deferred until after Shipgrid conversation outcomes are known and Schedule A and Schedule B addenda are populated.
- **Future Alamo `/rate-providers/*`, `/leads/[id]/rate-provider-registrations/*`, and Shipment Report ingestion pipeline work** — deferred to subsequent architecture sessions.
- **Insurance section reinstatement** in the Rate Provider Agreement template — deferred until Cactus secures GL/Cyber/E&O coverage.
- **Existing executed MSAs** with current Cactus clients do NOT need to be amended to v4 — the MSA v4 conditional clause only affects future MSA executions, since the obligation activates only when Cactus issues written notice identifying a Pattern B Rate Provider service.
