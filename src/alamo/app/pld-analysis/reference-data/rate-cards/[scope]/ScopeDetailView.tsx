// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/[scope]/ScopeDetailView.tsx
// PURPOSE: Client orchestrator for the committed rate-card viewer.
// Owns card-picker state and fetches per-card cells on demand.
//
// Layout:
//   - Scope header (label + aggregate counts + last upload)
//   - Metadata strip (card_version / dim_factor / effective_date /
//     source / notes — derived from the cards array; "varies by card"
//     when distinct values exceed 1)
//   - Card picker (dropdown of all cards, default first by variant
//     then service_level — same order the actions returned)
//   - Selected card cell table (CellTable shared component)
//
// The cell fetch is lazy: on selection change, call
// getCommittedCardCells(rateCardId) inside a useTransition so the
// UI shows isPending state without blocking the picker.
// ==========================================================

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Tag, Loader2, AlertCircle, Layers } from 'lucide-react'
import { CellTable } from '../CellTable'
import { getCommittedCardCells } from '../actions'
import type { ScopeKey } from '../scopes'
import type { CellRow, CommittedCardSummary } from '../types'

interface ScopeAggregate {
  cardCount: number
  cellCount: number
  lastUpload: string | null
}

interface ScopeDetailViewProps {
  scope: ScopeKey
  cards: CommittedCardSummary[]
  aggregate: ScopeAggregate
}

export function ScopeDetailView({ scope, cards, aggregate }: ScopeDetailViewProps) {
  // Default selection: first card by sort order from the action (variant
  // asc, service_level asc).
  const [selectedId, setSelectedId] = useState<string>(() => cards[0]?.id ?? '')

  const selectedCard = useMemo(
    () => cards.find(c => c.id === selectedId) ?? cards[0],
    [cards, selectedId],
  )

  const metadata = useMemo(() => deriveMetadata(cards), [cards])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ScopeHeader scope={scope} aggregate={aggregate} />
      <MetadataStrip metadata={metadata} />
      <CardPicker
        cards={cards}
        selectedId={selectedId}
        onChange={setSelectedId}
      />
      <SelectedCardCellTable
        rateCardId={selectedCard?.id ?? ''}
        cardLabel={selectedCard ? `${selectedCard.variant} · ${selectedCard.service_level}` : ''}
        cardSource={selectedCard?.source ?? null}
        cardNotes={selectedCard?.notes ?? null}
      />
    </div>
  )
}

// =====================
// Scope header
// =====================

function ScopeHeader({ scope, aggregate }: { scope: ScopeKey; aggregate: ScopeAggregate }) {
  return (
    <div>
      <div style={{
        fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)',
        letterSpacing: '-0.02em', marginBottom: 4,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Tag size={18} color="var(--cactus-forest)" />
        {scope.scope_label}
      </div>
      <div style={{ fontSize: 13, color: 'var(--cactus-muted)' }}>
        {aggregate.cardCount.toLocaleString('en-US')} card{aggregate.cardCount === 1 ? '' : 's'}
        {' · '}
        {aggregate.cellCount.toLocaleString('en-US')} cells
        {aggregate.lastUpload ? <> · last upload {fmtTimestamp(aggregate.lastUpload)}</> : null}
      </div>
    </div>
  )
}

// =====================
// Metadata strip — derived from cards array
// =====================

interface DerivedMetadata {
  cardVersion: string | { kind: 'varies' }
  dimFactor: string | { kind: 'varies' }
  effectiveDate: string | { kind: 'varies' }
  deprecatedDate: string | null | { kind: 'varies' }
  source: string | null | { kind: 'varies' }
  notes: string | null | { kind: 'varies' }
}

function deriveMetadata(cards: CommittedCardSummary[]): DerivedMetadata {
  // Returns the single distinct value across cards[] OR a 'varies' marker
  // when distinct values > 1. Treats null and string-equal values as
  // matches; numeric dim_factor compared by string-coerce for uniformity.
  function single<T extends string | number | null>(values: T[]): T | { kind: 'varies' } {
    const distinct = new Set(values.map(v => v === null ? '∅NULL∅' : String(v)))
    if (distinct.size <= 1) return values[0]
    return { kind: 'varies' }
  }
  return {
    cardVersion: single(cards.map(c => c.card_version)) as DerivedMetadata['cardVersion'],
    dimFactor: (() => {
      const v = single(cards.map(c => c.dim_factor))
      if (v !== null && typeof v === 'object' && 'kind' in v) return v
      return v === null ? '—' : String(v)
    })(),
    effectiveDate: single(cards.map(c => c.effective_date)) as DerivedMetadata['effectiveDate'],
    deprecatedDate: (() => {
      const v = single(cards.map(c => c.deprecated_date))
      if (v !== null && typeof v === 'object' && 'kind' in v) return v
      return v
    })(),
    source: (() => {
      const v = single(cards.map(c => c.source))
      if (v !== null && typeof v === 'object' && 'kind' in v) return v
      return v
    })(),
    notes: (() => {
      const v = single(cards.map(c => c.notes))
      if (v !== null && typeof v === 'object' && 'kind' in v) return v
      return v
    })(),
  }
}

function MetadataStrip({ metadata }: { metadata: DerivedMetadata }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 8,
      fontSize: 12,
      display: 'flex', flexWrap: 'wrap', gap: 14,
      alignItems: 'baseline',
    }}>
      <MetaField label="Card version" value={metadata.cardVersion} />
      <Sep />
      <MetaField label="Dim factor" value={metadata.dimFactor} />
      <Sep />
      <MetaField label="Effective" value={metadata.effectiveDate} />
      {metadata.deprecatedDate !== null ? (
        <>
          <Sep />
          <MetaField label="Deprecated" value={metadata.deprecatedDate} />
        </>
      ) : null}
      <div style={{ flexBasis: '100%', height: 0 }} />
      <MetaField label="Source" value={metadata.source} wide />
      {metadata.notes !== null ? (
        <>
          <Sep />
          <MetaField label="Notes" value={metadata.notes} wide />
        </>
      ) : null}
    </div>
  )
}

