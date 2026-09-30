import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { siteRootForHost } from '@/app/_metrics/site-root'

/* ── Subdomain routing ───────────────────────────────────────────────────────
   The Creative and Financial centers are separate sites on separate hosts but
   one deployment. Each subdomain is rewritten onto its route tree so the host
   root serves the center's front page and every link below it stays clean:

     creatives.case-bridge.com/        → /creative
     creatives.case-bridge.com/angles  → /creative/angles
     finance.case-bridge.com/oos-cases → /finance/oos-cases

   The routes remain reachable by path on the apex domain, which is what makes
   local development work without a hosts-file entry.

   Team analytics deliberately has no entry here: it lives at
   /teams/admin/team-metrics on the existing teams host, so that reps and the
   people managing them stay one product.                                     */

export async function proxy(request: NextRequest) {
  const rawPath = request.nextUrl.pathname
  const host = request.headers.get('host')
  const siteRoot = siteRootForHost(host)

  /* A link that still carries the prefix — an old bookmark, or a deep link
     written as /finance/firms/x — works on the center's own host, but would
     show the prefix twice over in the address bar. Collapse it to the clean
     form once, so each page has a single canonical URL per host. */
  if (siteRoot && (rawPath === siteRoot || rawPath.startsWith(siteRoot + '/'))) {
    const url = request.nextUrl.clone()
    url.pathname = rawPath.slice(siteRoot.length) || '/'
    return NextResponse.redirect(url)
  }

  /* The rewrite is resolved up front but applied at the very end, so every
     auth check below runs against the real route rather than the host path.
     Returning the rewrite here instead would hand out both centers
     unauthenticated. /login has to keep resolving on each host so the
     redirect target exists. */
  const rewritten = Boolean(
    siteRoot && rawPath !== '/login' && !rawPath.startsWith('/api/') && !rawPath.startsWith(siteRoot)
  )
  const effectivePath = rewritten ? siteRoot + (rawPath === '/' ? '' : rawPath) : rawPath

  /* The candidate application is the one public corner of /venu: the whole
     point is that someone with the link can make a temporary account before
     they have any credentials. The token in the URL is what authorises it. */
  const isVenuApply = effectivePath === '/venu/apply' || effectivePath.startsWith('/venu/apply/')

  const applyRewrite = (res: NextResponse) => {
    if (!rewritten) return res
    const url = request.nextUrl.clone()
    url.pathname = effectivePath
    const rw = NextResponse.rewrite(url)
    res.cookies.getAll().forEach(c => rw.cookies.set(c.name, c.value))
    return rw
  }

  let supabaseResponse = NextResponse.next({ request })

  /* ── Who actually needs a Supabase session ───────────────────────────────
     Every request used to pay for an auth round trip before anything else
     happened — the marketing site, the candidate application, static-ish
     routes, the Creative and Financial centers (which authenticate with a
     plain cookie, not Supabase). When Supabase slowed down on 2026-09-30 the
     middleware blocked on that call and Vercel returned 504 for the whole
     site at once: every route, all at the same moment.

     Only the three products that read a Supabase user ask for one now, and
     the call is given a deadline so a struggling auth service degrades one
     request instead of taking the site off the air. */
  const needsSupabaseAuth =
    effectivePath.startsWith('/teams') ||
    (effectivePath.startsWith('/venu') && !isVenuApply) ||
    effectivePath.startsWith('/dialer')

  if (!needsSupabaseAuth) {
    if (effectivePath.startsWith('/creative') || effectivePath.startsWith('/finance') || effectivePath.startsWith('/metrics')) {
      if (!request.cookies.get('casebridge_session')) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
    return applyRewrite(supabaseResponse)
  }

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

  /* A hung auth call must not become a hung page. Three seconds is far beyond
     the ~100ms this normally takes; past that we treat the request as signed
     out, which sends them to a login page instead of a gateway timeout. */
  const authed = await Promise.race([
    supabase.auth.getUser(),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
  ])
  if (authed === null) console.error('[proxy] supabase auth timed out for', effectivePath)
  const user = authed?.data?.user ?? null
  const pathname = effectivePath

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

  // Protect /venu — same credentials as Teams, but its own sign-in page
  if (pathname === '/venu/login') {
    if (user) {
      const res = NextResponse.redirect(new URL('/venu', request.url))
      supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
      return res
    }
    return supabaseResponse
  }
  if (pathname.startsWith('/venu') && !isVenuApply && !user) {
    const res = NextResponse.redirect(new URL('/venu/login', request.url))
    supabaseResponse.cookies.getAll().forEach(c => res.cookies.set(c.name, c.value))
    return res
  }

  /* The Creative and Financial centers are guarded above, before the Supabase
     client is ever built — they authenticate with the plain session cookie and
     have no business waiting on an auth service they do not use. */

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
      const rawRole = user.user_metadata?.role
      const role = (rawRole ?? 'REP').toUpperCase()
      console.log('[proxy] admin check', { pathname, rawRole, role, email: user.email, metadata: JSON.stringify(user.user_metadata) })
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

  return applyRewrite(supabaseResponse)
}

/* Host rewriting means the matcher can no longer be a list of path prefixes —
   on creatives.case-bridge.com the incoming path is "/", which none of them
   would catch. Everything except static assets goes through instead. */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|mp4|woff2?)$).*)'],
}
