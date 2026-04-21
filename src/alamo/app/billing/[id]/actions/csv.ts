'use server'

// =============================================================
// CACTUS INVOICE CSV — 85-column client-facing export
// FILE: src/alamo/app/billing/[id]/actions/csv.ts
//
// ARCHITECTURE:
//   LOAD     → fetch line items + joins (org, location,
//              carrier_invoice, carrier_account, cactus_invoice
//              via junction, match-run audit timestamp)
//   TRANSFORM → per-row compute 85 string cells, dispatching
//              billed-charge math by markup_type_applied
//   WRITE    → RFC 4180 with UTF-8 BOM + CRLF via shared writer
//
// DISPLAY RULES (non-negotiable):
//   - lassoed_carrier_account → carrier cost columns (46, 47,
//     63) are EMPTY. Client never sees our wholesale cost.
//   - dark_carrier_account    → carrier cost columns populated.
//   - Tracking numbers prefixed with U+0009 TAB to keep Excel
//     from converting long digit strings to scientific notation.
//   - Empty cells are literally empty (consecutive commas), not
//     "NULL" or "N/A".
//
// PERCENTAGE vs FLAT math on billed-charge columns (48-62):
//   percentage → each component × (1 + markup_value_applied),
//                rendered to 2 decimals. Sum may drift from
//                final_billed_rate by up to $0.01 due to
//                fractional-cent rounding — footnote explains.
//   flat       → base_charge + markup_value_applied; all other
//                charge columns pass through raw. No ceiling
//                needed. Sum equals final_billed_rate exactly.
//   is_adjustment_only + flat → base column shows 0.00, flat
//                fee is NOT added (matching Session A behavior
//                captured in the Pineridge seed — row 14).
//                [DECISION NEEDED: see session B summary]
//
// SCHEMA REALITY — some spec'd "optional" surcharge columns
// (53, 54, 56, 58, 59) DO NOT EXIST on invoice_line_items. The
// parser routes these one-off surcharges through
// other_surcharges with detail in other_surcharges_detail
// JSONB. We keep the 85-column header count for spec stability
// by emitting those as empty cells, and populate only the ones
// that are real columns on the schema (address_correction,
// additional_handling). Document: completion summary "CSV
// COLUMN DECISIONS".
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'
import {
  formatDate,
  formatDecimal,
  formatMoney,
  formatString,
  formatTimestamp,
  formatTracking,
  formatYN,
  shortId,
  slugifyOrg,
} from '../../../../lib/csv/format'
import { buildCsv } from '../../../../lib/csv/writer'

// =============================================================
// COLUMN SPEC — names only. Transform happens per row below,
// inline, because each column needs different source joins and
// type coercion.
// =============================================================

