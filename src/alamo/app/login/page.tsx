// ==========================================================
// FILE: src/alamo/app/login/page.tsx
// PURPOSE: The Alamo login page — admin access only.
//
// This is a Client Component (note 'use client' at the top).
// WHY CLIENT? Because it uses React state (useState) to track
// form input and handle button clicks. Server Components
// cannot do this — they render once on the server and are done.
// Client Components run in the browser and can be interactive.
// ==========================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Login successful — redirect to dashboard
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-md">

        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">🌵 The Alamo</h1>
          <p className="text-gray-400 mt-2">Cactus Internal Admin</p>
        </div>

        {/* Login Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="sawyer@cactus-logistics.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="••••••••"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Cactus Logistics OS — Internal Use Only
        </p>

      </div>
    </div>
  )
}