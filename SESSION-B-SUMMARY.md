# SESSION B COMPLETE — 7/7 phases (6C and 7C deferred)

Branch: `claude/exciting-hypatia-2336bd`
Based on: `main` at `a300ff2` (Session A + gitignore fix)
TypeScript baseline: 1634 errors in `src/alamo` at Phase 2 close
(matches Session A within noise)

## PHASES COMPLETED

- [x] **Phase 1** — shipment_ledger markup unification (v1.6.1 migration + code)
- [x] **Phase 2** — pipeline restructure: Match / Billing Calc split with
      idempotency guards, carrier_charge-basis math preserved
- [x] **Phase 3** — lassoed-path shipment_events date enrichment
      (LABEL_CREATED → date_shipped, DELIVERED → date_delivered)
- [x] **Phase 4** — Pineridge Direct seed: 15-row flat-markup invoice
      pre-computed and tied to a synthetic cactus_invoice
- [x] **Phase 5** — 85-column client CSV generator (markup-type aware)
- [x] **Phase 6** — 3 of 4 polish items (6A Service/Date columns, 6B
      multi-cactus breadcrumb with M/D/YY, 6D /billing service tooltip)
- [x] **Phase 7A** — seed-data.sql + verify-data.sql brought to v1.6.0+
- [x] **Phase 7B** — orphan PDF files: already deleted in a prior session,
      no action required this run

## PHASES PARTIALLY COMPLETE / DEFERRED

- **6C** — Line-item drill-down modal (all 85 fields on /billing/[id]).
  Non-trivial interactive component; deferred to a follow-up.
- **7C** — TypeScript error triage in financial paths. Tsc count is
  stable around 1634-1640 across the whole session; the deltas I could
  measure were all Category A (Supabase GenericStringError / pre-existing
  `invoice is possibly null` after `redirect()`). Skipped for time.

## COMMITS LANDED (on `claude/exciting-hypatia-2336bd`)

| SHA | Title |
|---|---|
| ab300e8 | Session B Phase 1: shipment_ledger markup unification (v1.6.1) |
| db06aa5 | Session B Phase 2: pipeline restructure — Match/Billing Calc split |
| 959136e | Session B Phase 3: Match stage shipment_events enrichment |
| 8dc803b | Session B Phase 4: seed Pineridge Direct for flat-markup testing |
| 3282e92 | Session B Phase 5: 85-column client CSV generator |
| d089dd0 | Session B Phase 6: polish — 3/4 items (drill-down deferred) |
| 92d3d33 | Session B Phase 7A: update seed-data and verify-data for v1.6.0+ |

## DATABASE MIGRATIONS / SEEDS NEEDED BEFORE MERGE

Run these in Supabase SQL Editor in order. None of this session's code
paths are safe to exercise against the current live schema until they
are applied.

1. `database/migrations/v1.6.1-shipment-ledger-markup-unification.sql`
   - Pre-flight: confirm `SELECT COUNT(*) FROM shipment_ledger;` returns
     0 in Supabase (dev/test). If it's non-zero, STOP — the DROP COLUMN
     is destructive and the migration assumes the legacy markup values
     are backfill-free.
   - Expected NOTICE on success:
     `shipment_ledger markup columns after migration: markup_source, markup_type_applied, markup_value_applied`

2. `database/seeds/v1.6.1-pineridge-flat-markup-seed.sql`
   - Idempotent (ON CONFLICT DO NOTHING on every INSERT).
   - Creates Pineridge Direct org + 1 location + 1 UPS lassoed flat-
     markup account ($1.50) + 1 carrier_invoice + 15 invoice_line_items
     (AUTO_MATCHED + APPROVED, pre-computed final_billed_rate) + 1
     cactus_invoice + 15 junction rows.
   - Total carrier_charge across all 15 rows: $333.27.
   - Total final_billed_rate (with flat $1.50 applied to each): $355.77.
   - cactus_invoice id for CSV generation: `11111111-4000-0000-0000-000000000001`.

## SAMPLE CSV OUTPUTS