const COLUMN_HEADERS: string[] = [
  // Identifiers (1-6)
  'Tracking Number',             // 1
  'Cactus Invoice Number',       // 2
  'Cactus Line Item ID',         // 3
  'Carrier Invoice File',        // 4
  'Carrier',                     // 5
  'Service Level',               // 6

  // Dates (7-10)
  'Date Shipped',                // 7
  'Date Delivered',              // 8
  'Date Invoiced',               // 9
  'Date Billed',                 // 10

  // Shipment meta (11-16)
  'Zone',                        // 11
  'Weight',                      // 12
  'Weight Unit',                 // 13
  'Billable Weight',             // 14
  'Billable Weight Unit',        // 15
  'Residential Flag',            // 16

  // Dimensions entered (17-20)
  'Length Entered',              // 17
  'Width Entered',               // 18
  'Height Entered',              // 19
  'Dim Unit Entered',            // 20

  // Dimensions carrier (21-24)
  'Length Carrier',              // 21
  'Width Carrier',               // 22
  'Height Carrier',              // 23
  'Dim Unit Carrier',            // 24

  // Sender address (25-32)
  'Sender Name',                 // 25  — no column on schema, empty
  'Sender Company',              // 26  — no column on schema, empty
  'Sender Address Line 1',       // 27
  'Sender Address Line 2',       // 28
  'Sender City',                 // 29
  'Sender State',                // 30
  'Sender Postal Code',          // 31
  'Sender Country',              // 32

  // Receiver address (33-40)
  'Receiver Name',               // 33  — no column on schema, empty
  'Receiver Company',            // 34  — no column on schema, empty
  'Receiver Address Line 1',     // 35
  'Receiver Address Line 2',     // 36
  'Receiver City',               // 37
  'Receiver State',              // 38
  'Receiver Postal Code',        // 39
  'Receiver Country',            // 40

  // References (41-45)
  'Reference 1',                 // 41
  'Reference 2',                 // 42
  'Reference 3',                 // 43
  'PO Number',                   // 44  — no column on schema, empty
  'Invoice Number',              // 45  — no column on schema, empty

  // Carrier cost — dark accounts only (46-47)
  'Carrier Charge (pre-markup)', // 46
  'Carrier Charge Currency',     // 47

  // Billed charge components (48-62)
  'Base Charge (Billed)',        // 48
  'Fuel Surcharge (Billed)',     // 49
  'Residential Surcharge (Billed)', // 50
  'Delivery Area Surcharge (Billed)', // 51
  'DIM Weight Charge (Billed)',  // 52  — no dedicated column, empty
  'Saturday Delivery (Billed)',  // 53  — no dedicated column, empty
  'Signature Charge (Billed)',   // 54  — no dedicated column, empty
  'Address Correction (Billed)', // 55  — from address_correction
  'Large Package (Billed)',      // 56  — no dedicated column, empty
  'Additional Handling (Billed)',// 57  — from additional_handling
  'Hazmat (Billed)',             // 58  — no dedicated column, empty
  'Return to Sender (Billed)',   // 59  — no dedicated column, empty
  'Other Surcharges (Billed)',   // 60
  'Adjustment (Billed)',         // 61  — from apv_adjustment
  'Currency',                    // 62

  // Totals (63-66)
  'Carrier Total (pre-markup)',  // 63
  'Markup Type',                 // 64
  'Markup Value',                // 65
  'Shipment Total (Billed)',     // 66

  // Variance & disputes (67-70)
  'Variance Amount',             // 67
  'Dispute Flag',                // 68
  'Dispute Status',              // 69  — derived from dispute_flag/billing_status
  'Is Adjustment Only',          // 70

  // Organizational (71-76)
  'Org Name',                    // 71
  'Origin Location Name',        // 72
  'Carrier Account Mode',        // 73
  'Is Cactus Account',           // 74
  'Match Method',                // 75
  'Match Status',                // 76

  // Timing (77-80)
  'Billing Period Start',        // 77
  'Billing Period End',          // 78
  'Due Date',                    // 79
  'Terms (days)',                // 80

  // Audit (81-85)
  'Parsed At',                   // 81
  'Matched At',                  // 82
  'Billed At',                   // 83
  'Markup Source',               // 84
  'Notes',                       // 85
]

const FOOTNOTE =
  'Shipment Total (col 66) is authoritative. Per-charge billed values ' +
  'may reflect fractional-cent display rounding.'

// =============================================================
// BILLED CHARGE COMPUTATION — dispatches by markup_type_applied
// =============================================================

type BilledCharges = {
  base: string
  fuel: string
  residential: string
  delivery_area: string
  dim_weight: string        // always empty — not a standalone column on schema
  saturday: string          // always empty
  signature: string         // always empty
  address_correction: string
  large_package: string     // always empty
  additional_handling: string
  hazmat: string            // always empty
  return_to_sender: string  // always empty
  other: string
  adjustment: string
}

function emptyBilled(): BilledCharges {
  return {
    base: '', fuel: '', residential: '', delivery_area: '',
    dim_weight: '', saturday: '', signature: '',
    address_correction: '', large_package: '',
    additional_handling: '', hazmat: '', return_to_sender: '',
    other: '', adjustment: '',
  }
}

