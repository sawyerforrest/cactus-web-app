'use server'

// =============================================================
// CACTUS BILLING CALC — Stage 5 of the v1.6.0 8-stage pipeline
// FILE: src/alamo/app/invoices/[id]/actions/billing-calc.ts
//
// WHAT THIS FILE DOES:
//   Walks every PENDING invoice_line_item that has been matched
//   (AUTO_MATCHED or MANUAL_ASSIGNED) and:
//     1. Resolves the org's active Cactus carrier account
//     2. Applies Single-Ceiling markup against carrier_charge
//     3. Writes final_billed_rate + the v1.6.0 markup context
//     4. Flips billing_status to APPROVED
//
// SEPARATED FROM MATCH/RESOLVE — why:
//   In Session A, match.ts and resolve.ts each did matching AND
//   markup AND APPROVED transition atomically. That meant a
//   markup-policy change required re-running matching, and a
//   bug in markup math sat inside a file everyone was scared
//   to touch. Splitting the stages means Billing Calc is
//   independently re-runnable: fix markup, run Billing Calc,
//   no re-match needed.
//
// FINANCIAL RULES (briefing-level, non-negotiable):
//   - decimal.js everywhere — never floats
//   - carrier_charge is ALWAYS the billing basis (per briefing);
//     markup is applied to carrier_charge, not to a
//     sum-of-components. When carrier_charge == sum(components),
//     the two approaches match exactly; when they diverge
//     (e.g. parser missed a surcharge), we trust carrier_charge.
//   - Single-Ceiling: round UP to next whole cent ONCE per line,
//     after (1 + markup_pct) * carrier_charge + flat.
//   - Idempotency guard on the UPDATE: .eq('billing_status',
//     'PENDING') — NEVER remove. Prevents double-billing on
//     retry or re-run.
//
// EDGE CASES (resolved policies):
//   - is_adjustment_only = TRUE with flat markup: flat fee is NOT
//     applied (DN-2 resolved 2026-04-20). Adjustment lines pass
//     through with final_billed_rate = carrier_charge. Per Sawyer:
//     "flat mark-up applies once per tracking number to the base
//     charge; adjustment-only lines have no base to apply it to."
//   - Account has both markup_percentage > 0 AND markup_flat_fee
//     > 0: preserves Session A behavior (flat wins). Documented
//     as DN-1; the Alamo org_carrier_accounts editor should
//     reject this configuration at save time (future work).
// =============================================================

import Decimal from 'decimal.js'
import { createAdminSupabaseClient } from '../../../../lib/supabase-server'
import {
  deriveMarkupContext,
  computeSingleCeiling,
  type MarkupContext,
} from '../../../../lib/markup-context'

// =============================================================
// TYPES
// =============================================================

export interface BillingCalcResult {
  invoice_id: string
  total_eligible: number
  approved: number
  skipped: number
  errors: Array<{
    line_id: string
    tracking_number: string | null
    message: string
  }>
  started_at: string
  completed_at: string
}

type EligibleLine = {
  id: string
  tracking_number: string | null
  org_carrier_account_id: string | null
  carrier_charge: string
  is_adjustment_only: boolean
}

type AccountRow = {
  id: string
  is_cactus_account: boolean
  markup_percentage: string | number | null
  markup_flat_fee: string | number | null
  use_rate_card: boolean | null
}

// Single-Ceiling math lives in src/alamo/lib/markup-context.ts
// so match.ts (shipment_ledger writes) and billing-calc.ts
// (invoice_line_items writes) share a single implementation.

// =============================================================
// MAIN ENTRY POINT
// =============================================================

