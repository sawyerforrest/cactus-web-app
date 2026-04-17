'use server'

// =============================================================
// CACTUS INVOICE PDF — Stage 5
// FILE: src/alamo/app/invoices/[id]/actions/pdf.ts
//
// Generates a one-page PDF summary for a single cactus_invoice.
//
// Display rules (non-negotiable):
//   - lassoed_carrier_account → show final_merchant_rate only
//   - dark_carrier_account    → may show carrier_charge alongside
//   This PDF only shows aggregates (sum of final_merchant_rate),
//   so neither mode ever exposes carrier_charge.
//
// All money math uses decimal.js — no floats.
// =============================================================

import fs from 'fs'
import path from 'path'
import Decimal from 'decimal.js'
import PDFDocument from 'pdfkit'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'

const COLOR_FOREST = '#2D5A27'
const COLOR_INK = '#0D1210'
const COLOR_MUTED = '#9CA89A'
const COLOR_DIVIDER = '#D8D3C8'
const COLOR_ROW_SEP = '#F0EEE9'

// Logo SVG viewBox aspect ratio — 923.18 × 475.16
const LOGO_ASPECT = 923.18 / 475.16

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

    const carrierKey = line.org_carrier_accounts?.carrier_code ?? 'UNKNOWN'
    const carrierEntry = byCarrier.get(carrierKey)
    if (carrierEntry) {
      carrierEntry.shipments += 1
      carrierEntry.amount = carrierEntry.amount.plus(amount)
    } else {
      byCarrier.set(carrierKey, { key: carrierKey, shipments: 1, amount })
    }

    const locationKey = line.locations?.name ?? 'Unknown'
    const locationEntry = byLocation.get(locationKey)
    if (locationEntry) {
      locationEntry.shipments += 1
      locationEntry.amount = locationEntry.amount.plus(amount)
    } else {
      byLocation.set(locationKey, { key: locationKey, shipments: 1, amount })
    }
  }

  const carrierRows = [...byCarrier.values()].sort((a, b) => b.amount.cmp(a.amount))
  const locationRows = [...byLocation.values()].sort((a, b) => b.amount.cmp(a.amount))

  const org = (invoice as any).organizations
  const orgName: string = org?.name ?? 'Unknown Org'
  const shortId = cactusInvoiceId.slice(0, 8).toUpperCase()

  // =============================================================
  // RENDER PDF
  // =============================================================

  const logoPath = path.join(process.cwd(), 'public', 'cactus-logo-pdf.png')
  const logoBuffer = fs.readFileSync(logoPath)

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve())
    doc.on('error', reject)
  })

  const pageLeft = 60
  const pageRight = doc.page.width - 60
  const pageBottom = doc.page.height - 60
  const contentWidth = pageRight - pageLeft

  const drawDivider = (y: number, color = COLOR_DIVIDER, weight = 0.5) => {
    doc.moveTo(pageLeft, y).lineTo(pageRight, y)
      .strokeColor(color).lineWidth(weight).stroke()
  }

  // -------- HEADER --------
  const logoW = 180
  const logoY = 45
  const logoH = logoW / LOGO_ASPECT
  const logoCenter = logoY + logoH / 2

  doc.image(logoBuffer, pageLeft, logoY, { width: logoW })

  const invoiceFontSize = 42
  // Approximate vertical centering: Helvetica caps sit ~0.72 of fontSize
  // from the text-top baseline pdfkit uses, so shifting up by ~fontSize/2
  // yields visual center alignment with the logo's midline.
  const invoiceTopY = logoCenter - invoiceFontSize * 0.52
  doc.font('Helvetica-Bold').fontSize(invoiceFontSize).fillColor(COLOR_INK)
    .text('INVOICE', pageLeft, invoiceTopY, {
      width: contentWidth, align: 'right', lineBreak: false,
    })

  let cursorY = Math.max(logoY + logoH, invoiceTopY + invoiceFontSize) + 16
  drawDivider(cursorY)
  cursorY += 28

  // -------- INVOICE META (two columns) --------
  const LABEL_SPACING = 0.8
  const setLabel = () => doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_MUTED)
  const setValue = () => doc.font('Helvetica').fontSize(11).fillColor(COLOR_INK)

  const leftColX = pageLeft
  const rightColX = pageLeft + Math.floor(contentWidth * 0.55)

  // Left column — just BILLED TO
  setLabel().text('BILLED TO', leftColX, cursorY, {
    lineBreak: false, characterSpacing: LABEL_SPACING,
  })
  setValue().text(orgName, leftColX, cursorY + 14, {
    width: rightColX - leftColX - 20, lineBreak: false, ellipsis: true,
  })

  // Right column — three pairs stacked
  const rightPairs: [string, string][] = [
    ['INVOICE NO', shortId],
    ['DATE', formatDate((invoice as any).billing_period_start)],
    ['DUE DATE', formatDate((invoice as any).due_date)],
  ]

  const pairGap = 30
  rightPairs.forEach(([label, value], i) => {
    const y = cursorY + i * pairGap
    setLabel().text(label, rightColX, y, {
      lineBreak: false, characterSpacing: LABEL_SPACING,
    })
    setValue().text(value, rightColX, y + 14, {
      width: pageRight - rightColX, lineBreak: false,
    })
  })

  cursorY += rightPairs.length * pairGap + 6
  drawDivider(cursorY)
  cursorY += 24

  // -------- SUMMARY SECTIONS --------
  const HEADING_SPACING = 1.2

  const sectionHeading = (title: string, y: number) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_FOREST)
      .text(title, pageLeft, y, { lineBreak: false, characterSpacing: HEADING_SPACING })
  }

  const shipmentsColX = pageLeft + 300

  const columnHeaders = (firstLabel: string, y: number) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_MUTED)
    doc.text(firstLabel, pageLeft, y, { lineBreak: false, characterSpacing: LABEL_SPACING })
    doc.text('SHIPMENTS', shipmentsColX, y, { lineBreak: false, characterSpacing: LABEL_SPACING })
    doc.text('AMOUNT', pageLeft, y, {
      width: contentWidth, align: 'right', lineBreak: false, characterSpacing: LABEL_SPACING,
    })
  }

  const dataRow = (label: string, shipments: number, amount: Decimal, y: number) => {
    doc.font('Helvetica').fontSize(11).fillColor(COLOR_INK)
    doc.text(label, pageLeft, y, {
      width: shipmentsColX - pageLeft - 10, lineBreak: false, ellipsis: true,
    })
    doc.text(String(shipments), shipmentsColX, y, { lineBreak: false })
    doc.text(formatMoney(amount), pageLeft, y, {
      width: contentWidth, align: 'right', lineBreak: false,
    })
  }

  const drawSection = (
    title: string,
    firstColLabel: string,
    rows: SummaryRow[],
    startY: number,
  ): number => {
    sectionHeading(title, startY)
    let y = startY + 24
    columnHeaders(firstColLabel, y)
    y += 20

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED)
        .text('—', pageLeft, y, { lineBreak: false })
      return y + 18
    }

    for (const row of rows) {
      drawDivider(y - 4, COLOR_ROW_SEP, 0.5)
      dataRow(row.key, row.shipments, row.amount, y)
      y += 20
    }
    return y
  }

  cursorY = drawSection('SUMMARY BY CARRIER', 'CARRIER', carrierRows, cursorY)
  cursorY += 8
  drawDivider(cursorY)
  cursorY += 22

  cursorY = drawSection(
    'SUMMARY BY ORIGIN LOCATION',
    'LOCATION',
    locationRows,
    cursorY,
  )
  cursorY += 8
  drawDivider(cursorY)
  cursorY += 22

  // -------- TOTAL DUE --------
  const totalY = cursorY
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_FOREST)
    .text('TOTAL DUE', pageLeft, totalY + 4, {
      lineBreak: false, characterSpacing: HEADING_SPACING,
    })
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_FOREST)
    .text(formatMoney(totalDue), pageLeft, totalY, {
      width: contentWidth, align: 'right', lineBreak: false,
    })
  cursorY += 32
  drawDivider(cursorY)

  // -------- FOOTER — pinned to page bottom --------
  const creditY = pageBottom + 2
  const valuesY = creditY - 18

  const values = [
    { word: 'Gratitude', desc: 'for people' },
    { word: 'Curiosity', desc: 'for innovation' },
    { word: 'Faith', desc: 'for purpose' },
    { word: 'Creation', desc: 'for joy' },
  ]
  const SPACE = '  '
  const ARROW = '   →   '

  doc.font('Helvetica-Oblique').fontSize(9)
  const wordWidths = values.map(v => doc.widthOfString(v.word))
  doc.font('Helvetica').fontSize(8)
  const descWidths = values.map(v => doc.widthOfString(SPACE + v.desc))
  const arrowW = doc.widthOfString(ARROW)

  const totalW =
    wordWidths.reduce((s, w) => s + w, 0) +
    descWidths.reduce((s, w) => s + w, 0) +
    arrowW * (values.length - 1)

  let x = pageLeft + (contentWidth - totalW) / 2

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR_FOREST)
      .text(v.word, x, valuesY, { lineBreak: false })
    x += wordWidths[i]

    // +1 to nudge smaller text toward the italic baseline
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
      .text(SPACE + v.desc, x, valuesY + 1, { lineBreak: false })
    x += descWidths[i]

    if (i < values.length - 1) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DIVIDER)
        .text(ARROW, x, valuesY + 1, { lineBreak: false })
      x += arrowW
    }
  }

  const generatedOn = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
    .text(
      `Cactus Logistics LLC  |  cactus-logistics.com  |  Generated ${generatedOn}`,
      pageLeft, creditY,
      { width: contentWidth, align: 'center', lineBreak: false },
    )

  doc.end()
  await done

  return Buffer.concat(chunks)
}