function computeBilledCharges(
  row: LineRow,
  markupType: 'percentage' | 'flat' | null,
  markupValue: Decimal
): BilledCharges {
  // No markup context → everything empty. Shouldn't happen on
  // APPROVED lines but be defensive.
  if (markupType === null) return emptyBilled()

  const d = (v: unknown): Decimal =>
    new Decimal((v as string | number | null | undefined) ?? 0)

  const base = d(row.base_charge)
  const fuel = d(row.fuel_surcharge)
  const resi = d(row.residential_surcharge)
  const dap = d(row.delivery_area_surcharge)
  const addr = d(row.address_correction)
  const hand = d(row.additional_handling)
  const other = d(row.other_surcharges)
  const adj = d(row.apv_adjustment)

  if (markupType === 'percentage') {
    const factor = new Decimal(1).plus(markupValue)
    return {
      base: base.times(factor).toFixed(2),
      fuel: fuel.times(factor).toFixed(2),
      residential: resi.times(factor).toFixed(2),
      delivery_area: dap.times(factor).toFixed(2),
      dim_weight: '',
      saturday: '',
      signature: '',
      address_correction: addr.times(factor).toFixed(2),
      large_package: '',
      additional_handling: hand.times(factor).toFixed(2),
      hazmat: '',
      return_to_sender: '',
      other: other.times(factor).toFixed(2),
      adjustment: adj.times(factor).toFixed(2),
    }
  }

  // FLAT: base + flat; everything else passes through raw.
  // is_adjustment_only → skip the flat on base (it's 0 anyway)
  // and leave adjustment as raw. Matches the seeded Pineridge
  // row 14.
  const baseWithFlat = row.is_adjustment_only
    ? base                        // adjustment-only: no base, no flat
    : base.plus(markupValue)

  return {
    base: baseWithFlat.toFixed(2),
    fuel: fuel.toFixed(2),
    residential: resi.toFixed(2),
    delivery_area: dap.toFixed(2),
    dim_weight: '',
    saturday: '',
    signature: '',
    address_correction: addr.toFixed(2),
    large_package: '',
    additional_handling: hand.toFixed(2),
    hazmat: '',
    return_to_sender: '',
    other: other.toFixed(2),
    adjustment: adj.toFixed(2),
  }
}

// =============================================================
// TYPES — shape of each loaded row. Any cast for the raw query
// result; this is the normalized per-row view the transform
// function reads.
// =============================================================

type LineRow = {
  // invoice_line_items core
  id: string
  tracking_number: string | null
  service_level: string | null
  zone: string | null
  date_shipped: string | null
  date_delivered: string | null
  date_invoiced: string | null
  weight_billed: string | number | null
  weight_unit_billed: string | null
  weight_entered: string | number | null
  weight_unit_entered: string | null
  length_entered: string | number | null
  width_entered: string | number | null
  height_entered: string | number | null
  length_carrier: string | number | null
  width_carrier: string | number | null
  height_carrier: string | number | null
  address_sender_line1: string | null
  address_sender_line2: string | null
  address_sender_city: string | null
  address_sender_state: string | null
  address_sender_zip: string | null
  address_sender_country: string | null
  address_receiver_line1: string | null
  address_receiver_line2: string | null
  address_receiver_city: string | null
  address_receiver_state: string | null
  address_receiver_zip: string | null
  address_receiver_country: string | null
  reference_1: string | null
  reference_2: string | null
  reference_3: string | null
  carrier_charge: string | number | null
  base_charge: string | number | null
  fuel_surcharge: string | number | null
  residential_surcharge: string | number | null
  delivery_area_surcharge: string | number | null
  address_correction: string | number | null
  additional_handling: string | number | null
  other_surcharges: string | number | null
  apv_adjustment: string | number | null
  is_adjustment_only: boolean
  match_method: string | null
  match_status: string | null
  markup_type_applied: 'percentage' | 'flat' | null
  markup_value_applied: string | number | null
  markup_source: string | null
  final_billed_rate: string | number | null
  variance_amount: string | number | null
  dispute_flag: boolean | null
  dispute_notes: string | null
  billing_status: string | null
  created_at: string | null
  // joins
  org_name: string | null
  org_terms_days: number | null
  location_name: string | null
  carrier_invoice_file: string | null
  carrier_invoice_carrier_code: string | null
  carrier_account_mode: string | null
  is_cactus_account: boolean | null
  cactus_invoice_id: string | null
  cactus_billing_period_start: string | null
  cactus_billing_period_end: string | null
  cactus_due_date: string | null
  cactus_created_at: string | null
  matched_at: string | null
}

