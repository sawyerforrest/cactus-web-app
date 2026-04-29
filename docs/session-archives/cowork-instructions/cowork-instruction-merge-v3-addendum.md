# COWORK INSTRUCTION — Merge v3 addendum into master briefing
# Date: 2026-04-29
# Operator: Sawyer (will run via Cowork)

## Files involved

- **Source (read-only):** the v1.8.0 briefing currently at
  `/mnt/user-data/uploads/cactus-master-briefing.md` (or wherever Sawyer
  keeps the canonical copy locally)
- **Addendum:** `briefing-addendum-v3-update.md` (downloaded from this
  session, containing the structured directives below)
- **Output:** updated `cactus-master-briefing.md` at v1.9.0

## What Cowork should do

The addendum file `briefing-addendum-v3-update.md` contains nine
DIRECTIVE blocks numbered 1 through 9. For each directive:

1. Find the exact target text in the briefing as described in the
   directive (REPLACE this exact text / INSERT at top of section / APPEND
   at end of section, etc.).
2. Apply the change exactly as specified in the directive.
3. Move on to the next directive.

The directives are mutually independent and can be applied in any order,
but applying them in order 1 → 9 keeps the diff easy to review.

## Specific guidance per directive

- **Directive 1** is a single-line version-header replace. Trivial.
- **Directive 2** inserts a new dense paragraph at the TOP of the
  `### Completed and verified` subsection of Section 12. Most-recent-first
  ordering is the existing convention; insertion goes immediately after
  the `### Completed and verified` heading.
- **Directive 3** has two sub-replacements (3A and 3B), both targeting
  bullets in the `### Open before first signed client` subsection of
  Section 12. Match the bullets by their bold lead-in phrase ("Book
  attorney consult" and "Set up legal@ and billing@ email aliases").
- **Directive 4** appends a new DN-18 entry at the very end of
  `## 12a. OPEN DECISIONS (DN LOG)`. Maintain one blank line between
  DN-17 and DN-18.
- **Directive 5** is a wholesale replacement of the `### 22.1 Document
  Inventory` block. The boundary on the bottom is the next `### 22.2`
  heading — replace everything from the `### 22.1` heading down to (but
  not including) `### 22.2`.
- **Directive 6** replaces a specific paragraph block within Section 22.6.
  Match the start at `**Termination tail asymmetry**` and the end at the
  closing sentence of the `**No non-compete...**` paragraph.
- **Directive 7** is a wholesale replacement of the `### 22.9` block.
  The boundary on the bottom is the next `### 22.10` heading — replace
  everything from `### 22.9` down to (but not including) `### 22.10`.
- **Directive 8** is an in-place replacement of the code block within
  Section 22.10. Surrounding prose should be preserved.
- **Directive 9** appends a new `### 22.11` subsection after the closing
  prose of Section 22.10 and BEFORE the trailing `---` separator that
  ends Section 22 (and the entire briefing).

## Verification after merge

Run these greps against the updated briefing:

```
grep -c "VERSION: 1.9.0"            # expect 1
grep -c "DN-18"                     # expect ≥ 2
grep -c "Section 22.11"             # expect ≥ 1
grep -c "legal@cactuslogistics"     # expect 0 (removed)
grep -c "billing@cactuslogistics"   # expect 0 (removed)
grep -c "Section 9.4" Section_22.6  # expect 0 in Section 22.6 specifically
grep -c "_v3.docx"                  # expect ≥ 4 (templates/folder structure)
```

If any of these fail, identify which directive didn't land and re-run
that one. The directives are idempotent on a clean file but not on a
half-merged file — clean re-run is preferred over patch-on-patch.

## Expected outcome

A v1.9.0 briefing that:
- Reflects v3 of all four templates as canonical
- Documents the dual-condition Restricted Period architecture (was
  glossed in the v1.8.0 briefing as "12 months post-term", which was
  inaccurate even at the v2 stage)
- Captures the three substantive v3 expansions (self-contained
  Confidentiality, Marketing/Branding, Mutual Indemnification) in a
  new Section 22.11
- Removes the dead legal@cactuslogistics.com / billing@cactuslogistics.com
  email alias references
- Updates all section-number cross-references to track v3's renumbering
  (Section 9.4 termination → Section 11.4 termination)
- Retains all previously-correct content untouched
