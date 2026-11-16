'use client'
import Link from 'next/link'

// Most recent notification — update this when a new one is added
const LATEST = {
  label: 'Case Bridge Operator Certification',
  detail: 'Required before live-lead assignment.',
}

export default function NotificationBanner() {
  return (
    <div className="w-full bg-primary border-b border-primary px-4 py-2.5 flex items-center justify-center gap-3 text-sm text-primary-foreground sticky top-0 z-40">
      <span className="text-warning shrink-0">🔔</span>
      <span>
        <strong>{LATEST.label}:</strong>{' '}{LATEST.detail}{' '}
        <Link href="/teams/notifications" className="underline text-primary-foreground/75 hover:text-white transition-colors">
          View all notifications
        </Link>
      </span>
    </div>
  )
}
