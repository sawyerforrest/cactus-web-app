# Dev Workflow Notes

Operational notes accumulated while building the Cactus Logistics OS.
This file is for "things that surprised us once and shouldn't surprise
us again" — friction points, ritual sequences, environment quirks.

---

## Testing Claude Code worktrees pre-merge

Claude Code creates branch worktrees at `.claude/worktrees/<branch-name>/`.
These are full working copies parallel to the main checkout, but they do NOT
inherit `node_modules` or `.env.local` from the main directory.

Full ritual to test a worktree before merge:

```
cd "<repo>/.claude/worktrees/<branch-name>/src/alamo"
cp "<repo>/src/alamo/.env.local" .
npm install
npm run dev
```

After merge, the worktree gets cleaned up automatically and everything
returns to the main checkout.

Encountered first during Session C.1 (2026-04-25). Friction cost ~15 min
the first time; subsequent uses should be automatic.
