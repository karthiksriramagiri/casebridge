'use client'

import { useState, useEffect } from 'react'
import { differenceInMinutes, parseISO } from 'date-fns'

interface Entry {
  id: string
  clock_in: string
  clock_out: string | null
}

export default function TimeclockWidget({ profileId }: { profileId: string }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [acting, setActing] = useState(false)
  const [, setTick] = useState(0)

  const today = new Date().toISOString().slice(0, 10)

  // Tick every 30s to update elapsed time
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  async function load() {
    try {
      const res = await fetch(`/api/metrics/time-entries?date=${today}`)
      const data = await res.json()
      const me = (data.workers || []).find((w: any) => w.profileId === profileId)
      setEntries(me?.entries || [])
    } catch {}
    setLoaded(true)
  }

  useEffect(() => { load() }, [profileId])

  const openEntry = entries.find(e => !e.clock_out)
  const now = Date.now()

  const totalMins = entries.reduce((sum, e) => {
    const end = e.clock_out ? new Date(e.clock_out).getTime() : now
    return sum + Math.max(0, (end - new Date(e.clock_in).getTime()) / 60000)
  }, 0)

  let elapsed = ''
  if (openEntry) {
    const mins = Math.max(0, differenceInMinutes(new Date(), parseISO(openEntry.clock_in)))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    elapsed = h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  async function clockIn() {
    setActing(true)
    await fetch('/api/metrics/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_id: profileId, date: today }),
    })
    await load()
    setActing(false)
  }

  async function clockOut() {
    if (!openEntry) return
    setActing(true)
    await fetch('/api/metrics/time-entries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: openEntry.id }),
    })
    await load()
    setActing(false)
  }

  return (
    <div className={`rounded-xl border shadow-sm px-5 py-4 mb-6 transition-colors ${openEntry ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center justify-between gap-4">
        {/* Left: status */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${openEntry ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Timeclock</p>
            {!loaded ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : openEntry ? (
              <p className="text-sm font-semibold text-green-700">
                Clocked in · {elapsed}
                {totalMins > 0 && <span className="font-normal text-green-600 ml-2">({(totalMins / 60).toFixed(1)}h today)</span>}
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                {totalMins > 0 ? `${(totalMins / 60).toFixed(1)}h logged today · Not clocked in` : 'Not clocked in today'}
              </p>
            )}
          </div>
        </div>

        {/* Right: button */}
        <button
          onClick={openEntry ? clockOut : clockIn}
          disabled={acting || !loaded}
          className={`text-sm font-bold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap flex-shrink-0 ${
            openEntry
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-[#0f1e3c] text-white hover:bg-[#1a3060]'
          }`}
        >
          {acting ? '…' : openEntry ? 'Clock Out' : 'Clock In'}
        </button>
      </div>

      {/* Session history for today */}
      {entries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-200 flex flex-wrap gap-2">
          {entries.map(e => {
            const inTime = new Date(e.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            const outTime = e.clock_out
              ? new Date(e.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              : 'now'
            const mins = e.clock_out
              ? (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 60000
              : (now - new Date(e.clock_in).getTime()) / 60000
            return (
              <span key={e.id} className="text-xs bg-white border border-green-200 rounded-full px-3 py-1 text-gray-600">
                {inTime} → {outTime} <span className="text-gray-400">· {(Math.max(0, mins) / 60).toFixed(1)}h</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
