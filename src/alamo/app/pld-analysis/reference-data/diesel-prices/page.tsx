// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/diesel-prices/page.tsx
// PURPOSE: Diesel Price History view + manual entry + manual EIA fetch.
//
// Three controls on this page:
//   1. List view: weekly diesel observations newest-first
//   2. Manual entry form: insert/update a single week's price
//      (used to override an EIA-auto-fetched value, or back-fill
//      a missing week)
//   3. "Fetch now" button: calls the fetch-eia-diesel Edge Function
//      synchronously so the operator can refresh data without
//      waiting for Monday's cron tick
//
// Schema reference (verified 2026-05-05):
//   diesel_price_history(
//     id uuid pk default gen_random_uuid(),
//     effective_week_start date not null,
//     effective_week_end date not null,
//     national_avg_price numeric not null,
//     source text not null default 'EIA',
//     source_url text null,
//     fetched_at timestamptz not null default now(),
//     notes text null,
//     UNIQUE(effective_week_start),
//     CHECK(effective_week_start <= effective_week_end)
//   )
//
// Conflict policy on UPSERT:
//   - Manual entry uses default upsert (UPDATE-on-conflict). Manual
//     corrections should override an auto-fetched value.
//   - Edge Function fetch uses ignoreDuplicates=true. Auto-fetch
//     should never overwrite an operator's manual correction.
//   The two policies are intentionally asymmetric.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Sidebar from '@/components/Sidebar'
import { ChevronRight, Pencil, RefreshCw, ChevronLeft, AlertCircle, CheckCircle2 } from 'lucide-react'

interface DieselRow {
  id: string
  effective_week_start: string
  effective_week_end: string
  national_avg_price: string  // numeric comes as string from Supabase
  source: string
  source_url: string | null
  notes: string | null
  fetched_at: string
}

