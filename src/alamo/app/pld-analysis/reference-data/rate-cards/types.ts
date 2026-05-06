// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/types.ts
// PURPOSE: Shared types for the Rate Cards screen. Lives in a non-
// 'use server' module so types + constants safely cross the client
// boundary (StatusCards, UploaderPanel are client components).
// ==========================================================

import type { CarrierCode, FulfillmentMode, ServiceLevelGroup } from './scopes'

// Shape of one row from analysis_rate_cards_status_aggregate(). Mirrors
// the function's RETURNS TABLE signature exactly (verified 2026-05-06):
//   scope_label text, carrier_code text, service_level_group text,
//   fulfillment_mode fulfillment_mode_enum, rate_card_count int,
//   cell_count bigint, variant_count int, variants text[],
//   service_levels text[], most_recent_upload timestamptz,
//   source text, notes text
//
// supabase-js coerces bigint to number for values < 2^53 — rate-card
// cell counts are bounded in the thousands so the number type is
// safe here.
export interface StatusAggregateRow {
  scope_label: string | null
  carrier_code: CarrierCode
  service_level_group: ServiceLevelGroup
  fulfillment_mode: FulfillmentMode
  rate_card_count: number
  cell_count: number
  variant_count: number
  variants: string[] | null
  service_levels: string[] | null
  most_recent_upload: string | null
  source: string | null
  notes: string | null
}

// Stub Server Action state (Pause 2 — replaced with real parse state at Pause 3)
export type ParseStubStatus = 'idle' | 'error'

export interface ParseStubState {
  status: ParseStubStatus
  error: string | null
}

export const initialParseStubState: ParseStubState = {
  status: 'idle',
  error: null,
}
