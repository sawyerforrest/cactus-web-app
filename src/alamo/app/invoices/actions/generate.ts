'use server'

// =============================================================
// CACTUS WEEKLY BILLING ENGINE — Stage 5
// FILE: src/alamo/app/invoices/actions/generate.ts
//
// WHAT THIS FILE DOES:
// Generates weekly client invoices (cactus_invoices) from all
// APPROVED invoice line items across the system. Groups by org,
// creates one cactus_invoice per org, links line items via the
// cactus_invoice_line_items junction table, and transitions
// billing_status from APPROVED → INVOICED.
//
// BILLING STATUS FLOW (one direction only):
//   PENDING → HELD → APPROVED → INVOICED
//   This action only performs the APPROVED → INVOICED transition.
//
// FINANCIAL RULES:
//   - All money math uses decimal.js — no JavaScript floats
//   - Never update or delete: shipment_ledger, meter_transactions,
//     audit_logs, rate_shop_log, shipment_events
//   - Only permitted change to invoice_line_items after APPROVED
//     is billing_status → INVOICED
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../lib/supabase-server'
import { revalidatePath } from 'next/cache'

// =============================================================
// TYPES
// =============================================================

export type BillingRunResult = {
  success: boolean
  totalOrgs: number
  totalLineItems: number
  totalAmount: string
  invoicesGenerated: {
    orgId: string
    orgName: string
    lineItems: number
    amount: string
    invoiceId: string
  }[]
  errors: string[]
  reason?: 'NOTHING_TO_BILL' | 'PARTIAL_FAILURE' | 'COMPLETE_FAILURE'
}

type ApprovedLineItem = {
  id: string
  org_id: string
  final_merchant_rate: string
  date_shipped: string | null
}

// =============================================================
// MAIN BILLING RUN
// =============================================================

