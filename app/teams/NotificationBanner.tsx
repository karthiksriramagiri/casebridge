'use client'
import Link from 'next/link'

// Most recent notification — update this when a new one is added
const LATEST = {
  label: 'Case Bridge Operator Certification',
  detail: 'Required before live-lead assignment.',
}

export default function NotificationBanner() {
  return (
    <div className="w-full bg-[#0f1e3c] border-b border-blue-900 px-4 py-2.5 flex items-center justify-center gap-3 text-sm text-white sticky top-0 z-40">
      <span className="text-yellow-400 shrink-0">🔔</span>
      <span>
        <strong>{LATEST.label}:</strong>{' '}{LATEST.detail}{' '}
        <Link href="/teams/notifications" className="underline text-blue-300 hover:text-white transition-colors">
          View all notifications
        </Link>
      </span>
    </div>
  )
}
