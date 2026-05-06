// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/UploaderPanel.tsx
// PURPOSE: Per-mode (and for GOFO, per-fulfillment) rate-card uploader.
//
// Owns its own useActionState hook so each panel instance carries
// independent file/notes/error state. For GOFO modes the parent
// renders two of these side-by-side (Pickup + Dropoff); each posts
// to the same Server Action stub but with its own fulfillment_mode.
//
// PAUSE 2 SCOPE: file picker + notes textarea + Parse button +
// inline error display. The Server Action returns a "parser not yet
// implemented" message; no staging writes, no preview, no commit.
// ==========================================================

'use client'

import { useActionState, useId, useState } from 'react'
import { Upload, AlertCircle } from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import { parseRateCardStub } from './actions'
import { initialParseStubState, type ParseStubState } from './types'
import type { FulfillmentMode, ModeTab } from './scopes'

const NOTES_MAX_CHARS = 500

interface UploaderPanelProps {
  mode: ModeTab
  /** Required for GOFO modes; omitted for DHL Domestic (which has
   *  fulfillment_mode='na' on the underlying scope). */
  fulfillment_mode?: Exclude<FulfillmentMode, 'na'>
  /** Heading shown above the file picker. e.g. "Pickup" / "Dropoff" /
   *  "DHL eCom Domestic rate card". */
  panelLabel: string
}

export function UploaderPanel({ mode, fulfillment_mode, panelLabel }: UploaderPanelProps) {
  const [state, formAction] = useActionState<ParseStubState, FormData>(
    parseRateCardStub,
    initialParseStubState,
  )
  const fileId = useId()
  const notesId = useId()

  const [hasFile, setHasFile] = useState(false)
  const [notesLen, setNotesLen] = useState(0)

  return (
    <div style={panelStyle}>
      <div style={panelHeadingStyle}>
        <Upload size={14} color="var(--cactus-forest)" />
        {panelLabel}
      </div>

      <form action={formAction} key={`${mode}-${fulfillment_mode ?? 'na'}`}>
        {/* Hidden inputs carry mode context for the Pause-3 parser dispatch */}
        <input type="hidden" name="mode" value={mode} />
        {fulfillment_mode ? (
          <input type="hidden" name="fulfillment_mode" value={fulfillment_mode} />
        ) : null}

        <div style={{ marginBottom: 10 }}>
          <label htmlFor={fileId} style={labelStyle}>Source workbook (.xlsx)</label>
          <input
            id={fileId}
            name="file"
            type="file"
            accept=".xlsx"
            required
            onChange={e => setHasFile(e.target.files !== null && e.target.files.length > 0)}
            style={{
              ...inputStyle,
              border: '0.5px dashed var(--cactus-border-mid)',
              padding: '7px 10px',
            }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor={notesId} style={labelStyle}>
            Notes <span style={{ textTransform: 'none', color: 'var(--cactus-hint)', letterSpacing: 0 }}>
              ({notesLen} / {NOTES_MAX_CHARS})
            </span>
          </label>
          <textarea
            id={notesId}
            name="notes"
            maxLength={NOTES_MAX_CHARS}
            rows={3}
            placeholder="Optional context — e.g., 'v1 placeholder pending DHL SLC over-1lb update'"
            onChange={e => setNotesLen(e.target.value.length)}
            style={{
              ...inputStyle,
              resize: 'vertical',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        <SubmitButton
          style={{
            ...primaryButtonStyle,
            background: hasFile ? 'var(--cactus-forest)' : 'var(--cactus-hint)',
            cursor: hasFile ? 'pointer' : 'not-allowed',
          }}
          disabled={!hasFile}
          pendingLabel="Parsing…"
        >
          <Upload size={12} />
          Parse
        </SubmitButton>

        {state.status === 'error' && state.error ? (
          <div style={errorBoxStyle}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{state.error}</div>
          </div>
        ) : null}
      </form>
    </div>
  )
}

// =====================
// Styles
// =====================

const panelStyle: React.CSSProperties = {
  background: 'var(--cactus-canvas)',
  border: '0.5px solid var(--cactus-border)',
  borderRadius: 10,
  padding: 18,
  flex: '1 1 0',
  minWidth: 0,
}

const panelHeadingStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 500, color: 'var(--cactus-ink)',
  marginBottom: 10,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10, fontWeight: 500,
  color: 'var(--cactus-muted)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginBottom: 4,
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
  boxSizing: 'border-box',
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  fontFamily: 'inherit',
}

const errorBoxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
  marginTop: 10,
  padding: '8px 10px',
  background: 'var(--cactus-bloom-bg)',
  border: '0.5px solid var(--cactus-bloom-border)',
  borderRadius: 6,
  fontSize: 11,
  color: 'var(--cactus-bloom-deep)',
  lineHeight: 1.55,
}
