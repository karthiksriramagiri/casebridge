'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import TeamsShell from '../dashboard/TeamsShell'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'
import { Button } from '@/app/teams/_ui/button'

interface Lead {
  contactId: string
  contactName: string
  contactPhone: string | null
  stage: 'nr' | 'fu' | 'chase'
  pipeline: string
}

interface UrgentTask {
  id: string
  title: string
  description: string | null
  assigned_to: 'all' | 'pablo' | 'ziyad'
}

interface SlotStat {
  called: number
  total: number
  status: 'past' | 'current' | 'upcoming'
}

interface ListenCase {
  id: string
  contactName: string
  qualifiedAt: string | null
  hasNote: boolean
  notes: string
}

interface ListenerData {
  todoMode: 'call_listener'
  cases: ListenCase[]
}

interface TodosData {
  todoMode?: 'call_queue'
  workerName: string
  shift: string | null
  slot: 'morning' | 'afternoon' | 'evening' | null
  slotEndLabel: string
  nextSlotLabel: string | null
  onShift: boolean
  today: string
  calledCount: number
  totalCount: number
  slotStats: Record<string, SlotStat>
  urgentTasks: UrgentTask[]
  leads: {
    nr: Lead[]
    fu: Lead[]
    chase: Lead[]
  }
}

type ApiData = TodosData | ListenerData

const PIPELINE_LABELS: Record<string, string> = {
  lhp:       'LHP',
  eisenberg: 'Eisenberg',
  thl:       'THL',
  mca:       'MCA',
}

const SLOT_LABELS: Record<string, string> = {
  morning:   'Morning · 7AM–12PM PST',
  afternoon: 'Afternoon · 12PM–3PM PST',
  evening:   'Evening · 3PM–9PM PST',
  overnight: 'Overnight · 9PM–7AM PST',
}