export async function runBillingCalc(
  carrierInvoiceId: string
): Promise<BillingCalcResult> {

  const supabase = createAdminSupabaseClient()
  const started_at = new Date().toISOString()

  const result: BillingCalcResult = {
    invoice_id: carrierInvoiceId,
    total_eligible: 0,
    approved: 0,
    skipped: 0,
    errors: [],
    started_at,
    completed_at: started_at, // updated before return
  }

  // --- Step 1: load PENDING eligible lines (AUTO_MATCHED or MANUAL_ASSIGNED)
  const { data: lines, error: linesErr } = await supabase
    .from('invoice_line_items')
    .select(
      'id, tracking_number, org_carrier_account_id, ' +
      'carrier_charge, is_adjustment_only'
    )
    .eq('carrier_invoice_id', carrierInvoiceId)
    .eq('billing_status', 'PENDING')
    .in('match_status', ['AUTO_MATCHED', 'MANUAL_ASSIGNED'])
    .not('org_carrier_account_id', 'is', null)

  if (linesErr) {
    throw new Error(`billing-calc: failed to load lines: ${linesErr.message}`)
  }

  const eligible = (lines ?? []) as EligibleLine[]
  result.total_eligible = eligible.length

  if (eligible.length === 0) {
    result.completed_at = new Date().toISOString()
    return result
  }

  // --- Step 2: batch-load carrier accounts for every distinct account id
  const uniqueAccountIds = Array.from(
    new Set(eligible.map((l) => l.org_carrier_account_id).filter(
      (id): id is string => id !== null
    ))
  )

  const { data: accounts, error: accErr } = await supabase
    .from('org_carrier_accounts')
    .select(
      'id, is_cactus_account, markup_percentage, markup_flat_fee, use_rate_card'
    )
    .in('id', uniqueAccountIds)

  if (accErr) {
    throw new Error(`billing-calc: failed to load accounts: ${accErr.message}`)
  }

  const accountMap = new Map<string, AccountRow>(
    (accounts ?? []).map((a) => [a.id as string, a as AccountRow])
  )

  // --- Step 3: build per-line updates
  type PendingUpdate = {
    id: string
    tracking_number: string | null
    final_billed_rate: string
    pre_ceiling_amount: string
    markup_type_applied: MarkupContext['markup_type_applied']
    markup_value_applied: string
    markup_source: MarkupContext['markup_source']
  }

  const updates: PendingUpdate[] = []

  for (const line of eligible) {
    try {
      if (!line.org_carrier_account_id) {
        result.errors.push({
          line_id: line.id,
          tracking_number: line.tracking_number,
          message: 'org_carrier_account_id is null on an AUTO_MATCHED line',
        })
        continue
      }

      const account = accountMap.get(line.org_carrier_account_id)
      if (!account) {
        result.errors.push({
          line_id: line.id,
          tracking_number: line.tracking_number,
          message:
            `carrier_account ${line.org_carrier_account_id} not found`,
        })
        continue
      }

      if (!account.is_cactus_account) {
        // Pass-through account — Cactus isn't billing markup here.
        // Leave PENDING (or future Billing Calc policy may revise).
        result.errors.push({
          line_id: line.id,
          tracking_number: line.tracking_number,
          message:
            'carrier_account is_cactus_account = FALSE; skipping billing',
        })
        continue
      }

      const context = deriveMarkupContext(account)
      const carrierCharge = new Decimal(line.carrier_charge)
      const { preCeilingAmount, finalBilledRate } =
        computeSingleCeiling(carrierCharge, context, {
          isAdjustmentOnly: line.is_adjustment_only,
        })

      updates.push({
        id: line.id,
        tracking_number: line.tracking_number,
        final_billed_rate: finalBilledRate.toFixed(4),
        pre_ceiling_amount: preCeilingAmount.toFixed(4),
        markup_type_applied: context.markup_type_applied,
        markup_value_applied: context.markup_value_applied,
        markup_source: context.markup_source,
      })
    } catch (err) {
      result.errors.push({
        line_id: line.id,
        tracking_number: line.tracking_number,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // --- Step 4: apply updates in chunks with idempotency guard
  //
  // Supabase does not support per-row update-with-different-values
  // in a single query. We issue one UPDATE per row but batch them
  // into chunks of 100 with Promise.all to parallelize safely.
  const CHUNK_SIZE = 100
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE)

    const chunkResults = await Promise.all(
      chunk.map((u) =>
        supabase
          .from('invoice_line_items')
          .update({
            final_billed_rate: u.final_billed_rate,
            pre_ceiling_amount: u.pre_ceiling_amount,
            markup_type_applied: u.markup_type_applied,
            markup_value_applied: u.markup_value_applied,
            markup_source: u.markup_source,
            billing_status: 'APPROVED',
          })
          .eq('id', u.id)
          // IDEMPOTENCY GUARD — do not remove. Keeps re-runs and
          // retries from re-applying markup to already-billed lines.
          .eq('billing_status', 'PENDING')
          .select('id')
      )
    )

    for (let j = 0; j < chunkResults.length; j++) {
      const r = chunkResults[j]
      const u = chunk[j]
      if (r.error) {
        result.errors.push({
          line_id: u.id,
          tracking_number: u.tracking_number,
          message: r.error.message,
        })
      } else if (r.data && r.data.length > 0) {
        result.approved += 1
      }
      // data.length === 0: idempotency guard filtered this row
      // (already APPROVED). Not an error, silently skip.
    }
  }

  result.skipped =
    result.total_eligible - result.approved - result.errors.length
  result.completed_at = new Date().toISOString()

  // --- Step 5: audit log (append-only)
  await supabase.from('audit_logs').insert({
    entity_type: 'carrier_invoices',
    entity_id: carrierInvoiceId,
    action: 'BILLING_CALC_RUN',
    details: {
      total_eligible: result.total_eligible,
      approved: result.approved,
      skipped: result.skipped,
      errors_count: result.errors.length,
      errors: result.errors.slice(0, 20),
      started_at: result.started_at,
      completed_at: result.completed_at,
    },
  })

  return result
}
