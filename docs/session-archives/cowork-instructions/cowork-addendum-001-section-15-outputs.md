# Cowork Addendum 1 — Master Briefing Section 15 Outputs Update

**Target file:** `cactus-master-briefing.md`
**Prerequisite:** First apply `cowork-master-briefing-update-pld-v1.md` (master briefing → v1.10.0)
**Purpose:** Update Section 15's "Outputs" subsection to include the three new client PDF features confirmed 2026-05-04
**Edit type:** Surgical — single targeted replacement within Section 15

---

## Edit 1 — Section 15 "Outputs (3 deliverables per run)" subsection update

**Context:** The original Section 15 replacement (in the prior cowork command) described the client PDF deliverable in general terms. Three additional client-facing features have been confirmed: Top 3 Lanes panel, Top 5 Package Weights panel, and DIM-billed callout. This edit updates the deliverable description.

**Find** (within Section 15, the "Outputs (3 deliverables per run)" subsection — the deliverable #1 block describing the Client-facing PDF):

```
1. **Client-facing PDF** (one page, polished, no margin/cost data exposed)
   - Hero metrics: total savings, savings %, packages analyzed, avg/package
   - Annualized projection (with caveat language)
   - Savings by service breakdown
   - Domestic savings by zone breakdown
   - International callout
   - Dynamic methodology footnote tailored to run parameters
   - Cactus logo header + Forest title bar (brand-aligned)
```

**Replace with:**

```
1. **Client-facing PDF** (one page, polished, no margin/cost data exposed)
   - Hero metrics: total savings, savings %, packages analyzed, avg/package
   - Annualized projection (with caveat language)
   - Savings by service breakdown
   - Domestic savings by zone breakdown
   - Top 3 destination lanes (origin ZIP3 → dest ZIP3, by shipment volume)
   - Top 5 most common package weights (with shipment count + spend)
   - DIM-billed callout (count + % of packages billed on dimensional weight)
   - International callout (when applicable)
   - Dynamic methodology footnote tailored to run parameters
   - Cactus logo header + Forest title bar (brand-aligned)
```

---

## Edit 2 — End-of-document checklist

After applying the edit above, verify:

- [ ] Section 15's "Outputs" #1 (Client-facing PDF) now lists the three new items: Top 3 destination lanes, Top 5 package weights, DIM-billed callout
- [ ] Section 15's "Outputs" #2 (per-shipment CSV) and #3 (internal margin view) are unchanged
- [ ] All other sections of the briefing remain untouched
- [ ] Header version is still 1.10.0 (this addendum does not bump version — it's a refinement of the v1.10.0 spec, not a new version)

---

## Notes for Cowork

- This is a single targeted text replacement.
- Do not change the briefing version or date — the v1.10.0 spec evolved during build planning, this is part of that v1.10.0 design loop, not a new version.
- The aggregations cache schema and the Phase 6/7 implementation specifics live in the implementation brief (PATCH-001), not the master briefing. The master briefing only describes *what* the deliverables include, not *how* they're built.

---

End of addendum.
