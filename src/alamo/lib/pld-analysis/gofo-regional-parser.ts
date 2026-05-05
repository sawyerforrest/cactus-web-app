// ==========================================================
// FILE: src/alamo/lib/pld-analysis/gofo-regional-parser.ts
// PURPOSE: Server-only parser for the GOFO Regional Coverage XLSX.
//
// Implements docs/session-archives/specs/gofo-regional-parser-spec.md.
//
// One source file feeds two target tables atomically:
//   - service_coverage_zips        (one row per ZIP, is_serviceable=true)
//   - gofo_regional_zone_matrix    (one row per ZIP × hub, with EWR/JFK split)
//
// The parser is pure — it validates the file shape and produces the rows
// that would be written, without touching the database. The commit
// Server Action is responsible for the atomic two-table write.
//
// Spec reference: section numbers below match the spec.
// ==========================================================

import ExcelJS from 'exceljs'

// -----------------------------------------------------------------------
// Constants from spec
// -----------------------------------------------------------------------

const EXPECTED_SHEET_NAME = 'Zip Code List'
const HEADER_ROW_INDEX = 3  // 1-indexed (rows 1-2 are merged title cells)
const FIRST_DATA_ROW = 4

// Column header → 0-indexed column position in the header row.
// 'DFW ' has a trailing space in the source file; we normalize on read.
const EXPECTED_HEADERS: Array<{ raw: string; normalized: string }> = [
  { raw: 'Zip Code', normalized: 'Zip Code' },
  { raw: 'LAX',      normalized: 'LAX' },
  { raw: 'DFW ',     normalized: 'DFW' },
  { raw: 'ORD',      normalized: 'ORD' },
  { raw: 'EWR/JFK',  normalized: 'EWR/JFK' },
  { raw: 'ATL',      normalized: 'ATL' },
  { raw: 'MIA',      normalized: 'MIA' },
  { raw: 'SLC',      normalized: 'SLC' },
]

const HUB_COLUMNS = ['LAX', 'DFW', 'ORD', 'EWR/JFK', 'ATL', 'MIA', 'SLC'] as const
type HubColumn = (typeof HUB_COLUMNS)[number]

const VALID_ZONE_VALUES = new Set(['1', '2', '3', '4', '5', '6', '7', '8'])
const SENTINEL_NOT_SERVICEABLE = '-'

const MIN_REASONABLE_ROWS = 1_000
const MAX_REASONABLE_ROWS = 50_000

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type InjectionPoint = 'LAX' | 'DFW' | 'ORD' | 'EWR' | 'JFK' | 'ATL' | 'MIA' | 'SLC'

export interface ParsedZipRow {
  zip5: string
  // Keyed by source column header (EWR/JFK is one entry pre-split).
  // null means the cell was '-' (not serviceable from this hub).
  zonesBySourceColumn: Record<HubColumn, string | null>
}

export interface ServiceCoverageRow {
  carrier_code: 'GOFO'
  service_level: 'Regional'
  zip5: string
  is_serviceable: true
  effective_date: string
  source: string
}

export interface ZoneMatrixRow {
  matrix_version: string
  injection_point: InjectionPoint
  dest_zip5: string
  zone: string
  effective_date: string
  source: string
}

export interface ParserSummary {
  totalZipRows: number
  totalServiceableCells: number       // hub cells that were not '-'
  totalNonServiceableCells: number    // hub cells that were '-'
  expectedZoneMatrixRows: number      // after EWR/JFK split + sentinel skip
  expectedCoverageRows: number        // = totalZipRows
  effectiveDate: string
  matrixVersion: string
}

export interface ParseResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: ParserSummary | null
  firstTenRows: ParsedZipRow[]
  coverageRows: ServiceCoverageRow[]
  zoneMatrixRows: ZoneMatrixRow[]
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function normalizeCell(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') {
    // Excel may return integers as numbers; we keep them as integer strings
    // (e.g., 1, 2, ...). Avoid scientific notation for very large or very
    // small values.
    if (Number.isInteger(value)) return value.toString()
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  // ExcelJS rich-text / formula / hyperlink object cases — extract .text or .result.
  // Cast through unknown because ExcelJS's CellValue union doesn't directly
  // overlap with a generic record shape.
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    if (typeof obj.text === 'string') return (obj.text as string).trim()
    if (typeof obj.result === 'string') return (obj.result as string).trim()
    if (typeof obj.result === 'number') return String(obj.result)
  }
  return String(value).trim()
}

function isFiveDigitZip(s: string): boolean {
  return /^\d{5}$/.test(s)
}

