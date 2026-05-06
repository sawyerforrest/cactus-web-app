// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/parseDhlEcomRates.ts
// PURPOSE: Server-side parser for the DHL eCommerce Cactus base-rates
// workbook. Reads the .xlsx, validates structure + Pattern 5 strict
// subsets (DC codes, products), groups into 126 (DC × Product) cards,
// stages 126 rate-card rows + their cells (~30,888) into the staging
// tables, and returns a summary suitable for the StagePreviewTable.
//
// NOT a Server Action itself. Called from actions.ts. Receives an
// admin Supabase client so RLS on the staging tables doesn't block
// inserts. Owns the whole pipeline including the inserts because the
// cell rows depend on RETURNING values from the rate-card insert
// (parent_stage_row_id), so splitting parser/action would force the
// action to re-implement half the orchestration.
//
// Pipeline (per spec § 5a):
//   1. Open workbook (ExcelJS — same lib as all prior 2b parsers)
//   2. Validate single sheet
//   3. Find header row (defensive: scan first 10 rows)
//   4. Walk data rows
//   5. Pattern 5 strict-subset validation: DC codes ⊆ dhl_ecom_dcs,
//      Products ⊆ DHL_ECOM_PRODUCT_SET
//   6. Group by (DC, Product), validate 126 groups
//   7. Bulk-insert 126 stage rate-card rows with RETURNING stage_row_id
//   8. Build (variant, service_level) → stage_row_id map
//   9. For each weight row, emit 11 cells (replicate Zone 1&2 → 1+2,
//      Zone 11-13 → 11+12+13)
//   10. Chunk-insert ~30,888 cells
//   11. Compute summary; return
//
// Error rollback: any failure after stage rows are inserted triggers a
// DELETE FROM analysis_rate_cards_stage WHERE upload_session_id = X.
// FK on cells_stage cascades, so this is sufficient.
// ==========================================================

import ExcelJS from 'exceljs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DHL_ECOM_PRODUCT_SET } from './dhl-ecom-products'
import type { ParseSummary } from './types'

// ----------------------------------------------------------------------
// Constants from spec
// ----------------------------------------------------------------------

const REQUIRED_HEADERS = [
  'DC code',
  'Product',
  'Weight value',
  'Weight unit',
  'Zone 1&2',
  'Zone 3',
  'Zone 4',
  'Zone 5',
  'Zone 6',
  'Zone 7',
  'Zone 8',
  'Zone 11-13',
] as const

type RequiredHeader = typeof REQUIRED_HEADERS[number]

// 8 source zone columns expand to 11 output zones. Replication:
// 'Zone 1&2' → Zone 1 + Zone 2; 'Zone 11-13' → Zone 11 + Zone 12 + Zone 13.
const ZONE_EXPANSIONS: ReadonlyArray<{ source: RequiredHeader; outputs: readonly string[] }> = [
  { source: 'Zone 1&2',   outputs: ['Zone 1', 'Zone 2'] },
  { source: 'Zone 3',     outputs: ['Zone 3'] },
  { source: 'Zone 4',     outputs: ['Zone 4'] },
  { source: 'Zone 5',     outputs: ['Zone 5'] },
  { source: 'Zone 6',     outputs: ['Zone 6'] },
  { source: 'Zone 7',     outputs: ['Zone 7'] },
  { source: 'Zone 8',     outputs: ['Zone 8'] },
  { source: 'Zone 11-13', outputs: ['Zone 11', 'Zone 12', 'Zone 13'] },
]

const HEADER_SEARCH_ROWS = 10
const HEADER_SEARCH_COLS = 20

const EXPECTED_CARDS = 126
const EXPECTED_DCS = 18
const EXPECTED_PRODUCTS = 7

// supabase-js handles arbitrary-length INSERTs but chunking guards
// against per-request payload limits and gives the network a chance
// to backpressure on slow links. ~30k cells ÷ 1000 = ~31 round-trips.
const CELL_INSERT_CHUNK = 1000

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export interface ParseInput {
  fileBuffer: ArrayBuffer
  filename: string
  notes: string | null
  effectiveDate: string | null
  deprecatedDate: string | null
  dimFactor: number | null
  uploadSessionId: string
  /** Admin Supabase client (service role) — bypasses RLS on stage tables. */
  supabase: SupabaseClient
}

export type ParseResult =
  | { ok: true; uploadSessionId: string; summary: ParseSummary }
  | { ok: false; error: string }

