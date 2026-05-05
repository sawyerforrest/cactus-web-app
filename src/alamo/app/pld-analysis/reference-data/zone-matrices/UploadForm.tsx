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
import {
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  RotateCcw,
} from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import { previewDhlEcomZones } from './actions'
import { initialPreviewState, type PreviewState, CANONICAL_DC_CODES } from './types'

export function UploadForm() {
  const [state, formAction] = useActionState<PreviewState, FormData>(
    previewDhlEcomZones,
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
// Preview Panel
// =====================

function PreviewPanel({ state }: { state: PreviewState }) {
  const s = state.summary!
  // For variance display: collect distinct UPDATED dates seen across files
  const distinctDates = Array.from(new Set(s.dcs.map(d => d.effective_date))).sort()
  const datesAgree = distinctDates.length === 1

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
        Parsed cleanly. Review the per-DC checklist, zone distribution, and
        first 10 rows below. When you click <strong>Commit</strong>, all
        prior DHL eCom Ground rows are scope-deleted from{' '}
        <strong>carrier_zone_matrices</strong> and these {s.totalRows.toLocaleString('en-US')} rows
        are inserted in one transaction.
      </div>

      <SummaryGrid state={state} datesAgree={datesAgree} />

      {state.warnings.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <WarningList warnings={state.warnings} />
        </div>
      ) : null}

      <DcChecklist dcs={s.dcs} datesAgree={datesAgree} />

      <ZoneDistributionTable distribution={s.zoneDistribution} />

      <FirstRowsTable rows={state.firstRows} dcCode={s.dcs[0]?.dc_code ?? ''} />

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Commit form (placeholder until pause point #4 wires the action). */}
        <form action="/pld-analysis/reference-data/zone-matrices?status=info&msg=Commit+action+not+yet+wired+%E2%80%94+pause+point+%234+deliverable.+Surfacing+to+Senior+Architect+for+preview+verification+with+the+real+18+files." method="get" style={{ display: 'inline' }}>
          <SubmitButton style={primaryButtonStyle} pendingLabel="Committing 16,740 rows…">
            <CheckCircle2 size={12} />
            Commit ({s.totalRows.toLocaleString('en-US')} rows · {s.totalFiles} DCs · effective {s.resolvedEffectiveDate})
          </SubmitButton>
        </form>
        <a href="/pld-analysis/reference-data/zone-matrices" style={cancelButtonStyle}>
          <RotateCcw size={12} />
          Upload different files
        </a>
        <span style={{ fontSize: 11, color: 'var(--cactus-amber-text)', marginLeft: 'auto' }}>
          Commit action not yet wired — pause point #4 deliverable.
        </span>
      </div>
    </div>
  )
}

function SummaryGrid({ state, datesAgree }: { state: PreviewState; datesAgree: boolean }) {
  const s = state.summary!
  const items = [
    { label: 'Files uploaded', value: `${s.totalFiles} / ${s.expectedFiles} expected`, mono: false },
    { label: 'Total rows', value: s.totalRows.toLocaleString('en-US'), mono: true },
    { label: 'Distinct dest ZIP3', value: s.distinctDestZip3s.toLocaleString('en-US'), mono: true },
    {
      label: 'Effective date',
      value: datesAgree
        ? s.resolvedEffectiveDate
        : `${s.resolvedEffectiveDate} (resolved as MAX across files; see warnings)`,
      mono: true,
    },
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

function DcChecklist({ dcs, datesAgree }: {
  dcs: PreviewState['summary'] extends infer S ? S extends { dcs: infer D } ? D : never : never
  datesAgree: boolean
}) {
  // dcs has 18 entries in canonical order. Render as a 6×3 grid of DC chips.
  const dcArray = dcs as Array<{ dc_code: string; origin_zip3: string; effective_date: string; rows: number }>
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
      }}>Per-DC checklist (18 / 18)</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
      }}>
        {dcArray.map(dc => (
          <div key={dc.dc_code} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11,
          }}>
            <CheckCircle2 size={12} color="var(--cactus-forest)" />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--cactus-ink)' }}>
                {dc.dc_code} · {dc.origin_zip3}
              </div>
              <div style={{
                fontSize: 10,
                color: datesAgree ? 'var(--cactus-muted)' : 'var(--cactus-amber-text)',
                fontFamily: 'var(--font-mono)',
              }}>
                {dc.effective_date}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ZoneDistributionTable({ distribution }: { distribution: Record<string, number> }) {
  // Display in canonical order: 1-8 then 11/12/13.
  const order = ['1', '2', '3', '4', '5', '6', '7', '8', '11', '12', '13']
  const totalRows = Object.values(distribution).reduce((a, b) => a + b, 0)
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
      }}>Zone distribution</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 4,
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
      }}>
        {order.map(z => {
          const count = distribution[z] ?? 0
          const pct = totalRows > 0 ? Math.round((count / totalRows) * 100) : 0
          return (
            <div key={z} style={{
              textAlign: 'center', padding: '6px 4px',
              background: count > 0 ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
              border: `0.5px solid ${count > 0 ? '#C5DBC0' : 'var(--cactus-border)'}`,
              borderRadius: 6,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500,
                color: count > 0 ? 'var(--cactus-forest)' : 'var(--cactus-hint)',
                fontFamily: 'var(--font-mono)',
              }}>Z{z}</div>
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: count > 0 ? 'var(--cactus-ink)' : 'var(--cactus-hint)',
                fontFamily: 'var(--font-mono)',
              }}>{count.toLocaleString('en-US')}</div>
              <div style={{ fontSize: 10, color: 'var(--cactus-muted)' }}>{pct}%</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FirstRowsTable({ rows, dcCode }: { rows: PreviewState['firstRows']; dcCode: string }) {
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--cactus-muted)' }}>
        No rows to preview.
      </div>
    )
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
        letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
      }}>First {rows.length} rows from {dcCode}</div>
      <div style={{
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 110px 110px 70px 1fr',
          background: 'var(--cactus-sand)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '6px 12px',
          gap: 8,
          fontSize: 10, fontWeight: 500, color: 'var(--cactus-muted)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          <div>DC</div><div>ORIGIN_ZIP3</div><div>DEST_ZIP3</div><div>ZONE</div><div>UPDATED</div>
        </div>
        {rows.map((row, idx) => (
          <div key={`${row.dc_code}-${row.dest_zip3}`} style={{
            display: 'grid',
            gridTemplateColumns: '70px 110px 110px 70px 1fr',
            padding: '7px 12px',
            gap: 8,
            fontSize: 12, fontFamily: 'var(--font-mono)',
            borderBottom: idx === rows.length - 1 ? 'none' : '0.5px solid var(--cactus-border)',
            color: 'var(--cactus-ink)',
          }}>
            <div style={{ fontWeight: 500 }}>{row.dc_code}</div>
            <div style={{ color: 'var(--cactus-muted)' }}>{row.origin_zip3}</div>
            <div style={{ fontWeight: 500 }}>{row.dest_zip3}</div>
            <div>{row.zone}</div>
            <div style={{ color: 'var(--cactus-muted)' }}>{row.updated}</div>
          </div>
        ))}
      </div>
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
