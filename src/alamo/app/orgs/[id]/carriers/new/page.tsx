import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function NewCarrierAccountPage({
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

  async function createCarrierAccount(formData: FormData) {
    'use server'

    const admin = createAdminSupabaseClient()

    const account_nickname = formData.get('account_nickname') as string
    const account_number = formData.get('account_number') as string
    const carrier_code = formData.get('carrier_code') as string
    const carrier_account_mode = formData.get('carrier_account_mode') as string
    const markupInput = parseFloat(formData.get('markup_percentage') as string)
if (markupInput > 100 || markupInput < 0) throw new Error('Markup percentage must be between 0 and 100')
const markup_percentage = markupInput / 100
    const dispute_threshold = parseFloat(formData.get('dispute_threshold') as string)
    const is_cactus_account = formData.get('is_cactus_account') === 'true'

    const { error } = await admin
      .from('org_carrier_accounts')
      .insert({
        org_id: id,
        account_nickname,
        account_number,
        carrier_code,
        carrier_account_mode,
        markup_percentage,
        dispute_threshold,
        is_cactus_account,
        use_rate_card: false,
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
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--cactus-ink)' }}>New carrier account</div>
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
            Add carrier account
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 28 }}>
            Adding to {org.name}
          </div>

          <form action={createCarrierAccount}>

            {/* Nickname */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Nickname')}>Nickname</label>
              <input
                name="account_nickname"
                type="text"
                required
                placeholder="e.g. Desert Boutique UPS"
                style={input}
              />
            </div>

            {/* Account number */}
<div style={{ marginBottom: 20 }}>
  <label style={label('Account number')}>Account number</label>
  <input
    name="account_number"
    type="text"
    required
    placeholder="e.g. 742847D2"
    style={input}
  />
</div>

            {/* Carrier */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Carrier')}>Carrier</label>
              <select name="carrier_code" required style={{ ...input, appearance: 'none' }}>
                <option value="UPS">UPS</option>
                <option value="FEDEX">FedEx</option>
                <option value="USPS">USPS</option>
                <option value="UNIUNI">UniUni</option>
                <option value="GOFO">GOFO</option>
                <option value="SHIPX">ShipX</option>
                <option value="DHL_ECOM">DHL eCommerce</option>
                <option value="DHL_EXPRESS">DHL Express</option>
                <option value="LANDMARK">Landmark</option>
                <option value="ONTRAC">OnTrac</option>
                <option value="OSM">OSM</option>
              </select>
            </div>

            {/* Mode */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Account mode')}>Account mode</label>
              <select name="carrier_account_mode" required style={{ ...input, appearance: 'none' }}>
                <option value="lassoed_carrier_account">Lassoed</option>
                <option value="dark_carrier_account">Dark</option>
              </select>
            </div>

            {/* Markup */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Markup %')}>Markup %</label>
              <input
                name="markup_percentage"
                type="number"
                required
                step="0.01"
                min="0"
                max="100"
                defaultValue="15"
                placeholder="e.g. 15"
                style={input}
              />
            </div>

            {/* Dispute threshold */}
            <div style={{ marginBottom: 20 }}>
              <label style={label('Variance limit ($)')}>Variance limit ($)</label>
              <input
                name="dispute_threshold"
                type="number"
                required
                step="0.01"
                min="0"
                defaultValue="2.00"
                placeholder="e.g. 2.00"
                style={input}
              />
            </div>

            {/* Is Cactus account */}
            <div style={{ marginBottom: 28 }}>
              <label style={label('Account ownership')}>Account ownership</label>
              <select name="is_cactus_account" required style={{ ...input, appearance: 'none' }}>
                <option value="true">Cactus account — earn margin</option>
                <option value="false">Pass-through — no margin</option>
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
              }}>Create carrier account</button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}