// =============================================================
// ROW TRANSFORM — 85 cells per line item
// =============================================================

function transformRow(row: LineRow): string[] {
  const markupType = row.markup_type_applied
  const markupValue = new Decimal(row.markup_value_applied ?? 0)
  const billed = computeBilledCharges(row, markupType, markupValue)

  const isLassoed = row.carrier_account_mode === 'lassoed_carrier_account'
  const col46_carrier_charge = isLassoed ? '' : formatMoney(row.carrier_charge)
  const col47_currency = isLassoed ? '' : 'USD'
  const col63_carrier_total = col46_carrier_charge

  // Markup value precision: percentage reads as 0.150000 (6
  // places); flat reads as a dollar amount (2 places is
  // friendlier on a spreadsheet).
  const markupValueDisplay =
    markupType === 'flat'
      ? formatDecimal(markupValue, 2)
      : formatDecimal(markupValue, 6)

  const residentialFlag = row.service_level?.toLowerCase().includes('residential')
    ? 'Y'
    : 'N'

  // Column 69 dispute status: sparse derivation from
  // dispute_flag + billing_status. Empty when no dispute.
  let col69_dispute_status = ''
  if (row.dispute_flag) {
    if (row.billing_status === 'HELD') col69_dispute_status = 'OPEN'
    else if (row.billing_status === 'APPROVED')
      col69_dispute_status = 'RESOLVED'
    else col69_dispute_status = 'OTHER'
  }

  return [
    // Identifiers (1-6)
    formatTracking(row.tracking_number),                 // 1
    shortId(row.cactus_invoice_id),                      // 2
    formatString(row.id),                                // 3
    formatString(row.carrier_invoice_file),              // 4
    formatString(row.carrier_invoice_carrier_code),      // 5
    formatString(row.service_level),                     // 6

    // Dates (7-10)
    formatDate(row.date_shipped),                        // 7
    formatDate(row.date_delivered),                      // 8
    formatDate(row.date_invoiced),                       // 9
    formatDate(row.cactus_created_at),                   // 10

    // Shipment meta (11-16)
    formatString(row.zone),                              // 11
    formatDecimal(row.weight_entered, 2),                // 12
    formatString(row.weight_unit_entered),               // 13
    formatDecimal(row.weight_billed, 2),                 // 14
    formatString(row.weight_unit_billed),                // 15
    residentialFlag,                                     // 16

    // Dimensions entered (17-20)
    formatDecimal(row.length_entered, 2),                // 17
    formatDecimal(row.width_entered, 2),                 // 18
    formatDecimal(row.height_entered, 2),                // 19
    'IN',                                                // 20 no dim_unit column — UPS/US defaults to IN

    // Dimensions carrier (21-24)
    formatDecimal(row.length_carrier, 2),                // 21
    formatDecimal(row.width_carrier, 2),                 // 22
    formatDecimal(row.height_carrier, 2),                // 23
    'IN',                                                // 24

    // Sender address (25-32)
    '',                                                  // 25 — no column on schema
    '',                                                  // 26
    formatString(row.address_sender_line1),              // 27
    formatString(row.address_sender_line2),              // 28
    formatString(row.address_sender_city),               // 29
    formatString(row.address_sender_state),              // 30
    formatString(row.address_sender_zip),                // 31
    formatString(row.address_sender_country),            // 32

    // Receiver address (33-40)
    '',                                                  // 33
    '',                                                  // 34
    formatString(row.address_receiver_line1),            // 35
    formatString(row.address_receiver_line2),            // 36
    formatString(row.address_receiver_city),             // 37
    formatString(row.address_receiver_state),            // 38
    formatString(row.address_receiver_zip),              // 39
    formatString(row.address_receiver_country),          // 40

    // References (41-45)
    formatString(row.reference_1),                       // 41
    formatString(row.reference_2),                       // 42
    formatString(row.reference_3),                       // 43
    '',                                                  // 44 — no PO column
    '',                                                  // 45 — no client invoice ref column

    // Carrier cost (46-47) — dark only
    col46_carrier_charge,                                // 46
    col47_currency,                                      // 47

    // Billed charges (48-62)
    billed.base,                                         // 48
    billed.fuel,                                         // 49
    billed.residential,                                  // 50
    billed.delivery_area,                                // 51
    billed.dim_weight,                                   // 52
    billed.saturday,                                     // 53
    billed.signature,                                    // 54
    billed.address_correction,                           // 55
    billed.large_package,                                // 56
    billed.additional_handling,                          // 57
    billed.hazmat,                                       // 58
    billed.return_to_sender,                             // 59
    billed.other,                                        // 60
    billed.adjustment,                                   // 61
    'USD',                                               // 62

    // Totals (63-66)
    col63_carrier_total,                                 // 63
    formatString(row.markup_type_applied),               // 64
    markupValueDisplay,                                  // 65
    formatMoney(row.final_billed_rate),                  // 66

    // Variance & disputes (67-70)
    row.is_adjustment_only ? '' : formatMoney(row.variance_amount), // 67
    formatYN(row.dispute_flag),                          // 68
    col69_dispute_status,                                // 69
    formatYN(row.is_adjustment_only),                    // 70

    // Organizational (71-76)
    formatString(row.org_name),                          // 71
    formatString(row.location_name),                     // 72
    formatString(row.carrier_account_mode),              // 73
    formatYN(row.is_cactus_account),                     // 74
    formatString(row.match_method),                      // 75
    formatString(row.match_status),                      // 76

    // Timing (77-80)
    formatDate(row.cactus_billing_period_start),         // 77
    formatDate(row.cactus_billing_period_end),           // 78
    formatDate(row.cactus_due_date),                     // 79
    row.org_terms_days != null ? String(row.org_terms_days) : '', // 80

    // Audit (81-85)
    formatDate(row.created_at),                          // 81 — parsed_at
    formatTimestamp(row.matched_at),                     // 82
    formatTimestamp(row.cactus_created_at),              // 83 — billed_at
    formatString(row.markup_source),                     // 84
    formatString(row.dispute_notes),                     // 85
  ]
}

