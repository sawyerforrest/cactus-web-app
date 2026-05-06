// ==========================================================
// FILE: src/alamo/lib/pld-analysis/gofo-standard-parser.ts
// PURPOSE: Server-only single-file parser for the GOFO Standard
// Zone matrix workbook (one .xlsx with 8 hub tabs).
//
// Implements docs/session-archives/specs/gofo-standard-zones-parser-spec.md.
//
// Output of a successful parse:
//   - 8 ParsedHub records, each with ~931 ZIP3-aggregated rows
//   - 7,448 ZoneMatrixRow records ready for INSERT into
//     carrier_zone_matrices (carrier_code='GOFO', service_level='Standard')
//   - A summary suitable for the GofoPreviewPanel
//
// The parser is pure: it accepts a raw file buffer + a hub lookup
// map + an operator-picked effective date, and returns rows +
// diagnostics. No DB access, no Storage access — the caller (a
// Server Action) handles those.
//
// Architectural note from spec § 2: GOFO Economy and Standard share
// the same zone matrix at rating time. We insert as service_level=
// 'Standard' only; the rating engine reads these rows for both
// services. If GOFO ever publishes Economy with divergent zones,
// add a second insertion path with service_level='Economy' from the
// same tabs — schema already supports it.
//
// Architectural note from spec § 3: every ZIP3 in source has a
// uniform zone across all its ZIP5s. Parser asserts this invariant
// (lossless flatten) and HARD-ERRORS on any intra-ZIP3 zone variance —
// the architecture re-evaluation gets triggered immediately rather
// than silently picking a winner.
// ==========================================================

import ExcelJS from 'exceljs'
import type {
  GofoHubSummary,
  GofoPreviewRow,
  GofoStandardPreviewSummary,
} from '@/app/pld-analysis/reference-data/zone-matrices/types'
import { CANONICAL_GOFO_HUB_CODES } from '@/app/pld-analysis/reference-data/zone-matrices/types'

// ----------------------------------------------------------------------
// Constants from spec
// ----------------------------------------------------------------------

// Tab name (after whitespace strip) → hub_code. Per spec § 2 the source
// workbook's tab names are inconsistent in whitespace ('ECOCE, STDCE'
// with a space after the comma vs 'ECOWE,STDWE' without). normalizeTabName()
// strips ALL whitespace before lookup so both forms resolve consistently.
const TAB_TO_HUB: Record<string, string> = {
  'ECOWE,STDWE': 'LAX',
  'ECONE,STDNE': 'JFK',
  'ECONJ,STDNJ': 'EWR',
  'ECOCE,STDCE': 'ORD',
  'ECOEA,STDEA': 'ATL',
  'ECOSO,STDSO': 'DFW',
  'ECOSE,STDSE': 'MIA',
  'ECOSL,STDSL': 'SLC',
}

// Required column headers per spec § 2. The optional 'Remote tab' column
// (LAX-only, informational) is intentionally NOT required and is
// ignored if present.
const REQUIRED_HEADERS = ['Zone', 'Closing Zip', '3-digit'] as const

// Zone vocabulary per spec § 4. The numeric set is inclusive 2-8 (no '1',
// no '9', no '10', no '11+'). The remote set covers N ∈ {1,2,4,5,6,7,8,9}
// — note no 'remote 3' was observed in source. Both sets are exact-match
// strings; case variants ('Remote 1', 'REMOTE 1') and zero-padded variants
// ('remote 01') are rejected so any future GOFO format drift fails loudly
// rather than silently misclassifying.
const VALID_NUMERIC_ZONES = new Set(['2', '3', '4', '5', '6', '7', '8'])
const VALID_REMOTE_ZONES = new Set([
  'remote 1', 'remote 2', 'remote 4', 'remote 5',
  'remote 6', 'remote 7', 'remote 8', 'remote 9',
])

const EXPECTED_ZIP3_PER_HUB = 931
// Sanity bounds — anything outside this range is a hard error (e.g., the
// upload picked the wrong file or GOFO restructured the matrix). Within
// bounds but != 931 is a warning.
const ZIP3_LOWER_BOUND = 800
const ZIP3_UPPER_BOUND = 1100

// Header row search depth. Most GOFO tabs have headers in row 1 (per
// 2026-05-05 inspection), but we scan a small window to tolerate any
// leading metadata rows GOFO might add.
const HEADER_SEARCH_ROWS = 10
const HEADER_SEARCH_COLS = 12

const SOURCE_LABEL = 'GOFO Standard Zones XLSX (single workbook, 8 hub tabs)'

// ----------------------------------------------------------------------
// Types (parser-internal — public ones come from the page's types.ts)
// ----------------------------------------------------------------------

