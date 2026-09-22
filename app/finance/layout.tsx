import type { Metadata } from 'next'
import { headers } from 'next/headers'
import '@/app/_metrics/metrics.css'
import { SiteProvider } from '@/app/_metrics/site'
import { siteRootForHost } from '@/app/_metrics/site-root'

export const metadata: Metadata = {
  title: 'Financial Center · CaseBridge',
  description: 'Firm invoices, P&L, expenses and case economics.',
  robots: { index: false, follow: false },
}

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const onOwnHost = siteRootForHost((await headers()).get('host')) === '/finance'

  return (
    <SiteProvider value={{ id: 'finance', root: '/finance', base: onOwnHost ? '' : '/finance' }}>
      <div className="mx metrics-page">{children}</div>
    </SiteProvider>
  )
}
