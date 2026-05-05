// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/fuel-tiers/page.tsx
// PURPOSE: DHL eCom fuel tier list, edit, and add.
//
// The active fuel tier set is everything in dhl_ecom_fuel_tiers with
// deprecated_date IS NULL. Currently 18 rows, all sharing
// effective_date = 2026-05-30 (the May-2026 DHL published schedule).
//
// Multi-version handling deferred per Senior Architect: when DHL
// publishes a second schedule, we'll add a version selector then.
// For now the page shows whatever is active and surfaces the
// effective_date as a small badge so operators see at a glance
// which schedule they're looking at.
//
// Edit pattern is server-component-friendly: ?edit=<id> in the URL
// flips one row into form mode. ?add=1 appends an empty form row at
// the end of the list. Save submits a server action; Cancel is
// just a link back to the clean URL. No client-side state.
//
// Schema reference (verified 2026-05-05):
//   dhl_ecom_fuel_tiers(
//     id uuid pk default gen_random_uuid(),
//     effective_date date not null,
//     deprecated_date date null,
//     diesel_price_min numeric not null,
//     diesel_price_max numeric not null,
//     fuel_per_lb numeric not null,
//     source text not null default 'DHL_PUBLISHED',
//     notes text null,
//     created_at timestamptz not null default now(),
//     CHECK (diesel_price_min < diesel_price_max),
//     UNIQUE (effective_date, diesel_price_min, diesel_price_max)
//   )
//
// Validation runs server-side:
//   1. min < max
//   2. fuel_per_lb >= 0
//   3. No range overlap with other rows on the same effective_date
//      (excluding self when editing)
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Sidebar from '@/components/Sidebar'
import { ChevronRight, ChevronLeft, Plus, Pencil, AlertCircle, CheckCircle2 } from 'lucide-react'

interface FuelTierRow {
  id: string
  effective_date: string
  deprecated_date: string | null
  diesel_price_min: string
  diesel_price_max: string
  fuel_per_lb: string
  source: string
  notes: string | null
  created_at: string
}

const ROUTE = '/pld-analysis/reference-data/fuel-tiers'

function fmtUsdRange(min: string, max: string): string {
  const lo = parseFloat(min)
  const hi = parseFloat(max)
  return `$${lo.toFixed(2)} – $${hi.toFixed(2)}`
}

function fmtFuel(value: string): string {
  const n = parseFloat(value)
  return `$${n.toFixed(4)}/lb`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    msg?: string
    edit?: string
    add?: string
  }>
}

