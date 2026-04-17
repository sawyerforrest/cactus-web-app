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
// Single-page guarantee:
//   - autoFirstPage:false + explicit addPage() so pdfkit can't
//     create an implicit first page with different state.
//   - Row height is computed up front from row counts and falls
//     back to LAYOUT.rowHeight when content fits easily; if not,
//     it compresses with a 12pt floor and the location font
//     shrinks to 9pt when the list is dense.
//   - The location section is capped at LAYOUT.maxLocationRows
//     with an overflow line pointing at the CSV export.
//   - Footer is pinned to absolute Y coords inside the bottom
//     margin, and every text() call passes explicit (x, y) plus
//     lineBreak:false so pdfkit can't auto-paginate via wrap.
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

const LOGO_ASPECT = 923.18 / 475.16

const LAYOUT = {
  margin: 60,
  pageWidth: 612,
  pageHeight: 792,
  logoWidth: 160,
  logoY: 45,
  headerY: 45,
  headerDividerY: 125,
  metaStartY: 140,
  sectionGap: 28,
  rowHeight: 20,
  rowFontSize: 10,
  labelFontSize: 8,
  valueFontSize: 11,
  maxLocationRows: 12,
  footerValuesY: 700,
  footerCreditY: 718,
  bodyEndY: 686,
  col1X: 60,   // logo + BILLED TO left edge
  col2X: 260,  // Cactus from-block left edge
  col3X: 400,  // invoice meta / SHIPMENTS column
  col4X: 552,  // right edge for right-aligned text / AMOUNT column
} as const