export interface HubLookup {
  /** hub_code → primary_zip5 (full 5-digit ZIP from gofo_hubs).
   *  origin_zip3 is derived as primary_zip5.slice(0,3) per Pattern 5
   *  (live query, never hardcoded). */
  byHub: Map<string, { primary_zip5: string }>
}

export interface ZoneMatrixRow {
  carrier_code: 'GOFO'
  service_level: 'Standard'
  matrix_version: string
  origin_zip3: string
  dest_zip3: string
  zone: string
  effective_date: string  // ISO YYYY-MM-DD (operator-picked)
  source: string
  notes: string
}

interface ParsedHub {
  hub_code: string
  origin_zip3: string
  /** dest_zip3 → zone (one entry per ZIP3 after aggregation, ~931) */
  zip3Rows: Map<string, string>
}

export interface GofoStandardParseResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: GofoStandardPreviewSummary | null
  firstRows: GofoPreviewRow[]
  /** Full row set ready for INSERT. Empty when ok=false. */
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

// Strip ALL whitespace, not just leading/trailing. The source workbook's
// tab names use both 'ECOCE, STDCE' (space after comma) and 'ECOWE,STDWE'
// (no space) for the same delimiter pattern; both should resolve to the
// same hub.
function normalizeTabName(name: string): string {
  return name.replace(/\s+/g, '')
}

function arrayBufferFromBufferLike(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf
  return (buf as Uint8Array).buffer.slice(
    (buf as Uint8Array).byteOffset,
    (buf as Uint8Array).byteOffset + (buf as Uint8Array).byteLength,
  ) as ArrayBuffer
}

function isValidZone(z: string): boolean {
  return VALID_NUMERIC_ZONES.has(z) || VALID_REMOTE_ZONES.has(z)
}

interface HeaderLocation {
  headerRow: number
  zoneCol: number
  zipCol: number
  threeCol: number
}

function findHeaderRow(sheet: ExcelJS.Worksheet): HeaderLocation | null {
  const lastRowToScan = Math.min(HEADER_SEARCH_ROWS, sheet.rowCount)
  for (let r = 1; r <= lastRowToScan; r++) {
    const row = sheet.getRow(r)
    let zoneCol = -1, zipCol = -1, threeCol = -1
    for (let c = 1; c <= HEADER_SEARCH_COLS; c++) {
      const v = normalizeCell(row.getCell(c).value)
      if (v === 'Zone') zoneCol = c
      else if (v === 'Closing Zip') zipCol = c
      else if (v === '3-digit') threeCol = c
    }
    if (zoneCol > 0 && zipCol > 0 && threeCol > 0) {
      return { headerRow: r, zoneCol, zipCol, threeCol }
    }
  }
  return null
}

// ----------------------------------------------------------------------
// Per-hub tab parser
// ----------------------------------------------------------------------

interface HubParseOutcome {
  ok: boolean
  errors: string[]
  warnings: string[]
  parsed: ParsedHub | null
}