export default async function FuelTiersPage({ searchParams }: PageProps) {
  const params = await searchParams

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: rows } = await admin
    .from('dhl_ecom_fuel_tiers')
    .select('*')
    .is('deprecated_date', null)
    .order('diesel_price_min', { ascending: true })

  const tiers = (rows ?? []) as FuelTierRow[]
  const activeEffectiveDate = tiers[0]?.effective_date ?? null

  // -------- Server actions --------

  async function saveTier(formData: FormData) {
    'use server'

    const id = (formData.get('id') as string)?.trim() || null
    const isEdit = !!id

    const minRaw = (formData.get('diesel_price_min') as string)?.trim()
    const maxRaw = (formData.get('diesel_price_max') as string)?.trim()
    const fuelRaw = (formData.get('fuel_per_lb') as string)?.trim()
    const userNotes = (formData.get('notes') as string)?.trim() || null

    const min = parseFloat(minRaw)
    const max = parseFloat(maxRaw)
    const fuel = parseFloat(fuelRaw)

    function fail(msg: string): never {
      const params = new URLSearchParams({ status: 'error', msg })
      if (isEdit) params.set('edit', id!)
      else params.set('add', '1')
      redirect(`${ROUTE}?${params.toString()}`)
    }

    if (Number.isNaN(min) || min < 0) fail('Diesel price min must be >= 0')
    if (Number.isNaN(max) || max <= min) fail('Diesel price max must be greater than min')
    if (Number.isNaN(fuel) || fuel < 0) fail('Fuel per lb must be >= 0')
    if (max > 50) fail('Diesel price max > $50/gal looks wrong — check units')
    if (fuel > 5) fail('Fuel per lb > $5/lb looks wrong — check units')

    const adminClient = createAdminSupabaseClient()

    // Determine the effective_date this row belongs to. For edits, take the
    // existing row's effective_date; for adds, take the active set's
    // effective_date (which is what we display).
    let targetEffectiveDate: string
    if (isEdit) {
      const { data: existing } = await adminClient
        .from('dhl_ecom_fuel_tiers')
        .select('effective_date')
        .eq('id', id!)
        .single()
      if (!existing) fail('Tier not found')
      targetEffectiveDate = (existing as { effective_date: string }).effective_date
    } else {
      const { data: anyActive } = await adminClient
        .from('dhl_ecom_fuel_tiers')
        .select('effective_date')
        .is('deprecated_date', null)
        .order('effective_date', { ascending: false })
        .limit(1)
      if (!anyActive?.length) {
        fail('Cannot add tier — no active schedule found. Apply a seed migration first.')
      }
      targetEffectiveDate = (anyActive![0] as { effective_date: string }).effective_date
    }

    // Range-overlap check: any other row on the same effective_date with a
    // range that overlaps (min, max). Two ranges [a,b) and [c,d) overlap iff
    // a < d AND c < b.
    const overlapQuery = adminClient
      .from('dhl_ecom_fuel_tiers')
      .select('id, diesel_price_min, diesel_price_max')
      .eq('effective_date', targetEffectiveDate)
      .is('deprecated_date', null)
      .lt('diesel_price_min', max)
      .gt('diesel_price_max', min)
    const { data: overlaps } = isEdit
      ? await overlapQuery.neq('id', id!)
      : await overlapQuery

    if (overlaps && overlaps.length > 0) {
      const o = overlaps[0] as { diesel_price_min: string; diesel_price_max: string }
      fail(`Range overlaps existing tier ${fmtUsdRange(o.diesel_price_min, o.diesel_price_max)}`)
    }

    if (isEdit) {
      const { error } = await adminClient
        .from('dhl_ecom_fuel_tiers')
        .update({
          diesel_price_min: min,
          diesel_price_max: max,
          fuel_per_lb: fuel,
          notes: userNotes,
        })
        .eq('id', id!)
      if (error) fail('DB error: ' + error.message)
    } else {
      const { error } = await adminClient
        .from('dhl_ecom_fuel_tiers')
        .insert({
          effective_date: targetEffectiveDate,
          diesel_price_min: min,
          diesel_price_max: max,
          fuel_per_lb: fuel,
          source: 'DHL_PUBLISHED',
          notes: userNotes,
        })
      if (error) fail('DB error: ' + error.message)
    }

    revalidatePath(ROUTE)
    const successMsg = isEdit
      ? `Tier ${fmtUsdRange(minRaw, maxRaw)} updated`
      : `Tier ${fmtUsdRange(minRaw, maxRaw)} added`
    redirect(`${ROUTE}?status=success&msg=${encodeURIComponent(successMsg)}`)
  }

  // -------- Render --------

  const flash = params.status
    ? { kind: params.status, msg: params.msg ?? '' }
    : null
  const editingId = params.edit ?? null
  const isAdding = params.add === '1'

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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Fuel Tiers</div>
        </div>

        <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
          <a href="/pld-analysis/reference-data" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 12,
          }}>
            <ChevronLeft size={14} /> Back to Reference Data
          </a>

          {/* Page header with active-schedule badge */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
            <div style={{
              fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
              letterSpacing: '-0.02em',
            }}>DHL eCom Fuel Tiers</div>
            {activeEffectiveDate ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 500,
                color: 'var(--cactus-forest)',
                background: 'var(--cactus-mint)',
                border: '0.5px solid #C5DBC0',
                padding: '2px 8px', borderRadius: 999,
                fontFamily: 'var(--font-mono)',
              }}>
                effective {activeEffectiveDate}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            Per-pound fuel surcharge tiers indexed to weekly diesel price.
            Sourced verbatim from DHL eCommerce&apos;s published Fuel
            Surcharge for Domestic Products schedule. Verify any change
            against the source PDF before saving.
          </div>

          {flash ? <Flash kind={flash.kind} msg={flash.msg} /> : null}

          {/* Action row: add new tier */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
              {tiers.length} active {tiers.length === 1 ? 'tier' : 'tiers'}
            </div>
            {isAdding ? (
              <a href={ROUTE} style={cancelButtonStyle}>Cancel add</a>
            ) : editingId ? null : (
              <a href={`${ROUTE}?add=1`} style={primaryButtonStyle}>
                <Plus size={12} /> Add tier
              </a>
            )}
          </div>

          {/* List */}
          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <HeaderRow />

            {tiers.length === 0 && !isAdding ? (
              <div style={{ padding: '32px 16px', fontSize: 13, color: 'var(--cactus-muted)', textAlign: 'center' }}>
                No active fuel tiers. Click <strong>Add tier</strong> to create one,
                or apply a seed migration to load DHL&apos;s published schedule.
              </div>
            ) : null}

            {tiers.map((row, idx) => {
              const isEditing = editingId === row.id
              const isLast = idx === tiers.length - 1 && !isAdding
              return isEditing ? (
                <FormRow
                  key={row.id}
                  initial={row}
                  isLast={isLast}
                  formAction={saveTier}
                />
              ) : (
                <ReadRow
                  key={row.id}
                  row={row}
                  isLast={isLast}
                  disableEdit={!!editingId || isAdding}
                />
              )
            })}

            {isAdding ? (
              <FormRow
                initial={null}
                isLast={true}
                formAction={saveTier}
              />
            ) : null}
          </div>

          <div style={{
            marginTop: 12, fontSize: 11, color: 'var(--cactus-hint)', textAlign: 'right',
          }}>
            Source: DHL eCommerce published rate schedule.
            Tier ranges are diesel-price brackets ($/gal); fuel applies to
            <strong> max(billable_weight_lb, 1.0)</strong>.
          </div>
        </div>
      </div>
    </div>
  )
}

