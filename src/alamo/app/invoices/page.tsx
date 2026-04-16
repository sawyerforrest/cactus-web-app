// ==========================================================
// FILE: src/alamo/app/invoices/page.tsx
// PURPOSE: Invoice list page. Shows all carrier invoices
// uploaded to The Alamo with status, carrier, and line item
// counts. Entry point for the Stage 4 invoice pipeline.
//
// Stage 5: Added weekly billing button and search/filter bar.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import GenerateBillingButton from './GenerateBillingButton'
import InvoiceFilters from './InvoiceFilters'

export default async function InvoicesPage() {
  // WHY: Auth check — every Alamo page requires a logged-in user.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHY: Admin client bypasses RLS — carrier_invoices is
  // internal data, only visible to Cactus admins in The Alamo.
  const admin = createAdminSupabaseClient()

  // Fetch invoices and APPROVED line item count in parallel
  // WHY: We use a real select with .limit(1) instead of head: true
  // because the admin client (createClient) doesn't reliably return
  // the count header with head requests via PostgREST.
  const [{ data: invoices }, { data: approvedCheck }] = await Promise.all([
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
        created_at,
        organizations ( name )
      `)
      .order('created_at', { ascending: false }),
    admin
      .from('invoice_line_items')
      .select('id')
      .eq('billing_status', 'APPROVED')
      .limit(1),
  ])

  const hasApproved = (approvedCheck?.length ?? 0) > 0

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
            Manage carrier invoices and run weekly billing.
          </div>

          {/* Weekly billing button — above the table */}
          <GenerateBillingButton hasApproved={hasApproved} />

          {/* Search/filter bar + invoice table (client component) */}
          <InvoiceFilters invoices={(invoices ?? []) as any} />
        </div>
      </div>
    </div>
  )
}
