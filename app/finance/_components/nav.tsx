'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/* The Financial Center's own navigation.

   Grouped rather than listed: two surfaces that answer questions, three
   that hold records. A flat row of tabs made those read as one list and
   gave the Reporting Center the same weight as the rep pay page. */

const GROUPS: { title: string; items: { sub: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    title: 'Analyse',
    items: [
      {
        sub: '',
        label: 'Dashboard',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="1.8" y="1.8" width="5.2" height="5.2" rx="1.2" />
            <rect x="9" y="1.8" width="5.2" height="5.2" rx="1.2" />
            <rect x="1.8" y="9" width="5.2" height="5.2" rx="1.2" />
            <rect x="9" y="9" width="5.2" height="5.2" rx="1.2" />
          </svg>
        ),
      },
      {
        sub: '/performance',
        label: 'Performance',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M8 1.9a6.1 6.1 0 106.1 6.1" strokeLinecap="round" />
            <path d="M8 8l3.6-3.1" strokeLinecap="round" />
            <path d="M11.2 1.9l2.9 1.2-1.2 2.9" strokeLinejoin="round" />
          </svg>
        ),
      },
      {
        sub: '/operation',
        label: 'Operation Center',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="8" cy="8" r="2.1" />
            <path d="M8 1.9v1.8M8 12.3v1.8M1.9 8h1.8M12.3 8h1.8M3.7 3.7l1.3 1.3M11 11l1.3 1.3M12.3 3.7L11 5M5 11l-1.3 1.3"
                  strokeLinecap="round" />
          </svg>
        ),
      },
      {
        sub: '/reporting',
        label: 'Reporting Center',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2 13.2V2.8M2 13.2h12" strokeLinecap="round" />
            <path d="M4.6 10.4l2.6-3.2 2.4 2 3-4.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Manage',
    items: [
      {
        sub: '/firms',
        label: 'Firms',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2.4 13.6V4.2l5-2.2v11.6M7.4 13.6h6.2V6.6l-6.2-1" strokeLinejoin="round" />
            <path d="M4.4 6.2v.01M4.4 8.6v.01M4.4 11v.01M10 8.6v.01M10 11v.01" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        sub: '/expenses',
        label: 'Operating expenses',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.6" />
            <path d="M1.8 6.6h12.4" />
            <path d="M4.6 9.8h2.8" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        sub: '/payroll',
        label: 'Rep pay',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 4.6v6.8M6.2 6.4h3a1.4 1.4 0 010 2.8h-2.4a1.4 1.4 0 000 2.8h3" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
]

export function FinanceNav({ base, asOf }: { base: string; asOf?: string }) {
  const pathname = usePathname() || ''
  const href = (sub: string) => (base + sub) || '/'

  return (
    <aside className="fin-side">
      <div className="fin-side-h">
        <span className="fin-mark" aria-hidden>FC</span>
        <span className="fin-brand">
          Financial Center
          <small>CaseBridge</small>
        </span>
      </div>

      <nav className="fin-nav">
        {GROUPS.map((g) => (
          <div key={g.title} className="fin-nav-g">
            <p className="fin-nav-t">{g.title}</p>
            {g.items.map((t) => {
              const target = href(t.sub)
              /* The dashboard sits at the root, so "starts with" would mark
                 it active on every page below it. */
              const active = t.sub === '' ? pathname === target : pathname.startsWith(target)
              return (
                <Link key={t.sub} href={target} className="fin-tab" aria-current={active ? 'page' : undefined}>
                  {t.icon}
                  {t.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {asOf && <div className="fin-side-f">Figures through {asOf}</div>}
    </aside>
  )
}
