import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { formatMarkup } from '@/lib/markup'

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminSupabaseClient()

  const { data: org } = await admin
    .from('organizations')
    .select('*')
    .eq('id', id)
    .single()

  if (!org) redirect('/orgs')

  const { data: carriers } = await admin
    .from('org_carrier_accounts')
    .select('*')
    .eq('org_id', id)
    .order('created_at', { ascending: true })

  const { data: locations } = await admin
    .from('locations')
    .select('*')
    .eq('org_id', id)
    .order('created_at', { ascending: true })

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
            <a href="/orgs" style={{ fontSize: 13, color: 'var(--cactus-muted)', textDecoration: 'none' }}>
              Organizations
            </a>
            <span style={{ color: 'var(--cactus-border)', fontSize: 13 }}>/</span>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>{org.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/orgs/${id}/locations/new`} style={{
              color: 'var(--cactus-muted)',
              border: '0.5px solid var(--cactus-border-mid)',
              padding: '6px 12px', borderRadius: 6,
              fontSize: 12, textDecoration: 'none',
            }}>+ Add location</a>
            <a href={`/orgs/${id}/carriers/new`} style={{
              background: 'var(--cactus-forest)', color: '#fff',
              padding: '6px 14px', borderRadius: 6,
              fontSize: 12, fontWeight: 500,
              textDecoration: 'none',
            }}>+ Add carrier account</a>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Org header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
              {org.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', padding: '2px 8px',
                borderRadius: 20, fontSize: 11, fontWeight: 500,
                background: org.org_type === '3PL' ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
                color: org.org_type === '3PL' ? 'var(--cactus-forest-deep)' : 'var(--cactus-slate)',
                border: '0.5px solid var(--cactus-border)',
              }}>{org.org_type}</span>
              <span style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>Net-{org.terms_days}</span>
              <span style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>·</span>
              <span style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                {org.is_active ? 'active' : 'inactive'}
              </span>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Carrier accounts', value: carriers?.length ?? 0 },
              { label: 'Locations', value: locations?.length ?? 0 },
              { label: 'Payment terms', value: `Net-${org.terms_days}` },
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

          {/* Carrier accounts */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 10 }}>
              Carrier accounts
            </div>
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 120px 80px 80px 80px',
                background: 'var(--cactus-sand)',
                borderBottom: '0.5px solid var(--cactus-border)',
                padding: '8px 16px',
              }}>
                {['Nickname', 'Carrier', 'Mode', 'Markup', 'Variance Limit', 'Rate Cards'].map(h => (
                  <div key={h} style={{
                    fontSize: 11, fontWeight: 500,
                    color: 'var(--cactus-muted)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>{h}</div>
                ))}
              </div>

              {carriers && carriers.length > 0 ? carriers.map((carrier, i) => {
                const isLassoed = carrier.carrier_account_mode === 'lassoed_carrier_account'
                return (
                  <a key={carrier.id} href={`/orgs/${id}/carriers/${carrier.id}`} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 120px 80px 80px 80px',
                    padding: '10px 16px',
                    alignItems: 'center',
                    borderBottom: i < (carriers.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                    textDecoration: 'none',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-forest)' }}>
                      {carrier.account_nickname}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                      {carrier.carrier_code}
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
                      {formatMarkup(carrier)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                      ${carrier.dispute_threshold.toFixed(2)}
                    </div>
                    <div>
                      <span style={{
                        display: 'inline-flex', padding: '2px 8px',
                        borderRadius: 20, fontSize: 11, fontWeight: 500,
                        background: carrier.use_rate_card ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
                        color: carrier.use_rate_card ? 'var(--cactus-forest-deep)' : 'var(--cactus-muted)',
                        border: '0.5px solid var(--cactus-border)',
                      }}>
                        {carrier.use_rate_card ? 'on' : 'off'}
                      </span>
                    </div>
                  </a>
                )
              }) : (
                <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--cactus-muted)' }}>
                  No carrier accounts yet.
                  <a href={`/orgs/${id}/carriers/new`} style={{ color: 'var(--cactus-forest)', marginLeft: 8 }}>
                    Add one →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Locations */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)', marginBottom: 10 }}>
              Locations
            </div>
            <div style={{
              background: 'var(--cactus-canvas)',
              border: '0.5px solid var(--cactus-border)',
              borderRadius: 10, overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 100px',
                background: 'var(--cactus-sand)',
                borderBottom: '0.5px solid var(--cactus-border)',
                padding: '8px 16px',
              }}>
                {['Name', 'Address', 'Type'].map(h => (
                  <div key={h} style={{
                    fontSize: 11, fontWeight: 500,
                    color: 'var(--cactus-muted)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}>{h}</div>
                ))}
              </div>

              {locations && locations.length > 0 ? locations.map((location, i) => (
                <div key={location.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 100px',
                  padding: '10px 16px',
                  alignItems: 'center',
                  borderBottom: i < (locations.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {location.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)', fontFamily: 'var(--font-mono)' }}>
                    {location.city}, {location.state} {location.postal_code}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cactus-muted)' }}>
                    {location.location_type}
                  </div>
                </div>
              )) : (
                <div style={{ padding: '20px 16px', fontSize: 13, color: 'var(--cactus-muted)' }}>
                  No locations yet.
                  <a href={`/orgs/${id}/locations/new`} style={{ color: 'var(--cactus-forest)', marginLeft: 8 }}>
                    Add one →
                  </a>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}