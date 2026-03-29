// ==========================================================
// FILE: src/alamo/app/dashboard/page.tsx
// PURPOSE: The Alamo main dashboard — landing page after login.
// This is a Server Component — no 'use client' needed.
// It runs on the server, checks auth, and renders the page.
// ==========================================================

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  // Check if user is logged in
  // If not — redirect to login immediately
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">🌵 The Alamo</h1>
          <p className="text-gray-400 mt-1">Welcome back, {user.email}</p>
        </div>

        {/* Stats placeholder */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Organizations</p>
            <p className="text-3xl font-bold text-white mt-1">2</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Carrier Accounts</p>
            <p className="text-3xl font-bold text-white mt-1">4</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-400 text-sm">Shipments</p>
            <p className="text-3xl font-bold text-white mt-1">3</p>
          </div>
        </div>

        {/* Placeholder content */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Recent Activity</h2>
          <p className="text-gray-500 text-sm">
            Invoice pipeline, org management, and carrier accounts coming soon.
          </p>
        </div>

      </div>
    </div>
  )
}