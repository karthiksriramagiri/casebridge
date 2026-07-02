'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format, subDays, startOfWeek } from 'date-fns'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'

interface ScoreEvent {
  id: string
  event_type: string
  points: number
  note: string | null
  date: string
  auto_generated: boolean
  created_at: string
}

interface DayScore {
  date: string
  events: ScoreEvent[]
  eventTotal: number
  dayScore: number
}

const EVENT_LABELS: Record<string, string> = {
  lead_closed:              'Lead Closed',
  perfect_day:              'Perfect Day Bonus',
  good_call:                'Good Call Quality',
  todo_complete:            'To-Do Completed',
  missed_checkmark:         'Lead Not Checkmarked in Time',
  no_call_after_checkmark:  'No Call After Checkmark',
  missed_followup_call:     'Missed Follow-Up / Chase Call',
  late_clockin:             'Late Clock-In (>10 min)',
  minor_violation:          'Minor Rule Violation',
  bad_call:                 'Bad Call Quality',
  slow_checkmark:           'Slow Lead Checkmark',
}

const EVENT_ICONS: Record<string, string> = {
  lead_closed:              '🤝',
  perfect_day:              '✨',
  good_call:                '📞',
  todo_complete:            '✅',
  missed_checkmark:         '❌',
  no_call_after_checkmark:  '📵',
  missed_followup_call:     '📋',
  late_clockin:             '⏰',
  minor_violation:          '⚠️',
  bad_call:                 '🚫',
  slow_checkmark:           '🐢',
}

type Range = 'week' | '7d' | '30d' | 'all'

function scoreColor(score: number) {
  if (score > 2) return 'text-green-600'
  if (score >= 2) return 'text-gray-900'
  return 'text-red-500'
}

function scoreBg(score: number) {
  if (score > 2) return 'bg-green-50 border-green-200'
  if (score >= 2) return 'bg-white border-gray-100'
  return 'bg-red-50 border-red-100'
}

function fmtPts(pts: number) {
  return (pts > 0 ? '+' : '') + pts
}

export default function PerformancePage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [dailyScores, setDailyScores] = useState<DayScore[]>([])
  const [todayScore, setTodayScore] = useState(2)
  const [todayEventTotal, setTodayEventTotal] = useState(0)
  const [rank, setRank] = useState<number | null>(null)
  const [totalReps, setTotalReps] = useState(0)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('week')

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

      const res = await fetch('/api/teams/score-events')
      if (res.ok) {
        const d = await res.json()
        setDailyScores(d.dailyScores || [])
        setTodayScore(d.todayScore ?? 3)
        setTodayEventTotal(d.todayEventTotal ?? 0)
        setRank(d.rank ?? null)
        setTotalReps(d.totalReps ?? 0)
      }
      setLoading(false)
    }
    load()
  }, [router])

  const today = new Date().toISOString().slice(0, 10)

  const filteredDays = useMemo(() => {
    // Previous days only (not today) for history
    const prev = dailyScores.filter(d => d.date < today)
    if (range === 'all') return prev
    const cutoff =
      range === 'week' ? startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().slice(0, 10) :
      range === '7d'   ? subDays(new Date(), 7).toISOString().slice(0, 10) :
                         subDays(new Date(), 30).toISOString().slice(0, 10)
    return prev.filter(d => d.date >= cutoff)
  }, [dailyScores, range, today])

  const todayEvents = dailyScores.find(d => d.date === today)?.events ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Performance</h1>
          <p className="text-gray-500 mt-1 text-sm">You start at 2 pts each day. Events adjust it up or down.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Today's score */}
            <div className={`rounded-2xl border shadow-sm px-6 py-6 mb-6 ${scoreBg(todayScore)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Today's Score · {format(new Date(), 'EEE, MMM d')}
                  </p>
                  <div className="flex items-end gap-3">
                    <p className={`text-6xl font-bold ${scoreColor(todayScore)}`}>
                      {Math.round(todayScore * 100) / 100}
                    </p>
                    <div className="mb-1">
                      <p className="text-sm text-gray-400">= 2 base</p>
                      {todayEventTotal !== 0 && (
                        <p className={`text-sm font-semibold ${todayEventTotal > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {fmtPts(todayEventTotal)} from events
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {rank !== null && (
                    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                      <p className="text-xs text-gray-400 font-medium">This week's rank</p>
                      <p className="text-2xl font-bold text-gray-900">#{rank}</p>
                      <p className="text-xs text-gray-400">of {totalReps}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Today's events */}
              {todayEvents.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
                  {todayEvents.map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span>{EVENT_ICONS[e.event_type] || '•'}</span>
                      <span className="text-gray-700 flex-1">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                      {e.note && <span className="text-gray-400 text-xs">{e.note}</span>}
                      <span className={`font-semibold ${Number(e.points) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmtPts(Number(e.points))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Point rules */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-8">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">How Points Work · Start at 2 each day</p>
              <div className="mb-3">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1.5">You gain</p>
                <div className="space-y-1 text-sm">
                  {[
                    ['🤝 Close a lead', '+2'],
                    ['✨ No negative points today', '+1'],
                  ].map(([label, pts]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-semibold text-green-600">{pts} pt</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1.5">You lose</p>
                <div className="space-y-1 text-sm">
                  {[
                    ['❌ Lead not checkmarked in 60s (7am–9pm PST)', '−1'],
                    ['📵 Checkmarked but no call in 60s', '−3'],
                    ['📋 Missed Follow-Up / Chase call', '−2'],
                    ['⏰ Late clock-in (>10 min)', '−1'],
                  ].map(([label, pts]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-semibold text-red-500 shrink-0">{pts} pt</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Previous days history */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 text-sm">Previous Days</h2>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {([
                    { key: 'week', label: 'This week' },
                    { key: '7d',   label: '7 days' },
                    { key: '30d',  label: '30 days' },
                    { key: 'all',  label: 'All' },
                  ] as { key: Range; label: string }[]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setRange(key)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                        range === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredDays.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-10 text-center text-gray-400 text-sm">
                  No history for this period.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDays.map(day => (
                    <div key={day.date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                        <p className="text-sm font-semibold text-gray-800">
                          {format(new Date(day.date + 'T12:00:00'), 'EEEE, MMMM d')}
                        </p>
                        <div className="flex items-center gap-2">
                          {day.eventTotal !== 0 && (
                            <span className={`text-xs font-medium ${day.eventTotal > 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {fmtPts(day.eventTotal)}
                            </span>
                          )}
                          <span className={`text-lg font-bold ${scoreColor(day.dayScore)}`}>
                            {Math.round(day.dayScore * 100) / 100}
                          </span>
                        </div>
                      </div>
                      {day.events.length > 0 ? (
                        <div className="divide-y divide-gray-50">
                          {day.events.map(e => (
                            <div key={e.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
                              <span className="shrink-0">{EVENT_ICONS[e.event_type] || '•'}</span>
                              <span className="text-gray-700 flex-1">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                              {e.note && <span className="text-gray-400 text-xs truncate max-w-32">{e.note}</span>}
                              <span className={`font-semibold shrink-0 ${Number(e.points) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {fmtPts(Number(e.points))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-5 py-2.5 text-sm text-gray-400">No events — base score 2</p>
                      )}
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
