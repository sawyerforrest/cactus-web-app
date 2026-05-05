// ==========================================================
// FILE: src/alamo/lib/pld-analysis/dhl-ecom-zones-parser.ts
// PURPOSE: Server-only multi-file parser for the DHL eCom Domestic
// Zone matrix XLSX set (18 per-DC files).
//
// Implements docs/session-archives/specs/dhl-ecom-zones-parser-spec.md.
//
// Output of a successful parse:
//   - 18 ParsedFile records, each with 930 rows
//   - 16,740 ZoneMatrixRow records ready for INSERT into
//     carrier_zone_matrices
//   - A summary suitable for the preview UI
//
// The parser is pure: it accepts raw file buffers + a DC lookup map
// and returns rows + diagnostics. No DB access, no Storage access —
// the caller (a Server Action) handles those.
// ==========================================================

import ExcelJS from 'exceljs'
import type {
  DcSummary,
  ZonesPreviewRow,
  ZonesPreviewSummary,
} from '@/app/pld-analysis/reference-data/zone-matrices/types'
import { CANONICAL_DC_CODES, type CanonicalDcCode } from '@/app/pld-analysis/reference-data/zone-matrices/types'

// ----------------------------------------------------------------------
// Constants from spec
// ----------------------------------------------------------------------

const SHEET_NAME = 'ZONES'
const HEADER_ROW = 3
const FIRST_DATA_ROW = 4
const EXPECTED_DATA_ROWS = 930
// Filename regex accepts either spaces or underscores in the prefix (DHL
// publishes the canonical name with spaces — "DHL eCommerce Zones Table_ATL.xlsx" —
// but earlier docs and chat-upload metadata normalized to underscores). The
// trailing underscore before the DC code is consistent in both forms. The
// /i flag tolerates case variation in case DHL ever re-publishes with
// different title-case.
const FILENAME_REGEX = /^DHL[ _]eCommerce[ _]Zones[ _]Table_([A-Z]{3})\.xlsx$/i

const EXPECTED_HEADERS = ['ORIGIN', 'ORIGIN_ZIP3', 'DEST_ZIP3', 'ZONE', 'UPDATED'] as const

const VALID_ZONES = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '11', '12', '13'])

// Month-name → 2-digit number (UPDATED column comes as e.g., "22-MARCH-2026")
const MONTH_MAP: Record<string, string> = {
  JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04',
  MAY: '05', JUNE: '06', JULY: '07', AUGUST: '08',
  SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
}

// ----------------------------------------------------------------------
// Types (parser-internal — public ones come from the page's types.ts)
// ----------------------------------------------------------------------

export interface DcLookup {
  /** dc_code -> { origin_code, dc_zip3 } */
  byCode: Map<string, { origin_code: string; dc_zip3: string }>
}

export interface ZoneMatrixRow {
  carrier_code: 'DHL_ECOM'
  service_level: 'Ground'
  matrix_version: string
  origin_zip3: string
  dest_zip3: string
  zone: string
  effective_date: string  // ISO YYYY-MM-DD
  source: string
  notes: string
}

interface ParsedFile {
  dc_code: string
  origin_code: string
  origin_zip3: string
  effective_date: string  // ISO YYYY-MM-DD
  rows: Array<{ dest_zip3: string; zone: string; updated: string }>
}

export interface MultiFileParseResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: ZonesPreviewSummary | null
  firstRows: ZonesPreviewRow[]
  /**
   * Full row set ready for INSERT. Empty when ok=false.
   * Used by the commit Server Action; not surfaced to the client.
   */
  zoneMatrixRows: ZoneMatrixRow[]
}

