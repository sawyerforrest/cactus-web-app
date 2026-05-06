// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/actions.ts
// PURPOSE: Server Actions for the Zone Matrices upload flows. Hosts both
//   the DHL eCom Domestic flow (multi-file, 18 per-DC XLSX) and the
//   GOFO Standard flow (single-file workbook with 8 hub tabs). The
//   service selector in UploadForm.tsx routes to the right action
//   pair based on operator choice.
//
// DHL eCom Domestic stages:
//   1. previewDhlEcomZones (useActionState, multi-file)
//      Validates the 18-file set, parses each file via the shared
//      parser, uploads each accepted file to
//      pld-uploads/zone-matrices/<upload_uuid>/<dc_code>.xlsx, returns
//      summary + first rows + warnings + stagePaths so the operator
//      can review before committing.
//
//   2. commitDhlEcomZones — re-fetches all 18 stage files from Storage,
//      re-parses, validates the re-parse summary matches preview's
//      expected counts, dispatches to v1.10.0-023's
//      commit_dhl_ecom_zones_upload() PG function for the atomic
//      scoped-DELETE + bulk INSERT, deletes the 18 stage files on
//      success.
//
// GOFO Standard stages:
//   1. previewGofoStandardZones (useActionState, single-file)
//      Validates the .xlsx + operator-picked effective date, loads
//      gofo_hubs (Pattern 5 live query for origin_zip3), parses via
//      parseGofoStandardZonesFile (single workbook → 8 hub tabs →
//      ZIP5→ZIP3 lossless aggregation → 7,448 rows), uploads to
//      pld-uploads/zone-matrices/<upload_uuid>/gofo-standard.xlsx,
//      returns summary + first rows + warnings + stagePath.
//
//   2. commitGofoStandardZones — currently STUB (pause point #4
//      deliverable). Will re-fetch the staged file, re-parse, validate
//      the re-parse summary matches preview's expected counts, dispatch
//      to v1.10.0-025's commit_gofo_standard_zones_upload() PG function
//      for the atomic scoped-DELETE + bulk INSERT, delete the stage
//      file on success.
// ==========================================================

'use server'

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  parseDhlEcomZonesFiles,
  type DcLookup,
  type FileBuffer,
} from '@/lib/pld-analysis/dhl-ecom-zones-parser'
import {
  parseGofoStandardZonesFile,
  type HubLookup,
} from '@/lib/pld-analysis/gofo-standard-parser'
import {
  initialPreviewState,
  type PreviewState,
  CANONICAL_DC_CODES,
  initialGofoPreviewState,
  type GofoPreviewState,
  CANONICAL_GOFO_HUB_CODES,
  DEFAULT_GOFO_STANDARD_EFFECTIVE_DATE,
} from './types'

const ROUTE = '/pld-analysis/reference-data/zone-matrices'
const BUCKET = 'pld-uploads'
const PATH_PREFIX = 'zone-matrices'

// Filename → DC code helper. Returns null when not parseable.
// Accepts spaces or underscores in the prefix per the canonical DHL-published
// format ("DHL eCommerce Zones Table_<DC>.xlsx") plus the underscored
// variant. Captured DC code is uppercased for lookup consistency.
function dcCodeFromFilename(name: string): string | null {
  const m = /^DHL[ _]eCommerce[ _]Zones[ _]Table_([A-Z]{3})\.xlsx$/i.exec(name)
  return m ? m[1].toUpperCase() : null
}

async function loadDcLookup(): Promise<DcLookup> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('dhl_ecom_dcs')
    .select('dc_code, origin_code, dc_zip3')
  if (error) throw new Error(`Failed to load dhl_ecom_dcs: ${error.message}`)

  const byCode = new Map<string, { origin_code: string; dc_zip3: string }>()
  for (const row of (data ?? []) as Array<{ dc_code: string; origin_code: string; dc_zip3: string }>) {
    byCode.set(row.dc_code, { origin_code: row.origin_code, dc_zip3: row.dc_zip3 })
  }
  return { byCode }
}

// =============================================================
// Stage 1: previewDhlEcomZones
// =============================================================

