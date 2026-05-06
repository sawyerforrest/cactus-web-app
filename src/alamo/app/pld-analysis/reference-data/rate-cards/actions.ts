// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/actions.ts
// PURPOSE: Server Actions for the Rate Cards upload flows.
//
// Action map (Pause 3):
//   parseDhlEcomRateCard  — DHL Domestic real parser. File → 126 staged
//                           rate-cards + ~30,888 staged cells.
//   commitDhlEcomRateCard — Calls v1.10.0-030 RPC to atomically promote
//                           a staged session into analysis_rate_cards/_cells.
//   cancelDhlEcomStage    — Drops a staged session (cells cascade).
//   getStagedCardCells    — Typed-args fetch for one (variant, service_level)
//                           card's staged cells. Used by the StagePreviewTable
//                           card-picker to lazy-load instead of pre-rendering
//                           all 30,888 cells.
//   parseRateCardStub     — Stub still in place for GOFO modes; retired at
//                           Pauses 4 / 5 when the GOFO parsers land.
//
// Architectural notes:
//   - All Server Actions use the admin Supabase client (service role) for
//     DB writes — RLS on the staging tables otherwise blocks authenticated
//     callers from inserting on behalf of the upload.
//   - parseDhlEcomRateCard generates the upload_session_id in TS via
//     crypto.randomUUID() and threads it into both stage tables and the
//     ParseState returned to the UI.
//   - commit/cancel both redirect back to the page with a flash query
//     param so useActionState resets cleanly on the navigation.
// ==========================================================

'use server'

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { parseDhlEcomRates } from './parseDhlEcomRates'
import {
  initialParseStubState,
  type ParseState,
  type ParseStubState,
  type StagedCardDetail,
  type StagedCellRow,
} from './types'

const ROUTE = '/pld-analysis/reference-data/rate-cards'
const INDEX_ROUTE = '/pld-analysis/reference-data'

// =============================================================
// parseRateCardStub — still used by GOFO modes (Pause 2 holdover)
// =============================================================

export async function parseRateCardStub(
  _prev: ParseStubState,
  formData: FormData,
): Promise<ParseStubState> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ...initialParseStubState, status: 'error', error: 'Not authenticated. Please sign in again.' }
  }

  const fileEntry = formData.get('file')
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null

  if (!file) {
    return { ...initialParseStubState, status: 'error', error: 'No file selected. Pick a rate-card .xlsx before clicking Parse.' }
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return { ...initialParseStubState, status: 'error', error: `File "${file.name}" is not a .xlsx. Only .xlsx accepted.` }
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ...initialParseStubState, status: 'error', error: `File "${file.name}" exceeds 25MB. Verify the upload is a rate-card workbook.` }
  }

  return {
    ...initialParseStubState,
    status: 'error',
    error: `Parser not yet implemented for this mode. File "${file.name}" (${file.size.toLocaleString('en-US')} bytes) accepted; GOFO parsers land at Pauses 4 and 5.`,
  }
}

// =============================================================
// parseDhlEcomRateCard — Pause 3 deliverable
// =============================================================

export async function parseDhlEcomRateCard(
  _prev: ParseState,
  formData: FormData,
): Promise<ParseState> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { status: 'error', error: 'Not authenticated. Please sign in again.' }
  }

  // Form-shape validation
  const fileEntry = formData.get('file')
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null
  if (!file) {
    return { status: 'error', error: 'No file selected. Pick the DHL eCommerce rate-card .xlsx before clicking Parse.' }
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return { status: 'error', error: `File "${file.name}" is not a .xlsx. Only .xlsx accepted.` }
  }
  if (file.size > 25 * 1024 * 1024) {
    return { status: 'error', error: `File "${file.name}" exceeds 25MB. Verify the upload is a rate-card workbook.` }
  }

  const notes = formData.get('notes')
  const notesStr = typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null

  // Optional-but-not-yet-in-the-form metadata. Form fields can be added in a
  // follow-up Pause if Sawyer wants operator control over these — for now
  // they default to null and the stage rows accept the nulls.
  const effectiveDate = readOptionalDate(formData.get('effective_date'))
  const deprecatedDate = readOptionalDate(formData.get('deprecated_date'))
  const dimFactor = readOptionalNumber(formData.get('dim_factor'))

  // Read buffer
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'error', error: `Failed to read "${file.name}": ${msg}` }
  }

  // Parse + stage. Admin client bypasses RLS on stage tables.
  const admin = createAdminSupabaseClient()
  const uploadSessionId = crypto.randomUUID()

  const result = await parseDhlEcomRates({
    fileBuffer: buffer,
    filename: file.name,
    notes: notesStr,
    effectiveDate,
    deprecatedDate,
    dimFactor,
    uploadSessionId,
    supabase: admin,
  })

  if (!result.ok) {
    return { status: 'error', error: result.error }
  }

  return {
    status: 'parsed',
    uploadSessionId: result.uploadSessionId,
    summary: result.summary,
    mode: 'dhl-ecom-domestic',
  }
}

