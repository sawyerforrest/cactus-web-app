import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function NewLocationPage({
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
    .select('id, name')
    .eq('id', id)
    .single()

  if (!org) redirect('/orgs')

  async function createLocation(formData: FormData) {
    'use server'

    const admin = createAdminSupabaseClient()

    const name = formData.get('name') as string
    const location_type = formData.get('location_type') as string
    const address_line1 = formData.get('address_line1') as string
    const address_line2 = (formData.get('address_line2') as string) || null
    const city = formData.get('city') as string
    const state = formData.get('state') as string
    const postal_code = formData.get('postal_code') as string
    const country = formData.get('country_code') as string
    const is_billing_address = formData.get('is_billing_address') === 'true'

    const { error } = await admin
      .from('locations')
      .insert({
        org_id: id,
        name,
        location_type,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        is_billing_address,
      })

    if (error) throw new Error(error.message)

    redirect(`/orgs/${id}`)
  }

  const label = (text: string) => ({
    display: 'block', fontSize: 11, fontWeight: 500,
    color: 'var(--cactus-muted)', letterSpacing: '0.04em',
    textTransform: 'uppercase' as const, marginBottom: 6,
  })

  const input = {
    width: '100%', padding: '8px 12px',
    background: 'var(--cactus-canvas)',
    border: '0.5px solid var(--cactus-border-mid)',
    borderRadius: 6, fontSize: 13,
    color: 'var(--cactus-ink)', fontWeight: 500,
    fontFamily: 'var(--font-sans)', outline: 'none',
  }

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
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>New location</div>
          </div>
          <a href={`/orgs/${id}`} style={{
            color: 'var(--cactus-muted)',
            border: '0.5px solid var(--cactus-border-mid)',
            padding: '6px 12px', borderRadius: 6,
            fontSize: 12, textDecoration: 'none',
          }}>Cancel</a>
        </div>

        {/* Content */}
        <div style={{ padding: '32px 24px', maxWidth: 560 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Add location
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 28 }}>
            Adding to {org.name}
          </div>

          <form action={createLocation}>

            {/* Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Location name')}>Location name</label>
              <input
                name="name"
                type="text"
                required
                placeholder="e.g. Phoenix Warehouse"
                style={input}
              />
            </div>

            {/* Location type */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Location type')}>Location type</label>
              <select name="location_type" required style={{ ...input, appearance: 'none' }}>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="OFFICE">Office</option>
                <option value="STORE">Store</option>
                <option value="FULFILLMENT_CENTER">Fulfillment center</option>
              </select>
            </div>

            {/* Address line 1 */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Address line 1')}>Address line 1</label>
              <input
                name="address_line1"
                type="text"
                required
                placeholder="e.g. 1234 Main St"
                style={input}
              />
            </div>

            {/* Address line 2 */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Address line 2 (optional)')}>Address line 2 (optional)</label>
              <input
                name="address_line2"
                type="text"
                placeholder="e.g. Suite 100"
                style={input}
              />
            </div>

            {/* City + State */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={label('City')}>City</label>
                <input
                  name="city"
                  type="text"
                  required
                  placeholder="e.g. Phoenix"
                  style={input}
                />
              </div>
              <div>
                <label style={label('State')}>State</label>
                <input
                  name="state"
                  type="text"
                  required
                  maxLength={2}
                  placeholder="AZ"
                  style={input}
                />
              </div>
            </div>

            {/* Postal + Country */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={label('Postal code')}>Postal code</label>
                <input
                  name="postal_code"
                  type="text"
                  required
                  placeholder="e.g. 85001"
                  style={input}
                />
              </div>
              <div>
                <label style={label('Country')}>Country</label>
                <input
                  name="country_code"
                  type="text"
                  required
                  maxLength={2}
                  defaultValue="US"
                  style={input}
                />
              </div>
            </div>

            {/* Billing address */}
            <div style={{ marginBottom: 28 }}>
              <label style={label('Billing address')}>Billing address</label>
              <select name="is_billing_address" required style={{ ...input, appearance: 'none' }}>
                <option value="true">Yes — use for dark account matching</option>
                <option value="false">No</option>
              </select>
            </div>

            <div style={{ borderTop: '0.5px solid var(--cactus-border)', marginBottom: 24 }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <a href={`/orgs/${id}`} style={{
                padding: '8px 16px', borderRadius: 6,
                fontSize: 13, color: 'var(--cactus-muted)',
                border: '0.5px solid var(--cactus-border-mid)',
                textDecoration: 'none',
              }}>Cancel</a>
              <button type="submit" style={{
                padding: '8px 20px', borderRadius: 6,
                fontSize: 13, fontWeight: 500,
                background: 'var(--cactus-forest)',
                color: '#fff', border: 'none',
                fontFamily: 'var(--font-sans)',
              }}>Add location</button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}