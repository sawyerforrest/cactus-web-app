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
// PAUSE POINT #1 SCOPE: both actions are STUBS. The migrations are
// applied and the screen shell renders empty-state, but the parser
// at lib/pld-analysis/dhl-das-zips-parser.ts lands at pause point #2.
// Today's stubs surface info-flashes so the form is exercisable
// end-to-end before the parser ships.
//
// Stage path namespacing: pld-uploads/dhl-das-zips/<upload_uuid>/
// — NOT under zone-matrices/. DAS isn't a zone matrix; the path
// reflects the data's nature.
// ==========================================================

'use server'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import {
  initialPreviewState,
  type PreviewState,
} from './types'

const ROUTE = '/pld-analysis/reference-data/dhl-das-zips'

// =============================================================
// Stage 1: previewDhlDasZips (STUB until pause-point #2)
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

  // STUB until pause-point #2. Surface an info-flash so operators see
  // the form posts and the file shape passed validation.
  // Replace this block with: read buffer → parseDhlEcomDasZipsFile →
  // stage to Storage → return preview state.
  return {
    ...initialPreviewState,
    status: 'error',
    errors: [
      `Parser not yet wired. File "${file.name}" (${file.size.toLocaleString('en-US')} bytes) accepted. Real parse + preview lands in the next commit per pause-point sequencing.`,
    ],
  }
}

// =============================================================
// Stage 2: commitDhlDasZips (STUB until pause-point #4)
// =============================================================

export async function commitDhlDasZips(_formData: FormData): Promise<void> {
  redirect(
    `${ROUTE}?status=info&msg=${encodeURIComponent(
      'DHL DAS ZIPs commit wiring lands at pause-point #4.',
    )}`,
  )
}
