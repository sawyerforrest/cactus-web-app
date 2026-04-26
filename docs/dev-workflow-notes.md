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

## Worktree alamo deps — install fresh, don't symlink

When testing Claude Code worktree branches that touch `src/alamo/`, the
worktree won't have `src/alamo/node_modules/` populated. The alamo
subfolder has its own `node_modules/` that lives locally (gitignored
implicitly), and Git worktrees don't carry over installed dependencies
from the main repo.

**Symlinking does not work.** Turbopack (Next.js 16's bundler) rejects
symlinks that point outside the worktree's filesystem root with the error:

> `Symlink [project]/src/alamo/node_modules is invalid, it points out of
> the filesystem root`

Even if `ls` resolves the symlink correctly, Turbopack refuses to traverse
it. Don't waste time trying.

**Correct approach: install fresh in the worktree.**

```bash
cd <worktree-path>/src/alamo
npm install
```

Takes 1-3 minutes the first time, faster on subsequent worktrees if npm's
cache is warm. The deps are local to the worktree — no symlink cleanup
needed when the worktree is removed.

**Also copy `.env.local` from the main repo:**

```bash
cp <main-repo-path>/src/alamo/.env.local .env.local
```

Without this, login and database calls will silently fail at runtime even
though the dev server starts cleanly. The Supabase keys live in
`.env.local` and aren't checked into Git.

**Verification before running tsc or dev server:**

```bash
ls node_modules | head -5    # should show @supabase, next, react, etc.
ls -la .env.local             # should show ~600-800 bytes
```

If both look good, `npm run dev` should boot cleanly and serve the
worktree's branch state at `localhost:3000`.

Discovered during Session C.2 merge prep (2026-04-26) when an initial
symlink approach failed against Turbopack. Folded into this doc to save
the next session 5+ minutes of rediscovery.