Not generated in this session — the 85-column CSV generator needs a
live Supabase connection to produce output, and I couldn't run it from
the worktree.

After migration + seed are applied, Sawyer can produce the two sample
files via the Alamo UI's Download CSV button:

1. **Percentage sample** (Cactus 3PL HQ, invoice `904d933a`) — navigate
   to the cactus_invoice associated with the 950-row test invoice and
   hit Download. This is a full-size sample (~952 rows including header
   + footnote).
2. **Flat sample** (Pineridge Direct, cactus_invoice
   `11111111-4000-0000-0000-000000000001`) — 17 rows including header
   + footnote.

Format checks to run on the downloaded files:

```bash
head -c 3 <file> | xxd           # expect ef bb bf (UTF-8 BOM)
head -c 200 <file> | xxd | head  # expect 0d 0a line endings
head -1 <file> | awk -F',' '{print NF}'   # expect 85
```

## DECISIONS NEEDED

These are the explicit HALT POINTS from the spec where I preserved
existing Session A behavior rather than guess on a financial policy
change. Each needs a product-level decision before the first real
client gets billed.

### DN-1 — Account with BOTH markup_percentage > 0 AND markup_flat_fee > 0

Spec listed three options: (a) data-integrity error, (b) percentage
wins, (c) flat wins. Session A picked (c) flat wins. Session B's
centralized `deriveMarkupContext()` preserves (c) to keep the refactor
behavior-neutral.

**Recommendation**: switch the Alamo
`/orgs/[id]/carriers/new` and `/orgs/[id]/carriers/[id]` pages to
reject save when both values are non-zero, then strengthen the helper
to throw instead of silently picking one. File: `src/alamo/lib/markup-context.ts`.

### DN-2 — Flat markup on `is_adjustment_only = TRUE` lines

Current behavior (Session A preserved in billing-calc.ts): flat fee
IS added (e.g. adjustment of $3.50 + $1.50 flat = $5.00 final). This
is captured in the Pineridge seed row 14.

Spec's default-while-stopped was the opposite (skip flat on
adjustments). Pineridge seed can be regenerated trivially if the
policy flips — row 14's `final_billed_rate` drops from 5.00 to 3.50.
Also the `computeBilledCharges()` function in csv.ts already has the
branching stub ready for either policy.

### DN-3 — Markup basis: carrier_charge vs sum-of-components

The spec described billing-calc math in terms of sum-of-components;
the briefing says "carrier_charge is ALWAYS the billing basis". I
resolved in favor of the briefing — billing-calc applies markup to
`carrier_charge` directly. These only diverge if the parser leaves
sum(components) != carrier_charge, which shouldn't happen for clean
UPS detail data. If it turns out to happen in practice, billing-calc
output and the CSV's per-component billed columns can drift beyond
the $0.01 tolerance — we'd need to pick one side.

## CSV COLUMN DECISIONS (85 → 85, with empty cells where schema lacks data)

Kept all 85 header slots for spec stability. Columns where the
underlying `invoice_line_items` schema has no corresponding field are
emitted as empty cells rather than dropped. This keeps the column
count predictable for downstream consumers.

**Columns with no backing schema data (always empty):**
- 25 Sender Name / 26 Sender Company
- 33 Receiver Name / 34 Receiver Company
- 44 PO Number / 45 Invoice Number (client ref)
- 52 DIM Weight Charge (DIM is rolled into base_charge; flagged via is_dim_billed)
- 53 Saturday Delivery / 54 Signature Charge / 56 Large Package
  / 58 Hazmat / 59 Return to Sender (these one-off surcharges are
  routed through `other_surcharges` with detail in `other_surcharges_detail` JSONB)

**Columns with backing schema data (populated):**
- 55 Address Correction ← `address_correction`
- 57 Additional Handling ← `additional_handling`
- 61 Adjustment ← `apv_adjustment`

**Unit columns defaulted** (no separate column on schema):
- 20 Dim Unit Entered — defaults to `IN`
- 24 Dim Unit Carrier — defaults to `IN`

