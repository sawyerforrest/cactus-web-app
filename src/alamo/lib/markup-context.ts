import Decimal from 'decimal.js'

// =============================================================
// MARKUP CONTEXT — shared helper
//
// Produces the v1.6.0 markup context triple
// (markup_type_applied, markup_value_applied, markup_source) from
// an org_carrier_accounts row. Used by:
//
//   - match.ts      → writes to shipment_ledger for dark accounts
//   - resolve.ts    → writes to shipment_ledger for dark accounts
//   - billing-calc.ts → writes to invoice_line_items for all billing-eligible lines
//
// Ambiguity (flagged as DECISION NEEDED in Session B summary):
//   If an account has BOTH markup_percentage > 0 AND
//   markup_flat_fee > 0 the spec documents three possible handlings
//   (data-integrity error, percentage wins, flat wins). The
//   existing production behavior — preserved here — is "flat wins"
//   so that Session B's refactor does not shift financial output.
// =============================================================

export type MarkupTypeApplied = 'percentage' | 'flat'
export type MarkupSource = 'carrier_account' | 'rate_card'

export interface MarkupContext {
  markup_type_applied: MarkupTypeApplied
  // DECIMAL(10,6) serialized as string for safe round-trip through
  // PostgREST. Callers that need arithmetic should wrap in new Decimal(...).
  markup_value_applied: string
  markup_source: MarkupSource
}

// Minimal shape the helper reads from org_carrier_accounts. Keeping this
// small lets callers pass either a raw row or a narrowed projection
// without fighting Supabase's generated types.
export interface MarkupAccountFields {
  markup_percentage: string | number | null
  markup_flat_fee: string | number | null
  use_rate_card: boolean | null
}

export function deriveMarkupContext(
  account: MarkupAccountFields
): MarkupContext {
  const flat = new Decimal(account.markup_flat_fee ?? 0)
  const source: MarkupSource = account.use_rate_card
    ? 'rate_card'
    : 'carrier_account'

  if (flat.greaterThan(0)) {
    return {
      markup_type_applied: 'flat',
      markup_value_applied: flat.toFixed(6),
      markup_source: source,
    }
  }

  const pct = new Decimal(account.markup_percentage ?? 0)
  return {
    markup_type_applied: 'percentage',
    markup_value_applied: pct.toFixed(6),
    markup_source: source,
  }
}

// =============================================================
// SINGLE-CEILING MARKUP MATH — the ONE authoritative
// implementation, used by:
//   - match.ts         (for shipment_ledger row creation,
//                       because shipment_ledger.final_billed_rate
//                       is NOT NULL)
//   - billing-calc.ts  (for invoice_line_items final_billed_rate)
//
// Semantics (per briefing): carrier_charge is ALWAYS the basis.
//   PERCENTAGE: preCeiling = carrier_charge * (1 + markup_value)
//   FLAT:       preCeiling = carrier_charge + markup_value
//               (flat conceptually applies to base, but since
//                surcharges pass through unchanged the math
//                works out the same as adding to carrier_charge)
//   ADJUSTMENT-ONLY + FLAT (DN-2 policy 2026-04-20):
//               preCeiling = carrier_charge (no flat applied —
//                            no base charge to attach fee to)
//   final = ceil(preCeiling * 100) / 100  — single ceiling
//
// Behavior-preserving w.r.t. Session A for non-adjustment lines.
// Adjustment-only flat lines now pass through carrier_charge
// without adding the flat fee, per DN-2.
// =============================================================

export function computeSingleCeiling(
  carrierCharge: Decimal,
  context: MarkupContext,
  options?: {
    /**
     * When true, flat markup is NOT applied — the line has no base charge
     * to attach the flat fee to (per DN-2 policy resolved 2026-04-20).
     * Has no effect when context.markup_type_applied === 'percentage'.
     */
    isAdjustmentOnly?: boolean
  }
): { preCeilingAmount: Decimal; finalBilledRate: Decimal } {
  const value = new Decimal(context.markup_value_applied)
  const isFlat = context.markup_type_applied === 'flat'
  const skipFlat = isFlat && options?.isAdjustmentOnly === true

  const preCeiling = skipFlat
    ? carrierCharge                                 // adjustment-only flat: pass through
    : isFlat
      ? carrierCharge.plus(value)                   // normal flat: add fee
      : carrierCharge.times(new Decimal(1).plus(value))  // percentage

  const final = preCeiling.times(100).ceil().dividedBy(100)
  return { preCeilingAmount: preCeiling, finalBilledRate: final }
}
