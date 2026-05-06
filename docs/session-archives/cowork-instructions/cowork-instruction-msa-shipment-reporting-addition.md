# Cowork Instruction — MSA Section 4 Addition for Conditional Shipment Reporting

**Generated:** 2026-05-06
**Author session:** Cactus Senior Architect (chat session)
**Target file:** `cactus_dev/legal/templates/Cactus_MSA_Template_v3.docx`
**Output file:** `cactus_dev/legal/templates/Cactus_MSA_Template_v4.docx`
**Sequencing note:** This is an additive amendment to the MSA template that supports the Rate Provider Agreement's WMS Tokenized Credential Placement (Pattern B) authentication mechanism. The existing four-template attorney review batch should be updated to reference v4 of the MSA when this change is applied.

---

## Task

Add one new subsection to Section 4 (Client Obligations) of the Cactus MSA Template v3, creating a conditional shipment reporting obligation that activates only when a Cactus Client uses a Rate Provider service via WMS Tokenized Credential Placement. Save as v4 of the MSA template.

The addition is structured as a new lettered item at the end of Section 4's existing list (which currently runs (a) through (h)). The new item becomes (i) "Shipment Reporting (Conditional)."

---

## Edit 1 of 1 — Add new Section 4(i) Shipment Reporting

**Find this exact text at the end of Section 4 in the MSA**, which currently reads:

```
(h) Cooperate reasonably with Cactus in connection with the provision of the Cactus Services, including the resolution of disputes with Carriers.
```

**Append directly after that item, as the new item (i):**

```
(i) Where the Client uses a Rate Provider service that has been identified to Client in writing (whether in a Rate Card, a Rate Provider Service Order, or other written notice from Cactus) as requiring Shipment Reporting under the applicable Rate Provider's WMS Tokenized Credential Placement authentication mechanism, provide Cactus with periodic shipment reports on a daily or weekly cadence (as Cactus and the applicable Rate Provider determine appropriate based on volume sufficient to establish averages) covering all shipments transacted using the applicable Rate Provider's services through the Client's warehouse management system. Each such shipment report will include, at a minimum, the following fields per shipment: tracking number, Carrier, service level, ship date, package weight, package dimensions, ship-to ZIP/country, zone, and total marked-up label cost. Client's failure to provide shipment reports on the agreed cadence may, after a reasonable cure period, result in the Rate Provider's suspension of Client's access to the underlying Carrier accounts, in which case Cactus has no liability to Client for the resulting service interruption. This Section 4(i) does not apply to Clients who do not use any Rate Provider service requiring WMS Tokenized Credential Placement.
```

The new item should match the formatting of existing items (a) through (h) — same paragraph style, same indentation, same sentence-ending punctuation (period, not semicolon, since this is the final item in the list).

---

## Verification

After the edit:

1. Section 4 of the MSA should now have nine lettered items: (a) through (i).
2. Item (i) should be the new Shipment Reporting clause.
3. Items (a) through (h) should remain unchanged.
4. The remainder of the MSA document (Sections 5 through 15, signature blocks, etc.) should be unchanged.
5. Save the result as `Cactus_MSA_Template_v4.docx` in `cactus_dev/legal/templates/`.
6. Preserve `Cactus_MSA_Template_v3.docx` as the prior version (do not overwrite v3).

---

## Why this addition exists

The Cactus Rate Provider Agreement v1.0-FINAL supports two authentication mechanisms for granting Cactus Customers access to Rate Provider carrier services:

- **Scoped Access Token (Pattern A):** Cactus calls the Rate Provider's API on behalf of Cactus Customers; per-shipment data flows through Cactus's tech stack in real time.
- **WMS Tokenized Credential Placement (Pattern B):** The Rate Provider directly enters credentials into the Cactus Customer's warehouse management system vault; the Cactus Customer transacts directly with Carriers through their WMS, without Cactus or the Rate Provider in the real-time transaction path.

Under Pattern B, neither Cactus nor the Rate Provider has real-time visibility into shipment activity. The only way for both parties to receive per-shipment data on a timely basis is for the Cactus Customer to provide periodic shipment reports. Section 3.6 of the Rate Provider Agreement obligates Cactus to forward such reports to Rate Providers. This MSA addition creates the upstream obligation on the Cactus Customer's side to actually generate and send the reports.

The conditional structure ("where the Client uses a Rate Provider service that has been identified to Client in writing... as requiring Shipment Reporting") means this clause activates automatically for clients using Pattern B Rate Providers and remains dormant for all other clients. No MSA amendment is required when a 3PL is later onboarded to a Pattern B Rate Provider — the obligation activates by reference to written notice from Cactus identifying the relevant Rate Provider service.

---

## Out of scope for this instruction

- Any changes to other MSA sections (1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15) — none required
- Master briefing updates to reflect this MSA template version bump — separate instruction may be appropriate if Sawyer wants the briefing log updated
- Updates to existing executed MSAs with current Cactus clients — not required because the obligation only activates upon written notice from Cactus identifying a relevant Rate Provider service, and Cactus has discretion over whether to issue such notice; existing MSAs continue to operate as v3 unless and until amended
