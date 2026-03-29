import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

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

      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>

        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px', height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Dashboard</div>
          <button style={{
            background: 'var(--cactus-forest)', color: '#fff',
            border: 'none', padding: '6px 14px',
            borderRadius: 6, fontSize: 12, fontWeight: 500,
          }}>+ Add org</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em' }}>
            Good morning, Sawyer
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginTop: 2, marginBottom: 20 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Organizations', value: orgCount ?? 0, delta: 'active tenants' },
              { label: 'Carrier accounts', value: carrierCount ?? 0, delta: '3 lassoed · 1 dark' },
              { label: 'Shipments', value: shipmentCount ?? 0, delta: 'in ledger' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--cactus-canvas)',
                border: '0.5px solid var(--cactus-border)',
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em' }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--cactus-forest)', marginTop: 3 }}>{stat.delta}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10, overflow: 'hidden',
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