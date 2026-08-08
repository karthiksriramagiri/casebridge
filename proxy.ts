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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Allow public pages (login, signup)
  if (pathname === '/teams/login' || pathname === '/teams/signup') {
    if (user) {
      // Already logged in — redirect based on role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const dest = profile?.role === 'admin' ? '/teams/admin' : '/teams/dashboard'
      const res = NextResponse.redirect(new URL(dest, request.url))
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }
    return supabaseResponse
  }

  // Protect all /teams/* routes
  if (pathname.startsWith('/teams')) {
    if (!user) {
      const res = NextResponse.redirect(new URL('/teams/login', request.url))
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Admin-only routes
    if (pathname.startsWith('/teams/admin') && profile?.role !== 'admin') {
      const res = NextResponse.redirect(new URL('/teams/dashboard', request.url))
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }

    // Rep trying to access /teams root — redirect to dashboard
    if (pathname === '/teams') {
      const dest = profile?.role === 'admin' ? '/teams/admin' : '/teams/dashboard'
      const res = NextResponse.redirect(new URL(dest, request.url))
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }
  }

  // Protect /metrics routes with simple session cookie
  if (pathname.startsWith('/metrics')) {
    const sessionCookie = request.cookies.get('casebridge_session')
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // ── Dialer auth ──────────────────────────────────────────────────────────
  const isDialerLogin = pathname === '/dialer/login'
  const isDialer      = pathname.startsWith('/dialer')
  const isDialerAdmin = pathname.startsWith('/dialer/admin')

  if (isDialer && !isDialerLogin) {
    if (!user) {
      const res = NextResponse.redirect(new URL('/dialer/login', request.url))
      // Carry refreshed auth cookies through redirects
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }
    if (isDialerAdmin) {
      const role = (user.user_metadata?.role ?? 'REP').toUpperCase()
      if (role !== 'ADMIN') {
        const res = NextResponse.redirect(new URL('/dialer/agent', request.url))
        supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
        return res
      }
    }
  }

  if (isDialerLogin && user) {
    const res = NextResponse.redirect(new URL('/dialer/agent', request.url))
    supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
    return res
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/teams/:path*', '/metrics/:path*', '/dialer/:path*'],
}
