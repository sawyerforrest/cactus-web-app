// ==========================================================
// FILE: src/alamo/app/orgs/new/page.tsx
// ==========================================================

import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default async function NewOrgPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  async function createOrg(formData: FormData) {
    'use server'

    const admin = createAdminSupabaseClient()

    const name = formData.get('name') as string
    const org_type = formData.get('org_type') as string
    const terms_days = parseInt(formData.get('terms_days') as string)

    const { error } = await admin
      .from('organizations')
      .insert({ name, org_type, terms_days })

    if (error) throw new Error(error.message)

    redirect('/orgs')
  }

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
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--cactus-ink)' }}>New organization</div>
          <a href="/orgs" style={{
            color: 'var(--cactus-muted)',
            border: '0.5px solid var(--cactus-border-mid)',
            padding: '6px 12px', borderRadius: 6,
            fontSize: 12, textDecoration: 'none',
          }}>Cancel</a>
        </div>

        <div style={{ padding: '32px 24px', maxWidth: 560 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--cactus-ink)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Add organization
          </div>
          <div style={{ fontSize: 13, color: 'var(--cactus-muted)', marginBottom: 28 }}>
            Create a new 3PL or merchant tenant in Cactus.
          </div>

          <form action={createOrg}>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 500,
                color: 'var(--cactus-muted)', letterSpacing: '0.04em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Organization name</label>
              <input
                name="name"
                type="text"
                required
                placeholder="e.g. Desert Boutique"
                style={{
                  width: '100%', padding: '8px 12px',
                  background: 'var(--cactus-canvas)',
                  border: '0.5px solid var(--cactus-border-mid)',
                  borderRadius: 6, fontSize: 13,
                  color: 'var(--cactus-ink)', fontWeight: 500,
                  fontFamily: 'var(--font-sans)', outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 500,
                color: 'var(--cactus-muted)', letterSpacing: '0.04em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Organization type</label>
              <select name="org_type" required style={{
                width: '100%', padding: '8px 12px',
                background: 'var(--cactus-canvas)',
                border: '0.5px solid var(--cactus-border-mid)',
                borderRadius: 6, fontSize: 13,
                color: 'var(--cactus-ink)', fontWeight: 500,
                fontFamily: 'var(--font-sans)', outline: 'none', appearance: 'none',
              }}>
                <option value="3PL">3PL</option>
                <option value="MERCHANT">Merchant</option>
              </select>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 500,
                color: 'var(--cactus-muted)', letterSpacing: '0.04em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>Payment terms</label>
              <select name="terms_days" required style={{
                width: '100%', padding: '8px 12px',
                background: 'var(--cactus-canvas)',
                border: '0.5px solid var(--cactus-border-mid)',
                borderRadius: 6, fontSize: 13,
                color: 'var(--cactus-ink)', fontWeight: 500,
                fontFamily: 'var(--font-sans)', outline: 'none', appearance: 'none',
              }}>
                <option value="7">Net-7</option>
                <option value="14">Net-14</option>
                <option value="30">Net-30</option>
              </select>
            </div>

            <div style={{ borderTop: '0.5px solid var(--cactus-border)', marginBottom: 24 }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <a href="/orgs" style={{
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
              }}>Create organization</button>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}