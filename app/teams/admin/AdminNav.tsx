'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const navItems = [
  { label: 'Overview',     href: '/teams/admin',              exact: true },
  { label: 'Reps',         href: '/teams/admin/reps',         exact: false },
  { label: 'Performance',  href: '/teams/admin/performance',  exact: false },
  { label: 'Cases',        href: '/teams/admin/cases',        exact: false },
  { label: 'Timeclock',    href: '/teams/admin/timeclock',    exact: false },
  { label: 'Urgent Tasks', href: '/teams/admin/urgent-tasks', exact: false },
  { label: 'Programs',     href: '/teams/admin/programs',     exact: false },
  { label: 'Modules',      href: '/teams/admin/modules',      exact: false },
  { label: 'Exams',        href: '/teams/admin/exams',        exact: false },
]

export default function AdminNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTeam = searchParams.get('team') ?? 'intake'

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    if (href === '/teams/admin/modules') {
      return pathname === href || (pathname.startsWith(href + '/') && !pathname.includes('/add'))
    }
    return pathname.startsWith(href)
  }

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
      active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
    }`

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-0 overflow-x-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={tabClass(isActive(item.href, item.exact))}>
              {item.label}
            </Link>
          ))}

          {/* Add Module — preserves current team param */}
          <Link
            href={`/teams/admin/modules/add?team=${currentTeam}`}
            className={tabClass(pathname === '/teams/admin/modules/add')}
          >
            <span className="text-base leading-none">+</span>
            Add Module
          </Link>
        </div>
      </div>
    </nav>
  )
}
