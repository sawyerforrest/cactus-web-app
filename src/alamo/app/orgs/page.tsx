import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function OrgsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

    const admin = createAdminSupabaseClient()
    const { data: orgs, error } = await admin
  .from('organizations')
  .select(`
    id,
    name,
    org_type,
    terms_days,
    is_active,
    created_at,
    parent_org_id
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
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>Organizations</div>
          <a href="/orgs/new" style={{
            background: 'var(--cactus-forest)', color: '#fff',
            padding: '6px 14px', borderRadius: 6,
            fontSize: 12, fontWeight: 500,
            textDecoration: 'none',
          }}>+ Add org</a>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Organizations
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 20 }}>
            {orgs?.length ?? 0} total
          </div>

          <div style={{
            background: 'var(--cactus-canvas)',
            border: '0.5px solid var(--cactus-border)',
            borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 80px 80px 120px',
              background: 'var(--cactus-sand)',
              borderBottom: '0.5px solid var(--cactus-border)',
              padding: '8px 16px',
            }}>
              {['Name', 'Type', 'Terms', 'Carriers', 'Created'].map(h => (
                <div key={h} style={{
                  fontSize: 11, fontWeight: 500,
                  color: 'var(--cactus-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>{h}</div>
              ))}
            </div>

            {orgs?.map((org, i) => (
              <div key={org.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 80px 80px 120px',
                padding: '10px 16px',
                alignItems: 'center',
                borderBottom: i < (orgs.length - 1) ? '0.5px solid var(--cactus-border)' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>
                    {org.name}
                  </div>
                  {org.parent_org_id && (
                    <div style={{ fontSize: 11, color: 'var(--cactus-muted)', marginTop: 1 }}>sub-client</div>
                  )}
                </div>
                <div>
                  <span style={{
                    display: 'inline-flex', padding: '2px 8px',
                    borderRadius: 20, fontSize: 11, fontWeight: 500,
                    background: org.org_type === '3PL' ? 'var(--cactus-mint)' : 'var(--cactus-sand)',
                    color: org.org_type === '3PL' ? 'var(--cactus-forest-deep)' : 'var(--cactus-slate)',
                    border: '0.5px solid var(--cactus-border)',
                  }}>{org.org_type}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                  Net-{org.terms_days}
                </div>
                <div style={{ fontSize: 13, color: 'var(--cactus-ink)' }}>
                  -
                </div>
                <div style={{ fontSize: 12, color: 'var(--cactus-muted)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}