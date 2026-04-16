'use client'

// ==========================================================
// FILE: src/alamo/app/invoices/InvoiceFilters.tsx
// PURPOSE: Client-side search, filter bar, and CSV export
// for the carrier invoices table. Filters are applied in
// memory — no page reload on change.
// ==========================================================

import { useState, useMemo } from 'react'

// WHY: These match the DB enums exactly so the dropdowns
// cover all possible values without a separate query.
const CARRIER_CODES = [
  'UPS', 'FEDEX', 'USPS', 'UNIUNI', 'GOFO', 'SHIPX',
  'DHL_ECOM', 'DHL_EXPRESS', 'LANDMARK', 'ONTRAC', 'OSM',
] as const

const INVOICE_STATUSES = [
  'UPLOADED', 'NORMALIZING', 'REVIEW', 'APPROVED',
  'PROCESSING', 'COMPLETE', 'FAILED',
] as const

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UPLOADED:    { label: 'Uploaded',    color: 'var(--cactus-muted)',  bg: 'var(--cactus-sand)' },
  NORMALIZING: { label: 'Normalizing', color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  REVIEW:      { label: 'Review',      color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  APPROVED:    { label: 'Approved',    color: 'var(--cactus-forest)', bg: 'var(--cactus-mint)' },
  PROCESSING:  { label: 'Processing',  color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  COMPLETE:    { label: 'Complete',    color: 'var(--cactus-forest)', bg: 'var(--cactus-mint)' },
  FAILED:      { label: 'Failed',      color: 'var(--cactus-bloom)',  bg: 'var(--cactus-bloom-bg)' },
}

export type InvoiceRow = {
  id: string
  invoice_file_name: string
  carrier_code: string
  status: string
  total_carrier_amount: string | null
  total_line_items: number | null
  matched_line_items: number | null
  flagged_line_items: number | null
  invoice_period_start: string | null
  invoice_period_end: string | null
  created_at: string
  organizations: { name: string } | null
}

type InvoiceFiltersProps = {
  invoices: InvoiceRow[]
}

export default function InvoiceFilters({ invoices }: InvoiceFiltersProps) {
  const [search, setSearch] = useState('')
  const [carrierFilter, setCarrierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    let rows = invoices

    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter((r) =>
        r.invoice_file_name.toLowerCase().includes(q)
      )
    }

    if (carrierFilter) {
      rows = rows.filter((r) => r.carrier_code === carrierFilter)
    }

    if (statusFilter) {
      rows = rows.filter((r) => r.status === statusFilter)
    }

    if (dateFrom) {
      rows = rows.filter((r) => r.created_at >= dateFrom)
    }

    if (dateTo) {
      // Include the full day by comparing against next day
      const toDate = new Date(dateTo)
      toDate.setDate(toDate.getDate() + 1)
      const toStr = toDate.toISOString()
      rows = rows.filter((r) => r.created_at < toStr)
    }

    return rows
  }, [invoices, search, carrierFilter, statusFilter, dateFrom, dateTo])

  function handleExportCsv() {
    const headers = [
      'File Name', 'Carrier', 'Org', 'Status', 'Lines',
      'Matched', 'Flagged', 'Amount', 'Period Start', 'Period End', 'Created',
    ]

    const csvRows = [headers.join(',')]

    for (const inv of filtered) {
      const org = inv.organizations as any
      csvRows.push([
        `"${inv.invoice_file_name.replace(/"/g, '""')}"`,
        inv.carrier_code,
        `"${(org?.name ?? '').replace(/"/g, '""')}"`,
        inv.status,
        inv.total_line_items ?? '',
        inv.matched_line_items ?? '',
        inv.flagged_line_items ?? '',
        inv.total_carrier_amount ?? '',
        inv.invoice_period_start ?? '',
        inv.invoice_period_end ?? '',
        inv.created_at,
      ].join(','))
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `carrier-invoices-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 6,
    border: '0.5px solid var(--cactus-border)',
    background: 'var(--cactus-canvas)',
    fontSize: 12,
    color: 'var(--cactus-ink)',
    outline: 'none',
  }

  return (
    <>
      {/* Filter bar */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search file name\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...selectStyle,
            flex: '1 1 200px',
            minWidth: 180,
          }}
        />

        {/* Carrier filter */}
        <select
          value={carrierFilter}
          onChange={(e) => setCarrierFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Carriers</option>
          {CARRIER_CODES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Date from */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--cactus-muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={selectStyle}
          />
        </label>

        {/* Date to */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--cactus-muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={selectStyle}
          />
        </label>

        {/* Export CSV */}
        <button
          onClick={handleExportCsv}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '0.5px solid var(--cactus-border)',
            background: 'var(--cactus-canvas)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 12 }}>
        {filtered.length} {filtered.length === 1 ? 'invoice' : 'invoices'}
        {filtered.length !== invoices.length && ` (of ${invoices.length})`}
      </div>

      {/* Invoice table */}
      <div style={{
        background: 'var(--cactus-canvas)',
        border: '0.5px solid var(--cactus-border)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 100px 120px 100px 80px 80px 80px 100px',
          background: 'var(--cactus-sand)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '8px 16px',
        }}>
          {['File', 'Carrier', 'Org', 'Status', 'Lines', 'Matched', 'Flagged', 'Amount'].map(h => (
            <div key={h} style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--cactus-muted)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>{h}</div>
          ))}
        </div>

        {/* Table rows */}
        {filtered.length > 0 ? filtered.map((invoice, i) => {
          const status = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.UPLOADED
          const org = invoice.organizations as any
          const hasFlagged = (invoice.flagged_line_items ?? 0) > 0

          return (
            <a
              key={invoice.id}
              href={`/invoices/${invoice.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 120px 100px 80px 80px 80px 100px',
                padding: '10px 16px',
                alignItems: 'center',
                borderBottom: i < (filtered.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                textDecoration: 'none',
                borderLeft: hasFlagged ? '2px solid var(--cactus-bloom)' : '2px solid transparent',
              }}
            >
              {/* File name */}
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--cactus-ink)',
                }}>
                  {invoice.invoice_file_name}
                </div>
                {invoice.invoice_period_start && invoice.invoice_period_end && (
                  <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginTop: 2 }}>
                    {invoice.invoice_period_start} {'\u2192'} {invoice.invoice_period_end}
                  </div>
                )}
              </div>

              {/* Carrier */}
              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                {invoice.carrier_code}
              </div>

              {/* Org */}
              <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                {org?.name ?? '\u2014'}
              </div>

              {/* Status badge */}
              <div>
                <span style={{
                  display: 'inline-flex',
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  color: status.color,
                  background: status.bg,
                  border: '0.5px solid var(--cactus-border)',
                }}>
                  {status.label}
                </span>
              </div>

              {/* Line item counts */}
              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                {invoice.total_line_items ?? '\u2014'}
              </div>

              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                {invoice.matched_line_items ?? '\u2014'}
              </div>

              <div style={{
                fontSize: 13,
                fontWeight: (invoice.flagged_line_items ?? 0) > 0 ? 500 : 400,
                color: (invoice.flagged_line_items ?? 0) > 0
                  ? 'var(--cactus-bloom)'
                  : 'var(--cactus-ink)',
              }}>
                {invoice.flagged_line_items ?? '\u2014'}
              </div>

              {/* Amount */}
              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                {invoice.total_carrier_amount
                  ? `$${Number(invoice.total_carrier_amount).toFixed(2)}`
                  : '\u2014'}
              </div>
            </a>
          )
        }) : (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--cactus-muted)' }}>
              {invoices.length === 0
                ? 'No carrier invoices uploaded yet.'
                : 'No invoices match the current filters.'}
            </div>
            {invoices.length === 0 && (
              <a href="/invoices/upload" style={{
                fontSize: 13,
                color: 'var(--cactus-forest)',
                textDecoration: 'none',
                fontWeight: 500,
                marginTop: 8,
                display: 'inline-block',
              }}>
                Upload your first invoice {'\u2192'}
              </a>
            )}
          </div>
        )}
      </div>
    </>
  )
}
