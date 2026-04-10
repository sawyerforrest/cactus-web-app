import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function CarrierDetailPage({
  params,
}: {
  params: Promise<{ carrier: string }>
}) {
  const { carrier } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: accounts } = await admin
    .from('org_carrier_accounts')
    .select(`
      id,
      account_nickname,
      carrier_account_mode,
      markup_percentage,
      dispute_threshold,
      use_rate_card,
      is_cactus_account,
      is_active,
      organizations ( name )
    `)
    .eq('carrier_code', carrier)
    .order('created_at', { ascending: true })

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
          <a href="/carriers" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>
            Carrier Accounts
          </a>
          <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>{carrier}</div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            {carrier}
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {accounts?.length ?? 0} {accounts?.length === 1 ? 'account' : 'accounts'}
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 120px 80px 80px 80px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
            }}>
              {['Nickname', 'Org', 'Mode', 'Markup', 'Variance Limit', 'Rate Cards'].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {accounts && accounts.length > 0 ? accounts.map((account, i) => {
              const isLassoed = account.carrier_account_mode === 'lassoed_carrier_account'
              const org = account.organizations as any
              return (
                <div key={account.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 120px 80px 80px 80px',
                  padding: '10px 16px',
                  alignItems: 'center',
                  borderBottom: i < (accounts.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {account.account_nickname}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {org?.name}
                  </div>
                  <div>
                    <span style={{
                      display: 'inline-flex', padding: '2px 8px',
                      borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: isLassoed ? 'var(--cactus-mint)' : '#E8ECEB',
                      color: isLassoed ? 'var(--cactus-forest-deep)' : 'var(--cactus-slate)',
                      border: '0.5px solid var(--cactus-border)',
                    }}>
                      {isLassoed ? 'lassoed' : 'dark'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {(account.markup_percentage * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    ${account.dispute_threshold.toFixed(2)}
                  </div>
                  <div>
                    <span style={{
                      display: 'inline-flex', padding: '2px 8px',
                      borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: account.use_rate_card ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
                      color: account.use_rate_card ? 'var(--cactus-forest-deep)' : 'var(--cactus-muted)',
                      border: '0.5px solid var(--cactus-border)',
                    }}>
                      {account.use_rate_card ? 'on' : 'off'}
                    </span>
                  </div>
                </div>
              )
            }) : (
              <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--cactus-muted)' }}>
                No accounts for {carrier} yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}