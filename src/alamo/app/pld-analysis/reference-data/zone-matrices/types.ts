// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/types.ts
// PURPOSE: Shared types + initial state for the Zone Matrices upload UI.
//
// Lives in a non-'use server' module so the const + type can be safely
// imported from a client component (UploadForm.tsx). See the
// coverage-zips/types.ts comment block for the lesson learned that
// motivates this split.
// ==========================================================

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
