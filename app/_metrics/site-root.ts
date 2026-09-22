/* Shared by proxy.ts and the center layouts so the host→route mapping is
   declared exactly once. */
export const SITE_ROOT: Record<string, string> = {
  creatives: '/creative',
  finance:   '/finance',
}

/** The route root this hostname serves, or null on the apex domain. */
export function siteRootForHost(host: string | null): string | null {
  const label = (host || '').split(':')[0].split('.')[0]
  return SITE_ROOT[label] ?? null
}
