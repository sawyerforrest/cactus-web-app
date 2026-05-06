# Cowork Addendum 4 — Master Briefing: Derived Data Architectural Rule

**Target file:** `cactus-master-briefing.md`
**Prerequisite:** Addenda 1, 2, 3 already applied
**Purpose:** Add a new architectural rule covering derived data tables and their refresh discipline. Surfaced during Phase 2a build when `zip3_centroids` ↔ `gofo_hub_proximity` foreign-key cascade behavior was investigated.
**Edit type:** Surgical — single addition to Section 6 (Financial OS — Non-Negotiable Rules) and a brief mention in the v1.10.0 changelog
**Errata note:** A prior version of this addendum mis-numbered the new rule as "Rule 7." Section 6 of the briefing actually contains Rules 1-9. The new rule is **Rule 10**.

---

## Context

The PLD Analysis Engine introduces the first explicit derived-data-from-source pattern in the Cactus schema: `gofo_hub_proximity` is computed from `zip3_centroids` via Haversine distance. Derivation patterns are common in production systems but require operational discipline that hasn't been formalized in the briefing yet. This addendum captures the discipline as Rule 10 alongside existing financial rules.

This addendum does not modify Rules 1-9. It appends Rule 10 as the next rule in sequence.

---

## Edit 1 — Add Rule 10 to Section 6

**Find** (within Section 6 — Financial OS — Non-Negotiable Rules, the closing paragraph of Rule 9 immediately before the section-ending `---` separator):

```
### Rule 9: Storage approach for billed values
Store raw carrier values + markup context per line item. Compute
per-charge billed values at READ time (CSV / PDF / Portal display)
from raw values × markup context.

final_billed_rate is materialized (stored) at Stage 5 because it is
the authoritative invoice total — never recomputed at read time.

Per-charge billed values are computed at display time. Bug fixes in
display logic flow through to all historical invoices without
violating immutability of invoice_line_items.

Margin = SUM(final_billed_rate - carrier_charge) GROUP BY org_id, week.
No parallel raw-cost table needed.

---
```

**Replace with** (preserves Rule 9 exactly, adds Rule 10 before the section-ending `---`):

```
### Rule 9: Storage approach for billed values
Store raw carrier values + markup context per line item. Compute
per-charge billed values at READ time (CSV / PDF / Portal display)
from raw values × markup context.

final_billed_rate is materialized (stored) at Stage 5 because it is
the authoritative invoice total — never recomputed at read time.

Per-charge billed values are computed at display time. Bug fixes in
display logic flow through to all historical invoices without
violating immutability of invoice_line_items.

Margin = SUM(final_billed_rate - carrier_charge) GROUP BY org_id, week.
No parallel raw-cost table needed.

### Rule 10: Derived data must be refreshed atomically with its source

When a table's data is computed from another table — rather than being an
independent source of truth — the two tables form a derivation chain. Source
table is the truth; derived table is a precomputed cache for query speed.

Cactus schema derivation chains:

  gofo_hub_proximity   ← zip3_centroids
    Haversine compute. Used at lead_warehouses creation time to auto-select
    nearest GOFO hub. Empty proximity table means new warehouses cannot
    auto-assign a hub (existing warehouses keep working — their hub is
    already stored on lead_warehouses.preferred_gofo_hub).

  pld_analysis_runs.aggregations_internal/_client (JSONB)
                       ← pld_analysis_shipments
    Computed at run completion. Empty aggregations after re-rate means
    PDF re-render and report views fall back to recomputing from shipments,
    which is slow but correct.

Operational discipline:

  1. Source-mutating migrations must include or be immediately followed by
     the derivation re-compute. Never leave the system in a state where
     the derived table doesn't reflect the current source.

  2. Admin UIs that mutate source data must chain the derivation as a
     single user-visible action. Don't expose "re-seed source" and
     "re-run derivation" as separate buttons — operators will run one
     and forget the other.

  3. Foreign keys with ON DELETE CASCADE on derived tables are correct
     (prevents orphans), but they make TRUNCATE-and-reseed of the source
     wipe the derived table at the moment of TRUNCATE — before the new
     source rows are inserted. This is by design but easy to forget.

  4. Document each derivation chain in
     docs/derived-data-dependencies.md. New chains added in future
     migrations must update that document in the same commit.

  5. Source tables in derivation chains carry a COMMENT ON TABLE entry
     warning of the dependency, visible at schema-introspection time.

Failure mode if violated: derived data silently goes empty or stale. No
errors are thrown. Production billing is unaffected because billing tables
don't participate in derivation chains in v1.10.0. PLD Analysis Engine
features may degrade — typically auto-assignment failures or stale report
caches — but the rating engine itself remains operational because critical
lookups (zone matrices, rate cells, warehouse hub assignments) are stored
on independent tables.

---
```