// -----------------------------------------------------------------------
// Main parser
// -----------------------------------------------------------------------

export async function parseGofoRegionalXlsx(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  effectiveDate: string,
): Promise<ParseResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const firstTenRows: ParsedZipRow[] = []
  const coverageRows: ServiceCoverageRow[] = []
  const zoneMatrixRows: ZoneMatrixRow[] = []
  let totalZipRows = 0
  let totalServiceableCells = 0
  let totalNonServiceableCells = 0
  const seenZips = new Set<string>()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    errors.push(`Invalid effective_date "${effectiveDate}" — must be YYYY-MM-DD`)
    return { ok: false, errors, warnings, summary: null, firstTenRows, coverageRows, zoneMatrixRows }
  }

  // matrix_version is deterministically the effective_date string per spec § 4.
  const matrixVersion = effectiveDate

  // ----- Load workbook -----

  const workbook = new ExcelJS.Workbook()
  try {
    const ab =
      buffer instanceof ArrayBuffer
        ? buffer
        : (buffer as Uint8Array).buffer.slice(
            (buffer as Uint8Array).byteOffset,
            (buffer as Uint8Array).byteOffset + (buffer as Uint8Array).byteLength,
          )
    await workbook.xlsx.load(ab as ArrayBuffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`Failed to read XLSX: ${msg}`)
    return { ok: false, errors, warnings, summary: null, firstTenRows, coverageRows, zoneMatrixRows }
  }

  // ----- Find expected sheet -----

  const sheet = workbook.getWorksheet(EXPECTED_SHEET_NAME)
  if (!sheet) {
    const available = workbook.worksheets.map(w => `"${w.name}"`).join(', ')
    errors.push(
      `Expected worksheet "${EXPECTED_SHEET_NAME}" not found. Available sheets: ${available || '(none)'}`,
    )
    return { ok: false, errors, warnings, summary: null, firstTenRows, coverageRows, zoneMatrixRows }
  }

  // ----- Validate header row -----

  const headerRow = sheet.getRow(HEADER_ROW_INDEX)
  const headerCells: string[] = []
  for (let i = 1; i <= EXPECTED_HEADERS.length; i++) {
    headerCells.push(normalizeCell(headerRow.getCell(i).value))
  }

  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    const expected = EXPECTED_HEADERS[i].normalized
    const actual = headerCells[i]
    // Exact comparison after our trim. Source has trailing space on 'DFW '
    // — normalizeCell trimmed it, so we compare against 'DFW' (normalized).
    if (actual !== expected) {
      errors.push(
        `Header row mismatch at column ${i + 1}: expected "${expected}", got "${actual}". Header row must be row ${HEADER_ROW_INDEX} with columns: ${EXPECTED_HEADERS.map(h => h.normalized).join(', ')}.`,
      )
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstTenRows, coverageRows, zoneMatrixRows }
  }

  // Sanity: confirm EWR/JFK is at the position we expect (spec § 5 hard-error guard).
  const ewrJfkIndex = headerCells.indexOf('EWR/JFK')
  if (ewrJfkIndex === -1) {
    errors.push('EWR/JFK column missing — parser depends on it for the hub split.')
    return { ok: false, errors, warnings, summary: null, firstTenRows, coverageRows, zoneMatrixRows }
  }

  // ----- Iterate data rows -----

  // ExcelJS rowCount can include empty trailing rows; we iterate to actualRowCount.
  // sheet.rowCount returns the highest row index that has data; that's safe.
  const lastRow = sheet.rowCount

  for (let rowIdx = FIRST_DATA_ROW; rowIdx <= lastRow; rowIdx++) {
    const row = sheet.getRow(rowIdx)
    const zipRaw = normalizeCell(row.getCell(1).value)
    if (zipRaw === '') {
      // Allow trailing empty rows silently.
      continue
    }

    if (!isFiveDigitZip(zipRaw)) {
      errors.push(`Row ${rowIdx}: ZIP "${zipRaw}" is not exactly 5 digits.`)
      continue
    }

    if (seenZips.has(zipRaw)) {
      errors.push(`Row ${rowIdx}: duplicate ZIP "${zipRaw}".`)
      continue
    }
    seenZips.add(zipRaw)
    totalZipRows++

    // Read the 7 hub cells.
    const zonesBySourceColumn: Record<HubColumn, string | null> = {
      LAX: null,
      DFW: null,
      ORD: null,
      'EWR/JFK': null,
      ATL: null,
      MIA: null,
      SLC: null,
    }

    let rowHasError = false
    for (let i = 0; i < HUB_COLUMNS.length; i++) {
      const col = HUB_COLUMNS[i]
      // Hub columns start at cell 2 (cell 1 is Zip Code).
      const cellRaw = normalizeCell(row.getCell(2 + i).value)

      if (cellRaw === SENTINEL_NOT_SERVICEABLE) {
        zonesBySourceColumn[col] = null
        totalNonServiceableCells++
        continue
      }

      if (!VALID_ZONE_VALUES.has(cellRaw)) {
        errors.push(
          `Row ${rowIdx} (ZIP ${zipRaw}), column ${col}: zone value "${cellRaw}" is not in {1..8, -}.`,
        )
        rowHasError = true
        continue
      }

      zonesBySourceColumn[col] = cellRaw
      totalServiceableCells++
    }

    if (rowHasError) continue

    // Build the parsed row record (used for first-10-rows preview).
    const parsedRow: ParsedZipRow = { zip5: zipRaw, zonesBySourceColumn }
    if (firstTenRows.length < 10) firstTenRows.push(parsedRow)

    // Build coverage row (one per ZIP — always serviceable per spec § 3).
    coverageRows.push({
      carrier_code: 'GOFO',
      service_level: 'Regional',
      zip5: zipRaw,
      is_serviceable: true,
      effective_date: effectiveDate,
      source: 'GOFO Regional ZIP coverage XLSX',
    })

    // Build zone-matrix rows. EWR/JFK splits into two; everything else 1:1.
    for (const col of HUB_COLUMNS) {
      const zone = zonesBySourceColumn[col]
      if (zone === null) continue  // sentinel skip

      if (col === 'EWR/JFK') {
        zoneMatrixRows.push({
          matrix_version: matrixVersion,
          injection_point: 'EWR',
          dest_zip5: zipRaw,
          zone,
          effective_date: effectiveDate,
          source: 'GOFO Regional zone matrix XLSX',
        })
        zoneMatrixRows.push({
          matrix_version: matrixVersion,
          injection_point: 'JFK',
          dest_zip5: zipRaw,
          zone,
          effective_date: effectiveDate,
          source: 'GOFO Regional zone matrix XLSX',
        })
      } else {
        zoneMatrixRows.push({
          matrix_version: matrixVersion,
          injection_point: col as InjectionPoint,
          dest_zip5: zipRaw,
          zone,
          effective_date: effectiveDate,
          source: 'GOFO Regional zone matrix XLSX',
        })
      }
    }
  }

  // ----- Sanity bounds (spec § 5 hard errors) -----

  if (totalZipRows < MIN_REASONABLE_ROWS) {
    errors.push(
      `Total ZIP rows (${totalZipRows}) is below the sanity floor of ${MIN_REASONABLE_ROWS}. Wrong file?`,
    )
  }
  if (totalZipRows > MAX_REASONABLE_ROWS) {
    errors.push(
      `Total ZIP rows (${totalZipRows}) exceeds the sanity ceiling of ${MAX_REASONABLE_ROWS}. Wrong file?`,
    )
  }

  // ----- Soft warning: ZIPs serviceable from < 3 hubs (spec § 5) -----

  let lowCoverageCount = 0
  for (const row of coverageRows) {
    // Re-iterate via the seenZips order isn't trivial; instead, we walk
    // zoneMatrixRows once to count per-ZIP hub presence.
    void row
  }
  const hubCountByZip = new Map<string, number>()
  for (const z of zoneMatrixRows) {
    // EWR + JFK both count even though they share a source cell — that
    // matches the operational reality of two distinct injection points.
    hubCountByZip.set(z.dest_zip5, (hubCountByZip.get(z.dest_zip5) ?? 0) + 1)
  }
  for (const count of hubCountByZip.values()) {
    if (count < 3) lowCoverageCount++
  }
  if (lowCoverageCount > 0) {
    warnings.push(
      `${lowCoverageCount} ZIPs are serviceable from fewer than 3 hubs — operationally unusual but valid.`,
    )
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstTenRows, coverageRows, zoneMatrixRows }
  }

  const summary: ParserSummary = {
    totalZipRows,
    totalServiceableCells,
    totalNonServiceableCells,
    expectedZoneMatrixRows: zoneMatrixRows.length,
    expectedCoverageRows: coverageRows.length,
    effectiveDate,
    matrixVersion,
  }

  return { ok: true, errors, warnings, summary, firstTenRows, coverageRows, zoneMatrixRows }
}
