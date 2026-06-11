'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

function formatCountdown(ms: number) {
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function LevelTimer({ deadlineAt }: { deadlineAt: string }) {
  const router = useRouter()
  const [remaining, setRemaining] = useState(() => new Date(deadlineAt).getTime() - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const ms = new Date(deadlineAt).getTime() - Date.now()
      setRemaining(ms)
      if (ms <= 0) {
        clearInterval(interval)
        router.refresh()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [deadlineAt, router])

  const formatted = formatCountdown(remaining)

  return formatted ? (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full tabular-nums">
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {formatted} remaining
    </div>
  ) : (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Time expired
    </div>
  )
}
