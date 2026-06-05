'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  timeclockEnabled: boolean
}

export default function UserNav({ timeclockEnabled }: Props) {
  const pathname = usePathname()

  const tabs = [
    { label: 'Home', href: '/teams/home' },
    { label: 'Training', href: '/teams/dashboard' },
    { label: 'Performance', href: '/teams/performance' },
    { label: 'My Cases', href: '/teams/cases' },
    { label: 'Pay', href: '/teams/pay' },
    { label: 'Todos', href: '/teams/todos' },
  ]

  return (
    <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
            pathname === tab.href
              ? 'border-[#0f1e3c] text-[#0f1e3c]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
