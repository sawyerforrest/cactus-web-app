// =============================================================
// FILE: src/alamo/app/invoices/[id]/disputes/page.tsx
// PURPOSE: Disputes review page for a carrier invoice.
//
// WHAT THIS PAGE SHOWS:
// All HELD line items for this invoice, grouped by their
// dispute reason. Each group has resolution controls that
// let the admin assign the correct org and approve the items.
//
// GROUPING LOGIC:
// Line items are grouped by dispute_notes. Items with the
// same note have the same root cause and can be resolved
// together in one action — the admin picks the org once
// and all items in the group are approved.
//
// ACCESS: The Alamo admin only. Auth checked on load.
// =============================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import ResolveGroup from './ResolveGroup'

export default async function DisputesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Auth check
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  // Load invoice, held line items, and all orgs in parallel
  const [
    { data: invoice },
    { data: heldItems },
    { data: orgs },
  ] = await Promise.all([
    admin
      .from('carrier_invoices')
      .select('id, invoice_file_name, carrier_code, flagged_line_items, status')
      .eq('id', id)
      .single(),

    admin
      .from('invoice_line_items')
      .select(
        'id, tracking_number, address_sender_normalized, ' +
        'carrier_charge, dispute_notes, match_status'
      )
      .eq('carrier_invoice_id', id)
      .eq('billing_status', 'HELD')
      .order('created_at', { ascending: true }),

    // Load all active orgs for the org selector dropdown
    admin
      .from('organizations')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])

  if (!invoice) redirect('/invoices')

  // If no held items, redirect back to the invoice
  // (nothing to review here)
  if (!heldItems || heldItems.length === 0) {
    redirect(`/invoices/${id}`)
  }

  // =============================================================
  // GROUP LINE ITEMS BY DISPUTE REASON
  //
  // Items with identical dispute_notes share the same root cause
  // and can be resolved together. We build a Map keyed by the
  // dispute note string, with arrays of line items as values.
  // =============================================================

  const groups = new Map<string, typeof heldItems>()

  for (const item of heldItems) {
    const key = item.dispute_notes ?? 'Unknown dispute reason'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  const groupEntries = Array.from(groups.entries())

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
          <a
            href={`/invoices/${id}`}
            style={{
              fontSize: 13,
              color: 'var(--cactus-muted)',
              textDecoration: 'none',
            }}
          >
            {invoice.invoice_file_name}
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
          }}>
            Disputes
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
            Dispute Review
          </div>
          <div style={{
            fontSize: 13,
            color: 'var(--cactus-muted)',
            marginBottom: 20,
          }}>
            {invoice.invoice_file_name} · {invoice.carrier_code} ·{' '}
            <span style={{ color: 'var(--cactus-bloom)', fontWeight: 500 }}>
              {heldItems.length} item{heldItems.length !== 1 ? 's' : ''} held
            </span>
            {' '}across {groupEntries.length} dispute {groupEntries.length !== 1 ? 'groups' : 'group'}
          </div>

          {/* Summary banner */}
          <div style={{
            background: 'var(--cactus-bloom-bg)',
            border: '0.5px solid var(--cactus-bloom-border)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 24,
            fontSize: 13,
            color: 'var(--cactus-bloom-mid)',
          }}>
            <span style={{ fontWeight: 500, color: 'var(--cactus-bloom)' }}>
              Action required.
            </span>{' '}
            The matching engine could not automatically assign these line items.
            Review each group below, select the correct org, and approve.
            Once all disputes are resolved, the invoice will move to Approved
            and be ready for invoice generation.
          </div>

          {/* Dispute groups */}
          {groupEntries.map(([disputeReason, items], index) => (
            <ResolveGroup
              key={index}
              groupIndex={index}
              disputeReason={disputeReason}
              lineItems={items.map(item => ({
                id: item.id,
                tracking_number: item.tracking_number,
                address_sender_normalized: item.address_sender_normalized,
                carrier_charge: item.carrier_charge,
              }))}
              orgs={orgs ?? []}
              carrierCode={invoice.carrier_code}
              carrierInvoiceId={id}
              resolvedBy={user.id}
            />
          ))}

          {/* Back link */}
          <div style={{ marginTop: 8 }}>
            <a
              href={`/invoices/${id}`}
              style={{
                fontSize: 13,
                color: 'var(--cactus-muted)',
                textDecoration: 'none',
              }}
            >
              ← Back to invoice
            </a>
          </div>

        </div>
      </div>
    </div>
  )
}