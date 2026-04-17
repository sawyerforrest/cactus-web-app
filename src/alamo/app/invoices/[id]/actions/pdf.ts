'use server'

// =============================================================
// CACTUS INVOICE PDF — Stage 5
// FILE: src/alamo/app/invoices/[id]/actions/pdf.ts
//
// Generates a one-page PDF summary for a single cactus_invoice:
//   - Invoice header (org, billing period, due date, status)
//   - Summary by carrier (shipments + amount)
//   - Summary by origin location (shipments + amount)
//   - Total due
//
// Display rules (non-negotiable):
//   - lassoed_carrier_account → show final_merchant_rate only
//   - dark_carrier_account    → may show carrier_charge alongside
//   This PDF only shows aggregates, so in practice we sum
//   final_merchant_rate for both — the rule still governs what
//   lives in the document (no carrier_charge exposed anywhere).
//
// All money math uses decimal.js — no floats.
// =============================================================

import Decimal from 'decimal.js'
import PDFDocument from 'pdfkit'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'

const COLOR_FOREST = '#2D5A27'
const COLOR_INK = '#0D1210'
const COLOR_MUTED = '#9CA89A'
const COLOR_DIVIDER = '#D8D3C8'

type SummaryRow = { key: string; shipments: number; amount: Decimal }

