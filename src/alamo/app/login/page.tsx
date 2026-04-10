// ==========================================================
// FILE: src/alamo/app/login/page.tsx
// PURPOSE: The Alamo login page — admin access only.
// WHY CLIENT: Uses React state for form interaction.
// ==========================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CactusLogo } from '@/components/CactusLogo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
      background: '#1A2420',
    }}>

      {/* Background — sky + dunes */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF"/>
            <stop offset="100%" stopColor="#FFFFFF"/>
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect width="800" height="600" fill="url(#skyGrad)"/>

        {/* Dune layers — deep to near */}
        <path d="M0 600 L0 320 Q80 278 160 298 Q280 328 400 288 Q520 248 640 272 Q720 288 800 260 L800 600 Z" fill="#1E2B22"/>
        <path d="M0 600 L0 348 Q120 318 240 334 Q360 350 480 318 Q600 286 720 306 Q760 314 800 302 L800 600 Z" fill="#213025"/>
        <path d="M0 600 L0 372 Q140 350 280 364 Q420 378 560 355 Q680 335 800 350 L800 600 Z" fill="#243528"/>
        <path d="M0 600 L0 402 Q160 386 320 398 Q480 410 640 392 Q720 383 800 388 L800 600 Z" fill="#273A2B"/>
        <path d="M0 600 L0 434 Q200 422 400 430 Q600 438 800 426 L800 600 Z" fill="#2A3F2E"/>
        <path d="M0 600 L0 466 Q200 456 400 462 Q600 468 800 458 L800 600 Z" fill="#2D4430"/>

        {/* Ridge lines */}
        <path d="M0 320 Q80 278 160 298 Q280 328 400 288 Q520 248 640 272 Q720 288 800 260" fill="none" stroke="#243020" strokeWidth="0.8"/>
        <path d="M0 348 Q120 318 240 334 Q360 350 480 318 Q600 286 720 306 Q760 314 800 302" fill="none" stroke="#273525" strokeWidth="0.6"/>
        <path d="M0 372 Q140 350 280 364 Q420 378 560 355 Q680 335 800 350" fill="none" stroke="#2A3828" strokeWidth="0.5"/>
      </svg>

      {/* Login card */}
      <div style={{
        width: '100%',
        maxWidth: 380,
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Logo */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 28,
        }}>
          <CactusLogo width={180} />
        </div>

        {/* Form card */}
        <div style={{
          background: 'rgba(248, 246, 242, 1)',
          border: '0.5px solid rgba(221, 216, 208, 0.9)',
          borderRadius: 12,
          padding: '28px 28px 24px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 24,
          }}>
            <span style={{ display: 'block', width: 28, height: 0.5, background: 'var(--cactus-forest)', opacity: 0.4 }}/>
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--cactus-forest)',
            }}>
              The Alamo
            </span>
            <span style={{ display: 'block', width: 28, height: 0.5, background: 'var(--cactus-forest)', opacity: 0.4 }}/>
          </div>

          <form onSubmit={handleLogin}>

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--cactus-muted)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="sawyer@cactus-logistics.com"
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: 6,
                  border: '0.5px solid var(--cactus-border-mid)',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--cactus-ink)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--cactus-forest)'}
                onBlur={e => e.target.style.borderColor = 'var(--cactus-border-mid)'}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--cactus-muted)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: 6,
                  border: '0.5px solid var(--cactus-border-mid)',
                  background: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--cactus-ink)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--cactus-forest)'}
                onBlur={e => e.target.style.borderColor = 'var(--cactus-border-mid)'}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'var(--cactus-bloom-bg)',
                border: '0.5px solid var(--cactus-bloom-border)',
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 16,
                fontSize: 12,
                color: 'var(--cactus-bloom)',
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 6,
                border: 'none',
                background: loading ? 'var(--cactus-border)' : 'var(--cactus-forest)',
                color: loading ? 'var(--cactus-muted)' : '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                letterSpacing: '0.01em',
              }}
            >
              {loading ? 'Signing in...' : (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}>
                  Sign in
                  <img
                    src="/stallion.png"
                    alt=""
                    style={{
                      width: 28,
                      height: 18,
                      objectFit: 'contain',
                      opacity: 0.95,
                    }}
                  />
                </span>
              )}
            </button>

          </form>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: 20,
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.03em',
        }}>
          Logistics with Soul.
        </div>

      </div>
    </div>
  )
}