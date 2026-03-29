// ==========================================================
// FILE: src/alamo/proxy.ts
// PURPOSE: Route protection for The Alamo.
//
// Runs before EVERY request. Checks Supabase session.
//
// RULES:
//   - /login is public — anyone can access it
//   - Everything else requires a valid session
//   - No session → redirect to /login
//   - Has session + visiting /login → redirect to /dashboard
// ==========================================================

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — keeps the user logged in
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/login'
const isRootPage = request.nextUrl.pathname === '/'

// Root URL → redirect to dashboard
if (isRootPage) {
  const url = request.nextUrl.clone()
  url.pathname = '/dashboard'
  return NextResponse.redirect(url)
}

  // Not logged in and not on login page → redirect to login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Already logged in and visiting login page → redirect to dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}