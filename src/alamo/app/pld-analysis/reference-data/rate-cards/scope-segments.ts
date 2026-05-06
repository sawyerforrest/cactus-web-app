// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/scope-segments.ts
// PURPOSE: Maps URL kebab-case segment ↔ ScopeKey from scopes.ts. The
// dynamic route /pld-analysis/reference-data/rate-cards/[scope]/ uses
// these segments; StatusCards uses them when wrapping loaded cards in
// <Link href=...> elements.
//
// Segment construction:
//   - DHL Domestic (fulfillment_mode='na'): just the mode (no PU/DO suffix)
//     'dhl-ecom-domestic'
//   - GOFO modes (pickup/dropoff): mode + '-' + fulfillment_mode
//     'gofo-standard-pickup', 'gofo-standard-dropoff',
//     'gofo-regional-pickup', 'gofo-regional-dropoff'
// ==========================================================

import { RATE_CARD_SCOPES, type ScopeKey } from './scopes'

function scopeToSegment(s: ScopeKey): string {
  if (s.fulfillment_mode === 'na') return s.mode
  return `${s.mode}-${s.fulfillment_mode}`
}

const SEGMENT_TO_SCOPE: Record<string, ScopeKey> = Object.fromEntries(
  RATE_CARD_SCOPES.map(s => [scopeToSegment(s), s]),
)

const SCOPE_TO_SEGMENT_MAP = new Map<ScopeKey, string>(
  RATE_CARD_SCOPES.map(s => [s, scopeToSegment(s)]),
)

export function getScopeSegment(s: ScopeKey): string {
  return SCOPE_TO_SEGMENT_MAP.get(s) ?? scopeToSegment(s)
}

export function resolveScope(segment: string): ScopeKey | null {
  return SEGMENT_TO_SCOPE[segment] ?? null
}

export const ALL_SCOPE_SEGMENTS: readonly string[] = Object.freeze(
  Object.keys(SEGMENT_TO_SCOPE),
)
