# Cowork Addendum 3 — Master Briefing Final Cleanup

**Target file:** `cactus-master-briefing.md`
**Prerequisite:** First apply addenda 1 and 2.
**Purpose:** Close three remaining inconsistencies in Section 10 surfaced by post-application audit.
**Edit type:** Surgical — three targeted edits within Section 10
**Authoritative source:** Implementation brief Part 1, Section 3 (12 migration files) and Phase 1 enum spec (13 new enums)

---

## Context

Audit of the post-cowork master briefing revealed three remaining issues, all in Section 10:

1. The "New enums (v1.10.0)" list omits `weight_unit_enum`. Implementation brief Phase 1 / Migration 002 specifies 13 new enums including this one.
2. The "Key Enums" subsection shows `carrier_code_enum` with its pre-v1.10.0 values, contradicting the "New enums" entry above it that lists the five additions.
3. The v1.10.0 schema-changes block lists 4 migration filenames in shorthand. The implementation brief uses 12 numbered migration files. The two documents must agree on filenames.

These edits resolve all three.

---

## Edit 1 — Add `weight_unit_enum` to the New enums list

**Find** (within Section 10, the `### New enums (v1.10.0)` block, the line listing `fuel_markup_treatment_enum`):

```
- `fuel_markup_treatment_enum`: COMPOUND, ADDITIVE
```

**Replace with** (adds `weight_unit_enum` immediately after):

```
- `fuel_markup_treatment_enum`: COMPOUND, ADDITIVE
- `weight_unit_enum`: OZ, LB, KG
```

(Result: 12 new enums + 1 extension to existing carrier_code_enum = 13 total enum changes, matching implementation brief Phase 1.)

---

## Edit 2 — Update `carrier_code_enum` row in Key Enums subsection

**Find** (within Section 10, the `### Key Enums` subsection):

```
- `carrier_code_enum`: UPS, FEDEX, USPS, UNIUNI, GOFO, SHIPX, DHL_ECOM, DHL_EXPRESS, LANDMARK, ONTRAC, OSM
```

**Replace with:**

```
- `carrier_code_enum`: UPS, FEDEX, USPS, UNIUNI, GOFO, SHIPX, DHL_ECOM, DHL_EXPRESS, LANDMARK, ONTRAC, OSM, AMAZON, EPOST_GLOBAL, CIRRO, SPEEDX, ASENDIA
```

(Result: the canonical Key Enums reference now matches the v1.10.0 extension noted above it. No more contradiction within the same section.)

---

## Edit 3 — Replace migration file list with the 12-file numbered set

**Find** (within Section 10, the `### v1.10.0 Schema Changes (PLD Analysis Engine v1)` subsection, the "Migration files (in repo):" block):

```
Migration files (in repo):
  database/migrations/v1.10.0-pld-analysis-foundation.sql
  database/migrations/v1.10.0-pld-analysis-rls.sql
  database/migrations/v1.10.0-pld-analysis-views.sql
  database/migrations/v1.10.0-pld-analysis-seed.sql
```

**Replace with:**

```
Migration files (in repo, applied in order):
  database/migrations/v1.10.0-001-extend-carrier-enum.sql
  database/migrations/v1.10.0-002-pld-enums.sql
  database/migrations/v1.10.0-003-leads-tables.sql
  database/migrations/v1.10.0-004-zone-data.sql
  database/migrations/v1.10.0-005-rate-cards.sql
  database/migrations/v1.10.0-006-markup-strategies.sql
  database/migrations/v1.10.0-007-pld-runs.sql
  database/migrations/v1.10.0-008-pld-shipments.sql
  database/migrations/v1.10.0-009-fuel-tables.sql
  database/migrations/v1.10.0-010-rls-policies.sql
  database/migrations/v1.10.0-011-views.sql
  database/migrations/v1.10.0-012-seed-reference.sql
```

(Result: master briefing migration filenames match the implementation brief Part 1, Section 3 specification.)

---

## End-of-edit verification checklist

After applying all three edits, verify:

- [ ] `### New enums (v1.10.0)` block contains 13 entries (including the `carrier_code_enum` extension entry)
- [ ] `weight_unit_enum: OZ, LB, KG` is the last entry in the New enums block
- [ ] `### Key Enums` subsection has `carrier_code_enum` with all 16 values (11 original + 5 new)
- [ ] `### v1.10.0 Schema Changes` subsection lists 12 numbered migration files starting with `v1.10.0-001-extend-carrier-enum.sql`
- [ ] No other text changed elsewhere
- [ ] Header version still reads `1.10.0 | UPDATED: 2026-05-04` (no version bump)

---

## Notes for Cowork

- All three edits are simple text replacements, no structural changes.
- Do not bump the version. v1.10.0 still describes the spec; this addendum corrects errors in how the spec was previously transcribed into the briefing.
- The implementation brief is the authoritative source for both the enum list (Phase 1, Migration 002) and the migration file naming (Phase 1, Section 3 listing of 12 migration files). The master briefing now matches that source.

---

End of addendum.
