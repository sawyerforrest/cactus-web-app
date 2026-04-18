'use server'

// =============================================================
// CACTUS INVOICE CSV — Stage 5, Step 8
// FILE: src/alamo/app/billing/[id]/actions/csv.ts
//
// Generates a per-line-item CSV for a single cactus_invoice.
// One row per invoice_line_item. Columns are fixed and shared
// across all clients (no per-org schema variation).
//
// Display rules (non-negotiable, mirror PDF logic):
//   - lassoed_carrier_account → Carrier Charge column is empty.
//     (Empty string in the cell — not 0.00, not "N/A", not "—".
//     Lassoed lines bill from final_billed_rate alone; the
//     carrier charge is internal Cactus data the client should
//     never see.)
//   - dark_carrier_account → Carrier Charge column is populated.
//     (Dark account clients see both their carrier rate and the
//     billed amount because dark accounts pass-through carrier
//     billing transparently.)
//   - Final Amount is always populated regardless of mode.
//
// Money format: plain decimal, no currency symbol, no commas.
//   Reason: spreadsheet apps parse plain decimals as numbers
//   automatically; symbols and separators force text type and
//   break SUM().
//
// Tracking number format: prefixed with U+0009 TAB.
//   Reason: Excel auto-converts long numeric strings (e.g.
//   1Z9999999999999999) to scientific notation, destroying the
//   original. A leading tab is the most cross-platform-friendly
//   text-coercion hint — Google Sheets ignores it visually,
//   Excel respects it. The alternative (=" "" wrapping) renders
//   ugly in Sheets and is more fragile when the file round-trips.
//
// Account Mode is intentionally NOT a column. The lassoed/dark
// distinction is internal Cactus architecture and is never
// surfaced in client-facing artifacts (PDF, CSV, Cactus Portal).
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'

export type GenerateCSVResult = {
  csv: string
  filename: string
}

export async function generateInvoiceCSV(
  cactusInvoiceId: string,
): Promise<GenerateCSVResult> {
  const admin = createAdminSupabaseClient()

  // WHY two queries: the invoice header gives us the org name
  // for the filename slug; the line items query is a single
  // join to org_carrier_accounts (for mode) and locations
  // (for origin), avoiding a per-row waterfall.
  const { data: invoice, error: invoiceError } = await admin
    .from('cactus_invoices')
    .select(`
      id,
      organizations ( name )
    `)
    .eq('id', cactusInvoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(
      `Failed to load cactus_invoice ${cactusInvoiceId}: ` +
      (invoiceError?.message ?? 'not found'),
    )
  }

  const { data: lineItems, error: lineError } = await admin
    .from('cactus_invoice_line_items')
    .select(`
      invoice_line_items (
        tracking_number,
        service_level,
        date_shipped,
        weight_billed,
        zone,
        carrier_charge,
        final_billed_rate,
        org_carrier_accounts (
          carrier_account_mode,
          carrier_code
        ),
        locations (
          name
        )
      )
    `)
    .eq('cactus_invoice_id', cactusInvoiceId)

  if (lineError) {
    throw new Error(`Failed to load line items: ${lineError.message}`)
  }

  const headers = [
    'Tracking Number',
    'Carrier',
    'Service Level',
    'Date Shipped',
    'Origin Location',
    'Weight',
    'Zone',
    'Carrier Charge',
    'Final Amount',
  ]

  const rows: string[] = [headers.join(',')]

  for (const row of lineItems ?? []) {
    const line = (row as any).invoice_line_items
    if (!line) continue

    const mode = line.org_carrier_accounts?.carrier_account_mode
    const isLassoed = mode === 'lassoed_carrier_account'

    const carrierChargeCell = isLassoed
      ? ''
      : new Decimal(line.carrier_charge ?? 0).toFixed(2)

    const finalAmountCell = new Decimal(line.final_billed_rate ?? 0).toFixed(2)

    // Tab prefix forces Excel to read as text; Sheets ignores it.
    const trackingCell = line.tracking_number
      ? `\t${line.tracking_number}`
      : ''

    rows.push([
      csvEscape(trackingCell),
      csvEscape(line.org_carrier_accounts?.carrier_code ?? ''),
      csvEscape(line.service_level ?? ''),
      line.date_shipped ?? '',
      csvEscape(line.locations?.name ?? ''),
      line.weight_billed != null ? String(line.weight_billed) : '',
      csvEscape(line.zone ?? ''),
      carrierChargeCell,
      finalAmountCell,
    ].join(','))
  }

  // CRLF line endings — Excel's preferred CSV dialect.
  const csv = rows.join('\r\n') + '\r\n'

  const orgName: string =
    ((invoice as any).organizations?.name) ?? 'unknown-org'
  const slug =
    orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'unknown-org'
  const shortId = cactusInvoiceId.slice(0, 8)
  const filename = `cactus-invoice-${shortId}-${slug}.csv`

  return { csv, filename }
}

// Quote only when the value contains characters that would
// confuse a CSV parser. Tabs are intentionally NOT in the
// trigger set — we want the leading tab on tracking numbers
// to remain unquoted so Excel's text-coercion hint fires.
function csvEscape(value: string): string {
  if (value === '' || value == null) return ''
  if (!/[,"\n\r]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}
