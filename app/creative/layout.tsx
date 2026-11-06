import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { SiteProvider } from '@/app/_metrics/site'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { currentRole } from '@/app/_metrics/access'
import { StoreProvider } from './_lib/store'
import './cc.css'

/* ═══════════════════════════════════════════════════════════════════════════
   Creative Center shell.

   Holds only what both halves of the center need — the Host-derived link
   prefix and the signed-in role. The two halves style themselves separately
   and must not share a wrapper:

     the new workspaces   → .cc-root, applied by WorkspaceShell
     the legacy pages     → .mx .metrics-page, applied by (legacy)/layout

   Keeping `.mx` off this layout is deliberate. metrics.css reaches into
   descendants — `.mx :where(td, th, …)` and `.mx :focus-visible` — so a
   shared wrapper would restyle every cell of the new Creative Analysis table
   and every focus ring in the center.
   ═══════════════════════════════════════════════════════════════════════════ */

export const metadata: Metadata = {
  title: 'Creative Center · CaseBridge',
  description: 'Creative analysis, watch/kill lists, assignments and launch tracking.',
  robots: { index: false, follow: false },
}

export default async function CreativeLayout({ children }: { children: React.ReactNode }) {
  // On creatives.case-bridge.com the rewrite hides the /creative prefix, so
  // links must omit it. Browsing the same routes on the apex domain keeps it.
  const onOwnHost = siteRootForHost((await headers()).get('host')) === '/creative'
  const role = await currentRole()

  return (
    <SiteProvider value={{ id: 'creative', root: '/creative', base: onOwnHost ? '' : '/creative', role }}>
      <StoreProvider>{children}</StoreProvider>
    </SiteProvider>
  )
}
