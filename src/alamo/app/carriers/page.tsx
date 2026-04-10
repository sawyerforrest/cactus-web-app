import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

const CARRIERS = ['UPS', 'FEDEX', 'USPS', 'UNIUNI', 'GOFO', 'SHIPX', 'DHL_ECOM', 'DHL_EXPRESS', 'LANDMARK', 'ONTRAC', 'OSM']

export default async function CarriersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: accounts } = await admin
    .from('org_carrier_accounts')
    .select('carrier_code, id')

  // Count accounts per carrier
  const countByCarrier: Record<string, number> = {}
  accounts?.forEach(a => {
    countByCarrier[a.carrier_code] = (countByCarrier[a.carrier_code] ?? 0) + 1
  })

  return (
    <div style={{
      marginLeft: 200,
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px', height: 48,
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Carrier Accounts</div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Carrier Accounts
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            Select a carrier to view all accounts
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            {CARRIERS.map((carrier, i) => {
              const count = countByCarrier[carrier] ?? 0
              return (
                <a key={carrier} href={`/carriers/${carrier}`} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: i < CARRIERS.length - 1 ? '0.5px solid var(--cactus-border)' : 'none',
                  textDecoration: 'none',
                  background: 'var(--cactus-canvas)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {carrier}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {count} {count === 1 ? 'account' : 'accounts'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)', textAlign: 'right' }}>
                    →
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}