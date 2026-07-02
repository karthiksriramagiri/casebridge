'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'

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
      checked ? 'bg-green-50 border-green-200 opacity-60' : 'bg-white border-gray-200 hover:border-gray-300'
    }`}>
      <button
        onClick={handleClick}
        disabled={pending}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          checked ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'
        } ${pending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {lead.contactName}
        </p>
        {lead.contactPhone && (
          <a
            href={`tel:${lead.contactPhone}`}
            className="text-xs text-blue-600 hover:underline mt-0.5 block"
            onClick={e => e.stopPropagation()}
          >
            {lead.contactPhone}
          </a>
        )}
        <span className="text-xs text-gray-400 mt-0.5 block">
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
      done ? 'bg-green-50 border-green-200 opacity-60' : 'bg-white border-amber-200'
    }`}>
      <button
        onClick={() => setDone(d => !d)}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
          done ? 'bg-green-500 border-green-500' : 'border-amber-400 hover:border-green-400'
        }`}
      >
        {done && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Today's Performance</p>
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
                isCurrent  ? 'border-blue-200 bg-blue-50' :
                isPast     ? 'border-gray-200 bg-gray-50' :
                             'border-dashed border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className={`text-xs font-semibold ${isCurrent ? 'text-blue-600' : 'text-gray-500'}`}>
                    {SLOT_SHORT[s]}
                    {isCurrent && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">Now</span>}
                  </p>
                  <p className="text-[11px] text-gray-400">{SLOT_TIMES[s]} PST</p>
                </div>
                {!isUpcoming && (
                  <span className={`text-lg font-bold ${isPast && pct === 100 ? 'text-green-600' : isCurrent ? 'text-blue-700' : 'text-gray-700'}`}>
                    {pct}%
                  </span>
                )}
              </div>

              {isUpcoming ? (
                <p className="text-xs text-gray-400 mt-1">Upcoming</p>
              ) : (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 mb-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isPast && pct === 100 ? 'bg-green-500' : isCurrent ? 'bg-blue-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{stat.called}</span> called
                    {missed > 0 && isPast && (
                      <span className="text-red-500 ml-1">· {missed} missed</span>
                    )}
                    {isCurrent && (
                      <span className="text-gray-400 ml-1">of {stat.total}</span>
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
        <span className="text-xs text-gray-400 font-medium">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {leads.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-6 bg-white rounded-lg border border-dashed border-gray-200">
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-gray-700">
            {done.length} of {cases.length} reviewed
          </span>
          <span className="text-xs text-gray-400">{pending.length} remaining</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: cases.length > 0 ? `${Math.round((done.length / cases.length) * 100)}%` : '0%' }}
          />
        </div>
      </div>

      {/* Pending cases */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 px-1">To Review ({pending.length})</h2>
          <div className="space-y-3">
            {pending.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{c.contactName}</p>
                    {c.qualifiedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.qualifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 shrink-0">Pending</span>
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Your notes
                  <span className="text-gray-400 font-normal ml-1">— what happened in this call? What was the flow?</span>
                </label>
                <textarea
                  rows={3}
                  value={noteState[c.id] ?? c.notes}
                  onChange={e => setNoteState(prev => ({ ...prev, [c.id]: e.target.value }))}
                  placeholder="e.g. Client was hesitant about timeline. I explained the process clearly and addressed their concern about upfront costs. Closed by emphasizing the contingency-based fee..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSave(c.id)}
                    disabled={saving === c.id || !(noteState[c.id] ?? '').trim()}
                    className="text-sm bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-40 text-white font-medium px-4 py-2 rounded-lg transition-colors"
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 px-1">Reviewed ({done.length})</h2>
          <div className="space-y-2">
            {done.map(c => (
              <div key={c.id} className="bg-green-50 rounded-xl border border-green-200 px-4 py-3 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 line-through">{c.contactName}</p>
                  {c.qualifiedAt && (
                    <p className="text-xs text-gray-400">
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-14 text-center">
          <p className="text-3xl mb-3">📞</p>
          <p className="text-gray-700 font-medium">No signed cases to review yet</p>
          <p className="text-sm text-gray-500 mt-1">Check back once cases have been signed</p>
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
        .select('role, nda_signed, timeclock_enabled, team_type')
        .eq('id', user.id)
        .single()

      if (!prof || !prof.nda_signed) { router.push('/teams/onboarding'); return }
      if (prof.role === 'admin') { router.push('/teams/admin'); return }
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} />

        {/* Call listener mode */}
        {!loading && listenerData && (
          <>
            <div className="bg-[#0f1e3c] rounded-xl p-4 mb-5">
              <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-2">Training Mode</p>
              <p className="text-sm text-white">
                Listen to each signed case call recording and write your notes on what happened and how the conversation flowed.
              </p>
            </div>
            <div className="mb-5 flex items-start justify-between">
              <h1 className="text-2xl font-bold text-gray-900">Call Reviews</h1>
              <button onClick={fetchTodos} className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-lg border border-blue-200 hover:border-blue-400 transition-colors">Refresh</button>
            </div>
            <CallListenerView cases={listenerData.cases} />
          </>
        )}

        {/* Call queue mode */}
        {!isListenerMode && (
          <>
            {/* Top Tasks Banner */}
            <div className="bg-[#0f1e3c] rounded-xl p-4 mb-5">
              <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-3">Top Priorities</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="flex items-start gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
                  <span className="text-base mt-0.5">⚡</span>
                  <p className="text-xs text-white leading-snug">New leads must be acknowledged and called within <span className="font-semibold text-yellow-300">90 seconds</span> of hitting Slack.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
                  <span className="text-base mt-0.5">🔁</span>
                  <p className="text-xs text-white leading-snug">Check back on <span className="font-semibold text-blue-300">Follow Up Required</span> and <span className="font-semibold text-red-300">Chase</span> leads regularly throughout your shift.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-white/10 rounded-lg px-3 py-2.5">
                  <span className="text-base mt-0.5">📋</span>
                  <p className="text-xs text-white leading-snug">Call <span className="font-semibold text-yellow-300">all No Response leads</span> within your shift time before it ends.</p>
                </div>
              </div>
            </div>

            <div className="mb-5 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Call Queue</h1>
                {queueData && (
                  <p className="text-sm text-gray-500 mt-1">
                    {queueData.slot ? SLOT_LABELS[queueData.slot] : 'Outside call hours'} · {queueData.today}
                  </p>
                )}
              </div>
              <button
                onClick={fetchTodos}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded-lg border border-blue-200 hover:border-blue-400 transition-colors"
              >
                Refresh
              </button>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            )}

            {!loading && error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4 text-red-700 text-sm">
                {error}
              </div>
            )}

            {!loading && queueData && !queueData.onShift && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-14 text-center">
                <p className="text-3xl mb-3">🌙</p>
                <p className="text-gray-700 font-medium">You're off shift</p>
                {queueData.nextSlotLabel && (
                  <p className="text-sm text-gray-500 mt-1">Next slot: {queueData.nextSlotLabel}</p>
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
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600">Urgent Tasks</h2>
                      <span className="text-xs text-gray-400 font-medium">{queueData.urgentTasks.length}</span>
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
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center mb-6">
                    <p className="text-2xl mb-2">⏳</p>
                    <p className="text-gray-700 font-medium">Between slots</p>
                    {queueData.nextSlotLabel && (
                      <p className="text-sm text-gray-500 mt-1">Next: {queueData.nextSlotLabel}</p>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                {queueData.slot && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5 mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700">
                        {queueData.calledCount} of {queueData.totalCount} called
                      </span>
                      <span className="text-xs text-gray-400">
                        {totalRemaining} remaining{queueData.slotEndLabel ? ` · ends ${queueData.slotEndLabel}` : ''}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: queueData.totalCount > 0 ? `${Math.min(100, Math.round((queueData.calledCount / queueData.totalCount) * 100))}%` : '0%' }}
                      />
                    </div>
                  </div>
                )}

                {/* All-clear banner */}
                {queueData.slot && totalRemaining === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-8 text-center mb-5">
                    <p className="text-3xl mb-2">✅</p>
                    <p className="text-green-700 font-medium">All leads called for this slot!</p>
                  </div>
                )}

                {/* 3-column lead grid */}
                {queueData.slot && totalRemaining > 0 && (
                  <div className="grid grid-cols-3 gap-4">
                    <LeadColumn
                      title="No Response"
                      leads={queueData.leads.nr || []}
                      slot={queueData.slot}
                      color="text-gray-500"
                      totalCount={queueData.totalCount}
                      calledCount={queueData.calledCount}
                      onCheck={handleCheck}
                    />
                    <LeadColumn
                      title="Chase"
                      leads={queueData.leads.chase || []}
                      slot={queueData.slot}
                      color="text-red-500"
                      totalCount={queueData.totalCount}
                      calledCount={queueData.calledCount}
                      onCheck={handleCheck}
                    />
                    <LeadColumn
                      title="Follow Up"
                      leads={queueData.leads.fu || []}
                      slot={queueData.slot}
                      color="text-blue-500"
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
          <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4 text-red-700 text-sm">
            {error}
          </div>
        )}
      </main>
    </div>
  )
}