function fmtUsd(value: string): string {
  const n = parseFloat(value)
  if (Number.isNaN(n)) return value
  return `$${n.toFixed(3)}/gal`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface PageProps {
  searchParams: Promise<{ status?: string; msg?: string; weeks?: string }>
}

export default async function DieselPricesPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: rows } = await admin
    .from('diesel_price_history')
    .select('*')
    .order('effective_week_start', { ascending: false })

  const dieselRows = (rows ?? []) as DieselRow[]
  const userEmail = user.email ?? 'unknown'

  // -------- Server actions --------

  async function addManualEntry(formData: FormData) {
    'use server'

    const weekStart = (formData.get('effective_week_start') as string)?.trim()
    const priceRaw = (formData.get('national_avg_price') as string)?.trim()
    const userNotes = (formData.get('notes') as string)?.trim() || ''

    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('Week start must be a YYYY-MM-DD date')}`)
    }
    const price = parseFloat(priceRaw)
    if (Number.isNaN(price) || price < 0) {
      redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('Price must be a non-negative number')}`)
    }
    if (price > 20) {
      redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('Price > $20/gal looks wrong — check units')}`)
    }

    const weekEnd = addDaysIso(weekStart, 6)
    const stamp = new Date().toISOString()
    const composedNotes = userNotes
      ? `Manual entry by ${userEmail} at ${stamp}. ${userNotes}`
      : `Manual entry by ${userEmail} at ${stamp}.`

    const adminClient = createAdminSupabaseClient()
    const { error } = await adminClient
      .from('diesel_price_history')
      .upsert(
        {
          effective_week_start: weekStart,
          effective_week_end: weekEnd,
          national_avg_price: price,
          source: 'MANUAL',
          source_url: null,
          notes: composedNotes,
          fetched_at: stamp,
        },
        { onConflict: 'effective_week_start' },
      )

    if (error) {
      redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('DB error: ' + error.message)}`)
    }

    revalidatePath('/pld-analysis/reference-data/diesel-prices')
    redirect(`/pld-analysis/reference-data/diesel-prices?status=success&msg=${encodeURIComponent('Manual entry saved for week ' + weekStart)}`)
  }

  async function triggerEiaFetch() {
    'use server'

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) {
      redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('SUPABASE env not configured')}`)
    }

    let weeksUpserted = 0
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-eia-diesel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
        },
        body: '{}',
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        const msg = json.error
          ? `${json.error}: ${json.detail ?? ''}`
          : `HTTP ${res.status}`
        redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('EIA fetch failed — ' + msg)}`)
      }
      weeksUpserted = (json.upserted_count as number | undefined) ?? 0
    } catch (err) {
      // Next.js redirect throws — let it propagate
      if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
      const msg = err instanceof Error ? err.message : String(err)
      redirect(`/pld-analysis/reference-data/diesel-prices?status=error&msg=${encodeURIComponent('Fetch threw: ' + msg)}`)
    }

    revalidatePath('/pld-analysis/reference-data/diesel-prices')
    redirect(`/pld-analysis/reference-data/diesel-prices?status=success&msg=${encodeURIComponent('EIA fetch ok')}&weeks=${weeksUpserted}`)
  }

  // -------- Render --------

  const flash = params.status
    ? { kind: params.status, msg: params.msg ?? '', weeks: params.weeks }
    : null

  // Suggest the most-recent Monday as the default for the manual-entry date picker
  const today = new Date()
  const dow = today.getUTCDay() // 0 = Sun, 1 = Mon
  const offsetToMonday = dow === 0 ? -6 : 1 - dow
  const lastMondayDate = new Date(today)
  lastMondayDate.setUTCDate(today.getUTCDate() + offsetToMonday)
  const defaultWeekStart = lastMondayDate.toISOString().slice(0, 10)

  return (
    <div style={{
      marginLeft: 200,
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Topbar with breadcrumb */}
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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Diesel Prices</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
          {/* Back link */}
          <a href="/pld-analysis/reference-data" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)',
            marginBottom: 12,
          }}>
            <ChevronLeft size={14} /> Back to Reference Data
          </a>

          {/* Page header */}
          <div style={{
            fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>Diesel Price History</div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            Weekly US national average on-highway diesel price (EIA series EPD2D).
            Auto-refresh runs every Monday at 11:00 UTC. Manual entries are
            preserved on auto-fetch.
          </div>

          {/* Flash message */}
          {flash ? <Flash kind={flash.kind} msg={flash.msg} weeks={flash.weeks} /> : null}

          {/* Action row: manual entry form + Fetch now button */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 220px',
            gap: 16,
            marginBottom: 24,
            alignItems: 'stretch',
          }}>
            {/* Manual entry */}
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10,
              padding: 16,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 500, color: 'var(--cactus-ink)',
                marginBottom: 12,
              }}>
                <Pencil size={14} color="var(--cactus-forest)" />
                Manual entry
              </div>

              <form action={addManualEntry}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 160px 1fr',
                  gap: 12,
                  alignItems: 'end',
                }}>
                  <Field label="Week start (Mon)">
                    <input
                      name="effective_week_start"
                      type="date"
                      required
                      defaultValue={defaultWeekStart}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Price ($/gal)">
                    <input
                      name="national_avg_price"
                      type="number"
                      required
                      step="0.001"
                      min="0"
                      max="20"
                      placeholder="5.351"
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                    />
                  </Field>
                  <Field label="Notes (optional)">
                    <input
                      name="notes"
                      type="text"
                      placeholder="e.g., correcting EIA off-by-one"
                      style={inputStyle}
                    />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="submit" style={primaryButtonStyle}>Save entry</button>
                  <span style={{ fontSize: 11, color: 'var(--cactus-hint)', alignSelf: 'center' }}>
                    Inserts new week or overwrites existing one. Source = MANUAL.
                  </span>
                </div>
              </form>
            </div>

            {/* Fetch now */}
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 500, color: 'var(--cactus-ink)',
              }}>
                <RefreshCw size={14} color="var(--cactus-forest)" />
                Fetch from EIA
              </div>
              <div style={{ fontSize: 11, color: 'var(--cactus-muted)', lineHeight: 1.5 }}>
                Pulls the last 60 days of weekly observations.
                Manual entries are preserved.
              </div>
              <form action={triggerEiaFetch} style={{ marginTop: 'auto' }}>
                <button type="submit" style={{ ...primaryButtonStyle, width: '100%' }}>
                  <RefreshCw size={12} /> Fetch now
                </button>
              </form>
            </div>
          </div>

          {/* List */}
          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '120px 120px 110px 80px 1fr 160px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
              gap: 12,
            }}>
              {['Week start', 'Week end', 'Price', 'Source', 'Notes', 'Fetched at'].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {dieselRows.length === 0 ? (
              <div style={{ padding: '32px 16px', fontSize: 13, color: 'var(--cactus-muted)', textAlign: 'center' }}>
                No diesel observations loaded yet. Click <strong>Fetch now</strong> or add a manual entry.
              </div>
            ) : dieselRows.map((row, idx) => (
              <div key={row.id} style={{
                display: 'grid',
                gridTemplateColumns: '120px 120px 110px 80px 1fr 160px',
                padding: '10px 16px',
                gap: 12,
                fontSize: 12,
                borderBottom: idx === dieselRows.length - 1 ? 'none' : '0.5px solid var(--cactus-border)',
                alignItems: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-ink)', fontWeight: 500 }}>
                  {fmtDate(row.effective_week_start)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-muted)' }}>
                  {fmtDate(row.effective_week_end)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-ink)', fontWeight: 500 }}>
                  {fmtUsd(row.national_avg_price)}
                </div>
                <div>
                  <SourcePill source={row.source} />
                </div>
                <div style={{ color: 'var(--cactus-muted)', fontSize: 11, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.notes ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-muted)', fontSize: 11 }}>
                  {fmtTimestamp(row.fetched_at)}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 12, fontSize: 11, color: 'var(--cactus-hint)', textAlign: 'right',
          }}>
            {dieselRows.length} {dieselRows.length === 1 ? 'observation' : 'observations'} loaded
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================
// Sub-components
// =====================

function Flash({ kind, msg, weeks }: { kind: string; msg: string; weeks?: string }) {
  const isError = kind === 'error'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px',
      background: isError ? 'var(--cactus-bloom-bg)' : 'var(--cactus-mint)',
      border: `0.5px solid ${isError ? 'var(--cactus-bloom-border)' : '#C5DBC0'}`,
      borderRadius: 8,
      fontSize: 12,
      color: isError ? 'var(--cactus-bloom-deep)' : 'var(--cactus-forest)',
      marginBottom: 16,
    }}>
      {isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
      <div>
        <div style={{ fontWeight: 500 }}>{isError ? 'Error' : 'Success'}</div>
        <div style={{ marginTop: 2 }}>
          {msg}
          {weeks ? ` — ${weeks} week${weeks === '1' ? '' : 's'} processed.` : ''}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 10, fontWeight: 500,
        color: 'var(--cactus-muted)', letterSpacing: '0.04em',
        textTransform: 'uppercase', marginBottom: 4,
      }}>{label}</label>
      {children}
    </div>
  )
}

function SourcePill({ source }: { source: string }) {
  // MANUAL uses sand grey to match the "seeded / system constant" treatment
  // on the reference-data index page. Amber would imply "needs attention,"
  // which is the wrong semantic for an operator-entered correction.
  const isManual = source === 'MANUAL'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 10, fontWeight: 500,
      color: isManual ? 'var(--cactus-muted)' : 'var(--cactus-forest)',
      background: isManual ? 'var(--cactus-sand)' : 'var(--cactus-mint)',
      border: `0.5px solid ${isManual ? 'var(--cactus-border)' : '#C5DBC0'}`,
      padding: '1px 6px', borderRadius: 999,
      letterSpacing: '0.02em',
    }}>
      {source}
    </span>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'var(--cactus-canvas)',
  border: '0.5px solid var(--cactus-border-mid)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--cactus-ink)',
  fontFamily: 'var(--font-sans)',
  outline: 'none',
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 14px',
  background: 'var(--cactus-forest)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