function formatMoney(value: Decimal): string {
  const [whole, fraction] = value.toFixed(2).split('.')
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${withCommas}.${fraction}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

export async function generateInvoicePDF(cactusInvoiceId: string): Promise<Buffer> {
  const admin = createAdminSupabaseClient()

  const { data: invoice, error: invoiceError } = await admin
    .from('cactus_invoices')
    .select(`
      *,
      organizations ( name, terms_days )
    `)
    .eq('id', cactusInvoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(
      `Failed to load cactus_invoice ${cactusInvoiceId}: ` +
      (invoiceError?.message ?? 'not found')
    )
  }

  const { data: lineItems, error: lineError } = await admin
    .from('cactus_invoice_line_items')
    .select(`
      invoice_line_items (
        carrier_charge,
        final_merchant_rate,
        match_location_id,
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

  // =============================================================
  // AGGREGATE: per carrier_code + per location name
  // =============================================================

  const byCarrier = new Map<string, SummaryRow>()
  const byLocation = new Map<string, SummaryRow>()
  let totalDue = new Decimal(0)

  for (const row of lineItems ?? []) {
    const line = row.invoice_line_items as any
    if (!line) continue

    const amount = new Decimal(line.final_merchant_rate ?? 0)
    totalDue = totalDue.plus(amount)

    // carrier_code + carrier_account_mode both live on org_carrier_accounts.
    const carrierKey = line.org_carrier_accounts?.carrier_code ?? 'UNKNOWN'
    const carrierEntry = byCarrier.get(carrierKey)
    if (carrierEntry) {
      carrierEntry.shipments += 1
      carrierEntry.amount = carrierEntry.amount.plus(amount)
    } else {
      byCarrier.set(carrierKey, { key: carrierKey, shipments: 1, amount })
    }

    // locations now lives under invoice_line_items via match_location_id FK
    const locationKey = line.locations?.name ?? 'Unknown'
    const locationEntry = byLocation.get(locationKey)
    if (locationEntry) {
      locationEntry.shipments += 1
      locationEntry.amount = locationEntry.amount.plus(amount)
    } else {
      byLocation.set(locationKey, { key: locationKey, shipments: 1, amount })
    }
  }

  const carrierRows = [...byCarrier.values()].sort((a, b) =>
    b.amount.cmp(a.amount)
  )
  const locationRows = [...byLocation.values()].sort((a, b) =>
    b.amount.cmp(a.amount)
  )

  const org = (invoice as any).organizations
  const orgName: string = org?.name ?? 'Unknown Org'
  const shortId = cactusInvoiceId.slice(0, 8)

  // =============================================================
  // RENDER PDF
  // =============================================================

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve())
    doc.on('error', reject)
  })

  const pageLeft = doc.page.margins.left
  const pageRight = doc.page.width - doc.page.margins.right
  const contentWidth = pageRight - pageLeft

  const drawDivider = () => {
    const y = doc.y + 6
    doc.moveTo(pageLeft, y).lineTo(pageRight, y)
      .strokeColor(COLOR_DIVIDER).lineWidth(0.5).stroke()
    doc.moveDown(1)
  }

  // Brand title
  doc.font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(COLOR_FOREST)
    .text('Cactus Logistics', pageLeft, doc.y)

  doc.moveDown(0.6)

  // INVOICE heading
  doc.font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(COLOR_INK)
    .text('INVOICE')

  doc.moveDown(0.5)

  // Info block: label (muted) + value (ink) pairs
  const infoRows: [string, string][] = [
    ['Invoice #:', shortId],
    ['Billed to:', orgName],
    ['Billing period:',
      `${formatDate((invoice as any).billing_period_start)} → ${formatDate((invoice as any).billing_period_end)}`],
    ['Due date:', formatDate((invoice as any).due_date)],
    ['Status:', String((invoice as any).status ?? '—')],
  ]

  doc.fontSize(10)
  for (const [label, value] of infoRows) {
    const rowY = doc.y
    doc.font('Helvetica').fillColor(COLOR_MUTED)
      .text(label, pageLeft, rowY, { width: 110, continued: false })
    doc.font('Helvetica').fillColor(COLOR_INK)
      .text(value, pageLeft + 110, rowY, { width: contentWidth - 110 })
    doc.moveDown(0.2)
  }

  doc.moveDown(0.4)
  drawDivider()

  // -------- Summary by Carrier --------
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_FOREST)
    .text('SUMMARY BY CARRIER', pageLeft)
  doc.moveDown(0.4)

  const colCarrier = pageLeft
  const colShipments = pageLeft + 240
  const colAmount = pageRight - 90

  const drawTableHeader = (firstLabel: string) => {
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_MUTED)
      .text(firstLabel, colCarrier, y, { width: 240 })
    doc.text('Shipments', colShipments, y, { width: 90 })
    doc.text('Amount', colAmount, y, { width: 90, align: 'right' })
    doc.moveDown(0.2)
  }

  const drawTableRow = (label: string, shipments: number, amount: Decimal) => {
    const y = doc.y
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_INK)
      .text(label, colCarrier, y, { width: 240, ellipsis: true })
    doc.text(String(shipments), colShipments, y, { width: 90 })
    doc.text(formatMoney(amount), colAmount, y, { width: 90, align: 'right' })
    doc.moveDown(0.3)
  }

  drawTableHeader('Carrier')
  if (carrierRows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED)
      .text('No carriers on this invoice.', pageLeft)
    doc.moveDown(0.3)
  } else {
    for (const row of carrierRows) {
      drawTableRow(row.key, row.shipments, row.amount)
    }
  }

  doc.moveDown(0.2)
  drawDivider()

  // -------- Summary by Origin Location --------
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_FOREST)
    .text('SUMMARY BY ORIGIN LOCATION', pageLeft)
  doc.moveDown(0.4)

  drawTableHeader('Location')
  if (locationRows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED)
      .text('No origin locations on this invoice.', pageLeft)
    doc.moveDown(0.3)
  } else {
    for (const row of locationRows) {
      drawTableRow(row.key, row.shipments, row.amount)
    }
  }

  doc.moveDown(0.2)
  drawDivider()

  // -------- Total Due --------
  const totalY = doc.y
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLOR_FOREST)
    .text('TOTAL DUE', pageLeft, totalY)
  doc.text(formatMoney(totalDue), colAmount, totalY, { width: 90, align: 'right' })
  doc.moveDown(0.6)
  drawDivider()

  // -------- Footer --------
  const generatedOn = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const footerY = doc.page.height - doc.page.margins.bottom - 14
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
    .text(
      `Cactus Logistics LLC | cactus-logistics.com | Generated ${generatedOn}`,
      pageLeft,
      footerY,
      { width: contentWidth, align: 'center' }
    )

  doc.end()
  await done

  return Buffer.concat(chunks)
}