interface DataRow {
  dcCode: string
  product: string
  weightValue: number
  weightUnit: string
  zoneRates: Map<RequiredHeader, number | null>  // 8 source-zone entries
  rowNum: number  // for diagnostics
}

interface HeaderLocation {
  headerRow: number
  /** Column-index map (1-based, ExcelJS convention). */
  cols: Record<RequiredHeader, number>
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function arrayBufferFromBufferLike(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf
  return (buf as Uint8Array).buffer.slice(
    (buf as Uint8Array).byteOffset,
    (buf as Uint8Array).byteOffset + (buf as Uint8Array).byteLength,
  ) as ArrayBuffer
}

function normalizeCell(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return Number.isInteger(value) ? value.toString() : String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    if (typeof obj.text === 'string') return (obj.text as string).trim()
    if (typeof obj.result === 'string') return (obj.result as string).trim()
    if (typeof obj.result === 'number') return String(obj.result)
  }
  return String(value).trim()
}

/** Trim, collapse internal whitespace runs to single space. Spec § 5a:
 *  "Be defensive on whitespace and case in the header strings". */
function normalizeHeader(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

function toNumberOrNull(value: ExcelJS.CellValue | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    if (typeof obj.result === 'number') return Number.isFinite(obj.result) ? (obj.result as number) : null
    if (typeof obj.result === 'string') {
      const n = Number(obj.result)
      return Number.isFinite(n) ? n : null
    }
  }
  return null
}

function findHeaderRow(sheet: ExcelJS.Worksheet): HeaderLocation | { error: string } {
  const lastRowToScan = Math.min(HEADER_SEARCH_ROWS, sheet.rowCount)
  const required = new Set<string>(REQUIRED_HEADERS)

  for (let r = 1; r <= lastRowToScan; r++) {
    const row = sheet.getRow(r)
    const colMap: Partial<Record<RequiredHeader, number>> = {}
    for (let c = 1; c <= HEADER_SEARCH_COLS; c++) {
      const raw = normalizeCell(row.getCell(c).value)
      if (raw === '') continue
      const norm = normalizeHeader(raw)
      if (required.has(norm)) {
        colMap[norm as RequiredHeader] = c
      }
    }
    const missing = REQUIRED_HEADERS.filter(h => colMap[h] === undefined)
    if (missing.length === 0) {
      return { headerRow: r, cols: colMap as Record<RequiredHeader, number> }
    }
  }

  // Found nothing — surface the actual headers from row 1 for debugging
  const row1 = sheet.getRow(1)
  const actual: string[] = []
  for (let c = 1; c <= HEADER_SEARCH_COLS; c++) {
    const v = normalizeCell(row1.getCell(c).value)
    if (v !== '') actual.push(`"${v}"`)
  }
  return {
    error:
      `Could not locate the required header row in the first ${HEADER_SEARCH_ROWS} rows. ` +
      `Required columns (case-sensitive after whitespace normalization): ${REQUIRED_HEADERS.map(h => `"${h}"`).join(', ')}. ` +
      `Row 1 actually contained: ${actual.join(', ') || '(empty)'}.`,
  }
}

// ----------------------------------------------------------------------
// Main parser
// ----------------------------------------------------------------------

