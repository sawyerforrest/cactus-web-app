// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/page.tsx
// PURPOSE: Reference Data index page for the PLD Analysis Engine.
//   Status dashboard for every reference dataset the rating engine
//   depends on. Operators land here to: see what's loaded, see when
//   it was last refreshed, and (in subsequent screens) re-seed,
//   upload, or edit each one.
//
// DESIGN CONSTRAINTS (sub-phase 2b, brief Part 1 Section 4 + patch-002
// + docs/derived-data-dependencies.md):
//
//   1. ZIP3 Centroids is one item with one atomic re-seed action.
//      Per Rule 10, never split into separate "centroids" and
//      "Haversine" buttons. The proximity table appears as a
//      subline under centroids, never as its own row.
//
//   2. gofo_hubs is a system constant (7 rows seeded in migration
//      004). Shown read-only — no upload, no edit.
//
//   3. Action buttons are placeholders (href="#design-review-pending")
//      until the per-item screens land later in sub-phase 2b. The
//      page itself is the first 2b deliverable for design review.
//
//   4. Empty datasets render with a "Not loaded" state and a
//      prominent Upload CTA.
//
//   5. Reads only — no mutations on this page.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import {
  MapPin,
  Building,
  Globe2,
  Fuel,
  Droplets,
  Map,
  Layers,
  Tag,
  ChevronRight,
  CheckCircle2,
  Circle,
  RefreshCw,
} from 'lucide-react'

interface RefDataStatus {
  zip3_centroids: number
  gofo_hub_proximity: number
  gofo_hubs: number
  gofo_remote_zip3s: number
  dhl_ecom_fuel_tiers: number
  dhl_fuel_latest_effective: string | null
  diesel_price_history: number
  diesel_latest_week: string | null
  diesel_last_fetched_at: string | null
  carrier_zone_matrices: number
  carrier_country_zone_matrices: number
  gofo_regional_zone_matrix: number
  service_coverage_zips: number
  analysis_rate_cards_active: number
  analysis_rate_card_cells: number
}

async function loadStatus(): Promise<RefDataStatus> {
  const admin = createAdminSupabaseClient()

  // Each call is intentionally simple — we just want counts and a couple
  // of latest-value markers. Doing this as parallel head:false count queries
  // on the admin client (NOT head:true — that path silently returns null,
  // per master briefing build state notes).
  const [
    zip3Centroids,
    proximity,
    hubs,
    remoteZip3s,
    fuelTiers,
    fuelLatest,
    dieselRows,
    dieselLatestWeek,
    dieselLastFetchedAt,
    zoneMatrices,
    countryZoneMatrices,
    regionalZoneMatrix,
    coverageZips,
    rateCards,
    rateCardCells,
  ] = await Promise.all([
    admin.from('zip3_centroids').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('gofo_hub_proximity').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('gofo_hubs').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('gofo_remote_zip3s').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('dhl_ecom_fuel_tiers').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('dhl_ecom_fuel_tiers').select('effective_date').order('effective_date', { ascending: false }).limit(1),
    admin.from('diesel_price_history').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('diesel_price_history').select('effective_week_start').order('effective_week_start', { ascending: false }).limit(1),
    admin.from('diesel_price_history').select('fetched_at').order('fetched_at', { ascending: false }).limit(1),
    admin.from('carrier_zone_matrices').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('carrier_country_zone_matrices').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('gofo_regional_zone_matrix').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('service_coverage_zips').select('*', { count: 'exact', head: false }).limit(0),
    admin.from('analysis_rate_cards').select('*', { count: 'exact', head: false }).is('deleted_at', null).limit(0),
    admin.from('analysis_rate_card_cells').select('*', { count: 'exact', head: false }).limit(0),
  ])

  return {
    zip3_centroids: zip3Centroids.count ?? 0,
    gofo_hub_proximity: proximity.count ?? 0,
    gofo_hubs: hubs.count ?? 0,
    gofo_remote_zip3s: remoteZip3s.count ?? 0,
    dhl_ecom_fuel_tiers: fuelTiers.count ?? 0,
    dhl_fuel_latest_effective: fuelLatest.data?.[0]?.effective_date ?? null,
    diesel_price_history: dieselRows.count ?? 0,
    diesel_latest_week: dieselLatestWeek.data?.[0]?.effective_week_start ?? null,
    diesel_last_fetched_at: dieselLastFetchedAt.data?.[0]?.fetched_at ?? null,
    carrier_zone_matrices: zoneMatrices.count ?? 0,
    carrier_country_zone_matrices: countryZoneMatrices.count ?? 0,
    gofo_regional_zone_matrix: regionalZoneMatrix.count ?? 0,
    service_coverage_zips: coverageZips.count ?? 0,
    analysis_rate_cards_active: rateCards.count ?? 0,
    analysis_rate_card_cells: rateCardCells.count ?? 0,
  }
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  return then.toISOString().slice(0, 10)
}

