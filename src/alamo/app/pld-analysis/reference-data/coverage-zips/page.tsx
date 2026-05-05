// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/coverage-zips/page.tsx
// PURPOSE: GOFO Regional Coverage view + upload flow (preview stage).
//
// Two-stage upload flow:
//   - Stage 1 (this file + UploadForm.tsx + actions.ts): file picker +
//     server-side parse + preview UI showing summary + first 10 rows +
//     warnings. NO database write at this stage.
//   - Stage 2 (pause point #3, NOT YET WIRED): commit Server Action
//     performs the atomic two-table TRUNCATE + bulk INSERT.
//
// The interactive upload UI lives in UploadForm.tsx (client component
// using useActionState). This page renders the breadcrumb, status
// card, and slots UploadForm in.
//
// Why GOFO/Regional is the only carrier+service combo this page surfaces:
//   The service_coverage_zips schema supports any carrier + service, but in
//   v1 the only restricted-footprint service that needs a ZIP coverage list
//   is GOFO Regional (~70% of US ZIPs across 8 hubs as of v1.10.0-019).
//   DHL eCom, USPS, etc. don't need a ZIP allowlist — they service-or-don't
//   via API/zone-matrix lookup. If a future restricted service joins, the
//   schema is ready; we'll add a carrier/service picker to this page then.
//
// Schema reference (verified 2026-05-05):
//   service_coverage_zips(carrier_code, service_level, zip5,
//     is_serviceable, effective_date, deprecated_date, source, notes,
//     created_at, UNIQUE(carrier_code, service_level, zip5, effective_date))
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

const TARGET_CARRIER = 'GOFO'
const TARGET_SERVICE = 'Regional'

// Default effective date matches the GOFO Q2 2026 publication
// (per parser spec § 4). Operator can override on the upload form.
const DEFAULT_EFFECTIVE_DATE = '2026-04-28'

interface CoverageStatus {
  total: number
  effective_date: string | null
  latest_created_at: string | null
  source_sample: string | null
}

async function loadStatus(): Promise<CoverageStatus> {
  const admin = createAdminSupabaseClient()

  // Count is filtered to is_serviceable=true. The schema supports negative
  // entries (is_serviceable=false) for explicit exclusions, but the
  // operator-facing "X ZIPs serviceable" headline only counts the positive
  // allowlist.
  const [countRes, latestRes] = await Promise.all([
    admin
      .from('service_coverage_zips')
      .select('*', { count: 'exact', head: false })
      .eq('carrier_code', TARGET_CARRIER)
      .eq('service_level', TARGET_SERVICE)
      .eq('is_serviceable', true)
      .is('deprecated_date', null)
      .limit(0),
    admin
      .from('service_coverage_zips')
      .select('effective_date, source, created_at')
      .eq('carrier_code', TARGET_CARRIER)
      .eq('service_level', TARGET_SERVICE)
      .is('deprecated_date', null)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const latest = latestRes.data?.[0] as
    | { effective_date: string; source: string | null; created_at: string }
    | undefined

  return {
    total: countRes.count ?? 0,
    effective_date: latest?.effective_date ?? null,
    latest_created_at: latest?.created_at ?? null,
    source_sample: latest?.source ?? null,
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

export default async function CoverageZipsPage({ searchParams }: PageProps) {
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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>GOFO Regional Coverage</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 880 }}>
          <a href="/pld-analysis/reference-data" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 12,
          }}>
            <ChevronLeft size={14} /> Back to Reference Data
          </a>

          {/* Page header */}
          <div style={{
            fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>GOFO Regional Coverage</div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            Single upload populates the GOFO Regional coverage list (which
            ZIPs are serviceable) <strong>and</strong> the GOFO Regional zone
            matrix (hub × ZIP → zone). Atomic — both tables update together
            or not at all. Re-uploads truncate and replace both active sets
            in one transaction; partial merges are not supported.
          </div>

          {flash ? <Flash kind={flash.kind} msg={flash.msg} /> : null}

          {/* Status card */}
          {isLoaded ? (
            <LoadedCard status={status} />
          ) : (
            <EmptyCard />
          )}

          {/* Upload form (client component — useActionState drives preview UI) */}
          <div style={{ marginTop: 16 }}>
            <UploadForm defaultEffectiveDate={DEFAULT_EFFECTIVE_DATE} />
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
          No coverage loaded yet
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', lineHeight: 1.5 }}>
          GOFO Regional rating becomes available once the coverage list and
          zone matrix are loaded. Upload GOFO&apos;s published Regional XLSX
          below to populate both in one transaction.
        </div>
      </div>
    </div>
  )
}

function LoadedCard({ status }: { status: CoverageStatus }) {
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
          {fmtNumber(status.total)} ZIPs serviceable
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={12} />
            Active set loaded {fmtTimestamp(status.latest_created_at)}
          </div>
          {status.effective_date ? (
            <div>Effective {status.effective_date}</div>
          ) : null}
          {status.source_sample ? (
            <div style={{ fontSize: 11 }}>Source: {status.source_sample}</div>
          ) : null}
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
