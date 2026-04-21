// =============================================================
// RFC 4180 CSV writer — emits UTF-8 BOM + CRLF + RFC-style
// quoting. Hand-rolled on purpose: csv-stringify and similar
// libraries default to LF line endings, which Excel treats
// inconsistently. We need the exact bytes the spec prescribes.
// =============================================================

export const CRLF = '\r\n'
export const UTF8_BOM = '\ufeff'

// Quote a cell only when it contains characters that would
// confuse an RFC-4180 parser. Tabs are intentionally NOT a
// trigger — leading-tab tracking numbers must remain unquoted
// so Excel's text-coercion hint fires.
export function escapeCell(value: string): string {
  if (value === null || value === undefined) return ''
  if (value === '') return ''
  if (!/[,"\n\r]/.test(value)) return value
  return '"' + value.replace(/"/g, '""') + '"'
}

export function writeRow(cells: string[]): string {
  return cells.map(escapeCell).join(',') + CRLF
}

// Build a complete CSV string including:
//   - UTF-8 BOM at the start (so Excel on Windows opens UTF-8
//     as UTF-8 rather than CP-1252)
//   - one header row
//   - all data rows (CRLF-terminated)
//   - optional footnote as a single-cell row at the end
export function buildCsv(
  headers: string[],
  dataRows: string[][],
  footnote?: string
): string {
  let out = UTF8_BOM
  out += writeRow(headers)
  for (const row of dataRows) {
    out += writeRow(row)
  }
  if (footnote) {
    out += writeRow([footnote])
  }
  return out
}