export default async function ReferenceDataPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const status = await loadStatus()

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
          <a href="/pld-analysis" style={{
            fontSize: 13, color: 'var(--cactus-muted)',
          }}>PLD Analysis</a>
          <ChevronRight size={14} color="var(--cactus-hint)" />
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            Reference Data
          </div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
          {/* Page header */}
          <div style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
              letterSpacing: '-0.02em',
            }}>Reference Data</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 24 }}>
            The PLD Analysis Engine&apos;s source-of-truth datasets. Each item
            below is loaded into Supabase from a published carrier document or
            an external data source, then consumed by the rating engine when
            scoring shipments. Per Rule 10, derived datasets like the
            GOFO hub-proximity table refresh atomically with their source.
          </div>

          {/* SECTION: Geographic */}
          <SectionHeading icon={<MapPin size={14} />} label="Geographic" />
          <Card>
            <Row
              icon={<Globe2 size={18} color="var(--cactus-forest)" />}
              title="ZIP3 Centroids"
              loaded={status.zip3_centroids > 0}
              primary={`${fmtNumber(status.zip3_centroids)} ZIP3 prefixes`}
              secondary={`Source: 2025 US Census Gazetteer · Derived: ${fmtNumber(status.gofo_hub_proximity)} hub-proximity rows (auto-computed)`}
              action={{
                label: 'Re-seed centroids',
                href: '#design-review-pending',
                hint: 'Atomic action — re-seeds centroids and recomputes Haversine',
              }}
            />
            <Row
              icon={<Building size={18} color="var(--cactus-forest)" />}
              title="GOFO Hubs"
              loaded={status.gofo_hubs > 0}
              primary={`${fmtNumber(status.gofo_hubs)} hubs`}
              secondary="System constant — LAX, DFW, ORD, EWR_JFK, ATL, MIA, SLC. Edits require a migration."
              readOnly
            />
            <Row
              icon={<Map size={18} color="var(--cactus-forest)" />}
              title="GOFO Remote ZIP3s"
              loaded={status.gofo_remote_zip3s > 0}
              primary={`${fmtNumber(status.gofo_remote_zip3s)} ZIP3 prefixes`}
              secondary="Triggers GOFO Standard remote-rate variant. Hawaii, Alaska, PR, USVI, Guam, Military APO/FPO."
              action={{
                label: 'Edit list',
                href: '#design-review-pending',
              }}
              isLast
            />
          </Card>

          {/* SECTION: Carrier pricing */}
          <SectionHeading icon={<Fuel size={14} />} label="Carrier pricing" />
          <Card>
            <Row
              icon={<Fuel size={18} color="var(--cactus-forest)" />}
              title="DHL eCom Fuel Tiers"
              loaded={status.dhl_ecom_fuel_tiers > 0}
              primary={`${fmtNumber(status.dhl_ecom_fuel_tiers)} tiers`}
              secondary={`Effective ${status.dhl_fuel_latest_effective ?? '—'} · Indexed to weekly diesel price · DHL published PDF`}
              action={{
                label: 'View / edit',
                href: '#design-review-pending',
              }}
            />
            <Row
              icon={<Droplets size={18} color="var(--cactus-forest)" />}
              title="Diesel Price History"
              loaded={status.diesel_price_history > 0}
              primary={`${fmtNumber(status.diesel_price_history)} weeks loaded`}
              secondary={`Latest week: ${status.diesel_latest_week ?? '—'} · Last EIA fetch: ${fmtRelative(status.diesel_last_fetched_at)} · Auto-refresh: Mondays 11:00 UTC`}
              action={{
                label: 'View / manual entry',
                href: '#design-review-pending',
              }}
              secondaryAction={{
                label: 'Fetch now',
                href: '#design-review-pending',
                icon: <RefreshCw size={12} />,
              }}
              isLast
            />
          </Card>

          {/* SECTION: Coverage and zones */}
          <SectionHeading icon={<Layers size={14} />} label="Coverage and zone data" />
          <Card>
            <Row
              icon={<Layers size={18} color="var(--cactus-forest)" />}
              title="DHL eCom Domestic Zones"
              loaded={status.carrier_zone_matrices > 0}
              primary={status.carrier_zone_matrices > 0 ? `${fmtNumber(status.carrier_zone_matrices)} matrix rows` : 'Not loaded'}
              secondary="ZIP3 origin × ZIP3 destination zone matrix. Published by DHL eCommerce."
              action={{
                label: status.carrier_zone_matrices > 0 ? 'View / replace' : 'Upload XLSX',
                href: '#design-review-pending',
              }}
            />
            <Row
              icon={<Globe2 size={18} color="var(--cactus-forest)" />}
              title="DHL eCom International Zones"
              loaded={status.carrier_country_zone_matrices > 0}
              primary={status.carrier_country_zone_matrices > 0 ? `${fmtNumber(status.carrier_country_zone_matrices)} country pairs` : 'Not loaded'}
              secondary="Origin country × destination country zone matrix. Published by DHL eCommerce."
              action={{
                label: status.carrier_country_zone_matrices > 0 ? 'View / replace' : 'Upload XLSX',
                href: '#design-review-pending',
              }}
            />
            <Row
              icon={<Map size={18} color="var(--cactus-forest)" />}
              title="GOFO Regional Zone Matrix"
              loaded={status.gofo_regional_zone_matrix > 0}
              primary={status.gofo_regional_zone_matrix > 0 ? `${fmtNumber(status.gofo_regional_zone_matrix)} matrix rows` : 'Not loaded'}
              secondary="Injection-point hub × destination ZIP5. ~58k rows when fully loaded."
              action={{
                label: status.gofo_regional_zone_matrix > 0 ? 'View / replace' : 'Upload XLSX',
                href: '#design-review-pending',
              }}
            />
            <Row
              icon={<MapPin size={18} color="var(--cactus-forest)" />}
              title="Service Coverage ZIPs"
              loaded={status.service_coverage_zips > 0}
              primary={status.service_coverage_zips > 0 ? `${fmtNumber(status.service_coverage_zips)} ZIP entries` : 'Not loaded'}
              secondary="Per-carrier per-service ZIP coverage list. Used by GOFO Regional and other footprint-restricted services."
              action={{
                label: status.service_coverage_zips > 0 ? 'View / replace' : 'Upload XLSX',
                href: '#design-review-pending',
              }}
              isLast
            />
          </Card>

          {/* SECTION: Rate cards */}
          <SectionHeading icon={<Tag size={14} />} label="Rate cards" />
          <Card>
            <Row
              icon={<Tag size={18} color="var(--cactus-forest)" />}
              title="Analysis Rate Cards"
              loaded={status.analysis_rate_cards_active > 0}
              primary={status.analysis_rate_cards_active > 0
                ? `${fmtNumber(status.analysis_rate_cards_active)} active cards · ${fmtNumber(status.analysis_rate_card_cells)} total cells`
                : 'Not loaded'}
              secondary="Cactus base-cost cards and lead-quoted cards. Separate from production public.rate_cards."
              action={{
                label: status.analysis_rate_cards_active > 0 ? 'Manage' : 'Upload XLSX',
                href: '#design-review-pending',
              }}
              isLast
            />
          </Card>

          {/* Footer note */}
          <div style={{
            marginTop: 24,
            padding: '12px 16px',
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 8,
            fontSize: 12, color: 'var(--cactus-muted)',
            lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--cactus-ink)', fontWeight: 500 }}>About derived data.</strong>{' '}
            The GOFO hub-proximity table (currently {fmtNumber(status.gofo_hub_proximity)} rows)
            is computed from ZIP3 centroids via Haversine distance. It is not
            user-editable and refreshes automatically when centroids are
            re-seeded — see{' '}
            <a href="/docs/derived-data-dependencies.md" style={{
              color: 'var(--cactus-forest)',
              textDecoration: 'underline',
            }}>derived-data-dependencies.md</a>{' '}
            for the full Rule 10 protocol.
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================
// Sub-components (presentational only — no client interactivity needed yet)
// =====================

function SectionHeading({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 20, marginBottom: 8,
      color: 'var(--cactus-muted)',
    }}>
      {icon}
      <div style={{
        fontSize: 11, fontWeight: 500,
        letterSpacing: '0.07em', textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>{children}</div>
  )
}

function Row({
  icon, title, loaded, primary, secondary, action, secondaryAction, readOnly, isLast,
}: {
  icon: React.ReactNode
  title: string
  loaded: boolean
  primary: string
  secondary: string
  action?: { label: string, href: string, hint?: string }
  secondaryAction?: { label: string, href: string, icon?: React.ReactNode }
  readOnly?: boolean
  isLast?: boolean
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr auto',
      alignItems: 'center',
      gap: 16,
      padding: '14px 16px',
      borderBottom: isLast ? 'none' : '0.5px solid var(--cactus-border)',
    }}>
      {/* Icon column */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8,
        background: 'var(--cactus-mint)',
      }}>{icon}</div>

      {/* Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)',
        }}>
          {title}
          <StatusPill loaded={loaded} readOnly={readOnly} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--cactus-slate)' }}>
          {primary}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cactus-muted)' }}>
          {secondary}
        </div>
      </div>

      {/* Action column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {readOnly ? (
          <div style={{ fontSize: 11, color: 'var(--cactus-hint)', fontStyle: 'italic' }}>
            read-only
          </div>
        ) : action ? (
          <a href={action.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px',
            background: 'var(--cactus-forest)', color: '#fff',
            borderRadius: 6,
            fontSize: 12, fontWeight: 500,
            textDecoration: 'none',
          }}>
            {action.label}
            <ChevronRight size={12} />
          </a>
        ) : null}
        {action?.hint ? (
          <div style={{ fontSize: 10, color: 'var(--cactus-hint)', textAlign: 'right', maxWidth: 200 }}>
            {action.hint}
          </div>
        ) : null}
        {secondaryAction ? (
          <a href={secondaryAction.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px',
            background: 'transparent',
            color: 'var(--cactus-forest)',
            border: '0.5px solid var(--cactus-border-mid)',
            borderRadius: 6,
            fontSize: 11, fontWeight: 500,
            textDecoration: 'none',
          }}>
            {secondaryAction.icon}
            {secondaryAction.label}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function StatusPill({ loaded, readOnly }: { loaded: boolean, readOnly?: boolean }) {
  if (readOnly) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontSize: 10, fontWeight: 500,
        color: 'var(--cactus-muted)',
        background: 'var(--cactus-sand)',
        border: '0.5px solid var(--cactus-border)',
        padding: '1px 6px', borderRadius: 999,
      }}>
        <CheckCircle2 size={10} />
        seeded
      </span>
    )
  }
  return loaded ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 500,
      color: 'var(--cactus-forest)',
      background: 'var(--cactus-mint)',
      border: '0.5px solid #C5DBC0',
      padding: '1px 6px', borderRadius: 999,
    }}>
      <CheckCircle2 size={10} />
      loaded
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontWeight: 500,
      color: 'var(--cactus-amber-text)',
      background: 'var(--cactus-amber-bg)',
      border: '0.5px solid #FCD34D',
      padding: '1px 6px', borderRadius: 999,
    }}>
      <Circle size={10} />
      not loaded
    </span>
  )
}
