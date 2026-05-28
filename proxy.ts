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
      return NextResponse.redirect(new URL(dest, request.url))
    }
    return supabaseResponse
  }

  // Protect all /teams/* routes
  if (pathname.startsWith('/teams')) {
    if (!user) {
      return NextResponse.redirect(new URL('/teams/login', request.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Admin-only routes
    if (pathname.startsWith('/teams/admin') && profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/teams/dashboard', request.url))
    }

    // Rep trying to access /teams root — redirect to dashboard
    if (pathname === '/teams') {
      const dest = profile?.role === 'admin' ? '/teams/admin' : '/teams/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }
  }

  // Protect /metrics routes with simple session cookie
  if (pathname.startsWith('/metrics')) {
    const sessionCookie = request.cookies.get('casebridge_session')
    if (!sessionCookie) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/teams/:path*', '/metrics/:path*'],
}
