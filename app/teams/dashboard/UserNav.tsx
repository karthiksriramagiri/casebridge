'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  timeclockEnabled: boolean
  teamType?: string
}

export default function UserNav({ timeclockEnabled, teamType }: Props) {
  const pathname = usePathname()
  const isCreative = teamType === 'creative'

  const tabs = isCreative
    ? [
        { label: 'Training', href: '/teams/dashboard' },
        { label: 'Pay', href: '/teams/pay' },
        { label: 'Todos', href: '/teams/todos' },
      ]
    : [
        { label: 'Home', href: '/teams/home' },
        { label: 'Training', href: '/teams/dashboard' },
        { label: 'Performance', href: '/teams/performance' },
        { label: 'Incentives', href: '/teams/incentives' },
        { label: 'My Cases', href: '/teams/cases' },
        { label: 'Pay', href: '/teams/pay' },
        { label: 'Todos', href: '/teams/todos' },
        { label: '🔔 Notifications', href: '/teams/notifications' },
      ]

  const tabClass = (active: boolean) =>
    `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
      active
        ? 'border-[#0f1e3c] text-[#0f1e3c]'
        : 'border-transparent text-gray-500 hover:text-gray-800'
    }`

  return (
    <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
      {isCreative ? (
        tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className={tabClass(pathname.startsWith(tab.href))}>
            {tab.label}
          </Link>
        ))
      ) : (
        <>
          {tabs.slice(0, 2).map((tab) => (
            <Link key={tab.href} href={tab.href} className={tabClass(pathname === tab.href)}>
              {tab.label}
            </Link>
          ))}
          <a
            href="https://case-bridge.com/nuances"
            target="_blank"
            rel="noopener noreferrer"
            className={tabClass(false)}
          >
            Nuances
          </a>
          <Link href="/teams/exam" className={tabClass(pathname.startsWith('/teams/exam'))}>
            Exams
          </Link>
          {tabs.slice(2).map((tab) => (
            <Link key={tab.href} href={tab.href} className={tabClass(pathname.startsWith(tab.href))}>
              {tab.label}
            </Link>
          ))}
        </>
      )}
    </div>
  )
}
