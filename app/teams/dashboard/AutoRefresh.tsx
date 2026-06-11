'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Silently refreshes the server component when `at` time is reached.
// Used to auto-unlock Level 2 the moment the call window ends.
export default function AutoRefresh({ at }: { at: string }) {
  const router = useRouter()
  useEffect(() => {
    const ms = new Date(at).getTime() - Date.now()
    if (ms <= 0) { router.refresh(); return }
    const t = setTimeout(() => router.refresh(), ms)
    return () => clearTimeout(t)
  }, [at, router])
  return null
}