export interface FileBuffer {
  name: string
  buffer: ArrayBuffer
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

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

function isThreeDigits(s: string): boolean {
  return /^\d{3}$/.test(s)
}

function parseUpdatedDate(raw: string): string | null {
  // Source format: '22-MARCH-2026' (day, month name uppercase, 4-digit year).
  // Allow lenient case for safety.
  const m = raw.trim().toUpperCase().match(/^(\d{1,2})-([A-Z]+)-(\d{4})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = MONTH_MAP[m[2]]
  if (!month) return null
  const year = m[3]
  return `${year}-${month}-${day}`
}

function arrayBufferFromBufferLike(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf
  return (buf as Uint8Array).buffer.slice(
    (buf as Uint8Array).byteOffset,
    (buf as Uint8Array).byteOffset + (buf as Uint8Array).byteLength,
  ) as ArrayBuffer
}

// ----------------------------------------------------------------------
// Single-file parser — used per file inside the multi-file orchestrator
// ----------------------------------------------------------------------

interface SingleFileOutcome {
  ok: boolean
  errors: string[]
  parsed: ParsedFile | null
}

async function parseSingleFile(
  fileName: string,
  buffer: ArrayBuffer,
  dcLookup: DcLookup,
): Promise<SingleFileOutcome> {
  const errors: string[] = []

  // 1. Validate filename pattern + DC code. /i flag means the captured DC
  // code may be lowercase if DHL ever publishes that way; normalize to
  // uppercase before the lookup.
  const fnameMatch = FILENAME_REGEX.exec(fileName)
  if (!fnameMatch) {
    return {
      ok: false,
      errors: [
        `Filename "${fileName}" doesn't match the expected pattern "DHL eCommerce Zones Table_<DC>.xlsx" (also accepts the underscored variant "DHL_eCommerce_Zones_Table_<DC>.xlsx").`,
      ],
      parsed: null,
    }
  }
  const dcCode = fnameMatch[1].toUpperCase()
  const dcRow = dcLookup.byCode.get(dcCode)
  if (!dcRow) {
    return {
      ok: false,
      errors: [`Filename "${fileName}" references DC code "${dcCode}" which isn't in the canonical 18-DC set.`],
      parsed: null,
    }
  }

  // 2. Open workbook
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(arrayBufferFromBufferLike(buffer))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      errors: [`File "${fileName}" failed to read as XLSX: ${msg}`],
      parsed: null,
    }
  }

  // 3. Validate sheet name
  const sheet = workbook.getWorksheet(SHEET_NAME)
  if (!sheet) {
    const available = workbook.worksheets.map(w => `"${w.name}"`).join(', ')
    return {
      ok: false,
      errors: [`File "${fileName}" missing required sheet "${SHEET_NAME}". Available: ${available || '(none)'}.`],
      parsed: null,
    }
  }