function parseHubTab(
  sheet: ExcelJS.Worksheet,
  hubCode: string,
  primary_zip5: string,
): HubParseOutcome {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Locate header row (Zone / Closing Zip / 3-digit columns)
  const hdr = findHeaderRow(sheet)
  if (!hdr) {
    return {
      ok: false,
      errors: [
        `Tab for hub ${hubCode} ("${sheet.name}"): required headers (${REQUIRED_HEADERS.join(', ')}) not found in first ${HEADER_SEARCH_ROWS} rows.`,
      ],
      warnings: [],
      parsed: null,
    }
  }

  // 2. Walk data rows, validating shape + vocabulary as we go
  type Triple = { zip5: string; zip3: string; zone: string; rowNum: number }
  const triples: Triple[] = []
  const lastRow = sheet.rowCount

  for (let r = hdr.headerRow + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r)
    const zoneRaw = normalizeCell(row.getCell(hdr.zoneCol).value)
    const zip5Raw = normalizeCell(row.getCell(hdr.zipCol).value)
    const zip3Raw = normalizeCell(row.getCell(hdr.threeCol).value)

    // Tolerate fully blank rows (workbook may have trailing blanks)
    if (zoneRaw === '' && zip5Raw === '' && zip3Raw === '') continue

    // Partial blanks are an error — surface the row number for debugging
    if (zoneRaw === '' || zip5Raw === '' || zip3Raw === '') {
      errors.push(
        `Tab for hub ${hubCode} row ${r}: incomplete data (Zone="${zoneRaw}", Closing Zip="${zip5Raw}", 3-digit="${zip3Raw}").`,
      )
      continue
    }

    // Pad-left to handle Excel's number coercion of leading-zero ZIPs
    // ('00500' becoming the number 500 in the cell's value). Spec requires
    // exact 5-digit / 3-digit shape after padding.
    const zip5 = zip5Raw.padStart(5, '0')
    const zip3 = zip3Raw.padStart(3, '0')

    if (!/^\d{5}$/.test(zip5)) {
      errors.push(`Tab for hub ${hubCode} row ${r}: ZIP5 "${zip5}" is not 5 digits.`)
      continue
    }
    if (!/^\d{3}$/.test(zip3)) {
      errors.push(`Tab for hub ${hubCode} row ${r}: 3-digit "${zip3}" is not 3 digits.`)
      continue
    }
    if (zip3 !== zip5.slice(0, 3)) {
      errors.push(
        `Tab for hub ${hubCode} row ${r}: 3-digit column "${zip3}" doesn't match ZIP5 prefix "${zip5.slice(0, 3)}".`,
      )
      continue
    }

    if (!isValidZone(zoneRaw)) {
      errors.push(
        `Tab for hub ${hubCode} row ${r}: zone "${zoneRaw}" not in valid set (numeric 2-8 or 'remote {1,2,4,5,6,7,8,9}').`,
      )
      continue
    }

    triples.push({ zip5, zip3, zone: zoneRaw, rowNum: r })
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, parsed: null }
  }
  if (triples.length === 0) {
    return {
      ok: false,
      errors: [`Tab for hub ${hubCode}: zero data rows found below header row ${hdr.headerRow}.`],
      warnings,
      parsed: null,
    }
  }

  // 3. ZIP5 → ZIP3 lossless aggregation. Group by 3-digit, assert exactly
  // one distinct zone per group. Any intra-ZIP3 zone variance HARD ERRORS
  // — per spec § 3 this means GOFO has restructured the matrix and the
  // architecture needs revisiting (we can no longer represent the data
  // with a ZIP3-keyed schema).
  const zonesByZip3 = new Map<string, Set<string>>()
  const sampleRowByZip3Zone = new Map<string, number>()  // for diagnostic msg
  for (const t of triples) {
    let s = zonesByZip3.get(t.zip3)
    if (!s) { s = new Set(); zonesByZip3.set(t.zip3, s) }
    s.add(t.zone)
    const key = `${t.zip3}|${t.zone}`
    if (!sampleRowByZip3Zone.has(key)) sampleRowByZip3Zone.set(key, t.rowNum)
  }
  const zip3Rows = new Map<string, string>()
  for (const [zip3, zones] of zonesByZip3) {
    if (zones.size !== 1) {
      const sortedZones = [...zones].sort()
      const samples = sortedZones.map(z => `${z} (first seen row ${sampleRowByZip3Zone.get(`${zip3}|${z}`)})`).join(', ')
      errors.push(
        `Tab for hub ${hubCode}: ZIP3 ${zip3} has ${zones.size} distinct zones across its ZIP5s [${samples}]. Lossless ZIP5→ZIP3 aggregation invariant violated — GOFO matrix may have restructured; halt and revisit architecture.`,
      )
      continue
    }
    zip3Rows.set(zip3, [...zones][0])
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings, parsed: null }
  }

  // 4. Sanity bounds on aggregated ZIP3 count
  if (zip3Rows.size < ZIP3_LOWER_BOUND || zip3Rows.size > ZIP3_UPPER_BOUND) {
    return {
      ok: false,
      errors: [
        `Tab for hub ${hubCode}: ${zip3Rows.size} distinct ZIP3s outside sanity range ${ZIP3_LOWER_BOUND}–${ZIP3_UPPER_BOUND} (expected ~${EXPECTED_ZIP3_PER_HUB}). Likely wrong file or major restructure.`,
      ],
      warnings,
      parsed: null,
    }
  }
  if (zip3Rows.size !== EXPECTED_ZIP3_PER_HUB) {
    warnings.push(
      `Tab for hub ${hubCode}: ${zip3Rows.size} ZIP3s vs expected ${EXPECTED_ZIP3_PER_HUB}. Within sanity bounds but worth a look.`,
    )
  }

  return {
    ok: true,
    errors: [],
    warnings,
    parsed: {
      hub_code: hubCode,
      origin_zip3: primary_zip5.slice(0, 3),
      zip3Rows,
    },
  }
}

// ----------------------------------------------------------------------
// Main parser
// ----------------------------------------------------------------------

