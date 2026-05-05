// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/page.tsx
// PURPOSE: DHL eCom Domestic Zone matrices view + upload flow shell.
//
// Two-stage upload flow (mirrors GOFO Regional Coverage):
//   - Stage 1 (this file + UploadForm.tsx + actions.ts): file picker
//     + server-side parse + preview UI showing summary + first rows
//     + warnings. NO database write at this stage.
//   - Stage 2 (lands in next commit): commit Server Action performs
//     the atomic scoped-DELETE + bulk INSERT into carrier_zone_matrices.
//
// CURRENT COMMIT: empty-state shell only. The interactive upload UI
// lives in UploadForm.tsx but the parser is not yet wired (returns
// an info-flash error on submit). Pause point #2 deliverable per
// Senior Architect.
//
// Why "DHL eCom Domestic Zones" is the only carrier+service combo this
// page surfaces today:
//   The carrier_zone_matrices schema supports any carrier/service combo,
//   but in v1 the only carrier publishing per-DC zone XLSX files is DHL
//   eCommerce (Ground). GOFO Standard zones may join this screen later
//   pending Sawyer's GOFO rep response. DHL Intl is country-pair-based
//   and lives in carrier_country_zone_matrices, not here.
//
// Schema reference (verified 2026-05-05):
//   carrier_zone_matrices(carrier_code, service_level, matrix_version,
//     origin_zip3, dest_zip3, zone, effective_date, deprecated_date,
//     source, notes, created_at)
//   dhl_ecom_dcs(dc_code, origin_code, dc_zip3, city, state, ...)
//     — 18 rows, seeded by v1.10.0-022
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { UploadForm } from './UploadForm'
import {
  ChevronRight,
  ChevronLeft,
  Layers,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

const TARGET_CARRIER = 'DHL_ECOM'
const TARGET_SERVICE = 'Ground'

interface ZonesStatus {
  total: number
  distinct_origin_zip3s: number
  effective_date: string | null
  latest_created_at: string | null
}

async function loadStatus(): Promise<ZonesStatus> {
  const admin = createAdminSupabaseClient()

  // Pull both the count and a sample slice (used to compute distinct
  // origin_zip3s and the latest effective_date / created_at). Same query
  // pattern as GOFO Regional Coverage's loadStatus.
  const [countRes, sampleRes] = await Promise.all([
    admin
      .from('carrier_zone_matrices')
      .select('*', { count: 'exact', head: false })
      .eq('carrier_code', TARGET_CARRIER)
      .eq('service_level', TARGET_SERVICE)
      .is('deprecated_date', null)
      .limit(0),
    admin
      .from('carrier_zone_matrices')
      .select('origin_zip3, effective_date, created_at')
      .eq('carrier_code', TARGET_CARRIER)
      .eq('service_level', TARGET_SERVICE)
      .is('deprecated_date', null)
      .order('created_at', { ascending: false })
      .limit(20000),
  ])

  const sample = (sampleRes.data ?? []) as Array<{
    origin_zip3: string
    effective_date: string
    created_at: string
  }>

  const distinctOrigins = new Set(sample.map(r => r.origin_zip3)).size
  const latestCreatedAt = sample[0]?.created_at ?? null
  const latestEffective = sample
    .map(r => r.effective_date)
    .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0] ?? null

  return {
    total: countRes.count ?? 0,
    distinct_origin_zip3s: distinctOrigins,
    effective_date: latestEffective,
    latest_created_at: latestCreatedAt,
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

export default async function ZoneMatricesPage({ searchParams }: PageProps) {
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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>DHL eCom Domestic Zones</div>
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
          }}>DHL eCom Domestic Zones</div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            Per-DC origin × destination ZIP3 zone matrix for DHL eCommerce
            domestic Ground service. Sourced from DHL&apos;s 18
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '0 2px' }}>
              DHL_eCommerce_Zones_Table_&lt;DC&gt;.xlsx
            </code>{' '}
            files. Re-uploads scope-delete the prior DHL Ground rows from{' '}
            <strong>carrier_zone_matrices</strong> and INSERT all 16,740
            new rows in one transaction; other carriers&apos; zone data
            is untouched.
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
        <Layers size={22} color="var(--cactus-forest)" />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 4 }}>
          No DHL eCom zones loaded yet
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', lineHeight: 1.5 }}>
          DHL eCom Ground rating becomes available once all 18 per-DC
          zone files are loaded. Upload the complete set below to populate
          16,740 zone matrix rows in one transaction.
        </div>
      </div>
    </div>
  )
}

function LoadedCard({ status }: { status: ZonesStatus }) {
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
        <Layers size={22} color="var(--cactus-forest)" />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 4 }}>
          {fmtNumber(status.total)} matrix rows · {status.distinct_origin_zip3s} DCs
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={12} />
            Active set loaded {fmtTimestamp(status.latest_created_at)}
          </div>
          {status.effective_date ? (
            <div>Effective {status.effective_date}</div>
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
