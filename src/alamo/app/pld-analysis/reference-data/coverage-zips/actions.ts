// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/coverage-zips/actions.ts
// PURPOSE: Server Actions for the GOFO Regional Coverage upload flow.
//
// Two stages, two actions:
//   1. previewGofoRegionalUpload (useActionState pattern)
//      Parses the XLSX server-side, uploads the source file to the
//      pld-uploads/coverage-zips/<uuid>.xlsx staging path, returns
//      summary/warnings/firstTenRows + stagePath so the operator can
//      review before committing.
//
//   2. commitGofoRegionalUpload (regular form action — redirects)
//      Reads the staged file from Storage by stagePath, re-parses,
//      validates the re-parse summary matches what the operator saw
//      in preview (defensive guard), calls the
//      commit_gofo_regional_upload() Postgres function via .rpc() to
//      perform the atomic dual-table TRUNCATE + INSERT, deletes the
//      stage file on success, and redirects to the page with a status
//      flash showing the row counts written.
//
// Cleanup is layered (per Senior Architect's Pause Point #3 decision):
//   - Commit success: stage file deleted immediately by this action.
//   - Cron sweep: pld-uploads-cleanup-stale runs daily at 08:00 UTC and
//     removes any stage files older than 24 hours (abandoned previews).
// ==========================================================

'use server'

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  parseGofoRegionalXlsx,
  type ParsedZipRow,
  type ParserSummary,
} from '@/lib/pld-analysis/gofo-regional-parser'

const ROUTE = '/pld-analysis/reference-data/coverage-zips'
const BUCKET = 'pld-uploads'
const PATH_PREFIX = 'coverage-zips'

// =============================================================
// Stage 1: previewGofoRegionalUpload (useActionState)
// =============================================================

export type PreviewStatus = 'idle' | 'parsing' | 'preview' | 'error'

export interface PreviewState {
  status: PreviewStatus
  errors: string[]
  warnings: string[]
  summary: ParserSummary | null
  firstTenRows: ParsedZipRow[]
  effectiveDate: string | null
  fileName: string | null
  stagePath: string | null  // path within the pld-uploads bucket once uploaded
}

export const initialPreviewState: PreviewState = {
  status: 'idle',
  errors: [],
  warnings: [],
  summary: null,
  firstTenRows: [],
  effectiveDate: null,
  fileName: null,
  stagePath: null,
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

  // Parse first — only stage the file if parse succeeds. No point storing
  // a malformed file.
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

  // Stage the file in Storage so the commit action can re-parse it without
  // requiring the operator to re-upload. The path includes a UUID to
  // prevent collisions across simultaneous operators (anticipating
  // multi-operator post-v1.5).
  const admin = createAdminSupabaseClient()
  const stagePath = `${PATH_PREFIX}/${crypto.randomUUID()}.xlsx`

  const uploadRes = await admin.storage
    .from(BUCKET)
    .upload(stagePath, arrayBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })

  if (uploadRes.error) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`Stage-file upload failed: ${uploadRes.error.message}. Re-try the upload.`],
      effectiveDate,
      fileName: fileEntry.name,
    }
  }

  // Success — the full coverageRows / zoneMatrixRows arrays are NOT
  // returned to the client. The commit action will re-fetch the stage
  // file and re-parse to produce them. Re-parse-on-commit is a
  // single-source-of-truth feature, not a bug — the parser is the only
  // place that can produce these rows.
  return {
    status: 'preview',
    errors: [],
    warnings: result.warnings,
    summary: result.summary,
    firstTenRows: result.firstTenRows,
    effectiveDate,
    fileName: fileEntry.name,
    stagePath,
  }
}

// =============================================================
// Stage 2: commitGofoRegionalUpload (redirect-on-completion)
// =============================================================

function commitErrorRedirect(msg: string): never {
  redirect(`${ROUTE}?status=error&msg=${encodeURIComponent(msg)}`)
}