// =============================================================
// LOAD + ORCHESTRATE
// =============================================================

export type GenerateCSVResult = {
  csv: string
  filename: string
}

export async function generateInvoiceCSV(
  cactusInvoiceId: string
): Promise<GenerateCSVResult> {
  const admin = createAdminSupabaseClient()

  // 1. Load cactus_invoice header (org name for filename + timing columns)
  const { data: invoice, error: invoiceError } = await admin
    .from('cactus_invoices')
    .select(
      'id, org_id, billing_period_start, billing_period_end, ' +
      'due_date, created_at, organizations ( name, terms_days )'
    )
    .eq('id', cactusInvoiceId)
    .single()

  if (invoiceError || !invoice) {
    throw new Error(
      `Failed to load cactus_invoice ${cactusInvoiceId}: ` +
      (invoiceError?.message ?? 'not found')
    )
  }

  const invoiceRow = invoice as unknown as {
    id: string
    org_id: string
    billing_period_start: string | null
    billing_period_end: string | null
    due_date: string | null
    created_at: string | null
    organizations: { name: string | null; terms_days: number | null } | null
  }

  // 2. Load line items via junction, with joins.
  //    Composite select keeps this to a single round-trip.
  const { data: junction, error: junctionError } = await admin
    .from('cactus_invoice_line_items')
    .select(
      `
      invoice_line_items (
        id, tracking_number, service_level, zone,
        date_shipped, date_delivered, date_invoiced,
        weight_billed, weight_unit_billed,
        weight_entered, weight_unit_entered,
        length_entered, width_entered, height_entered,
        length_carrier, width_carrier, height_carrier,
        address_sender_line1, address_sender_line2,
        address_sender_city, address_sender_state,
        address_sender_zip, address_sender_country,
        address_receiver_line1, address_receiver_line2,
        address_receiver_city, address_receiver_state,
        address_receiver_zip, address_receiver_country,
        reference_1, reference_2, reference_3,
        carrier_charge, base_charge, fuel_surcharge,
        residential_surcharge, delivery_area_surcharge,
        address_correction, additional_handling,
        other_surcharges, apv_adjustment, is_adjustment_only,
        match_method, match_status,
        markup_type_applied, markup_value_applied, markup_source,
        final_billed_rate, variance_amount,
        dispute_flag, dispute_notes, billing_status,
        created_at, carrier_invoice_id, match_location_id,
        org_carrier_accounts (
          carrier_account_mode, is_cactus_account
        ),
        locations ( name ),
        carrier_invoices (
          invoice_file_name, carrier_code
        )
      )
      `
    )
    .eq('cactus_invoice_id', cactusInvoiceId)
    .order('invoice_line_item_id', { ascending: true })

  if (junctionError) {
    throw new Error(`Failed to load line items: ${junctionError.message}`)
  }

  const rawRows = (junction ?? []) as unknown as Array<{
    invoice_line_items: Record<string, unknown> | null
  }>

  // 3. Match audit timestamps — one row per carrier_invoice_id
  const carrierInvoiceIds = Array.from(
    new Set(
      rawRows
        .map((r) => r.invoice_line_items?.carrier_invoice_id as string | undefined)
        .filter((v): v is string => typeof v === 'string')
    )
  )

  const matchedAtByCarrierInvoice = new Map<string, string>()
  if (carrierInvoiceIds.length > 0) {
    const { data: matchLogs } = await admin
      .from('audit_logs')
      .select('entity_id, created_at, action_type')
      .in('entity_id', carrierInvoiceIds)
      .in('action_type', ['MATCH_RUN', 'MATCHING_ENGINE_RUN'])
      .order('created_at', { ascending: false })

    for (const log of (matchLogs ?? []) as Array<{
      entity_id: string
      created_at: string
    }>) {
      // First iteration per entity wins (most recent, because of ORDER BY DESC)
      if (!matchedAtByCarrierInvoice.has(log.entity_id)) {
        matchedAtByCarrierInvoice.set(log.entity_id, log.created_at)
      }
    }
  }

  // 4. Flatten to LineRow[] for the transform
  const rows: LineRow[] = []
  for (const junctionRow of rawRows) {
    const line = junctionRow.invoice_line_items as Record<string, unknown> | null
    if (!line) continue

    const orgNested =
      (invoiceRow.organizations ?? null) as {
        name: string | null
        terms_days: number | null
      } | null
    const carrierAccount = line.org_carrier_accounts as {
      carrier_account_mode: string | null
      is_cactus_account: boolean | null
    } | null
    const location = line.locations as { name: string | null } | null
    const carrierInvoice = line.carrier_invoices as {
      invoice_file_name: string | null
      carrier_code: string | null
    } | null
    const carrierInvoiceId = line.carrier_invoice_id as string | undefined

    rows.push({
      id: line.id as string,
      tracking_number: (line.tracking_number as string | null) ?? null,
      service_level: (line.service_level as string | null) ?? null,
      zone: (line.zone as string | null) ?? null,
      date_shipped: (line.date_shipped as string | null) ?? null,
      date_delivered: (line.date_delivered as string | null) ?? null,
      date_invoiced: (line.date_invoiced as string | null) ?? null,
      weight_billed: (line.weight_billed as string | number | null) ?? null,
      weight_unit_billed: (line.weight_unit_billed as string | null) ?? null,
      weight_entered: (line.weight_entered as string | number | null) ?? null,
      weight_unit_entered: (line.weight_unit_entered as string | null) ?? null,
      length_entered: (line.length_entered as string | number | null) ?? null,
      width_entered: (line.width_entered as string | number | null) ?? null,
      height_entered: (line.height_entered as string | number | null) ?? null,
      length_carrier: (line.length_carrier as string | number | null) ?? null,
      width_carrier: (line.width_carrier as string | number | null) ?? null,
      height_carrier: (line.height_carrier as string | number | null) ?? null,
      address_sender_line1: (line.address_sender_line1 as string | null) ?? null,
      address_sender_line2: (line.address_sender_line2 as string | null) ?? null,
      address_sender_city: (line.address_sender_city as string | null) ?? null,
      address_sender_state: (line.address_sender_state as string | null) ?? null,
      address_sender_zip: (line.address_sender_zip as string | null) ?? null,
      address_sender_country: (line.address_sender_country as string | null) ?? null,
      address_receiver_line1: (line.address_receiver_line1 as string | null) ?? null,
      address_receiver_line2: (line.address_receiver_line2 as string | null) ?? null,
      address_receiver_city: (line.address_receiver_city as string | null) ?? null,
      address_receiver_state: (line.address_receiver_state as string | null) ?? null,
      address_receiver_zip: (line.address_receiver_zip as string | null) ?? null,
      address_receiver_country: (line.address_receiver_country as string | null) ?? null,
      reference_1: (line.reference_1 as string | null) ?? null,
      reference_2: (line.reference_2 as string | null) ?? null,
      reference_3: (line.reference_3 as string | null) ?? null,
      carrier_charge: (line.carrier_charge as string | number | null) ?? null,
      base_charge: (line.base_charge as string | number | null) ?? null,
      fuel_surcharge: (line.fuel_surcharge as string | number | null) ?? null,
      residential_surcharge: (line.residential_surcharge as string | number | null) ?? null,
      delivery_area_surcharge: (line.delivery_area_surcharge as string | number | null) ?? null,
      address_correction: (line.address_correction as string | number | null) ?? null,
      additional_handling: (line.additional_handling as string | number | null) ?? null,
      other_surcharges: (line.other_surcharges as string | number | null) ?? null,
      apv_adjustment: (line.apv_adjustment as string | number | null) ?? null,
      is_adjustment_only: (line.is_adjustment_only as boolean) ?? false,
      match_method: (line.match_method as string | null) ?? null,
      match_status: (line.match_status as string | null) ?? null,
      markup_type_applied:
        (line.markup_type_applied as 'percentage' | 'flat' | null) ?? null,
      markup_value_applied: (line.markup_value_applied as string | number | null) ?? null,
      markup_source: (line.markup_source as string | null) ?? null,
      final_billed_rate: (line.final_billed_rate as string | number | null) ?? null,
      variance_amount: (line.variance_amount as string | number | null) ?? null,
      dispute_flag: (line.dispute_flag as boolean | null) ?? null,
      dispute_notes: (line.dispute_notes as string | null) ?? null,
      billing_status: (line.billing_status as string | null) ?? null,
      created_at: (line.created_at as string | null) ?? null,
      org_name: orgNested?.name ?? null,
      org_terms_days: orgNested?.terms_days ?? null,
      location_name: location?.name ?? null,
      carrier_invoice_file: carrierInvoice?.invoice_file_name ?? null,
      carrier_invoice_carrier_code: carrierInvoice?.carrier_code ?? null,
      carrier_account_mode: carrierAccount?.carrier_account_mode ?? null,
      is_cactus_account: carrierAccount?.is_cactus_account ?? null,
      cactus_invoice_id: invoiceRow.id,
      cactus_billing_period_start: invoiceRow.billing_period_start,
      cactus_billing_period_end: invoiceRow.billing_period_end,
      cactus_due_date: invoiceRow.due_date,
      cactus_created_at: invoiceRow.created_at,
      matched_at:
        carrierInvoiceId
          ? matchedAtByCarrierInvoice.get(carrierInvoiceId) ?? null
          : null,
    })
  }

  // 5. TRANSFORM + WRITE
  const dataRows = rows.map(transformRow)
  const csv = buildCsv(COLUMN_HEADERS, dataRows, FOOTNOTE)

  // 6. Filename: {org-slug}-cactus-invoice-{week-end}.csv
  const slug = slugifyOrg(invoiceRow.organizations?.name)
  const weekEnd = formatDate(invoiceRow.billing_period_end) || 'unknown-date'
  const filename = `${slug}-cactus-invoice-${weekEnd}.csv`

  return { csv, filename }
}
