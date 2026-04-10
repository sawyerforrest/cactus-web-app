// ==========================================================
// FILE: src/alamo/app/invoices/[id]/parse/page.tsx
// PURPOSE: UPS Detail invoice parser page. Reads the uploaded
// CSV from Supabase Storage, applies the carrier_invoice_formats
// column template, groups rows by tracking number, routes
// charges using carrier_charge_routing, extracts dimensions
// from INF rows, and inserts one invoice_line_items row per
// tracking number. Skips AI normalization — routing is
// deterministic via the charge routing table.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Decimal from 'decimal.js'

// ----------------------------------------------------------
// TYPES
// ----------------------------------------------------------

type ChargeRoutingRule = {
  charge_classification_code: string | null
  charge_category_code: string | null
  charge_category_detail_code: string | null
  charge_description: string | null
  cactus_field: string | null
  is_skip: boolean
  is_dimension_row: boolean
  is_adjustment: boolean
}

type ParsedLineItem = {
  tracking_number: string
  tracking_number_lead: string
  account_number_carrier: string
  service_level: string
  zone: string
  date_shipped: string | null
  date_delivered: string | null
  date_invoiced: string | null
  payor: string
  pieces_count: number | null
  reference_1: string
  reference_2: string
  reference_3: string
  reference_4: string
  reference_5: string
  address_sender_line1: string
  address_sender_line2: string
  address_sender_city: string
  address_sender_state: string
  address_sender_zip: string
  address_sender_country: string
  address_receiver_line1: string
  address_receiver_line2: string
  address_receiver_city: string
  address_receiver_state: string
  address_receiver_zip: string
  address_receiver_country: string
  weight_entered: number | null
  weight_unit_entered: string
  weight_billed: number | null
  weight_unit_billed: string
  length_entered: number | null
  width_entered: number | null
  height_entered: number | null
  length_carrier: number | null
  width_carrier: number | null
  height_carrier: number | null
  carrier_charge: Decimal
  base_charge: Decimal
  fuel_surcharge: Decimal
  residential_surcharge: Decimal
  address_correction: Decimal
  delivery_area_surcharge: Decimal
  additional_handling: Decimal
  apv_adjustment: Decimal
  apv_adjustment_detail: { description: string; amount: string }[]
  other_surcharges: Decimal
  other_surcharges_detail: { description: string; amount: string; classification: string }[]
  is_residential: boolean | null
  raw_line_data: Record<string, string>
}

// ----------------------------------------------------------
// HELPERS
// ----------------------------------------------------------