  // 4. Validate header row
  const headerRow = sheet.getRow(HEADER_ROW)
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const actual = normalizeCell(headerRow.getCell(i + 1).value)
    if (actual !== EXPECTED_HEADERS[i]) {
      errors.push(`File "${fileName}" header row mismatch at column ${i + 1}: expected "${EXPECTED_HEADERS[i]}", got "${actual}".`)
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, parsed: null }
  }

  // 5. Walk data rows — collect raw values, validate as we go
  const rows: Array<{ dest_zip3: string; zone: string; updated: string }> = []
  let originSeen: string | null = null
  let originZip3Seen: string | null = null
  const updatedDatesInFile = new Set<string>()
  const destZip3sInFile = new Set<string>()
  const lastRow = sheet.rowCount

  for (let rowIdx = FIRST_DATA_ROW; rowIdx <= lastRow; rowIdx++) {
    const row = sheet.getRow(rowIdx)
    const origin = normalizeCell(row.getCell(1).value)
    if (origin === '') continue  // tolerate trailing blank rows

    const originZip3 = normalizeCell(row.getCell(2).value).padStart(3, '0')
    const destZip3 = normalizeCell(row.getCell(3).value).padStart(3, '0')
    const zoneRaw = normalizeCell(row.getCell(4).value)
    const updated = normalizeCell(row.getCell(5).value)

    // Track ORIGIN/ORIGIN_ZIP3 — must be uniform across the file
    if (originSeen === null) originSeen = origin
    else if (origin !== originSeen) {
      errors.push(`File "${fileName}" row ${rowIdx}: ORIGIN "${origin}" differs from earlier "${originSeen}".`)
    }
    if (originZip3Seen === null) originZip3Seen = originZip3
    else if (originZip3 !== originZip3Seen) {
      errors.push(`File "${fileName}" row ${rowIdx}: ORIGIN_ZIP3 "${originZip3}" differs from earlier "${originZip3Seen}".`)
    }

    if (!isThreeDigits(destZip3)) {
      errors.push(`File "${fileName}" row ${rowIdx}: DEST_ZIP3 "${destZip3}" is not 3 digits.`)
      continue
    }
    if (destZip3 < '005' || destZip3 > '999') {
      errors.push(`File "${fileName}" row ${rowIdx}: DEST_ZIP3 "${destZip3}" outside expected range 005-999.`)
      continue
    }
    if (destZip3sInFile.has(destZip3)) {
      errors.push(`File "${fileName}" row ${rowIdx}: duplicate DEST_ZIP3 "${destZip3}".`)
      continue
    }
    destZip3sInFile.add(destZip3)

    if (!VALID_ZONES.has(zoneRaw)) {
      errors.push(`File "${fileName}" row ${rowIdx}: ZONE "${zoneRaw}" not in {1-8, 11-13}.`)
      continue
    }

    if (updated === '') {
      errors.push(`File "${fileName}" row ${rowIdx}: UPDATED is empty.`)
      continue
    }
    updatedDatesInFile.add(updated)

    rows.push({ dest_zip3: destZip3, zone: zoneRaw, updated })
  }

  // 6. Validate ORIGIN matches expected US<DC>1
  const expectedOrigin = `US${dcCode}1`
  if (originSeen !== expectedOrigin) {
    errors.push(`File "${fileName}" ORIGIN "${originSeen ?? '(empty)'}" doesn't match expected "${expectedOrigin}".`)
  }

  // 7. Validate ORIGIN_ZIP3 matches dhl_ecom_dcs.dc_zip3 for this DC
  if (originZip3Seen !== dcRow.dc_zip3) {
    errors.push(`File "${fileName}" ORIGIN_ZIP3 "${originZip3Seen ?? '(empty)'}" doesn't match dhl_ecom_dcs.dc_zip3 "${dcRow.dc_zip3}" for DC ${dcCode}.`)
  }

  // 8. Validate row count
  if (rows.length !== EXPECTED_DATA_ROWS) {
    errors.push(`File "${fileName}" has ${rows.length} data rows, expected ${EXPECTED_DATA_ROWS}.`)
  }

  // 9. Validate UPDATED is uniform within the file
  if (updatedDatesInFile.size > 1) {
    errors.push(`File "${fileName}" has multiple UPDATED dates within the same file: ${[...updatedDatesInFile].join(', ')}. Expected a single value.`)
  }

  if (errors.length > 0) {
    return { ok: false, errors, parsed: null }
  }

  const updatedRaw = [...updatedDatesInFile][0]
  const isoDate = parseUpdatedDate(updatedRaw)
  if (!isoDate) {
    return {
      ok: false,
      errors: [`File "${fileName}" UPDATED value "${updatedRaw}" couldn't be parsed as DD-MONTHNAME-YYYY.`],
      parsed: null,
    }
  }

  return {
    ok: true,
    errors: [],
    parsed: {
      dc_code: dcCode,
      origin_code: originSeen!,
      origin_zip3: originZip3Seen!,
      effective_date: isoDate,
      rows,
    },
  }
}

// ----------------------------------------------------------------------
// Main parser
// ----------------------------------------------------------------------