// Cactus "from" block — hardcoded on the invoice since Cactus is
// always the issuer. If this ever needs to vary per-environment,
// pull it from env or a settings table.
const CACTUS_FROM = {
  name: 'Cactus Logistics LLC',
  lines: [
    '1956 N 1450 E',
    'Provo, Utah 84604',
    '(801) 669-1157',
    'billing@cactus-logistics.com',
  ],
}

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
      organizations (
        name,
        terms_days,
        locations (
          address_line1,
          address_line2,
          city,
          state,
          postal_code,
          is_billing_address
        )
      )
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

  // ------- aggregate by carrier_code and by location name -------
  const byCarrier = new Map<string, SummaryRow>()
  const byLocation = new Map<string, SummaryRow>()
  let totalDue = new Decimal(0)
  let totalShipments = 0

  for (const row of lineItems ?? []) {
    const line = row.invoice_line_items as any
    if (!line) continue

    const amount = new Decimal(line.final_merchant_rate ?? 0)
    totalDue = totalDue.plus(amount)
    totalShipments += 1

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
  const locationRowsAll = [...byLocation.values()].sort((a, b) => b.amount.cmp(a.amount))

  // Cap at maxLocationRows; remainder gets an overflow line at the bottom.
  const locationRows = locationRowsAll.slice(0, LAYOUT.maxLocationRows)
  const overflowLocations = Math.max(0, locationRowsAll.length - LAYOUT.maxLocationRows)

  const org = (invoice as any).organizations
  const orgName: string = org?.name ?? 'Unknown Org'
  const shortId = cactusInvoiceId.slice(0, 8).toUpperCase()

  // Pick the billing address (fall back to the first location so we
  // still render *something* when nobody flagged a billing address).
  const orgLocations: any[] = Array.isArray(org?.locations) ? org.locations : []
  const billingLocation =
    orgLocations.find(l => l?.is_billing_address) ??
    orgLocations[0] ??
    null

  const cityStatePostal = billingLocation
    ? [
        billingLocation.city,
        [billingLocation.state, billingLocation.postal_code]
          .filter((s: unknown) => typeof s === 'string' && s.trim().length > 0)
          .join(' '),
      ]
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .join(', ')
    : ''

  const billingAddress: string[] = billingLocation
    ? [
        billingLocation.address_line1,
        billingLocation.address_line2,
        cityStatePostal,
      ].filter((line: unknown) => typeof line === 'string' && line.trim().length > 0)
    : []

  // =============================================================
  // FIT CALCULATION — compress row height when we have many rows
  // =============================================================

  const totalRows = carrierRows.length + locationRows.length
  const headerHeight = 220 // logo + billed-to + right column all in
  const totalDueHeight = 60
  const footerHeight = 60
  const sectionChrome = 120
  const usableHeight = LAYOUT.pageHeight - LAYOUT.margin * 2
  const needed =
    headerHeight + totalRows * LAYOUT.rowHeight + sectionChrome + totalDueHeight + footerHeight

  const rowHeight = needed > usableHeight
    ? Math.max(
        12,
        Math.floor(
          (usableHeight - headerHeight - totalDueHeight - footerHeight - sectionChrome) /
            Math.max(1, totalRows),
        ),
      )
    : LAYOUT.rowHeight

  const locationFontSize = locationRows.length > LAYOUT.maxLocationRows - 1 ? 9 : 11

  // =============================================================
  // RENDER PDF
  // =============================================================

  const logoPath = path.join(process.cwd(), 'public', 'cactus-logo-pdf.png')
  const logoBuffer = fs.readFileSync(logoPath)

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: LAYOUT.margin,
    autoFirstPage: false,
    info: { Title: 'Cactus Invoice', Author: CACTUS_FROM.name },
  })
  doc.addPage()

  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve())
    doc.on('error', reject)
  })

  const pageRight = LAYOUT.pageWidth - LAYOUT.margin
  const contentWidth = pageRight - LAYOUT.margin

  const drawDivider = (y: number, color = COLOR_DIVIDER, weight = 0.5) => {
    doc.moveTo(LAYOUT.col1X, y).lineTo(pageRight, y)
      .strokeColor(color).lineWidth(weight).stroke()
  }

  // -------- HEADER — logo + INVOICE + 3-column meta --------

  const LABEL_SPACING = 0.8

  // Row 1: Logo (left) + INVOICE wordmark (right-aligned to col4X)
  doc.image(logoBuffer, LAYOUT.col1X, LAYOUT.logoY, { width: LAYOUT.logoWidth })

  const invoiceFontSize = 36
  doc.font('Helvetica-Bold').fontSize(invoiceFontSize).fillColor(COLOR_INK)
    .text('INVOICE', LAYOUT.col1X, 48, {
      width: LAYOUT.col4X - LAYOUT.col1X, align: 'right', lineBreak: false,
    })

  // Row 2: hairline divider under logo/wordmark
  drawDivider(LAYOUT.headerDividerY)

  // Row 3: three sub-columns starting at metaStartY

  // Left sub-column (col1X): BILLED TO
  let leftY = LAYOUT.metaStartY
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_MUTED)
    .text('BILLED TO', LAYOUT.col1X, leftY, {
      lineBreak: false, characterSpacing: LABEL_SPACING,
    })
  leftY += 12
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_INK)
    .text(orgName, LAYOUT.col1X, leftY, {
      width: LAYOUT.col2X - LAYOUT.col1X - 10, lineBreak: false, ellipsis: true,
    })
  leftY += 14
  for (const line of billingAddress) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
      .text(line, LAYOUT.col1X, leftY, {
        width: LAYOUT.col2X - LAYOUT.col1X - 10, lineBreak: false, ellipsis: true,
      })
    leftY += 12
  }

  // Center sub-column (col2X): Cactus from-block
  let centerY = LAYOUT.metaStartY
  const centerColWidth = LAYOUT.col3X - LAYOUT.col2X
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_MUTED)
    .text('FROM', LAYOUT.col2X, centerY, {
      lineBreak: false, characterSpacing: LABEL_SPACING,
    })
  centerY += 12
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_INK)
    .text(CACTUS_FROM.name, LAYOUT.col2X, centerY, {
      width: centerColWidth, lineBreak: false,
    })
  centerY += 13
  for (const line of CACTUS_FROM.lines) {
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED)
      .text(line, LAYOUT.col2X, centerY, {
        width: centerColWidth, lineBreak: false, ellipsis: true,
      })
    centerY += 11
  }

  // Right sub-column (col3X): invoice meta
  let rightY = LAYOUT.metaStartY
  const rightColWidth = LAYOUT.col4X - LAYOUT.col3X

  // WHY values is an array: the billing-period string
  // "April 16, 2026 – April 16, 2026" is ~160pt wide at 10pt
  // Helvetica but the right column is only 152pt wide, so the
  // DATE group is stacked as two lines (start / end).
  const metaPairs: Array<{
    label: string
    values: string[]
    valueFont: string
    valueColor: string
  }> = [
    {
      label: 'INVOICE NO',
      values: [shortId],
      valueFont: 'Helvetica',
      valueColor: COLOR_INK,
    },
    {
      label: 'DATE',
      values: [
        formatDate((invoice as any).billing_period_start),
        formatDate((invoice as any).billing_period_end),
      ],
      valueFont: 'Helvetica',
      valueColor: COLOR_INK,
    },
    {
      label: 'DUE DATE',
      values: [formatDate((invoice as any).due_date)],
      valueFont: 'Helvetica-Bold',
      valueColor: COLOR_FOREST,
    },
  ]

  const VALUE_LINE_HEIGHT = 12
  const PAIR_GAP = 6

  for (const pair of metaPairs) {
    doc.font('Helvetica-Bold').fontSize(LAYOUT.labelFontSize).fillColor(COLOR_MUTED)
      .text(pair.label, LAYOUT.col3X, rightY, {
        lineBreak: false, characterSpacing: LABEL_SPACING,
      })
    rightY += 10
    for (const val of pair.values) {
      doc.font(pair.valueFont).fontSize(10).fillColor(pair.valueColor)
        .text(val, LAYOUT.col3X, rightY, {
          width: rightColWidth, lineBreak: false,
        })
      rightY += VALUE_LINE_HEIGHT
    }
    rightY += PAIR_GAP
  }

  // Row 4: second hairline divider below the tallest sub-column
  const metaEndY = Math.max(leftY, centerY, rightY) + 6
  drawDivider(metaEndY)

  // Body starts below the second divider. All body positioning
  // flows from contentStartY so header edits don't drift the
  // summary/footer layout.
  const contentStartY = metaEndY + LAYOUT.sectionGap
  let cursorY = contentStartY

  // -------- SUMMARY SECTIONS --------
  const HEADING_SPACING = 1.2

  const sectionHeading = (title: string, y: number) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_FOREST)
      .text(title, LAYOUT.col1X, y, { lineBreak: false, characterSpacing: HEADING_SPACING })
  }

  const columnHeaders = (firstLabel: string, y: number) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_MUTED)
    doc.text(firstLabel, LAYOUT.col1X, y, {
      lineBreak: false, characterSpacing: LABEL_SPACING,
    })
    doc.text('SHIPMENTS', LAYOUT.col3X, y, {
      lineBreak: false, characterSpacing: LABEL_SPACING,
    })
    doc.text('AMOUNT', LAYOUT.col1X, y, {
      width: LAYOUT.col4X - LAYOUT.col1X,
      align: 'right',
      lineBreak: false,
      characterSpacing: LABEL_SPACING,
    })
  }

  const dataRow = (
    label: string,
    shipments: number,
    amount: Decimal,
    y: number,
    fontSize: number,
  ) => {
    doc.font('Helvetica').fontSize(fontSize).fillColor(COLOR_INK)
    doc.text(label, LAYOUT.col1X, y, {
      width: LAYOUT.col3X - LAYOUT.col1X - 10, lineBreak: false, ellipsis: true,
    })
    doc.text(String(shipments), LAYOUT.col3X, y, { lineBreak: false })
    doc.text(formatMoney(amount), LAYOUT.col1X, y, {
      width: LAYOUT.col4X - LAYOUT.col1X, align: 'right', lineBreak: false,
    })
  }

  const drawSection = (
    title: string,
    firstColLabel: string,
    rows: SummaryRow[],
    startY: number,
    fontSize: number,
  ): number => {
    sectionHeading(title, startY)
    let y = startY + 22
    columnHeaders(firstColLabel, y)
    y += 18

    if (rows.length === 0) {
      doc.font('Helvetica').fontSize(LAYOUT.rowFontSize).fillColor(COLOR_MUTED)
        .text('—', LAYOUT.col1X, y, { lineBreak: false })
      return y + 16
    }

    for (const row of rows) {
      if (y + fontSize > LAYOUT.bodyEndY) break
      drawDivider(y - 3, COLOR_ROW_SEP, 0.5)
      dataRow(row.key, row.shipments, row.amount, y, fontSize)
      y += rowHeight
    }
    return y
  }

  cursorY = drawSection('SUMMARY BY CARRIER', 'CARRIER', carrierRows, cursorY, 11)
  cursorY += 6
  drawDivider(cursorY)
  cursorY += 18

  cursorY = drawSection(
    'SUMMARY BY ORIGIN LOCATION',
    'LOCATION',
    locationRows,
    cursorY,
    locationFontSize,
  )

  // Location overflow line — sits under the table when we truncated.
  if (overflowLocations > 0 && cursorY + 14 <= LAYOUT.bodyEndY) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR_MUTED)
      .text(
        `+ ${overflowLocations} more location${overflowLocations > 1 ? 's' : ''} — see full detail in CSV export`,
        LAYOUT.col1X, cursorY + 4,
        { lineBreak: false },
      )
    cursorY += 16
  }

  cursorY += 6
  drawDivider(cursorY)
  cursorY += 18

  // -------- TOTAL DUE — Total Shipments (left) + TOTAL DUE (right) -----
  const totalY = cursorY
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_MUTED)
    .text(
      `Total Shipments: ${totalShipments.toLocaleString('en-US')}`,
      LAYOUT.col1X, totalY + 8,
      { lineBreak: false },
    )
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_FOREST)
    .text('TOTAL DUE', LAYOUT.col1X, totalY + 6, {
      width: LAYOUT.col4X - LAYOUT.col1X - 110,
      align: 'right',
      lineBreak: false,
      characterSpacing: HEADING_SPACING,
    })
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_FOREST)
    .text(formatMoney(totalDue), LAYOUT.col1X, totalY, {
      width: LAYOUT.col4X - LAYOUT.col1X, align: 'right', lineBreak: false,
    })
  cursorY += 30
  drawDivider(cursorY)

  // -------- FOOTER — pinned absolute, always one page --------

  // Payment instruction — sits above the values strip.
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLOR_MUTED)
    .text(
      'Payment will be automatically collected on the due date via your payment method on file.',
      LAYOUT.margin,
      LAYOUT.footerValuesY - 20,
      { width: contentWidth, align: 'center', lineBreak: false },
    )

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

  let x = LAYOUT.col1X + (contentWidth - totalW) / 2

  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLOR_FOREST)
      .text(v.word, x, LAYOUT.footerValuesY, { lineBreak: false })
    x += wordWidths[i]

    doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
      .text(SPACE + v.desc, x, LAYOUT.footerValuesY + 1, { lineBreak: false })
    x += descWidths[i]

    if (i < values.length - 1) {
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_DIVIDER)
        .text(ARROW, x, LAYOUT.footerValuesY + 1, { lineBreak: false })
      x += arrowW
    }
  }

  const generatedOn = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_MUTED)
    .text(
      `${CACTUS_FROM.name}  |  cactus-logistics.com  |  Generated ${generatedOn}`,
      LAYOUT.col1X, LAYOUT.footerCreditY,
      { width: contentWidth, align: 'center', lineBreak: false },
    )

  doc.end()
  await done

  return Buffer.concat(chunks)
}
