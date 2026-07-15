'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import ScoreChart from '@/app/teams/ScoreChart'

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

}

const POINT_VALUES: Record<string, number> = {
  lead_closed:              2,
  perfect_day:              1,
  good_call:                1,
  missed_checkmark:        -1,
  no_call_after_checkmark: -3,
  missed_followup_call:    -2,
  late_clockin:            -1,
  minor_violation:         -0.25,
  bad_call:                -1,

}

const MANUAL_EVENTS = [
  { type: 'good_call',                pts: +1 },
  { type: 'lead_closed',              pts: +2 },
  { type: 'perfect_day',              pts: +1 },
  { type: 'bad_call',                 pts: -1 },
  { type: 'missed_checkmark',         pts: -1 },

  { type: 'missed_followup_call',     pts: -2 },
  { type: 'no_call_after_checkmark',  pts: -3 },
  { type: 'late_clockin',             pts: -1 },
  { type: 'minor_violation',          pts: -0.25 },
]

function pointsColor(pts: number) {
  return pts > 0 ? 'text-green-600' : pts < 0 ? 'text-red-500' : 'text-gray-400'
}
function pointsBadge(pts: number) {
  const s = pts > 0 ? 'bg-green-50 text-green-700 border-green-100' : pts < 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-gray-50 text-gray-500 border-gray-100'
  return `inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${s}`
}
function fmtPts(pts: number) {
  return (pts > 0 ? '+' : '') + (Number.isInteger(pts) ? pts : pts.toFixed(2))
}
function scoreColor(score: number) {
  return score > 2 ? 'text-green-600' : score >= 2 ? 'text-gray-900' : 'text-red-500'
}
function scoreBg(score: number) {
  return score > 2 ? 'bg-green-50 border-green-100' : score >= 2 ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100'
}

