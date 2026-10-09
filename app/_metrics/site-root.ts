/* Shared by proxy.ts and the center layouts so the host→route mapping is
   declared exactly once. */
export const SITE_ROOT: Record<string, string> = {
  creatives: '/creative',
  finance:   '/finance',
  dialer:    '/dialer',
}

/* Which roots sign in through the shared /login at the apex. The dialer does
   not: it has its own sign-in page under its own root, backed by Supabase
   rather than the metrics session, so /login on dialer.case-bridge.com has to
   reach /dialer/login. Letting it fall through to the shared page would show
   dialer reps the metrics login, which their credentials do not open. */
export const SHARED_LOGIN_ROOTS = new Set(['/creative', '/finance'])

export function usesSharedLogin(siteRoot: string | null): boolean {
  return !!siteRoot && SHARED_LOGIN_ROOTS.has(siteRoot)
}

/** The route root this hostname serves, or null on the apex domain. */
export function siteRootForHost(host: string | null): string | null {
  const label = (host || '').split(':')[0].split('.')[0]
  return SITE_ROOT[label] ?? null
}
