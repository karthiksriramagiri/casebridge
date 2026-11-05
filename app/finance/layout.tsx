import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './finance.css'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { FinanceNav } from './_components/nav'

export const metadata: Metadata = {
  title: 'Financial Center · CaseBridge',
  description: 'Revenue, firms, invoices and signed cases.',
  robots: { index: false, follow: false },
}

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  /* On finance.case-bridge.com the /finance prefix is rewritten away, so links
     must omit it. On the apex domain they keep it. */
  const base = siteRootForHost((await headers()).get('host')) === '/finance' ? '' : '/finance'

  return (
    <div className="fin">
      <FinanceNav base={base} />
      <main className="fin-main">{children}</main>
    </div>
  )
}
