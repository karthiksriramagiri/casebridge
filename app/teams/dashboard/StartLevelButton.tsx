'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StartLevelButton({ level }: { level: number }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleStart() {
    setLoading(true)
    await fetch('/api/teams/level-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level }),
    })
    router.refresh()
  }

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className="bg-[#0f1e3c] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#1a3060] disabled:opacity-60 transition-colors"
    >
      {loading ? 'Starting…' : `Start Level ${level}`}
    </button>
  )
}
