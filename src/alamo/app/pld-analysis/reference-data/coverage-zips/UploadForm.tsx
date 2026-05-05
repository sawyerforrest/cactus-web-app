// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/coverage-zips/UploadForm.tsx
// PURPOSE: Two-stage upload UI for the GOFO Regional Coverage XLSX.
//
// Client component because the preview UI is driven by useActionState —
// the parsed summary needs to round-trip from the Server Action back
// into rendered state without a full page navigation.
//
// Stages rendered:
//   - 'idle' / 'error': effective_date picker + file picker + Upload button
//   - 'preview': summary stats card + first 10 rows + warnings + "Commit"
//     placeholder + "Upload different file" reset
//
// The Commit button is intentionally a placeholder until pause point #3.
// Clicking it surfaces a "commit not yet wired" notice.
// ==========================================================

'use client'

import { useActionState, useId } from 'react'
import { Upload, AlertCircle, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import {
  previewGofoRegionalUpload,
  commitGofoRegionalUpload,
} from './actions'
import { initialPreviewState, type PreviewState } from './types'

interface UploadFormProps {
  defaultEffectiveDate: string
}

export function UploadForm({ defaultEffectiveDate }: UploadFormProps) {
  const [state, formAction, pending] = useActionState<PreviewState, FormData>(
    previewGofoRegionalUpload,
    initialPreviewState,
  )

  if (state.status === 'preview' && state.summary) {
    return <PreviewPanel state={state} />
  }

  return (
    <FilePickerForm
      formAction={formAction}
      pending={pending}
      defaultEffectiveDate={defaultEffectiveDate}
      errors={state.status === 'error' ? state.errors : []}
      warnings={state.warnings}
    />
  )
}

// =====================
// Stage A: file picker
// =====================

interface FilePickerFormProps {
  formAction: (formData: FormData) => void
  pending: boolean
  defaultEffectiveDate: string
  errors: string[]
  warnings: string[]
}

function FilePickerForm({
  formAction, pending, defaultEffectiveDate, errors, warnings,
}: FilePickerFormProps) {
  const dateId = useId()
  const fileId = useId()

  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 24,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)',
        marginBottom: 6,
      }}>
        <Upload size={16} color="var(--cactus-forest)" />
        Upload coverage XLSX
      </div>
      <div style={{ fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 16, lineHeight: 1.55 }}>
        Server-side parse. Two-stage preview-then-commit: after upload
        you&apos;ll see the first 10 parsed rows + total counts + any
        validation warnings before anything writes to the database. The
        commit step writes both <strong>service_coverage_zips</strong>{' '}
        and <strong>gofo_regional_zone_matrix</strong> in a single
        transaction.
      </div>

      {errors.length > 0 ? <ErrorList errors={errors} /> : null}
      {warnings.length > 0 ? <WarningList warnings={warnings} /> : null}

      <form action={formAction} encType="multipart/form-data">
        <div style={{
          display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12,
          marginBottom: 12, alignItems: 'end',
        }}>
          <div>
            <label htmlFor={dateId} style={labelStyle}>Effective date</label>
            <input
              id={dateId}
              name="effective_date"
              type="date"
              required
              defaultValue={defaultEffectiveDate}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor={fileId} style={labelStyle}>Source file</label>
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              ...primaryButtonStyle,
              opacity: pending ? 0.6 : 1,
              cursor: pending ? 'wait' : 'pointer',
            }}
          >
            <Upload size={12} />
            {pending ? 'Parsing…' : 'Upload & preview'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>
            Default date matches GOFO&apos;s Q2 2026 publication. Override if your
            source file represents a different effective date.
          </span>
        </div>
      </form>
    </div>
  )
}

// =====================
// Stage B: preview
// =====================