export default function RepPerformancePage({ params }: { params: Promise<{ repId: string }> }) {
  const { repId } = use(params)
  const [data, setData] = useState<RepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  // Add event form
  const [eventType, setEventType] = useState('good_call')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const localDate = new Date().toLocaleDateString('en-CA')
    const res = await fetch(`/api/teams/admin/rep-performance?repId=${repId}&date=${localDate}`)
    const d = await res.json()
    if (d.error) setError(d.error)
    else setData(d)
    setLoading(false)
  }, [repId])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const res = await fetch('/api/teams/admin/score-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: repId, event_type: eventType, note: note.trim() || null, date }),
    })
    const d = await res.json()
    if (!res.ok) {
      setMsg({ text: d.error || 'Failed', ok: false })
    } else {
      setMsg({ text: 'Logged!', ok: true })
      setNote('')
      await fetchData()
      setTimeout(() => setMsg(null), 2000)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/teams/admin/score-events?id=${id}`, { method: 'DELETE' })
    await fetchData()
    setDeletingId(null)
  }

  const today = new Date().toLocaleDateString('en-CA')
  const repName = data?.profile?.name ?? repId

  if (loading) return (
    <div className="space-y-6">
      <Link href="/teams/admin/performance" className="text-sm text-blue-600 hover:underline">← Performance</Link>
      <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
    </div>
  )

  if (error || !data) return (
    <div className="space-y-6">
      <Link href="/teams/admin/performance" className="text-sm text-blue-600 hover:underline">← Performance</Link>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center text-red-500 text-sm">
        {error || 'Rep not found.'}
      </div>
    </div>
  )

  const previewPts = POINT_VALUES[eventType] ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/teams/admin/performance" className="text-sm text-blue-600 hover:underline">← Performance</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{repName}</h1>
        </div>
        <div className={`rounded-xl border px-6 py-4 text-center shrink-0 ${scoreBg(data.todayScore)}`}>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Today's Score</p>
          <p className={`text-4xl font-bold mt-1 ${scoreColor(data.todayScore)}`}>
            {Math.round(data.todayScore * 100) / 100}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total Closes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.closes}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Base Score</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.baseScore}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Events Today</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.todayEvents.length}</p>
        </div>
      </div>

      {/* Score chart */}
      <ScoreChart dailyScores={data.dailyScores} />

      {/* Log Event */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Log Event</h2>
        <form onSubmit={handleAddEvent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Event Type</label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <optgroup label="Positive">
                  {MANUAL_EVENTS.filter(e => e.pts > 0).map(e => (
                    <option key={e.type} value={e.type}>{EVENT_LABELS[e.type]} ({fmtPts(e.pts)} pt)</option>
                  ))}
                </optgroup>
                <optgroup label="Penalty">
                  {MANUAL_EVENTS.filter(e => e.pts < 0).map(e => (
                    <option key={e.type} value={e.type}>{EVENT_LABELS[e.type]} ({fmtPts(e.pts)} pt)</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Great handling of objection"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : `Log ${fmtPts(previewPts)} pt`}
            </button>
            <span className={pointsBadge(previewPts)}>{fmtPts(previewPts)} pt</span>
            {msg && (
              <p className={`text-sm font-medium ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>
            )}
          </div>
        </form>
      </div>

      {/* Today's Events */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Today's Events</h2>
        {data.todayEvents.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-6 text-center text-gray-400 text-sm">
            No events logged today.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {data.todayEvents.map(e => (
                <EventRow key={e.id} e={e} onDelete={handleDelete} deletingId={deletingId} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Score History — last 30 days */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Score History (Last 30 Days)</h2>
        <div className="space-y-1.5">
          {data.dailyScores.map(day => {
            const isToday = day.date === today
            const isExpanded = expandedDay === day.date
            const hasEvents = day.events.length > 0
            return (
              <div key={day.date} className={`rounded-xl border shadow-sm overflow-hidden ${isToday ? 'border-blue-200 bg-blue-50/40' : 'bg-white border-gray-100'}`}>
                <div
                  onClick={() => hasEvents && setExpandedDay(isExpanded ? null : day.date)}
                  className={`flex items-center justify-between px-5 py-3 transition-colors ${hasEvents ? 'cursor-pointer hover:bg-black/[0.02]' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-gray-900 text-sm w-28">
                      {format(new Date(day.date + 'T12:00:00'), 'EEE, MMM d')}
                    </span>
                    {isToday && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Today</span>
                    )}
                    {hasEvents ? (
                      <div className="flex flex-wrap gap-1.5">
                        {day.events.map(e => (
                          <span key={e.id} className={`text-xs px-2 py-0.5 rounded-full font-medium border ${e.points > 0 ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                            {EVENT_LABELS[e.event_type] || e.event_type} ({fmtPts(Number(e.points))})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">No events</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {day.eventTotal !== 0 && (
                      <span className={`text-xs font-semibold ${day.eventTotal > 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {fmtPts(day.eventTotal)} pts
                      </span>
                    )}
                    <span className={`text-xl font-bold tabular-nums w-8 text-right ${scoreColor(day.dayScore)}`}>
                      {Math.round(day.dayScore * 100) / 100}
                    </span>
                    {hasEvents && (
                      <svg className={`w-4 h-4 text-gray-300 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>
                {isExpanded && hasEvents && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {day.events.map(e => (
                      <EventRow key={e.id} e={e} onDelete={handleDelete} deletingId={deletingId} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Scoring Rules */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Scoring Rules</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {MANUAL_EVENTS.map(e => (
              <div key={e.type} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-gray-700">{EVENT_LABELS[e.type]}</span>
                <span className={pointsBadge(e.pts)}>{fmtPts(e.pts)} pt</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">Daily score = Base (2) + events. Score resets each day.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function EventRow({ e, onDelete, deletingId }: { e: ScoreEvent; onDelete: (id: string) => void; deletingId: string | null }) {
  const [confirm, setConfirm] = useState(false)
  function handleDelete() {
    if (!confirm) { setConfirm(true); return }
    onDelete(e.id)
  }
  return (
    <div className="flex items-center justify-between px-5 py-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{EVENT_LABELS[e.event_type] || e.event_type}</span>
          {e.auto_generated && (
            <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-medium">auto</span>
          )}
        </div>
        {e.note && <p className="text-xs text-gray-400 mt-0.5">{e.note}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <span className={`text-sm font-bold tabular-nums ${e.points > 0 ? 'text-green-600' : e.points < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {(e.points > 0 ? '+' : '') + e.points}
        </span>
        {confirm ? (
          <div className="flex items-center gap-1.5">
            <button onClick={handleDelete} disabled={deletingId === e.id}
              className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-40">
              {deletingId === e.id ? '...' : 'Delete'}
            </button>
            <button onClick={() => setConfirm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)}
            className="text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none">
            ×
          </button>
        )}
      </div>
    </div>
  )
}