function readOptionalDate(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (trimmed === '') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function readOptionalNumber(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

// =============================================================
// commitDhlEcomRateCard — promote staged session via v1.10.0-030 RPC
// =============================================================

function commitErrorRedirect(msg: string): never {
  redirect(`${ROUTE}?status=error&msg=${encodeURIComponent(msg)}`)
}

export async function commitDhlEcomRateCard(formData: FormData): Promise<void> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) commitErrorRedirect('Not authenticated.')

  const uploadSessionId = String(formData.get('upload_session_id') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(uploadSessionId)) {
    commitErrorRedirect('Missing or malformed upload session id.')
  }

  const admin = createAdminSupabaseClient()
  const rpc = await admin.rpc('analysis_rate_cards_commit_dhl_ecom', {
    p_upload_session_id: uploadSessionId,
  })

  if (rpc.error) {
    commitErrorRedirect(`Database commit failed: ${rpc.error.message}. Prior data preserved.`)
  }

  const rows = (rpc.data ?? []) as Array<{ rate_cards_inserted: number; cells_inserted: number }>
  const result = rows[0]
  if (!result) {
    commitErrorRedirect('Database commit returned no result row. Investigate.')
  }
  const cardsInserted = result.rate_cards_inserted
  const cellsInserted = result.cells_inserted

  revalidatePath(ROUTE)
  revalidatePath(INDEX_ROUTE)

  redirect(
    `${ROUTE}?status=success&msg=${encodeURIComponent(
      `Committed: ${cardsInserted.toLocaleString('en-US')} rate cards · ${cellsInserted.toLocaleString('en-US')} cells. Status updated.`,
    )}`,
  )
}

// =============================================================
// cancelDhlEcomStage — discard staged session, keep nothing
// =============================================================

export async function cancelDhlEcomStage(formData: FormData): Promise<void> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) commitErrorRedirect('Not authenticated.')

  const uploadSessionId = String(formData.get('upload_session_id') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(uploadSessionId)) {
    commitErrorRedirect('Missing or malformed upload session id.')
  }

  const admin = createAdminSupabaseClient()
  // cells_stage cascades on parent_stage_row_id → deleting from
  // analysis_rate_cards_stage is sufficient for both tables.
  const del = await admin
    .from('analysis_rate_cards_stage')
    .delete()
    .eq('upload_session_id', uploadSessionId)

  if (del.error) {
    commitErrorRedirect(`Discard failed: ${del.error.message}.`)
  }

  redirect(
    `${ROUTE}?status=info&msg=${encodeURIComponent('Staged upload discarded.')}`,
  )
}

// =============================================================
// getStagedCardCells — typed-args Server Action used by the picker
// =============================================================

// Cell-sort comparator used by getStagedCardCells AND mirrored inside
// StagePreviewTable's CellTable pivot. Order: weight_unit (oz before lb),
// weight_value ascending, zone ascending (Zone 1, 2, 3, …, 8, 11, 12, 13).
// File-scoped, not exported — 'use server' modules can only export async.
function compareCells(
  a: StagedCellRow,
  b: StagedCellRow,
): number {
  const ua = unitRank(a.weight_unit)
  const ub = unitRank(b.weight_unit)
  if (ua !== ub) return ua - ub
  if (a.weight_value !== b.weight_value) return a.weight_value - b.weight_value
  return zoneRank(a.zone) - zoneRank(b.zone)
}

function unitRank(u: string): number {
  if (u === 'oz') return 0
  if (u === 'lb') return 1
  return 99
}

function zoneRank(z: string): number {
  const m = /^Zone\s+(\d+)$/.exec(z)
  return m ? parseInt(m[1], 10) : 999
}

export async function getStagedCardCells(
  uploadSessionId: string,
  variant: string,
  serviceLevel: string,
): Promise<{ ok: true; detail: StagedCardDetail } | { ok: false; error: string }> {
  // Auth
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  if (!/^[0-9a-f-]{36}$/i.test(uploadSessionId)) {
    return { ok: false, error: 'Malformed upload session id.' }
  }

  const admin = createAdminSupabaseClient()

  // Fetch the parent stage row first so we have source/notes for the
  // panel header without requiring a join client-side.
  const parentRes = await admin
    .from('analysis_rate_cards_stage')
    .select('stage_row_id, source, notes')
    .eq('upload_session_id', uploadSessionId)
    .eq('variant', variant)
    .eq('service_level', serviceLevel)
    .limit(1)
    .single()

  if (parentRes.error || !parentRes.data) {
    return {
      ok: false,
      error: `No staged card for (${variant}, ${serviceLevel}) in this session.`,
    }
  }

  // No .order() — supabase-js's chain can't express the unit-first
  // composite (oz before lb, then weight ascending, then zone ascending).
  // Sort in TS after fetch. Same comparator is mirrored in
  // StagePreviewTable's CellTable pivot so the row order is stable across
  // Server-fetch and client-re-pivot. Pause 4 / 5 GOFO preview queries
  // should reuse this comparator (both flows have mixed oz/lb rows).
  const cellsRes = await admin
    .from('analysis_rate_card_cells_stage')
    .select('zone, weight_value, weight_unit, rate')
    .eq('upload_session_id', uploadSessionId)
    .eq('parent_stage_row_id', parentRes.data.stage_row_id)

  if (cellsRes.error) {
    return { ok: false, error: `Stage cell fetch failed: ${cellsRes.error.message}` }
  }

  const cells = ((cellsRes.data ?? []) as Array<{ zone: string; weight_value: number; weight_unit: string; rate: number | null }>)
    .map((c): StagedCellRow => ({
      zone: c.zone,
      weight_value: typeof c.weight_value === 'string' ? Number(c.weight_value) : c.weight_value,
      weight_unit: c.weight_unit,
      rate: c.rate === null ? null : (typeof c.rate === 'string' ? Number(c.rate) : c.rate),
    }))
    .sort(compareCells)

  return {
    ok: true,
    detail: {
      variant,
      service_level: serviceLevel,
      source: parentRes.data.source as string | null,
      notes: parentRes.data.notes as string | null,
      cells,
    },
  }
}

