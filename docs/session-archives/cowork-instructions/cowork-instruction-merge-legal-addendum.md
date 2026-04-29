# COWORK INSTRUCTION — MERGE LEGAL CONTRACTS ADDENDUM INTO MASTER BRIEFING

## Task
Merge `briefing-addendum-legal-contracts.md` into `cactus-master-briefing.md`.
This is a structured append + scattered insertion task. No content rewriting,
no paraphrasing, no creative interpretation. Copy text verbatim into the
locations specified below.

## Files involved
- **Source (read-only, do not modify):** `briefing-addendum-legal-contracts.md`
- **Target (edit in place):** `cactus-master-briefing.md`

## Step-by-step instructions

### Step 1 — Bump the version header

At the top of `cactus-master-briefing.md`, find:

```
# VERSION: 1.7.0 | UPDATED: 2026-04-25
```

Change to:

```
# VERSION: 1.8.0 | UPDATED: 2026-04-28
```

Leave all other comment-header lines unchanged.

### Step 2 — Append Section 22 to the body

In the addendum, copy everything between (and including) these two lines:

- START: `## 22. LEGAL CONTRACTS FRAMEWORK`
- END: the line just before `## DECISION NOTES — ADD TO EXISTING DN-X SECTION`

(That is, the entire Section 22 block including all subsections 22.1
through 22.10. Stop just before the `---` separator that precedes the
DECISION NOTES heading.)

Paste this block into `cactus-master-briefing.md` immediately AFTER the
existing Section 21 (Warehance WMS Integration) and BEFORE any
existing Decision Notes / DN-X section, scroll-checking that:

- Section 21's last line ends cleanly (likely a `Stage 8: Warehance
  WMS integration (wire to all 4 endpoints)` line or similar)
- A horizontal rule (`---`) separates the end of Section 21 from the
  start of Section 22
- Section 22 ends with its own horizontal rule before whatever follows

### Step 3 — Append DN-13 through DN-17 to the existing Decision Notes section

In the master briefing, find the existing DN-12 entry (it discusses
Stripe + future QuickBooks Online). DN-12 is the last existing
Decision Note.

In the addendum, copy everything between (and including) these markers:

- START: `### DN-13 — Per-Carrier NET Terms vs. Single Org-Level terms_days`
- END: the closing line of DN-17 (`...client demand justifies the build cost.`)

(That is, all five new Decision Notes: DN-13, DN-14, DN-15, DN-16,
DN-17. Stop just before the `---` separator that precedes the
ENTRY FOR SECTION 12 heading in the addendum.)

Paste this block into `cactus-master-briefing.md` immediately AFTER the
existing DN-12 and BEFORE whatever section follows the existing
Decision Notes block. Verify the resulting numbering reads
DN-1, DN-2, ..., DN-12, DN-13, DN-14, DN-15, DN-16, DN-17 in order.

### Step 4 — Add the entry to Section 12 (CURRENT BUILD STATE)

In the master briefing, locate the heading:

```
## 12. CURRENT BUILD STATE
# ← UPDATE THIS SECTION AT THE END OF EVERY SESSION
```

Below it is a `### Completed and verified` subsection that contains a
list of `- [x]` checkbox entries (most recent first or last —
follow the existing chronological convention; the most recent existing
entry appears to be `Stripe account creation + Mercury linking
(2026-04-27)`).

In the addendum, find the section starting:

```
## ENTRY FOR SECTION 12 (CURRENT BUILD STATE)
```

Copy the FIRST checkbox block (the one that begins
`- [x] **Legal contracts framework drafted (2026-04-28):**`
and ends with `...E&O/cyber liability insurance.`).

Paste it into the master briefing's `### Completed and verified`
list, in the position consistent with the existing chronological
ordering (the new entry is dated 2026-04-28, so it should land in
the correct chronological slot — likely most recent).

### Step 5 — Add the five "open before first client" items

Stay in the master briefing's Section 12. There should be a subsection
for upcoming or open items (the briefing has been seen to use
`### Next session candidates` or similar — match whatever section
header is already in use for forward-looking todos).

If there is NO existing "open" / "next" / "todo" subsection within
Section 12, create one with the heading:

```
### Open before first signed client
```

Then copy the FIVE remaining `- [ ]` checkbox items from the addendum,
starting with `- [ ] **Book attorney consult.**` and ending with
`- [ ] **Cactus E&O / cyber liability insurance quotes**...`.

Paste them as a new bulleted list under that heading.

### Step 6 — Verify and stop

Open the resulting `cactus-master-briefing.md` and verify:

1. Version header reads `1.8.0 | UPDATED: 2026-04-28`
2. Section 22 appears immediately after Section 21
3. Section 22 has subsections 22.1 through 22.10 in order
4. Decision Notes now run DN-1 through DN-17 in order, with no gaps
5. Section 12 has the new completed checkbox entry
6. Section 12 has the five new "open before first signed client" items
7. No content from the existing briefing has been deleted or modified
8. No content from the addendum has been paraphrased or summarized

DO NOT make any other edits to `cactus-master-briefing.md`. DO NOT
modify the addendum file.

If any step encounters ambiguity (e.g., Section 21 has been further
extended since the addendum was drafted, or DN-12 is no longer the
last DN, or section numbering has shifted), HALT and report the
ambiguity rather than guessing. The author will resolve manually.

When complete, report:
- Number of lines added to the briefing
- New total line count
- Resulting Section 22 location (line number range)
- Confirmation that DN sequence is contiguous

## Why this task is verbatim-copy-only

The addendum was drafted with the briefing's existing style and
structure in mind. Paraphrasing would lose precision in the legal
language (e.g., "no continuing waiver" is a specific legal-doctrine
term, not a phrase to be smoothed). Copy verbatim.
