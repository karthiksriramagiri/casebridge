'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format, subDays, startOfWeek } from 'date-fns'
import TeamsShell from '../dashboard/TeamsShell'
import ScoreChart from '../ScoreChart'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

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
  lead_closed:          'Lead Closed',
  perfect_day:          'Perfect Day Bonus',
  good_call:            'Good Call Quality',
  missed_checkmark:     'Lead Not Checkmarked in Time',
  missed_followup_call: 'Missed Follow-Up / Chase Call',
  late_clockin:         'Late Clock-In (>10 min)',
  minor_violation:      'Minor Rule Violation',
  bad_call:             'Bad Call Quality',
}

const EVENT_ICONS: Record<string, string> = {
  lead_closed:          '🤝',
  perfect_day:          '✨',
  good_call:            '📞',
  missed_checkmark:     '❌',
  missed_followup_call: '📋',
  late_clockin:         '⏰',
  minor_violation:      '⚠️',
  bad_call:             '🚫',
}

type Range = 'week' | '7d' | '30d' | 'all'

function scoreColor(score: number) {
  if (score > 2) return 'text-success'
  if (score >= 2) return 'text-foreground'
  return 'text-destructive'
}

function scoreBg(score: number) {
  if (score > 2) return 'bg-success/10 border-success/30'
  if (score >= 2) return 'bg-card border-border'
  return 'bg-destructive/10 border-destructive/25'
}

function fmtPts(pts: number) {
  return (pts > 0 ? '+' : '') + pts
}

export default function PerformancePage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')
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
        .select('role, nda_signed, timeclock_enabled, team_type, rep_phase')
        .eq('id', user.id)
        .single()

      if (!prof || !prof.nda_signed) { router.push('/teams/onboarding'); return }
      if (prof.role === 'admin') { router.push('/teams/admin'); return }
      if (prof.team_type === 'creative') { router.push('/teams/dashboard'); return }
      setTimeclockEnabled(!!prof.timeclock_enabled)
      setTeamType(prof.team_type ?? 'intake')

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
      <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <PageHeader
        title="My Performance"
        description="You start each day on 2 points. Events move it up or down; 5 is the most you can score."
      />
      <PageBody>


        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Today's score */}
            <div className={`rounded-2xl border px-6 py-6 mb-6 ${scoreBg(todayScore)}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Today's Score · {format(new Date(), 'EEE, MMM d')}
                  </p>
                  <div className="flex items-end gap-3">
                    <p className={`text-6xl font-bold ${scoreColor(todayScore)}`}>
                      {Math.round(todayScore * 100) / 100}
                    </p>
                    <div className="mb-1">
                      <p className="text-sm text-muted-foreground">= 2 base</p>
                      {todayEventTotal !== 0 && (
                        <p className={`text-sm font-semibold ${todayEventTotal > 0 ? 'text-success' : 'text-destructive'}`}>
                          {fmtPts(todayEventTotal)} from events
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {rank !== null && (
                    <div className="bg-card border border-border rounded-xl px-4 py-3 ">
                      <p className="text-xs text-muted-foreground font-medium">This week's rank</p>
                      <p className="text-2xl font-bold text-foreground">#{rank}</p>
                      <p className="text-xs text-muted-foreground">of {totalReps}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Today's events */}
              {todayEvents.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border space-y-1.5">
                  {todayEvents.map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span>{EVENT_ICONS[e.event_type] || '•'}</span>
                      <span className="text-foreground/90 flex-1">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                      {e.note && <span className="text-muted-foreground text-xs">{e.note}</span>}
                      <span className={`font-semibold ${Number(e.points) > 0 ? 'text-success' : 'text-destructive'}`}>
                        {fmtPts(Number(e.points))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Score chart */}
            {dailyScores.length > 0 && (
              <div className="mb-6">
                <ScoreChart dailyScores={dailyScores} />
              </div>
            )}

            {/* Point rules */}
            <div className="bg-card rounded-xl border border-border px-5 py-4 mb-8">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">How Points Work · Start at 2 each day</p>
              <div className="mb-3">
                <p className="text-xs font-semibold text-success uppercase tracking-wider mb-1.5">You gain</p>
                <div className="space-y-1 text-sm">
                  {[
                    ['🤝 Close a lead', '+2'],
                    ['✨ No negative points today', '+1'],
                    ['📞 Good call quality', '+1'],
                  ].map(([label, pts]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold text-success">{pts} pt</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1.5">You lose</p>
                <div className="space-y-1 text-sm">
                  {[
                    ['❌ Lead not checkmarked in 60s (7am–9pm PST)', '−1'],
                    ['📋 Missed Follow-Up / Chase call', '−2'],
                    ['⏰ Late clock-in (>10 min)', '−1'],
                    ['⚠️ Minor rule violation', '−0.25'],
                    ['🚫 Bad call quality', '−1'],
                  ].map(([label, pts]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold text-destructive shrink-0">{pts} pt</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Previous days history */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-foreground text-sm">Previous Days</h2>
                <div className="flex gap-1 bg-muted rounded-lg p-1">
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
 range === key ? 'bg-card text-foreground ' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredDays.length === 0 ? (
                <div className="bg-card rounded-xl border border-border px-5 py-10 text-center text-muted-foreground text-sm">
                  No history for this period.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDays.map(day => (
                    <div key={day.date} className="bg-card rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                        <p className="text-sm font-semibold text-foreground">
                          {format(new Date(day.date + 'T12:00:00'), 'EEEE, MMMM d')}
                        </p>
                        <div className="flex items-center gap-2">
                          {day.eventTotal !== 0 && (
                            <span className={`text-xs font-medium ${day.eventTotal > 0 ? 'text-success' : 'text-destructive'}`}>
                              {fmtPts(day.eventTotal)}
                            </span>
                          )}
                          <span className={`text-lg font-bold ${scoreColor(day.dayScore)}`}>
                            {Math.round(day.dayScore * 100) / 100}
                          </span>
                        </div>
                      </div>
                      {day.events.length > 0 ? (
                        <div className="divide-y divide-border">
                          {day.events.map(e => (
                            <div key={e.id} className="flex items-center gap-2 px-5 py-2.5 text-sm">
                              <span className="shrink-0">{EVENT_ICONS[e.event_type] || '•'}</span>
                              <span className="text-foreground/90 flex-1">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                              {e.note && <span className="text-muted-foreground text-xs truncate max-w-32">{e.note}</span>}
                              <span className={`font-semibold shrink-0 ${Number(e.points) > 0 ? 'text-success' : 'text-destructive'}`}>
                                {fmtPts(Number(e.points))}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-5 py-2.5 text-sm text-muted-foreground">No events — base score 2</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        </PageBody>
      </TeamsShell>
  )
}
