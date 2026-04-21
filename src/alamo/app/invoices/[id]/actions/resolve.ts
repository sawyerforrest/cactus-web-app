'use server'

// =============================================================
// CACTUS DISPUTE RESOLUTION ENGINE — v3 (Session B split)
// FILE: src/alamo/app/invoices/[id]/actions/resolve.ts
//
// WHAT THIS FILE DOES:
//   Resolves HELD invoice_line_items by manually assigning an
//   org, then hands off to billing-calc.ts to finish Stage 5.
//
// WHEN IS THIS NEEDED?
//   The matching engine flags lines when it can't confidently
//   assign an org automatically, or when variance exceeds the
//   dispute threshold. Two scenarios:
//     1. Address ambiguity — zero or multiple location matches
//     2. Variance dispute — carrier billed beyond threshold
//
// SESSION B SPLIT:
//   Resolution no longer writes final_billed_rate or
//   billing_status = APPROVED directly. Instead it:
//     1. Writes shipment_ledger row (dark accounts only) —
//        ledger's final_billed_rate is NOT NULL, so the math
//        lives here via the shared markup-context helper.
//     2. Updates invoice_line_items to MANUAL_ASSIGNED +
//        billing_status = PENDING.
//     3. Calls runBillingCalc(carrierInvoiceId) which APPROVEs
//        the PENDING line via the same helper.
//
// PARTIAL-FAILURE HANDLING:
//   Ledger write happens FIRST. If it fails, we throw — the
//   line stays HELD and the admin can retry. If the ledger
//   write succeeds but the line update fails, that's a real
//   inconsistency — we log to audit_logs and surface the error
//   so the admin knows to investigate. (Option b from the
//   Session B spec — no RPC transaction needed for current
//   load.)
//
// FINANCIAL RULES:
//   - decimal.js only, no floats
//   - carrier_charge stays the billing basis
//   - Single-Ceiling math centralized in markup-context.ts
//
// IDEMPOTENCY:
//   Resolution only touches lines currently at
//   billing_status = HELD. Re-running is safe.
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'
import {
  deriveMarkupContext,
  computeSingleCeiling,
} from '../../../../lib/markup-context'
import { runBillingCalc, type BillingCalcResult } from './billing-calc'
import { revalidatePath } from 'next/cache'

export type ResolveResult = {
  success: boolean
  resolved: number
  billingCalc: BillingCalcResult | null
  errors: string[]
}

