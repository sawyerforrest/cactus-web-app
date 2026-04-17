// ==========================================================
// FILE: src/alamo/app/billing/page.tsx
// PURPOSE: Client invoice list page (cactus_invoices). One
// row per invoice. Mirrors the structure of /invoices so the
// two list pages feel like siblings.
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import BillingFilters from './BillingFilters'

export default async function BillingPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  // Embed cactus_invoice_line_items(count) so we get a per-invoice
  // line count in one round trip — no N+1 query.
  const { data: invoices } = await admin
    .from('cactus_invoices')
    .select(`
      id,
      billing_period_start,
      billing_period_end,
      total_amount,
      due_date,
      status,
      created_at,
      organizations ( id, name ),
      cactus_invoice_line_items ( count )
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
            Client Invoices
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>

          <div style={{
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--cactus-ink)',
            letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            Client Invoices
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            One row per cactus_invoice. The internal mirror of the client-facing portal billing view.
          </div>

          <BillingFilters invoices={(invoices ?? []) as any} />
        </div>
      </div>
    </div>
  )
}
