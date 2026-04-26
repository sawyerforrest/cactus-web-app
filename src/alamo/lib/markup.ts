import Decimal from 'decimal.js'

interface CarrierAccount {
  is_cactus_account: boolean
  use_rate_card: boolean
  markup_percentage: number | string | null
  markup_flat_fee: number | string | null
}

export function formatMarkup(account: CarrierAccount): string {
  if (!account.is_cactus_account) return 'None (client-owned)'
  if (account.use_rate_card) return 'Rate card'

  const flat = new Decimal(account.markup_flat_fee ?? 0)
  const pct = new Decimal(account.markup_percentage ?? 0)

  if (flat.gt(0)) return `flat $${flat.toFixed(2)}`
  if (pct.gt(0)) return `${pct.mul(100).toFixed(1)}%`

  return 'None'
}