export async function commitGofoRegionalUpload(formData: FormData): Promise<void> {
  // Auth check
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    commitErrorRedirect('Not authenticated.')
  }

  // Parse hidden form inputs from the preview panel
  const stagePath = String(formData.get('stage_path') ?? '').trim()
  const effectiveDate = String(formData.get('effective_date') ?? '').trim()
  const expectedCoverage = parseInt(String(formData.get('expected_coverage_rows') ?? '0'), 10)
  const expectedMatrix = parseInt(String(formData.get('expected_matrix_rows') ?? '0'), 10)

  if (!stagePath || !stagePath.startsWith(`${PATH_PREFIX}/`)) {
    commitErrorRedirect('Missing or malformed stage path. Re-upload the file.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    commitErrorRedirect('Missing or malformed effective date. Re-upload the file.')
  }
  if (!Number.isInteger(expectedCoverage) || expectedCoverage <= 0) {
    commitErrorRedirect('Missing expected coverage row count. Re-upload the file.')
  }
  if (!Number.isInteger(expectedMatrix) || expectedMatrix <= 0) {
    commitErrorRedirect('Missing expected matrix row count. Re-upload the file.')
  }

  const admin = createAdminSupabaseClient()

  // Download the staged file
  const dl = await admin.storage.from(BUCKET).download(stagePath)
  if (dl.error || !dl.data) {
    commitErrorRedirect(
      `Stage file not found at ${stagePath}. The file may have been swept by the daily cleanup cron, or the upload session expired. Re-upload to retry.`,
    )
  }

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await dl.data!.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    commitErrorRedirect(`Failed to read staged file: ${msg}`)
  }

  // Re-parse — this is the single source of truth for the row arrays.
  const result = await parseGofoRegionalXlsx(arrayBuffer!, effectiveDate)

  if (!result.ok || !result.summary) {
    // If re-parse fails after preview succeeded, something is very wrong
    // (file corruption in Storage, parser regression, etc.). Surface
    // clearly and abort.
    const detail = result.errors.slice(0, 3).join('; ')
    commitErrorRedirect(
      `Re-parse failed at commit time: ${detail}. Aborting write. Re-upload to retry.`,
    )
  }

  // Defensive: confirm the re-parse summary matches what we showed in
  // preview. If it diverged, the staged file was tampered with or the
  // parser changed between preview and commit — either way, abort.
  if (result.summary!.expectedCoverageRows !== expectedCoverage) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedCoverage} ZIPs, got ${result.summary!.expectedCoverageRows}. Aborting write. Re-upload to retry.`,
    )
  }
  if (result.summary!.expectedZoneMatrixRows !== expectedMatrix) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedMatrix} matrix rows, got ${result.summary!.expectedZoneMatrixRows}. Aborting write. Re-upload to retry.`,
    )
  }

  // Atomic dual-table write via the SECURITY DEFINER PG function.
  // Function body is one transaction; if either INSERT fails, both
  // TRUNCATEs roll back and the prior active set survives.
  const rpc = await admin.rpc('commit_gofo_regional_upload', {
    p_coverage: result.coverageRows,
    p_matrix: result.zoneMatrixRows,
  })

  if (rpc.error) {
    commitErrorRedirect(`Database write failed: ${rpc.error.message}. Prior data preserved (transaction rolled back). Re-upload to retry.`)
  }

  const written = (rpc.data ?? {}) as { coverage_rows_written?: number; matrix_rows_written?: number }
  const coverageWritten = written.coverage_rows_written ?? 0
  const matrixWritten = written.matrix_rows_written ?? 0

  // Sanity guard on the function's return values
  if (coverageWritten !== expectedCoverage || matrixWritten !== expectedMatrix) {
    commitErrorRedirect(
      `DB function reported ${coverageWritten}/${matrixWritten} rows written, expected ${expectedCoverage}/${expectedMatrix}. Investigate.`,
    )
  }

  // Layer 1 of cleanup: delete the stage file now that the commit
  // succeeded. Layer 2 (cron) will sweep any orphans tomorrow morning
  // regardless. We don't fail the commit on a delete error; the cron
  // catches stragglers.
  await admin.storage.from(BUCKET).remove([stagePath])

  revalidatePath(ROUTE)
  redirect(
    `${ROUTE}?status=success&msg=${encodeURIComponent(
      `Committed: ${coverageWritten.toLocaleString('en-US')} ZIPs and ${matrixWritten.toLocaleString('en-US')} zone matrix rows written atomically. Effective ${effectiveDate}.`,
    )}`,
  )
}
