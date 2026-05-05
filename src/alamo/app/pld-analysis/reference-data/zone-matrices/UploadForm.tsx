// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/UploadForm.tsx
// PURPOSE: Multi-file upload UI for DHL eCom Domestic Zone matrices.
//
// EMPTY-STATE COMMIT: this is the layout-only shell. The file picker
// has `multiple` enabled and `accept=".xlsx"`. Submitting calls the
// previewDhlEcomZones action which currently returns an info-flash
// "parser not yet wired" until pause point #2 review completes.
//
// The PreviewPanel branch is NOT yet rendered — the preview state is
// built out fully in the next commit alongside the parser. This shell
// renders only the file-picker form so Senior Architect can review
// the upload-form layout, copy, and pendingLabel choice before the
// preview UX takes shape.
//
// Mirrors coverage-zips/UploadForm.tsx structure for consistency.
// ==========================================================

'use client'

import { useActionState, useId } from 'react'
import { Upload, AlertCircle, AlertTriangle, FolderOpen } from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import { previewDhlEcomZones } from './actions'
import { initialPreviewState, type PreviewState, CANONICAL_DC_CODES } from './types'

export function UploadForm() {
  const [state, formAction] = useActionState<PreviewState, FormData>(
    previewDhlEcomZones,
    initialPreviewState,
  )

  // PreviewPanel rendering will land in the next commit alongside
  // the parser. For now, all paths render the file picker.

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
        Upload all 18 zone files
      </div>
      <div style={{ fontSize: 12, color: 'var(--cactus-muted)', marginBottom: 16, lineHeight: 1.55 }}>
        DHL publishes one .xlsx per distribution center. Select all 18 at
        once — the upload UI requires the complete set in a single
        operation. Server-side parse, two-stage preview-then-commit:
        after upload you&apos;ll see counts per DC + zone distribution +
        any validation warnings before the atomic{' '}
        <strong>carrier_zone_matrices</strong> write.
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
          <strong style={{ color: 'var(--cactus-ink)', fontWeight: 500 }}>Expected file set</strong>
        </div>
        Filenames must match{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>
          DHL_eCommerce_Zones_Table_&lt;DC&gt;.xlsx
        </code>
        , one per DC across the canonical 18:{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {CANONICAL_DC_CODES.join(', ')}
        </span>
        . The parser auto-resolves the effective date from each file&apos;s{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>UPDATED</code>{' '}
        column — no manual date picker needed.
      </div>

      <form action={formAction} encType="multipart/form-data">
        <div>
          <label htmlFor={fileId} style={labelStyle}>Source files (select 18)</label>
          <input
            id={fileId}
            name="files"
            type="file"
            accept=".xlsx"
            multiple
            required
            style={{
              ...inputStyle,
              border: '0.5px dashed var(--cactus-border-mid)',
              padding: '7px 10px',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <SubmitButton style={primaryButtonStyle} pendingLabel="Parsing 18 files…">
            <Upload size={12} />
            Upload &amp; preview
          </SubmitButton>
          <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>
            All 18 files in one upload. The parser validates the set and
            blocks if any DC is missing or duplicated.
          </span>
        </div>
      </form>
    </div>
  )
}

// =====================
// Sub-components (shared shape with coverage-zips)
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
// Styles (shared with coverage-zips look-and-feel)
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
}
