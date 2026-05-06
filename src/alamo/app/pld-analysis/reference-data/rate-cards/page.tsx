// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/page.tsx
// PURPOSE: Rate Cards screen — server component, fetches the status
// aggregate function output and renders the client orchestrator.
//
// PAUSE 2 SCOPE: scaffold only. The status aggregate returns 0 rows
// on an empty DB so all 5 cards render in the "not loaded" state;
// the uploader posts to a parser-stub Server Action that returns an
// "implementation pending" inline error. Per-carrier parsers and
// the commit pipeline land at Pause 3+.
//
// Status function: analysis_rate_cards_status_aggregate() (deployed
// in v1.10.0-029, SECURITY DEFINER, GRANT EXECUTE TO authenticated/
// service_role). Returns one row per (carrier_code, service_level_group,
// fulfillment_mode) tuple that has at least one CACTUS_BASE_COST rate
// card with lead_id IS NULL.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { ChevronRight, ChevronLeft } from 'lucide-react'
import { RateCardsParser } from './RateCardsParser'
import type { StatusAggregateRow } from './types'

async function loadStatus(): Promise<StatusAggregateRow[]> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.rpc('analysis_rate_cards_status_aggregate')
  if (error) {
    // Fail soft — render the page with an empty status set rather than
    // 500ing on a transient RPC error. The 5 not-loaded cards still
    // render and the operator can re-try.
    return []
  }
  return (data ?? []) as StatusAggregateRow[]
}

export default async function RateCardsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const statusRows = await loadStatus()

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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Rate Cards</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
          <a href="/pld-analysis/reference-data" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 12,
          }}>
            <ChevronLeft size={14} /> Back to Reference Data
          </a>

          <div style={{
            fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>Rate Cards</div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            Cactus base-cost rate cards by (carrier, service-level group,
            fulfillment mode). Five canonical scopes power the rating
            engine: DHL eCom Domestic plus four GOFO scopes (Standard
            and Regional, each with Pickup and Dropoff fulfillment).
            Cards are uploaded per scope from the per-carrier published
            workbooks.
          </div>

          <RateCardsParser statusRows={statusRows} />
        </div>
      </div>
    </div>
  )
}