export async function previewDhlEcomZones(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['Not authenticated. Please sign in again.'],
    }
  }

  // Read all files from FormData. The form picker uses name="files" and
  // multiple, so getAll('files') returns each File instance.
  const fileEntries = formData.getAll('files')
  const files = fileEntries.filter((e): e is File => e instanceof File && e.size > 0)

  if (files.length === 0) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['No files selected. Pick all 18 .xlsx files in one operation.'],
    }
  }

  // Per-file extension + size guard before reading buffers
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      return {
        ...initialPreviewState,
        status: 'error',
        errors: [`File "${f.name}" is not a .xlsx. Only .xlsx accepted.`],
      }
    }
    if (f.size > 25 * 1024 * 1024) {
      return {
        ...initialPreviewState,
        status: 'error',
        errors: [`File "${f.name}" exceeds 25MB. Verify the upload is a DHL eCommerce zones .xlsx file.`],
      }
    }
  }

  // Read each file's ArrayBuffer
  const fileBuffers: FileBuffer[] = []
  for (const f of files) {
    try {
      fileBuffers.push({ name: f.name, buffer: await f.arrayBuffer() })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        ...initialPreviewState,
        status: 'error',
        errors: [`Failed to read "${f.name}": ${msg}`],
      }
    }
  }

  // Pull DC lookup from DB and run the parser
  let dcLookup: DcLookup
  try {
    dcLookup = await loadDcLookup()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`Failed to load dhl_ecom_dcs lookup: ${msg}`],
    }
  }

  if (dcLookup.byCode.size !== CANONICAL_DC_CODES.length) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [
        `dhl_ecom_dcs has ${dcLookup.byCode.size} rows; expected ${CANONICAL_DC_CODES.length}. Re-apply migration v1.10.0-022.`,
      ],
    }
  }

  const result = await parseDhlEcomZonesFiles(fileBuffers, dcLookup)

  if (!result.ok || !result.summary) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: result.errors,
      warnings: result.warnings,
    }
  }

  // Stage all 18 files in Storage so the commit action can re-parse without
  // requiring re-upload. Path namespaced by upload UUID + per-DC filename.
  const admin = createAdminSupabaseClient()
  const uploadUuid = crypto.randomUUID()
  const stagePaths: string[] = []

  for (const fb of fileBuffers) {
    const dcCode = dcCodeFromFilename(fb.name)
    if (!dcCode) {
      // Shouldn't reach here — parser already rejected unknown filenames.
      return {
        ...initialPreviewState,
        status: 'error',
        errors: [`Internal: filename "${fb.name}" couldn't be DC-code-parsed at staging time.`],
      }
    }
    const path = `${PATH_PREFIX}/${uploadUuid}/${dcCode}.xlsx`
    const upload = await admin.storage.from(BUCKET).upload(path, fb.buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })
    if (upload.error) {
      // Clean up any files we already staged from this batch — they're orphans
      // until the daily cron sweep picks them up. Best-effort cleanup; we
      // surface the original error regardless.
      if (stagePaths.length > 0) {
        await admin.storage.from(BUCKET).remove(stagePaths).catch(() => undefined)
      }
      return {
        ...initialPreviewState,
        status: 'error',
        errors: [`Stage upload failed for ${dcCode}: ${upload.error.message}. Re-try the upload.`],
      }
    }
    stagePaths.push(path)
  }

  return {
    status: 'preview',
    errors: [],
    warnings: result.warnings,
    summary: result.summary,
    firstRows: result.firstRows,
    stagePaths,
    uploadUuid,
  }
}

// =============================================================
// Stage 2: commitDhlEcomZones (regular form action — redirects)
// =============================================================

function commitErrorRedirect(msg: string): never {
  redirect(`${ROUTE}?status=error&msg=${encodeURIComponent(msg)}`)
}

