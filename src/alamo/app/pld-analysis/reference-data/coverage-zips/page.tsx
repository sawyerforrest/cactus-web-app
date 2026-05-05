// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/coverage-zips/page.tsx
// PURPOSE: GOFO Regional ZIP-coverage view + (forthcoming) upload flow.
//
// This file is the empty-state + loaded-state shell of the upload UI.
// It is intentionally LAYOUT-ONLY in this commit:
//   - No XLSX parser wired up
//   - No commit action wired up
//   - The Upload button is a placeholder that surfaces a "parser not yet
//     implemented — pending source-file structure review" flash message
//
// Sub-phase 2b architecture (locked by Senior Architect):
//   1. Server-side parsing only (no client-bundled XLSX library)
//   2. Two-stage preview-then-commit
//   3. Truncate-and-replace per upload (no partial merges)
//   4. Versioning v1: simple replace-with-created_at; full audit trail later
//
// Why GOFO/Regional is the only carrier+service combo this page surfaces:
//   The service_coverage_zips schema supports any carrier + service, but in
//   v1 the only restricted-footprint service that needs a ZIP coverage list
//   is GOFO Regional (~70% of US ZIPs across 7 hubs — actually 8 hubs as of
//   v1.10.0-019). DHL eCom, USPS, etc. don't need a ZIP allowlist — they
//   service-or-don't via API/zone-matrix lookup. If a future restricted
//   service joins, the schema is ready; we'll add a carrier/service picker
//   to this page at that point.
//
// Schema reference (verified 2026-05-05):
//   service_coverage_zips(
//     id uuid pk default gen_random_uuid(),
//     carrier_code carrier_code_enum not null,
//     service_level text not null,
//     zip5 text not null,
//     is_serviceable boolean not null default true,
//     effective_date date not null,
//     deprecated_date date null,
//     source text null,
//     notes text null,
//     created_at timestamptz not null default now(),
//     UNIQUE(carrier_code, service_level, zip5, effective_date)
//   )
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import {
  ChevronRight,
  ChevronLeft,
  Upload,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'

const ROUTE = '/pld-analysis/reference-data/coverage-zips'
const TARGET_CARRIER = 'GOFO'
const TARGET_SERVICE = 'Regional'

interface CoverageStatus {
  total: number
  effective_date: string | null
  earliest_created_at: string | null
  latest_created_at: string | null
  source_sample: string | null
}

async function loadStatus(): Promise<CoverageStatus> {
  const admin = createAdminSupabaseClient()

  const [countRes, latestRes] = await Promise.all([
    admin
      .from('service_coverage_zips')
      .select('*', { count: 'exact', head: false })
      .eq('carrier_code', TARGET_CARRIER)
      .eq('service_level', TARGET_SERVICE)
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

  // Spread separately so the earliest can also be tracked. We fetch the
  // earliest created_at via a second targeted call only when there's at
  // least one row — saves a roundtrip on empty-state.
  let earliestCreatedAt: string | null = null
  if ((countRes.count ?? 0) > 0) {
    const earliest = await admin
      .from('service_coverage_zips')
      .select('created_at')
      .eq('carrier_code', TARGET_CARRIER)
      .eq('service_level', TARGET_SERVICE)
      .is('deprecated_date', null)
      .order('created_at', { ascending: true })
      .limit(1)
    earliestCreatedAt = (earliest.data?.[0]?.created_at as string | undefined) ?? null
  }

  const latest = latestRes.data?.[0] as
    | { effective_date: string; source: string | null; created_at: string }
    | undefined

  return {
    total: countRes.count ?? 0,
    effective_date: latest?.effective_date ?? null,
    earliest_created_at: earliestCreatedAt,
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

  // -------- Server actions (placeholders — parser not yet wired) --------

  async function handleUploadPlaceholder(_formData: FormData) {
    'use server'
    redirect(
      `${ROUTE}?status=info&msg=${encodeURIComponent(
        'Parser not yet implemented. Pending source-XLSX structure review with Senior Architect — see chat for the next pause point.',
      )}`,
    )
  }

  // -------- Render --------

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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Coverage ZIPs</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 880 }}>
          <a href="/pld-analysis/reference-data" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 12,
          }}>
            <ChevronLeft size={14} /> Back to Reference Data
          </a>

          {/* Page header with carrier/service badges */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <div style={{
              fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
              letterSpacing: '-0.02em',
            }}>Coverage ZIPs</div>
            <CarrierBadge label={TARGET_CARRIER} />
            <ServiceBadge label={TARGET_SERVICE} />
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            Per-ZIP service coverage list for GOFO Regional. The rating engine
            uses this to decide whether a destination ZIP is in GOFO Regional&apos;s
            ~70% US footprint. ZIPs not on this list fall through to GOFO
            Standard or another selected carrier. Re-uploads truncate and
            replace the active set in one transaction — partial merges are
            not supported.
          </div>

          {flash ? <Flash kind={flash.kind} msg={flash.msg} /> : null}

          {/* Status card */}
          {isLoaded ? (
            <LoadedCard status={status} />
          ) : (
            <EmptyCard />
          )}

          {/* Upload card */}
          <div style={{
            marginTop: 16,
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            padding: 24,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)',
              marginBottom: 6,
            }}>
              <Upload size={16} color="var(--cactus-forest)" />
              {isLoaded ? 'Replace with new upload' : 'Upload coverage XLSX'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 16 }}>
              Server-side parse. Two-stage preview-then-commit: after upload
              you&apos;ll see the first 10 parsed rows + total count + any
              validation warnings before anything writes to the database.
              Parsing is GOFO-Regional-specific (single sheet, ZIP5 column).
            </div>

            <form action={handleUploadPlaceholder} encType="multipart/form-data">
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 12,
                alignItems: 'center',
              }}>
                <input
                  name="file"
                  type="file"
                  accept=".xlsx,.xls"
                  required
                  style={{
                    width: '100%', padding: '8px 10px',
                    background: 'var(--cactus-canvas)',
                    border: '0.5px dashed var(--cactus-border-mid)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--cactus-ink)',
                    fontFamily: 'inherit',
                  }}
                />
                <button type="submit" style={primaryButtonStyle}>
                  <Upload size={12} />
                  Upload &amp; preview
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--cactus-hint)', marginTop: 8 }}>
                Source format: GOFO published US Regional ZIP coverage list (.xlsx).
                Single sheet with ZIP5 entries — exact column conventions to be
                confirmed with the source XLSX before parser is wired.
              </div>
            </form>
          </div>

          {/* View-all link — placeholder, browse view deferred */}
          {isLoaded ? (
            <div style={{
              marginTop: 12, fontSize: 12, color: 'var(--cactus-hint)', textAlign: 'right',
            }}>
              <span style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                View all {fmtNumber(status.total)} ZIPs (browse view forthcoming)
              </span>
            </div>
          ) : null}
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
          No coverage ZIPs loaded yet
        </div>
        <div style={{ fontSize: 12, color: 'var(--cactus-muted)', lineHeight: 1.5 }}>
          GOFO Regional rating won&apos;t resolve until a coverage list is
          loaded. Upload the GOFO Regional ZIP coverage XLSX below to begin.
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

function CarrierBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 500,
      color: 'var(--cactus-forest)',
      background: 'var(--cactus-mint)',
      border: '0.5px solid #C5DBC0',
      padding: '2px 8px', borderRadius: 999,
      letterSpacing: '0.02em',
      fontFamily: 'var(--font-mono)',
    }}>
      {label}
    </span>
  )
}

function ServiceBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 500,
      color: 'var(--cactus-muted)',
      background: 'var(--cactus-sand)',
      border: '0.5px solid var(--cactus-border)',
      padding: '2px 8px', borderRadius: 999,
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
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

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px',
  background: 'var(--cactus-forest)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
