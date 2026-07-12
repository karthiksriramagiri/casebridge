'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'

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

interface RepData {
  profile: { id: string; name: string } | null
  dailyScores: DayScore[]
  todayScore: number
  todayEvents: ScoreEvent[]
  closes: number
  baseScore: number
}

const EVENT_LABELS: Record<string, string> = {
  lead_closed:              'Lead Closed',
  perfect_day:              'Perfect Day Bonus',
  good_call:                'Good Call Quality',
  missed_checkmark:         'Lead Not Checkmarked in Time',
  no_call_after_checkmark:  'No Call After Checkmark',
  missed_followup_call:     'Missed Follow-Up / Chase Call',
  late_clockin:             'Late Clock-In (>10 min)',
  minor_violation:          'Minor Rule Violation',
  bad_call:                 'Bad Call Quality',
  slow_checkmark:           'Slow Lead Checkmark',
}

function pointsColor(pts: number) {
  return pts > 0 ? 'text-green-600' : pts < 0 ? 'text-red-500' : 'text-gray-500'
}

function fmtPts(pts: number) {
  return (pts > 0 ? '+' : '') + pts
}

export default function RepPerformancePage({ params }: { params: { repId: string } }) {
  const { repId } = params
  const [data, setData] = useState<RepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  useEffect(() => {
    const localDate = new Date().toLocaleDateString('en-CA')
    fetch(`/api/teams/admin/rep-performance?repId=${repId}&date=${localDate}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load.'); setLoading(false) })
  }, [repId])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-8">
        <Link href="/teams/admin/performance" className="text-sm text-blue-600 hover:underline">
          ← Performance
        </Link>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center text-red-500 text-sm">
          {error || 'Rep not found.'}
        </div>
      </div>
    )
  }

  const repName = data.profile?.name ?? repId
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link href="/teams/admin/performance" className="text-sm text-blue-600 hover:underline">
          ← Performance
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{repName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Rep performance detail</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 font-medium">Today's Score</p>
            <p className={`text-3xl font-bold ${data.todayScore > 2 ? 'text-green-600' : data.todayScore >= 2 ? 'text-gray-900' : 'text-red-500'}`}>
              {Math.round(data.todayScore * 100) / 100}
            </p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Closes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.closes}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Base Score</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.baseScore}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Today's Events</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.todayEvents.length}</p>
        </div>
      </div>

      {/* Today's Events */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-3">Today's Events</h2>
        {data.todayEvents.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-8 text-center text-gray-400 text-sm">
            No events logged today.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {data.todayEvents.map(e => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                      {e.auto_generated && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">auto</span>
                      )}
                    </div>
                    {e.note && <p className="text-xs text-gray-400 mt-0.5">{e.note}</p>}
                  </div>
                  <span className={`text-sm font-bold shrink-0 ml-4 ${pointsColor(Number(e.points))}`}>
                    {fmtPts(Number(e.points))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Score History */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-3">Score History</h2>
        {data.dailyScores.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-8 text-center text-gray-400 text-sm">
            No events logged yet.
          </div>
        ) : null}
        <div className="space-y-2">
          {data.dailyScores.map(day => {
            const isExpanded = expandedDay === day.date
            const hasEvents = day.events.length > 0
            return (
              <div key={day.date} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Day header — clickable if events exist */}
                <div
                  onClick={() => hasEvents && setExpandedDay(isExpanded ? null : day.date)}
                  className={`flex items-center justify-between px-5 py-3 ${hasEvents ? 'cursor-pointer hover:bg-gray-50' : ''} ${isExpanded ? 'border-b border-gray-100 bg-gray-50' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">
                      {format(new Date(day.date + 'T12:00:00'), 'EEE, MMM d')}
                    </span>
                    {day.date === today && (
                      <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full font-medium">Today</span>
                    )}
                    {hasEvents && (
                      <span className="text-xs text-gray-400">{day.events.length} event{day.events.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {day.eventTotal !== 0 && (
                      <span className={`text-xs font-medium ${day.eventTotal > 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {day.eventTotal > 0 ? '+' : ''}{Math.round(day.eventTotal * 100) / 100} pts
                      </span>
                    )}
                    <span className={`text-base font-bold ${day.dayScore > 2 ? 'text-green-600' : day.dayScore >= 2 ? 'text-gray-900' : 'text-red-500'}`}>
                      {Math.round(day.dayScore * 100) / 100}
                    </span>
                    {hasEvents && (
                      <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>
                </div>
                {/* Events breakdown — shown on click */}
                {isExpanded && hasEvents && (
                  <div className="divide-y divide-gray-50">
                    {day.events.map(e => (
                      <div key={e.id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-800 font-medium">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                            {e.auto_generated && (
                              <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">auto</span>
                            )}
                          </div>
                          {e.note && <p className="text-xs text-gray-400 mt-0.5">{e.note}</p>}
                        </div>
                        <span className={`text-sm font-bold shrink-0 ml-4 ${pointsColor(Number(e.points))}`}>
                          {fmtPts(Number(e.points))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