---

## Edit 2 — Note in v1.10.0 changelog subsection

**Find** (within Section 10's `### v1.10.0 Schema Changes (PLD Analysis Engine v1)` subsection, the existing block describing reference data):

```
Reference data seeded at migration time:
  - GOFO hubs: 7 rows (LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC)
  - GOFO remote ZIP3s: ~29 rows (Hawaii, Alaska, PR, VI, Guam, Military)
  - DHL eCom fuel tiers: 18 tier rows from May 2026 published schedule
  - ZIP3 centroids: ~920 rows from US Census ZCTA data
  - GOFO hub proximity: ~6,440 rows (920 ZIP3s × 7 hubs ranked)
```

**Replace with** (corrects the now-known actual row counts and adds the derivation note referencing Rule 10):

```
Reference data seeded at migration time:
  - GOFO hubs: 7 rows (LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC)
  - GOFO remote ZIP3s: 28 rows (Hawaii, Alaska, PR, USVI, Guam, Military)
  - DHL eCom fuel tiers: 18 tier rows from May 2026 published schedule
  - ZIP3 centroids: 896 rows from 2025 US Census ZCTA Gazetteer
  - GOFO hub proximity: 6,272 rows (896 ZIP3s × 7 hubs Haversine-ranked)

Derivation chain (per Rule 10):
  gofo_hub_proximity ← zip3_centroids (computed via Haversine).
  Re-seeding zip3_centroids requires re-running the Haversine compute
  in v1.10.0-017 to repopulate gofo_hub_proximity. Admin re-seed UI
  must chain both operations atomically.
```

---

## End-of-edit verification checklist

After applying both edits, verify:

- [ ] Section 6 now has 10 rules (was 9). Rule 10 appears after Rule 9 and is titled "Derived data must be refreshed atomically with its source."
- [ ] Rules 1-9 are unchanged from their pre-edit form
- [ ] Rule 10 contains the `gofo_hub_proximity ← zip3_centroids` chain documentation
- [ ] Rule 10 lists 5 numbered operational discipline points
- [ ] Section 10 v1.10.0 changelog reference data block shows correct row counts (28 GOFO remote ZIP3s, 896 ZIP3 centroids, 6,272 proximity rows)
- [ ] Section 10 changelog includes the derivation chain reference and points to "Rule 10"
- [ ] No other text changed
- [ ] Header version still reads `1.10.0 | UPDATED: 2026-05-04`

---

## Notes for Cowork

- Two edits, both within Section 6 and Section 10 respectively.
- Rule numbering is `Rule 10`, not `Rule 7`. The earlier draft of this addendum had the wrong number — that draft is superseded by this one.
- This is a documentation refinement of v1.10.0 — no version bump.
- The corrected reference data row counts in Edit 2 reflect what's actually in the database after Phase 1 + Phase 2a, replacing earlier approximate estimates.
- The new docs/derived-data-dependencies.md file is created via the implementation brief patch (delivered separately), not via this cowork command.

---

End of addendum.
