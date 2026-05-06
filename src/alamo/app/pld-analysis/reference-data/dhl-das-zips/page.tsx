// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/dhl-das-zips/page.tsx
// PURPOSE: DHL DAS ZIPs view + single-file upload flow shell.
//
// PAUSE POINT #1 SCOPE: empty-state shell + UploadForm with stubbed
// preview action. Migrations v1.10.0-026 (table) and v1.10.0-027
// (commit fn) are applied; the parser at lib/pld-analysis/dhl-das-zips-parser.ts
// arrives at pause point #2.
//
// Status card shows count + effective date (loaded state) or an
// empty-state with CTA copy per spec § 5. Pattern 5 live query —
// the count and effective date come from the database every render
// rather than being cached anywhere upstream.
//
// Schema reference (verified 2026-05-05):
//   dhl_ecom_das_zips(zip5 char(5), effective_date date, deprecated_date date,
//     source text, notes text, created_at timestamptz)
//   PK (zip5, effective_date), partial idx on zip5 WHERE deprecated_date IS NULL
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { UploadForm } from './UploadForm'
import {
  ChevronRight,
  ChevronLeft,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

interface DasStatus {
  total: number
  effective_date: string | null
  latest_created_at: string | null
}

async function loadStatus(): Promise<DasStatus> {
  const admin = createAdminSupabaseClient()

  // Three small parallel reads. All scoped to the active set
  // (deprecated_date IS NULL) — covered by the partial index from
  // v1.10.0-026.
  const [countRes, effRes, createdRes] = await Promise.all([
    admin
      .from('dhl_ecom_das_zips')
      .select('*', { count: 'exact', head: false })
      .is('deprecated_date', null)
      .limit(0),
    admin
      .from('dhl_ecom_das_zips')
      .select('effective_date')
      .is('deprecated_date', null)
      .order('effective_date', { ascending: false })
      .limit(1),
    admin
      .from('dhl_ecom_das_zips')
      .select('created_at')
      .is('deprecated_date', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  return {
    total: countRes.count ?? 0,
    effective_date: effRes.data?.[0]?.effective_date ?? null,
    latest_created_at: createdRes.data?.[0]?.created_at ?? null,
  }
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US')
}

interface PageProps {
  searchParams: Promise<{ status?: string; msg?: string }>
}

export default async function DhlDasZipsPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const status = await loadStatus()
  const flash = params.status ? { kind: params.status, msg: params.msg ?? '' } : null
  const isLoaded = status.total > 0

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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>DHL DAS ZIPs</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 880 }}>
          <a href="/pld-analysis/reference-data" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 12,
          }}>
            <ChevronLeft size={14} /> Back to Reference Data
          </a>

          <div style={{
            fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>DHL DAS ZIPs</div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            DHL eCommerce Delivery Area Surcharge ZIP5 list. The rating
            engine queries this table to determine if a destination ZIP5
            is subject to the DAS surcharge — it&apos;s a binary flag
            list (no zone matrix, no per-package amount). Re-uploads
            truncate-and-replace the entire active set in one transaction.
          </div>

          {flash ? <Flash kind={flash.kind} msg={flash.msg} /> : null}

          {/* Status card */}
          {isLoaded ? <LoadedCard status={status} /> : <EmptyCard />}

          {/* Upload form (client component) */}
          <div style={{ marginTop: 16 }}>
            <UploadForm />
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================
// Sub-components
// =====================

function EmptyCard() {
  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 24,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: 'var(--cactus-mint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <MapPin size={22} color="var(--cactus-forest)" />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 4 }}>
          No DAS ZIPs loaded yet
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', lineHeight: 1.5 }}>
          The rating engine cannot apply the DHL Delivery Area Surcharge
          until this list is loaded. Upload the DHL DAS ZIP XLSX below
          to begin.
        </div>
      </div>
    </div>
  )
}

function LoadedCard({ status }: { status: DasStatus }) {
  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 20,
      display: 'grid',
      gridTemplateColumns: '44px 1fr',
      gap: 16,
      alignItems: 'flex-start',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: 'var(--cactus-mint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MapPin size={22} color="var(--cactus-forest)" />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 4 }}>
          {fmtNumber(status.total)} DAS ZIP5s
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={12} />
            Active set loaded {fmtTimestamp(status.latest_created_at)}
          </div>
          {status.effective_date ? (
            <div>Effective {status.effective_date}</div>
          ) : null}
          <div>Source: DHL eCommerce DAS ZIP List XLSX</div>
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
