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

// =====================
// Parse + Commit state machines (Pause 3+)
// =====================
//
// Note on missing 'parsing' / 'committing' variants: the spec listed
// those as discrete state values, but useActionState already exposes
// in-flight state via its `isPending` flag. We use isPending for the
// pending UI and keep the persistent state to {idle, parsed/committed,
// error} only — no shadow state to drift from useActionState's truth.

export interface ParseSummary {
  totalCards: number                       // expected 126 for DHL Domestic
  totalCells: number                       // expected 30,888 for DHL Domestic
  /** Distinct unknown DC codes encountered. Empty on a clean parse. */
  unknownDcs: string[]
  /** Distinct unknown product strings encountered. Empty on a clean parse. */
  unknownProducts: string[]
  /** Per-zone null-rate counts. Zone 11/12/13 expected to have 24 each
   *  for DHL Domestic v1 (SLC Zone 11-13 placeholder). */
  nullCellsByZone: Record<string, number>
  /** Cards per DC. 7 per DC expected. */
  cardsByDc: Record<string, number>
  /** Cards per Product. 18 per product expected. */
  cardsByProduct: Record<string, number>
  /** Source filename — surfaced in the preview header. */
  sourceFilename: string
}

export type ParseState =
  | { status: 'idle' }
  | { status: 'parsed'; uploadSessionId: string; summary: ParseSummary; mode: 'dhl-ecom-domestic' | 'gofo-standard' | 'gofo-regional' }
  | { status: 'error'; error: string }

export const initialParseState: ParseState = { status: 'idle' }

export type CommitState =
  | { status: 'idle' }
  | { status: 'committed'; rateCardsInserted: number; cellsInserted: number }
  | { status: 'error'; error: string }

export const initialCommitState: CommitState = { status: 'idle' }

// =====================
// Stub Server Action state (Pause 2) — kept for GOFO modes which still
// route to parseRateCardStub at Pause 3. Will retire when GOFO parsers
// land at Pauses 4 / 5.
// =====================

export type ParseStubStatus = 'idle' | 'error'

export interface ParseStubState {
  status: ParseStubStatus
  error: string | null
}

export const initialParseStubState: ParseStubState = {
  status: 'idle',
  error: null,
}

// =====================
// Stage card detail (single-card cell fetch for the StagePreviewTable)
// =====================

export interface StagedCellRow {
  zone: string
  weight_value: number
  weight_unit: string
  rate: number | null
}

export interface StagedCardDetail {
  variant: string                          // DC code
  service_level: string                    // Product
  source: string | null
  notes: string | null
  cells: StagedCellRow[]                   // sorted by weight_value ascending then zone
}