function PreviewPanel({ state }: { state: PreviewState }) {
  const s = state.summary!
  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 24,
      borderLeft: '4px solid var(--cactus-forest)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)',
        marginBottom: 6,
      }}>
        <CheckCircle2 size={16} color="var(--cactus-forest)" />
        Preview — nothing written yet
      </div>
      <div style={{ fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 16, lineHeight: 1.55 }}>
        Parsed cleanly. Review the summary and first 10 rows below. When
        you click <strong>Commit</strong>, both target tables are wiped
        and re-populated in a single transaction. Cancel and re-upload
        to fix anything off.
      </div>

      <SummaryGrid state={state} />

      {state.warnings.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <WarningList warnings={state.warnings} />
        </div>
      ) : null}

      <PreviewTable rows={state.firstTenRows} />

      <div style={{
        marginTop: 16, display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <form action={commitGofoRegionalUpload} style={{ display: 'inline' }}>
          {/* Hidden inputs carry the staged-file reference + the expected
              row counts from preview. The commit action re-parses the
              staged file and validates the re-parse summary matches
              these expected counts before any DB write. */}
          <input type="hidden" name="stage_path" value={state.stagePath ?? ''} />
          <input type="hidden" name="effective_date" value={state.effectiveDate ?? ''} />
          <input type="hidden" name="expected_coverage_rows" value={s.expectedCoverageRows} />
          <input type="hidden" name="expected_matrix_rows" value={s.expectedZoneMatrixRows} />
          <button type="submit" style={primaryButtonStyle}>
            <CheckCircle2 size={12} />
            Commit ({s.expectedCoverageRows.toLocaleString('en-US')} ZIPs · {s.expectedZoneMatrixRows.toLocaleString('en-US')} matrix rows)
          </button>
        </form>
        <a href="/pld-analysis/reference-data/coverage-zips" style={cancelButtonStyle}>
          <RotateCcw size={12} />
          Upload different file
        </a>
        <span style={{ fontSize: 11, color: 'var(--cactus-muted)', marginLeft: 'auto' }}>
          Atomic write to both tables. Stage file deleted on success.
        </span>
      </div>
    </div>
  )
}

function SummaryGrid({ state }: { state: PreviewState }) {
  const s = state.summary!
  const items = [
    { label: 'Source file', value: state.fileName ?? '—', mono: false },
    { label: 'Total ZIP rows', value: s.totalZipRows.toLocaleString('en-US'), mono: true },
    {
      label: 'Zone cells',
      value: `${s.totalServiceableCells.toLocaleString('en-US')} serviceable / ${s.totalNonServiceableCells} not-serviceable`,
      mono: true,
    },
    {
      label: 'After EWR/JFK split',
      value: `${s.expectedZoneMatrixRows.toLocaleString('en-US')} zone matrix rows will be written`,
      mono: true,
    },
    { label: 'Effective date', value: s.effectiveDate, mono: true },
    { label: 'Matrix version', value: s.matrixVersion, mono: true },
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
        <>
          <div key={`l-${item.label}`} style={{
            color: 'var(--cactus-muted)', letterSpacing: '0.04em',
            textTransform: 'uppercase', fontSize: 10, fontWeight: 500,
            alignSelf: 'center',
          }}>{item.label}</div>
          <div key={`v-${item.label}`} style={{
            color: 'var(--cactus-ink)', fontWeight: 500,
            fontFamily: item.mono ? 'var(--font-mono)' : 'var(--font-sans)',
          }}>{item.value}</div>
        </>
      ))}
    </div>
  )
}

function PreviewTable({ rows }: { rows: PreviewState['firstTenRows'] }) {
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--cactus-muted)' }}>
        No rows to preview.
      </div>
    )
  }

  const HUBS_DISPLAY = ['LAX', 'DFW', 'ORD', 'EWR/JFK', 'ATL', 'MIA', 'SLC'] as const

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
      }}>First {rows.length} rows from source</div>
      <div style={{
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px repeat(7, 1fr)',
          background: 'var(--cactus-sand)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '6px 12px',
          gap: 8,
          fontSize: 10, fontWeight: 500, color: 'var(--cactus-muted)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          <div>ZIP5</div>
          {HUBS_DISPLAY.map(h => <div key={h}>{h}</div>)}
        </div>
        {rows.map((row, idx) => (
          <div key={row.zip5} style={{
            display: 'grid',
            gridTemplateColumns: '90px repeat(7, 1fr)',
            padding: '8px 12px',
            gap: 8,
            fontSize: 12, fontFamily: 'var(--font-mono)',
            borderBottom: idx === rows.length - 1 ? 'none' : '0.5px solid var(--cactus-border)',
            color: 'var(--cactus-ink)',
          }}>
            <div style={{ fontWeight: 500 }}>{row.zip5}</div>
            {HUBS_DISPLAY.map(h => {
              const v = row.zonesBySourceColumn[h]
              return (
                <div key={h} style={{
                  color: v === null ? 'var(--cactus-amber-text)' : 'var(--cactus-ink)',
                }}>{v ?? '—'}</div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================
// Shared sub-components
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
  textDecoration: 'none',
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
