// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/StagePreviewTable.tsx
// PURPOSE: Stage preview UI rendered when a parse succeeds. Three
// stacked sections:
//   1. Aggregate sanity bar (counts + alarms in Bloom on unknowns)
//   2. Card-picker dropdown (126 (DC, Product) pairs, default first alpha)
//   3. Selected card preview — pivot of weight × 11 zones, lazy-loaded
//      via getStagedCardCells Server Action
//
// Plus Cancel + Commit form-buttons at the bottom.
//
// On Cancel: posts to cancelDhlEcomStage which deletes the staged session
//   and redirects with an info flash. Page reloads, useActionState in
//   UploaderPanel resets to idle, file picker shows again.
// On Commit: posts to commitDhlEcomRateCard which calls the v1.10.0-030
//   RPC, revalidates the page + index, and redirects with a success
//   flash citing the inserted card / cell counts.
// ==========================================================

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CheckCircle2, AlertCircle, X, Loader2, Layers } from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import {
  commitDhlEcomRateCard,
  cancelDhlEcomStage,
  getStagedCardCells,
} from './actions'
import type {
  ParseSummary,
  StagedCardDetail,
} from './types'

// 11 output zones in render order (matches the parser's expansion).
const OUTPUT_ZONES = [
  'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5',
  'Zone 6', 'Zone 7', 'Zone 8', 'Zone 11', 'Zone 12', 'Zone 13',
] as const

// (Removed EXPECTED_NULL_ZONES soft-de-alarm. Per Pause 3 patch:
// any non-zero null count gets the Bloom alarm color. The 2,160 nulls
// from DHL Domestic v1 are intentional — Expedited Max doesn't ship
// to AK/HI/PR/territories so its Zone 11/12/13 columns are all null —
// but the alarm still fires because nulls are notable. The breakdown
// subtext shows where they live so the operator can confirm.)

interface StagePreviewTableProps {
  uploadSessionId: string
  summary: ParseSummary
}

export function StagePreviewTable({
  uploadSessionId, summary,
}: StagePreviewTableProps) {
  // 126 (DC, Product) pairs sorted by DC then Product
  const allPairs = useMemo(() => {
    const dcs = Object.keys(summary.cardsByDc).sort()
    const products = Object.keys(summary.cardsByProduct).sort()
    const pairs: Array<{ dc: string; product: string; key: string }> = []
    for (const dc of dcs) {
      for (const product of products) {
        pairs.push({ dc, product, key: `${dc}|${product}` })
      }
    }
    return pairs
  }, [summary])

  const [selectedKey, setSelectedKey] = useState<string>(() => allPairs[0]?.key ?? '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      <AggregateSanityBar summary={summary} />
      <CardPicker pairs={allPairs} selectedKey={selectedKey} onChange={setSelectedKey} />
      <SelectedCardPreview
        uploadSessionId={uploadSessionId}
        selectedKey={selectedKey}
        sourceFromSummary={summary.sourceFilename}
      />
      <ReplicationNote />
      <ActionButtons uploadSessionId={uploadSessionId} totalCards={summary.totalCards} totalCells={summary.totalCells} />
    </div>
  )
}

// =====================
// Aggregate sanity bar
// =====================

function AggregateSanityBar({ summary }: { summary: ParseSummary }) {
  const nullCount = Object.values(summary.nullCellsByZone).reduce((a, b) => a + b, 0)
  const unknownDcAlarm = summary.unknownDcs.length > 0
  const unknownProdAlarm = summary.unknownProducts.length > 0
  const nullAlarm = nullCount > 0

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
      padding: '10px 14px',
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 8,
      fontSize: 12,
    }}>
      <Stat label="Cards staged" value={summary.totalCards.toLocaleString('en-US')} />
      <Sep />
      <Stat label="Cells" value={summary.totalCells.toLocaleString('en-US')} />
      <Sep />
      <Stat
        label="Null rates"
        value={nullCount.toLocaleString('en-US')}
        alarm={nullAlarm}
        subtext={nullCount > 0 ? `(${zoneBreakdown(summary.nullCellsByZone)})` : undefined}
      />
      <Sep />
      <Stat label="Unknown DCs" value={summary.unknownDcs.length} alarm={unknownDcAlarm} />
      <Sep />
      <Stat label="Unknown products" value={summary.unknownProducts.length} alarm={unknownProdAlarm} />
    </div>
  )
}

