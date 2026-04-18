'use server'

// =============================================================
// CACTUS MATCHING ENGINE — v2
// FILE: src/alamo/app/invoices/[id]/actions/match.ts
//
// ARCHITECTURE (v2 — corrected):
// The carrier invoice arrives tagged to a carrier (e.g. UPS)
// but NOT to a specific org. One Cactus master UPS account
// serves multiple orgs. So we cannot determine the org from
// the invoice itself — we must determine it per line item.
//
// PER LINE ITEM FLOW:
//
//   STEP 1: Determine org_id
//     Lassoed → tracking_number → shipment_ledger → org_id
//     Dark    → address_sender_normalized → locations → org_id
//
//   STEP 2: Look up the carrier account for that org
//     org_carrier_accounts WHERE:
//       org_id = matched org_id
//       carrier_code = invoice carrier_code
//       is_active = TRUE
//       is_cactus_account = TRUE
//
//     Exactly one row → use its markup + mode + dispute_threshold
//     Zero rows       → org has no active Cactus account → flag
//     Multiple rows   → ambiguous → flag for review
//
//   STEP 3: Apply markup + Single-Ceiling using that account's rates
//
// WHY is_cactus_account = TRUE as the filter?
//   All orgs share the same Cactus master carrier account number.
//   is_cactus_account = TRUE identifies the Cactus-owned account
//   that earns margin. Pass-through accounts (FALSE) are excluded.
//
// FINANCIAL RULES ENFORCED:
//   - No floats — all math uses decimal.js
//   - carrier_charge is ALWAYS the billing basis
//   - Single-Ceiling applied once per shipment total
//   - Variance = carrier_charge - raw_carrier_cost (never vs final_billed_rate)
//   - Disputed lines → HELD, never auto-billed
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'
import { revalidatePath } from 'next/cache'

// =============================================================
// TYPES
// =============================================================

export type MatchResult = {
  success: boolean
  totalProcessed: number
  lassoed: {
    matched: number
    held: number
    skipped: number
  }
  dark: {
    matched: number
    flagged: number
  }
  billingCalculated: number
  errors: string[]
}

type CarrierAccount = {
  id: string
  org_id: string
  carrier_account_mode: 'lassoed_carrier_account' | 'dark_carrier_account'
  markup_percentage: string
  markup_flat_fee: string
  use_rate_card: boolean
  dispute_threshold: string
  is_cactus_account: boolean
}

// Derive the v1.6.0 markup context fields from an org_carrier_accounts row.
// Returns the three values we now write to invoice_line_items instead of
// the deprecated markup_percentage / markup_flat_fee pair.
function deriveMarkupContext(account: CarrierAccount): {
  markup_type_applied: 'percentage' | 'flat'
  markup_value_applied: string
  markup_source: 'carrier_account' | 'rate_card'
} {
  const flat = new Decimal(account.markup_flat_fee ?? 0)
  if (flat.greaterThan(0)) {
    return {
      markup_type_applied: 'flat',
      markup_value_applied: flat.toFixed(6),
      markup_source: account.use_rate_card ? 'rate_card' : 'carrier_account',
    }
  }
  const pct = new Decimal(account.markup_percentage ?? 0)
  return {
    markup_type_applied: 'percentage',
    markup_value_applied: pct.toFixed(6),
    markup_source: account.use_rate_card ? 'rate_card' : 'carrier_account',
  }
}

// =============================================================
// SINGLE-CEILING BILLING CALCULATION
// =============================================================

function applyBillingCalc(
  carrierCharge: Decimal,
  account: CarrierAccount
): { preCeilingAmount: Decimal; finalBilledRate: Decimal } {
  if (!account.is_cactus_account) {
    return {
      preCeilingAmount: carrierCharge,
      finalBilledRate: carrierCharge,
    }
  }

  const markupPct = new Decimal(account.markup_percentage ?? 0)
  const markupFlat = new Decimal(account.markup_flat_fee ?? 0)

  const preCeilingAmount = carrierCharge
    .times(new Decimal(1).plus(markupPct))
    .plus(markupFlat)

  const finalBilledRate = preCeilingAmount
    .times(100)
    .ceil()
    .dividedBy(100)

  return { preCeilingAmount, finalBilledRate }
}

// =============================================================
// CARRIER ACCOUNT LOOKUP — per line item
//
// After org_id is known from matching, finds the correct
// carrier account row for markup rates.
//
// Returns null + reason if zero or multiple rows found.
// =============================================================

