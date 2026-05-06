// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/page.tsx
// PURPOSE: Rate Cards screen — server component, fetches the status
// aggregate function output and renders the client orchestrator.
//
// PAUSE 3 SCOPE: DHL Domestic flow wired end-to-end. GOFO modes still
// stubbed (Pauses 4 / 5). After commit/cancel the action redirects
// here with a ?status=success|error|info&msg=... query param which
// renders as a flash banner above the parser UI.
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
import { ChevronRight, ChevronLeft, AlertCircle, CheckCircle2 } from 'lucide-react'
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

interface PageProps {
  searchParams: Promise<{ status?: string; msg?: string }>
}

export default async function RateCardsPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const statusRows = await loadStatus()
  const flash = params.status ? { kind: params.status, msg: params.msg ?? '' } : null

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

          {flash ? <Flash kind={flash.kind} msg={flash.msg} /> : null}

          <RateCardsParser statusRows={statusRows} />
        </div>
      </div>
    </div>
  )
}

function Flash({ kind, msg }: { kind: string; msg: string }) {
  const isError = kind === 'error'
  const isInfo = kind === 'info'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px',
      background: isError
        ? 'var(--cactus-bloom-bg)'
        : isInfo
          ? 'var(--cactus-sand)'
          : 'var(--cactus-mint)',
      border: `0.5px solid ${
        isError
          ? 'var(--cactus-bloom-border)'
          : isInfo
            ? 'var(--cactus-border)'
            : '#C5DBC0'
      }`,
      borderRadius: 8,
      fontSize: 12,
      color: isError
        ? 'var(--cactus-bloom-deep)'
        : isInfo
          ? 'var(--cactus-muted)'
          : 'var(--cactus-forest)',
      marginBottom: 16,
    }}>
      {isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      <div>
        <div style={{ fontWeight: 500 }}>
          {isError ? 'Error' : isInfo ? 'Heads up' : 'Success'}
        </div>
        <div style={{ marginTop: 2 }}>{msg}</div>
      </div>
    </div>
  )
}
