'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'

interface Score {
  id: string
  date: string
  score: number
  notes: string | null
}

export default function PerformancePage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [scores, setScores] = useState<Score[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/teams/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('role, nda_signed, timeclock_enabled')
        .eq('id', user.id)
        .single()

      if (!prof || !prof.nda_signed) { router.push('/teams/onboarding'); return }
      if (prof.role === 'admin') { router.push('/teams/admin'); return }
      setTimeclockEnabled(!!prof.timeclock_enabled)

      const res = await fetch('/api/teams/performance')
      if (res.ok) {
        const d = await res.json()
        setScores(d.scores || [])
        setAverage(d.average)
      }
      setLoading(false)
    }
    load()
  }, [])

  const bonusEligible = average !== null && average >= 4.5
  const monthScores = scores.filter(s => s.date.startsWith(new Date().toISOString().slice(0, 7)))
  const monthAvg = monthScores.length > 0
    ? monthScores.reduce((sum, s) => sum + Number(s.score), 0) / monthScores.length
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Daily Performance</h1>
          <p className="text-gray-500 mt-1">Your scores are entered daily by your manager.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className={`rounded-xl px-5 py-4 border shadow-sm ${bonusEligible ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">All-Time Average</p>
                <p className={`text-3xl font-bold ${bonusEligible ? 'text-green-600' : 'text-gray-900'}`}>
                  {average !== null ? average.toFixed(2) : '—'}
                </p>
                {bonusEligible && (
                  <span className="inline-block mt-2 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    ✓ Bonus Eligible!
                  </span>
                )}
              </div>

              <div className="bg-white rounded-xl px-5 py-4 border border-gray-100 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">This Month's Average</p>
                <p className="text-3xl font-bold text-gray-900">
                  {monthAvg !== null ? monthAvg.toFixed(2) : '—'}
                </p>
                <p className="text-xs text-gray-400 mt-2">{monthScores.length} score{monthScores.length !== 1 ? 's' : ''} this month</p>
              </div>

              <div className="bg-white rounded-xl px-5 py-4 border border-gray-100 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Bonus Threshold</p>
                <p className="text-3xl font-bold text-gray-900">4.5</p>
                <p className="text-xs text-gray-400 mt-2">Average score needed for monthly bonus</p>
              </div>
            </div>

            {/* Score history */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Score History</h2>
              </div>
              {scores.length === 0 ? (
                <div className="px-5 py-12 text-center text-gray-400 text-sm">No scores recorded yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {scores.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {format(new Date(s.date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                        </p>
                        {s.notes && <p className="text-xs text-gray-400 mt-0.5">{s.notes}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        <ScoreBar score={s.score} />
                        <span className={`text-lg font-bold w-10 text-right ${
                          s.score >= 4.5 ? 'text-green-600' : s.score >= 3.5 ? 'text-blue-600' : s.score >= 2.5 ? 'text-yellow-600' : 'text-red-500'
                        }`}>
                          {s.score}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 5) * 100
  const color = score >= 4.5 ? 'bg-green-500' : score >= 3.5 ? 'bg-blue-500' : score >= 2.5 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
