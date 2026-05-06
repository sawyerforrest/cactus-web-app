// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/rate-cards/UploaderPanel.tsx
// PURPOSE: Per-mode rate-card uploader. Two exported variants:
//
//   StubUploaderPanel — Pause 2 carry-over for GOFO modes. Posts to
//     parseRateCardStub which returns "parser not yet implemented"
//     until Pauses 4 / 5 wire the GOFO parsers. Identical UI to Pause 2.
//
//   DhlUploaderPanel — Pause 3 wired uploader for DHL Domestic. Posts to
//     parseDhlEcomRateCard. On status='parsed' renders the
//     StagePreviewTable below the form (which itself owns the Cancel +
//     Commit forms). On status='error' renders the inline error.
//
// Each panel instance owns its own useActionState hook so file/notes
// state is independent across panels (relevant for GOFO modes which
// render two side-by-side panels for Pickup + Dropoff).
//
// RateCardsParser dispatches: DHL mode → one DhlUploaderPanel; GOFO
// modes → two StubUploaderPanels.
// ==========================================================

'use client'

import { useActionState, useId, useState } from 'react'
import { Upload, AlertCircle } from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import {
  parseRateCardStub,
  parseDhlEcomRateCard,
} from './actions'
import {
  initialParseState,
  initialParseStubState,
  type ParseState,
  type ParseStubState,
} from './types'
import type { FulfillmentMode, ModeTab } from './scopes'
import { StagePreviewTable } from './StagePreviewTable'

const NOTES_MAX_CHARS = 500

// =====================
// Stub uploader (GOFO modes — Pause 2 holdover)
// =====================

interface StubUploaderPanelProps {
  mode: Exclude<ModeTab, 'dhl-ecom-domestic'>
  fulfillment_mode: Exclude<FulfillmentMode, 'na'>
  panelLabel: string
}

export function StubUploaderPanel({ mode, fulfillment_mode, panelLabel }: StubUploaderPanelProps) {
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

      <form action={formAction} key={`${mode}-${fulfillment_mode}`}>
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="fulfillment_mode" value={fulfillment_mode} />

        <FileInput id={fileId} onHasFileChange={setHasFile} />
        <NotesInput id={notesId} onLenChange={setNotesLen} length={notesLen} />

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

        {state.status === 'error' && state.error ? <ErrorBox message={state.error} /> : null}
      </form>
    </div>
  )
}

// =====================
// DHL uploader — Pause 3 wired
// =====================

export function DhlUploaderPanel() {
  const [state, formAction] = useActionState<ParseState, FormData>(
    parseDhlEcomRateCard,
    initialParseState,
  )
  const fileId = useId()
  const notesId = useId()

  const [hasFile, setHasFile] = useState(false)
  const [notesLen, setNotesLen] = useState(0)

  // Once parsed, render the preview table below the form. The form is
  // intentionally still rendered (disabled visually by leaving it idle)
  // so the panel header context stays put — but cancel/commit happen
  // inside StagePreviewTable, not on this form.
  if (state.status === 'parsed') {
    return (
      <div style={panelStyleWide}>
        <div style={panelHeadingStyle}>
          <Upload size={14} color="var(--cactus-forest)" />
          DHL eCom Domestic — preview staged
        </div>
        <StagePreviewTable
          uploadSessionId={state.uploadSessionId}
          summary={state.summary}
        />
      </div>
    )
  }

  return (
    <div style={panelStyleWide}>
      <div style={panelHeadingStyle}>
        <Upload size={14} color="var(--cactus-forest)" />
        DHL eCom Domestic rate card
      </div>

      <form action={formAction}>
        <input type="hidden" name="mode" value="dhl-ecom-domestic" />

        <FileInput id={fileId} onHasFileChange={setHasFile} />
        <NotesInput id={notesId} onLenChange={setNotesLen} length={notesLen} />

        <SubmitButton
          style={{
            ...primaryButtonStyle,
            background: hasFile ? 'var(--cactus-forest)' : 'var(--cactus-hint)',
            cursor: hasFile ? 'pointer' : 'not-allowed',
          }}
          disabled={!hasFile}
          pendingLabel="Parsing 18 DCs × 7 products…"
        >
          <Upload size={12} />
          Parse
        </SubmitButton>

        {state.status === 'error' ? <ErrorBox message={state.error} /> : null}
      </form>
    </div>
  )
}

// =====================
// Shared form sub-components
// =====================

function FileInput({ id, onHasFileChange }: { id: string; onHasFileChange: (b: boolean) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={labelStyle}>Source workbook (.xlsx)</label>
      <input
        id={id}
        name="file"
        type="file"
        accept=".xlsx"
        required
        onChange={e => onHasFileChange(e.target.files !== null && e.target.files.length > 0)}
        style={{
          ...inputStyle,
          border: '0.5px dashed var(--cactus-border-mid)',
          padding: '7px 10px',
        }}
      />
    </div>
  )
}

function NotesInput({ id, length, onLenChange }: { id: string; length: number; onLenChange: (n: number) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={id} style={labelStyle}>
        Notes <span style={{ textTransform: 'none', color: 'var(--cactus-hint)', letterSpacing: 0 }}>
          ({length} / {NOTES_MAX_CHARS})
        </span>
      </label>
      <textarea
        id={id}
        name="notes"
        maxLength={NOTES_MAX_CHARS}
        rows={3}
        placeholder="Optional context — e.g., 'v1 placeholder pending DHL SLC over-1lb update'"
        onChange={e => onLenChange(e.target.value.length)}
        style={{
          ...inputStyle,
          resize: 'vertical',
          fontFamily: 'var(--font-sans)',
        }}
      />
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div style={errorBoxStyle}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{message}</div>
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

// Wider variant for the DHL panel which embeds the StagePreviewTable
// (12-column cell table needs the full content width to render readably)
const panelStyleWide: React.CSSProperties = {
  ...panelStyle,
  flex: '1 1 100%',
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
