'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { sub: '',          label: 'Dashboard' },
  { sub: '/firms',    label: 'Firms' },
  { sub: '/payroll',  label: 'Rep pay' },
]

export function FinanceNav({ base }: { base: string }) {
  const pathname = usePathname() || ''
  const href = (sub: string) => (base + sub) || '/'

  return (
    <nav className="fin-bar">
      <Link href={href('')} className="fin-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        Financial Center
      </Link>
      <div className="fin-tabs">
        {TABS.map(t => {
          const target = href(t.sub)
          const active = t.sub === '' ? pathname === target : pathname.startsWith(target)
          return (
            <Link key={t.sub} href={target} className="fin-tab"
                  aria-current={active ? 'page' : undefined}>
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