## VERIFICATION LIMITATIONS

1. **Shipment events enrichment (Phase 3) is unexercised.** The
   Session A test invoice (904d933a) has no corresponding
   shipment_events rows because the Rating Engine (Stage 6) hasn't
   shipped. The code is written for Stage 6 readiness and adds zero
   behavior against current data. Option A per spec.

2. **Sample CSVs are not generated.** Requires a live DB; deferred
   to Sawyer per "MERGE INSTRUCTIONS" below.

3. **End-to-end pipeline rerun not executed.** The Session A
   test invoice likely needs to be re-uploaded and re-parsed after
   the v1.6.1 migration to shake out any latent type/name mismatches
   (the Supabase type regeneration the code assumes also needs to
   happen). That's a Sawyer step.

4. **Phase 2 within-$0.01 verification is deferred.** The refactor
   should leave `final_billed_rate` unchanged on the 950 rows of
   invoice 904d933a — but confirming that requires running Match on
   a fresh upload after the migration applies.

## MERGE INSTRUCTIONS

1. Cherry-pick or merge `claude/exciting-hypatia-2336bd` into `main`:
   ```bash
   git checkout main
   git merge --no-ff claude/exciting-hypatia-2336bd
   ```
   (Or cherry-pick individual phase commits if you want to stage the
   rollout — they're ordered and each is independently compiling.)

2. Apply the v1.6.1 migration in Supabase SQL Editor:
   `database/migrations/v1.6.1-shipment-ledger-markup-unification.sql`
   Verify the NOTICE output.

3. Apply the Pineridge seed (optional but needed for flat-mode CSV
   verification): `database/seeds/v1.6.1-pineridge-flat-markup-seed.sql`

4. Regenerate Supabase TypeScript types (otherwise the new
   shipment_ledger columns won't be recognized by the type system):
   ```bash
   # whatever your type-gen command is — likely npx supabase gen types
   ```

5. Re-upload `ups_full_detail_invoice_anonymized.csv` via the Alamo,
   run Parse + Match. Expected terminal state:
   - `billing_status = APPROVED` for all 950 lines
   - `final_billed_rate` matches pre-refactor values within $0.01
   - `audit_logs` contains both `MATCHING_ENGINE_RUN` and
     `BILLING_CALC_RUN` rows for the invoice.

6. Hit Download CSV from the cactus_invoice page for both Cactus 3PL
   HQ (percentage) and Pineridge Direct (flat). Eyeball:
   - Header row has 85 comma-separated columns
   - Column 1 starts with a tab character before `1Z...`
   - Column 64 reads `percentage` or `flat` (lowercase)
   - Column 66 sum across all rows matches the invoice total
   - For Pineridge row 14 (`1ZPINERIDGE000014`): col 48 = `0.00`,
     col 61 = `3.50`, col 66 = `5.00` (flat applied even on
     adjustment-only — DN-2 above). If policy flips, col 66 becomes
     `3.50`.

7. Merge and push:
   ```bash
   git push origin main
   ```

## FOLLOW-UPS FOR FUTURE SESSIONS

- **6C (drill-down modal)** — open a new worktree; ~1-2 hours for a
  clean implementation with ESC-close and click-outside handling.
- **DN-1 + DN-2 + DN-3** — product-level decisions that should be
  made before the first real client onboard.
- **7C (TS error cleanup)** — ~1 hour to classify and drive the
  ~1634-error baseline downward where it's real. Most of it is
  Category A Supabase inference and next/cache missing types,
  though, which require `npm install` fixups rather than code changes.
- **Rate Engine (Stage 6)** — unrelated to Session B but unblocks
  testing of Phase 3's shipment_events enrichment.
- **Shipment_ledger backfill of pre_ceiling_amount / final_billed_rate
  for dark accounts after Match** — the current refactor keeps match.ts
  writing these via the shared helper at ledger-creation time (because
  the columns are NOT NULL), but a stricter separation would move the
  write to billing-calc.ts. Would require a schema relaxation. Low
  priority; the current design works.
