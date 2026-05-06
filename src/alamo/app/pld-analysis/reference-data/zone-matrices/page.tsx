// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/page.tsx
// PURPOSE: Zone Matrices view + dual-flow upload shell.
//
// Two flows live on this screen, routed by a service-tab selector
// inside UploadForm:
//   - DHL eCom Domestic Zones (multi-file, 18 per-DC XLSX)
//   - GOFO Standard Zones (single-file workbook, 8 hub tabs)
//
// Both ultimately write into carrier_zone_matrices but with disjoint
// (carrier_code, service_level) scopes:
//   - DHL eCom Ground:    carrier_code='DHL_ECOM', service_level='Ground'
//   - GOFO Standard:      carrier_code='GOFO',     service_level='Standard'
//
// Re-uploads scope-delete only their own slice; the other carrier's
// rows are untouched. The ?service= query param deep-links the
// Reference Data index to the right tab.
//
// Schema reference (verified 2026-05-05):
//   carrier_zone_matrices(carrier_code, service_level, matrix_version,
//     origin_zip3, dest_zip3, zone, effective_date, deprecated_date,
//     source, notes, created_at)
//   gofo_hubs(hub_code, primary_zip5, ...) — 8 rows post v1.10.0-019 split
//
// Status aggregation uses the v1.10.0-024 carrier_zone_matrix_status
// RPC twice (once per service slice) — Pattern 7 reuse, no new
// migration required for either status surface.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { UploadForm } from './UploadForm'
import { type ServiceMode } from './types'
import {
  ChevronRight,
  ChevronLeft,
  Layers,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

interface SliceStatus {
  total: number
  distinct_origin_zip3s: number
  effective_date: string | null
  latest_created_at: string | null
}

interface ZonesStatus {
  dhl: SliceStatus
  gofo: SliceStatus
}

const EMPTY_SLICE: SliceStatus = {
  total: 0,
  distinct_origin_zip3s: 0,
  effective_date: null,
  latest_created_at: null,
}

async function loadStatus(): Promise<ZonesStatus> {
  const admin = createAdminSupabaseClient()

  // Both slices via the v1.10.0-024 server-side aggregate. Pattern 7
  // (function generalization) — same helper accepts (carrier, service)
  // so we call it once per slice. Server-side aggregation sidesteps the
  // PostgREST row-cap that broke the prior client-side dedup pattern.
  const [dhlRes, gofoRes] = await Promise.all([
    admin.rpc('carrier_zone_matrix_status', {
      p_carrier: 'DHL_ECOM',
      p_service: 'Ground',
    }),
    admin.rpc('carrier_zone_matrix_status', {
      p_carrier: 'GOFO',
      p_service: 'Standard',
    }),
  ])

  function toSlice(res: { data: unknown; error: unknown }): SliceStatus {
    if (res.error) return EMPTY_SLICE
    const row = (Array.isArray(res.data) ? res.data[0] : res.data) as
      | { total_rows: number; distinct_dcs: number; latest_effective: string | null; latest_created_at: string | null }
      | undefined
    return {
      total: row?.total_rows ?? 0,
      distinct_origin_zip3s: row?.distinct_dcs ?? 0,
      effective_date: row?.latest_effective ?? null,
      latest_created_at: row?.latest_created_at ?? null,
    }
  }

  return { dhl: toSlice(dhlRes), gofo: toSlice(gofoRes) }
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function parseService(raw: string | undefined): ServiceMode {
  return raw === 'gofo-standard' ? 'gofo-standard' : 'dhl-ecom-domestic'
}

interface PageProps {
  searchParams: Promise<{ status?: string; msg?: string; service?: string }>
}

export default async function ZoneMatricesPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const status = await loadStatus()
  const flash = params.status ? { kind: params.status, msg: params.msg ?? '' } : null
  const initialService = parseService(params.service)

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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Zone Matrices</div>
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
          }}>Zone Matrices</div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20, lineHeight: 1.55 }}>
            Origin × destination ZIP3 zone matrices for the carriers and
            services rated by the engine. Two flows live here today: DHL
            eCommerce Ground (per-DC, 18 files atomic) and GOFO Standard
            (single 8-tab workbook, ZIP5→ZIP3 lossless aggregation). Both
            write into <strong>carrier_zone_matrices</strong> with
            disjoint (carrier, service) scopes — re-uploads on one
            service never touch the other&apos;s rows.
          </div>

          {flash ? <Flash kind={flash.kind} msg={flash.msg} /> : null}

          {/* Status cards — one per service slice */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SliceCard
              title="DHL eCom Ground"
              originLabel="DCs"
              expectedOrigins={18}
              status={status.dhl}
            />
            <SliceCard
              title="GOFO Standard"
              originLabel="hubs"
              expectedOrigins={8}
              status={status.gofo}
            />
          </div>

          {/* Upload form (client component) — service-tab selector inside */}
          <div style={{ marginTop: 16 }}>
            <UploadForm initialService={initialService} />
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================
// Sub-components
// =====================

function SliceCard({
  title, originLabel, expectedOrigins, status,
}: {
  title: string
  originLabel: string
  expectedOrigins: number
  status: SliceStatus
}) {
  const isLoaded = status.total > 0
  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 18,
      display: 'grid',
      gridTemplateColumns: '40px 1fr',
      gap: 14,
      alignItems: 'flex-start',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'var(--cactus-mint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Layers size={20} color="var(--cactus-forest)" />
      </div>
      <div>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)',
          marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {title}
          {isLoaded ? null : (
            <span style={{
              fontSize: 10, fontWeight: 500,
              color: 'var(--cactus-amber-text)',
              background: 'var(--cactus-amber-bg)',
              border: '0.5px solid #FCD34D',
              padding: '1px 6px', borderRadius: 999,
            }}>not loaded</span>
          )}
        </div>
        {isLoaded ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--cactus-slate)' }}>
              {fmtNumber(status.total)} matrix rows · {status.distinct_origin_zip3s} {originLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={11} />
                Active set loaded {fmtTimestamp(status.latest_created_at)}
              </div>
              {status.effective_date ? (
                <div>Effective {status.effective_date}</div>
              ) : null}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--cactus-muted)', lineHeight: 1.5 }}>
            No data loaded yet. Upload the {originLabel === 'DCs' ? `${expectedOrigins} per-DC files` : `single ${expectedOrigins}-tab workbook`} below.
          </div>
        )}
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
