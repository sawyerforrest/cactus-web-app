// ==========================================================
// FILE: src/alamo/app/invoices/[id]/page.tsx
// PURPOSE: Invoice detail page. Shows the uploaded invoice
// status, carrier info, and will host the AI normalization
// review UI once headers are processed.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import MatchButton from './MatchButton'

// Short date for the tight columns on this page. "2026-03-14" →
// "3/14/26". Null / empty input returns an em-dash.
function formatShortDate(value: string | null | undefined): string {
  if (!value) return '\u2014'
  const iso = value.slice(0, 10)
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  const yy = y.slice(-2)
  return `${Number(m)}/${Number(d)}/${yy}`
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UPLOADED:    { label: 'Uploaded',    color: 'var(--cactus-muted)',  bg: 'var(--cactus-sand)' },
  NORMALIZING: { label: 'Normalizing', color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  REVIEW:      { label: 'Review',      color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  APPROVED:    { label: 'Approved',    color: 'var(--cactus-forest)', bg: 'var(--cactus-mint)' },
  PROCESSING:  { label: 'Processing',  color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  COMPLETE:    { label: 'Complete',    color: 'var(--cactus-forest)', bg: 'var(--cactus-mint)' },
  FAILED:      { label: 'Failed',      color: 'var(--cactus-bloom)',  bg: 'var(--cactus-bloom-bg)' },
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // WHY: Auth check — every Alamo page requires a logged-in user.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  // WHY: Fetch the invoice and its line items in parallel
  // so we don't waterfall two sequential database calls.
  const [{ data: invoice }, { data: lineItems }] = await Promise.all([
    admin
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
        ai_processing_notes,
        created_at,
        organizations ( name )
      `)
      .eq('id', id)
      .single(),
      admin
      .from('invoice_line_items')
      .select(`
        id,
        tracking_number,
        carrier_charge,
        billing_status,
        match_status,
        dispute_flag,
        address_sender_normalized,
        variance_amount,
        final_billed_rate,
        service_level,
        date_shipped,
        organizations ( name )
      `)
      .eq('carrier_invoice_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!invoice) redirect('/invoices')

  // WHY: Lookup which cactus_invoices (if any) roll up any line
  // on this carrier invoice. One link per cactus_invoice — a
  // single carrier invoice can contain shipments for multiple
  // orgs (dark accounts), each getting their own client invoice.
  // Link text: "Billed in {org} — week of {week_end M/D/YY} →".
  const lineItemIds = (lineItems ?? []).map(l => l.id)
  type CactusBreadcrumb = {
    cactus_invoice_id: string
    org_name: string | null
    billing_period_end: string | null
  }
  let cactusBreadcrumbs: CactusBreadcrumb[] = []
  if (lineItemIds.length > 0) {
    const { data: junctionRows } = await admin
      .from('cactus_invoice_line_items')
      .select(`
        cactus_invoice_id,
        cactus_invoices (
          billing_period_end,
          organizations ( name )
        )
      `)
      .in('invoice_line_item_id', lineItemIds)

    // Dedupe by cactus_invoice_id — one line per cactus_invoice even
    // if multiple line items on this carrier invoice rolled into it.
    const seen = new Set<string>()
    for (const row of (junctionRows ?? []) as any[]) {
      const cid = row?.cactus_invoice_id as string | null
      if (!cid || seen.has(cid)) continue
      seen.add(cid)
      const cInv = row?.cactus_invoices as
        | { billing_period_end: string | null; organizations: { name: string | null } | null }
        | null
      cactusBreadcrumbs.push({
        cactus_invoice_id: cid,
        org_name: cInv?.organizations?.name ?? null,
        billing_period_end: cInv?.billing_period_end ?? null,
      })
    }
  }

  const status = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.UPLOADED
  const org = invoice.organizations as any

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
          gap: 8,
        }}>
          <a href="/invoices" style={{
            fontSize: 13,
            color: 'var(--cactus-muted)',
            textDecoration: 'none',
          }}>
            Carrier Invoices
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
          }}>
            {invoice.invoice_file_name}
          </div>

          {/* "Billed in..." link — one per cactus_invoice that
              rolls up any line on this carrier invoice. PDF/CSV
              downloads live on the client invoice detail page. */}
          {cactusBreadcrumbs.length > 0 && (
            <div style={{
              marginLeft: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 2,
            }}>
              {cactusBreadcrumbs.map(bc => (
                <a
                  key={bc.cactus_invoice_id}
                  href={`/billing/${bc.cactus_invoice_id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--cactus-muted)',
                    textDecoration: 'none',
                  }}
                >
                  Billed in {bc.org_name ?? 'client invoice'}
                  {bc.billing_period_end &&
                    ` \u2014 week of ${formatShortDate(bc.billing_period_end)}`}
                  <span style={{ marginLeft: 4 }}>{'\u2192'}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Page heading */}
          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            {invoice.invoice_file_name}
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--cactus-muted)',
            marginBottom: 20,
          }}>
            {invoice.carrier_code} · {org?.name ?? 'Unassigned'}
            {invoice.invoice_period_start && invoice.invoice_period_end && (
              <> · {invoice.invoice_period_start} → {invoice.invoice_period_end}</>
            )}
          </div>

          {/* Stat cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}>
            {[
              {
                label: 'Status',
                value: (
                  <span style={{
                    display: 'inline-flex',
                    padding: '2px 10px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    color: status.color,
                    background: status.bg,
                    border: '0.5px solid var(--cactus-border)',
                  }}>
                    {status.label}
                  </span>
                ),
              },
              {
                label: 'Total Amount',
                value: invoice.total_carrier_amount
                  ? `$${Number(invoice.total_carrier_amount).toFixed(2)}`
                  : '—',
              },
              { label: 'Line Items',  value: invoice.total_line_items ?? '—' },
              { label: 'Matched',     value: invoice.matched_line_items ?? '—' },
              {
                label: 'Flagged',
                value: invoice.flagged_line_items ?? '—',
                flagged: (invoice.flagged_line_items ?? 0) > 0,
              },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--cactus-canvas)',
                border: '0.5px solid var(--cactus-border)',
                borderRadius: 8,
                padding: '14px 16px',
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  {card.label}
                </div>
                <div style={{
                  fontSize: 18,
                  fontWeight: 500,
                  // WHY: Flagged count gets bloom color when > 0
                  color: card.flagged
                    ? 'var(--cactus-bloom)'
                    : 'var(--cactus-ink)',
                }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* AI processing notes — shown when present */}
          {invoice.ai_processing_notes && (
            <div style={{
              background: 'var(--cactus-amber-bg)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: 'var(--cactus-ink)',
            }}>
              <span style={{
                fontWeight: 500,
                color: 'var(--cactus-amber)',
                marginRight: 8,
              }}>
                AI Notes:
              </span>
              {invoice.ai_processing_notes}
            </div>
          )}

          {/* WHY: Only show the matching button when parsing is complete.
    COMPLETE = the parser ran and line items exist.
    REVIEW / APPROVED = matching already ran, don't show again.
    The button triggers the matching engine server action. */}

