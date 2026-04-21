'use server'

// =============================================================
// CACTUS MATCHING ENGINE — v3 (Session B split)
// FILE: src/alamo/app/invoices/[id]/actions/match.ts
//
// ARCHITECTURAL SHIFT (Session B):
//   Matching no longer applies markup or sets billing_status =
//   APPROVED. It only assigns org_id, sets match_status, and
//   leaves billing_status = PENDING for eligible lines. Stage 5
//   (billing-calc.ts) is called at the end to APPROVE the
//   PENDING lines.
//
//   Shipment_ledger rows are still created here for dark
//   accounts, because the ledger's final_billed_rate column is
//   NOT NULL — and it IS computable at match time from
//   carrier_charge + the account's markup config. The math is
//   centralized in markup-context.ts; match.ts only calls the
//   shared helpers, never implements the math itself.
//
// PER LINE ITEM FLOW:
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
//   STEP 3: Set match_status + billing_status
//     AUTO_MATCHED + PENDING — handoff to billing-calc
//     FLAGGED    + HELD    — dispute, no billing
//
// FINANCIAL RULES ENFORCED:
//   - No floats — decimal.js only
//   - carrier_charge is ALWAYS the billing basis
//   - Single-Ceiling happens ONCE per line, in Stage 5 for
//     invoice_line_items, and here (via shared helper) for
//     shipment_ledger dark-account rows
//   - Variance = carrier_charge - raw_carrier_cost
//   - Disputed lines → HELD, never auto-billed
//
// IDEMPOTENCY:
//   Only UPDATE rows whose current match_status is UNMATCHED or
//   whose billing_status is PENDING. Re-running on the same
//   invoice leaves already-matched lines alone.
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'
import {
  deriveMarkupContext,
  computeSingleCeiling,
} from '../../../../lib/markup-context'
import { runBillingCalc, type BillingCalcResult } from './billing-calc'
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
  billingCalc: BillingCalcResult | null
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
// LASSOED DATE ENRICHMENT (Phase 3, Session B)
//
// Pulls LABEL_CREATED → date_shipped and DELIVERED →
// date_delivered from shipment_events. Returns a partial object
// suitable for spreading into an invoice_line_items UPDATE.
//
// Empty keys are intentional: only override when the ledger
// actually has the event, otherwise leave the parser's existing
// values (Transaction Date proxy for date_shipped; typically
// NULL for date_delivered).
//
// LIMITATION: without Stage 6 (rate engine) producing real
// shipment_events, there's nothing to enrich against — this is
// written for future readiness. See the Session B completion
// summary under "VERIFICATION LIMITATIONS".
// =============================================================

type DateOverrides = {
  date_shipped?: string
  date_delivered?: string
}

