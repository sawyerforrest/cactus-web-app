# PATCH-002 — Implementation Brief Phase 2b Admin UI Constraint

**Source:** `pld-analysis-engine-v1-implementation-brief-part1.md` Section 4 (Phase 2)
**Target version:** v1.1
**Reason:** Codify the Rule 10 (derived data atomicity) discipline into Phase 2b admin UI design. Surfaced during Phase 2a build.

This patch is additive — no removals, no replacements. Apply alongside the original brief; Claude Code should treat this patch as authoritative for Phase 2b admin UI design.

---

## Patch — Phase 2b Sub-section: Add "Derivation chain UI rules"

**Location:** Section 4 (Phase 2: Reference Data Loaders) → Sub-phase 2b (Admin Upload UIs).

**Add this new subsection** at the end of sub-phase 2b, before the acceptance criteria:

### Derivation chain UI rules (Rule 10 enforcement)

Per master briefing Rule 10 (Derived data must be refreshed atomically with its source), the admin UI must present source-and-derivation pairs as single atomic actions, never as separate operator-controlled steps.

Currently one derivation chain affects the admin UI:

**`gofo_hub_proximity` ← `zip3_centroids`**

The reference data index page MUST present "ZIP3 centroids" as a single re-seedable item with the following behavior:

1. **One button:** "Re-seed ZIP3 centroids from Census Gazetteer."
2. **No separate "Re-run Haversine" button.** Don't even surface the derivation step to the operator.
3. **Implementation:** the button handler runs both operations as a single backend transaction:
   - Phase A: TRUNCATE...CASCADE on zip3_centroids, then INSERT new centroid rows
   - Phase B: TRUNCATE on gofo_hub_proximity (already empty from CASCADE, but explicit), then INSERT computed Haversine rows
4. **Status indicators:** the UI displays a single progress bar covering both phases. Don't expose internal steps.
5. **Failure handling:** if Phase B fails, surface a banner like "Centroids loaded but proximity recompute failed. GOFO hub auto-assignment is degraded. Click here to retry the proximity compute." This is a non-blocking degradation: existing warehouses keep working with their stored `lead_warehouses.preferred_gofo_hub` values.
6. **Loading-time UX:** centroid load takes a few seconds (896 INSERTs); Haversine compute is sub-second SQL (6,272 INSERTs from a CROSS JOIN + ROW_NUMBER). Total operation should complete in under 10 seconds.

**Forbidden:** building separate `/reference-data/zip3-centroids` and `/reference-data/gofo-hub-proximity` upload pages. The proximity table is not user-editable. It is a derived cache. It does not appear as its own item on the reference data index page.

**Ok to surface:** read-only diagnostic view of `gofo_hub_proximity` rows for support purposes (e.g., "Why did warehouse X get assigned to hub Y?"). Diagnostic views are different from edit interfaces — diagnostics are fine.

### Pattern for future derivation chains

When new derived tables are introduced in v1.5+ (e.g., aggregation caches on `pld_analysis_runs`), apply the same pattern:

- Source table gets a user-facing admin UI for upload/edit/re-seed
- Derived table does NOT get its own UI
- Source UI's mutation handlers atomically chain the derivation re-compute
- Failure between source-mutation-success and derivation-success surfaces a clear "X succeeded, Y degraded" banner with a retry action

Document any new derivation chain in `docs/derived-data-dependencies.md` (file created in v1.10.0; referenced by master briefing Rule 10).

---

## End of patch

This patch should be applied alongside the original implementation brief Part 1. Claude Code reads both — original + patch — and treats the patch as authoritative for the changed sections.

— Senior Architect
2026-05-05
