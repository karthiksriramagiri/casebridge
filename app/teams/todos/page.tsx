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

interface TodosData {
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

export default function TodosPage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<TodosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setError(err.error || 'Failed to load call queue')
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

    // Check every 60s if the slot has changed — if so, refresh immediately
    const slotCheckInterval = setInterval(() => {
      const now = new Date()
      const estHour = parseInt(
        now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
      ) % 24
      const currentSlot =
        estHour >= 0  && estHour < 10 ? 'overnight' :
        estHour >= 10 && estHour < 15 ? 'morning' :
        estHour >= 15 && estHour < 18 ? 'afternoon' :
        estHour >= 18 && estHour < 24 ? 'evening' : null

      setData(prev => {
        if (prev !== null && prev.slot !== currentSlot) {
          // Slot changed — trigger a fresh fetch
          fetchTodos()
        }
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
      if (!prev) return prev
      const stage = lead.stage as keyof typeof prev.leads
      return {
        ...prev,
        calledCount: prev.calledCount + 1,
        leads: {
          ...prev.leads,
          [stage]: prev.leads[stage].filter(l => l.contactId !== lead.contactId),
        },
      }
    })
  }

  if (!ready) return null

  const totalRemaining = data
    ? (data.leads.nr?.length ?? 0) + (data.leads.fu?.length ?? 0) + (data.leads.chase?.length ?? 0)
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
        <UserNav timeclockEnabled={timeclockEnabled} />

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
            {data && (
              <p className="text-sm text-gray-500 mt-1">
                {data.slot ? SLOT_LABELS[data.slot] : 'Outside call hours'} · {data.today}
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

        {!loading && data && !data.onShift && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-14 text-center">
            <p className="text-3xl mb-3">🌙</p>
            <p className="text-gray-700 font-medium">You're off shift</p>
            {data.nextSlotLabel && (
              <p className="text-sm text-gray-500 mt-1">Next slot: {data.nextSlotLabel}</p>
            )}
          </div>
        )}

        {!loading && data && data.onShift && (
          <>
            {/* Urgent Tasks */}
            {data.urgentTasks && data.urgentTasks.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-base">⚠️</span>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600">Urgent Tasks</h2>
                  <span className="text-xs text-gray-400 font-medium">{data.urgentTasks.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {data.urgentTasks.map(task => (
                    <UrgentTaskCard key={task.id} task={task} />
                  ))}
                </div>
              </div>
            )}

            {/* Shift performance */}
            <ShiftPerformance slotStats={data.slotStats} />

            {/* Between-slot message */}
            {!data.slot && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center mb-6">
                <p className="text-2xl mb-2">⏳</p>
                <p className="text-gray-700 font-medium">Between slots</p>
                {data.nextSlotLabel && (
                  <p className="text-sm text-gray-500 mt-1">Next: {data.nextSlotLabel}</p>
                )}
              </div>
            )}

            {/* Progress bar */}
            {data.slot && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3.5 mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700">
                    {data.calledCount} of {data.totalCount} called
                  </span>
                  <span className="text-xs text-gray-400">
                    {totalRemaining} remaining{data.slotEndLabel ? ` · ends ${data.slotEndLabel}` : ''}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: data.totalCount > 0 ? `${Math.min(100, Math.round((data.calledCount / data.totalCount) * 100))}%` : '0%' }}
                  />
                </div>
              </div>
            )}

            {/* All-clear banner */}
            {data.slot && totalRemaining === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-8 text-center mb-5">
                <p className="text-3xl mb-2">✅</p>
                <p className="text-green-700 font-medium">All leads called for this slot!</p>
              </div>
            )}

            {/* 3-column lead grid */}
            {data.slot && totalRemaining > 0 && (
              <div className="grid grid-cols-3 gap-4">
                <LeadColumn
                  title="No Response"
                  leads={data.leads.nr || []}
                  slot={data.slot}
                  color="text-gray-500"
                  totalCount={data.totalCount}
                  calledCount={data.calledCount}
                  onCheck={handleCheck}
                />
                <LeadColumn
                  title="Chase"
                  leads={data.leads.chase || []}
                  slot={data.slot}
                  color="text-red-500"
                  totalCount={data.totalCount}
                  calledCount={data.calledCount}
                  onCheck={handleCheck}
                />
                <LeadColumn
                  title="Follow Up"
                  leads={data.leads.fu || []}
                  slot={data.slot}
                  color="text-blue-500"
                  totalCount={data.totalCount}
                  calledCount={data.calledCount}
                  onCheck={handleCheck}
                />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
