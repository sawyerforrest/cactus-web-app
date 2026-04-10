import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function CarrierAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string, carrierId: string }>
}) {
  const { id, carrierId } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!org) redirect('/orgs')

  const { data: account } = await admin
    .from('org_carrier_accounts')
    .select('*')
    .eq('id', carrierId)
    .single()

  if (!account) redirect(`/orgs/${id}`)

  const { data: rateCards } = await admin
    .from('rate_cards')
    .select('*')
    .eq('org_carrier_account_id', carrierId)
    .order('effective_date', { ascending: false })

  const today = new Date().toISOString().split('T')[0]
  const isLassoed = account.carrier_account_mode === 'lassoed_carrier_account'

  return (
    <div style={{
      marginLeft: 200,
      minHeight: '100vh',
      background: 'var(--cactus-sand)',
    }}>
      <Sidebar />

      <div style={{ display: 'flex', flexDirection: 'column' }}>

        {/* Topbar */}
        <div style={{
          background: 'var(--cactus-canvas)',
          borderBottom: '0.5px solid var(--cactus-border)',
          padding: '0 24px', height: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="/orgs" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>Organizations</a>
            <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
            <a href={`/orgs/${id}`} style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>{org.name}</a>
            <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>{account.account_nickname}</div>
          </div>
          <a href={`/orgs/${id}/carriers/${carrierId}/rate-cards/new`} style={{
            background: 'var(--cactus-forest)', color: '#fff',
            padding: '6px 14px', borderRadius: 6,
            fontSize: 12, fontWeight: 500,
            textDecoration: 'none',
          }}>+ Add rate card</a>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Account header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {account.account_nickname}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>{account.carrier_code}</span>
              <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>·</span>
              <span style={{
                display: 'inline-flex', padding: '2px 8px',
                borderRadius: 20, fontSize: 11, fontWeight: 500,
                background: isLassoed ? 'var(--cactus-mint)' : '#E8ECEB',
                color: isLassoed ? 'var(--cactus-forest-deep)' : 'var(--cactus-slate)',
                border: '0.5px solid var(--cactus-border)',
              }}>{isLassoed ? 'lassoed' : 'dark'}</span>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Markup', value: `${(account.markup_percentage * 100).toFixed(1)}%` },
              { label: 'Variance limit', value: `$${account.dispute_threshold.toFixed(2)}` },
              { label: 'Rate cards', value: rateCards?.length ?? 0 },
              { label: 'Rate card pricing', value: account.use_rate_card ? 'on' : 'off' },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--cactus-canvas)',
                border: '0.5px solid var(--cactus-border)',
                borderRadius: 8, padding: '14px 16px',
              }}>
                <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Rate cards table */}
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 10 }}>
            Rate cards
          </div>

          {!account.use_rate_card && (
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderLeft: '2px solid var(--cactus-amber)',
              borderRadius: '0 8px 8px 0',
              padding: '10px 14px', marginBottom: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                Rate card pricing is off — this account uses live carrier API rates
              </div>
            </div>
          )}

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
              {['Nickname', 'Service Level', 'Effective', 'Deprecated', 'Added', 'Active'].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {rateCards && rateCards.length > 0 ? rateCards.map((rc, i) => {
              const isActive =
                account.use_rate_card === true &&
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
                  <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                    {rc.service_level}
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
                No rate cards yet.
                <a href={`/orgs/${id}/carriers/${carrierId}/rate-cards/new`} style={{ color: 'var(--cactus-forest)', marginLeft: 8 }}>
                  Add one →
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}