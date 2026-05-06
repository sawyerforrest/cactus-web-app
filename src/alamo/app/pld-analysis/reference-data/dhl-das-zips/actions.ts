// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/dhl-das-zips/actions.ts
// PURPOSE: Server Actions for the DHL DAS ZIPs upload flow.
//
// Two stages (mirroring the established zone-matrices and coverage-zips
// flow shape):
//   1. previewDhlDasZips — parses the .xlsx server-side, auto-resolves
//      effective date from cell A2, uploads to
//      pld-uploads/dhl-das-zips/<upload_uuid>/dhl-das-zip-list.xlsx,
//      returns summary + first rows + warnings + stagePath.
//
//   2. commitDhlDasZips — re-fetches stage file, re-parses, validates
//      counts match preview, dispatches to v1.10.0-027's
//      commit_dhl_ecom_das_zips_upload() PG function for the atomic
//      TRUNCATE + bulk INSERT, deletes the stage file on success.
//
// Stage path namespacing: pld-uploads/dhl-das-zips/<upload_uuid>/
// — NOT under zone-matrices/. DAS isn't a zone matrix; the path
// reflects the data's nature.
//
// PAUSE POINT #2 SCOPE: previewDhlDasZips is fully wired. Commit stays
// stubbed until pause point #4 — Senior Architect verifies the rendered
// PreviewPanel against the real workbook before commit lands.
// ==========================================================

'use server'

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  parseDhlDasZipsFile,
  type FileBuffer,
} from '@/lib/pld-analysis/dhl-das-zips-parser'
import {
  initialPreviewState,
  type PreviewState,
} from './types'

const ROUTE = '/pld-analysis/reference-data/dhl-das-zips'
const BUCKET = 'pld-uploads'
const PATH_PREFIX = 'dhl-das-zips'
const STAGE_FILENAME = 'dhl-das-zip-list.xlsx'

// =============================================================
// Stage 1: previewDhlDasZips
// =============================================================

export async function previewDhlDasZips(
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

  // Form-shape validation: file present, .xlsx extension, under 25MB cap
  // (framework body-size limits are at 25MB after the GOFO Standard
  // build's middleware/server-action bumps).
  const fileEntry = formData.get('file')
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

  if (!file) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: ['No file selected. Pick the DHL DAS ZIPs .xlsx file.'],
    }
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`File "${file.name}" is not a .xlsx. Only .xlsx accepted.`],
    }
  }
  if (file.size > 25 * 1024 * 1024) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`File "${file.name}" exceeds 25MB. Verify the upload is the DHL DAS ZIPs .xlsx file.`],
    }
  }

  // Read buffer
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`Failed to read "${file.name}": ${msg}`],
    }
  }

  // Parse — auto-resolves effective date from cell A2, validates sheet
  // name, header row, ZIP shape, no dupes, sanity bounds.
  const result = await parseDhlDasZipsFile({ name: file.name, buffer })

  if (!result.ok || !result.summary) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: result.errors,
      warnings: result.warnings,
    }
  }

  // Stage to Storage. Single file under upload_uuid namespace, mirroring
  // the established pattern. Path is dhl-das-zips/<uuid>/ — NOT under
  // zone-matrices/ since DAS isn't a zone matrix; the daily cron sweep
  // at pld-uploads-cleanup-stale walks the entire pld-uploads bucket
  // regardless, so orphans here get caught uniformly.
  const admin = createAdminSupabaseClient()
  const uploadUuid = crypto.randomUUID()
  const stagePath = `${PATH_PREFIX}/${uploadUuid}/${STAGE_FILENAME}`
  const upload = await admin.storage.from(BUCKET).upload(stagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false,
  })
  if (upload.error) {
    return {
      ...initialPreviewState,
      status: 'error',
      errors: [`Stage upload failed: ${upload.error.message}. Re-try the upload.`],
      warnings: result.warnings,
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
  }
}

// =============================================================
// Stage 2: commitDhlDasZips
// =============================================================
//
// Mirrors commitGofoStandardZones flow with DAS-specific shape:
//   1. Validate auth + form inputs (uploadUuid, expectedZips, effectiveDate)
//   2. Re-fetch single staged file from
//      pld-uploads/dhl-das-zips/<upload_uuid>/dhl-das-zip-list.xlsx
//   3. Re-parse via parseDhlDasZipsFile — same parser used at preview time,
//      single source of truth for row data; rules out tampering.
//   4. Validate re-parse summary exactly matches preview's threaded
//      expectedZips and effectiveDate. Any drift aborts before DB write.
//   5. Call rpc('commit_dhl_ecom_das_zips_upload', { p_rows: zipRows }) for
//      the atomic TRUNCATE + bulk INSERT (v1.10.0-027). Function body is
//      one transaction; failure rolls back to prior active set.
//   6. Verify function-returned zips_written equals expectedZips
//   7. Cleanup layer 1: best-effort remove of the stage file. (Carrying
//      the same .catch silent-swallow pattern as the zone-matrices flows
//      pending the post-2b polish that fixes the underlying RLS-suspected
//      bug — daily cron sweeps orphans regardless.)
//   8. Redirect with success flash.

