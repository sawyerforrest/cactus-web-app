// ==========================================================
// FILE: src/alamo/lib/supabase-server.ts
// PURPOSE: Server-side Supabase clients for The Alamo.
//
// TWO CLIENTS:
//   createServerSupabaseClient — anon key, respects RLS
//     Use for: auth checks, reading user-scoped data
//
//   createAdminSupabaseClient — service role key, bypasses RLS
//     Use for: all Alamo admin writes (create org, etc.)
//     NEVER expose this client to the browser
//     NEVER use in 'use client' components
// ==========================================================

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Auth client — uses anon key, respects RLS
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — middleware handles session refresh
          }
        },
      },
    }
  )
}

// Admin client — service role key, bypasses RLS
// autoRefreshToken and persistSession disabled — server only
export function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
    }
  )
}