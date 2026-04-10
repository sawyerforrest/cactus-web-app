import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function RateCardsByCarrierPage({
  params,
}: {
  params: Promise<{ carrier: string }>
}) {
  const { carrier } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  // Get all carrier accounts for this carrier
  const { data: accounts } = await admin
    .from('org_carrier_accounts')
    .select('id')
    .eq('carrier_code', carrier)

  const accountIds = accounts?.map(a => a.id) ?? []

  // Get all rate cards for those accounts
  const { data: rateCards } = await admin
    .from('rate_cards')
    .select('service_level')
    .in('org_carrier_account_id', accountIds)

  // Get unique service levels with counts
  const countByService: Record<string, number> = {}
  rateCards?.forEach(rc => {
    countByService[rc.service_level] = (countByService[rc.service_level] ?? 0) + 1
  })

  const serviceLevels = Object.keys(countByService).sort()

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
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <a href="/rate-cards" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>
            Rate Cards
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>{carrier}</div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {carrier} — Service Levels
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {serviceLevels.length} {serviceLevels.length === 1 ? 'service level' : 'service levels'} with rate cards
          </div>

          {serviceLevels.length > 0 ? (
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              {serviceLevels.map((service, i) => (
                <a key={service} href={`/rate-cards/${carrier}/${service}`} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 80px',
                  padding: '12px 16px',
                  alignItems: 'center',
                  borderBottom: i < serviceLevels.length - 1 ? '0.5px solid var(--cactus-border)' : 'none',
                  textDecoration: 'none',
                  background: 'var(--cactus-canvas)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {service}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {countByService[service]} {countByService[service] === 1 ? 'rate card' : 'rate cards'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)', textAlign: 'right' }}>
                    →
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10, padding: '20px 16px',
              fontSize: 13, color: 'var(--cactus-muted)',
            }}>
              No rate cards for {carrier} yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}