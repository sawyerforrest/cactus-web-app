// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/coverage-zips/actions.ts
// PURPOSE: Server Actions for the GOFO Regional Coverage upload flow.
//
// Two stages:
//   1. previewGofoRegionalUpload — parses the XLSX server-side,
//      returns summary/warnings/firstTenRows for the operator to
//      review before any DB write.
//   2. commitGofoRegionalUpload — NOT YET IMPLEMENTED. Pause point
//      #3 deliverable. Will perform the atomic two-table write
//      (TRUNCATE service_coverage_zips + gofo_regional_zone_matrix,
//      then bulk INSERT new rows from the parsed file).
//
// State carried back to the client component via useActionState.
// JSON-serializable types only — no Buffer/File objects in state.
// ==========================================================

'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  parseGofoRegionalXlsx,
  type ParsedZipRow,
  type ParserSummary,
} from '@/lib/pld-analysis/gofo-regional-parser'

export type PreviewStatus = 'idle' | 'parsing' | 'preview' | 'error'

export interface PreviewState {
  status: PreviewStatus
  errors: string[]
  warnings: string[]
  summary: ParserSummary | null
  firstTenRows: ParsedZipRow[]
  effectiveDate: string | null
  fileName: string | null
}

export const initialPreviewState: PreviewState = {
  status: 'idle',
  errors: [],
  warnings: [],
  summary: null,
  firstTenRows: [],
  effectiveDate: null,
  fileName: null,
}

export async function previewGofoRegionalUpload(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  // Auth check — the page already gates with redirect('/login'), but the
  // server action is a separate entry point.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['Not authenticated. Please sign in again.'],
    }
  }

  // Validate effective_date input
  const effectiveDate = String(formData.get('effective_date') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['Effective date is required and must be a YYYY-MM-DD value.'],
      effectiveDate,
    }
  }
  // Sanity cap: year not absurd
  const yearNum = parseInt(effectiveDate.slice(0, 4), 10)
  const thisYear = new Date().getUTCFullYear()
  if (yearNum < 2020 || yearNum > thisYear + 5) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`Effective date year ${yearNum} looks wrong (expected between 2020 and ${thisYear + 5}).`],
      effectiveDate,
    }
  }

  // Validate file input
  const fileEntry = formData.get('file')
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['No file selected. Pick a .xlsx file before clicking Upload & preview.'],
      effectiveDate,
    }
  }
  if (fileEntry.size > 10 * 1024 * 1024) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['File exceeds 10MB. The GOFO Regional ZIP list is typically ~120KB; check that this is the right file.'],
      effectiveDate,
      fileName: fileEntry.name,
    }
  }
  const ext = fileEntry.name.toLowerCase().slice(-5)
  if (ext !== '.xlsx') {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`File must be .xlsx (got "${fileEntry.name}").`],
      effectiveDate,
      fileName: fileEntry.name,
    }
  }

  // Parse
  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await fileEntry.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`Failed to read uploaded file: ${msg}`],
      effectiveDate,
      fileName: fileEntry.name,
    }
  }

  const result = await parseGofoRegionalXlsx(arrayBuffer, effectiveDate)

  if (!result.ok || !result.summary) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: result.errors,
      warnings: result.warnings,
      effectiveDate,
      fileName: fileEntry.name,
    }
  }

  // Success — return preview state. The full coverageRows / zoneMatrixRows
  // arrays are intentionally NOT returned to the client. The commit Server
  // Action (pause point #3) will receive a fresh upload of the file or
  // pull it from a staging path; the preview only needs summary + first
  // ten rows + warnings.
  return {
    status: 'preview',
    errors: [],
    warnings: result.warnings,
    summary: result.summary,
    firstTenRows: result.firstTenRows,
    effectiveDate,
    fileName: fileEntry.name,
  }
}

// commitGofoRegionalUpload — NOT YET IMPLEMENTED
// Pause point #3 will:
//   - Receive a fresh file upload (operator re-selects the same file) OR
//     pull the previously-staged file from Supabase Storage by token
//   - Re-parse to get the full coverageRows / zoneMatrixRows arrays
//   - Run a single transaction:
//       BEGIN;
//       TRUNCATE TABLE service_coverage_zips;
//       TRUNCATE TABLE gofo_regional_zone_matrix;
//       INSERT INTO service_coverage_zips ...   -- 8,361 rows
//       INSERT INTO gofo_regional_zone_matrix ... -- 66,884 rows in chunks of 1000
//       COMMIT;
//   - Redirect to the page with a success flash showing both row counts
