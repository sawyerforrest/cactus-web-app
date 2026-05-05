// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/actions.ts
// PURPOSE: Server Actions for the DHL eCom Domestic Zone Matrices upload flow.
//
// Two stages:
//   1. previewDhlEcomZones (useActionState pattern, multi-file)
//      Validates the 18-file set, parses each file via the shared
//      parser, uploads each accepted file to
//      pld-uploads/zone-matrices/<upload_uuid>/<dc_code>.xlsx, returns
//      summary + first rows + warnings + stagePaths so the operator
//      can review before committing.
//
//   2. commitDhlEcomZones — NOT YET IMPLEMENTED. Pause point #4
//      deliverable. Will re-fetch all 18 stage files from Storage,
//      re-parse, validate the re-parse summary matches preview's
//      expected counts, dispatch to the v1.10.0-023
//      commit_dhl_ecom_zones_upload() Postgres function for the
//      atomic scoped-DELETE + bulk INSERT, delete all 18 stage files
//      on success.
// ==========================================================

'use server'

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import {
  parseDhlEcomZonesFiles,
  type DcLookup,
  type FileBuffer,
} from '@/lib/pld-analysis/dhl-ecom-zones-parser'
import { initialPreviewState, type PreviewState, CANONICAL_DC_CODES } from './types'

const BUCKET = 'pld-uploads'
const PATH_PREFIX = 'zone-matrices'

// Filename → DC code helper. Returns null when not parseable.
function dcCodeFromFilename(name: string): string | null {
  const m = /^DHL_eCommerce_Zones_Table_([A-Z]{3})\.xlsx$/i.exec(name)
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
    if (f.size > 10 * 1024 * 1024) {
      return {
        ...initialPreviewState,
        status: 'error',
        errors: [`File "${f.name}" exceeds 10MB. DHL zone files are typically a few KB; check the upload.`],
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
// Stage 2: commitDhlEcomZones — NOT YET IMPLEMENTED
// =============================================================
//
// Pause point #4 will:
//   1. Read uploadUuid + expected counts + resolvedEffectiveDate from
//      hidden form fields posted by the preview panel.
//   2. List all stage files under pld-uploads/zone-matrices/<uuid>/
//      and download each one (18 expected).
//   3. Re-parse all 18 via parseDhlEcomZonesFiles to produce
//      zoneMatrixRows again (single source of truth — never trust a
//      client-supplied JSON blob for the row data).
//   4. Validate the re-parse summary matches preview's expected counts
//      (defensive guard; abort if mismatch).
//   5. Dispatch to the SECURITY DEFINER function
//      commit_dhl_ecom_zones_upload(p_rows JSONB) which performs:
//        BEGIN
//          DELETE FROM carrier_zone_matrices
//            WHERE carrier_code = 'DHL_ECOM' AND service_level = 'Ground';
//          INSERT INTO carrier_zone_matrices ... -- 16,740 rows
//        COMMIT
//   6. Verify function-returned row count matches expected.
//   7. Delete all 18 stage files (cleanup layer 1). Cron sweep handles
//      any orphans (layer 2).
//   8. Redirect to the page with success flash.