async function loadLedgerDates(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  ledgerId: string
): Promise<DateOverrides> {
  const overrides: DateOverrides = {}

  const { data: labelEvent } = await supabase
    .from('shipment_events')
    .select('carrier_timestamp')
    .eq('shipment_ledger_id', ledgerId)
    .eq('event_type', 'LABEL_CREATED')
    .order('carrier_timestamp', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (labelEvent?.carrier_timestamp) {
    // carrier_timestamp is TIMESTAMPTZ; slice to the date component.
    overrides.date_shipped = labelEvent.carrier_timestamp.slice(0, 10)
  }

  const { data: deliveredEvent } = await supabase
    .from('shipment_events')
    .select('carrier_timestamp')
    .eq('shipment_ledger_id', ledgerId)
    .eq('event_type', 'DELIVERED')
    .order('carrier_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (deliveredEvent?.carrier_timestamp) {
    overrides.date_delivered = deliveredEvent.carrier_timestamp.slice(0, 10)
  }

  return overrides
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
    billingCalc: null,
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
  //
  // After Session B: matching writes org_id + match_status and
  // leaves billing_status = PENDING. Stage 5 (runBillingCalc)
  // runs at the end to flip PENDING → APPROVED and write
  // final_billed_rate + markup context.
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

        // variance = carrier_charge - raw_carrier_cost (both pre-markup).
        // Unchanged from Session A — variance math is NOT part of the
        // Session B refactor.
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
          // Clean match — hand off to Stage 5 (billing-calc.ts) via
          // billing_status = PENDING. No markup math written here.
          //
          // Lassoed-only date enrichment (Phase 3): if the ledger has
          // a LABEL_CREATED event, prefer its timestamp as date_shipped
          // over the parser's Transaction Date proxy. If it has a
          // DELIVERED event, populate date_delivered. Dark lines skip
          // this — no ledger exists pre-match.
          const dateOverrides = await loadLedgerDates(supabase, ledgerRow.id)

          await supabase
            .from('invoice_line_items')
            .update({
              org_id: ledgerRow.org_id,
              org_carrier_account_id: account.id,
              shipment_ledger_id: ledgerRow.id,
              match_method: 'TRACKING_NUMBER',
              match_status: 'AUTO_MATCHED',
              variance_amount: varianceAmount.toFixed(4),
              billing_status: 'PENDING',
              dispute_flag: false,
              ...dateOverrides,
            })
            .eq('id', lineItem.id)
          result.lassoed.matched++
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

    // Create shipment_ledger row — first time Cactus sees this dark shipment.
    // raw_carrier_cost = carrier_charge (no quoted rate exists for dark accounts).
    //
    // Session B: shipment_ledger.final_billed_rate is NOT NULL on the
    // schema, and it IS computable at match time (carrier_charge + the
    // account's markup config). We reuse the shared computeSingleCeiling
    // helper so this file doesn't implement markup math itself — the
    // one authoritative implementation lives in markup-context.ts.
    const markupCtx = deriveMarkupContext(account)
    // TODO (DN-2 follow-up): the dark-path line SELECT above does not
    // load is_adjustment_only, so we can't suppress flat markup for
    // adjustment-only dark-account lines here. billing-calc.ts handles
    // the invoice_line_items side correctly — this affects only the
    // shipment_ledger's stored final_billed_rate for the rare case of
    // a dark adjustment-only line under flat markup. If that case
    // materializes, add is_adjustment_only to the SELECT and pass
    // { isAdjustmentOnly: lineItem.is_adjustment_only } here.
    const { preCeilingAmount, finalBilledRate } = account.is_cactus_account
      ? computeSingleCeiling(carrierCharge, markupCtx)
      : { preCeilingAmount: carrierCharge, finalBilledRate: carrierCharge }

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
          // v1.6.1: markup context triple replaces markup_percentage /
          // markup_flat_fee on shipment_ledger.
          markup_type_applied: markupCtx.markup_type_applied,
          markup_value_applied: markupCtx.markup_value_applied,
          markup_source: markupCtx.markup_source,
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

    // Hand off to Stage 5 via billing_status = PENDING. No markup write
    // on invoice_line_items here — billing-calc.ts will fill it in.
    await supabase
      .from('invoice_line_items')
      .update({
        org_id: matchedLocation.org_id,
        org_carrier_account_id: account.id,
        shipment_ledger_id: newLedgerRow.id,
        match_method: 'SHIP_FROM_ADDRESS',
        match_status: 'AUTO_MATCHED',
        match_location_id: matchedLocation.id,
        billing_status: 'PENDING',
        dispute_flag: false,
      })
      .eq('id', lineItem.id)

    result.dark.matched++
  }

  // =============================================================
  // UPDATE CARRIER INVOICE STATUS
  // REVIEW  = any lines flagged → admin must resolve disputes
  // APPROVED = all lines matched cleanly → billing-calc runs
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

  // Audit log for the match run (billing-calc writes its own audit row).
  await supabase.from('audit_logs').insert({
    entity_type: 'carrier_invoices',
    entity_id: carrierInvoiceId,
    action_type: 'MATCHING_ENGINE_RUN',
    metadata: {
      totalProcessed: result.totalProcessed,
      totalMatched,
      totalFlagged,
      lassoed: result.lassoed,
      dark: result.dark,
      newInvoiceStatus,
      errors: result.errors,
    },
  })

  // =============================================================
  // STAGE 5 HANDOFF — runBillingCalc on any newly-PENDING lines.
  //
  // Called unconditionally: even with zero auto-matches this run,
  // prior runs may have left PENDING lines behind (retry, partial
  // failure). billing-calc.ts is idempotent — it only touches
  // lines that are still PENDING + AUTO_MATCHED/MANUAL_ASSIGNED.
  // =============================================================

  if (totalMatched > 0) {
    try {
      const billing = await runBillingCalc(carrierInvoiceId)
      result.billingCalc = billing
      result.billingCalculated = billing.approved

      if (billing.errors.length > 0) {
        result.errors.push(
          ...billing.errors.map(
            (e) =>
              `billing-calc: ${e.tracking_number ?? e.line_id}: ${e.message}`
          )
        )
      }
    } catch (err) {
      result.errors.push(
        `billing-calc failed: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  revalidatePath(`/invoices/${carrierInvoiceId}`)

  result.success = true
  return result
}