function LeadCard({
  lead,
  slot,
  totalCount,
  calledCount,
  onCheck,
}: {
  lead: Lead
  slot: string
  totalCount: number
  calledCount: number
  onCheck: (lead: Lead, checked: boolean) => void
}) {
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  async function handleClick() {
    if (pending) return
    setPending(true)
    const next = !checked
    try {
      if (next) {
        await fetch('/api/teams/todos/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactId: lead.contactId, contactName: lead.contactName, slot, totalCount, calledCount }),
        })
        setChecked(true)
        setTimeout(() => setDismissed(true), 500)
        onCheck(lead, true)
      } else {
        const params = new URLSearchParams({ contactId: lead.contactId, slot })
        await fetch(`/api/teams/todos/check?${params}`, { method: 'DELETE' })
        setChecked(false)
        onCheck(lead, false)
      }
    } catch {
      // revert
    } finally {
      setPending(false)
    }
  }

  if (dismissed) return null

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
 checked ? 'bg-success/10 border-success/30 opacity-60' : 'bg-card border-border hover:border-border'
    }`}>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
 checked ? 'bg-success border-success' : 'border-border hover:border-success'
        } ${pending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      >
        {checked && (
          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {lead.contactName}
        </p>
        {lead.contactPhone && (
          <a
            href={`tel:${lead.contactPhone}`}
            className="text-xs text-primary hover:underline mt-0.5 block"
            onClick={e => e.stopPropagation()}
          >
            {lead.contactPhone}
          </a>
        )}
        <span className="text-xs text-muted-foreground mt-0.5 block">
          {PIPELINE_LABELS[lead.pipeline] || lead.pipeline}
        </span>
      </div>
    </div>
  )
}

function UrgentTaskCard({ task }: { task: UrgentTask }) {
  const [done, setDone] = useState(false)

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
 done ? 'bg-success/10 border-success/30 opacity-60' : 'bg-card border-warning/30'
    }`}>
      <button
        onClick={() => setDone(d => !d)}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
 done ? 'bg-success border-success' : 'border-warning hover:border-success'
        }`}
      >
        {done && (
          <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
        )}
      </div>
    </div>
  )
}

const SLOT_ORDER = ['morning', 'afternoon', 'evening', 'overnight'] as const
const SLOT_SHORT: Record<string, string> = {
  morning:   'Morning',
  afternoon: 'Afternoon',
  evening:   'Evening',
  overnight: 'Overnight',
}
const SLOT_TIMES: Record<string, string> = {
  morning:   '7AM–12PM',
  afternoon: '12PM–3PM',
  evening:   '3PM–9PM',
  overnight: '9PM–7AM',
}

function ShiftPerformance({ slotStats }: { slotStats: Record<string, SlotStat> }) {
  const slots = SLOT_ORDER.filter(s => slotStats[s])
  if (slots.length === 0) return null

  return (
    <div className="bg-card rounded-xl border border-border p-4 mb-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Today's Performance</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${slots.length}, 1fr)` }}>
        {slots.map(s => {
          const stat = slotStats[s]
          const pct  = stat.total > 0 ? Math.round((stat.called / stat.total) * 100) : 0
          const missed = stat.total - stat.called

          const isCurrent  = stat.status === 'current'
          const isPast     = stat.status === 'past'
          const isUpcoming = stat.status === 'upcoming'

          return (
            <div
              key={s}
              className={`rounded-lg px-4 py-3 border ${
 isCurrent  ? 'border-primary/30 bg-accent' :
                isPast     ? 'border-border bg-muted/40' :
                             'border-dashed border-border bg-card'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className={`text-xs font-semibold ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {SLOT_SHORT[s]}
                    {isCurrent && <span className="ml-1.5 text-[10px] bg-accent text-primary px-1.5 py-0.5 rounded-full">Now</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{SLOT_TIMES[s]} PST</p>
                </div>
                {!isUpcoming && (
                  <span className={`text-lg font-bold ${isPast && pct === 100 ? 'text-success' : isCurrent ? 'text-primary' : 'text-foreground/90'}`}>
                    {pct}%
                  </span>
                )}
              </div>

              {isUpcoming ? (
                <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
              ) : (
                <>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2 mb-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isPast && pct === 100 ? 'bg-success' : isCurrent ? 'bg-primary' : 'bg-success'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/90">{stat.called}</span> called
                    {missed > 0 && isPast && (
                      <span className="text-destructive ml-1">· {missed} missed</span>
                    )}
                    {isCurrent && (
                      <span className="text-muted-foreground ml-1">of {stat.total}</span>
                    )}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LeadColumn({
  title,
  leads,
  slot,
  color,
  totalCount,
  calledCount,
  onCheck,
}: {
  title: string
  leads: Lead[]
  slot: string
  color: string
  totalCount: number
  calledCount: number
  onCheck: (lead: Lead, checked: boolean) => void
}) {
  return (
    <div className="flex flex-col min-w-0">
      <div className={`flex items-center justify-between mb-2 px-1`}>
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{title}</h2>
        <span className="text-xs text-muted-foreground font-medium">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {leads.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6 bg-card rounded-lg border border-dashed border-border">
            All clear
          </div>
        ) : (
          leads.map(lead => (
            <LeadCard key={lead.contactId} lead={lead} slot={slot} totalCount={totalCount} calledCount={calledCount} onCheck={onCheck} />
          ))
        )}
      </div>
    </div>
  )
}

function CallListenerView({ cases }: { cases: ListenCase[] }) {
  const [noteState, setNoteState] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())

  const done = cases.filter(c => saved.has(c.id) || c.hasNote)
  const pending = cases.filter(c => !saved.has(c.id) && !c.hasNote)

  async function handleSave(caseId: string) {
    const notes = (noteState[caseId] ?? '').trim()
    if (!notes) return
    setSaving(caseId)
    try {
      await fetch('/api/teams/todos/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, notes }),
      })
      setSaved(prev => new Set([...prev, caseId]))
    } catch {
      // ignore
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="bg-card rounded-xl border border-border px-5 py-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-foreground/90">
            {done.length} of {cases.length} reviewed
          </span>
          <span className="text-xs text-muted-foreground">{pending.length} remaining</span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className="bg-success h-1.5 rounded-full transition-all duration-500"
            style={{ width: cases.length > 0 ? `${Math.round((done.length / cases.length) * 100)}%` : '0%' }}
          />
        </div>
      </div>

      {/* Pending cases */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">To Review ({pending.length})</h2>
          <div className="space-y-3">
            {pending.map(c => (
              <div key={c.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{c.contactName}</p>
                    {c.qualifiedAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(c.qualifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/15 text-warning shrink-0">Pending</span>
                </div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Your notes
                  <span className="text-muted-foreground font-normal ml-1">— what happened in this call? What was the flow?</span>
                </label>
                <textarea
                  rows={3}
                  value={noteState[c.id] ?? c.notes}
                  onChange={e => setNoteState(prev => ({ ...prev, [c.id]: e.target.value }))}
                  placeholder="e.g. Client was hesitant about timeline. I explained the process clearly and addressed their concern about upfront costs. Closed by emphasizing the contingency-based fee..."
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSave(c.id)}
                    disabled={saving === c.id || !(noteState[c.id] ?? '').trim()}
                    className="text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {saving === c.id ? 'Saving…' : 'Submit Notes'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done cases */}
      {done.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Reviewed ({done.length})</h2>
          <div className="space-y-2">
            {done.map(c => (
              <div key={c.id} className="bg-success/10 rounded-xl border border-success/30 px-4 py-3 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground/90 line-through">{c.contactName}</p>
                  {c.qualifiedAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.qualifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cases.length === 0 && (
        <div className="bg-card rounded-xl border border-border px-6 py-14 text-center">
          <p className="text-3xl mb-3">📞</p>
          <p className="text-foreground/90 font-medium">No signed cases to review yet</p>
          <p className="text-sm text-muted-foreground mt-1">Check back once cases have been signed</p>
        </div>
      )}
    </div>
  )
}

export default function TodosPage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      if ((prof.rep_phase ?? 1) < 3) { router.push('/teams/home'); return }
      if (prof.team_type === 'creative') { window.location.href = 'https://app.notion.com/p/ogeo/Creative-Workspace-34f895255ae980c3a4b6fcb5128f2519?source=copy_link'; return }
      setTimeclockEnabled(!!prof.timeclock_enabled)
      setTeamType(prof.team_type ?? 'intake')
      setReady(true)
    }
    load()
  }, [])

  const fetchTodos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/teams/todos', { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to load todos')
        return
      }
      setData(await res.json())
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + auto-refresh every 5 min + refresh when slot changes
  useEffect(() => {
    if (!ready) return
    fetchTodos()

    // Check every 60s if the slot has changed — if so, refresh immediately (call_queue only)
    const slotCheckInterval = setInterval(() => {
      setData(prev => {
        if (prev === null || (prev as any).todoMode === 'call_listener') return prev
        const queueData = prev as TodosData
        const now = new Date()
        const estHour = parseInt(
          now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
        ) % 24
        const currentSlot =
          estHour >= 0  && estHour < 10 ? 'overnight' :
          estHour >= 10 && estHour < 15 ? 'morning' :
          estHour >= 15 && estHour < 18 ? 'afternoon' :
          estHour >= 18 && estHour < 24 ? 'evening' : null

        if (queueData.slot !== currentSlot) fetchTodos()
        return prev
      })
    }, 60 * 1000)

    const refreshInterval = setInterval(fetchTodos, 5 * 60 * 1000)
    return () => {
      clearInterval(slotCheckInterval)
      clearInterval(refreshInterval)
    }
  }, [ready, fetchTodos])

  function handleCheck(lead: Lead, wasChecked: boolean) {
    if (!wasChecked) return // unchecked — lead stays visible
    setData(prev => {
      if (!prev || (prev as any).todoMode === 'call_listener') return prev
      const queueData = prev as TodosData
      const stage = lead.stage as keyof typeof queueData.leads
      return {
        ...queueData,
        calledCount: queueData.calledCount + 1,
        leads: {
          ...queueData.leads,
          [stage]: queueData.leads[stage].filter(l => l.contactId !== lead.contactId),
        },
      }
    })
  }

  if (!ready) return null

  const isListenerMode = data && (data as any).todoMode === 'call_listener'
  const queueData = isListenerMode ? null : (data as TodosData | null)
  const listenerData = isListenerMode ? (data as ListenerData) : null

  const totalRemaining = queueData
    ? (queueData.leads.nr?.length ?? 0) + (queueData.leads.fu?.length ?? 0) + (queueData.leads.chase?.length ?? 0)
    : 0

  return (
      <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <PageHeader
        title={isListenerMode ? 'Call Reviews' : 'Call Queue'}
        description={
          isListenerMode
            ? 'Listen back to each signed case and write up how the conversation went.'
            : queueData
              ? `${queueData.slot ? SLOT_LABELS[queueData.slot] : 'Outside call hours'} · ${queueData.today}`
              : undefined
        }
        actions={
          <Button variant="outline" size="sm" onClick={fetchTodos}>
            Refresh
          </Button>
        }
      />
      <PageBody>

        {/* Call listener mode */}
        {!loading && listenerData && (
          <>
            <div className="bg-primary rounded-xl p-4 mb-5">
              <p className="text-xs font-semibold text-primary-foreground/75 uppercase tracking-wider mb-2">Training Mode</p>
              <p className="text-sm text-primary-foreground">
                Listen to each signed case call recording and write your notes on what happened and how the conversation flowed.
              </p>
            </div>
            <CallListenerView cases={listenerData.cases} />
          </>
        )}

        {/* Call queue mode */}
        {!isListenerMode && (
          <>
            {/* Top Tasks Banner */}
            <div className="bg-primary rounded-xl p-4 mb-5">
              <p className="text-xs font-semibold text-primary-foreground/75 uppercase tracking-wider mb-3">Top Priorities</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex items-start gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
                  <span className="text-base mt-0.5">⚡</span>
                  <p className="text-xs text-primary-foreground leading-snug">New leads must be acknowledged and called within <span className="font-semibold text-warning/70">90 seconds</span> of hitting Slack.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
                  <span className="text-base mt-0.5">🔁</span>
                  <p className="text-xs text-primary-foreground leading-snug">Check back on <span className="font-semibold text-primary-foreground/75">Follow Up Required</span> and <span className="font-semibold text-destructive/70">Chase</span> leads regularly throughout your shift.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
                  <span className="text-base mt-0.5">📋</span>
                  <p className="text-xs text-primary-foreground leading-snug">Call <span className="font-semibold text-warning/70">all No Response leads</span> within your shift time before it ends.</p>
                </div>
              </div>
            </div>


            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            )}

            {!loading && error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-6 py-4 text-destructive text-sm">
                {error}
              </div>
            )}

            {!loading && queueData && !queueData.onShift && (
              <div className="bg-card rounded-xl border border-border px-6 py-14 text-center">
                <p className="text-3xl mb-3">🌙</p>
                <p className="text-foreground/90 font-medium">You're off shift</p>
                {queueData.nextSlotLabel && (
                  <p className="text-sm text-muted-foreground mt-1">Next slot: {queueData.nextSlotLabel}</p>
                )}
              </div>
            )}

            {!loading && queueData && queueData.onShift && (
              <>
                {/* Urgent Tasks */}
                {queueData.urgentTasks && queueData.urgentTasks.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className="text-base">⚠️</span>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-warning">Urgent Tasks</h2>
                      <span className="text-xs text-muted-foreground font-medium">{queueData.urgentTasks.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {queueData.urgentTasks.map(task => (
                        <UrgentTaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Shift performance */}
                <ShiftPerformance slotStats={queueData.slotStats} />

                {/* Between-slot message */}
                {!queueData.slot && (
                  <div className="bg-card rounded-xl border border-border px-6 py-10 text-center mb-6">
                    <p className="text-2xl mb-2">⏳</p>
                    <p className="text-foreground/90 font-medium">Between slots</p>
                    {queueData.nextSlotLabel && (
                      <p className="text-sm text-muted-foreground mt-1">Next: {queueData.nextSlotLabel}</p>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                {queueData.slot && (
                  <div className="bg-card rounded-xl border border-border px-5 py-3.5 mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground/90">
                        {queueData.calledCount} of {queueData.totalCount} called
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {totalRemaining} remaining{queueData.slotEndLabel ? ` · ends ${queueData.slotEndLabel}` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-success h-1.5 rounded-full transition-all duration-500"
                        style={{ width: queueData.totalCount > 0 ? `${Math.min(100, Math.round((queueData.calledCount / queueData.totalCount) * 100))}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}

                {/* All-clear banner */}
                {queueData.slot && totalRemaining === 0 && (
                  <div className="bg-success/10 border border-success/30 rounded-xl px-6 py-8 text-center mb-5">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-success font-medium">All leads called for this slot!</p>
                  </div>
                )}

                {/* 3-column lead grid */}
                {queueData.slot && totalRemaining > 0 && (
                  <div className="grid grid-cols-3 gap-4">
                    <LeadColumn
                      title="No Response"
                      leads={queueData.leads.nr || []}
                      slot={queueData.slot}
                      color="text-muted-foreground"
                      totalCount={queueData.totalCount}
                      calledCount={queueData.calledCount}
                      onCheck={handleCheck}
                    />
                    <LeadColumn
                      title="Chase"
                      leads={queueData.leads.chase || []}
                      slot={queueData.slot}
                      color="text-destructive"
                      totalCount={queueData.totalCount}
                      calledCount={queueData.calledCount}
                      onCheck={handleCheck}
                    />
                    <LeadColumn
                      title="Follow Up"
                      leads={queueData.leads.fu || []}
                      slot={queueData.slot}
                      color="text-primary"
                      totalCount={queueData.totalCount}
                      calledCount={queueData.calledCount}
                      onCheck={handleCheck}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!loading && error && isListenerMode && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-6 py-4 text-destructive text-sm">
            {error}
          </div>
        )}
        </PageBody>
      </TeamsShell>
  )
}