function parseDate(val: string): string | null {
  if (!val || !val.trim()) return null
  // WHY: UPS dates come in various formats. We normalize to
  // YYYY-MM-DD for our DATE columns.
  const clean = val.trim()
  // Try YYYYMMDD
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`
  }
  // Try MM/DD/YYYY
  const mdy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  // Try YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  return null
}

function parseDims(dimStr: string): [number|null, number|null, number|null] {
  // WHY: UPS dimension strings look like "16.0x 13.0x 11.0"
  // We split on 'x' and parse each dimension separately.
  if (!dimStr || !dimStr.trim()) return [null, null, null]
  const parts = dimStr.trim().split(/x\s*/i).map(p => parseFloat(p.trim()))
  if (parts.length >= 3 && !parts.some(isNaN)) {
    return [parts[0], parts[1], parts[2]]
  }
  return [null, null, null]
}

function toDecimal(val: string): Decimal {
  if (!val || !val.trim()) return new Decimal(0)
  try { return new Decimal(val.trim()) } catch { return new Decimal(0) }
}

// ----------------------------------------------------------
// ROUTING LOOKUP
// WHY: We look up routing rules in priority order:
//   1. Exact match on all three keys (most specific)
//   2. Match on class + detail code only (INF catch-all)
//   3. Match on class code only
// This handles UPS INF rows which have NULL description
// in our routing table but match on class = INF.
// ----------------------------------------------------------

function lookupRoute(
  rules: ChargeRoutingRule[],
  classCode: string,
  categoryCode: string,
  detailCode: string,
  description: string
): ChargeRoutingRule | null {
  // Priority 1: exact match
  const exact = rules.find(r =>
    r.charge_classification_code === classCode &&
    r.charge_category_detail_code === detailCode &&
    r.charge_description === description
  )
  if (exact) return exact

  // Priority 2: class + detail code, null description (INF catch-all)
  const partial = rules.find(r =>
    r.charge_classification_code === classCode &&
    r.charge_category_detail_code === detailCode &&
    r.charge_description === null
  )
  if (partial) return partial

  // Priority 3: class code only, null detail and description
  const classOnly = rules.find(r =>
    r.charge_classification_code === classCode &&
    r.charge_category_detail_code === null &&
    r.charge_description === null
  )
  if (classOnly) return classOnly

  return null
}

// ----------------------------------------------------------
// PARSE ACTION
// ----------------------------------------------------------

async function parseInvoice(formData: FormData) {
  'use server'

  const admin = createAdminSupabaseClient()
  const invoiceId = formData.get('invoice_id') as string

  // Fetch invoice record
  const { data: invoice } = await admin
    .from('carrier_invoices')
    .select('id, carrier_code, file_path, invoice_format, status')
    .eq('id', invoiceId)
    .single()

  if (!invoice || !invoice.file_path) return

  // Update status to PROCESSING
  await admin
    .from('carrier_invoices')
    .update({ status: 'PROCESSING' })
    .eq('id', invoiceId)

  try {
    // ----------------------------------------------------------
    // STEP 1: Fetch column template from carrier_invoice_formats
    // WHY: UPS detail files have no headers. We use the stored
    // template to know what each column position means.
    // ----------------------------------------------------------
    const { data: formatRows, error: formatError } = await admin
  .from('carrier_invoice_formats')
  .select('column_position, header_name')
  .eq('carrier_code', invoice.carrier_code)
  .eq('format_type', invoice.invoice_format)
  .eq('is_active', true)
  .order('column_position', { ascending: true })

console.log('formatError:', formatError)

      console.log('formatRows result:', formatRows?.length, 'carrier:', invoice.carrier_code, 'format:', invoice.invoice_format)

      if (!formatRows || formatRows.length === 0) {
        throw new Error(`No column template found for ${invoice.carrier_code} ${invoice.invoice_format}`)
      }

    // Build position → header name map (1-based)
    const columnTemplate: Record<number, string> = {}
    for (const row of formatRows) {
      columnTemplate[row.column_position] = row.header_name
    }

    // ----------------------------------------------------------
    // STEP 2: Fetch charge routing rules
    // ----------------------------------------------------------
    const { data: routingRules } = await admin
      .from('carrier_charge_routing')
      .select('*')
      .eq('carrier_code', invoice.carrier_code)
      .eq('is_active', true)

    const rules: ChargeRoutingRule[] = routingRules ?? []

    // ----------------------------------------------------------
    // STEP 3: Download file from Supabase Storage
    // ----------------------------------------------------------
    const { data: fileData, error: downloadError } = await admin
      .storage
      .from('carrier-invoices')
      .download(invoice.file_path)

    if (downloadError || !fileData) {
      throw new Error(`Failed to download invoice file: ${downloadError?.message}`)
    }

    const csvText = await fileData.text()

    // ----------------------------------------------------------
    // STEP 4: Parse CSV rows
    // WHY: We split on newlines and commas manually to avoid
    // adding heavy CSV libraries in the server action.
    // We handle quoted fields to support addresses with commas.
    // ----------------------------------------------------------
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const lines = csvText.split('\n').filter(l => l.trim())
    // WHY: UPS detail files have NO header row — start from line 0
    // UPS summary files have a header row — start from line 1
    // WHY: Real UPS detail files have no headers. However if the
// first row contains no numeric tracking number (starts with 1Z)
// it is likely a header row — skip it safely.
const firstLine = lines[0] ?? ''
const firstValues = firstLine.split(',')
const looksLikeHeader = firstValues[20] && !firstValues[20].trim().startsWith('1Z')
const dataLines = invoice.invoice_format === 'DETAIL'
  ? (looksLikeHeader ? lines.slice(1) : lines)
  : lines.slice(1)

    // ----------------------------------------------------------
    // STEP 5: Convert rows to named objects using column template
    // ----------------------------------------------------------
    const namedRows: Record<string, string>[] = dataLines
      .filter(line => line.trim())
      .map(line => {
        const values = parseCSVLine(line)
        const named: Record<string, string> = {}
        for (let i = 0; i < values.length; i++) {
          const headerName = columnTemplate[i + 1]
          if (headerName) {
            named[headerName] = values[i] ?? ''
          }
        }
        return named
      })

    // ----------------------------------------------------------
    // STEP 6: Group rows by Tracking Number
    // WHY: UPS detail has multiple rows per shipment — one per
    // charge type. We group them to build one line item per
    // tracking number.
    // ----------------------------------------------------------
    const grouped = new Map<string, Record<string, string>[]>()
    for (const row of namedRows) {
      const trackingNumber = row['Tracking Number']?.trim()
      if (!trackingNumber) continue
      if (!grouped.has(trackingNumber)) {
        grouped.set(trackingNumber, [])
      }
      grouped.get(trackingNumber)!.push(row)
    }

    // ----------------------------------------------------------
    // STEP 7: Process each tracking number group
    // ----------------------------------------------------------
    const lineItems: ParsedLineItem[] = []
    const unmappedChargeTypes = new Set<string>()

    for (const [trackingNumber, rows] of grouped) {
      // Use first row for shipment-level fields (same across all rows)
      const first = rows[0]

      const item: ParsedLineItem = {
        tracking_number: trackingNumber,
        tracking_number_lead: first['Lead Shipment Number']?.trim() ?? '',
        account_number_carrier: first['Account Number']?.trim() ?? '',
        service_level: first['Original Service Description']?.trim() ?? '',
        zone: first['Zone']?.trim() ?? '',
        date_shipped: parseDate(first['Shipment Date'] ?? ''),
        date_delivered: parseDate(first['Shipment Delivery Date'] ?? ''),
        date_invoiced: parseDate(first['Invoice Date'] ?? ''),
        payor: first['Payor Role Code']?.trim() ?? '',
        pieces_count: parseInt(first['Package Quantity'] ?? '0') || null,
        reference_1: first['Shipment Reference Number 1']?.trim() ?? '',
        reference_2: first['Shipment Reference Number 2']?.trim() ?? '',
        reference_3: first['Package Reference Number 1']?.trim() ?? '',
        reference_4: first['Package Reference Number 2']?.trim() ?? '',
        reference_5: first['Package Reference Number 3']?.trim() ?? '',
        address_sender_line1: first['Sender Address Line 1']?.trim() ?? '',
        address_sender_line2: first['Sender Address Line 2']?.trim() ?? '',
        address_sender_city: first['Sender City']?.trim() ?? '',
        address_sender_state: first['Sender State']?.trim() ?? '',
        address_sender_zip: first['Sender Postal']?.trim() ?? '',
        address_sender_country: first['Sender Country']?.trim() ?? '',
        address_receiver_line1: first['Receiver Address Line 1']?.trim() ?? '',
        address_receiver_line2: first['Receiver Address Line 2']?.trim() ?? '',
        address_receiver_city: first['Receiver City']?.trim() ?? '',
        address_receiver_state: first['Receiver State']?.trim() ?? '',
        address_receiver_zip: first['Receiver Postal']?.trim() ?? '',
        address_receiver_country: first['Receiver Country']?.trim() ?? '',
        weight_entered: parseFloat(first['Entered Weight'] ?? '') || null,
        weight_unit_entered: first['Entered Weight Unit of Measure']?.trim() || 'LB',
        weight_billed: parseFloat(first['Billed Weight'] ?? '') || null,
        weight_unit_billed: first['Billed Weight Unit of Measure']?.trim() || 'LB',
        length_entered: null,
        width_entered: null,
        height_entered: null,
        length_carrier: null,
        width_carrier: null,
        height_carrier: null,
        carrier_charge: new Decimal(0),
        base_charge: new Decimal(0),
        fuel_surcharge: new Decimal(0),
        residential_surcharge: new Decimal(0),
        address_correction: new Decimal(0),
        delivery_area_surcharge: new Decimal(0),
        additional_handling: new Decimal(0),
        apv_adjustment: new Decimal(0),
        apv_adjustment_detail: [],
        other_surcharges: new Decimal(0),
        other_surcharges_detail: [],
        is_residential: null,
        raw_line_data: first,
      }

      // Process each charge row
      for (const row of rows) {
        const classCode = row['Charge Classification Code']?.trim() ?? ''
        const categoryCode = row['Charge Category Code']?.trim() ?? ''
        const detailCode = row['Charge Category Detail Code']?.trim() ?? ''
        const description = row['Charge Description']?.trim() ?? ''
        const netAmount = toDecimal(row['Net Amount'] ?? '')

        const rule = lookupRoute(rules, classCode, categoryCode, detailCode, description)

        if (!rule) {
          // WHY: Unknown charge type — route to other_surcharges
          // and flag for admin review. Self-improving system.
          item.other_surcharges = item.other_surcharges.plus(netAmount)
          item.other_surcharges_detail.push({
            description,
            amount: netAmount.toFixed(4),
            classification: classCode,
          })
          unmappedChargeTypes.add(`${classCode} | ${detailCode} | ${description}`)
          item.carrier_charge = item.carrier_charge.plus(netAmount)
          continue
        }

        if (rule.is_skip) continue

        if (rule.is_dimension_row) {
          // WHY: INF rows carry dimensional data but their
          // Net Amount duplicates the FRT row. Extract dims
          // only — never add to carrier_charge.
          const agDims = row['Package Dimensions']?.trim() ?? ''
          const hrDims = row['Detail Keyed Dim']?.trim() ?? ''

          // Package Dimensions (AG) = entered at label print
          if (agDims) {
            const [l, w, h] = parseDims(agDims)
            item.length_entered = l
            item.width_entered = w
            item.height_entered = h
          }

          // Detail Keyed Dim (HR) = measured by carrier
          if (hrDims) {
            const [l, w, h] = parseDims(hrDims)
            item.length_carrier = l
            item.width_carrier = w
            item.height_carrier = h
          }

          // Residential flag from INF row
          const resDesc = description.toLowerCase()
          if (resDesc.includes('residential')) {
            item.is_residential = true
          }
          continue
        }

        // Add to carrier_charge for all billable rows
        if (!rule.is_dimension_row) {
          item.carrier_charge = item.carrier_charge.plus(netAmount)
        }

        if (rule.is_adjustment) {
          item.apv_adjustment = item.apv_adjustment.plus(netAmount)
          item.apv_adjustment_detail.push({
            description,
            amount: netAmount.toFixed(4),
          })
          continue
        }

        // Route to specific charge field
        switch (rule.cactus_field) {
          case 'base_charge':
            item.base_charge = item.base_charge.plus(netAmount)
            break
          case 'fuel_surcharge':
            item.fuel_surcharge = item.fuel_surcharge.plus(netAmount)
            break
          case 'residential_surcharge':
            item.residential_surcharge = item.residential_surcharge.plus(netAmount)
            item.is_residential = true
            break
          case 'address_correction':
            item.address_correction = item.address_correction.plus(netAmount)
            break
          case 'delivery_area_surcharge':
            item.delivery_area_surcharge = item.delivery_area_surcharge.plus(netAmount)
            break
          case 'additional_handling':
            item.additional_handling = item.additional_handling.plus(netAmount)
            break
          default:
            item.other_surcharges = item.other_surcharges.plus(netAmount)
            item.other_surcharges_detail.push({
              description,
              amount: netAmount.toFixed(4),
              classification: classCode,
            })
        }
      }

      lineItems.push(item)
    }

    // ----------------------------------------------------------
    // STEP 8: Insert invoice_line_items rows
    // WHY: We insert in batches of 100 to avoid hitting
    // Supabase request size limits on large invoices.
    // ----------------------------------------------------------
    const BATCH_SIZE = 100
    let insertedCount = 0

    for (let i = 0; i < lineItems.length; i += BATCH_SIZE) {
      const batch = lineItems.slice(i, i + BATCH_SIZE)

      const insertRows = batch.map(item => ({
        carrier_invoice_id: invoiceId,
        tracking_number: item.tracking_number || null,
        tracking_number_lead: item.tracking_number_lead || null,
        account_number_carrier: item.account_number_carrier || null,
        service_level: item.service_level || null,
        zone: item.zone || null,
        date_shipped: item.date_shipped,
        date_delivered: item.date_delivered,
        date_invoiced: item.date_invoiced,
        payor: item.payor || null,
        pieces_count: item.pieces_count,
        reference_1: item.reference_1 || null,
        reference_2: item.reference_2 || null,
        reference_3: item.reference_3 || null,
        reference_4: item.reference_4 || null,
        reference_5: item.reference_5 || null,
        address_sender_line1: item.address_sender_line1 || null,
        address_sender_line2: item.address_sender_line2 || null,
        address_sender_city: item.address_sender_city || null,
        address_sender_state: item.address_sender_state || null,
        address_sender_zip: item.address_sender_zip || null,
        address_sender_country: item.address_sender_country || null,
        // Build normalized sender address for dark matching
        address_sender_normalized: [
          item.address_sender_line1,
          item.address_sender_city,
          item.address_sender_state,
          item.address_sender_zip,
          item.address_sender_country,
        ].filter(Boolean).join(', ').toUpperCase() || null,
        address_receiver_line1: item.address_receiver_line1 || null,
        address_receiver_line2: item.address_receiver_line2 || null,
        address_receiver_city: item.address_receiver_city || null,
        address_receiver_state: item.address_receiver_state || null,
        address_receiver_zip: item.address_receiver_zip || null,
        address_receiver_country: item.address_receiver_country || null,
        weight_entered: item.weight_entered,
        weight_unit_entered: item.weight_unit_entered,
        weight_billed: item.weight_billed,
        weight_unit_billed: item.weight_unit_billed,
        length_entered: item.length_entered,
        width_entered: item.width_entered,
        height_entered: item.height_entered,
        length_carrier: item.length_carrier,
        width_carrier: item.width_carrier,
        height_carrier: item.height_carrier,
        carrier_charge: item.carrier_charge.toFixed(4),
        base_charge: item.base_charge.toDecimalPlaces(4).toNumber() || null,
        fuel_surcharge: item.fuel_surcharge.toDecimalPlaces(4).toNumber() || null,
        residential_surcharge: item.residential_surcharge.toDecimalPlaces(4).toNumber() || null,
        address_correction: item.address_correction.toDecimalPlaces(4).toNumber() || null,
        delivery_area_surcharge: item.delivery_area_surcharge.toDecimalPlaces(4).toNumber() || null,
        additional_handling: item.additional_handling.toDecimalPlaces(4).toNumber() || null,
        apv_adjustment: item.apv_adjustment.toDecimalPlaces(4).toNumber() || null,
        apv_adjustment_detail: item.apv_adjustment_detail.length > 0
          ? item.apv_adjustment_detail : null,
        other_surcharges: item.other_surcharges.toDecimalPlaces(4).toNumber() || null,
        other_surcharges_detail: item.other_surcharges_detail.length > 0
          ? item.other_surcharges_detail : null,
        is_residential: item.is_residential,
        billing_status: 'PENDING',
        raw_line_data: item.raw_line_data,
      }))

      const { error: insertError } = await admin
        .from('invoice_line_items')
        .insert(insertRows)

      if (insertError) {
        throw new Error(`Batch insert failed: ${insertError.message}`)
      }
      insertedCount += batch.length
    }

    // ----------------------------------------------------------
    // STEP 9: Update carrier_invoices with results
    // ----------------------------------------------------------
    const totalCarrierAmount = lineItems
      .reduce((sum, item) => sum.plus(item.carrier_charge), new Decimal(0))

    const hasUnmapped = unmappedChargeTypes.size > 0

    await admin
      .from('carrier_invoices')
      .update({
        status: 'COMPLETE',
        total_line_items: lineItems.length,
        matched_line_items: 0,
        flagged_line_items: 0,
        total_carrier_amount: totalCarrierAmount.toFixed(4),
        has_unmapped_charges: hasUnmapped,
        unmapped_charge_types: hasUnmapped
          ? Array.from(unmappedChargeTypes)
          : null,
        ai_processing_notes: [
          `Parsed ${lineItems.length} shipments from ${namedRows.length} invoice rows.`,
          hasUnmapped
            ? `⚠ ${unmappedChargeTypes.size} unrecognized charge type(s) routed to other_surcharges.`
            : 'All charge types recognized and routed.',
        ].join(' '),
        processed_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

  } catch (err) {
    console.error('Parse error:', err)
    await admin
      .from('carrier_invoices')
      .update({
        status: 'FAILED',
        ai_processing_notes: `Parse failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
      .eq('id', invoiceId)
  }

  redirect(`/invoices/${invoiceId}`)
}

