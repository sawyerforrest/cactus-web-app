// ==========================================================
// FILE: src/alamo/app/pld-analysis/reference-data/zone-matrices/UploadForm.tsx
// PURPOSE: Dual-flow upload UI for Zone Matrices.
//   - DHL eCom Domestic — multi-file (18 per-DC XLSX), auto-resolved
//     effective_date from each file's UPDATED column
//   - GOFO Standard — single workbook with 8 hub tabs, operator-picked
//     effective_date
//
// A service-tab selector at the top routes between the two flows.
// Initial selection is driven by the `?service=` query param so the
// Reference Data index can deep-link to either mode. Once a flow
// enters preview state, the tab selector is hidden and the preview
// panel takes over until commit or "upload different file".
//
// PAUSE POINT #1 SCOPE: GOFO side ships UI shell only — the Server
// Action returns an info-flash until the parser lands in the next
// commit. DHL side is unchanged from the prior pause-point #5 work.
// ==========================================================

'use client'

import { useActionState, useId, useState } from 'react'
import {
  Upload,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  RotateCcw,
  Layers,
  Calendar,
} from 'lucide-react'
import { SubmitButton } from '@/components/SubmitButton'
import {
  previewDhlEcomZones,
  commitDhlEcomZones,
  previewGofoStandardZones,
  commitGofoStandardZones,
} from './actions'
import {
  initialPreviewState,
  type PreviewState,
  CANONICAL_DC_CODES,
  initialGofoPreviewState,
  type GofoPreviewState,
  CANONICAL_GOFO_HUB_CODES,
  type ServiceMode,
} from './types'

interface UploadFormProps {
  initialService?: ServiceMode
}

export function UploadForm({ initialService = 'dhl-ecom-domestic' }: UploadFormProps) {
  const [service, setService] = useState<ServiceMode>(initialService)

  // Both action states are instantiated unconditionally (hooks rule).
  // Whichever flow is active drives the form/preview render below.
  const [dhlState, dhlAction] = useActionState<PreviewState, FormData>(
    previewDhlEcomZones,
    initialPreviewState,
  )
  const [gofoState, gofoAction] = useActionState<GofoPreviewState, FormData>(
    previewGofoStandardZones,
    initialGofoPreviewState,
  )

  // Preview panels take over the whole area when in preview state — the
  // service-tab selector is hidden because the operator should commit or
  // explicitly cancel back to file selection.
  if (dhlState.status === 'preview' && dhlState.summary) {
    return <DhlPreviewPanel state={dhlState} />
  }
  if (gofoState.status === 'preview' && gofoState.summary) {
    return <GofoPreviewPanel state={gofoState} />
  }

  return (
    <div>
      <ServiceTabs active={service} onChange={setService} />
      {service === 'dhl-ecom-domestic' ? (
        <DhlFilePickerForm
          formAction={dhlAction}
          errors={dhlState.status === 'error' ? dhlState.errors : []}
          warnings={dhlState.warnings}
        />
      ) : (
        <GofoFilePickerForm
          formAction={gofoAction}
          errors={gofoState.status === 'error' ? gofoState.errors : []}
          warnings={gofoState.warnings}
          effectiveDate={gofoState.effectiveDate}
        />
      )}
    </div>
  )
}

// =====================
// Service tabs
// =====================

function ServiceTabs({
  active, onChange,
}: { active: ServiceMode; onChange: (s: ServiceMode) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 0,
      background: 'var(--cactus-canvas)',
      border: '0.5px solid var(--cactus-border)',
      borderRadius: 10,
      padding: 4,
      marginBottom: 12,
      width: 'fit-content',
    }}>
      <Tab
        active={active === 'dhl-ecom-domestic'}
        onClick={() => onChange('dhl-ecom-domestic')}
        icon={<Layers size={13} />}
        label="DHL eCom Domestic"
        sublabel="18 files · per-DC"
      />
      <Tab
        active={active === 'gofo-standard'}
        onClick={() => onChange('gofo-standard')}
        icon={<Layers size={13} />}
        label="GOFO Standard"
        sublabel="1 file · 8 hub tabs"
      />
    </div>
  )
}

