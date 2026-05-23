'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminNavProps {
  retakeCount: number
}

const navItems = [
  { label: 'Overview', href: '/teams/admin', exact: true },
  { label: 'Completions', href: '/teams/admin/completions', exact: false },
  { label: 'Retakes', href: '/teams/admin/retakes', exact: false, badge: true },
  { label: 'Reps', href: '/teams/admin/reps', exact: false },
  { label: 'Programs', href: '/teams/admin/programs', exact: false },
  { label: 'Modules', href: '/teams/admin/modules', exact: false },
]

export default function AdminNav({ retakeCount }: AdminNavProps) {
  const pathname = usePathname()

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    // For modules, make sure /modules/add doesn't activate /modules tab only
    if (href === '/teams/admin/modules') {
      return pathname === href || (pathname.startsWith(href) && !pathname.includes('/add'))
    }
    return pathname.startsWith(href)
  }

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-0 overflow-x-auto">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                  ${active
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }
                `}
              >
                {item.label}
                {item.badge && retakeCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                    {retakeCount}
                  </span>
                )}
              </Link>
            )
          })}

          {/* Add Module — styled as a button-like tab */}
          <Link
            href="/teams/admin/modules/add"
            className={`
              flex items-center gap-1 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ml-2
              ${pathname === '/teams/admin/modules/add'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-blue-500 hover:text-blue-700 hover:border-blue-300'
              }
            `}
          >
            <span className="text-base leading-none">+</span>
            Add Module
          </Link>
        </div>
      </div>
    </nav>
  )
}
