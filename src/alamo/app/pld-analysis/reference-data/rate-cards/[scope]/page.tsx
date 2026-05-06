// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/[scope]/page.tsx
// PURPOSE: Committed rate-card viewer for one scope. Dynamic route
// segment ↔ ScopeKey via scope-segments.ts.
//
// Behavior:
//   - Invalid segment → 404 (e.g., /rate-cards/bogus-scope/)
//   - Valid scope but no cards committed → 404 ("scope not loaded —
//     go upload" semantics per spec; the upload screen is one step
//     back at /rate-cards/)
//   - Valid scope with ≥1 card → render ScopeDetailView with card
//     list + scope aggregate stats
//
// Read-only by design — edits happen via re-upload (spec § read-only
// architectural call). No edit affordances anywhere on this page.
// ==========================================================

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '@/components/Sidebar'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { resolveScope } from '../scope-segments'
import { getCommittedCardsForScope } from '../actions'
import { ScopeDetailView } from './ScopeDetailView'
import type { StatusAggregateRow } from '../types'

interface PageProps {
  params: Promise<{ scope: string }>
}

interface ScopeAggregate {
  cardCount: number
  cellCount: number
  lastUpload: string | null
}

async function loadScopeAggregate(
  carrierCode: string,
  serviceLevelGroup: string | null,
  fulfillmentMode: string,
): Promise<ScopeAggregate> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('analysis_rate_cards_status_aggregate')
  if (error || !data) {
    return { cardCount: 0, cellCount: 0, lastUpload: null }
  }
  const row = (data as StatusAggregateRow[]).find(r =>
    r.carrier_code === carrierCode &&
    r.service_level_group === serviceLevelGroup &&
    r.fulfillment_mode === fulfillmentMode,
  )
  if (!row) return { cardCount: 0, cellCount: 0, lastUpload: null }
  return {
    cardCount: row.rate_card_count,
    cellCount: row.cell_count,
    lastUpload: row.most_recent_upload,
  }
}

export default async function ScopeDetailPage({ params }: PageProps) {
  const { scope: segment } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const scope = resolveScope(segment)
  if (!scope) notFound()

  const cards = await getCommittedCardsForScope(scope)
  if (cards.length === 0) notFound()

  const aggregate = await loadScopeAggregate(
    scope.carrier_code,
    scope.service_level_group,
    scope.fulfillment_mode,
  )

  return (
    <div style={{
      marginLeft: 200,
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px', height: 48,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <a href="/pld-analysis" style={{ fontSize: 13, color: 'var(--cactus-muted)' }}>PLD Roundup</a>
          <ChevronRight size={14} color="var(--cactus-hint)" />
          <a href="/pld-analysis/reference-data" style={{ fontSize: 13, color: 'var(--cactus-muted)' }}>Reference Data</a>
          <ChevronRight size={14} color="var(--cactus-hint)" />
          <Link href="/pld-analysis/reference-data/rate-cards" style={{ fontSize: 13, color: 'var(--cactus-muted)' }}>Rate Cards</Link>
          <ChevronRight size={14} color="var(--cactus-hint)" />
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>{scope.scope_label}</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
          <Link href="/pld-analysis/reference-data/rate-cards" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 12,
            textDecoration: 'none',
          }}>
            <ChevronLeft size={14} /> Back to Rate Cards
          </Link>

          <ScopeDetailView
            scope={scope}
            cards={cards}
            aggregate={aggregate}
          />
        </div>
      </div>
    </div>
  )
}
