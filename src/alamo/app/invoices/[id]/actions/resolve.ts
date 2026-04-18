'use server'

// =============================================================
// CACTUS DISPUTE RESOLUTION ENGINE
// FILE: src/alamo/app/invoices/[id]/actions/resolve.ts
//
// WHAT THIS FILE DOES:
// Resolves HELD invoice line items by manually assigning an org.
// Called from the disputes page when an admin manually assigns
// the correct org to flagged line items.
//
// WHEN IS THIS NEEDED?
// The matching engine flags line items when it can't confidently
// assign an org automatically. Two scenarios:
//
//   1. Multiple address matches — same sender address matches
//      more than one location row. Admin picks the correct org.
//
//   2. Variance dispute — carrier billed more than Cactus quoted
//      beyond the dispute threshold. Admin reviews and approves.
//
// WHAT HAPPENS ON RESOLUTION:
//   1. Look up the carrier account for the assigned org
//   2. Apply Single-Ceiling billing calc
//   3. Create shipment_ledger row (dark accounts only)
//   4. Update invoice_line_items → APPROVED
//   5. Update carrier_invoices counts
//   6. Write to audit_logs
//
// FINANCIAL RULES:
//   - Same Single-Ceiling math as the matching engine
//   - carrier_charge is still the billing basis (never changes)
//   - Once APPROVED, line items are immutable
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'
import { revalidatePath } from 'next/cache'

export type ResolveResult = {
  success: boolean
  resolved: number
  errors: string[]
}

// =============================================================
// RESOLVE DISPUTE GROUP
//
// Resolves one or more HELD line items by assigning them to
// a specific org. Used when admin manually assigns an org
// to flagged items from the disputes page.
//
// lineItemIds  — the IDs of the line items to resolve
// orgId        — the org the admin is assigning them to
// carrierCode  — needed to look up the correct carrier account
// carrierInvoiceId — needed to update the parent invoice counts
// resolvedBy   — the admin user's ID for the audit log
// notes        — optional admin notes explaining the resolution
// =============================================================

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
    errors: [],
  }

  // =============================================================
  // STEP 1: LOOK UP THE CARRIER ACCOUNT FOR THE ASSIGNED ORG
  //
  // Same logic as the matching engine — find the active Cactus
  // account for this org + carrier combination.
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
  // =============================================================

  for (const lineItem of lineItems) {
    const carrierCharge = new Decimal(lineItem.carrier_charge)

    // Apply Single-Ceiling billing calc
    // Same function logic as matching engine — carrier_charge is
    // always the billing basis, never the quoted rate
    let preCeilingAmount: Decimal
    let finalBilledRate: Decimal

    if (account.is_cactus_account) {
      const markupPct = new Decimal(account.markup_percentage ?? 0)
      const markupFlat = new Decimal(account.markup_flat_fee ?? 0)
      preCeilingAmount = carrierCharge
        .times(new Decimal(1).plus(markupPct))
        .plus(markupFlat)
      finalBilledRate = preCeilingAmount
        .times(100)
        .ceil()
        .dividedBy(100)
    } else {
      preCeilingAmount = carrierCharge
      finalBilledRate = carrierCharge
    }

    // Derive v1.6.0 markup context for the invoice_line_items write.
    // Matches the rules used in match.ts: flat overrides percentage when > 0;
    // markup_source follows use_rate_card (rate_card if true, else carrier_account).
    const markupFlat = new Decimal(account.markup_flat_fee ?? 0)
    const markupTypeApplied = markupFlat.greaterThan(0) ? 'flat' : 'percentage'
    const markupValueApplied = markupFlat.greaterThan(0)
      ? markupFlat.toFixed(6)
      : new Decimal(account.markup_percentage ?? 0).toFixed(6)
    const markupSource = account.use_rate_card ? 'rate_card' : 'carrier_account'

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
        markup_percentage: account.markup_percentage,
        markup_flat_fee: account.markup_flat_fee,
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

    // Update the line item to APPROVED
    const { error: updateError } = await supabase
      .from('invoice_line_items')
      .update({
        org_id: orgId,
        org_carrier_account_id: account.id,
        shipment_ledger_id: newLedgerRow.id,
        match_status: 'MANUAL_ASSIGNED',
        billing_status: 'APPROVED',
        dispute_flag: false,
        dispute_notes: notes
          ? `Manually resolved by admin: ${notes}`
          : 'Manually resolved by admin.',
        markup_type_applied: markupTypeApplied,
        markup_value_applied: markupValueApplied,
        markup_source: markupSource,
        pre_ceiling_amount: preCeilingAmount.toFixed(4),
        final_billed_rate: finalBilledRate.toFixed(4),
      })
      .eq('id', lineItem.id)

    if (updateError) {
      result.errors.push(
        `Failed to update line item ${lineItem.id}: ${updateError.message}`
      )
      continue
    }

    result.resolved++
  }

  // =============================================================
  // STEP 4: UPDATE CARRIER INVOICE COUNTS
  //
  // Recalculate matched and flagged counts from the database
  // rather than doing arithmetic — avoids race conditions if
  // this action were ever called concurrently.
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
  // STEP 5: AUDIT LOG — append only
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
    },
  })

  revalidatePath(`/invoices/${carrierInvoiceId}`)
  revalidatePath(`/invoices/${carrierInvoiceId}/disputes`)

  result.success = result.resolved > 0
  return result
}