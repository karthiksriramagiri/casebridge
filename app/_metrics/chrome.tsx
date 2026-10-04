'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconExit, IconRefresh } from './dash'
import { useSite, type SiteId } from './site'
import { canOpen } from '@/lib/roles'

/* ═══════════════════════════════════════════════════════════════════════════
   The app bar shared by the Creative and Financial centers.

   Each center is its own subdomain but one deployment, so the header has to
   know which site it is rendering inside and what its links should look like.
   Both come from the layout via SiteProvider — not from usePathname(), which
   after the rewrite still reports the browser path ("/" on a subdomain) and
   so can identify neither.

   Nav entries are stored as paths relative to the center root; `base` from
   the site context turns them into browser-facing hrefs.
   ═══════════════════════════════════════════════════════════════════════════ */

type NavItem = {
  label: string
  /** Relative to the center root. '' is the center's front page. */
  sub: string
  /** Sends the tab somewhere outside the app instead — Assignments currently
      lives in Notion, so the tab opens that rather than a page we do not have. */
  external?: string
}

const NAV: Record<SiteId, { wordmark: string; items: NavItem[] }> = {
  creative: {
    wordmark: 'Creative',
    items: [
      { label: 'Overview',          sub: '' },
      { label: 'Creative Analysis', sub: '/analysis' },
      { label: 'Winner Analysis',   sub: '/winners' },
      { label: 'Competitors',       sub: '/competitors' },
      { label: 'Angles',            sub: '/angles' },
      { label: 'Assignments',       sub: '/assignments',
        external: process.env.NEXT_PUBLIC_NOTION_ASSIGNMENTS_URL || undefined },
    ],
  },
  finance: {
    wordmark: 'Finance',
    items: [
      { label: 'Overview',  sub: '' },
      { label: 'Firms',     sub: '/firms' },
      { label: 'OOS Cases', sub: '/oos-cases' },
    ],
  },
}

export function MetricsHeader({ actions, onRefresh, refreshing, badges, below }: {
  actions?: React.ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  /** Count bubble keyed by the nav item's `sub`, e.g. { '': 3 } for the root. */
  badges?: Record<string, number>
  below?: React.ReactNode
}) {
  const pathname = usePathname() || ''
  const router = useRouter()
  const site = useSite()
  const { wordmark, items } = NAV[site.id]

  /* A tab the gate would refuse is not shown. The gate is still what enforces
     it — this only keeps the header from advertising pages that answer with a
     lock screen. Paths are the center's real ones, not the host-relative
     `base`, since that is what the gate matches on. */
  const visible = items.filter(item => canOpen(site.role, site.root + item.sub))

  const href = (sub: string) => (site.base + sub) || '/'

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="mx-header">
      <div className="mx-header-inner">
        <Link href={visible[0] ? href(visible[0].sub) : href('')}
              className="mx-wordmark" style={{ textDecoration: 'none' }}>
          CaseBridge <i>{wordmark}</i>
        </Link>

        <nav className="mx-nav" aria-label={`${wordmark} sections`}>
          {visible.map(item => {
            const target = href(item.sub)
            const active = item.sub === ''
              ? pathname === target
              : pathname.startsWith(target)
            const count = badges?.[item.sub]
            if (item.external) {
              return (
                <a key={item.sub} href={item.external} className="mx-tab"
                   rel="noopener noreferrer">
                  {item.label}
                </a>
              )
            }
            return (
              <Link key={item.sub} href={target} className="mx-tab"
                aria-current={active ? 'page' : undefined}>
                {item.label}
                {!!count && <span className="mx-tab-count">{count}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="mx-header-actions">
          {actions}
          {onRefresh && (
            <button className="mx-icon-btn" onClick={onRefresh} title="Reload this page" aria-label="Refresh">
              <IconRefresh className={refreshing ? 'mx-spin' : undefined} />
            </button>
          )}
          <button className="mx-icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
            <IconExit />
          </button>
        </div>
      </div>

      {below}
    </header>
  )
}

/* ── Breadcrumb ─────────────────────────────────────────────────────────── */

export type Crumb = { label: string; href?: string }

export function Breadcrumbs({ items, trailing }: { items: Crumb[]; trailing?: React.ReactNode }) {
  return (
    <nav className="mx-crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} style={{ display: 'contents' }}>
          {i > 0 && <span className="mx-crumb-sep" aria-hidden="true">/</span>}
          {c.href
            ? <Link href={c.href} className="mx-crumb">{c.label}</Link>
            : <span className="mx-crumb-current">{c.label}</span>}
        </span>
      ))}
      {trailing}
    </nav>
  )
}
