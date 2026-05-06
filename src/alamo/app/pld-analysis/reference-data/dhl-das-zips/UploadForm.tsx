// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/dhl-das-zips/UploadForm.tsx
// PURPOSE: Single-file upload UI for DHL DAS ZIPs.
//
// Smaller than the zone-matrices UploadForm — no service-tab selector
// (single carrier+data-type), no operator-picked effective date
// (auto-resolved from cell A2), no per-DC/per-hub checklist (DAS is
// a flat ZIP5 list).
//
// PAUSE POINT #1 SCOPE: file picker + minimal preview panel skeleton.
// PreviewPanel renders for any successful preview state (none today
// since the action is stubbed) so the layout can be reviewed alongside
// the empty-state status card on the page.
// ==========================================================

'use client'

import { useActionState, useId } from 'react'
import {
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  RotateCcw,
} from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import { previewDhlDasZips, commitDhlDasZips } from './actions'
import { initialPreviewState, type PreviewState } from './types'

export function UploadForm() {
  const [state, formAction] = useActionState<PreviewState, FormData>(
    previewDhlDasZips,
    initialPreviewState,
  )

  if (state.status === 'preview' && state.summary) {
    return <PreviewPanel state={state} />
  }

  return (
    <FilePickerForm
      formAction={formAction}
      errors={state.status === 'error' ? state.errors : []}
      warnings={state.warnings}
    />
  )
}

interface FilePickerFormProps {
  formAction: (formData: FormData) => void
  errors: string[]
  warnings: string[]
}

