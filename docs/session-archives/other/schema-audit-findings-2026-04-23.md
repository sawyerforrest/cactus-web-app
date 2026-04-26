# SCHEMA-VS-CODE AUDIT — FINDINGS REPORT

**Date:** 2026-04-23 (evening)
**Auditors:** Sawyer + Claude
**Scope:** All 19 tables in the `public` schema
**Status:** COMPLETE

---

## Executive summary

**Zero silent failures found across the entire schema.** All write operations (INSERT, UPDATE, UPSERT) across all 19 tables use field names that correctly match the database schema. The Session B.1 `audit_logs` fix was the only silent-failure-class bug that existed, and it has been resolved.

This audit does NOT prove there are no other bugs — type mismatches, wrong values passed to valid columns, or logic errors are outside scope. But the specific silent-failure pattern that affected audit_logs for months (wrong column name accepted by PostgREST without error) is not present anywhere else.

One architectural finding worth noting: the schema has an intentional naming inconsistency between `locations` (clean names like `address_line1`, `postal_code`) and `invoice_line_items` (prefixed names like `address_sender_line1`, `address_sender_zip`). This is exactly what the "Schema naming convention cleanup" task (Next task item #2 in the briefing) is supposed to fix.

---

## Critical-path tables (top-tier)

### invoice_line_items — 88 columns, 14 writes (1 INSERT + 13 UPDATEs) — CLEAN ✓
### carrier_invoices — 22 columns, 8 writes (3 INSERT + 5 UPDATE) — CLEAN ✓
### shipment_ledger — 21 columns, 2 writes (2 INSERT) — CLEAN ✓
### cactus_invoices — 13 columns, 1 write (1 INSERT) — CLEAN ✓
### cactus_invoice_line_items — 6 columns, 1 write (1 INSERT) — CLEAN ✓
### audit_logs — 10 columns, 5 writes (5 INSERT) — CLEAN ✓ (B.1 fix holding)

Total: 31 writes audited across 6 critical-path tables. All field names verified against schema. No mismatches.

---

## Lower-priority tables

### organizations — 9 columns, 1 INSERT — CLEAN ✓
Fields: `name`, `org_type`, `terms_days`

### locations — 18 columns, 1 INSERT — CLEAN ✓
Fields: `org_id`, `name`, `location_type`, `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`, `is_billing_address`

### org_carrier_accounts — 14 columns, 1 INSERT — CLEAN ✓
Fields: `org_id`, `account_nickname`, `account_number`, `carrier_code`, `carrier_account_mode`, `markup_percentage`, `dispute_threshold`, `is_cactus_account`, `use_rate_card`

### carrier_invoice_mappings — 10 columns, 1 UPSERT — CLEAN ✓
Fields: `carrier_code`, `raw_header_name`, `cactus_standard_field`, `ai_suggested`, `ai_confidence_score`, `effective_date`

Total: 4 writes audited across 4 lower-priority tables. All field names verified against schema. No mismatches.

---

## Tables with zero application-code usage

Five tables exist in the schema but have no INSERT, UPDATE, UPSERT, or SELECT from application code:

| Table | Reason |
|-------|--------|
| `org_users` | Auth system not yet wired through application code |
| `meters` | USPS meter wallet (Phase 2) |
| `meter_transactions` | Same — Phase 2 |
| `rate_shop_log` | Shadow Ledger AI dataset — requires Stage 6 Rate Engine |
| `notification_preferences` | Notification system (Phase 2) |

Not bugs. Intentional — schema supports future features, today's code correctly doesn't reference them.

---

## Read-only tables (no writes from code)

Four tables have SELECT queries from code but no INSERT/UPDATE/UPSERT:

| Table | Purpose |
|-------|---------|
| `rate_cards` | Static rate card configurations |
| `shipment_events` | Event log; read by Phase 3 enrichment (not runtime-tested) |
| `carrier_invoice_formats` | Column-position templates for parser |
| `carrier_charge_routing` | Charge-code routing rules for parser |

These have reads but no writes from application code. Writes happen via seed/migrations. Not bugs.

---

## Six observations worth noting (non-bugs)

### 1. Parser doesn't populate all `dim_*` columns
Sets: `length_entered`, `width_entered`, `height_entered`, `length_carrier`, `width_carrier`, `height_carrier`
Doesn't set: `dim_weight_entered`, `dim_weight_carrier`, `dim_divisor`, `dim_increase`, `is_dim_billed`

**Relevance:** Session B.2 Change #4 (weight column restructure) addresses this. Not a new finding.

### 2. `address_sender_raw` column exists but parser doesn't populate it
Parser populates only `address_sender_normalized`. Low priority — consider populating for debugging later.

### 3. Address-column naming inconsistency (empirical confirmation)
- `locations`: clean (`address_line1`, `postal_code`)
- `invoice_line_items`: prefixed (`address_sender_line1`, `address_sender_zip`)

**Relevance:** Exactly what Next task item #2 (Schema naming cleanup) is designed to fix. Empirical confirmation the task is real work.

### 4. ⚠ Flat-markup input missing from carrier-account form
`org_carrier_accounts` INSERT via `/orgs/[id]/carriers/new` does NOT set `markup_flat_fee`. Flat-markup accounts today must be created via DB directly (how Pineridge was seeded). **Add a form field to /carriers/new before onboarding a flat-markup client.**

### 5. ⚠ `locations.normalized_address` may be NULL for admin-created locations
Form INSERT doesn't set this field. For dark matching, every location needs a normalized address. Three possibilities:
- Trigger populates it on insert
- Separate code path populates it
- Existing locations have NULL and dark matching would miss them

**Recommend verifying with:**
```sql
SELECT COUNT(*) AS total, COUNT(normalized_address) AS has_normalized FROM locations;
```

If gap exists, need to populate or add trigger before client onboarding with multi-location dark accounts.

### 6. `rate_shop_log` risk reclassification
The audit checklist listed this as highest-risk for silent failures. Empirically the table is never touched by code — can't have silent failures. The real concern is different: Shadow Ledger capability isn't being exercised. Update checklist's risk table accordingly.

---

## Recommendations

### Immediate (tonight, quick SQL)
1. Run the `locations.normalized_address` check query (Observation #5)

### Tonight or tomorrow (briefing update)
1. Mark Section 12 item #1 (Schema audit) as COMPLETE
2. Add completed-and-verified entry for tonight's audit
3. Add 2026-04-23 audit history entry to `docs/schema-code-audit-checklist.md`
4. Update checklist's "highest-risk tables" list (remove rate_shop_log from the silent-failure risk list, explain why the risk is different)

### As part of existing tasks (no new work)
1. Weight column restructure (B.2 Change #4) handles DIM column gap
2. Schema naming cleanup (Next task item #2) handles locations vs invoice_line_items naming

### Before first client onboard (new follow-ups)
1. Add flat-markup input to `/orgs/[id]/carriers/new` form
2. Resolve `locations.normalized_address` population (either trigger, code path, or manual script)
3. Consider populating `address_sender_raw` for debugging

---

## Audit history entry (for docs/schema-code-audit-checklist.md)

```markdown
| 2026-04-23 | Sawyer + Claude (full-time kickoff) | Full 19-table comprehensive sweep |
  ZERO silent failures found. All critical-path writes clean (6 tables, 31 writes).
  All low-priority writes clean (4 tables, 4 writes). 5 tables legitimately unused
  (Phase 2/3 scope). Confirmed schema naming inconsistency between locations (clean)
  and invoice_line_items (prefixed) — addressed by Next task item #2.
  Surfaced 3 new pre-onboarding follow-ups: flat-markup form field,
  locations.normalized_address population, rate_shop_log risk reclassification. |
```
