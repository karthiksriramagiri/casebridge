'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { PageBody, PageHeader } from '@/app/teams/_components/shared'

interface Rep { id: string; name: string }
interface ScoreEvent {
  id: string
  user_id: string
  event_type: string
  points: number
  note: string | null
  date: string
  auto_generated: boolean
  created_at: string
  profiles: { name: string } | null
}
interface ScoreboardEntry {
  id: string
  name: string
  todayScore: number
  todayEventTotal: number
  closes: number
}
interface WorkerResponseStats {
  workerName: string
  slack: { count: number; medFmt: string; under90: number; pctUnder90: number }
}
interface CallVerificationWorker {
  workerName: string
  checked: number
  ghlVerified: number
  unverified: number
  unverifiedContacts: string[]
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

const MANUAL_EVENTS = [
  'lead_closed',
  'perfect_day',
  'good_call',
  'missed_checkmark',
  'no_call_after_checkmark',
  'missed_followup_call',
  'late_clockin',
  'bad_call',
  'minor_violation',
]

const POINT_LABELS: Record<string, string> = {
  lead_closed:              '+2 pt',
  perfect_day:              '+1 pt',
  good_call:                '+1 pt',
  missed_checkmark:         '−1 pt',
  no_call_after_checkmark:  '−3 pt',
  missed_followup_call:     '−2 pt',
  late_clockin:             '−1 pt',
  minor_violation:          '−0.25 pt',
  bad_call:                 '−1 pt',
}

function pointsColor(pts: number) {
  return pts > 0 ? 'text-success' : pts < 0 ? 'text-destructive' : 'text-muted-foreground'
}

function fmtPts(pts: number) {
  return (pts > 0 ? '+' : '') + pts
}

export default function AdminPerformancePage() {
  const [reps, setReps] = useState<Rep[]>([])
  const [events, setEvents] = useState<ScoreEvent[]>([])
  const [scoreboard, setScoreboard] = useState<ScoreboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Manual event form
  const [userId, setUserId] = useState('')
  const [eventType, setEventType] = useState('good_call')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Custom penalty form
  const [customUserId, setCustomUserId] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [customPoints, setCustomPoints] = useState('')
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10))
  const [customSaving, setCustomSaving] = useState(false)
  const [customMsg, setCustomMsg] = useState('')

  // Response times
  const [responseTimes, setResponseTimes] = useState<WorkerResponseStats[]>([])
  const [rtDays, setRtDays] = useState(7)
  const [rtLoading, setRtLoading] = useState(true)

  // Call verification
  const [cvDate, setCvDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
  const [cvWorkers, setCvWorkers] = useState<CallVerificationWorker[]>([])
  const [cvLoading, setCvLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    const localDate = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
    const res = await fetch(`/api/teams/admin/score-events?date=${localDate}`)
    if (res.ok) {
      const d = await res.json()
      setEvents(d.events || [])
      setScoreboard(d.scoreboard || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/teams/admin/reps').then(r => r.json()).then(d => {
      setReps((d.reps || []).filter((r: any) => !r.teamType || r.teamType === 'intake').map((r: any) => ({ id: r.id, name: r.name })))
    })
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    setRtLoading(true)
    fetch(`/api/teams/admin/response-times?days=${rtDays}`)
      .then(r => r.json())
      .then(d => { setResponseTimes(d.workers || []); setRtLoading(false) })
  }, [rtDays])

  useEffect(() => {
    setCvLoading(true)
    fetch(`/api/teams/admin/call-verification?date=${cvDate}`)
      .then(r => r.json())
      .then(d => { setCvWorkers(d.workers || []); setCvLoading(false) })
  }, [cvDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) { setMsg('Select a rep.'); return }
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/teams/admin/score-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, event_type: eventType, note: note.trim() || null, date }),
    })
    const d = await res.json()
    if (!res.ok) { setMsg(`Error: ${d.error}`); setSaving(false); return }
    setMsg('Logged!')
    setNote('')
    await fetchEvents()
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this score event?')) return
    await fetch(`/api/teams/admin/score-events?id=${id}`, { method: 'DELETE' })
    await fetchEvents()
  }

  async function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customUserId) { setCustomMsg('Select a rep.'); return }
    if (!customLabel.trim()) { setCustomMsg('Enter a reason.'); return }
    const pts = parseFloat(customPoints)
    if (isNaN(pts) || pts === 0) { setCustomMsg('Enter a non-zero point value.'); return }
    setCustomSaving(true)
    setCustomMsg('')
    const res = await fetch('/api/teams/admin/score-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: customUserId, event_type: 'custom', note: customLabel.trim(), points: pts, date: customDate }),
    })
    const d = await res.json()
    if (!res.ok) { setCustomMsg(`Error: ${d.error}`); setCustomSaving(false); return }
    setCustomMsg('Logged!')
    setCustomLabel('')
    setCustomPoints('')
    await fetchEvents()
    setCustomSaving(false)
    setTimeout(() => setCustomMsg(''), 3000)
  }

  const today = new Date().toLocaleDateString('en-CA')

  const rankedBoard = scoreboard.map((rep, idx) => ({ ...rep, rank: idx + 1 }))


  // Events grouped by rep for history section
  const eventsByRep: Record<string, ScoreEvent[]> = {}
  for (const e of events) {
    const name = e.profiles?.name || e.user_id
    if (!eventsByRep[name]) eventsByRep[name] = []
    eventsByRep[name].push(e)
  }

  function pctColor(pct: number) {
    if (pct >= 80) return 'text-success'
    if (pct >= 50) return 'text-warning'
    return 'text-destructive'
  }

  return (
    <>
      <PageHeader title="Performance" description="Scoreboard and event log for all reps." />
      <PageBody className="gap-8">

      {/* ── Scoreboard ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Today's Scoreboard</h2>
          <span className="text-xs text-muted-foreground">Base score: 2 · {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
        {rankedBoard.length === 0 ? (
          <div className="bg-card rounded-xl border border-border px-6 py-10 text-center text-muted-foreground text-sm">
            No reps yet.
          </div>
        ) : (
          <div className="space-y-2">
            {rankedBoard.map((rep) => {
              const maxScore = rankedBoard[0].todayScore || 2
              return (
                <Link key={rep.id} href={`/teams/admin/performance/${rep.id}`}>
                  <div className="bg-card rounded-xl border border-border px-5 py-4 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
 rep.rank === 1 ? 'bg-warning/15 text-warning' :
                        rep.rank === 2 ? 'bg-muted text-muted-foreground' :
                        rep.rank === 3 ? 'bg-warning/15 text-warning' :
                        'bg-muted/40 text-muted-foreground'
                      }`}>
                        {rep.rank === 1 ? '🥇' : rep.rank === 2 ? '🥈' : rep.rank === 3 ? '🥉' : `#${rep.rank}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm">{rep.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {rep.todayEventTotal > 0 ? `+${rep.todayEventTotal} pts from events` : rep.todayEventTotal < 0 ? `${rep.todayEventTotal} pts from events` : 'No events today'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-2xl font-bold ${rep.todayScore > 2 ? 'text-success' : rep.todayScore >= 2 ? 'text-foreground' : 'text-destructive'}`}>
                          {Math.round(rep.todayScore * 100) / 100}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 ml-12">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${rep.todayScore > 2 ? 'bg-success' : rep.todayScore >= 2 ? 'bg-primary' : 'bg-destructive'}`}
                          style={{ width: `${Math.max(4, Math.min(100, (rep.todayScore / Math.max(maxScore, 4)) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Log Event ── */}
      <div className="bg-card rounded-xl border border-border px-6 py-5">
        <h2 className="text-sm font-semibold text-foreground/90 mb-4">Log Event</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Rep</label>
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select rep...</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Event</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {MANUAL_EVENTS.map(t => (
                <option key={t} value={t}>{EVENT_LABELS[t]} ({POINT_LABELS[t]})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Didn't reply in thread"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="col-span-2 sm:col-span-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Log Event'}
            </button>
            {msg && <p className={`text-sm font-medium ${msg.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>{msg}</p>}
          </div>
        </form>
      </div>

      {/* ── Custom Penalty / Bonus ── */}
      <div className="bg-card rounded-xl border border-border px-6 py-5">
        <h2 className="text-sm font-semibold text-foreground/90 mb-1">Custom Event</h2>
        <p className="text-xs text-muted-foreground mb-4">Log any penalty or bonus with a custom reason and point value.</p>
        <form onSubmit={handleCustomSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Rep</label>
            <select
              value={customUserId}
              onChange={e => setCustomUserId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select rep...</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
            <input
              type="text"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder="e.g. Missed team meeting"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Points (use − for penalty)</label>
            <input
              type="number"
              step="0.25"
              value={customPoints}
              onChange={e => setCustomPoints(e.target.value)}
              placeholder="e.g. −1 or +2"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="col-span-2 sm:col-span-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={customSaving}
              className="bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              {customSaving ? 'Saving...' : 'Log Custom Event'}
            </button>
            {customMsg && <p className={`text-sm font-medium ${customMsg.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>{customMsg}</p>}
          </div>
        </form>
      </div>

      {/* ── Response Times ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Response Times</h2>
            <p className="text-xs text-muted-foreground mt-0.5">How fast workers react to new leads in Slack</p>
          </div>
          <select
            value={rtDays}
            onChange={e => setRtDays(Number(e.target.value))}
            className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
        {rtLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
        ) : responseTimes.length === 0 ? (
          <div className="bg-card rounded-xl border border-border px-6 py-8 text-center text-muted-foreground text-sm">
            No response data yet.
          </div>
        ) : (
          <div className="space-y-3">
            {responseTimes.map(w => (
              <div key={w.workerName} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-2.5 bg-muted/40 border-b border-border">
                  <span className="font-semibold text-foreground text-sm">{w.workerName}</span>
                </div>
                <div className="px-5 py-3">
                  {w.slack.count === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    <div className="flex gap-8">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground">Median</span>
                          <span className="font-semibold text-foreground">{w.slack.medFmt}</span>
                        </div>
                        <div className="flex justify-between text-sm gap-4">
                          <span className="text-muted-foreground">Under 90s</span>
                          <span className={`font-bold ${pctColor(w.slack.pctUnder90)}`}>
                            {w.slack.under90}/{w.slack.count} ({w.slack.pctUnder90}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Call Verification ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Call Verification</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Todos checked off vs. actual calls logged in GHL</p>
          </div>
          <input
            type="date"
            value={cvDate}
            onChange={e => setCvDate(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {cvLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Loading… (checking GHL)</div>
        ) : cvWorkers.length === 0 ? (
          <div className="bg-card rounded-xl border border-border px-6 py-8 text-center text-muted-foreground text-sm">
            No call logs for this date.
          </div>
        ) : (
          <div className="space-y-3">
            {cvWorkers.map(w => {
              const pct = w.checked > 0 ? Math.round((w.ghlVerified / w.checked) * 100) : 0
              return (
                <div key={w.workerName} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <span className="font-semibold text-foreground text-sm">{w.workerName}</span>
                    <span className={`text-sm font-bold ${pct === 100 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-destructive'}`}>
                      {pct}% match
                    </span>
                  </div>
                  <div className="px-5 py-3 flex gap-8 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Checked on Teams</span>
                      <span className="font-bold text-foreground text-lg">{w.checked}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Verified in GHL</span>
                      <span className="font-bold text-success text-lg">{w.ghlVerified}</span>
                    </div>
                    {w.unverified > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Not in GHL</span>
                        <span className="font-bold text-destructive text-lg">{w.unverified}</span>
                      </div>
                    )}
                  </div>
                  {w.unverifiedContacts.length > 0 && (
                    <div className="px-5 pb-3">
                      <p className="text-xs text-muted-foreground mb-1">Unverified contacts:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {w.unverifiedContacts.map(name => (
                          <span key={name} className="text-xs bg-destructive/10 text-destructive border border-destructive/25 px-2 py-0.5 rounded-full">{name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Event History ── */}
      <div>
        <h2 className="text-base font-bold text-foreground mb-3">Event History</h2>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : Object.keys(eventsByRep).length === 0 ? (
          <div className="bg-card rounded-xl border border-border px-6 py-12 text-center text-muted-foreground text-sm">
            No events logged yet.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(eventsByRep).map(([repName, repEvents]) => {
              const total = repEvents.reduce((s, e) => s + Number(e.points), 0)
              return (
                <div key={repName} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40">
                    <span className="font-semibold text-foreground text-sm">{repName}</span>
                    <span className={`text-sm font-bold ${pointsColor(total)}`}>
                      {fmtPts(Math.round(total * 100) / 100)} pts total
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {repEvents.map(e => (
                      <div key={e.id} className="flex items-center justify-between px-5 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{e.event_type === 'custom' ? (e.note || 'Custom Event') : (EVENT_LABELS[e.event_type] || e.event_type)}</span>
                            {e.auto_generated && (
                              <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">auto</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(e.date + 'T12:00:00'), 'EEE, MMM d')}
                            {e.event_type !== 'custom' && e.note && ` · ${e.note}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-sm font-bold ${pointsColor(Number(e.points))}`}>
                            {fmtPts(Number(e.points))}
                          </span>
                          <button onClick={() => handleDelete(e.id)} className="text-destructive/70 hover:text-destructive text-xs">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      </PageBody>
    </>
  )
}
