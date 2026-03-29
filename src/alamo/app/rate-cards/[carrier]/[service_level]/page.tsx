import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function RateCardDetailPage({
  params,
}: {
  params: Promise<{ carrier: string, service_level: string }>
}) {
  const { carrier, service_level } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  const { data: accounts } = await admin
    .from('org_carrier_accounts')
    .select('id')
    .eq('carrier_code', carrier)

  const accountIds = accounts?.map(a => a.id) ?? []

  const { data: rateCards } = await admin
    .from('rate_cards')
    .select(`
      id,
      nickname,
      service_level,
      effective_date,
      deprecated_date,
      created_at,
      org_carrier_accounts (
        account_nickname,
        markup_percentage,
        use_rate_card,
        organizations ( name )
      )
    `)
    .in('org_carrier_account_id', accountIds)
    .eq('service_level', service_level)
    .order('effective_date', { ascending: false })

  const today = new Date().toISOString().split('T')[0]

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
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <a href="/rate-cards" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>Rate Cards</a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <a href={`/rate-cards/${carrier}`} style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>{carrier}</a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>{service_level}</div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {carrier} — {service_level}
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {rateCards?.length ?? 0} {rateCards?.length === 1 ? 'rate card' : 'rate cards'}
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 100px 100px 100px 80px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
            }}>
              {['Nickname', 'Org', 'Effective', 'Deprecated', 'Added', 'Active'].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {rateCards && rateCards.length > 0 ? rateCards.map((rc, i) => {
              const account = rc.org_carrier_accounts as any
              const org = account?.organizations
              const isActive =
                account?.use_rate_card === true &&
                rc.effective_date <= today &&
                (rc.deprecated_date === null || rc.deprecated_date > today)

              return (
                <div key={rc.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 100px 100px 100px 80px',
                  padding: '10px 16px',
                  alignItems: 'center',
                  borderBottom: i < (rateCards.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {rc.nickname}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {org?.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-ink)', fontFamily: 'var(--font-mono)' }}>
                    {rc.effective_date}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)', fontFamily: 'var(--font-mono)' }}>
                    {rc.deprecated_date ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)', fontFamily: 'var(--font-mono)' }}>
                    {new Date(rc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div>
                    <span style={{
                      display: 'inline-flex', padding: '2px 8px',
                      borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: isActive ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
                      color: isActive ? 'var(--cactus-forest-deep)' : 'var(--cactus-muted)',
                      border: '0.5px solid var(--cactus-border)',
                    }}>
                      {isActive ? 'active' : 'inactive'}
                    </span>
                  </div>
                </div>
              )
            }) : (
              <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--cactus-muted)' }}>
                No rate cards for {carrier} {service_level} yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}