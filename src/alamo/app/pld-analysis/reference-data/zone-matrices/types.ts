// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/types.ts
// PURPOSE: Shared types + initial state for the Zone Matrices upload UI.
//
// Lives in a non-'use server' module so the const + type can be safely
// imported from a client component (UploadForm.tsx). See the
// coverage-zips/types.ts comment block for the lesson learned that
// motivates this split.
//
// Two service flows live on this screen:
//   - DHL eCom Domestic (multi-file, 18 per-DC XLSX, auto-resolved
//     effective_date from each file's UPDATED column) — DhlPreviewState
//   - GOFO Standard (single-file, 8 hub tabs, operator-picked
//     effective_date) — GofoPreviewState
// Both ultimately write into carrier_zone_matrices but with disjoint
// (carrier_code, service_level) scopes, so commits never trample.
// ==========================================================

export type ServiceMode = 'dhl-ecom-domestic' | 'gofo-standard'

// Per-DC summary entry surfaced in the preview panel.
export interface DcSummary {
  dc_code: string
  origin_code: string
  origin_zip3: string
  effective_date: string
  rows: number
}

export interface ZonesPreviewSummary {
  totalFiles: number
  expectedFiles: number
  totalRows: number
  distinctDestZip3s: number
  zoneDistribution: Record<string, number>  // zone (e.g., '5') → count
  resolvedEffectiveDate: string             // most recent UPDATED across files
  matrixVersion: string                     // = resolvedEffectiveDate
  dcs: DcSummary[]                          // 18 entries, in canonical order
}

// First N rows from one of the source files (we surface a few from each
// of the first 2-3 DCs in the preview).
export interface ZonesPreviewRow {
  dc_code: string
  origin_zip3: string
  dest_zip3: string
  zone: string
  updated: string
}

export type PreviewStatus = 'idle' | 'parsing' | 'preview' | 'error'

export interface PreviewState {
  status: PreviewStatus
  errors: string[]
  warnings: string[]
  summary: ZonesPreviewSummary | null
  firstRows: ZonesPreviewRow[]
  // One stage path per uploaded file. Carried into the commit form so
  // the commit action can re-fetch all 18 from Storage.
  stagePaths: string[]
  uploadUuid: string | null
}

export const initialPreviewState: PreviewState = {
  status: 'idle',
  errors: [],
  warnings: [],
  summary: null,
  firstRows: [],
  stagePaths: [],
  uploadUuid: null,
}

// Canonical 18-DC set (alphabetical) — used for filename validation
// and for preview-panel "X / 18 expected" display. Matches dhl_ecom_dcs
// table seed in v1.10.0-022.
export const CANONICAL_DC_CODES = [
  'ATL', 'BOS', 'CAK', 'CLT', 'CVG', 'DEN',
  'DFW', 'EWR', 'IAD', 'IAH', 'LAX', 'MCI',
  'MCO', 'ORD', 'PHX', 'SEA', 'SFO', 'SLC',
] as const

export type CanonicalDcCode = (typeof CANONICAL_DC_CODES)[number]

// =====================
// GOFO Standard side
// =====================

// Per-hub summary entry surfaced in the GOFO Standard preview panel.
export interface GofoHubSummary {
  hub_code: string         // 'LAX', 'JFK', 'EWR', 'ORD', 'ATL', 'DFW', 'MIA', 'SLC'
  origin_zip3: string      // gofo_hubs.primary_zip5[:3] — e.g. '900' for LAX
  rows: number             // post-aggregation ZIP3 row count for this hub (~931)
}

export interface GofoStandardPreviewSummary {
  totalTabs: number
  expectedTabs: number                       // 8
  totalRows: number                          // 7,448 expected (931 × 8)
  distinctDestZip3s: number                  // 931 expected
  zoneDistribution: Record<string, number>   // includes both numeric ('2'..'8') AND 'remote 1'..'remote 9' keys
  effectiveDate: string                      // operator-picked, ISO YYYY-MM-DD
  matrixVersion: string                      // = effectiveDate
  hubs: GofoHubSummary[]                     // 8 entries, in canonical hub order
}

// First N preview rows surfaced in the GOFO Standard preview UI.
export interface GofoPreviewRow {
  hub_code: string
  origin_zip3: string
  dest_zip3: string
  zone: string
}

export interface GofoPreviewState {
  status: PreviewStatus
  errors: string[]
  warnings: string[]
  summary: GofoStandardPreviewSummary | null
  firstRows: GofoPreviewRow[]
  // Single staged file (vs DHL's 18) — carried into the commit form so
  // the commit action can re-fetch from Storage by uploadUuid.
  stagePath: string | null
  uploadUuid: string | null
  // Echoed back so the form re-renders with the operator's last picked date
  // when validation pushes them back to the file-picker step.
  effectiveDate: string
}

export const initialGofoPreviewState: GofoPreviewState = {
  status: 'idle',
  errors: [],
  warnings: [],
  summary: null,
  firstRows: [],
  stagePath: null,
  uploadUuid: null,
  effectiveDate: '2026-04-28',
}

// Canonical 8-hub set in tab-order (matches the source workbook's tab order
// per the parser spec § 2). Used for hub-checklist rendering and preview
// validation. Live origin_zip3 values come from gofo_hubs at parse time
// per Pattern 5 — never hardcoded here.
export const CANONICAL_GOFO_HUB_CODES = [
  'LAX', 'JFK', 'EWR', 'ORD', 'ATL', 'DFW', 'MIA', 'SLC',
] as const

export type CanonicalGofoHubCode = (typeof CANONICAL_GOFO_HUB_CODES)[number]

// Default operator-picked effective date for GOFO Standard. Matches the
// publication date encoded in the GOFO Standard rate card filenames
// (4_28_PU / 4_28_drop_off) per parser spec § 6.
export const DEFAULT_GOFO_STANDARD_EFFECTIVE_DATE = '2026-04-28'
