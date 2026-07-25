import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path     = req.nextUrl.pathname
  const isLogin  = path === '/dialer/login'
  const isDialer = path.startsWith('/dialer')
  const isAdmin  = path.startsWith('/dialer/admin')

  // Not authenticated → login
  if (isDialer && !isLogin && !user) {
    return NextResponse.redirect(new URL('/dialer/login', req.url))
  }

  // Already logged in → skip login page
  if (isLogin && user) {
    return NextResponse.redirect(new URL('/dialer/agent', req.url))
  }

  // REP trying to access admin pages → back to agent
  if (isAdmin && user) {
    const role = user.user_metadata?.role ?? 'REP'
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dialer/agent', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/dialer/:path*'],
}