function FilePickerForm({ formAction, errors, warnings }: FilePickerFormProps) {
  const fileId = useId()

  return (
    <div style={cardStyle}>
      <div style={cardHeadingStyle}>
        <Upload size={16} color="var(--cactus-forest)" />
        Upload DHL DAS ZIPs workbook
      </div>
      <div style={cardSubheadingStyle}>
        DHL publishes a single .xlsx with one sheet (<code style={codeStyle}>2026 DAS ZIPS</code>)
        listing the full set of ZIP5s subject to the Delivery Area
        Surcharge. The effective date is auto-resolved from cell{' '}
        <code style={codeStyle}>A2</code> (e.g. &ldquo;Effective 1/18/2026&rdquo;);
        no manual date picker. Server-side parse, two-stage preview-then-commit:
        after upload you&apos;ll see the count, resolved date, and first 10
        ZIPs before the atomic <strong>dhl_ecom_das_zips</strong>{' '}
        truncate-and-replace.
      </div>

      {errors.length > 0 ? <ErrorList errors={errors} /> : null}
      {warnings.length > 0 ? <WarningList warnings={warnings} /> : null}

      <div style={{
        marginBottom: 12,
        padding: '10px 14px',
        background: 'var(--cactus-sand)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        fontSize: 11, color: 'var(--cactus-muted)',
        lineHeight: 1.55,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <FolderOpen size={12} color="var(--cactus-forest)" />
          <strong style={{ color: 'var(--cactus-ink)', fontWeight: 500 }}>Expected file shape</strong>
        </div>
        Single .xlsx (typical name{' '}
        <code style={codeStyle}>dhl_das_zip_list_2026.xlsx</code>),
        sheet <code style={codeStyle}>2026 DAS ZIPS</code>, header row{' '}
        <code style={codeStyle}>Destination ZIP Codes</code> at row 8,
        ~22,264 ZIP5s starting at row 9. Re-uploads truncate-and-replace
        the entire DAS list atomically.
      </div>

      <form action={formAction}>
        <div>
          <label htmlFor={fileId} style={labelStyle}>Source workbook (.xlsx)</label>
          <input
            id={fileId}
            name="file"
            type="file"
            accept=".xlsx"
            required
            style={{
              ...inputStyle,
              border: '0.5px dashed var(--cactus-border-mid)',
              padding: '7px 10px',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <SubmitButton style={primaryButtonStyle} pendingLabel="Parsing 22,264 ZIPs…">
            <Upload size={12} />
            Upload &amp; preview
          </SubmitButton>
          <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>
            Effective date auto-resolves from cell A2. No manual date picker.
          </span>
        </div>
      </form>
    </div>
  )
}

// =====================
// Preview Panel (renders only when action returns status='preview' —
// stubbed today, exercised at pause point #3)
// =====================

function PreviewPanel({ state }: { state: PreviewState }) {
  const s = state.summary!

  return (
    <div style={{ ...cardStyle, borderLeft: '4px solid var(--cactus-forest)' }}>
      <div style={cardHeadingStyle}>
        <CheckCircle2 size={16} color="var(--cactus-forest)" />
        Preview — nothing written yet
      </div>
      <div style={cardSubheadingStyle}>
        Parsed cleanly. Review the summary and first ZIPs below. When you
        click <strong>Commit</strong>, the entire prior DAS ZIP list is
        truncated from <strong>dhl_ecom_das_zips</strong> and these{' '}
        {s.totalZips.toLocaleString('en-US')} ZIPs are inserted in one
        transaction.
      </div>

      <SummaryGrid summary={s} />

      {state.warnings.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <WarningList warnings={state.warnings} />
        </div>
      ) : null}

      <FirstRowsTable rows={state.firstRows} />

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <form action={commitDhlDasZips} style={{ display: 'inline' }}>
          <input type="hidden" name="upload_uuid" value={state.uploadUuid ?? ''} />
          <input type="hidden" name="expected_zips" value={s.totalZips} />
          <input type="hidden" name="effective_date" value={s.effectiveDate} />
          <SubmitButton style={primaryButtonStyle} pendingLabel="Committing 22,264 ZIPs…">
            <CheckCircle2 size={12} />
            Commit ({s.totalZips.toLocaleString('en-US')} ZIPs · effective {s.effectiveDate})
          </SubmitButton>
        </form>
        <a href="/pld-analysis/reference-data/dhl-das-zips" style={cancelButtonStyle}>
          <RotateCcw size={12} />
          Upload different file
        </a>
        <span style={{ fontSize: 11, color: 'var(--cactus-muted)', marginLeft: 'auto' }}>
          Atomic write — TRUNCATE + bulk INSERT in one transaction. Stage file deleted on success.
        </span>
      </div>
    </div>
  )
}

function SummaryGrid({ summary }: { summary: NonNullable<PreviewState['summary']> }) {
  const items = [
    { label: 'Total ZIPs', value: summary.totalZips.toLocaleString('en-US'), mono: true },
    {
      label: 'Effective date',
      value: `${summary.effectiveDate} (auto-resolved from "${summary.effectiveDateRaw}")`,
      mono: true,
    },
    { label: 'Source', value: summary.source, mono: false },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 8, columnGap: 16,
      padding: '14px 16px',
      background: 'var(--cactus-sand)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 8,
      fontSize: 12,
    }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'contents' }}>
          <div style={{
            color: 'var(--cactus-muted)', letterSpacing: '0.04em',
            textTransform: 'uppercase', fontSize: 10, fontWeight: 500,
            alignSelf: 'center',
          }}>{item.label}</div>
          <div style={{
            color: 'var(--cactus-ink)', fontWeight: 500,
            fontFamily: item.mono ? 'var(--font-mono)' : 'var(--font-sans)',
          }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function FirstRowsTable({ rows }: { rows: PreviewState['firstRows'] }) {
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--cactus-muted)' }}>
        No ZIPs to preview.
      </div>
    )
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
      }}>First {rows.length} ZIPs</div>
      <div style={{
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
        display: 'flex', flexWrap: 'wrap', gap: 6,
      }}>
        {rows.map((row, idx) => (
          <span key={idx} style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px',
            background: 'var(--cactus-sand)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 999,
            fontSize: 12, fontFamily: 'var(--font-mono)',
            color: 'var(--cactus-ink)',
          }}>{row.zip5}</span>
        ))}
      </div>
    </div>
  )
}

// =====================
// Sub-components
// =====================

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px',
      background: 'var(--cactus-bloom-bg)',
      border: '0.5px solid var(--cactus-bloom-border)',
      borderRadius: 8,
      fontSize: 12,
      color: 'var(--cactus-bloom-deep)',
      marginBottom: 16,
    }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>
          {errors.length === 1 ? 'Error' : `${errors.length} errors`}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </div>
    </div>
  )
}

function WarningList({ warnings }: { warnings: string[] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px',
      background: 'var(--cactus-amber-bg)',
      border: '0.5px solid #FCD34D',
      borderRadius: 8,
      fontSize: 12,
      color: 'var(--cactus-amber-text)',
      marginBottom: 16,
    }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>
          {warnings.length === 1 ? 'Warning' : `${warnings.length} warnings`}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.55 }}>
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      </div>
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
  padding: 24,
}

const cardHeadingStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)',
  marginBottom: 6,
}

const cardSubheadingStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 16, lineHeight: 1.55,
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  padding: '0 2px',
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
}

const primaryButtonStyle: React.CSSProperties = {
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

const cancelButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--cactus-muted)',
  border: '0.5px solid var(--cactus-border-mid)',
  borderRadius: 6,
  fontSize: 12, fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'none',
}
