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
// Stage 2: commitDhlDasZips (STUB until pause point #4)
// =============================================================
//
// The v1.10.0-027 PG function commit_dhl_ecom_das_zips_upload(p_rows jsonb)
// is already applied and verified — this stub stays in place only because
// the spec sequencing has Senior Architect verifying preview output against
// the real workbook BEFORE commit wiring lands. Once greenlit, the body
// mirrors commitGofoStandardZones with single-file specifics:
// re-fetch stage file → re-parse via parseDhlDasZipsFile → validate
// re-parse summary matches preview → call rpc('commit_dhl_ecom_das_zips_upload')
// → delete stage file on success → redirect with success.

export async function commitDhlDasZips(_formData: FormData): Promise<void> {
  redirect(
    `${ROUTE}?status=info&msg=${encodeURIComponent(
      'DHL DAS ZIPs commit wiring lands at pause-point #4. The parsed preview verifies against the spec; commit awaits Senior Architect signoff.',
    )}`,
  )
}