// =====================
// Sub-components
// =====================

function HeaderRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 110px 110px 1fr 80px',
      background: 'var(--cactus-sand)',
      borderBottom: '0.5px solid var(--cactus-border)',
      padding: '8px 16px',
      gap: 12,
    }}>
      {['Diesel range ($/gal)', '$/lb', 'Effective', 'Notes', ''].map(h => (
        <div key={h} style={{
          fontSize: 11, fontWeight: 500,
          color: 'var(--cactus-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>{h}</div>
      ))}
    </div>
  )
}

function ReadRow({ row, isLast, disableEdit }: {
  row: FuelTierRow
  isLast: boolean
  disableEdit: boolean
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 110px 110px 1fr 80px',
      padding: '10px 16px',
      gap: 12,
      fontSize: 12,
      borderBottom: isLast ? 'none' : '0.5px solid var(--cactus-border)',
      alignItems: 'center',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-ink)', fontWeight: 500 }}>
        {fmtUsdRange(row.diesel_price_min, row.diesel_price_max)}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-ink)', fontWeight: 500 }}>
        {fmtFuel(row.fuel_per_lb)}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-muted)' }}>
        {fmtDate(row.effective_date)}
      </div>
      <div style={{ color: 'var(--cactus-muted)', fontSize: 11, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.notes ?? '—'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {disableEdit ? (
          <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>—</span>
        ) : (
          <a href={`${ROUTE}?edit=${row.id}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '4px 8px',
            color: 'var(--cactus-forest)',
            border: '0.5px solid var(--cactus-border-mid)',
            borderRadius: 6,
            fontSize: 11, fontWeight: 500,
            textDecoration: 'none',
          }}>
            <Pencil size={10} /> Edit
          </a>
        )}
      </div>
    </div>
  )
}

function FormRow({ initial, isLast, formAction }: {
  initial: FuelTierRow | null
  isLast: boolean
  formAction: (formData: FormData) => Promise<void>
}) {
  const isEdit = !!initial
  return (
    <form action={formAction}>
      {isEdit ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '180px 110px 110px 1fr 110px',
        padding: '10px 16px',
        gap: 12,
        fontSize: 12,
        borderBottom: isLast ? 'none' : '0.5px solid var(--cactus-border)',
        alignItems: 'center',
        background: 'var(--cactus-mint)',
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            name="diesel_price_min"
            type="number"
            required
            step="0.0001"
            min="0"
            max="50"
            defaultValue={initial?.diesel_price_min ?? ''}
            placeholder="min"
            style={{ ...inputStyle, width: 70, fontFamily: 'var(--font-mono)' }}
          />
          <span style={{ color: 'var(--cactus-muted)' }}>–</span>
          <input
            name="diesel_price_max"
            type="number"
            required
            step="0.0001"
            min="0"
            max="50"
            defaultValue={initial?.diesel_price_max ?? ''}
            placeholder="max"
            style={{ ...inputStyle, width: 70, fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <input
          name="fuel_per_lb"
          type="number"
          required
          step="0.000001"
          min="0"
          max="5"
          defaultValue={initial?.fuel_per_lb ?? ''}
          placeholder="$/lb"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
        />
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cactus-muted)', fontSize: 11 }}>
          {isEdit ? fmtDate(initial.effective_date) : '(active)'}
        </div>
        <input
          name="notes"
          type="text"
          defaultValue={initial?.notes ?? ''}
          placeholder="optional"
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button type="submit" style={{ ...primaryButtonStyle, padding: '4px 10px', fontSize: 11 }}>
            Save
          </button>
          <a href={ROUTE} style={{ ...cancelButtonStyle, padding: '4px 10px', fontSize: 11 }}>
            Cancel
          </a>
        </div>
      </div>
    </form>
  )
}

function Flash({ kind, msg }: { kind: string; msg: string }) {
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
        <div style={{ marginTop: 2 }}>{msg}</div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
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
  padding: '6px 12px',
  background: 'var(--cactus-forest)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
}

const cancelButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '6px 12px',
  background: 'transparent',
  color: 'var(--cactus-muted)',
  border: '0.5px solid var(--cactus-border-mid)',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  textDecoration: 'none',
}
