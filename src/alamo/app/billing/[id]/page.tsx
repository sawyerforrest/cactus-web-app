// ==========================================================
// FILE: src/alamo/app/billing/[id]/page.tsx
// PURPOSE: Detail page for a single cactus_invoice. Top-line
// stats, two summary breakdowns (by carrier, by origin
// location), and the full per-line items table with the
// lassoed/dark display rule applied per row.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Decimal from 'decimal.js'
import Sidebar from '@/components/Sidebar'
import DownloadPDFButton from './DownloadPDFButton'
import DownloadCSVButton from './DownloadCSVButton'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  UNPAID: { label: 'Unpaid', color: 'var(--cactus-amber)',  bg: 'var(--cactus-amber-bg)' },
  PAID:   { label: 'Paid',   color: 'var(--cactus-forest)', bg: 'var(--cactus-mint)' },
  FAILED: { label: 'Failed', color: 'var(--cactus-bloom)',  bg: 'var(--cactus-bloom-bg)' },
  VOID:   { label: 'Void',   color: 'var(--cactus-muted)',  bg: 'var(--cactus-sand)' },
}

function formatMoney(value: Decimal | string | number | null): string {
  if (value === null || value === undefined) return '\u2014'
  const d = value instanceof Decimal ? value : new Decimal(value)
  return `$${d.toNumber().toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`
}

type SummaryRow = { key: string; shipments: number; amount: Decimal }

