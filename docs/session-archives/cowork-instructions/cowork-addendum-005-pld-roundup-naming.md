# Cowork Addendum 5 — Master Briefing: PLD Roundup UI Naming

**Target file:** `cactus-master-briefing.md`
**Prerequisite:** Addenda 1-4 already applied
**Purpose:** Add "PLD Roundup" as the operator-facing UI label, alongside the existing internal-engineering name ("PLD Analysis Engine") and external-client-facing name ("PLD/Rate Analysis"). Three-tier naming pattern.
**Edit type:** Surgical — single replacement in Section 15

---

## Context

The Alamo sidebar previously labeled the PLD Analysis Engine as "PLD/Rate Analysis." That label is reserved for client-facing use when the Cactus Portal launches in Phase 2; using it in the Alamo (where Cactus operators work) imports an externally-oriented framing that doesn't fit the operator workflow.

"PLD Roundup" replaces "PLD/Rate Analysis" in the Alamo sidebar and other operator-facing UI elements. It fits the Cactus / Alamo Western-theme branding, captures the verb (gathering shipment data from disparate sources, herding it into one analysis), and disambiguates from the eventual client-facing portal label.

Engineering naming (folders, tables, route paths, function names) remains unchanged — code still uses `pld_analysis_*` and `src/alamo/pld-analysis/`. This addendum updates only the briefing's documentation of the naming convention.

---

## Edit 1 — Section 15 name-pair block

**Find** (within Section 15, immediately after the section heading):

```
## 15. PLD ANALYSIS ENGINE SPEC (v1)

### Internal Name: PLD Analysis Engine
### External Name (when client-facing portal launches in Phase 2): PLD/Rate Analysis

### Status
```

**Replace with:**

```
## 15. PLD ANALYSIS ENGINE SPEC (v1)

### Naming convention (three tiers)

The PLD Analysis Engine has three names depending on audience and context. Code, UI, and external-facing materials must use the right name for the right audience.

- **Engineering name: PLD Analysis Engine.** Used for the codebase, schema, file paths, function names, documentation aimed at developers, and the internal architecture vocabulary. Folders are `src/alamo/pld-analysis/` and `src/core/pld-analysis/`. Tables are `pld_analysis_*`. Routes are `/alamo/pld-analysis/...`. This name is the engineering source of truth and is stable across the lifetime of the system.

- **Operator UI name: PLD Roundup.** Used in the Alamo sidebar, page titles, breadcrumbs, button labels, and any text Cactus operators see day-to-day. Fits the Cactus / Alamo Western theme. The verb "roundup" captures the workflow: gathering shipment data from disparate prospect sources, herding it into a unified analysis. Operators see "PLD Roundup," click into operator-facing screens with that label, and never need to know about the engineering name.

- **Client-facing name: PLD/Rate Analysis.** Reserved for use when the Cactus Portal launches in Phase 2 and the engine becomes accessible to 3PL clients running their own merchant analyses (Layer 2). Client-facing PDF deliverables, marketing materials, and external sales decks use this name. Clients should not encounter "PLD Roundup" or "PLD Analysis Engine" — they see the engine through a different framing.

Practical rules:
- New UI text inside the Alamo: use "PLD Roundup."
- New code, schema, file paths: use `pld_analysis_*` / "PLD Analysis Engine."
- New marketing copy or client deliverables: use "PLD/Rate Analysis."
- When in doubt: the audience determines the name.

### Status
```

---

## End-of-edit verification checklist

After applying this edit, verify:

- [ ] Section 15 starts with `## 15. PLD ANALYSIS ENGINE SPEC (v1)` (engineering-first heading retained — appropriate for an architecture briefing)
- [ ] Immediately below, a new `### Naming convention (three tiers)` subsection lists all three names with their use cases
- [ ] Old `### Internal Name:` and `### External Name:` lines are removed (replaced by the three-tier subsection)
- [ ] `### Status` heading still follows immediately after the naming subsection
- [ ] Rest of Section 15 unchanged (CSV template, rating algorithm, run lifecycle, etc.)
- [ ] No other text changed elsewhere in the briefing
- [ ] Header version still reads `1.10.0 | UPDATED: 2026-05-04`

---

## Notes for Cowork

- Single targeted replacement. The change is bounded to the area between `## 15. ...` heading and `### Status` heading.
- This is a documentation refinement of v1.10.0 — no version bump.
- No follow-on artifacts needed (no new docs files, no schema migrations, no implementation brief patches). The only practical implementation step is renaming the sidebar entry's display text from "PLD/Rate Analysis" to "PLD Roundup," which Claude Code will do as part of the next sub-phase 2b commit per Senior Architect's instruction.

---

End of addendum.
