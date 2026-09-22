import type { Metadata } from 'next'
import { headers } from 'next/headers'
import '@/app/_metrics/metrics.css'
import { SiteProvider } from '@/app/_metrics/site'
import { siteRootForHost } from '@/app/_metrics/site-root'

export const metadata: Metadata = {
  title: 'Creative Center · CaseBridge',
  description: 'Creative performance, angles, competitor teardowns and assignments.',
  robots: { index: false, follow: false },
}

export default async function CreativeLayout({ children }: { children: React.ReactNode }) {
  // On creatives.case-bridge.com the rewrite hides the /creative prefix, so
  // links must omit it. Browsing the same routes on the apex domain keeps it.
  const onOwnHost = siteRootForHost((await headers()).get('host')) === '/creative'

  return (
    <SiteProvider value={{ id: 'creative', root: '/creative', base: onOwnHost ? '' : '/creative' }}>
      <div className="mx metrics-page">{children}</div>
    </SiteProvider>
  )
}
