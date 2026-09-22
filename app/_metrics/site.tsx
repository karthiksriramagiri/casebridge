'use client'

import { createContext, useContext } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   Which center am I, and what do my links look like?

   Both questions have to be answered on the server. After proxy.ts rewrites
   creatives.case-bridge.com/ onto /creative, the browser URL is still "/" —
   so usePathname() reports "/" and cannot tell you which center you are in,
   nor what prefix a link needs. The layout reads the Host header instead and
   hands both answers down.

   `base` is the prefix the browser should see:
     on creatives.case-bridge.com  → ''          so a link reads /angles
     on case-bridge.com            → '/creative' so a link reads /creative/angles
   ═══════════════════════════════════════════════════════════════════════════ */

export type SiteId = 'creative' | 'finance'

export type SiteInfo = {
  id: SiteId
  /** Route root in the app directory, always '/creative' or '/finance'. */
  root: string
  /** Prefix to put in front of browser-facing hrefs. '' on the subdomain. */
  base: string
}

const SiteContext = createContext<SiteInfo | null>(null)

export function SiteProvider({ value, children }: { value: SiteInfo; children: React.ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite(): SiteInfo {
  const site = useContext(SiteContext)
  if (!site) throw new Error('useSite must be used inside a center layout')
  return site
}

/** Build a browser-facing href from a path relative to the center root. */
export function useHref(): (sub: string) => string {
  const { base } = useSite()
  return (sub: string) => (base + sub) || '/'
}
