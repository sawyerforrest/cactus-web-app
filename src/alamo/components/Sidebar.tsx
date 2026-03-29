// ==========================================================
// FILE: src/alamo/components/Sidebar.tsx
// PURPOSE: Shared sidebar navigation for The Alamo.
// Used by every page. Change once, updates everywhere.
// ==========================================================

'use client'

import { usePathname } from 'next/navigation'

const navItems = {
  workspace: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Organizations', href: '/orgs' },
    { label: 'Carrier Accounts', href: '/carriers' },
    { label: 'Rate Cards', href: '/rate-cards' },
  ],
  billing: [
    { label: 'Invoices', href: '/invoices' },
    { label: 'Disputes', href: '/disputes' },
    { label: 'Meter Health', href: '/meters' },
  ],
  tools: [
    { label: 'PLD/Rate Analysis', href: '/pld' },
    { label: 'Audit Log', href: '/audit' },
  ],
}

export default function Sidebar() {
  const pathname = usePathname()

  const NavSection = ({ title, items }: { title: string, items: typeof navItems.workspace }) => (
    <nav style={{ padding: '12px 8px 4px' }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.07em',
        color: 'var(--cactus-hint)', textTransform: 'uppercase' as const,
        padding: '0 8px', marginBottom: 4,
      }}>{title}</div>
      {items.map(item => {
        const active = pathname === item.href
        return (
          <a key={item.label} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 6,
            fontSize: 13,
            background: active ? 'var(--cactus-mint)' : 'transparent',
            color: active ? 'var(--cactus-forest)' : 'var(--cactus-slate)',
            fontWeight: active ? 500 : 400,
            marginBottom: 1,
            textDecoration: 'none',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'currentColor',
              opacity: active ? 1 : 0.25,
              flexShrink: 0,
            }} />
            {item.label}
          </a>
        )
      })}
    </nav>
  )

  return (
    <div style={{
      background: 'var(--cactus-canvas)',
      borderRight: '0.5px solid var(--cactus-border)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      {/* Brand */}
      <div style={{
        padding: '18px 16px 14px',
        borderBottom: '0.5px solid var(--cactus-border)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--cactus-forest)', letterSpacing: '-0.01em' }}>cactus</div>
        <div style={{ fontSize: 11, color: 'var(--cactus-hint)', marginTop: 2, letterSpacing: '0.04em' }}>the alamo</div>
      </div>

      <NavSection title="workspace" items={navItems.workspace} />
      <NavSection title="billing" items={navItems.billing} />
      <NavSection title="tools" items={navItems.tools} />

      {/* Footer */}
      <div style={{
        marginTop: 'auto',
        padding: '12px 16px',
        borderTop: '0.5px solid var(--cactus-border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: 'var(--cactus-mint)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 500, color: 'var(--cactus-forest)',
          flexShrink: 0,
        }}>SF</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cactus-ink)' }}>Sawyer</div>
          <div style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>admin</div>
        </div>
      </div>
    </div>
  )
}