function zoneBreakdown(byZone: Record<string, number>): string {
  return Object.entries(byZone)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => OUTPUT_ZONES.indexOf(a as typeof OUTPUT_ZONES[number]) - OUTPUT_ZONES.indexOf(b as typeof OUTPUT_ZONES[number]))
    .map(([z, n]) => `${n} in ${z}`)
    .join(', ')
}

function Stat({
  label, value, alarm, subtext,
}: {
  label: string
  value: string | number
  alarm?: boolean
  subtext?: string
}) {
  const color = alarm ? 'var(--cactus-bloom-deep)' : 'var(--cactus-ink)'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color }}>{value}</span>
      {subtext ? (
        <span style={{ fontSize: 11, color: alarm ? 'var(--cactus-bloom-deep)' : 'var(--cactus-muted)' }}>
          {subtext}
        </span>
      ) : null}
    </div>
  )
}

function Sep() {
  return <span style={{ width: 1, height: 16, background: 'var(--cactus-border)' }} />
}

// =====================
// Card picker
// =====================

interface PickerPair {
  dc: string
  product: string
  key: string
}

function CardPicker({
  pairs, selectedKey, onChange,
}: {
  pairs: PickerPair[]
  selectedKey: string
  onChange: (k: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '10px 14px',
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 8,
    }}>
      <label style={{
        fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
      }}>View card</label>
      <select
        value={selectedKey}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '6px 8px',
          background: 'var(--cactus-canvas)',
          border: '0.5px solid var(--cactus-border-mid)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--cactus-ink)',
          fontFamily: 'var(--font-sans)',
          minWidth: 280,
        }}
      >
        {pairs.map(p => (
          <option key={p.key} value={p.key}>
            {p.dc} · {p.product}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>
        ({pairs.length} cards available)
      </span>
    </div>
  )
}

// =====================
// Selected card preview (lazy-loaded via getStagedCardCells)
// =====================

function SelectedCardPreview({
  uploadSessionId, selectedKey, sourceFromSummary,
}: {
  uploadSessionId: string
  selectedKey: string
  sourceFromSummary: string
}) {
  const [detail, setDetail] = useState<StagedCardDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!selectedKey) return
    const [variant, service_level] = selectedKey.split('|')
    // setState calls live inside startTransition's async callback (not the
    // effect body itself) — keeps the react-hooks/set-state-in-effect rule
    // satisfied while still updating UI on fetch resolution.
    startTransition(async () => {
      const result = await getStagedCardCells(uploadSessionId, variant, service_level)
      if (result.ok) {
        setDetail(result.detail)
        setError(null)
      } else {
        setError(result.error)
        setDetail(null)
      }
    })
  }, [uploadSessionId, selectedKey])

  // First load (no detail yet, fetch in flight) → loading skeleton
  if (isPending && !detail && !error) {
    return (
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8, padding: 18 }}>
        <Loader2 size={14} color="var(--cactus-muted)" style={{ animation: 'spin 0.9s linear infinite' }} />
        <span style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>Loading card cells…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14 }}>
        <AlertCircle size={14} color="var(--cactus-bloom-deep)" />
        <span style={{ fontSize: 12, color: 'var(--cactus-bloom-deep)' }}>{error}</span>
      </div>
    )
  }

  if (!detail) return null

  return <CellTable detail={detail} sourceFromSummary={sourceFromSummary} />
}

