# Derived Data Dependencies

**Status:** Living document — update with every new derivation chain
**Authority:** Master briefing Section 6, Rule 10 (Derived data must be refreshed atomically with its source)
**Audience:** Anyone modifying schema, writing migrations, or building admin UIs that touch reference data

---

## What this document is

The Cactus schema includes some tables whose data is **computed from other tables** rather than being its own source of truth. These derivation chains require operational discipline: when the source changes, the derived table must be refreshed, or the system silently goes out of sync.

This document is the index of every such chain. New derivation chains added in future migrations must update this file in the same commit.

---

## Active derivation chains (as of v1.10.0)

### Chain 1: `gofo_hub_proximity` ← `zip3_centroids`

**Computation:** Haversine distance from each ZIP3 centroid to each row in `gofo_hubs`, ranked nearest to farthest. Currently 896 ZIP3s × 7 hubs = 6,272 derived rows.

**Where the derivation is encoded:**
- Migration `database/migrations/v1.10.0-017-gofo-hub-proximity-haversine.sql` (initial compute)
- Admin UI: "Re-seed ZIP3 centroids" button at `/alamo/pld-analysis/reference-data/` chains the centroid load + Haversine recompute as a single atomic action

**What the derived table is used for:** Auto-selecting the nearest GOFO injection-point hub when a new `lead_warehouses` row is created. The selected hub is then stored on `lead_warehouses.preferred_gofo_hub` and the proximity table is no longer consulted for that warehouse.

**What happens if the derivation isn't refreshed after a source change:**
- *Existing warehouses are unaffected* — their `preferred_gofo_hub` is already stored.
- *New warehouse creation fails to auto-select a hub.* The operator sees a blank hub picker and must choose manually, instead of seeing a pre-filled "ATL (nearest)" suggestion.
- *Rating engine GOFO Regional rate lookups still work for existing warehouses* — they read from `gofo_regional_zone_matrix` keyed on the warehouse's stored hub, not from the proximity table.

**Re-seed protocol:**
1. TRUNCATE...CASCADE `zip3_centroids` (cascade clears `gofo_hub_proximity` because of FK)
2. INSERT new centroid rows into `zip3_centroids`
3. TRUNCATE (no cascade needed — already empty) `gofo_hub_proximity`
4. INSERT computed Haversine rows via `CROSS JOIN zip3_centroids × gofo_hubs` with `ROW_NUMBER() OVER (PARTITION BY zip3 ORDER BY distance_miles ASC)` for ranking

These four steps must be a single transaction or single user-visible admin action. Never expose them as separate operator-controlled steps.

**Foreign key relationship:** `gofo_hub_proximity.zip3 REFERENCES zip3_centroids(zip3) ON DELETE CASCADE`. This is correct schema design — it prevents orphans — but means TRUNCATE on `zip3_centroids` requires CASCADE keyword.

---

## Patterns related to but distinct from derivation chains

The following are NOT derivation chains, but are sometimes confused with them:

### Reference data sourced from external published documents
**Tables:** `dhl_ecom_fuel_tiers`, `gofo_remote_zip3s`, `gofo_regional_zone_matrix`, future `carrier_zone_matrices`, etc.

These ARE the source of truth in the Cactus database. They are populated from external published documents (DHL fuel PDF, GOFO published files, etc.) but no other Cactus table computes them. Re-seed discipline still applies (verify against authoritative source, don't approximate), but the failure mode is different: stale source data means the rating engine produces wrong rates, not empty derivation tables.

These tables get their own admin UIs at `/alamo/pld-analysis/reference-data/` because operators need to update them when carriers publish new schedules.

### Cached aggregations
**Tables:** `pld_analysis_runs.aggregations_internal` and `aggregations_client` JSONB columns

These are computed from `pld_analysis_shipments` rows when a run completes. They could be considered a derivation chain of one row (the run) cached over many source rows (the shipments). However:

- They are computed at a defined lifecycle moment (run completion) rather than on every source mutation
- They are immutable post-completion (per Rule 6 — `pld_analysis_shipments` is immutable when run.status = COMPLETE)
- A re-rate creates a NEW run with new cached aggregations, rather than recomputing on the same row

So in practice these don't need the Rule 10 atomic-refresh discipline — they fall under the immutability rule (Rule 6) instead. If we ever build a "recompute aggregations" admin tool (e.g., for backfilling new aggregation fields after a code change), THAT tool will need Rule 10 discipline.

### Auto-selected values stored at creation time
**Examples:** `lead_warehouses.preferred_gofo_hub` (auto-selected from `gofo_hub_proximity` at creation), future `lead_service_level_mappings` auto-suggestions

These are "snapshots" — the value is computed once at creation, stored as a normal column, and not refreshed when sources change. This is intentional. If the user manually overrides the auto-selected hub for a warehouse, we want their override to persist even if the proximity data later updates. Snapshots don't form derivation chains; they're just transient computations whose results are stored.

---

## Operational rules summary (from master briefing Rule 10)

1. Source-mutating migrations must include or be immediately followed by the derivation re-compute.
2. Admin UIs that mutate source data must chain the derivation as a single user-visible action.
3. Foreign keys with ON DELETE CASCADE on derived tables are correct (prevents orphans), but make TRUNCATE-and-reseed of the source wipe the derived table at TRUNCATE time.
4. Document each derivation chain in this file.
5. Source tables in derivation chains carry a COMMENT ON TABLE entry warning of the dependency.

---

## How to add a new chain to this document

When introducing a new derivation chain in a future migration:

1. Add a new "Chain N: derived_table ← source_table" subsection under "Active derivation chains" with: computation description, where the derivation is encoded, what the derived table is used for, what happens if not refreshed, and the step-by-step re-seed protocol.

2. Add a `COMMENT ON TABLE` to both the source and derived tables in the same migration, mirroring the patterns in `v1.10.0-018-add-derivation-comments.sql`.

3. If the chain has admin UI implications, update the relevant `/alamo/pld-analysis/reference-data/` page to atomically chain the source mutation and derivation refresh.

4. Bump the master briefing version if the new chain represents a significant architectural change (rare — this file usually evolves without briefing updates).

---

## Document history

- **v1 (2026-05-05):** Initial creation. Documents `gofo_hub_proximity ← zip3_centroids` chain. Created in response to Phase 2a build surfacing the implicit derivation discipline. Codified as Rule 10 in master briefing Section 6.

---

End of document.
