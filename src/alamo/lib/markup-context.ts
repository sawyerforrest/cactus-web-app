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
