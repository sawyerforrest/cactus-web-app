// ==========================================================
// FILE: src/alamo/lib/pld-analysis/dhl-das-zips-parser.ts
// PURPOSE: Server-only single-file parser for the DHL eCommerce DAS
// (Delivery Area Surcharge) ZIP5 list workbook.
//
// Implements docs/session-archives/specs/dhl-das-zips-parser-spec.md.
//
// Output of a successful parse:
//   - 22,264 DasZipRow records ready for INSERT into dhl_ecom_das_zips
//   - A summary suitable for the DHL DAS ZIPs PreviewPanel
//   - First 10 ZIPs (ascending) for the preview chip cloud
//
// The parser is pure: it accepts a raw file buffer and returns rows +
// diagnostics. No DB access, no Storage access — the caller (a Server
// Action) handles those.
//
// Effective date is ENCODED IN THE SOURCE FILE (cell A2) and auto-
// resolved by the parser. There's no operator-picked date input on
// the upload form. Per spec § 2 the cell contains a literal string
// like "Effective 1/18/2026" which we extract via regex.
//
// Re-upload semantic: the commit Server Action TRUNCATEs and replaces
// the entire dhl_ecom_das_zips active set in one transaction (the
// table holds only DHL DAS data, no scope discriminator needed).
// See migration v1.10.0-027 for the commit function.
// ==========================================================

import ExcelJS from 'exceljs'
import type {
  DasZipPreviewRow,
  DasZipsPreviewSummary,
} from '@/app/pld-analysis/reference-data/dhl-das-zips/types'

// ----------------------------------------------------------------------
// Constants from spec
// ----------------------------------------------------------------------

const SHEET_NAME = '2026 DAS ZIPS'

// ExcelJS uses 1-indexed rows/cols. Spec § 2 uses 0-indexed for header
// and data rows ("header row index 7", "data rows 8 through 22,271")
// but Excel-style "cell A2" notation for the effective date — so:
//   - effective date: 1-indexed row 2, col A
//   - header row:     1-indexed row 8 (= spec's 0-indexed 7)
//   - first data row: 1-indexed row 9 (= spec's 0-indexed 8)
const EFFECTIVE_DATE_ROW = 2
const EFFECTIVE_DATE_COL = 1
const HEADER_ROW = 8
const FIRST_DATA_ROW = 9
const ZIP_COL = 1

const HEADER_TEXT = 'Destination ZIP Codes'
const SOURCE_LABEL = 'DHL eCommerce DAS ZIP List XLSX'

// Spec § 6 sanity bounds. Outside this range = hard error (likely wrong
// file or format change). Inside range but materially different from
// prior active set could be a warning — that comparison lives in the
// action layer (it needs DB access), not here.
const MIN_ZIPS = 1000
const MAX_ZIPS = 50000

// Cell A2 looks like 'Effective 1/18/2026' — regex extracts (M, D, YYYY).
// Tolerant of any whitespace between "Effective" and the date.
const EFFECTIVE_DATE_REGEX = /Effective\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export interface DasZipRow {
  zip5: string
  effective_date: string  // ISO YYYY-MM-DD
  source: string
  notes: string | null
}

export interface DasZipsParseResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: DasZipsPreviewSummary | null
  firstRows: DasZipPreviewRow[]
  /** Full row set ready for INSERT. Empty when ok=false. */
  zipRows: DasZipRow[]
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

function arrayBufferFromBufferLike(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf
  return (buf as Uint8Array).buffer.slice(
    (buf as Uint8Array).byteOffset,
    (buf as Uint8Array).byteOffset + (buf as Uint8Array).byteLength,
  ) as ArrayBuffer
}

// Extract ISO date from the A2 effective-date cell. Returns null on no match.
function parseEffectiveDate(rawCell: string): string | null {
  const m = EFFECTIVE_DATE_REGEX.exec(rawCell)
  if (!m) return null
  const month = m[1].padStart(2, '0')
  const day = m[2].padStart(2, '0')
  const year = m[3]
  return `${year}-${month}-${day}`
}

// ----------------------------------------------------------------------
// Main parser
// ----------------------------------------------------------------------