async function lookupCarrierAccount(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  orgId: string,
  carrierCode: string
): Promise<{ account: CarrierAccount | null; reason: string | null }> {
  const { data, error } = await supabase
    .from('org_carrier_accounts')
    .select(
      'id, org_id, carrier_account_mode, markup_percentage, ' +
      'markup_flat_fee, use_rate_card, dispute_threshold, is_cactus_account'
    )
    .eq('org_id', orgId)
    .eq('carrier_code', carrierCode)
    .eq('is_active', true)
    .eq('is_cactus_account', true)

  if (error) {
    return {
      account: null,
      reason: `Carrier account lookup failed: ${error.message}`,
    }
  }

  if (!data || data.length === 0) {
    return {
      account: null,
      reason:
        `No active Cactus ${carrierCode} carrier account found for this org. ` +
        `Ensure the org has a carrier account with is_cactus_account = TRUE.`,
    }
  }

  if (data.length > 1) {
    return {
      account: null,
      reason:
        `Multiple active Cactus ${carrierCode} accounts found for this org ` +
        `(${data.length} rows). Manual assignment required.`,
    }
  }

  return { account: data[0] as CarrierAccount, reason: null }
}

// =============================================================
// MAIN MATCHING ENGINE
// =============================================================

export async function runMatchingEngine(
  carrierInvoiceId: string
): Promise<MatchResult> {

  const supabase = createAdminSupabaseClient()

  const result: MatchResult = {
    success: false,
    totalProcessed: 0,
    lassoed: { matched: 0, held: 0, skipped: 0 },
    dark: { matched: 0, flagged: 0 },
    billingCalculated: 0,
    errors: [],
  }

  // Load the carrier invoice — only need carrier_code now
  const { data: carrierInvoice, error: invoiceError } = await supabase
    .from('carrier_invoices')
    .select('id, carrier_code')
    .eq('id', carrierInvoiceId)
    .single()

  if (invoiceError || !carrierInvoice) {
    result.errors.push(
      `Could not load carrier invoice: ${invoiceError?.message ?? 'not found'}`
    )
    return result
  }

  // Load all PENDING line items for this invoice
  const { data: lineItems, error: lineItemsError } = await supabase
    .from('invoice_line_items')
    .select('id, tracking_number, address_sender_normalized, carrier_charge')
    .eq('carrier_invoice_id', carrierInvoiceId)
    .eq('billing_status', 'PENDING')

  if (lineItemsError) {
    result.errors.push(`Could not load line items: ${lineItemsError.message}`)
    return result
  }

  if (!lineItems || lineItems.length === 0) {
    result.success = true
    return result
  }

  result.totalProcessed = lineItems.length

  // Load all active billing locations once — filter in memory.
  // WHY: 950 line items × 1 DB query each = 950 queries (slow).
  // Load all once and filter in JS = 1 query (fast).
  const { data: allLocations, error: locationsError } = await supabase
    .from('locations')
    .select('id, org_id, normalized_address, name')
    .eq('is_billing_address', true)
    .eq('is_active', true)

  if (locationsError) {
    result.errors.push(`Could not load locations: ${locationsError.message}`)
    return result
  }

  const locations = allLocations ?? []

  // =============================================================
  // PROCESS EACH LINE ITEM
  // =============================================================

  for (const lineItem of lineItems) {
    const carrierCharge = new Decimal(lineItem.carrier_charge)

    // ----------------------------------------------------------
    // LASSOED PATH: tracking_number → shipment_ledger → org_id
    // ----------------------------------------------------------

    if (lineItem.tracking_number) {
      const { data: ledgerRow } = await supabase
        .from('shipment_ledger')
        .select('id, org_id, org_carrier_account_id, raw_carrier_cost')
        .eq('tracking_number', lineItem.tracking_number)
        .single()

      if (ledgerRow) {
        // Found in ledger — lassoed shipment
        const { account, reason } = await lookupCarrierAccount(
          supabase,
          ledgerRow.org_id,
          carrierInvoice.carrier_code
        )

        if (!account) {
          await supabase
            .from('invoice_line_items')
            .update({
              org_id: ledgerRow.org_id,
              shipment_ledger_id: ledgerRow.id,
              match_method: 'TRACKING_NUMBER',
              match_status: 'FLAGGED',
              billing_status: 'HELD',
              dispute_flag: true,
              dispute_notes: reason,
            })
            .eq('id', lineItem.id)
          result.lassoed.held++
          continue
        }

        // variance = carrier_charge - raw_carrier_cost (both pre-markup)
        const rawCarrierCost = new Decimal(ledgerRow.raw_carrier_cost)
        const varianceAmount = carrierCharge.minus(rawCarrierCost)
        const disputeThreshold = new Decimal(account.dispute_threshold)
        const exceedsThreshold = varianceAmount.abs().greaterThan(disputeThreshold)

        if (exceedsThreshold) {
          await supabase
            .from('invoice_line_items')
            .update({
              org_id: ledgerRow.org_id,
              org_carrier_account_id: account.id,
              shipment_ledger_id: ledgerRow.id,
              match_method: 'TRACKING_NUMBER',
              match_status: 'AUTO_MATCHED',
              variance_amount: varianceAmount.toFixed(4),
              billing_status: 'HELD',
              dispute_flag: true,
              dispute_notes:
                `Variance $${varianceAmount.abs().toFixed(2)} exceeds ` +
                `threshold $${disputeThreshold.toFixed(2)}. ` +
                `Carrier billed $${carrierCharge.toFixed(2)}, ` +
                `Cactus quoted $${rawCarrierCost.toFixed(2)}.`,
            })
            .eq('id', lineItem.id)
          result.lassoed.held++
        } else {
          const { preCeilingAmount, finalBilledRate } =
            applyBillingCalc(carrierCharge, account)
          const markupCtx = deriveMarkupContext(account)

          await supabase
            .from('invoice_line_items')
            .update({
              org_id: ledgerRow.org_id,
              org_carrier_account_id: account.id,
              shipment_ledger_id: ledgerRow.id,
              match_method: 'TRACKING_NUMBER',
              match_status: 'AUTO_MATCHED',
              variance_amount: varianceAmount.toFixed(4),
              billing_status: 'APPROVED',
              dispute_flag: false,
              markup_type_applied: markupCtx.markup_type_applied,
              markup_value_applied: markupCtx.markup_value_applied,
              markup_source: markupCtx.markup_source,
              pre_ceiling_amount: preCeilingAmount.toFixed(4),
              final_billed_rate: finalBilledRate.toFixed(4),
            })
            .eq('id', lineItem.id)
          result.lassoed.matched++
          result.billingCalculated++
        }
        continue
      }
      // Tracking number not in ledger — fall through to dark path
    }

    // ----------------------------------------------------------
    // DARK PATH: address_sender_normalized → locations → org_id
    //
    // Runs when:
    //   - Line item has no tracking number, OR
    //   - Tracking number not found in shipment_ledger
    // ----------------------------------------------------------

    if (!lineItem.address_sender_normalized) {
      await supabase
        .from('invoice_line_items')
        .update({
          match_status: 'FLAGGED',
          billing_status: 'HELD',
          dispute_flag: true,
          dispute_notes:
            'No tracking number found in shipment ledger and no sender address. ' +
            'Cannot identify org. Manual assignment required.',
        })
        .eq('id', lineItem.id)
      result.dark.flagged++
      continue
    }

    const matches = locations.filter(
      (loc) => loc.normalized_address === lineItem.address_sender_normalized
    )

    if (matches.length === 0) {
      await supabase
        .from('invoice_line_items')
        .update({
          match_status: 'FLAGGED',
          billing_status: 'HELD',
          dispute_flag: true,
          dispute_notes:
            `Sender address "${lineItem.address_sender_normalized}" did not match ` +
            `any active billing location. Admin must manually assign the org.`,
        })
        .eq('id', lineItem.id)
      result.dark.flagged++
      continue
    }

    if (matches.length > 1) {
      const locationNames = matches.map((m) => m.name).join(', ')
      await supabase
        .from('invoice_line_items')
        .update({
          match_status: 'FLAGGED',
          billing_status: 'HELD',
          dispute_flag: true,
          dispute_notes:
            `Sender address matched ${matches.length} locations: ${locationNames}. ` +
            `Admin must manually assign the correct org.`,
        })
        .eq('id', lineItem.id)
      result.dark.flagged++
      continue
    }

    // Exactly one match — org identified
    const matchedLocation = matches[0]

    const { account, reason } = await lookupCarrierAccount(
      supabase,
      matchedLocation.org_id,
      carrierInvoice.carrier_code
    )

    if (!account) {
      await supabase
        .from('invoice_line_items')
        .update({
          org_id: matchedLocation.org_id,
          match_method: 'SHIP_FROM_ADDRESS',
          match_status: 'FLAGGED',
          match_location_id: matchedLocation.id,
          billing_status: 'HELD',
          dispute_flag: true,
          dispute_notes: reason,
        })
        .eq('id', lineItem.id)
      result.dark.flagged++
      continue
    }

    const { preCeilingAmount, finalBilledRate } =
      applyBillingCalc(carrierCharge, account)
    const markupCtx = deriveMarkupContext(account)

    // Create shipment_ledger row — first time Cactus sees this dark shipment.
    // raw_carrier_cost = carrier_charge (no quoted rate exists for dark accounts).
    const trackingNum = lineItem.tracking_number ?? `DARK-${lineItem.id}`

    const { data: newLedgerRow, error: ledgerInsertError } =
      await supabase
        .from('shipment_ledger')
        .insert({
          org_id: matchedLocation.org_id,
          org_carrier_account_id: account.id,
          tracking_number: trackingNum,
          carrier_code: carrierInvoice.carrier_code,
          shipment_source: 'INVOICE_IMPORT',
          raw_carrier_cost: carrierCharge.toFixed(4),
          markup_percentage: account.markup_percentage,
          markup_flat_fee: account.markup_flat_fee,
          pre_ceiling_amount: preCeilingAmount.toFixed(4),
          final_billed_rate: finalBilledRate.toFixed(4),
          reconciled: true,
          reconciled_at: new Date().toISOString(),
        })
        .select('id')
        .single()

    if (ledgerInsertError || !newLedgerRow) {
      result.errors.push(
        `Failed to create shipment_ledger row for line ${lineItem.id}: ` +
        `${ledgerInsertError?.message}`
      )
      await supabase
        .from('invoice_line_items')
        .update({
          org_id: matchedLocation.org_id,
          match_status: 'FLAGGED',
          billing_status: 'HELD',
          dispute_flag: true,
          dispute_notes:
            `Address matched "${matchedLocation.name}" but shipment ledger ` +
            `insert failed. Admin review required.`,
        })
        .eq('id', lineItem.id)
      result.dark.flagged++
      continue
    }

    await supabase
      .from('invoice_line_items')
      .update({
        org_id: matchedLocation.org_id,
        org_carrier_account_id: account.id,
        shipment_ledger_id: newLedgerRow.id,
        match_method: 'SHIP_FROM_ADDRESS',
        match_status: 'AUTO_MATCHED',
        match_location_id: matchedLocation.id,
        billing_status: 'APPROVED',
        dispute_flag: false,
        markup_type_applied: markupCtx.markup_type_applied,
        markup_value_applied: markupCtx.markup_value_applied,
        markup_source: markupCtx.markup_source,
        pre_ceiling_amount: preCeilingAmount.toFixed(4),
        final_billed_rate: finalBilledRate.toFixed(4),
      })
      .eq('id', lineItem.id)

    result.dark.matched++
    result.billingCalculated++
  }

  // =============================================================
  // UPDATE CARRIER INVOICE STATUS
  // REVIEW  = any lines flagged → admin must resolve disputes
  // APPROVED = all lines matched cleanly → ready for invoice gen
  // =============================================================

  const totalMatched = result.lassoed.matched + result.dark.matched
  const totalFlagged =
    result.lassoed.held +
    result.lassoed.skipped +
    result.dark.flagged

  const newInvoiceStatus = totalFlagged > 0 ? 'REVIEW' : 'APPROVED'

  await supabase
    .from('carrier_invoices')
    .update({
      matched_line_items: totalMatched,
      flagged_line_items: totalFlagged,
      status: newInvoiceStatus,
      processed_at: new Date().toISOString(),
    })
    .eq('id', carrierInvoiceId)

  // Audit log — append only, never update or delete
  await supabase.from('audit_logs').insert({
    entity_type: 'carrier_invoices',
    entity_id: carrierInvoiceId,
    action: 'MATCHING_ENGINE_RUN',
    details: {
      totalProcessed: result.totalProcessed,
      totalMatched,
      totalFlagged,
      lassoed: result.lassoed,
      dark: result.dark,
      billingCalculated: result.billingCalculated,
      newInvoiceStatus,
      errors: result.errors,
    },
  })

  revalidatePath(`/invoices/${carrierInvoiceId}`)

  result.success = true
  return result
}