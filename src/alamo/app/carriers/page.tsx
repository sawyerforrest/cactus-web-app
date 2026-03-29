import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function CarriersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()
  const { data: accounts } = await admin
    .from('org_carrier_accounts')
    .select(`
      id,
      carrier_code,
      account_nickname,
      carrier_account_mode,
      markup_percentage,
      dispute_threshold,
      is_cactus_account,
      is_active,
      organizations ( name )
    `)
    .order('created_at', { ascending: true })

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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Carrier Accounts</div>
          <a href="/carriers/new" style={{
            background: 'var(--cactus-forest)', color: '#fff',
            padding: '6px 14px', borderRadius: 6,
            fontSize: 12, fontWeight: 500,
            textDecoration: 'none',
          }}>+ Add account</a>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Carrier Accounts
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {accounts?.length ?? 0} total
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 120px 80px 80px 80px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
            }}>
              {['Account', 'Carrier', 'Mode', 'Markup', 'Threshold', 'Status'].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {accounts?.map((account, i) => {
              const isLassoed = account.carrier_account_mode === 'lassoed_carrier_account'
              const org = account.organizations as any

              return (
                <div key={account.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 120px 80px 80px 80px',
                  padding: '10px 16px',
                  alignItems: 'center',
                  borderBottom: i < (accounts.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                      {account.account_nickname}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginTop: 1 }}>
                      {org?.name}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {account.carrier_code}
                  </div>

                  <div>
                    <span style={{
                      display: 'inline-flex', padding: '2px 8px',
                      borderRadius: 20, fontSize: 11, fontWeight: 500,
                      background: isLassoed ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
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
                      background: account.is_active ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
                      color: account.is_active ? 'var(--cactus-forest-deep)' : 'var(--cactus-muted)',
                      border: '0.5px solid var(--cactus-border)',
                    }}>
                      {account.is_active ? 'active' : 'inactive'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}