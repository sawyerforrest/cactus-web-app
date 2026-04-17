# Cactus Logistics OS — Claude Project Context

## Master Briefing
The full project briefing is at the repo root:
`cactus-master-briefing.md`

Read this file at the start of every session for full context on architecture, schema, financial rules, naming conventions, build state, and next steps.

## Key Paths
- Master briefing: `./cactus-master-briefing.md`
- Cursor rules / coding standards: `.cursor/rules/cactus-standards.mdc`
- Alamo (internal dashboard): `src/alamo/`
- Portal (client-facing): `src/portal/`
- Database setup: `database/database-setup.sql`
- Seed data: `database/seed-data.sql`
- Carrier API docs: `docs/` (amazon-shipping, dhl-ecommerce, dhl-express, fedex, gofo, landmark-global, uniuni, ups, usps)

## Dev Workflow
- Claude Chat: architecture, planning, teaching
- Claude Code: multi-file builds, import fixes, live codebase reads
- Cowork: briefing updates, cross-file audits, documentation
- After Claude Code changes: cherry-pick worktree to main before dev server picks up changes
- Every Claude Code session must end with git commit on the claude/* branch and explicit merge instructions in the final summary
- Never use `head: true` with admin Supabase client — use `.select('id').limit(1)` instead
- Any `.in()` filter with large arrays must be batched in chunks of 100

## Stack
TypeScript / Node.js / Next.js / PostgreSQL via Supabase / Anthropic Claude API / Cursor IDE
