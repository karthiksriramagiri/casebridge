'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Overview', href: '/teams/admin', exact: true, group: 'general' },
  { label: 'Reps', href: '/teams/admin/reps', exact: false, group: 'general' },
  { label: 'Performance', href: '/teams/admin/performance', exact: false, group: 'general' },
  { label: 'Cases', href: '/teams/admin/cases', exact: false, group: 'general' },
  { label: 'Timeclock', href: '/teams/admin/timeclock', exact: false, group: 'general' },
  { label: 'Urgent Tasks', href: '/teams/admin/urgent-tasks', exact: false, group: 'general' },
  { label: 'Intake Programs', href: '/teams/admin/programs', exact: false, group: 'intake' },
  { label: 'Intake Modules', href: '/teams/admin/modules', exact: false, group: 'intake' },
  { label: 'Intake Exams', href: '/teams/admin/exams', exact: false, group: 'intake' },
  { label: 'Creative Programs', href: '/teams/admin/creative-programs', exact: false, group: 'creative' },
  { label: 'Creative Modules', href: '/teams/admin/creative-modules', exact: false, group: 'creative' },
  { label: 'Creative Exams', href: '/teams/admin/creative-exams', exact: false, group: 'creative' },
]

export default function AdminNav() {
  const pathname = usePathname()

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    if (href === '/teams/admin/modules') {
      return pathname === href || (pathname.startsWith(href + '/') && !pathname.includes('/add'))
    }
    if (href === '/teams/admin/creative-modules') {
      return pathname === href || (pathname.startsWith(href + '/') && !pathname.includes('/add'))
    }
    return pathname.startsWith(href)
  }

  const generalItems = navItems.filter(i => i.group === 'general')
  const intakeItems  = navItems.filter(i => i.group === 'intake')
  const creativeItems = navItems.filter(i => i.group === 'creative')

  const tabClass = (active: boolean) => `
    flex items-center gap-1.5 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
    ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}
  `

  const isCreativePath = pathname.startsWith('/teams/admin/creative')
  const isIntakePath = pathname.startsWith('/teams/admin/modules') ||
    pathname.startsWith('/teams/admin/programs') ||
    pathname.startsWith('/teams/admin/exams')

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-0 overflow-x-auto">
          {/* General tabs */}
          {generalItems.map((item) => (
            <Link key={item.href} href={item.href} className={tabClass(isActive(item.href, item.exact))}>
              {item.label}
            </Link>
          ))}

          {/* Intake divider + tabs */}
          <span className="mx-2 h-5 w-px bg-gray-200 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400 px-1 shrink-0">Intake</span>
          {intakeItems.map((item) => (
            <Link key={item.href} href={item.href} className={tabClass(isActive(item.href, item.exact))}>
              {item.label}
            </Link>
          ))}
          <Link
            href="/teams/admin/modules/add"
            className={tabClass(pathname === '/teams/admin/modules/add')}
          >
            <span className="text-base leading-none">+</span>
            Add
          </Link>

          {/* Creative divider + tabs */}
          <span className="mx-2 h-5 w-px bg-gray-200 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 px-1 shrink-0">Creative</span>
          {creativeItems.map((item) => (
            <Link key={item.href} href={item.href} className={tabClass(isActive(item.href, item.exact))}>
              {item.label}
            </Link>
          ))}
          <Link
            href="/teams/admin/creative-modules/add"
            className={tabClass(pathname === '/teams/admin/creative-modules/add')}
          >
            <span className="text-base leading-none">+</span>
            Add
          </Link>
        </div>
      </div>
    </nav>
  )
}