export async function parseDhlDasZipsFile(
  file: FileBuffer,
): Promise<DasZipsParseResult> {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Open workbook
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(arrayBufferFromBufferLike(file.buffer))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      errors: [`File "${file.name}" failed to read as XLSX: ${msg}`],
      warnings, summary: null, firstRows: [], zipRows: [],
    }
  }

  // 2. Validate sheet name (exact match per spec § 6)
  const sheet = workbook.getWorksheet(SHEET_NAME)
  if (!sheet) {
    const available = workbook.worksheets.map(w => `"${w.name}"`).join(', ')
    return {
      ok: false,
      errors: [
        `File "${file.name}" missing required sheet "${SHEET_NAME}". Available: ${available || '(none)'}.`,
      ],
      warnings, summary: null, firstRows: [], zipRows: [],
    }
  }

  // 3. Read effective date from cell A2
  const effRaw = normalizeCell(sheet.getCell(EFFECTIVE_DATE_ROW, EFFECTIVE_DATE_COL).value)
  const effIso = parseEffectiveDate(effRaw)
  if (!effIso) {
    return {
      ok: false,
      errors: [
        `Cannot parse effective date from cell A2 (got "${effRaw}"). Expected format: "Effective M/D/YYYY".`,
      ],
      warnings, summary: null, firstRows: [], zipRows: [],
    }
  }

  // 4. Validate header row text
  const headerCellValue = normalizeCell(sheet.getRow(HEADER_ROW).getCell(ZIP_COL).value)
  if (headerCellValue !== HEADER_TEXT) {
    return {
      ok: false,
      errors: [
        `Header at row ${HEADER_ROW} cell A${HEADER_ROW} expected "${HEADER_TEXT}", got "${headerCellValue}".`,
      ],
      warnings, summary: null, firstRows: [], zipRows: [],
    }
  }

  // 5. Walk data rows. Tolerate trailing blanks; reject any row whose
  //    ZIP isn't exactly 5 digits or duplicates an earlier ZIP.
  const zipsSeen = new Set<string>()
  const zipsOrdered: string[] = []  // insertion order — first ZIP wins for duplicate diagnostics
  const lastRow = sheet.rowCount

  for (let r = FIRST_DATA_ROW; r <= lastRow; r++) {
    const row = sheet.getRow(r)
    const rawZip = normalizeCell(row.getCell(ZIP_COL).value)

    if (rawZip === '') continue  // trailing blank row, harmless

    // padStart handles Excel's number-coercion of leading-zero ZIPs
    // (e.g. '01005' arriving as the number 1005 in the cell value).
    const zip5 = rawZip.padStart(5, '0')

    if (!/^\d{5}$/.test(zip5)) {
      errors.push(`Row ${r}: ZIP "${rawZip}" is not exactly 5 digits.`)
      continue
    }

    if (zipsSeen.has(zip5)) {
      errors.push(`Row ${r}: duplicate ZIP "${zip5}" (already seen earlier in the file).`)
      continue
    }
    zipsSeen.add(zip5)
    zipsOrdered.push(zip5)
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstRows: [], zipRows: [] }
  }

  // 6. Sanity bounds (spec § 6 — both are hard errors)
  if (zipsOrdered.length < MIN_ZIPS) {
    return {
      ok: false,
      errors: [
        `File has ${zipsOrdered.length} ZIPs, below sanity floor ${MIN_ZIPS}. Likely wrong file or accidentally-truncated source.`,
      ],
      warnings, summary: null, firstRows: [], zipRows: [],
    }
  }
  if (zipsOrdered.length > MAX_ZIPS) {
    return {
      ok: false,
      errors: [
        `File has ${zipsOrdered.length} ZIPs, above sanity ceiling ${MAX_ZIPS}. Likely a format change or the wrong file entirely.`,
      ],
      warnings, summary: null, firstRows: [], zipRows: [],
    }
  }

  // 7. Build INSERT-ready row set in source order. Order doesn't matter
  //    to the DB (no PK conflict possible here since dupes are pre-checked
  //    and the table's PK is (zip5, effective_date)) but stable source
  //    order makes the ZIP payload reproducible across runs.
  const zipRows: DasZipRow[] = zipsOrdered.map(zip5 => ({
    zip5,
    effective_date: effIso,
    source: SOURCE_LABEL,
    notes: null,
  }))

  // 8. Preview slice — first 10 ZIPs in ascending numeric/lexicographic
  //    order (5-digit zero-padded ZIPs sort identically either way).
  //    Independent of source-order so the operator gets a predictable
  //    "starts at 01005" sanity preview.
  const sortedZips = [...zipsSeen].sort()
  const firstRows: DasZipPreviewRow[] = sortedZips.slice(0, 10).map(zip5 => ({ zip5 }))

  const summary: DasZipsPreviewSummary = {
    totalZips: zipRows.length,
    effectiveDate: effIso,
    effectiveDateRaw: effRaw,
    source: SOURCE_LABEL,
  }

  return {
    ok: true,
    errors: [],
    warnings,
    summary,
    firstRows,
    zipRows,
  }
}
