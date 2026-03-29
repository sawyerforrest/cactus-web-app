// ==========================================================
// FILE: src/alamo/lib/supabase-server.ts
// PURPOSE: Server-side Supabase client for The Alamo.
// Used in Server Components and Route Handlers only.
// NEVER import this in a 'use client' component.
// ==========================================================

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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