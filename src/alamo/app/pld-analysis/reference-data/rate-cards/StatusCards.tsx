// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/StatusCards.tsx
// PURPOSE: Render the at-a-glance row of 5 status cards — one per
// canonical scope. Cards always render in the canonical RATE_CARD_SCOPES
// order regardless of which mode tab is active.
//
// Loaded vs not-loaded rule:
//   - Match found in statusRows (by scope tuple) → "loaded" card with
//     rate_card_count, cell_count, variant_count, most_recent_upload,
//     and source filename.
//   - No match → "not loaded" card (outlined, no fill) showing only the
//     scope label.
//
// Per Cactus design system § "Mono font is for tracking numbers and
// unique identifiers ONLY — don't use it for the scope labels, status
// counts, or uploader copy" — counts here render in the default sans
// body font, not mono. (Diverges from prior 2b screens which did use
// mono for counts; the spec explicitly calls out the rule for this
// screen.)
// ==========================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import { RATE_CARD_SCOPES, isSameScope, type ScopeKey } from './scopes'
import { getScopeSegment } from './scope-segments'
import type { StatusAggregateRow } from './types'

interface StatusCardsProps {
  statusRows: StatusAggregateRow[]
}

export function StatusCards({ statusRows }: StatusCardsProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 10,
    }}>
      {RATE_CARD_SCOPES.map(scope => {
        const row = statusRows.find(r => isSameScope(scope, r))
        return row ? (
          <LoadedCard key={cardKey(scope)} scope={scope} row={row} />
        ) : (
          <NotLoadedCard key={cardKey(scope)} scope={scope} />
        )
      })}
    </div>
  )
}

function cardKey(scope: ScopeKey): string {
  return `${scope.carrier_code}|${scope.service_level_group ?? 'null'}|${scope.fulfillment_mode}`
}

function NotLoadedCard({ scope }: { scope: ScopeKey }) {
  return (
    <div style={{
      ...cardStyle,
      background: 'transparent',
    }}>
      <div style={cardLabelRowStyle}>
        <Circle size={11} color="var(--cactus-amber-text)" />
        <span style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--cactus-amber-text)',
        }}>not loaded</span>
      </div>
      <div style={scopeLabelStyle}>{scope.scope_label}</div>
      <div style={{ fontSize: 11, color: 'var(--cactus-hint)', marginTop: 6 }}>
        Upload a rate-card workbook below.
      </div>
    </div>
  )
}

function LoadedCard({ scope, row }: { scope: ScopeKey; row: StatusAggregateRow }) {
  const [hover, setHover] = useState(false)
  const segment = getScopeSegment(scope)
  return (
    <Link
      href={`/pld-analysis/reference-data/rate-cards/${segment}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...cardStyle,
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
        borderColor: hover ? 'var(--cactus-forest)' : 'var(--cactus-border)',
        transition: 'border-color 0.12s ease',
      }}
    >
      <div style={cardLabelRowStyle}>
        <CheckCircle2 size={11} color="var(--cactus-forest)" />
        <span style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--cactus-forest)',
        }}>loaded</span>
      </div>
      <div style={scopeLabelStyle}>{scope.scope_label}</div>
      <div style={{ fontSize: 12, color: 'var(--cactus-slate)', marginTop: 6, lineHeight: 1.6 }}>
        <div>
          {row.rate_card_count.toLocaleString('en-US')} card{row.rate_card_count === 1 ? '' : 's'}
          {' · '}
          {row.cell_count.toLocaleString('en-US')} cells
        </div>
        {row.variant_count > 0 ? (
          <div style={{ color: 'var(--cactus-muted)' }}>
            {row.variant_count} variant{row.variant_count === 1 ? '' : 's'}
          </div>
        ) : null}
        {row.most_recent_upload ? (
          <div style={{ fontSize: 11, color: 'var(--cactus-muted)' }}>
            Last upload {fmtTimestamp(row.most_recent_upload)}
          </div>
        ) : null}
        {row.source ? (
          <div style={{
            fontSize: 11, color: 'var(--cactus-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={row.source}>
            {row.source}
          </div>
        ) : null}
      </div>
    </Link>
  )
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

// =====================
// Styles
// =====================

const cardStyle: React.CSSProperties = {
  background: 'var(--cactus-canvas)',
  border: '0.5px solid var(--cactus-border)',
  borderRadius: 10,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
}

const cardLabelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginBottom: 6,
}

const scopeLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--cactus-ink)',
  letterSpacing: '-0.01em',
}
