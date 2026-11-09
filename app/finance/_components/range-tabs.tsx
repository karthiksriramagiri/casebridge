'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

/* The dashboard's timeframe.

   Five windows rather than the Reporting Center's thirteen: this page
   answers "how are we doing", and the long tail of ranges belongs to the
   page built for asking questions. It lives in the query string like
   everything else, so a reload keeps it and a link carries it. */

const RANGES: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'wtd', label: 'This week' },
  { key: 'mtd', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'ytd', label: 'This year' },
]

export function RangeTabs({ active, basePath }: { active: string; basePath: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, start] = useTransition()

  const go = (key: string) => {
    const sp = new URLSearchParams(params?.toString() ?? '')
    sp.set('range', key)
    start(() => router.push(`${basePath}?${sp.toString()}`))
  }

  return (
    <div className="fin-subtabs" role="tablist" aria-label="Timeframe" aria-busy={pending}>
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="tab"
          aria-selected={r.key === active}
          className="fin-subtab"
          onClick={() => go(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
