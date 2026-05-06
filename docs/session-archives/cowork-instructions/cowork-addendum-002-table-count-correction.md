# Cowork Addendum 2 — Master Briefing Table Count Correction

**Target file:** `cactus-master-briefing.md`
**Prerequisite:** First apply `cowork-master-briefing-update-pld-v1.md` and `cowork-addendum-001-section-15-outputs.md`
**Purpose:** Correct the table-count inconsistency introduced by the original cowork command. The original wrote "21 PLD tables / 40 total" but the actual table list contains 24 PLD tables (43 total).
**Edit type:** Surgical — three targeted text replacements within Section 10
**Authoritative source:** Implementation brief part 1, Section 3 (12 migration files specifying 24 distinct PLD tables)

---

## Context — why this correction is needed

The original v1.10.0 cowork command had a counting error. The "PLD Analysis Engine tables" list correctly enumerated 24 tables (matching the 12 migration files in the implementation brief), but the surrounding text said "21 tables added" and "40 TABLES — LIVE IN SUPABASE." Cowork applied the instructions verbatim and flagged the discrepancy on completion.

This addendum corrects the three locations where the count is misstated. The actual table list is left untouched — those rows match the implementation brief's migration files exactly.

---

## Edit 1 — Section 10 header

**Find:**

```
## 10. DATABASE SCHEMA (v1.10.0 — 40 TABLES — LIVE IN SUPABASE)
```

**Replace with:**

```
## 10. DATABASE SCHEMA (v1.10.0 — 43 TABLES — LIVE IN SUPABASE)
```

---

## Edit 2 — Section 10 PLD subsection header

**Find:**

```
### PLD Analysis Engine tables (21 — added v1.10.0)
```

**Replace with:**

```
### PLD Analysis Engine tables (24 — added v1.10.0)
```

---

## Edit 3 — Section 10 v1.10.0 changelog opening sentence

**Find** (within the `### v1.10.0 Schema Changes (PLD Analysis Engine v1)` subsection — first line):

```
21 new tables added to support the PLD Analysis Engine. All tables
RLS-enabled per existing convention.
```

**Replace with:**

```
24 new tables added to support the PLD Analysis Engine. All tables
RLS-enabled per existing convention.
```

---

## End-of-edit verification checklist

After applying all three edits, verify:

- [ ] Section 10 header reads `## 10. DATABASE SCHEMA (v1.10.0 — 43 TABLES — LIVE IN SUPABASE)`
- [ ] Section 10's PLD subsection header reads `### PLD Analysis Engine tables (24 — added v1.10.0)`
- [ ] Section 10's `### v1.10.0 Schema Changes` opening sentence reads `24 new tables added to support the PLD Analysis Engine.`
- [ ] No other text changed elsewhere in the briefing
- [ ] The actual PLD table list in Section 10 is **unchanged** — it should contain exactly 24 rows enumerated below for verification
- [ ] The Production tables subsection header still reads "Production tables (19 — Phase 1 Rating & Billing Engine)" — unchanged
- [ ] Header version still reads `1.10.0` — unchanged

---

## Reference: Confirmed PLD table list (24 tables)

For verification only — these should all be present in Section 10's PLD Analysis Engine tables list. Do not modify; this list is reference material:

1. `leads`
2. `lead_current_carriers`
3. `lead_warehouses`
4. `lead_service_level_mappings`
5. `global_service_level_mapping_defaults`
6. `analysis_rate_cards`
7. `analysis_rate_card_cells`
8. `markup_strategies`
9. `markup_strategy_tiers`
10. `pld_analysis_runs`
11. `pld_analysis_run_strategies`
12. `pld_analysis_run_service_mappings`
13. `pld_analysis_shipments`
14. `pld_analysis_shipment_rates`
15. `carrier_zone_matrices`
16. `carrier_country_zone_matrices`
17. `gofo_regional_zone_matrix`
18. `gofo_hubs`
19. `gofo_hub_proximity`
20. `zip3_centroids`
21. `service_coverage_zips`
22. `gofo_remote_zip3s`
23. `dhl_ecom_fuel_tiers`
24. `diesel_price_history`

19 production tables + 24 PLD tables = 43 tables total in v1.10.0.

---

## Notes for Cowork

- All three edits are simple integer substitutions: `21` → `24` (twice) and `40` → `43` (once).
- Do not modify the PLD table list rows themselves — they are correct.
- Do not bump the briefing version. v1.10.0 remains the correct version; this corrects a counting error, not a design change.
- The implementation brief (Part 1, Section 3) already specifies 24 tables across 12 migration files and is internally consistent. After this addendum, the master briefing matches the implementation brief.

---

End of addendum.