// ----------------------------------------------------------
// PAGE
// ----------------------------------------------------------

export default async function InvoiceParsePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: invoice } = await admin
    .from('carrier_invoices')
    .select('id, invoice_file_name, carrier_code, invoice_format, status, ai_processing_notes, has_unmapped_charges, unmapped_charge_types')
    .eq('id', id)
    .single()

  if (!invoice) redirect('/invoices')

  const isComplete = invoice.status === 'COMPLETE'
  const isFailed = invoice.status === 'FAILED'
  const isProcessing = invoice.status === 'PROCESSING'
  const isUploaded = invoice.status === 'UPLOADED'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Breadcrumb */}
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <a href="/invoices" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>
            Carrier Invoices
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <a href={`/invoices/${id}`} style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>
            {invoice.invoice_file_name}
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            Parse
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>

          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            Parse Invoice
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {invoice.carrier_code} · {invoice.invoice_format} format · {invoice.invoice_file_name}
          </div>

          {/* Status banner */}
          {invoice.ai_processing_notes && (
            <div style={{
              background: isFailed
                ? 'var(--cactus-bloom-bg)'
                : isComplete && invoice.has_unmapped_charges
                ? 'var(--cactus-amber-bg)'
                : 'var(--cactus-mint)',
              border: `0.5px solid ${isFailed
                ? 'var(--cactus-bloom-border)'
                : 'var(--cactus-border)'}`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: isFailed
                ? 'var(--cactus-bloom)'
                : 'var(--cactus-ink)',
            }}>
              <span style={{ fontWeight: 500, marginRight: 8 }}>
                {isFailed ? 'Error:' : 'Result:'}
              </span>
              {invoice.ai_processing_notes}
            </div>
          )}

          {/* Unmapped charges warning */}
          {isComplete && invoice.has_unmapped_charges && invoice.unmapped_charge_types && (
            <div style={{
              background: 'var(--cactus-bloom-bg)',
              border: '0.5px solid var(--cactus-bloom-border)',
              borderRadius: 8,
              padding: '16px',
              marginBottom: 20,
            }}>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--cactus-bloom)',
                marginBottom: 8,
              }}>
                Unrecognized charge types — routed to other_surcharges
              </div>
              <div style={{ fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 8 }}>
                These charge types are not in the routing table. They have been
                captured in other_surcharges. Add them to the routing table to
                auto-route on future invoices.
              </div>
              {(invoice.unmapped_charge_types as string[]).map((t: string) => (
                <div key={t} style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--cactus-bloom-deep)',
                  padding: '2px 0',
                }}>
                  {t}
                </div>
              ))}
            </div>
          )}

          {/* Parse button */}
          {(isUploaded || isFailed) && (
            <div style={{ marginBottom: 24 }}>
              <form action={parseInvoice}>
                <input type="hidden" name="invoice_id" value={id} />
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--cactus-forest)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {isFailed ? 'Retry Parse →' : 'Parse Invoice →'}
                </button>
              </form>
            </div>
          )}

          {/* Processing state */}
          {isProcessing && (
            <div style={{
              background: 'var(--cactus-amber-bg)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 8,
              padding: '16px',
              fontSize: 13,
              color: 'var(--cactus-ink)',
            }}>
              Parsing in progress... this may take a moment for large invoices.
              Refresh the page to check status.
            </div>
          )}

          {/* Complete — link to invoice detail */}
          {isComplete && (
            <a
              href={`/invoices/${id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 20px',
                borderRadius: 6,
                background: 'var(--cactus-forest)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              View Line Items →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}