export async function commitDhlEcomZones(formData: FormData): Promise<void> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    commitErrorRedirect('Not authenticated.')
  }

  // Parse hidden form inputs from the preview panel
  const uploadUuid = String(formData.get('upload_uuid') ?? '').trim()
  const expectedRows = parseInt(String(formData.get('expected_rows') ?? '0'), 10)
  const expectedFiles = parseInt(String(formData.get('expected_files') ?? '0'), 10)
  const effectiveDate = String(formData.get('effective_date') ?? '').trim()
  const matrixVersion = String(formData.get('matrix_version') ?? '').trim()

  // UUID v4 shape check — defensive against form tampering / replay against
  // a different bucket prefix.
  if (!/^[0-9a-f-]{36}$/i.test(uploadUuid)) {
    commitErrorRedirect('Missing or malformed upload UUID. Re-upload the files.')
  }
  if (!Number.isInteger(expectedRows) || expectedRows <= 0) {
    commitErrorRedirect('Missing expected row count. Re-upload the files.')
  }
  if (!Number.isInteger(expectedFiles) || expectedFiles !== CANONICAL_DC_CODES.length) {
    commitErrorRedirect(`Expected file count must be ${CANONICAL_DC_CODES.length}.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    commitErrorRedirect('Missing or malformed effective date. Re-upload the files.')
  }

  const admin = createAdminSupabaseClient()

  // Construct the 18 expected stage paths from the canonical DC list and
  // the upload UUID. Download each and re-parse via the same pure parser
  // used at preview time — single source of truth for the row data.
  const fileBuffers: FileBuffer[] = []
  for (const dcCode of CANONICAL_DC_CODES) {
    const stagePath = `${PATH_PREFIX}/${uploadUuid}/${dcCode}.xlsx`
    const dl = await admin.storage.from(BUCKET).download(stagePath)
    if (dl.error || !dl.data) {
      commitErrorRedirect(
        `Stage file missing for ${dcCode} at ${stagePath}. The files may have been swept by the daily cleanup cron, or the upload session expired. Re-upload to retry.`,
      )
    }
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await dl.data!.arrayBuffer()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      commitErrorRedirect(`Failed to read stage file for ${dcCode}: ${msg}`)
    }
    // Re-use the canonical filename so the parser's regex matches and the
    // DC code is unambiguously derived. The .xlsx upload preserved the bytes
    // verbatim — only the synthetic filename changes here.
    fileBuffers.push({ name: `DHL eCommerce Zones Table_${dcCode}.xlsx`, buffer: arrayBuffer! })
  }

  // Re-parse with the same parser + DC lookup.
  let dcLookup: DcLookup
  try {
    const { data, error } = await admin
      .from('dhl_ecom_dcs')
      .select('dc_code, origin_code, dc_zip3')
    if (error) throw new Error(error.message)
    const byCode = new Map<string, { origin_code: string; dc_zip3: string }>()
    for (const row of (data ?? []) as Array<{ dc_code: string; origin_code: string; dc_zip3: string }>) {
      byCode.set(row.dc_code, { origin_code: row.origin_code, dc_zip3: row.dc_zip3 })
    }
    dcLookup = { byCode }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    commitErrorRedirect(`Failed to load dhl_ecom_dcs lookup: ${msg}`)
  }

  const result = await parseDhlEcomZonesFiles(fileBuffers, dcLookup!)

  if (!result.ok || !result.summary) {
    const detail = result.errors.slice(0, 3).join('; ')
    commitErrorRedirect(
      `Re-parse failed at commit time: ${detail}. Aborting write. Re-upload to retry.`,
    )
  }

  // Defensive: confirm the re-parse summary matches preview's expected
  // counts. If diverged, the staged files were tampered with or the parser
  // changed between preview and commit — abort and preserve prior data.
  if (result.summary!.totalRows !== expectedRows) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedRows} rows, got ${result.summary!.totalRows}. Aborting write.`,
    )
  }
  if (result.summary!.totalFiles !== expectedFiles) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedFiles} files, got ${result.summary!.totalFiles}. Aborting write.`,
    )
  }
  if (result.summary!.resolvedEffectiveDate !== effectiveDate) {
    commitErrorRedirect(
      `Re-parse mismatch: effective_date drifted from ${effectiveDate} to ${result.summary!.resolvedEffectiveDate}. Aborting write.`,
    )
  }
  if (result.summary!.matrixVersion !== matrixVersion) {
    commitErrorRedirect(
      `Re-parse mismatch: matrix_version drifted from ${matrixVersion} to ${result.summary!.matrixVersion}. Aborting write.`,
    )
  }

  // Atomic scoped DELETE + INSERT via the SECURITY DEFINER function. Function
  // body is one transaction; if either statement fails, both roll back and
  // the prior active set survives.
  const rpc = await admin.rpc('commit_dhl_ecom_zones_upload', {
    p_rows: result.zoneMatrixRows,
  })

  if (rpc.error) {
    commitErrorRedirect(`Database write failed: ${rpc.error.message}. Prior data preserved (transaction rolled back). Re-upload to retry.`)
  }

  const written = (rpc.data ?? {}) as { matrix_rows_written?: number }
  const matrixWritten = written.matrix_rows_written ?? 0
  if (matrixWritten !== expectedRows) {
    commitErrorRedirect(
      `DB function reported ${matrixWritten} rows written, expected ${expectedRows}. Investigate.`,
    )
  }

  // Layer 1 of cleanup: delete all 18 stage files now that the commit
  // succeeded. Layer 2 (cron pld-uploads-cleanup-stale) sweeps any
  // orphans regardless. We don't fail the commit on a delete error;
  // cron catches stragglers.
  const stagePaths = CANONICAL_DC_CODES.map(dc => `${PATH_PREFIX}/${uploadUuid}/${dc}.xlsx`)
  await admin.storage.from(BUCKET).remove(stagePaths).catch(() => undefined)

  revalidatePath(ROUTE)
  redirect(
    `${ROUTE}?status=success&msg=${encodeURIComponent(
      `Committed: ${matrixWritten.toLocaleString('en-US')} DHL eCom Ground zone matrix rows across ${expectedFiles} DCs written atomically. Effective ${effectiveDate}.`,
    )}`,
  )
}

// =============================================================
// GOFO Standard — Stage 1: previewGofoStandardZones
// =============================================================

const MIN_EFFECTIVE_YEAR = 2024
const MAX_EFFECTIVE_YEAR = new Date().getUTCFullYear() + 5

interface GofoFormShape {
  errors: string[]
  effectiveDate: string
  file: File | null
}

function validateGofoFormShape(formData: FormData): GofoFormShape {
  const errors: string[] = []
  const effectiveDate = String(formData.get('effective_date') ?? '').trim()
  const fileEntry = formData.get('file')
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

  if (!file) {
    errors.push('No file selected. Pick the GOFO Standard zones .xlsx workbook.')
  } else {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      errors.push(`File "${file.name}" is not a .xlsx. Only .xlsx accepted.`)
    }
    if (file.size > 25 * 1024 * 1024) {
      errors.push(`File "${file.name}" exceeds 25MB. Verify the upload is the GOFO Standard zones workbook.`)
    }
  }

  if (!effectiveDate) {
    errors.push('Effective date is required.')
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    errors.push(`Effective date "${effectiveDate}" must be ISO YYYY-MM-DD.`)
  } else {
    const yr = parseInt(effectiveDate.slice(0, 4), 10)
    if (yr < MIN_EFFECTIVE_YEAR || yr > MAX_EFFECTIVE_YEAR) {
      errors.push(`Effective date year ${yr} is outside the sane range ${MIN_EFFECTIVE_YEAR}–${MAX_EFFECTIVE_YEAR}.`)
    }
  }

  return {
    errors,
    effectiveDate: effectiveDate || DEFAULT_GOFO_STANDARD_EFFECTIVE_DATE,
    file,
  }
}

// Pattern 5 live query — origin_zip3 for each hub is derived from
// gofo_hubs.primary_zip5 at parse time, never hardcoded. If the EWR/JFK
// split (v1.10.0-019) ever changes, the parser inherits the new ZIPs
// without code changes.
async function loadHubLookup(): Promise<HubLookup> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('gofo_hubs')
    .select('hub_code, primary_zip5')
  if (error) throw new Error(`Failed to load gofo_hubs: ${error.message}`)

  const byHub = new Map<string, { primary_zip5: string }>()
  for (const row of (data ?? []) as Array<{ hub_code: string; primary_zip5: string }>) {
    byHub.set(row.hub_code, { primary_zip5: row.primary_zip5 })
  }
  return { byHub }
}

export async function previewGofoStandardZones(
  prev: GofoPreviewState,
  formData: FormData,
): Promise<GofoPreviewState> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: ['Not authenticated. Please sign in again.'],
      effectiveDate: prev.effectiveDate || DEFAULT_GOFO_STANDARD_EFFECTIVE_DATE,
    }
  }

  const shape = validateGofoFormShape(formData)
  if (shape.errors.length > 0 || !shape.file) {
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: shape.errors.length > 0 ? shape.errors : ['No file provided.'],
      effectiveDate: shape.effectiveDate,
    }
  }

  // Read file buffer
  let buffer: ArrayBuffer
  try {
    buffer = await shape.file.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: [`Failed to read "${shape.file.name}": ${msg}`],
      effectiveDate: shape.effectiveDate,
    }
  }

  // Load hub lookup (Pattern 5 live query)
  let hubLookup: HubLookup
  try {
    hubLookup = await loadHubLookup()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: [`Failed to load gofo_hubs lookup: ${msg}`],
      effectiveDate: shape.effectiveDate,
    }
  }
  if (hubLookup.byHub.size < CANONICAL_GOFO_HUB_CODES.length) {
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: [
        `gofo_hubs has ${hubLookup.byHub.size} rows; expected at least ${CANONICAL_GOFO_HUB_CODES.length}. Re-apply migration v1.10.0-019.`,
      ],
      effectiveDate: shape.effectiveDate,
    }
  }

  // Parse
  const result = await parseGofoStandardZonesFile(
    { name: shape.file.name, buffer },
    hubLookup,
    shape.effectiveDate,
  )

  if (!result.ok || !result.summary) {
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: result.errors,
      warnings: result.warnings,
      effectiveDate: shape.effectiveDate,
    }
  }

  // Stage to Storage. Single file under upload_uuid namespace, mirroring
  // the DHL pattern so the daily cron sweep at pld-uploads-cleanup-stale
  // catches orphans uniformly across both flows.
  const admin = createAdminSupabaseClient()
  const uploadUuid = crypto.randomUUID()
  const stagePath = `${PATH_PREFIX}/${uploadUuid}/gofo-standard.xlsx`
  const upload = await admin.storage.from(BUCKET).upload(stagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false,
  })
  if (upload.error) {
    return {
      ...initialGofoPreviewState,
      status: 'error',
      errors: [`Stage upload failed: ${upload.error.message}. Re-try the upload.`],
      warnings: result.warnings,
      effectiveDate: shape.effectiveDate,
    }
  }

  return {
    status: 'preview',
    errors: [],
    warnings: result.warnings,
    summary: result.summary,
    firstRows: result.firstRows,
    stagePath,
    uploadUuid,
    effectiveDate: shape.effectiveDate,
  }
}

// =============================================================
// GOFO Standard — Stage 2: commitGofoStandardZones
// =============================================================
//
// Mirrors commitDhlEcomZones flow with single-file specifics:
//   1. Validate auth + form shape (uploadUuid, expectedRows, expectedTabs,
//      effectiveDate, matrixVersion).
//   2. Re-fetch the single staged file from
//      pld-uploads/zone-matrices/<upload_uuid>/gofo-standard.xlsx.
//   3. Re-parse via the same pure parser used at preview time — single
//      source of truth for the row data; rules out tampering between
//      preview and commit.
//   4. Validate the re-parse summary exactly matches the preview values
//      threaded through the hidden form inputs. Any drift aborts before
//      the DB write.
//   5. Call rpc('commit_gofo_standard_zones_upload', { p_rows }) for the
//      atomic scoped-DELETE + bulk INSERT. PG function body is one
//      transaction — if the INSERT fails, the DELETE rolls back too and
//      the prior active set survives.
//   6. Cleanup layer 1: remove the stage file. (Layer 2 is the daily
//      pld-uploads-cleanup-stale cron — orphans get swept regardless.)
//   7. Redirect with success flash.

export async function commitGofoStandardZones(formData: FormData): Promise<void> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    commitErrorRedirect('Not authenticated.')
  }

  // Parse hidden form inputs from the preview panel
  const uploadUuid = String(formData.get('upload_uuid') ?? '').trim()
  const expectedRows = parseInt(String(formData.get('expected_rows') ?? '0'), 10)
  const expectedTabs = parseInt(String(formData.get('expected_tabs') ?? '0'), 10)
  const effectiveDate = String(formData.get('effective_date') ?? '').trim()
  const matrixVersion = String(formData.get('matrix_version') ?? '').trim()

  // UUID v4 shape check — defensive against form tampering / replay against
  // a different bucket prefix.
  if (!/^[0-9a-f-]{36}$/i.test(uploadUuid)) {
    commitErrorRedirect('Missing or malformed upload UUID. Re-upload the file.')
  }
  if (!Number.isInteger(expectedRows) || expectedRows <= 0) {
    commitErrorRedirect('Missing expected row count. Re-upload the file.')
  }
  if (!Number.isInteger(expectedTabs) || expectedTabs !== CANONICAL_GOFO_HUB_CODES.length) {
    commitErrorRedirect(`Expected tab count must be ${CANONICAL_GOFO_HUB_CODES.length}.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    commitErrorRedirect('Missing or malformed effective date. Re-upload the file.')
  }
  if (matrixVersion !== effectiveDate) {
    commitErrorRedirect('matrix_version drift detected. Re-upload the file.')
  }

  const admin = createAdminSupabaseClient()

  // Re-fetch the single staged file
  const stagePath = `${PATH_PREFIX}/${uploadUuid}/gofo-standard.xlsx`
  const dl = await admin.storage.from(BUCKET).download(stagePath)
  if (dl.error || !dl.data) {
    commitErrorRedirect(
      `Stage file missing at ${stagePath}. The file may have been swept by the daily cleanup cron, or the upload session expired. Re-upload to retry.`,
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await dl.data!.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    commitErrorRedirect(`Failed to read stage file: ${msg}`)
  }

  // Re-load hub lookup + re-parse with the same parser as preview.
  let hubLookup: HubLookup
  try {
    hubLookup = await loadHubLookup()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    commitErrorRedirect(`Failed to load gofo_hubs lookup: ${msg}`)
  }

  // Synthetic filename — the staged bytes are byte-identical to the upload;
  // only the displayable name changes here.
  const result = await parseGofoStandardZonesFile(
    { name: 'gofo-standard.xlsx', buffer: buffer! },
    hubLookup!,
    effectiveDate,
  )

  if (!result.ok || !result.summary) {
    const detail = result.errors.slice(0, 3).join('; ')
    commitErrorRedirect(
      `Re-parse failed at commit time: ${detail}. Aborting write. Re-upload to retry.`,
    )
  }

  // Defensive: confirm re-parse summary matches preview's expected counts.
  // Any drift means the staged file was tampered with or the parser changed
  // between preview and commit — abort and preserve prior data.
  if (result.summary!.totalRows !== expectedRows) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedRows} rows, got ${result.summary!.totalRows}. Aborting write.`,
    )
  }
  if (result.summary!.totalTabs !== expectedTabs) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedTabs} tabs, got ${result.summary!.totalTabs}. Aborting write.`,
    )
  }
  if (result.summary!.effectiveDate !== effectiveDate) {
    commitErrorRedirect(
      `Re-parse mismatch: effective_date drifted from ${effectiveDate} to ${result.summary!.effectiveDate}. Aborting write.`,
    )
  }
  if (result.summary!.matrixVersion !== matrixVersion) {
    commitErrorRedirect(
      `Re-parse mismatch: matrix_version drifted from ${matrixVersion} to ${result.summary!.matrixVersion}. Aborting write.`,
    )
  }

  // Atomic scoped DELETE + INSERT via the v1.10.0-025 SECURITY DEFINER
  // function. Function body is one transaction; if either statement fails,
  // both roll back and the prior active set survives.
  const rpc = await admin.rpc('commit_gofo_standard_zones_upload', {
    p_rows: result.zoneMatrixRows,
  })

  if (rpc.error) {
    commitErrorRedirect(
      `Database write failed: ${rpc.error.message}. Prior data preserved (transaction rolled back). Re-upload to retry.`,
    )
  }

  const written = (rpc.data ?? {}) as { matrix_rows_written?: number }
  const matrixWritten = written.matrix_rows_written ?? 0
  if (matrixWritten !== expectedRows) {
    commitErrorRedirect(
      `DB function reported ${matrixWritten} rows written, expected ${expectedRows}. Investigate.`,
    )
  }

  // Cleanup layer 1: remove the single stage file. Layer 2 (daily cron
  // pld-uploads-cleanup-stale) sweeps any orphans regardless. We don't
  // fail the commit on a delete error; cron catches stragglers.
  await admin.storage.from(BUCKET).remove([stagePath]).catch(() => undefined)

  revalidatePath(ROUTE)
  redirect(
    `${ROUTE}?status=success&msg=${encodeURIComponent(
      `Committed: ${matrixWritten.toLocaleString('en-US')} GOFO Standard zone matrix rows across ${expectedTabs} hubs written atomically. Effective ${effectiveDate}.`,
    )}`,
  )
}