export async function parseDhlEcomRates(input: ParseInput): Promise<ParseResult> {
  const {
    fileBuffer, filename, notes, effectiveDate, deprecatedDate, dimFactor,
    uploadSessionId, supabase,
  } = input

  // 1. Open workbook
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(arrayBufferFromBufferLike(fileBuffer))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to read XLSX: ${msg}` }
  }

  // 2. Single sheet
  const sheets = workbook.worksheets
  if (sheets.length !== 1) {
    const sheetNames = sheets.map(s => `"${s.name}"`).join(', ')
    return {
      ok: false,
      error: `DHL workbook must have a single rate sheet, found ${sheets.length}: ${sheetNames || '(none)'}.`,
    }
  }
  const sheet = sheets[0]

  // 3. Header row + column index map
  const hdrOrErr = findHeaderRow(sheet)
  if ('error' in hdrOrErr) return { ok: false, error: hdrOrErr.error }
  const { headerRow, cols } = hdrOrErr

  // 4. Walk data rows
  const dataRows: DataRow[] = []
  const lastRow = sheet.rowCount
  const dcColumn = cols['DC code']
  const productColumn = cols['Product']
  const weightValueColumn = cols['Weight value']
  const weightUnitColumn = cols['Weight unit']

  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r)
    const dcCode = normalizeCell(row.getCell(dcColumn).value)
    if (dcCode === '') continue  // tolerate trailing blank rows
    const product = normalizeCell(row.getCell(productColumn).value)
    const weightValue = toNumberOrNull(row.getCell(weightValueColumn).value)
    const weightUnit = normalizeCell(row.getCell(weightUnitColumn).value)

    if (product === '' || weightValue === null || weightUnit === '') {
      return {
        ok: false,
        error: `Row ${r}: incomplete required data (DC="${dcCode}", Product="${product}", Weight value="${weightValue ?? '(null)'}", Weight unit="${weightUnit}").`,
      }
    }

    const zoneRates = new Map<RequiredHeader, number | null>()
    for (const exp of ZONE_EXPANSIONS) {
      const col = cols[exp.source]
      const val = toNumberOrNull(row.getCell(col).value)
      zoneRates.set(exp.source, val)
    }

    dataRows.push({ dcCode, product, weightValue, weightUnit, zoneRates, rowNum: r })
  }

  if (dataRows.length === 0) {
    return { ok: false, error: 'No data rows found below the header row.' }
  }

  // 5a. DC validation — Pattern 5 strict subset against dhl_ecom_dcs
  const distinctDcs = [...new Set(dataRows.map(r => r.dcCode))].sort()
  const { data: dcData, error: dcErr } = await supabase
    .from('dhl_ecom_dcs')
    .select('dc_code')
  if (dcErr) {
    return { ok: false, error: `Failed to load dhl_ecom_dcs lookup: ${dcErr.message}` }
  }
  // Trim — dc_code is CHAR(N) which Postgres pads with spaces
  const canonicalDcs = new Set<string>(
    ((dcData ?? []) as Array<{ dc_code: string }>).map(r => r.dc_code.trim()),
  )
  const unknownDcs = distinctDcs.filter(d => !canonicalDcs.has(d))
  if (unknownDcs.length > 0) {
    return {
      ok: false,
      error:
        `Unknown DC code(s) not in dhl_ecom_dcs: [${unknownDcs.join(', ')}]. ` +
        `Land a migration to add them before re-uploading.`,
    }
  }

  // 5b. Product validation — strict subset against canonical 7
  const distinctProducts = [...new Set(dataRows.map(r => r.product))].sort()
  const unknownProducts = distinctProducts.filter(p => !DHL_ECOM_PRODUCT_SET.has(p))
  if (unknownProducts.length > 0) {
    return {
      ok: false,
      error:
        `Unknown product(s): [${unknownProducts.join(', ')}]. ` +
        `Expected one of: BPM Expedited, BPM Ground, Expedited Max, ` +
        `SM LWP Expedited, SM LWP Ground, SM Parcel Plus Expedited, SM Parcel Plus Ground.`,
    }
  }

  // 6. Group by (DC, Product), validate 126 groups
  const groupKey = (dc: string, prod: string) => `${dc}|${prod}`
  const groups = new Map<string, DataRow[]>()
  for (const r of dataRows) {
    const k = groupKey(r.dcCode, r.product)
    let g = groups.get(k)
    if (!g) { g = []; groups.set(k, g) }
    g.push(r)
  }

  if (groups.size !== EXPECTED_CARDS) {
    // Compute missing pairs for the diagnostic
    const expectedPairs: string[] = []
    for (const dc of distinctDcs) {
      for (const p of distinctProducts) {
        if (!groups.has(groupKey(dc, p))) {
          expectedPairs.push(`(${dc}, ${p})`)
        }
      }
    }
    return {
      ok: false,
      error:
        `Expected ${EXPECTED_CARDS} rate cards (${EXPECTED_DCS} DCs × ${EXPECTED_PRODUCTS} products), got ${groups.size}. ` +
        `Distinct DCs: ${distinctDcs.length}. Distinct products: ${distinctProducts.length}. ` +
        `Missing pairs: [${expectedPairs.join(', ')}].`,
    }
  }

  // 7. Bulk-insert 126 stage rate-card rows. Build the rows in a stable
  //    order (DC asc, Product asc) so the returned stage_row_ids land in
  //    a predictable sequence — useful when debugging.
  const stageRows = []
  const sortedKeys = [...groups.keys()].sort()
  for (const k of sortedKeys) {
    const [variant, service_level] = k.split('|')
    stageRows.push({
      upload_session_id: uploadSessionId,
      carrier_code: 'DHL_ECOM',
      service_level,
      variant,
      fulfillment_mode: 'na' as const,
      purpose: 'CACTUS_BASE_COST',
      lead_id: null,
      effective_date: effectiveDate,
      deprecated_date: deprecatedDate,
      dim_factor: dimFactor,
      source: filename,
      surcharge_config: {
        source_workbook_sheet: sheet.name,
        fuel_table_ref: 'dhl_ecom_fuel_tiers',
        das_zips_ref: 'dhl_ecom_das_zips',
        waived: [],
        announced: [],
      },
      notes,
    })
  }

  const stageInsertRes = await supabase
    .from('analysis_rate_cards_stage')
    .insert(stageRows)
    .select('stage_row_id, variant, service_level')

  if (stageInsertRes.error) {
    return { ok: false, error: `Stage insert (rate-cards) failed: ${stageInsertRes.error.message}` }
  }

  // 8. Build (variant, service_level) → stage_row_id map
  const stageRowByPair = new Map<string, number>()
  for (const r of (stageInsertRes.data ?? []) as Array<{ stage_row_id: number; variant: string; service_level: string }>) {
    stageRowByPair.set(`${r.variant}|${r.service_level}`, r.stage_row_id)
  }
  if (stageRowByPair.size !== EXPECTED_CARDS) {
    await rollbackStage(supabase, uploadSessionId)
    return {
      ok: false,
      error: `Stage insert returned ${stageRowByPair.size} rows, expected ${EXPECTED_CARDS}. Aborting.`,
    }
  }

  // 9. For each data row, emit 11 cells (replicate Zone 1&2 and Zone 11-13)
  interface CellRow {
    upload_session_id: string
    parent_stage_row_id: number
    zone: string
    weight_value: number
    weight_unit: string
    rate: number | null
  }
  const cellRows: CellRow[] = []
  for (const r of dataRows) {
    const parent = stageRowByPair.get(groupKey(r.dcCode, r.product))
    if (parent === undefined) {
      // Should not be reachable — group must exist after step 6 validation
      await rollbackStage(supabase, uploadSessionId)
      return {
        ok: false,
        error: `Internal: row ${r.rowNum} group (${r.dcCode}, ${r.product}) has no staged rate-card.`,
      }
    }
    for (const exp of ZONE_EXPANSIONS) {
      const sourceRate = r.zoneRates.get(exp.source) ?? null
      for (const outZone of exp.outputs) {
        cellRows.push({
          upload_session_id: uploadSessionId,
          parent_stage_row_id: parent,
          zone: outZone,
          weight_value: r.weightValue,
          weight_unit: r.weightUnit,
          rate: sourceRate,
        })
      }
    }
  }

  // 10. Chunk-insert cells
  for (let i = 0; i < cellRows.length; i += CELL_INSERT_CHUNK) {
    const chunk = cellRows.slice(i, i + CELL_INSERT_CHUNK)
    const cellRes = await supabase
      .from('analysis_rate_card_cells_stage')
      .insert(chunk)
    if (cellRes.error) {
      await rollbackStage(supabase, uploadSessionId)
      return {
        ok: false,
        error: `Stage insert (cells) failed at chunk starting row ${i}: ${cellRes.error.message}`,
      }
    }
  }

  // 11. Compute summary
  const nullCellsByZone: Record<string, number> = {}
  for (const c of cellRows) {
    if (c.rate === null) {
      nullCellsByZone[c.zone] = (nullCellsByZone[c.zone] ?? 0) + 1
    }
  }
  const cardsByDc: Record<string, number> = {}
  const cardsByProduct: Record<string, number> = {}
  for (const k of sortedKeys) {
    const [dc, prod] = k.split('|')
    cardsByDc[dc] = (cardsByDc[dc] ?? 0) + 1
    cardsByProduct[prod] = (cardsByProduct[prod] ?? 0) + 1
  }

  const summary: ParseSummary = {
    totalCards: groups.size,
    totalCells: cellRows.length,
    unknownDcs: [],
    unknownProducts: [],
    nullCellsByZone,
    cardsByDc,
    cardsByProduct,
    sourceFilename: filename,
  }

  return { ok: true, uploadSessionId, summary }
}

// ----------------------------------------------------------------------
// Rollback helper — used when stage rate-card rows are written but a
// later step fails. cells_stage cascades on parent_stage_row_id, so
// deleting from analysis_rate_cards_stage cleans both tables.
// ----------------------------------------------------------------------

async function rollbackStage(
  supabase: SupabaseClient,
  uploadSessionId: string,
): Promise<void> {
  await supabase
    .from('analysis_rate_cards_stage')
    .delete()
    .eq('upload_session_id', uploadSessionId)
    .then(() => undefined, () => undefined)
}