function Tab({
  active, onClick, icon, label, sublabel,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
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
      {icon}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div style={{
          fontSize: 10, fontWeight: 400,
          color: active ? 'rgba(255,255,255,0.75)' : 'var(--cactus-hint)',
          fontFamily: 'var(--font-mono)',
        }}>{sublabel}</div>
      </div>
    </button>
  )
}

// =====================
// DHL eCom Domestic — file picker (multi-file)
// =====================

interface DhlFilePickerFormProps {
  formAction: (formData: FormData) => void
  errors: string[]
  warnings: string[]
}

function DhlFilePickerForm({ formAction, errors, warnings }: DhlFilePickerFormProps) {
  const fileId = useId()

  return (
    <div style={cardStyle}>
      <div style={cardHeadingStyle}>
        <Upload size={16} color="var(--cactus-forest)" />
        Upload all 18 zone files
      </div>
      <div style={cardSubheadingStyle}>
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
          DHL eCommerce Zones Table_&lt;DC&gt;.xlsx
        </code>
        {' '}(spaces or underscores in the prefix both accepted), one per
        DC across the canonical 18:{' '}
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
// GOFO Standard — file picker (single file + effective date)
// =====================

interface GofoFilePickerFormProps {
  formAction: (formData: FormData) => void
  errors: string[]
  warnings: string[]
  effectiveDate: string
}

function GofoFilePickerForm({
  formAction, errors, warnings, effectiveDate,
}: GofoFilePickerFormProps) {
  const fileId = useId()
  const dateId = useId()

  return (
    <div style={cardStyle}>
      <div style={cardHeadingStyle}>
        <Upload size={16} color="var(--cactus-forest)" />
        Upload GOFO Standard zones workbook
      </div>
      <div style={cardSubheadingStyle}>
        GOFO publishes a single workbook with one tab per injection-point hub.
        Select the .xlsx and pick the publication effective date — the
        parser will read all 8 tabs, aggregate ZIP5→ZIP3 (the matrix is
        effectively ZIP3-keyed despite ZIP5 source granularity), and
        produce 7,448 rows for atomic write to{' '}
        <strong>carrier_zone_matrices</strong> scoped to{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>(GOFO, Standard)</code>.
        DHL rows on the same table are untouched.
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
          <strong style={{ color: 'var(--cactus-ink)', fontWeight: 500 }}>Expected workbook</strong>
        </div>
        Single .xlsx (typical name{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>
          2026_CIRRO_GOFO_Standard___Economy_Zones.xlsx
        </code>
        ) with 8 hub tabs:{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {CANONICAL_GOFO_HUB_CODES.join(', ')}
        </span>
        . Per-tab columns:{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>Zone</code>,{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>Closing Zip</code>,{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>3-digit</code>.
        Zone vocabulary includes both numeric (2–8) and remote variants
        (<code style={{ fontFamily: 'var(--font-mono)' }}>remote 1</code>{' '}
        through{' '}
        <code style={{ fontFamily: 'var(--font-mono)' }}>remote 9</code>).
      </div>

      <form action={formAction} encType="multipart/form-data">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12 }}>
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
          <div>
            <label htmlFor={dateId} style={labelStyle}>
              <Calendar size={10} style={{ marginRight: 3, verticalAlign: 'text-top' }} />
              Effective date
            </label>
            <input
              id={dateId}
              name="effective_date"
              type="date"
              defaultValue={effectiveDate}
              required
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <SubmitButton style={primaryButtonStyle} pendingLabel="Parsing 8 tabs…">
            <Upload size={12} />
            Upload &amp; preview
          </SubmitButton>
          <span style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>
            Default date matches the GOFO 4/28 publication batch. Overridable.
          </span>
        </div>
      </form>
    </div>
  )
}

// =====================
// DHL eCom Domestic — Preview Panel (unchanged from prior pause-point work)
// =====================

function DhlPreviewPanel({ state }: { state: PreviewState }) {
  const s = state.summary!
  const distinctDates = Array.from(new Set(s.dcs.map(d => d.effective_date))).sort()
  const datesAgree = distinctDates.length === 1

  return (
    <div style={{ ...cardStyle, borderLeft: '4px solid var(--cactus-forest)' }}>
      <div style={cardHeadingStyle}>
        <CheckCircle2 size={16} color="var(--cactus-forest)" />
        Preview — nothing written yet
      </div>
      <div style={cardSubheadingStyle}>
        Parsed cleanly. Review the per-DC checklist, zone distribution, and
        first 10 rows below. When you click <strong>Commit</strong>, all
        prior DHL eCom Ground rows are scope-deleted from{' '}
        <strong>carrier_zone_matrices</strong> and these {s.totalRows.toLocaleString('en-US')} rows
        are inserted in one transaction.
      </div>

      <DhlSummaryGrid state={state} datesAgree={datesAgree} />

      {state.warnings.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <WarningList warnings={state.warnings} />
        </div>
      ) : null}

      <DcChecklist dcs={s.dcs} datesAgree={datesAgree} />

      <DhlZoneDistributionTable distribution={s.zoneDistribution} />

      <DhlFirstRowsTable rows={state.firstRows} dcCode={s.dcs[0]?.dc_code ?? ''} />

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <form action={commitDhlEcomZones} style={{ display: 'inline' }}>
          <input type="hidden" name="upload_uuid" value={state.uploadUuid ?? ''} />
          <input type="hidden" name="expected_rows" value={s.totalRows} />
          <input type="hidden" name="expected_files" value={s.totalFiles} />
          <input type="hidden" name="effective_date" value={s.resolvedEffectiveDate} />
          <input type="hidden" name="matrix_version" value={s.matrixVersion} />
          <SubmitButton style={primaryButtonStyle} pendingLabel="Committing 16,740 rows…">
            <CheckCircle2 size={12} />
            Commit ({s.totalRows.toLocaleString('en-US')} rows · {s.totalFiles} DCs · effective {s.resolvedEffectiveDate})
          </SubmitButton>
        </form>
        <a href="/pld-analysis/reference-data/zone-matrices?service=dhl-ecom-domestic" style={cancelButtonStyle}>
          <RotateCcw size={12} />
          Upload different files
        </a>
        <span style={{ fontSize: 11, color: 'var(--cactus-muted)', marginLeft: 'auto' }}>
          Atomic write — scoped DELETE + bulk INSERT in one transaction. Stage files deleted on success.
        </span>
      </div>
    </div>
  )
}

function DhlSummaryGrid({ state, datesAgree }: { state: PreviewState; datesAgree: boolean }) {
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
  return <SummaryGridShell items={items} />
}

function DcChecklist({ dcs, datesAgree }: {
  dcs: PreviewState['summary'] extends infer S ? S extends { dcs: infer D } ? D : never : never
  datesAgree: boolean
}) {
  const dcArray = dcs as Array<{ dc_code: string; origin_zip3: string; effective_date: string; rows: number }>
  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>Per-DC checklist (18 / 18)</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
      }}>
        {dcArray.map(dc => (
          <div key={dc.dc_code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
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

function DhlZoneDistributionTable({ distribution }: { distribution: Record<string, number> }) {
  const order = ['1', '2', '3', '4', '5', '6', '7', '8', '11', '12', '13']
  const totalRows = Object.values(distribution).reduce((a, b) => a + b, 0)
  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>Zone distribution</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 4,
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
      }}>
        {order.map(z => (
          <ZoneCell key={z} label={`Z${z}`} count={distribution[z] ?? 0} totalRows={totalRows} />
        ))}
      </div>
    </div>
  )
}

function DhlFirstRowsTable({ rows, dcCode }: { rows: PreviewState['firstRows']; dcCode: string }) {
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--cactus-muted)' }}>
        No rows to preview.
      </div>
    )
  }
  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>First {rows.length} rows from {dcCode}</SectionLabel>
      <div style={tableShellStyle}>
        <div style={{ ...tableHeaderRowStyle, gridTemplateColumns: '70px 110px 110px 70px 1fr' }}>
          <div>DC</div><div>ORIGIN_ZIP3</div><div>DEST_ZIP3</div><div>ZONE</div><div>UPDATED</div>
        </div>
        {rows.map((row, idx) => (
          <div key={`${row.dc_code}-${row.dest_zip3}`} style={{
            ...tableBodyRowStyle,
            gridTemplateColumns: '70px 110px 110px 70px 1fr',
            borderBottom: idx === rows.length - 1 ? 'none' : '0.5px solid var(--cactus-border)',
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
// GOFO Standard — Preview Panel
// =====================

function GofoPreviewPanel({ state }: { state: GofoPreviewState }) {
  const s = state.summary!

  return (
    <div style={{ ...cardStyle, borderLeft: '4px solid var(--cactus-forest)' }}>
      <div style={cardHeadingStyle}>
        <CheckCircle2 size={16} color="var(--cactus-forest)" />
        Preview — nothing written yet
      </div>
      <div style={cardSubheadingStyle}>
        Parsed cleanly. Review the per-hub checklist, zone distribution
        (including remote variants), and first rows below. When you click{' '}
        <strong>Commit</strong>, all prior GOFO Standard rows are
        scope-deleted from <strong>carrier_zone_matrices</strong> and
        these {s.totalRows.toLocaleString('en-US')} rows are inserted in
        one transaction.
      </div>

      <GofoSummaryGrid state={state} />

      {state.warnings.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <WarningList warnings={state.warnings} />
        </div>
      ) : null}

      <HubChecklist hubs={s.hubs} />

      <GofoZoneDistributionTable distribution={s.zoneDistribution} />

      <GofoFirstRowsTable rows={state.firstRows} />

      <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <form action={commitGofoStandardZones} style={{ display: 'inline' }}>
          <input type="hidden" name="upload_uuid" value={state.uploadUuid ?? ''} />
          <input type="hidden" name="expected_rows" value={s.totalRows} />
          <input type="hidden" name="expected_tabs" value={s.totalTabs} />
          <input type="hidden" name="effective_date" value={s.effectiveDate} />
          <input type="hidden" name="matrix_version" value={s.matrixVersion} />
          <SubmitButton style={primaryButtonStyle} pendingLabel="Committing 7,448 rows…">
            <CheckCircle2 size={12} />
            Commit ({s.totalRows.toLocaleString('en-US')} rows · {s.totalTabs} hubs · effective {s.effectiveDate})
          </SubmitButton>
        </form>
        <a href="/pld-analysis/reference-data/zone-matrices?service=gofo-standard" style={cancelButtonStyle}>
          <RotateCcw size={12} />
          Upload different file
        </a>
        <span style={{ fontSize: 11, color: 'var(--cactus-muted)', marginLeft: 'auto' }}>
          Atomic write — scoped DELETE + bulk INSERT in one transaction. Stage file deleted on success.
        </span>
      </div>
    </div>
  )
}

function GofoSummaryGrid({ state }: { state: GofoPreviewState }) {
  const s = state.summary!
  const items = [
    { label: 'Tabs parsed', value: `${s.totalTabs} / ${s.expectedTabs} expected`, mono: false },
    { label: 'Total rows', value: s.totalRows.toLocaleString('en-US'), mono: true },
    { label: 'Distinct dest ZIP3', value: s.distinctDestZip3s.toLocaleString('en-US'), mono: true },
    { label: 'Effective date', value: s.effectiveDate, mono: true },
    { label: 'Matrix version', value: s.matrixVersion, mono: true },
  ]
  return <SummaryGridShell items={items} />
}

function HubChecklist({ hubs }: { hubs: GofoPreviewState['summary'] extends infer S ? S extends { hubs: infer H } ? H : never : never }) {
  const hubArray = hubs as Array<{ hub_code: string; origin_zip3: string; rows: number }>
  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>Per-hub checklist (8 / 8)</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
      }}>
        {hubArray.map(h => (
          <div key={h.hub_code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <CheckCircle2 size={12} color="var(--cactus-forest)" />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--cactus-ink)' }}>
                {h.hub_code} · {h.origin_zip3}
              </div>
              <div style={{ fontSize: 10, color: 'var(--cactus-muted)', fontFamily: 'var(--font-mono)' }}>
                {h.rows.toLocaleString('en-US')} ZIP3s
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GofoZoneDistributionTable({ distribution }: { distribution: Record<string, number> }) {
  const numericOrder = ['2', '3', '4', '5', '6', '7', '8']
  const remoteKeys = Object.keys(distribution)
    .filter(k => k.startsWith('remote '))
    .sort((a, b) => parseInt(a.slice(7), 10) - parseInt(b.slice(7), 10))
  const totalRows = Object.values(distribution).reduce((a, b) => a + b, 0)

  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>Zone distribution</SectionLabel>
      <div style={{
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 8,
        padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div>
          <div style={mutedSublabel}>Standard zones</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {numericOrder.map(z => (
              <ZoneCell key={z} label={`Z${z}`} count={distribution[z] ?? 0} totalRows={totalRows} />
            ))}
          </div>
        </div>
        {remoteKeys.length > 0 ? (
          <div>
            <div style={mutedSublabel}>Remote zones</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4 }}>
              {remoteKeys.map(k => (
                <ZoneCell key={k} label={`R${k.slice(7)}`} count={distribution[k]} totalRows={totalRows} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function GofoFirstRowsTable({ rows }: { rows: GofoPreviewState['firstRows'] }) {
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--cactus-muted)' }}>
        No rows to preview.
      </div>
    )
  }
  return (
    <div style={{ marginTop: 16 }}>
      <SectionLabel>First {rows.length} rows</SectionLabel>
      <div style={tableShellStyle}>
        <div style={{ ...tableHeaderRowStyle, gridTemplateColumns: '70px 110px 110px 1fr' }}>
          <div>HUB</div><div>ORIGIN_ZIP3</div><div>DEST_ZIP3</div><div>ZONE</div>
        </div>
        {rows.map((row, idx) => (
          <div key={`${row.hub_code}-${row.dest_zip3}`} style={{
            ...tableBodyRowStyle,
            gridTemplateColumns: '70px 110px 110px 1fr',
            borderBottom: idx === rows.length - 1 ? 'none' : '0.5px solid var(--cactus-border)',
          }}>
            <div style={{ fontWeight: 500 }}>{row.hub_code}</div>
            <div style={{ color: 'var(--cactus-muted)' }}>{row.origin_zip3}</div>
            <div style={{ fontWeight: 500 }}>{row.dest_zip3}</div>
            <div>{row.zone}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================
// Shared sub-components
// =====================

function SummaryGridShell({ items }: { items: Array<{ label: string; value: string; mono: boolean }> }) {
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

function ZoneCell({ label, count, totalRows }: { label: string; count: number; totalRows: number }) {
  const pct = totalRows > 0 ? Math.round((count / totalRows) * 100) : 0
  return (
    <div style={{
      textAlign: 'center', padding: '6px 4px',
      background: count > 0 ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
      border: `0.5px solid ${count > 0 ? '#C5DBC0' : 'var(--cactus-border)'}`,
      borderRadius: 6,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 500,
        color: count > 0 ? 'var(--cactus-forest)' : 'var(--cactus-hint)',
        fontFamily: 'var(--font-mono)',
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 500,
        color: count > 0 ? 'var(--cactus-ink)' : 'var(--cactus-hint)',
        fontFamily: 'var(--font-mono)',
      }}>{count.toLocaleString('en-US')}</div>
      <div style={{ fontSize: 10, color: 'var(--cactus-muted)' }}>{pct}%</div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: 'var(--cactus-muted)',
      letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
    }}>{children}</div>
  )
}

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

const tableShellStyle: React.CSSProperties = {
  background: 'var(--cactus-canvas)',
  border: '0.5px solid var(--cactus-border)',
  borderRadius: 8,
  overflow: 'hidden',
}

const tableHeaderRowStyle: React.CSSProperties = {
  display: 'grid',
  background: 'var(--cactus-sand)',
  borderBottom: '0.5px solid var(--cactus-border)',
  padding: '6px 12px',
  gap: 8,
  fontSize: 10, fontWeight: 500, color: 'var(--cactus-muted)',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  fontFamily: 'var(--font-mono)',
}

const tableBodyRowStyle: React.CSSProperties = {
  display: 'grid',
  padding: '7px 12px',
  gap: 8,
  fontSize: 12, fontFamily: 'var(--font-mono)',
  color: 'var(--cactus-ink)',
}

const mutedSublabel: React.CSSProperties = {
  fontSize: 10, color: 'var(--cactus-muted)',
  fontFamily: 'var(--font-mono)',
  marginBottom: 4,
}