export default async function BillingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  // Single round trip for header + line items.
  const [{ data: invoice }, { data: lineRows }] = await Promise.all([
    admin
      .from('cactus_invoices')
      .select(`
        id,
        billing_period_start,
        billing_period_end,
        total_amount,
        due_date,
        status,
        created_at,
        organizations ( id, name )
      `)
      .eq('id', id)
      .single(),
    admin
      .from('cactus_invoice_line_items')
      .select(`
        invoice_line_items (
          id,
          tracking_number,
          service_level,
          date_shipped,
          weight_billed,
          zone,
          carrier_charge,
          final_billed_rate,
          org_carrier_accounts (
            carrier_account_mode,
            carrier_code
          ),
          locations (
            name
          )
        )
      `)
      .eq('cactus_invoice_id', id),
  ])

  if (!invoice) redirect('/billing')

  // Flatten the junction wrapper down to the line item itself.
  type LineItem = {
    id: string
    tracking_number: string | null
    service_level: string | null
    date_shipped: string | null
    weight_billed: string | null
    zone: string | null
    carrier_charge: string
    final_billed_rate: string | null
    org_carrier_accounts: {
      carrier_account_mode: string | null
      carrier_code: string | null
    } | null
    locations: { name: string } | null
  }
  const lines: LineItem[] = (lineRows ?? [])
    .map((r: any) => r.invoice_line_items)
    .filter((l: any): l is LineItem => l != null)

  // ------- aggregate by carrier and by origin location -------
  const byCarrier = new Map<string, SummaryRow>()
  const byLocation = new Map<string, SummaryRow>()

  for (const line of lines) {
    const amount = new Decimal(line.final_billed_rate ?? 0)

    const carrierKey = line.org_carrier_accounts?.carrier_code ?? 'UNKNOWN'
    const c = byCarrier.get(carrierKey)
    if (c) { c.shipments += 1; c.amount = c.amount.plus(amount) }
    else byCarrier.set(carrierKey, { key: carrierKey, shipments: 1, amount })

    const locationKey = line.locations?.name ?? 'Unknown'
    const l = byLocation.get(locationKey)
    if (l) { l.shipments += 1; l.amount = l.amount.plus(amount) }
    else byLocation.set(locationKey, { key: locationKey, shipments: 1, amount })
  }

  const carrierRows = [...byCarrier.values()].sort((a, b) => b.amount.cmp(a.amount))
  const locationRows = [...byLocation.values()].sort((a, b) => b.amount.cmp(a.amount))

  const status = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.UNPAID
  const org = (invoice as any).organizations
  const orgName = org?.name ?? 'Unknown Org'
  const shortId = id.slice(0, 8).toUpperCase()
  const totalLines = lines.length

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
          <a href="/billing" style={{
            fontSize: 13,
            color: 'var(--cactus-muted)',
            textDecoration: 'none',
          }}>
            Client Invoices
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            fontFamily: 'var(--font-mono)',
          }}>
            {shortId}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <DownloadCSVButton cactusInvoiceId={id} />
            <DownloadPDFButton cactusInvoiceId={id} />
          </div>
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
            {orgName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            Invoice {shortId} · {invoice.billing_period_start} {'\u2192'} {invoice.billing_period_end}
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
              { label: 'Total Due',  value: formatMoney(invoice.total_amount) },
              { label: 'Line Items', value: totalLines.toLocaleString('en-US') },
              { label: 'Due Date',   value: invoice.due_date },
              { label: 'Created',    value: invoice.created_at.slice(0, 10) },
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
                  color: 'var(--cactus-ink)',
                }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          {/* Summary cards — side by side */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 24,
          }}>
            <SummaryCard
              title="By Carrier"
              firstColLabel="Carrier"
              rows={carrierRows}
            />
            <SummaryCard
              title="By Origin Location"
              firstColLabel="Location"
              rows={locationRows}
            />
          </div>

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
              gridTemplateColumns: '1.6fr 70px 90px 100px 1.2fr 70px 60px 100px 100px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
            }}>
              {[
                'Tracking', 'Carrier', 'Service', 'Date Shipped',
                'Origin Location', 'Weight', 'Zone', 'Carrier Charge', 'Final Amount',
              ].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {lines.length > 0 ? lines.map((line, i) => {
              const isLassoed = line.org_carrier_accounts?.carrier_account_mode === 'lassoed_carrier_account'
              const isLast = i === lines.length - 1

              return (
                <div
                  key={line.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 70px 90px 100px 1.2fr 70px 60px 100px 100px',
                    padding: '8px 16px',
                    alignItems: 'center',
                    borderBottom: isLast ? 'none' : '0.5px solid var(--cactus-border)',
                  }}
                >
                  {/* Tracking */}
                  <div style={{
                    fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--cactus-ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {line.tracking_number ?? '\u2014'}
                  </div>

                  {/* Carrier */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-ink)' }}>
                    {line.org_carrier_accounts?.carrier_code ?? '\u2014'}
                  </div>

                  {/* Service level — truncates in its 90px grid
                      slot; hover reveals the full value. */}
                  <div
                    title={line.service_level ?? ''}
                    style={{
                      fontSize: 12,
                      color: 'var(--cactus-muted)',
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {line.service_level ?? '\u2014'}
                  </div>

                  {/* Date shipped */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {line.date_shipped ?? '\u2014'}
                  </div>

                  {/* Origin location */}
                  <div style={{
                    fontSize: 12,
                    color: 'var(--cactus-ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {line.locations?.name ?? '\u2014'}
                  </div>

                  {/* Weight */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {line.weight_billed != null ? Number(line.weight_billed).toFixed(2) : '\u2014'}
                  </div>

                  {/* Zone */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {line.zone ?? '\u2014'}
                  </div>

                  {/* Carrier charge — empty for lassoed lines */}
                  <div style={{ fontSize: 12, color: 'var(--cactus-ink)' }}>
                    {isLassoed
                      ? ''
                      : `$${Number(line.carrier_charge).toFixed(2)}`}
                  </div>

                  {/* Final amount */}
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {line.final_billed_rate
                      ? `$${Number(line.final_billed_rate).toFixed(2)}`
                      : '\u2014'}
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
                No line items on this invoice.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  title, firstColLabel, rows,
}: {
  title: string
  firstColLabel: string
  rows: SummaryRow[]
}) {
  return (
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
        {title}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.6fr 90px 110px',
        background: 'var(--cactus-sand)',
        borderBottom: '0.5px solid var(--cactus-border)',
        padding: '8px 16px',
      }}>
        {[firstColLabel, 'Shipments', 'Amount'].map((h, idx) => (
          <div key={h} style={{
            fontSize: 11, fontWeight: 500,
            color: 'var(--cactus-muted)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            textAlign: idx === 0 ? 'left' : 'right',
          }}>{h}</div>
        ))}
      </div>

      {rows.length > 0 ? rows.map((row, i) => {
        const isLast = i === rows.length - 1
        return (
          <div key={row.key} style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr 90px 110px',
            padding: '8px 16px',
            alignItems: 'center',
            borderBottom: isLast ? 'none' : '0.5px solid var(--cactus-border)',
          }}>
            <div style={{
              fontSize: 13, color: 'var(--cactus-ink)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {row.key}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--cactus-muted)',
              textAlign: 'right',
            }}>
              {row.shipments.toLocaleString('en-US')}
            </div>
            <div style={{
              fontSize: 13, color: 'var(--cactus-ink)',
              textAlign: 'right',
            }}>
              {`$${row.amount.toNumber().toLocaleString('en-US', {
                minimumFractionDigits: 2, maximumFractionDigits: 2,
              })}`}
            </div>
          </div>
        )
      }) : (
        <div style={{
          padding: '20px 16px',
          textAlign: 'center',
          fontSize: 12,
          color: 'var(--cactus-muted)',
        }}>
          No data
        </div>
      )}
    </div>
  )
}
