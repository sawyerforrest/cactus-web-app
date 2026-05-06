// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/dhl-das-zips/types.ts
// PURPOSE: Shared types + initial state for the DHL DAS ZIPs upload UI.
//
// Lives in a non-'use server' module so the const + type can be safely
// imported from a client component (UploadForm.tsx). See the
// coverage-zips/types.ts comment block for the lesson learned that
// motivates this split.
//
// DAS ZIPs flow shape (per spec § 5):
//   - Single-file upload (.xlsx with one sheet "2026 DAS ZIPS")
//   - NO operator-picked effective date — auto-resolved from cell A2
//     ("Effective M/D/YYYY" → ISO YYYY-MM-DD)
//   - PreviewPanel is the smallest in sub-phase 2b: count + effective
//     date + first 10 ZIPs, no per-DC/per-hub breakdown
// ==========================================================

// Per-row preview entry — first 10 ZIPs from the source, ascending
export interface DasZipPreviewRow {
  zip5: string
}

export interface DasZipsPreviewSummary {
  totalZips: number
  effectiveDate: string                    // ISO YYYY-MM-DD, auto-resolved from cell A2
  effectiveDateRaw: string                 // raw "Effective M/D/YYYY" string from source
  source: string                           // 'DHL eCommerce DAS ZIP List XLSX'
}

export type PreviewStatus = 'idle' | 'parsing' | 'preview' | 'error'

export interface PreviewState {
  status: PreviewStatus
  errors: string[]
  warnings: string[]
  summary: DasZipsPreviewSummary | null
  firstRows: DasZipPreviewRow[]
  // Single staged file (DAS ZIPs is a single-file flow). Carried into
  // the commit form so the commit action can re-fetch from Storage.
  stagePath: string | null
  uploadUuid: string | null
}

export const initialPreviewState: PreviewState = {
  status: 'idle',
  errors: [],
  warnings: [],
  summary: null,
  firstRows: [],
  stagePath: null,
  uploadUuid: null,
}