function MetaField({
  label, value, wide,
}: {
  label: string
  value: string | { kind: 'varies' } | null
  wide?: boolean
}) {
  let display: React.ReactNode
  let muted = false
  if (value === null) {
    display = '—'
    muted = true
  } else if (typeof value === 'object') {
    display = 'varies by card'
    muted = true
  } else {
    display = value
  }
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      ...(wide ? { minWidth: 0, flex: '1 1 auto' } : null),
    }}>
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>{label}</span>
      <span style={{
        fontSize: 13, fontWeight: 500,
        color: muted ? 'var(--cactus-hint)' : 'var(--cactus-ink)',
        ...(wide ? {
          minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        } : null),
      }} title={typeof display === 'string' ? display : undefined}>{display}</span>
    </div>
  )
}

function Sep() {
  return <span style={{ width: 1, height: 14, background: 'var(--cactus-border)', alignSelf: 'center' }} />
}

// =====================
// Card picker
// =====================

function CardPicker({
  cards, selectedId, onChange,
}: {
  cards: CommittedCardSummary[]
  selectedId: string
  onChange: (id: string) => void
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
        value={selectedId}
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
        {cards.map(c => (
          <option key={c.id} value={c.id}>
            {c.variant} · {c.service_level}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>
        ({cards.length} card{cards.length === 1 ? '' : 's'})
      </span>
    </div>
  )
}

// =====================
// Selected card cell table
// =====================

function SelectedCardCellTable({
  rateCardId, cardLabel, cardSource, cardNotes,
}: {
  rateCardId: string
  cardLabel: string
  cardSource: string | null
  cardNotes: string | null
}) {
  const [cells, setCells] = useState<CellRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!rateCardId) return
    startTransition(async () => {
      try {
        const result = await getCommittedCardCells(rateCardId)
        setCells(result)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setCells(null)
      }
    })
  }, [rateCardId])

  if (isPending && !cells && !error) {
    return (
      <div style={{ ...cardWrapperStyle, display: 'flex', alignItems: 'center', gap: 8, padding: 18 }}>
        <Loader2 size={14} color="var(--cactus-muted)" style={{ animation: 'spin 0.9s linear infinite' }} />
        <span style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>Loading card cells…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ ...cardWrapperStyle, display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14 }}>
        <AlertCircle size={14} color="var(--cactus-bloom-deep)" />
        <span style={{ fontSize: 12, color: 'var(--cactus-bloom-deep)' }}>{error}</span>
      </div>
    )
  }

  if (!cells || cells.length === 0) return null

  return (
    <div style={cardWrapperStyle}>
      <div style={{ padding: 14, borderBottom: '0.5px solid var(--cactus-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Layers size={13} color="var(--cactus-forest)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            {cardLabel}
          </span>
        </div>
        {(cardSource || cardNotes) ? (
          <div style={{ fontSize: 11, color: 'var(--cactus-muted)' }}>
            {cardSource ? <>Source: {cardSource}</> : null}
            {cardSource && cardNotes ? ' · ' : null}
            {cardNotes ? <>Notes: {cardNotes}</> : null}
          </div>
        ) : null}
      </div>
      <CellTable cells={cells} />
    </div>
  )
}

// =====================
// Helpers
// =====================

function fmtTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

const cardWrapperStyle: React.CSSProperties = {
  background: 'var(--cactus-canvas)',
  border: '0.5px solid var(--cactus-border)',
  borderRadius: 10,
  overflow: 'hidden',
}