export async function parseGofoStandardZonesFile(
  file: FileBuffer,
  hubLookup: HubLookup,
  effectiveDate: string,
): Promise<GofoStandardParseResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const expectedTabs = CANONICAL_GOFO_HUB_CODES.length

  // 1. Validate hub lookup completeness — every canonical hub must be
  // present in gofo_hubs. If not, we can't derive origin_zip3 for that
  // hub and the upload should be blocked rather than producing partial
  // matrix data.
  for (const hub of CANONICAL_GOFO_HUB_CODES) {
    if (!hubLookup.byHub.has(hub)) {
      errors.push(
        `gofo_hubs lookup missing required hub "${hub}". Re-seed gofo_hubs (see migration v1.10.0-019).`,
      )
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstRows: [], zoneMatrixRows: [] }
  }

  // 2. Open workbook
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(arrayBufferFromBufferLike(file.buffer))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      errors: [`File "${file.name}" failed to read as XLSX: ${msg}`],
      warnings, summary: null, firstRows: [], zoneMatrixRows: [],
    }
  }

  // 3. Map workbook tabs → hub codes via TAB_TO_HUB. Whitespace-strip first.
  const tabsByHub = new Map<string, ExcelJS.Worksheet>()
  const rawTabNameByHub = new Map<string, string>()
  const unknownTabs: string[] = []

  for (const sheet of workbook.worksheets) {
    const normalized = normalizeTabName(sheet.name)
    const hub = TAB_TO_HUB[normalized]
    if (!hub) {
      unknownTabs.push(sheet.name)
      continue
    }
    if (tabsByHub.has(hub)) {
      errors.push(
        `Duplicate tab for hub ${hub}: "${rawTabNameByHub.get(hub)}" and "${sheet.name}". Each hub may appear only once.`,
      )
      continue
    }
    tabsByHub.set(hub, sheet)
    rawTabNameByHub.set(hub, sheet.name)
  }

  // Unknown tabs are a warning (workbook may carry metadata sheets), not an error
  if (unknownTabs.length > 0) {
    warnings.push(`Unrecognized tabs ignored: ${unknownTabs.map(t => `"${t}"`).join(', ')}.`)
  }

  // Required-tab check
  const missingHubs: string[] = []
  for (const hub of CANONICAL_GOFO_HUB_CODES) {
    if (!tabsByHub.has(hub)) missingHubs.push(hub)
  }
  if (missingHubs.length > 0) {
    errors.push(
      `Missing ${missingHubs.length} hub tab${missingHubs.length === 1 ? '' : 's'}: ${missingHubs.join(', ')}. Expected the canonical 8 (${CANONICAL_GOFO_HUB_CODES.join(', ')}).`,
    )
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstRows: [], zoneMatrixRows: [] }
  }

  // 4. Parse each hub tab in canonical order
  const parsedByHub = new Map<string, ParsedHub>()
  for (const hub of CANONICAL_GOFO_HUB_CODES) {
    const sheet = tabsByHub.get(hub)!
    const lookup = hubLookup.byHub.get(hub)!
    const out = parseHubTab(sheet, hub, lookup.primary_zip5)
    if (!out.ok) {
      errors.push(...out.errors)
      continue
    }
    warnings.push(...out.warnings)
    parsedByHub.set(hub, out.parsed!)
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, summary: null, firstRows: [], zoneMatrixRows: [] }
  }

  // 5. Build output: zoneMatrixRows + summary + firstRows preview slice
  const zoneMatrixRows: ZoneMatrixRow[] = []
  const firstRows: GofoPreviewRow[] = []
  const hubSummaries: GofoHubSummary[] = []
  const zoneDistribution: Record<string, number> = {}
  const allDestZip3s = new Set<string>()

  // Iterate hubs in canonical order (LAX, JFK, EWR, ORD, ATL, DFW, MIA, SLC)
  // and ZIP3s in sorted order so output is deterministic across runs.
  for (const hub of CANONICAL_GOFO_HUB_CODES) {
    const parsed = parsedByHub.get(hub)!
    hubSummaries.push({
      hub_code: hub,
      origin_zip3: parsed.origin_zip3,
      rows: parsed.zip3Rows.size,
    })

    const sortedZip3s = [...parsed.zip3Rows.keys()].sort()
    for (const dest_zip3 of sortedZip3s) {
      const zone = parsed.zip3Rows.get(dest_zip3)!
      allDestZip3s.add(dest_zip3)
      zoneDistribution[zone] = (zoneDistribution[zone] ?? 0) + 1

      zoneMatrixRows.push({
        carrier_code: 'GOFO',
        service_level: 'Standard',
        matrix_version: effectiveDate,
        origin_zip3: parsed.origin_zip3,
        dest_zip3,
        zone,
        effective_date: effectiveDate,
        source: SOURCE_LABEL,
        notes: `Hub: ${hub}`,
      })

      // Capture first 10 preview rows from the canonical first hub (LAX)
      if (firstRows.length < 10 && hub === CANONICAL_GOFO_HUB_CODES[0]) {
        firstRows.push({
          hub_code: hub,
          origin_zip3: parsed.origin_zip3,
          dest_zip3,
          zone,
        })
      }
    }
  }

  const summary: GofoStandardPreviewSummary = {
    totalTabs: parsedByHub.size,
    expectedTabs,
    totalRows: zoneMatrixRows.length,
    distinctDestZip3s: allDestZip3s.size,
    zoneDistribution,
    effectiveDate,
    matrixVersion: effectiveDate,
    hubs: hubSummaries,
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
