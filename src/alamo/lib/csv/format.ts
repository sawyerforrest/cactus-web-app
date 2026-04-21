import Decimal from 'decimal.js'

// =============================================================
// CSV formatting helpers — pure functions, no I/O.
//
// Used by src/alamo/app/billing/[id]/actions/csv.ts to produce
// the 85-column client-facing CSV. Broken out so they can be
// unit-tested independently of Supabase access.
// =============================================================

// ISO date YYYY-MM-DD. Empty string when missing.
// Accepts plain date strings (already YYYY-MM-DD), full ISO
// timestamps (slice to 10), or Date objects.
export function formatDate(
  value: string | Date | null | undefined
): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

// Full ISO 8601 timestamp. Empty string when missing.
export function formatTimestamp(
  value: string | Date | null | undefined
): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return value.toISOString()
  return value
}

// Plain decimal money, 2 places, never a symbol or separator.
// Empty string when missing (NOT "0.00"), so spreadsheet SUM()
// skips missing values rather than counting them as zero.
export function formatMoney(
  value: string | number | Decimal | null | undefined
): string {
  if (value === null || value === undefined || value === '') return ''
  return new Decimal(value).toFixed(2)
}

// Decimal with configurable precision. Same null rules as money.
export function formatDecimal(
  value: string | number | Decimal | null | undefined,
  places: number
): string {
  if (value === null || value === undefined || value === '') return ''
  return new Decimal(value).toFixed(places)
}

// Tracking numbers: leading tab coerces Excel to read as text
// (otherwise "1Z99..." becomes scientific notation). Google
// Sheets ignores the leading tab visually.
export function formatTracking(value: string | null | undefined): string {
  if (!value) return ''
  return '\t' + value
}

// Boolean → Y/N. Null/undefined → N (safer default for display).
export function formatYN(value: boolean | null | undefined): string {
  return value === true ? 'Y' : 'N'
}

// Null-safe string passthrough.
export function formatString(value: string | null | undefined): string {
  return value ?? ''
}

// Short UUID prefix (first 8 chars) for a human-readable
// invoice reference column.
export function shortId(
  value: string | null | undefined,
  length = 8
): string {
  if (!value) return ''
  return value.slice(0, length)
}

// Convert an org name to a filename-safe slug:
//   "Cactus 3PL Headquarters" → "cactus-3pl-headquarters"
export function slugifyOrg(name: string | null | undefined): string {
  if (!name) return 'unknown-org'
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown-org'
  )
}