export async function resolveDisputeGroup({
  lineItemIds,
  orgId,
  carrierCode,
  carrierInvoiceId,
  resolvedBy,
  notes,
}: {
  lineItemIds: string[]
  orgId: string
  carrierCode: string
  carrierInvoiceId: string
  resolvedBy: string
  notes?: string
}): Promise<ResolveResult> {

  const supabase = createAdminSupabaseClient()

  const result: ResolveResult = {
    success: false,
    resolved: 0,
    billingCalc: null,
    errors: [],
  }

  // =============================================================
  // STEP 1: LOOK UP THE CARRIER ACCOUNT FOR THE ASSIGNED ORG
  // =============================================================

  const { data: accountRows, error: accountError } = await supabase
    .from('org_carrier_accounts')
    .select(
      'id, org_id, carrier_account_mode, markup_percentage, ' +
      'markup_flat_fee, use_rate_card, dispute_threshold, is_cactus_account'
    )
    .eq('org_id', orgId)
    .eq('carrier_code', carrierCode)
    .eq('is_active', true)
    .eq('is_cactus_account', true)

  if (accountError) {
    result.errors.push(`Carrier account lookup failed: ${accountError.message}`)
    return result
  }

  if (!accountRows || accountRows.length === 0) {
    result.errors.push(
      `No active Cactus ${carrierCode} carrier account found for the selected org. ` +
      `Ensure the org has a carrier account with is_cactus_account = TRUE.`
    )
    return result
  }

  if (accountRows.length > 1) {
    result.errors.push(
      `Multiple active Cactus ${carrierCode} accounts found for this org. ` +
      `Manual resolution not possible — resolve the carrier account ambiguity first.`
    )
    return result
  }

  const account = accountRows[0]
  const markupCtx = deriveMarkupContext(account)

  // =============================================================
  // STEP 2: LOAD THE LINE ITEMS BEING RESOLVED
  // =============================================================

  const { data: lineItems, error: lineItemsError } = await supabase
    .from('invoice_line_items')
    .select('id, tracking_number, carrier_charge, billing_status, match_location_id')
    .in('id', lineItemIds)
    .eq('billing_status', 'HELD')

  if (lineItemsError || !lineItems) {
    result.errors.push(`Failed to load line items: ${lineItemsError?.message}`)
    return result
  }

  if (lineItems.length === 0) {
    result.errors.push('No HELD line items found for the provided IDs.')
    return result
  }

  // =============================================================
  // STEP 3: RESOLVE EACH LINE ITEM
  //
  // Ledger write FIRST, then line update. If ledger write fails
  // we skip this line and record the error; the line stays HELD
  // and the admin can retry. If the line update fails after a
  // successful ledger write we log loudly (inconsistency — one
  // ledger row now exists without a corresponding resolved line).
  // =============================================================

  for (const lineItem of lineItems) {
    const carrierCharge = new Decimal(lineItem.carrier_charge)

    // Single-Ceiling math — same helper used by billing-calc.ts.
    // Needed here because shipment_ledger.final_billed_rate is
    // NOT NULL on the schema. For non-Cactus accounts we skip
    // markup entirely.
    // TODO (DN-2 follow-up): the HELD-line SELECT above does not load
    // is_adjustment_only, so we can't suppress flat markup for
    // adjustment-only resolved lines in the shipment_ledger write.
    // billing-calc.ts handles the invoice_line_items side correctly.
    // If the case materializes, add is_adjustment_only to the SELECT
    // and pass { isAdjustmentOnly: lineItem.is_adjustment_only } here.
    const { preCeilingAmount, finalBilledRate } = account.is_cactus_account
      ? computeSingleCeiling(carrierCharge, markupCtx)
      : { preCeilingAmount: carrierCharge, finalBilledRate: carrierCharge }

    // Create a shipment_ledger row for this manually resolved item.
    // WHY: Every approved line item needs a ledger row for audit trail.
    // For manually resolved items, shipment_source = INVOICE_IMPORT
    // since we never saw the label print.
    // raw_carrier_cost = carrier_charge (no quoted rate exists).
    const trackingNum = lineItem.tracking_number ?? `MANUAL-${lineItem.id}`

    const { data: newLedgerRow, error: ledgerError } = await supabase
      .from('shipment_ledger')
      .insert({
        org_id: orgId,
        org_carrier_account_id: account.id,
        tracking_number: trackingNum,
        carrier_code: carrierCode,
        shipment_source: 'INVOICE_IMPORT',
        raw_carrier_cost: carrierCharge.toFixed(4),
        // v1.6.1 markup context triple
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

    if (ledgerError || !newLedgerRow) {
      result.errors.push(
        `Failed to create ledger row for line item ${lineItem.id}: ` +
        `${ledgerError?.message}`
      )
      continue
    }

    // Update the line to MANUAL_ASSIGNED + PENDING (handoff to
    // Stage 5 billing-calc). Idempotency guard on billing_status
    // prevents a double-resolve if this function is re-entered.
    const { error: updateError, data: updateData } = await supabase
      .from('invoice_line_items')
      .update({
        org_id: orgId,
        org_carrier_account_id: account.id,
        shipment_ledger_id: newLedgerRow.id,
        match_status: 'MANUAL_ASSIGNED',
        billing_status: 'PENDING',
        dispute_flag: false,
        dispute_notes: notes
          ? `Manually resolved by admin: ${notes}`
          : 'Manually resolved by admin.',
      })
      .eq('id', lineItem.id)
      .eq('billing_status', 'HELD')
      .select('id')

    if (updateError) {
      // Partial-failure: ledger written, line NOT updated. Log
      // loudly so admin can reconcile by hand.
      await supabase.from('audit_logs').insert({
        entity_type: 'invoice_line_items',
        entity_id: lineItem.id,
        action: 'RESOLVE_PARTIAL_FAILURE',
        details: {
          message: 'shipment_ledger written but invoice_line_items update failed',
          ledger_id: newLedgerRow.id,
          error: updateError.message,
        },
      })
      result.errors.push(
        `Partial failure on line ${lineItem.id}: ledger written ` +
        `(${newLedgerRow.id}) but line update failed — ${updateError.message}`
      )
      continue
    }

    if (!updateData || updateData.length === 0) {
      // Line was no longer HELD by the time the update ran. This is
      // usually a double-submit — not an error, just a no-op.
      continue
    }

    result.resolved++
  }

  // =============================================================
  // STEP 4: STAGE 5 HANDOFF — runBillingCalc on newly-PENDING lines
  //
  // Safe even if zero lines were just resolved: billing-calc is
  // idempotent and a zero-eligible run is a no-op.
  // =============================================================

  if (result.resolved > 0) {
    try {
      const billing = await runBillingCalc(carrierInvoiceId)
      result.billingCalc = billing
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

  // =============================================================
  // STEP 5: UPDATE CARRIER INVOICE COUNTS
  //
  // Recalculate from the DB (safer than arithmetic under
  // concurrent writes).
  // =============================================================

  const { data: counts } = await supabase
    .from('invoice_line_items')
    .select('billing_status')
    .eq('carrier_invoice_id', carrierInvoiceId)

  if (counts) {
    const matched = counts.filter(
      (r) => r.billing_status === 'APPROVED' || r.billing_status === 'INVOICED'
    ).length
    const flagged = counts.filter((r) => r.billing_status === 'HELD').length
    const newStatus = flagged > 0 ? 'REVIEW' : 'APPROVED'

    await supabase
      .from('carrier_invoices')
      .update({
        matched_line_items: matched,
        flagged_line_items: flagged,
        status: newStatus,
      })
      .eq('id', carrierInvoiceId)
  }

  // =============================================================
  // STEP 6: AUDIT LOG — append only
  // =============================================================

  await supabase.from('audit_logs').insert({
    entity_type: 'carrier_invoices',
    entity_id: carrierInvoiceId,
    action: 'DISPUTE_RESOLVED',
    details: {
      resolvedBy,
      orgId,
      carrierCode,
      lineItemIds,
      resolved: result.resolved,
      errors: result.errors,
      notes: notes ?? null,
      billing_calc_approved: result.billingCalc?.approved ?? 0,
    },
  })

  revalidatePath(`/invoices/${carrierInvoiceId}`)
  revalidatePath(`/invoices/${carrierInvoiceId}/disputes`)

  result.success = result.resolved > 0
  return result
}
