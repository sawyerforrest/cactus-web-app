// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/CellTable.tsx
// PURPOSE: Shared rate-card cell table — pivot of weight × 11 zones with
// the territory-zone visual treatment (Zones 11-13 muted at 60% opacity,
// 0.5px ink-at-20% divider into Zone 11).
//
// Used by:
//   - StagePreviewTable (Pause 3 stage preview, pre-commit)
//   - ScopeDetailView   (Pause 3.5 committed-card viewer)
//
// Accepts an already-sorted cells[] (caller is responsible for ordering
// via actions.ts:compareCells — oz before lb, then weight asc, then zone
// asc). Pivots into rows keyed by (weight_unit, weight_value); within
// each row, the 11 OUTPUT_ZONES columns are looked up from the row's
// cell map. Missing zone → renders "—". Caller wraps with its own card +
// header — this component renders only the scrollable-table region.
// ==========================================================

'use client'

import { useMemo } from 'react'
import type { CellRow } from './types'

// 11 output zones in render order. DHL's parser emits all 11 (replicating
// Zone 1&2 → 1,2 and Zone 11-13 → 11,12,13). GOFO previews — when those
// parsers come online — will only populate Zones 1-8; the 11/12/13 columns
// here will simply render "—" for every row, which is the right default
// (and the territory-zone visual treatment becomes a no-op since GOFO has
// no extended-zone semantics).
const OUTPUT_ZONES = [
  'Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5',
  'Zone 6', 'Zone 7', 'Zone 8', 'Zone 11', 'Zone 12', 'Zone 13',
] as const

const isExtendedZone = (zone: string): boolean => {
  const num = parseInt(zone.replace(/^Zone\s+/, ''), 10)
  return Number.isFinite(num) && num >= 11
}
const isFirstExtendedZone = (zone: string): boolean => zone === 'Zone 11'

const EXTENDED_DIVIDER = '0.5px solid rgba(13, 18, 16, 0.2)'

interface CellTableProps {
  cells: CellRow[]
}

export function CellTable({ cells }: CellTableProps) {
  // Pivot: group cells by (weight_value, weight_unit) → 11-zone rate map
  // keyed by zone string. Caller is expected to have sorted via
  // actions.ts:compareCells; preserve that order via Map insertion +
  // a defensive sort to handle the unsorted-caller case as well.
  const rows = useMemo(() => {
    const byWeight = new Map<string, { weight_value: number; weight_unit: string; cells: Map<string, number | null> }>()
    for (const c of cells) {
      const unit = c.weight_unit.toLowerCase()
      const wkey = `${unit}|${c.weight_value}`
      let r = byWeight.get(wkey)
      if (!r) {
        r = { weight_value: c.weight_value, weight_unit: unit, cells: new Map() }
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
  }, [cells])

  return (
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
            {OUTPUT_ZONES.map(z => {
              const ext = isExtendedZone(z)
              const firstExt = isFirstExtendedZone(z)
              return (
                <th key={z} style={{
                  ...thStyle,
                  textAlign: 'right',
                  ...(ext ? { opacity: 0.6 } : null),
                  ...(firstExt ? { borderLeft: EXTENDED_DIVIDER } : null),
                }}>{z}</th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.weight_unit}|${r.weight_value}`} style={{
              background: idx % 2 === 0 ? 'transparent' : 'var(--cactus-sand)',
            }}>
              <td style={{ ...tdStyle, color: 'var(--cactus-muted)' }}>
                {r.weight_value} {r.weight_unit}
              </td>
              {OUTPUT_ZONES.map(z => {
                const v = r.cells.get(z)
                const ext = isExtendedZone(z)
                const firstExt = isFirstExtendedZone(z)
                if (v === null || v === undefined) {
                  return (
                    <td key={z} style={{
                      ...tdStyle,
                      textAlign: 'right',
                      color: 'var(--cactus-hint)',
                      ...(firstExt ? { borderLeft: EXTENDED_DIVIDER } : null),
                    }}>—</td>
                  )
                }
                return (
                  <td key={z} style={{
                    ...tdStyle,
                    textAlign: 'right',
                    ...(ext ? { opacity: 0.6 } : null),
                    ...(firstExt ? { borderLeft: EXTENDED_DIVIDER } : null),
                  }}>${v.toFixed(2)}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =====================
// Styles
// =====================

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
