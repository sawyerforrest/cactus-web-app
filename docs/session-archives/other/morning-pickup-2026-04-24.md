# MORNING PICKUP — 2026-04-24

**You stopped last night at:** Briefing updated with schema audit completion. Four-item Next task list on main. Commit `4ceb060` pushed to origin. Two Claude Code specs sitting in your Desktop archive, ready to execute.

---

## What to do this morning

### Step 1 — Coffee, then 2-minute orient

Re-read Section 12 "Next task" of `cactus-master-briefing.md`. Confirm the 4-item plan: C.1 (schema cleanup), C.2 (flat-markup form), dark-path fix, Supabase CLI. Make sure nothing feels different than what you committed to last night.

### Step 2 — Hand C.1 to Claude Code

Open a fresh Claude Code session.
- Confirm **Opus 4.7 1M · Extra high** (bottom right)
- Confirm **main branch** + worktree toggle on
- Paste the entire contents of `~/Desktop/cactus-session-archives/cactus-session-c1-schema-naming-cleanup-spec.md`
- Hit enter, let it run

### Step 3 — Step away for ~2 hours

Claude Code will work through 10 commits. Expect halt points around:
- Pre-flight verification of legacy column names (safety check — should pass)
- Grep for references (Change 6) — may turn up files not in the spec's list
- TypeScript baseline check (may exceed +20 threshold)

If Claude Code halts, it'll report. You verify the situation before telling it to proceed.

### Step 4 — Review what it shipped

When Claude Code reports complete:
- Read each commit message in order
- Look at the diffs in Cursor
- Apply the migration (`v1.7.0-address-naming-cleanup.sql`) in Supabase SQL Editor
- Run the verification queries (Q1-Q6 in the spec)
- Run the backfill SQL for Utah Test row
- Run the optional backfill for invoice_line_items.address_sender_normalized

### Step 5 — Test before merging

```bash
cd "/Users/sawyerforrest/Documents/Developer Projects/cactus_dev/cactus-web-app/src/alamo"
npm run dev
```

Navigate to `http://localhost:3000/orgs/[some-org-id]/locations/new`. Create a test location. Query:

```sql
SELECT id, name, address_line_1, postal_code, normalized_address
FROM locations
ORDER BY created_at DESC
LIMIT 1;
```

Verify the new location has `normalized_address` populated.

### Step 6 — Merge + push

If everything checks out:

```bash
cd "/Users/sawyerforrest/Documents/Developer Projects/cactus_dev/cactus-web-app"
git checkout main
git merge --no-ff claude/[branch-name] --no-edit
git push origin main
```

### Step 7 — C.2 (after lunch if energy permits)

Hand C.2 spec to a fresh Claude Code session. Flat-markup form + list display fix. 30-45 min. Same review pattern.

---

## If something goes wrong

**Schema migration fails halfway:**
- DO NOT panic
- The migration is in a BEGIN/COMMIT block, so a mid-migration failure rolls back cleanly
- Supabase should show original column names intact
- Investigate the error message before retrying

**Claude Code reports "TypeScript baseline exceeded +20":**
- This is the halt point firing correctly
- Read its explanation of which references it missed
- If they're legitimate references Claude Code didn't know about, add to the spec's scope and let it continue
- If they're Supabase type-inference noise (expected to clear after type regen), tell Claude Code to proceed

**You get stuck on a halt point:**
- Open a new claude.ai chat if you need a second opinion
- Or: stop, document what happened, come back after lunch

---

## Files you'll need

All in `~/Desktop/cactus-session-archives/`:

- `cactus-session-c1-schema-naming-cleanup-spec.md` — hand this to Claude Code first
- `cactus-session-c2-flat-markup-form-spec.md` — after C.1 merges
- `schema-audit-findings-2026-04-23.md` — reference if you need to re-check audit context
- `cowork-briefing-update-post-schema-audit.md` — already applied; here for reference

---

## Current state summary

**Origin/main at commit:** `4ceb060`  
**Next planned commits:** Session C.1 (10 commits expected) → merge → Session C.2 (5 commits expected) → merge  

**3-week client target:** still on track if C.1 + C.2 land tomorrow and Session B.2 lands within a week after that. Stripe setup still outstanding — schedule for mid-week.

**Energy-check:** you resigned from BukuShip 2026-04-23. Full-time on Cactus day 1 was an 8-hour session. Day 2 should be more structured.