export async function parseDhlEcomZonesFiles(
  files: FileBuffer[],
  dcLookup: DcLookup,
): Promise<MultiFileParseResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const expectedFiles = CANONICAL_DC_CODES.length

  // Validate file count
  if (files.length === 0) {
    errors.push('No files uploaded.')
    return { ok: false, errors, warnings, summary: null, firstRows: [], zoneMatrixRows: [] }
  }
  if (files.length !== expectedFiles) {
    errors.push(
      `Expected exactly ${expectedFiles} files, got ${files.length}. Upload all 18 zone files in one operation.`,
    )
  }

  // Parse each file
  const parsedByDc = new Map<string, ParsedFile>()
  const filenameByDc = new Map<string, string>()
  for (const f of files) {
    const outcome = await parseSingleFile(f.name, f.buffer, dcLookup)
    if (!outcome.ok) {
      errors.push(...outcome.errors)
      continue
    }
    const dcCode = outcome.parsed!.dc_code
    if (parsedByDc.has(dcCode)) {
      errors.push(
        `Duplicate DC ${dcCode} in upload set. Files: "${filenameByDc.get(dcCode)}" and "${f.name}". Each DC may appear only once.`,
      )
      continue
    }
    parsedByDc.set(dcCode, outcome.parsed!)
    filenameByDc.set(dcCode, f.name)
  }

  // Validate the canonical 18 set
  const missingDcs: string[] = []
  for (const code of CANONICAL_DC_CODES) {
    if (!parsedByDc.has(code)) missingDcs.push(code)
  }
  if (missingDcs.length > 0) {
    errors.push(`Missing ${missingDcs.length} DCs from upload set: ${missingDcs.join(', ')}.`)
  }

  // Detect uploads of DCs outside the canonical set (shouldn't happen given
  // single-file parser already rejects unknown filenames, but defensive)
  for (const code of parsedByDc.keys()) {
    if (!(CANONICAL_DC_CODES as readonly string[]).includes(code)) {
      errors.push(`DC code ${code} isn't in canonical set; should have been rejected at filename validation.`)
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstRows: [], zoneMatrixRows: [] }
  }

  // All 18 parsed cleanly. Compute resolved effective_date = MAX(UPDATED).
  const allDates = [...parsedByDc.values()].map(p => p.effective_date).sort()
  const resolvedEffectiveDate = allDates[allDates.length - 1]

  // Per-file UPDATED date variance check (warning, not blocking)
  const distinctDates = new Set(allDates)
  if (distinctDates.size > 1) {
    const perDcParts = (CANONICAL_DC_CODES as readonly CanonicalDcCode[])
      .map(code => `${code}: ${parsedByDc.get(code)!.effective_date}`)
      .join(', ')
    warnings.push(
      `Per-DC UPDATED dates differ — using MAX (${resolvedEffectiveDate}) as effective_date and matrix_version. Per-DC: ${perDcParts}`,
    )
  }

  // Build zone distribution map + zoneMatrixRows + first-rows preview slice
  const zoneDistribution: Record<string, number> = {}
  const zoneMatrixRows: ZoneMatrixRow[] = []
  const firstRows: ZonesPreviewRow[] = []
  const dcSummaries: DcSummary[] = []

  // Iterate in canonical (alphabetical) order so output is stable
  for (const code of CANONICAL_DC_CODES) {
    const parsed = parsedByDc.get(code)!
    const dcLookupRow = dcLookup.byCode.get(code)!

    dcSummaries.push({
      dc_code: code,
      origin_code: parsed.origin_code,
      origin_zip3: parsed.origin_zip3,
      effective_date: parsed.effective_date,
      rows: parsed.rows.length,
    })

    for (const r of parsed.rows) {
      zoneDistribution[r.zone] = (zoneDistribution[r.zone] ?? 0) + 1

      zoneMatrixRows.push({
        carrier_code: 'DHL_ECOM',
        service_level: 'Ground',
        matrix_version: resolvedEffectiveDate,
        origin_zip3: dcLookupRow.dc_zip3,
        dest_zip3: r.dest_zip3,
        zone: r.zone,
        effective_date: resolvedEffectiveDate,
        source: 'DHL eCommerce Zones Table XLSX (per DC)',
        notes: `DC: ${code}`,
      })

      // Capture the first 10 rows from the very first DC for preview
      if (firstRows.length < 10 && code === CANONICAL_DC_CODES[0]) {
        firstRows.push({
          dc_code: code,
          origin_zip3: parsed.origin_zip3,
          dest_zip3: r.dest_zip3,
          zone: r.zone,
          updated: r.updated,
        })
      }
    }
  }

  // Sanity: total row count
  if (zoneMatrixRows.length !== expectedFiles * EXPECTED_DATA_ROWS) {
    errors.push(
      `Row-count sanity failure: expected ${expectedFiles * EXPECTED_DATA_ROWS} total rows, got ${zoneMatrixRows.length}. Aborting.`,
    )
    return { ok: false, errors, warnings, summary: null, firstRows: [], zoneMatrixRows: [] }
  }

  // Distinct dest_zip3 across all files — should equal 930 per spec
  const distinctDestZip3s = new Set(zoneMatrixRows.map(r => r.dest_zip3)).size

  const summary: ZonesPreviewSummary = {
    totalFiles: parsedByDc.size,
    expectedFiles,
    totalRows: zoneMatrixRows.length,
    distinctDestZip3s,
    zoneDistribution,
    resolvedEffectiveDate,
    matrixVersion: resolvedEffectiveDate,
    dcs: dcSummaries,
  }

  return {
    ok: true,
    errors: [],
    warnings,
    summary,
    firstRows,
    zoneMatrixRows,
  }
}
