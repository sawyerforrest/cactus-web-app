// ==========================================================
// FILE: src/alamo/app/dashboard/page.tsx
// PURPOSE: The Alamo dashboard — rebuilt in Cactus design system.
// ==========================================================

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count: orgCount } = await supabase
    .from('organizations')
    .select('*', { count: 'exact', head: true })

  const { count: carrierCount } = await supabase
    .from('org_carrier_accounts')
    .select('*', { count: 'exact', head: true })

  const { count: shipmentCount } = await supabase
    .from('shipment_ledger')
    .select('*', { count: 'exact', head: true })

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>

      {/* Sidebar */}
      <div style={{
        background: 'var(--cactus-canvas)',
        borderRight: '0.5px solid var(--cactus-border)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '0.5px solid var(--cactus-border)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cactus-forest)', letterSpacing: '-0.01em' }}>cactus</div>
          <div style={{ fontSize: 11, color: 'var(--cactus-hint)', marginTop: 2, letterSpacing: '0.04em' }}>the alamo</div>
        </div>

        <nav style={{ padding: '12px 8px 4px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--cactus-hint)', textTransform: 'uppercase', padding: '0 8px', marginBottom: 4 }}>workspace</div>
          {[
            { label: 'Dashboard', active: true },
            { label: 'Organizations' },
            { label: 'Carrier Accounts' },
            { label: 'Rate Cards' },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              fontSize: 13,
              background: item.active ? 'var(--cactus-mint)' : 'transparent',
              color: item.active ? 'var(--cactus-forest)' : 'var(--cactus-slate)',
              fontWeight: item.active ? 500 : 400,
              marginBottom: 1,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: item.active ? 1 : 0.25 }} />
              {item.label}
            </div>
          ))}
        </nav>

        <nav style={{ padding: '12px 8px 4px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--cactus-hint)', textTransform: 'uppercase', padding: '0 8px', marginBottom: 4 }}>billing</div>
          {['Invoices', 'Disputes', 'Meter Health'].map(label => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              fontSize: 13, color: 'var(--cactus-slate)',
              marginBottom: 1,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.25 }} />
              {label}
            </div>
          ))}
        </nav>

        <nav style={{ padding: '12px 8px 4px' }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.07em', color: 'var(--cactus-hint)', textTransform: 'uppercase', padding: '0 8px', marginBottom: 4 }}>tools</div>
          {['PLD/Rate Analysis', 'Audit Log'].map(label => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              fontSize: 13, color: 'var(--cactus-slate)',
              marginBottom: 1,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.25 }} />
              {label}
            </div>
          ))}
        </nav>

        <div style={{
          marginTop: 'auto',
          padding: '12px 16px',
          borderTop: '0.5px solid var(--cactus-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--cactus-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 500, color: 'var(--cactus-forest)',
            flexShrink: 0,
          }}>SF</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cactus-ink)' }}>Sawyer</div>
            <div style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>admin</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Topbar */}
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Dashboard</div>
          <button style={{
            background: 'var(--cactus-forest)',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
          }}>+ Add org</button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em' }}>
            Good morning, Sawyer
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginTop: 2, marginBottom: 20 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Organizations', value: orgCount ?? 0, delta: 'active tenants' },
              { label: 'Carrier accounts', value: carrierCount ?? 0, delta: '3 lassoed · 1 dark' },
              { label: 'Shipments', value: shipmentCount ?? 0, delta: 'in ledger' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--cactus-canvas)',
                border: '0.5px solid var(--cactus-border)',
                borderRadius: 8,
                padding: '14px 16px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em' }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--cactus-forest)', marginTop: 3 }}>{stat.delta}</div>
              </div>
            ))}
          </div>

          {/* Placeholder card */}
          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '0.5px solid var(--cactus-border)',
              fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)',
            }}>Recent activity</div>
            <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--cactus-muted)' }}>
              Invoice pipeline and org management coming in Stage 3.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}