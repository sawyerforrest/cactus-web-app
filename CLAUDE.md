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

## Schema v1.6.0 — Critical Field Names (as of 2026-04-18)

The following column names changed in v1.6.0. Always use the new names:

`final_merchant_rate` → `final_billed_rate`
  (on invoice_line_items, shipment_ledger, rate_shop_log, cactus_invoice_line_items)

The following columns no longer exist on invoice_line_items:

`markup_percentage` → use `markup_type_applied` + `markup_value_applied`
`markup_flat_fee`   → use `markup_type_applied` + `markup_value_applied`

NOTE: shipment_ledger still has `markup_percentage` and `markup_flat_fee`
columns as of v1.6.0. Session B will unify these.
NOTE: org_carrier_accounts still has `markup_percentage` and
`markup_flat_fee` columns — these are the SOURCE OF TRUTH for
admin-set carrier account markup config. Do not "rename" these.

New columns on invoice_line_items (v1.6.0):
  `markup_type_applied`   TEXT ('percentage' | 'flat')
  `markup_value_applied`  DECIMAL(10,6)
  `markup_source`         TEXT ('carrier_account' | 'rate_card')
  `is_adjustment_only`    BOOLEAN NOT NULL DEFAULT FALSE

When working in match.ts or resolve.ts, the `deriveMarkupContext()`
helper function in match.ts produces all three new markup columns
from the org_carrier_account row. Use it consistently.

## Dev Workflow
- Claude Chat: architecture, planning, teaching
- Claude Code: multi-file builds, import fixes, live codebase reads
- Cowork: briefing updates, cross-file audits, documentation
- After Claude Code changes: cherry-pick worktree to main before dev server picks up changes
- Every Claude Code session must end with git commit on the claude/* branch and explicit merge instructions in the final summary
- Never use `head: true` with admin Supabase client — use `.select('id').limit(1)` instead
- Any `.in()` filter with large arrays must be batched in chunks of 100
- Pipeline is 8 stages as of v1.6.0: Ingestion → Parsing → Matching → Dispute Resolution → Billing Calculation → Invoice Generation → Delivery → Payment
- Match (Stage 3) and Billing Calc (Stage 5) are SEPARATE in v1.6.0 architecture (still combined in match.ts as of 2026-04-18 — Session B refactors them apart)
- UPS detail invoices: Original Service Description (col 230), Shipment Date (col 117), and Shipment Delivery Date (col 122) are ALWAYS empty in production data despite being in the template. Read service_level from Charge Description (col 46) on primary FRT row. Use Transaction Date as date_shipped proxy for dark accounts.
- UPS detail invoices: dates use M/D/YY format (e.g. "3/14/26"). `parseDate()` in `app/invoices/[id]/parse/page.tsx` handles this with convention 00-49 → 2000s, 50-99 → 1900s.
- Adjustment-only lines: when a tracking number has only adjustment FRT rows (Charge Description starts with "Shipping Charge Correction" or contains "Adjustment"), the `invoice_line_items.is_adjustment_only` flag is TRUE. Variance calc is skipped for these in Match stage.
- 85-column DETAIL FORMAT is the client-facing CSV standard. BukuShip's 58-column hybrid template is DEPRECATED.

## Stack
TypeScript / Node.js / Next.js / PostgreSQL via Supabase / Anthropic Claude API / Cursor IDE
