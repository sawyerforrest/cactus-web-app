// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/RateCardsParser.tsx
// PURPOSE: Client-side orchestrator for the Rate Cards screen. Owns
// mode-tab state and renders the StatusCards row + the active mode's
// uploader configuration.
//
// Mode tab → uploader layout:
//   - DHL eCom Domestic   → 1 panel (fulfillment_mode='na' on the
//                                    underlying scope)
//   - GOFO Standard       → 2 panels side-by-side (Pickup + Dropoff)
//   - GOFO Regional       → 2 panels side-by-side (Pickup + Dropoff)
//
// The mode-tab selector is implemented inline here, mirroring the
// ServiceTabs pair in zone-matrices/UploadForm.tsx. Promoting to a
// shared component is deferred until a third use site emerges
// (currently zone-matrices uses 2 tabs; this screen uses 3 — different
// tab contents, so a shared component would either be too generic or
// require both screens to refactor in the same pause).
// ==========================================================

'use client'

import { useState } from 'react'
import { Layers } from 'lucide-react'
import { StatusCards } from './StatusCards'
import { UploaderPanel } from './UploaderPanel'
import type { ModeTab } from './scopes'
import type { StatusAggregateRow } from './types'

interface RateCardsParserProps {
  statusRows: StatusAggregateRow[]
}

export function RateCardsParser({ statusRows }: RateCardsParserProps) {
  const [mode, setMode] = useState<ModeTab>('dhl-ecom-domestic')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatusCards statusRows={statusRows} />

      <ModeTabs active={mode} onChange={setMode} />

      <UploaderArea mode={mode} />
    </div>
  )
}

// =====================
// Mode tabs (inline — see file header on shared-component deferral)
// =====================

function ModeTabs({
  active, onChange,
}: { active: ModeTab; onChange: (m: ModeTab) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 4,
      width: 'fit-content',
    }}>
      <Tab
        active={active === 'dhl-ecom-domestic'}
        onClick={() => onChange('dhl-ecom-domestic')}
        label="DHL eCom Domestic"
        sublabel="1 panel · auto fulfillment"
      />
      <Tab
        active={active === 'gofo-standard'}
        onClick={() => onChange('gofo-standard')}
        label="GOFO Standard"
        sublabel="2 panels · pickup + dropoff"
      />
      <Tab
        active={active === 'gofo-regional'}
        onClick={() => onChange('gofo-regional')}
        label="GOFO Regional"
        sublabel="2 panels · pickup + dropoff"
      />
    </div>
  )
}

function Tab({
  active, onClick, label, sublabel,
}: {
  active: boolean
  onClick: () => void
  label: string
  sublabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: active ? 'var(--cactus-forest)' : 'transparent',
        color: active ? '#fff' : 'var(--cactus-muted)',
        border: 'none',
        borderRadius: 7,
        fontSize: 12, fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      <Layers size={13} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div style={{
          fontSize: 10, fontWeight: 400,
          color: active ? 'rgba(255,255,255,0.75)' : 'var(--cactus-hint)',
        }}>{sublabel}</div>
      </div>
    </button>
  )
}

// =====================
// Uploader area — switches based on active mode
// =====================

function UploaderArea({ mode }: { mode: ModeTab }) {
  if (mode === 'dhl-ecom-domestic') {
    return (
      <div style={{ display: 'flex' }}>
        <UploaderPanel
          mode="dhl-ecom-domestic"
          panelLabel="DHL eCom Domestic rate card"
        />
      </div>
    )
  }

  // Both GOFO modes render two panels side-by-side
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: 12,
    }}>
      <UploaderPanel mode={mode} fulfillment_mode="pickup" panelLabel="Pickup" />
      <UploaderPanel mode={mode} fulfillment_mode="dropoff" panelLabel="Dropoff" />
    </div>
  )
}
