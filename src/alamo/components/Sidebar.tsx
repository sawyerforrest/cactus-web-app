// ==========================================================
// FILE: src/alamo/components/Sidebar.tsx
// PURPOSE: Shared sidebar navigation for The Alamo.
// Used by every page. Change once, updates everywhere.
// ==========================================================

'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  Tag,
  FileText,
  ReceiptText,
  Flag,
  Gauge,
  BarChart2,
  Database,
  ScrollText,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { CactusLogo } from '@/components/CactusLogo'

const navItems = {
  workspace: [
    { label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
    { label: 'Organizations', href: '/orgs', Icon: Building2 },
    { label: 'Carrier Accounts', href: '/carriers', Icon: ArrowLeftRight },
    { label: 'Rate Cards', href: '/rate-cards', Icon: Tag },
  ],
  billing: [
    { label: 'Carrier Invoices', href: '/invoices', Icon: FileText },
    { label: 'Client Invoices', href: '/billing', Icon: ReceiptText },
    { label: 'Disputes', href: '/disputes', Icon: Flag },
    { label: 'Meter Health', href: '/meters', Icon: Gauge },
  ],
  tools: [
    { label: 'PLD Roundup', href: '/pld-analysis', Icon: BarChart2 },
    { label: 'Reference Data', href: '/pld-analysis/reference-data', Icon: Database },
    { label: 'Audit Log', href: '/audit', Icon: ScrollText },
  ],
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const NavSection = ({ title, items }: { title: string, items: typeof navItems.workspace }) => (
    <nav style={{ padding: '12px 8px 4px' }}>
      <div style={{
        fontSize: 10, fontWeight: 500, letterSpacing: '0.07em',
        color: 'var(--cactus-hint)', textTransform: 'uppercase' as const,
        padding: '0 8px', marginBottom: 4,
      }}>{title}</div>
      {items.map(item => {
        const active = pathname.startsWith(item.href) && (item.href !== '/dashboard' || pathname === '/dashboard')
        const Icon = item.Icon
        return (
          <a key={item.label} href={item.href} style={{
            display: 'flex', alignItems: 'center',
            gap: 10,
            padding: '6px 12px',
            fontSize: 13,
            borderLeft: active
              ? '2px solid var(--cactus-forest)'
              : '2px solid transparent',
            background: active ? 'var(--cactus-mint)' : 'transparent',
            color: active ? 'var(--cactus-forest)' : 'var(--cactus-slate)',
            fontWeight: active ? 500 : 400,
            marginBottom: 1,
            textDecoration: 'none',
            transition: 'color 0.1s, border-color 0.1s',
          }}>
            <Icon size={16} />
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
      position: 'fixed',
      top: 0,
      left: 0,
      width: 200,
      height: '100vh',
      overflowY: 'auto',
      zIndex: 10,
    }}>
      <div style={{
        padding: '12px 16px 8px',
        borderBottom: '0.5px solid var(--cactus-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
      }}>
        <CactusLogo width={160} />
        <div style={{
          width: 'calc(100% + 12px)',
          marginLeft: -6,
          marginRight: -6,
          marginTop: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10,
          fontWeight: 600,
          color: '#2D5A27',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          <span style={{ flex: 1, height: 1, background: '#2D5A27' }} />
          Alamo
          <span style={{ flex: 1, height: 1, background: '#2D5A27' }} />
        </div>
      </div>

      <NavSection title="workspace" items={navItems.workspace} />
      <NavSection title="billing" items={navItems.billing} />
      <NavSection title="tools" items={navItems.tools} />

      {/* Footer — logout */}
      <div style={{
        marginTop: 'auto',
        padding: '12px 8px',
        borderTop: '0.5px solid var(--cactus-border)',
      }}>
        {/* User info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          marginBottom: 4,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--cactus-mint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 500, color: 'var(--cactus-forest)',
            flexShrink: 0,
          }}>SF</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--cactus-ink)' }}>
              Sawyer
            </div>
            <div style={{ fontSize: 11, color: 'var(--cactus-hint)' }}>admin</div>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--cactus-muted)',
            fontSize: 12,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.1s, color 0.1s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--cactus-bloom-bg)'
            e.currentTarget.style.color = 'var(--cactus-bloom)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--cactus-muted)'
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  )
}