function CellTable({ detail, sourceFromSummary }: { detail: StagedCardDetail; sourceFromSummary: string }) {
  // Pivot: group cells by (weight_value, weight_unit), then for each row
  // collect the 11-zone rate map. Sort rows by unit (oz before lb) then
  // weight ascending — mirrors the actions.ts compareCells comparator
  // so server-fetch order and client-pivot order agree.
  const rows = useMemo(() => {
    const byWeight = new Map<string, { weight_value: number; weight_unit: string; cells: Map<string, number | null> }>()
    for (const c of detail.cells) {
      const wkey = `${c.weight_unit}|${c.weight_value}`
      let r = byWeight.get(wkey)
      if (!r) {
        r = { weight_value: c.weight_value, weight_unit: c.weight_unit, cells: new Map() }
        byWeight.set(wkey, r)
      }
      r.cells.set(c.zone, c.rate)
    }
    const unitRank = (u: string) => (u === 'oz' ? 0 : u === 'lb' ? 1 : 99)
    return [...byWeight.values()].sort((a, b) => {
      const u = unitRank(a.weight_unit) - unitRank(b.weight_unit)
      if (u !== 0) return u
      return a.weight_value - b.weight_value
    })
  }, [detail])

  return (
    <div style={cardStyle}>
      <div style={{ padding: 14, borderBottom: '0.5px solid var(--cactus-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Layers size={13} color="var(--cactus-forest)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            {detail.variant} · {detail.service_level}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--cactus-muted)' }}>
          Source: {detail.source ?? sourceFromSummary}
          {detail.notes ? ` · Notes: ${detail.notes}` : null}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: 12,
          fontFamily: 'var(--font-sans)',
        }}>
          <thead>
            <tr>
              <th style={thStyle}>Weight</th>
              {OUTPUT_ZONES.map(z => (
                <th key={z} style={{ ...thStyle, textAlign: 'right' }}>{z}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={`${r.weight_value}|${r.weight_unit}`} style={{
                background: idx % 2 === 0 ? 'transparent' : 'var(--cactus-sand)',
              }}>
                <td style={{ ...tdStyle, color: 'var(--cactus-muted)' }}>
                  {r.weight_value} {r.weight_unit}
                </td>
                {OUTPUT_ZONES.map(z => {
                  const v = r.cells.get(z)
                  if (v === null || v === undefined) {
                    return <td key={z} style={{ ...tdStyle, textAlign: 'right', color: 'var(--cactus-hint)' }}>—</td>
                  }
                  return <td key={z} style={{ ...tdStyle, textAlign: 'right' }}>${v.toFixed(2)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// =====================
// Replication confirmation note
// =====================

function ReplicationNote() {
  return (
    <div style={{
      fontSize: 11, color: 'var(--cactus-muted)',
      padding: '8px 12px',
      lineHeight: 1.55,
    }}>
      Visual confirmation: Zone 1 == Zone 2 (replicated from source &ldquo;Zone 1&amp;2&rdquo;),
      Zone 11 == Zone 12 == Zone 13 (replicated from source &ldquo;Zone 11-13&rdquo;).
      For SLC, Zone 11 / 12 / 13 render as &ldquo;—&rdquo; (DHL placeholder pending the over-1lb update).
    </div>
  )
}

// =====================
// Action buttons (Cancel + Commit, each in its own form)
// =====================

function ActionButtons({
  uploadSessionId, totalCards, totalCells,
}: {
  uploadSessionId: string
  totalCards: number
  totalCells: number
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
      <form action={cancelDhlEcomStage}>
        <input type="hidden" name="upload_session_id" value={uploadSessionId} />
        <SubmitButton style={cancelButtonStyle} pendingLabel="Discarding…">
          <X size={12} />
          Cancel (discard staged data)
        </SubmitButton>
      </form>

      <div style={{ flex: 1 }} />

      <form action={commitDhlEcomRateCard}>
        <input type="hidden" name="upload_session_id" value={uploadSessionId} />
        <SubmitButton
          style={commitButtonStyle}
          pendingLabel={`Committing ${totalCards.toLocaleString('en-US')} cards…`}
        >
          <CheckCircle2 size={12} />
          Commit {totalCards.toLocaleString('en-US')} rate cards · {totalCells.toLocaleString('en-US')} cells
        </SubmitButton>
      </form>
    </div>
  )
}

// =====================
// Styles
// =====================

const cardStyle: React.CSSProperties = {
  background: 'var(--cactus-canvas)',
  border: '0.5px solid var(--cactus-border)',
  borderRadius: 10,
  overflow: 'hidden',
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 10, fontWeight: 500,
  color: 'var(--cactus-muted)',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  textAlign: 'left',
  borderBottom: '0.5px solid var(--cactus-border)',
  background: 'var(--cactus-sand)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '0.5px solid var(--cactus-border)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

const cancelButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--cactus-muted)',
  border: '0.5px solid var(--cactus-border-mid)',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const commitButtonStyle: React.CSSProperties = {
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
