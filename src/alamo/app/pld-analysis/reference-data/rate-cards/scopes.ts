// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/scopes.ts
// PURPOSE: Canonical list of the 5 Rate Card scopes the engine needs.
//
// One row per (carrier_code, service_level_group, fulfillment_mode)
// scope. Used by the page to render "not loaded" cards for scopes the
// status aggregate function hasn't reported on yet — the function
// returns rows only for scopes that have at least one rate card, so
// we merge its output with this canonical list to render all 5 cards
// regardless of load state.
//
// Order matches analysis_rate_cards_status_aggregate()'s ORDER BY
// exactly so unloaded cards interleave with loaded ones in stable
// positions:
//   carrier_code  (DHL_ECOM=1, GOFO=2)
//   service_level_group (Standard=1, Regional=2, NULL=0)
//   fulfillment_mode    (alphabetical: dropoff, na, pickup)
//
// service_level_group is a DERIVED field on the function output
// (CASE WHEN carrier_code='DHL_ECOM' THEN NULL WHEN carrier_code=
// 'GOFO' THEN service_level END), not a stored column. This module
// references it as the function exposes it — by name and shape.
// ==========================================================

export type FulfillmentMode = 'pickup' | 'dropoff' | 'na'
export type CarrierCode = 'DHL_ECOM' | 'GOFO'
export type ServiceLevelGroup = 'Standard' | 'Regional' | null

export type ModeTab = 'dhl-ecom-domestic' | 'gofo-standard' | 'gofo-regional'

export interface ScopeKey {
  carrier_code: CarrierCode
  service_level_group: ServiceLevelGroup
  fulfillment_mode: FulfillmentMode
  scope_label: string
  /** Which mode tab this scope belongs to. Used by RateCardsParser to
   *  filter the active mode's uploader panels — does NOT filter the
   *  StatusCards row, which always renders all 5 as an at-a-glance
   *  overview. */
  mode: ModeTab
}

export const RATE_CARD_SCOPES: readonly ScopeKey[] = [
  {
    carrier_code: 'DHL_ECOM',
    service_level_group: null,
    fulfillment_mode: 'na',
    scope_label: 'DHL eCom Domestic',
    mode: 'dhl-ecom-domestic',
  },
  {
    carrier_code: 'GOFO',
    service_level_group: 'Standard',
    fulfillment_mode: 'dropoff',
    scope_label: 'GOFO Standard — Dropoff',
    mode: 'gofo-standard',
  },
  {
    carrier_code: 'GOFO',
    service_level_group: 'Standard',
    fulfillment_mode: 'pickup',
    scope_label: 'GOFO Standard — Pickup',
    mode: 'gofo-standard',
  },
  {
    carrier_code: 'GOFO',
    service_level_group: 'Regional',
    fulfillment_mode: 'dropoff',
    scope_label: 'GOFO Regional — Dropoff',
    mode: 'gofo-regional',
  },
  {
    carrier_code: 'GOFO',
    service_level_group: 'Regional',
    fulfillment_mode: 'pickup',
    scope_label: 'GOFO Regional — Pickup',
    mode: 'gofo-regional',
  },
] as const

/** Tuple match between the canonical scope list and a row from the
 *  status aggregate function. Both sides expose service_level_group
 *  with the same nullable shape, so triple-equals on each member is
 *  sufficient (no normalization). */
export function isSameScope(
  a: ScopeKey,
  b: { carrier_code: string; service_level_group: string | null; fulfillment_mode: string },
): boolean {
  return (
    a.carrier_code === b.carrier_code &&
    a.service_level_group === b.service_level_group &&
    a.fulfillment_mode === b.fulfillment_mode
  )
}
