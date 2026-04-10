// ==========================================================
// FILE: src/alamo/app/invoices/page.tsx
// PURPOSE: Invoice list page. Shows all carrier invoices
// uploaded to The Alamo with status, carrier, and line item
// counts. Entry point for the Stage 4 invoice pipeline.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

// WHY: Maps database status values to human-readable labels
// and the correct design system color for each state.
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UPLOADED:    { label: 'Uploaded',    color: 'var(--cactus-muted)',       bg: 'var(--cactus-sand)' },
  NORMALIZING: { label: 'Normalizing', color: 'var(--cactus-amber)',       bg: 'var(--cactus-amber-bg)' },
  REVIEW:      { label: 'Review',      color: 'var(--cactus-amber)',       bg: 'var(--cactus-amber-bg)' },
  APPROVED:    { label: 'Approved',    color: 'var(--cactus-forest)',      bg: 'var(--cactus-mint)' },
  PROCESSING:  { label: 'Processing',  color: 'var(--cactus-amber)',       bg: 'var(--cactus-amber-bg)' },
  COMPLETE:    { label: 'Complete',    color: 'var(--cactus-forest)',      bg: 'var(--cactus-mint)' },
  FAILED:      { label: 'Failed',      color: 'var(--cactus-bloom)',       bg: 'var(--cactus-bloom-bg)' },
}

export default async function InvoicesPage() {
  // WHY: Auth check — every Alamo page requires a logged-in user.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHY: Admin client bypasses RLS — carrier_invoices is
  // internal data, only visible to Cactus admins in The Alamo.
  const admin = createAdminSupabaseClient()
  const { data: invoices } = await admin
    .from('carrier_invoices')
    .select(`
      id,
      invoice_file_name,
      carrier_code,
      status,
      total_carrier_amount,
      total_line_items,
      matched_line_items,
      flagged_line_items,
      invoice_period_start,
      invoice_period_end,
      created_at,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })

  return (
    <div style={{
      marginLeft: 200,
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Breadcrumb bar */}
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
            Carrier Invoices
          </div>
          {/* WHY: Upload button lives here so it's always visible
              regardless of how many invoices exist. */}
          <a href="/invoices/upload" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 6,
            background: 'var(--cactus-forest)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
          }}>
            + Upload Invoice
          </a>
        </div>

        {/* Page content */}
        <div style={{ padding: '20px 24px' }}>

          {/* Page heading */}
          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            Carrier Invoices
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {invoices?.length ?? 0} {invoices?.length === 1 ? 'invoice' : 'invoices'}
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
            {invoices && invoices.length > 0 ? invoices.map((invoice, i) => {
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
                    borderBottom: i < (invoices.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                    textDecoration: 'none',
                    // WHY: Bloom left border only on rows with flagged
                    // line items — the one moment color goes structural.
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
                        {invoice.invoice_period_start} → {invoice.invoice_period_end}
                      </div>
                    )}
                  </div>

                  {/* Carrier */}
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {invoice.carrier_code}
                  </div>

                  {/* Org */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {org?.name ?? '—'}
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
                    {invoice.total_line_items ?? '—'}
                  </div>

                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {invoice.matched_line_items ?? '—'}
                  </div>

                  {/* WHY: Flagged count gets bloom color when > 0
                      because flagged items require human attention. */}
                  <div style={{
                    fontSize: 13,
                    fontWeight: (invoice.flagged_line_items ?? 0) > 0 ? 500 : 400,
                    color: (invoice.flagged_line_items ?? 0) > 0
                      ? 'var(--cactus-bloom)'
                      : 'var(--cactus-ink)',
                  }}>
                    {invoice.flagged_line_items ?? '—'}
                  </div>

                  {/* Amount */}
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {invoice.total_carrier_amount
                      ? `$${Number(invoice.total_carrier_amount).toFixed(2)}`
                      : '—'}
                  </div>
                </a>
              )
            }) : (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 8 }}>
                  No carrier invoices uploaded yet.
                </div>
                <a href="/invoices/upload" style={{
                  fontSize: 13,
                  color: 'var(--cactus-forest)',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}>
                  Upload your first invoice →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}