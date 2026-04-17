'use client'

// ==========================================================
// FILE: src/alamo/app/billing/BillingFilters.tsx
// PURPOSE: Client-side search, filter bar, CSV export, and
// table for the cactus_invoices list. Filters apply in
// memory — no page reload on change. Mirrors the structure
// of InvoiceFilters so the two list pages feel like siblings.
// ==========================================================

import { useState, useMemo } from 'react'

const INVOICE_STATUSES = ['UNPAID', 'PAID', 'FAILED', 'VOID'] as const

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UNPAID: { label: 'Unpaid', color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  PAID:   { label: 'Paid',   color: 'var(--cactus-forest)', bg: 'var(--cactus-mint)' },
  FAILED: { label: 'Failed', color: 'var(--cactus-bloom)',  bg: 'var(--cactus-bloom-bg)' },
  VOID:   { label: 'Void',   color: 'var(--cactus-muted)',  bg: 'var(--cactus-sand)' },
}

export type CactusInvoiceRow = {
  id: string
  billing_period_start: string
  billing_period_end: string
  total_amount: string | null
  due_date: string
  status: string
  created_at: string
  organizations: { id: string; name: string } | null
  cactus_invoice_line_items: { count: number }[] | null
}

type BillingFiltersProps = {
  invoices: CactusInvoiceRow[]
}

export default function BillingFilters({ invoices }: BillingFiltersProps) {
  const [search, setSearch] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Build the org dropdown from the data so we never show
  // an org that has no invoices on the page.
  const orgOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const inv of invoices) {
      const org = inv.organizations
      if (org?.id && !map.has(org.id)) {
        map.set(org.id, org.name)
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [invoices])

  const filtered = useMemo(() => {
    let rows = invoices

    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter((r) =>
        (r.organizations?.name ?? '').toLowerCase().includes(q),
      )
    }

    if (orgFilter) {
      rows = rows.filter((r) => r.organizations?.id === orgFilter)
    }

    if (statusFilter) {
      rows = rows.filter((r) => r.status === statusFilter)
    }

    // Date range applies to billing_period_start (the date the
    // invoice's billing window opens), not created_at — this
    // matches what a client would expect when searching
    // "show me April invoices."
    if (dateFrom) {
      rows = rows.filter((r) => r.billing_period_start >= dateFrom)
    }

    if (dateTo) {
      rows = rows.filter((r) => r.billing_period_start <= dateTo)
    }

    return rows
  }, [invoices, search, orgFilter, statusFilter, dateFrom, dateTo])

  function lineItemCount(inv: CactusInvoiceRow): number {
    return inv.cactus_invoice_line_items?.[0]?.count ?? 0
  }

  function handleExportCsv() {
    const headers = [
      'Org', 'Billing Period Start', 'Billing Period End',
      'Total Due', 'Line Items', 'Due Date', 'Status', 'Created',
    ]

    const csvRows = [headers.join(',')]

    for (const inv of filtered) {
      const orgName = inv.organizations?.name ?? ''
      csvRows.push([
        `"${orgName.replace(/"/g, '""')}"`,
        inv.billing_period_start,
        inv.billing_period_end,
        inv.total_amount ?? '',
        lineItemCount(inv),
        inv.due_date,
        inv.status,
        inv.created_at,
      ].join(','))
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cactus-invoices-${new Date().toISOString().split('T')[0]}.csv`
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
        <input
          type="text"
          placeholder="Search org name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...selectStyle, flex: '1 1 200px', minWidth: 180 }}
        />

        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Orgs</option>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

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

        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: 'var(--cactus-muted)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={selectStyle}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: 'var(--cactus-muted)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={selectStyle}
          />
        </label>

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
          gridTemplateColumns: '1.6fr 1.4fr 110px 80px 110px 100px 100px',
          background: 'var(--cactus-sand)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '8px 16px',
        }}>
          {['Org', 'Billing Period', 'Total Due', 'Lines', 'Due Date', 'Status', 'Created'].map(h => (
            <div key={h} style={{
              fontSize: 11, fontWeight: 500,
              color: 'var(--cactus-muted)',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>{h}</div>
          ))}
        </div>

        {filtered.length > 0 ? filtered.map((inv, i) => {
          const status = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.UNPAID
          const orgName = inv.organizations?.name ?? '—'
          const lines = lineItemCount(inv)
          const isLast = i === filtered.length - 1

          return (
            <a
              key={inv.id}
              href={`/billing/${inv.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1.4fr 110px 80px 110px 100px 100px',
                padding: '10px 16px',
                alignItems: 'center',
                borderBottom: isLast ? 'none' : '0.5px solid var(--cactus-border)',
                textDecoration: 'none',
                borderLeft: '2px solid transparent',
              }}
            >
              {/* Org */}
              <div style={{
                fontSize: 13, fontWeight: 500,
                color: 'var(--cactus-ink)',
              }}>
                {orgName}
              </div>

              {/* Billing period */}
              <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                {inv.billing_period_start} {'\u2192'} {inv.billing_period_end}
              </div>

              {/* Total due */}
              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                {inv.total_amount
                  ? `$${Number(inv.total_amount).toLocaleString('en-US', {
                      minimumFractionDigits: 2, maximumFractionDigits: 2,
                    })}`
                  : '\u2014'}
              </div>

              {/* Line items */}
              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                {lines.toLocaleString('en-US')}
              </div>

              {/* Due date */}
              <div style={{ fontSize: 12, color: 'var(--cactus-ink)' }}>
                {inv.due_date}
              </div>

              {/* Status */}
              <div>
                <span style={{
                  display: 'inline-flex',
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontSize: 11, fontWeight: 500,
                  color: status.color,
                  background: status.bg,
                  border: '0.5px solid var(--cactus-border)',
                }}>
                  {status.label}
                </span>
              </div>

              {/* Created */}
              <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                {inv.created_at.slice(0, 10)}
              </div>
            </a>
          )
        }) : (
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--cactus-muted)' }}>
              {invoices.length === 0
                ? 'No client invoices yet. Run weekly billing on the Carrier Invoices page to generate one.'
                : 'No invoices match the current filters.'}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
