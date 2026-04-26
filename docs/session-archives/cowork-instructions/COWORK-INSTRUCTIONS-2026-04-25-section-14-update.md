# COWORK INSTRUCTIONS — cactus-master-briefing.md Section 14 update

**Generated:** 2026-04-25 (post-archive-folder-reorganization)
**Source chat:** Same architectural review session that produced the C.2 spec
**Target file:** `cactus-master-briefing.md`

---

## How to use this document

Hand this file to Cowork with a simple instruction like:

> "Apply the two edits described in this document to cactus-master-briefing.md."

Both edits are inside Section 14 (PROJECT STRUCTURE). The rest of the
briefing is untouched.

---

## EDIT 1 — Update the `cactus-web-app/` folder-tree block

**Location:** Inside Section 14 (PROJECT STRUCTURE), in the "cactus-web-app
folder structure" subsection. The block is wrapped in triple-backtick
code fences and begins with `cactus-web-app/`.

**Action:** Replace the entire fenced code block — from the opening
` ``` ` line through the closing ` ``` ` line — with the updated version
below. The new block adds `dev-workflow-notes.md` (currently missing
from the listing despite existing on disk) and adds `session-archives/`
with its four subfolders.

**Replacement content (verbatim, including the triple-backtick fences):**

````markdown
```
cactus-web-app/
  src/
    alamo/             ← Next.js 16.2.1 internal admin dashboard
    portal/            ← Client-facing Cactus Portal (Phase 1)
    lib/               ← Shared Supabase clients
    core/              ← Rating, billing, normalization, AI
    adapters/          ← Carrier API adapters
  database/            ← database-setup.sql, seed-data.sql, verify-data.sql
  docs/                ← Carrier API documentation + internal playbooks
    amazon-shipping/
    dev-workflow-notes.md
    dhl-ecommerce/
    dhl-express/
    fedex/
    gofo/
    landmark-global/
    schema-code-audit-checklist.md
    session-archives/  ← Sprint specs, Cowork instructions, summaries
      archive/         ← Superseded specs (kept for history)
      cowork-instructions/
      other/
      specs/           ← Active session specs handed to Claude Code
    uniuni/
    ups/
    usps/
```
````

---

## EDIT 2 — Add `session-archives/` to the "docs/ — internal playbooks" descriptive list

**Location:** Inside Section 14, immediately following the folder-tree
block updated in Edit 1, there's a subsection titled
`### docs/ — internal playbooks` containing a bulleted list with two
existing entries (one for `schema-code-audit-checklist.md`, one for
`dev-workflow-notes.md`).

**Action:** Append a new third bullet to the end of that list,
immediately after the `dev-workflow-notes.md` entry. Do not modify
the existing two entries.

**Content to append (verbatim, as a new list item with the same
indentation pattern as the existing two entries):**

```markdown
- `docs/session-archives/` — sprint-by-sprint working memory: session
  specs handed to Claude Code (`specs/`), Cowork instruction docs that
  drive briefing edits (`cowork-instructions/`), superseded specs kept
  for history (`archive/`), and miscellaneous sprint artifacts
  (`other/`). Established 2026-04-25 to keep all sprint working
  documents version-controlled alongside the codebase rather than
  scattered across Desktop. Session summaries (`SESSION-*-SUMMARY.md`)
  remain at repo root per existing convention.
```

---

## SUMMARY OF CHANGES

After Cowork completes both edits:

- Section 14's folder tree accurately reflects the docs/ contents,
  including the new `session-archives/` subtree and the previously-
  missing `dev-workflow-notes.md` file
- The "docs/ — internal playbooks" descriptive list documents the
  purpose of `session-archives/` and its four-subfolder taxonomy
  (archive, cowork-instructions, other, specs)
- Future contributors (and future-Sawyer) can read Section 14 and
  immediately understand where session work products live