{invoice.status === 'COMPLETE' && (
  <MatchButton invoiceId={id} />
)}

{/* Line items table */}
          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '0.5px solid var(--cactus-border)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--cactus-ink)',
            }}>
              Line Items
            </div>

            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 120px 80px 100px 100px 100px 120px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
            }}>
              {['Tracking / Address', 'Org', 'Service', 'Date Shipped', 'Carrier Charge', 'Billed Amount', 'Variance', 'Status'].map(h => (
                <div key={h} style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Line item rows */}
            {lineItems && lineItems.length > 0 ? lineItems.map((line, i) => {
              const lineOrg = line.organizations as any
              const isDisputed = line.dispute_flag
              const variance = line.variance_amount ? Number(line.variance_amount) : null

              return (
                <div
                  key={line.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 120px 80px 100px 100px 100px 120px',
                    padding: '10px 16px',
                    alignItems: 'center',
                    borderBottom: i < (lineItems.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                    // WHY: Bloom left border on disputed lines only
                    borderLeft: isDisputed ? '2px solid var(--cactus-bloom)' : '2px solid transparent',
                  }}
                >
                  {/* Tracking number or address */}
                  <div style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--cactus-ink)',
                  }}>
                    {line.tracking_number ?? line.address_sender_normalized ?? '—'}
                  </div>

                  {/* Org */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {lineOrg?.name ?? '—'}
                  </div>

                  {/* Service level — 120px max with ellipsis + full-text tooltip */}
                  <div
                    title={line.service_level ?? ''}
                    style={{
                      fontSize: 12,
                      color: 'var(--cactus-muted)',
                      maxWidth: 120,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {line.service_level ?? '—'}
                  </div>

                  {/* Date shipped — short format for space */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {formatShortDate(line.date_shipped)}
                  </div>

                  {/* Carrier charge */}
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    ${Number(line.carrier_charge).toFixed(2)}
                  </div>

                  {/* Billed amount */}
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {line.final_billed_rate
                      ? `$${Number(line.final_billed_rate).toFixed(2)}`
                      : '—'}
                  </div>

                  {/* Variance — bloom when positive (overcharge) */}
                  <div style={{
                    fontSize: 13,
                    fontWeight: variance && variance > 0 ? 500 : 400,
                    color: variance && variance > 0
                      ? 'var(--cactus-bloom)'
                      : 'var(--cactus-ink)',
                  }}>
                    {variance !== null
                      ? `${variance > 0 ? '+' : ''}$${variance.toFixed(2)}`
                      : '—'}
                  </div>

                  {/* Billing status badge */}
                  <div>
                    <span style={{
                      display: 'inline-flex',
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 500,
                      color: line.billing_status === 'APPROVED'
                        ? 'var(--cactus-forest)'
                        : line.billing_status === 'HELD'
                        ? 'var(--cactus-bloom)'
                        : 'var(--cactus-muted)',
                      background: line.billing_status === 'APPROVED'
                        ? 'var(--cactus-mint)'
                        : line.billing_status === 'HELD'
                        ? 'var(--cactus-bloom-bg)'
                        : 'var(--cactus-sand)',
                      border: '0.5px solid var(--cactus-border)',
                    }}>
                      {line.billing_status}
                    </span>
                  </div>
                </div>
              )
            }) : (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                fontSize: 13,
                color: 'var(--cactus-muted)',
              }}>
                No line items yet. AI normalization will populate these after upload.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}