function commitErrorRedirect(msg: string): never {
  redirect(`${ROUTE}?status=error&msg=${encodeURIComponent(msg)}`)
}

export async function commitDhlDasZips(formData: FormData): Promise<void> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    commitErrorRedirect('Not authenticated.')
  }

  // Parse hidden form inputs from the preview panel
  const uploadUuid = String(formData.get('upload_uuid') ?? '').trim()
  const expectedZips = parseInt(String(formData.get('expected_zips') ?? '0'), 10)
  const effectiveDate = String(formData.get('effective_date') ?? '').trim()

  // UUID v4 shape check — defensive against form tampering / replay against
  // a different bucket prefix.
  if (!/^[0-9a-f-]{36}$/i.test(uploadUuid)) {
    commitErrorRedirect('Missing or malformed upload UUID. Re-upload the file.')
  }
  if (!Number.isInteger(expectedZips) || expectedZips <= 0) {
    commitErrorRedirect('Missing expected ZIP count. Re-upload the file.')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    commitErrorRedirect('Missing or malformed effective date. Re-upload the file.')
  }

  const admin = createAdminSupabaseClient()

  // Re-fetch the single staged file
  const stagePath = `${PATH_PREFIX}/${uploadUuid}/${STAGE_FILENAME}`
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

  // Re-parse with the same parser — single source of truth for row data.
  // Synthetic filename matches the staged path; bytes are byte-identical
  // to the upload, only the displayable name changes here.
  const reparseInput: FileBuffer = { name: STAGE_FILENAME, buffer: buffer! }
  const result = await parseDhlDasZipsFile(reparseInput)

  if (!result.ok || !result.summary) {
    const detail = result.errors.slice(0, 3).join('; ')
    commitErrorRedirect(
      `Re-parse failed at commit time: ${detail}. Aborting write. Re-upload to retry.`,
    )
  }

  // Defensive: confirm re-parse summary matches preview's expected counts.
  // Any drift means the staged file was tampered with or the parser changed
  // between preview and commit — abort and preserve prior data.
  if (result.summary!.totalZips !== expectedZips) {
    commitErrorRedirect(
      `Re-parse mismatch: expected ${expectedZips} ZIPs, got ${result.summary!.totalZips}. Aborting write.`,
    )
  }
  if (result.summary!.effectiveDate !== effectiveDate) {
    commitErrorRedirect(
      `Re-parse mismatch: effective_date drifted from ${effectiveDate} to ${result.summary!.effectiveDate}. Aborting write.`,
    )
  }

  // Atomic TRUNCATE + INSERT via the v1.10.0-027 SECURITY DEFINER function.
  // Function body is one transaction; if INSERT fails, TRUNCATE rolls back
  // and the prior active set survives.
  const rpc = await admin.rpc('commit_dhl_ecom_das_zips_upload', {
    p_rows: result.zipRows,
  })

  if (rpc.error) {
    commitErrorRedirect(
      `Database write failed: ${rpc.error.message}. Prior data preserved (transaction rolled back). Re-upload to retry.`,
    )
  }

  const written = (rpc.data ?? {}) as { zips_written?: number }
  const zipsWritten = written.zips_written ?? 0
  if (zipsWritten !== expectedZips) {
    commitErrorRedirect(
      `DB function reported ${zipsWritten} ZIPs written, expected ${expectedZips}. Investigate.`,
    )
  }

  // Cleanup layer 1: best-effort stage-file remove. Carries the same silent
  // .catch as the zone-matrices commit functions — see the "Zone-matrices
  // stage cleanup gap (both flows)" project memory for the post-2b
  // definite-fix item that's expected to apply here too.
  await admin.storage.from(BUCKET).remove([stagePath]).catch(() => undefined)

  // Revalidate so the LoadedCard reflects the fresh write on landing.
  revalidatePath(ROUTE)
  // Also revalidate the Reference Data index so its DHL DAS ZIPs row
  // updates from "Not loaded" to the loaded count + effective date.
  revalidatePath('/pld-analysis/reference-data')

  redirect(
    `${ROUTE}?status=success&msg=${encodeURIComponent(
      `Committed: ${zipsWritten.toLocaleString('en-US')} DHL DAS ZIP5s written atomically. Effective ${effectiveDate}.`,
    )}`,
  )
}