export async function runWeeklyBilling(): Promise<BillingRunResult> {
  const supabase = createAdminSupabaseClient()

  const result: BillingRunResult = {
    success: false,
    totalOrgs: 0,
    totalLineItems: 0,
    totalAmount: '0',
    invoicesGenerated: [],
    errors: [],
  }

  // =============================================================
  // STEP 1: LOAD ALL APPROVED LINE ITEMS WITH ORG TERMS
  //
  // Fetch every APPROVED line item across all carrier invoices,
  // along with the org's payment terms (terms_days).
  // =============================================================

  const { data: approvedItems, error: loadError } = await supabase
    .from('invoice_line_items')
    .select(`
      id,
      org_id,
      final_merchant_rate,
      date_shipped,
      organizations ( name, terms_days )
    `)
    .eq('billing_status', 'APPROVED')

  if (loadError) {
    result.errors.push(`Failed to load approved line items: ${loadError.message}`)
    result.reason = 'COMPLETE_FAILURE'
    return result
  }

  if (!approvedItems || approvedItems.length === 0) {
    result.success = false
    result.reason = 'NOTHING_TO_BILL'
    return result
  }

  // =============================================================
  // STEP 2: GROUP BY ORG
  // =============================================================

  const orgGroups = new Map<string, {
    orgName: string
    termsDays: number
    items: ApprovedLineItem[]
  }>()

  for (const item of approvedItems) {
    if (!item.org_id) {
      result.errors.push(`Line item ${item.id} has no org_id — skipping.`)
      continue
    }

    const org = item.organizations as any
    const existing = orgGroups.get(item.org_id)

    if (existing) {
      existing.items.push({
        id: item.id,
        org_id: item.org_id,
        final_merchant_rate: item.final_merchant_rate as string,
        date_shipped: item.date_shipped,
      })
    } else {
      orgGroups.set(item.org_id, {
        orgName: org?.name ?? 'Unknown Org',
        termsDays: org?.terms_days ?? 7,
        items: [{
          id: item.id,
          org_id: item.org_id,
          final_merchant_rate: item.final_merchant_rate as string,
          date_shipped: item.date_shipped,
        }],
      })
    }
  }

  // =============================================================
  // STEP 3: CREATE ONE CACTUS INVOICE PER ORG
  //
  // For each org:
  //   1. Calculate total_amount = SUM(final_merchant_rate)
  //   2. Calculate billing_period_start = MIN(date_shipped)
  //   3. Calculate billing_period_end = MAX(date_shipped)
  //   4. Calculate due_date = today + terms_days
  //   5. Insert cactus_invoices row (status = UNPAID)
  //   6. Insert cactus_invoice_line_items junction rows
  //   7. Update invoice_line_items.billing_status → INVOICED
  //
  // Sequential writes with error isolation per org — if one org
  // fails, the others can still succeed.
  // =============================================================

  const today = new Date()
  let runTotalAmount = new Decimal(0)

  for (const [orgId, group] of orgGroups) {
    try {
      // Calculate totals using decimal.js
      let totalAmount = new Decimal(0)
      let periodStart: string | null = null
      let periodEnd: string | null = null

      for (const item of group.items) {
        totalAmount = totalAmount.plus(new Decimal(item.final_merchant_rate))

        if (item.date_shipped) {
          if (!periodStart || item.date_shipped < periodStart) {
            periodStart = item.date_shipped
          }
          if (!periodEnd || item.date_shipped > periodEnd) {
            periodEnd = item.date_shipped
          }
        }
      }

      // Fallback billing period to today if no date_shipped values
      const billingStart = periodStart ?? today.toISOString().split('T')[0]
      const billingEnd = periodEnd ?? today.toISOString().split('T')[0]

      // due_date = today + terms_days
      const dueDate = new Date(today)
      dueDate.setDate(dueDate.getDate() + group.termsDays)
      const dueDateStr = dueDate.toISOString().split('T')[0]

      // INSERT cactus_invoices row
      const { data: newInvoice, error: invoiceInsertError } = await supabase
        .from('cactus_invoices')
        .insert({
          org_id: orgId,
          billing_period_start: billingStart,
          billing_period_end: billingEnd,
          total_amount: totalAmount.toFixed(4),
          due_date: dueDateStr,
          status: 'UNPAID',
        })
        .select('id')
        .single()

      if (invoiceInsertError || !newInvoice) {
        result.errors.push(
          `Failed to create invoice for org "${group.orgName}": ` +
          `${invoiceInsertError?.message ?? 'no data returned'}`
        )
        continue
      }

      // INSERT cactus_invoice_line_items junction rows
      const junctionRows = group.items.map((item) => ({
        cactus_invoice_id: newInvoice.id,
        invoice_line_item_id: item.id,
        org_id: orgId,
        final_merchant_rate: item.final_merchant_rate,
      }))

      const { error: junctionError } = await supabase
        .from('cactus_invoice_line_items')
        .insert(junctionRows)

      if (junctionError) {
        result.errors.push(
          `Failed to create junction rows for org "${group.orgName}": ` +
          `${junctionError.message}. Invoice ${newInvoice.id} created but line items not linked.`
        )
        continue
      }

      // UPDATE invoice_line_items → INVOICED
      // Also set cactus_invoice_id FK for direct lookup
      const lineItemIds = group.items.map((item) => item.id)

      const { error: statusError } = await supabase
        .from('invoice_line_items')
        .update({
          billing_status: 'INVOICED' as any,
          cactus_invoice_id: newInvoice.id,
        })
        .in('id', lineItemIds)

      if (statusError) {
        result.errors.push(
          `Failed to update billing_status for org "${group.orgName}": ` +
          `${statusError.message}. Invoice ${newInvoice.id} created but ` +
          `line items still showing APPROVED.`
        )
        continue
      }

      // Success for this org
      runTotalAmount = runTotalAmount.plus(totalAmount)
      result.invoicesGenerated.push({
        orgId,
        orgName: group.orgName,
        lineItems: group.items.length,
        amount: totalAmount.toFixed(2),
        invoiceId: newInvoice.id,
      })

    } catch (err) {
      result.errors.push(
        `Unexpected error for org "${group.orgName}": ` +
        `${err instanceof Error ? err.message : 'unknown error'}`
      )
    }
  }

  // =============================================================
  // STEP 4: FINALIZE RESULT
  // =============================================================

  result.totalOrgs = result.invoicesGenerated.length
  result.totalLineItems = result.invoicesGenerated.reduce(
    (sum, inv) => sum + inv.lineItems,
    0
  )
  result.totalAmount = runTotalAmount.toFixed(2)

  if (result.invoicesGenerated.length === 0 && result.errors.length > 0) {
    result.reason = 'COMPLETE_FAILURE'
  } else if (result.errors.length > 0) {
    result.success = true
    result.reason = 'PARTIAL_FAILURE'
  } else {
    result.success = true
  }

  // =============================================================
  // STEP 5: AUDIT LOG — append only, never update or delete
  // =============================================================

  await supabase.from('audit_logs').insert({
    entity_type: 'billing_run',
    action: 'WEEKLY_BILLING_RUN',
    details: {
      totalOrgs: result.totalOrgs,
      totalLineItems: result.totalLineItems,
      totalAmount: result.totalAmount,
      invoicesGenerated: result.invoicesGenerated.map((inv) => ({
        orgId: inv.orgId,
        orgName: inv.orgName,
        lineItems: inv.lineItems,
        amount: inv.amount,
        invoiceId: inv.invoiceId,
      })),
      errors: result.errors,
    },
  })

  revalidatePath('/invoices')

  return result
}
