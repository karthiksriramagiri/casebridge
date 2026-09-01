'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/app/dialer/_lib/supabase'
import { formatBlockWindow } from '@/app/dialer/_lib/blocks'
import type { BlockName } from '@/app/dialer/_lib/blocks'

interface Attempt {
  id:             string
  contact_name:   string
  phone:          string
  firm:           string
  stage_name:     string
  plan_date:      string
  attempt_number: number
  attempts_total: number
  block:          string
  lead_timezone:  string
  due_from:       string
  due_until:      string
  day_ends_at:    string
  priority:       number
  is_carryover:   boolean
  status:         string
  buffered_for:   string | null
  leased_by:      string | null
  completed_by:   string | null
  disposition:    string | null
  is_callback:    boolean
  callback_at:    string | null
  owner_rep:      string | null
  created_at:     string | null
}

interface Summary {
  uniqueLeads:    number
  totalAttempts:  number
  completed:      number
  dueNow:         number
  callbacks:      number
  buffered:       number
  leased:         number
  byFirm:         { lhp: number; fears: number; jm: number }
}

const FIRM_LABEL: Record<string, string> = { lhp: 'LHP', fears: 'Fears', jm: 'J&M' }

const STATUS_BADGE: Record<string, { label: (a: Attempt) => string; cls: string }> = {
  pending:   { label: () => 'pending',                                    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
  buffered:  { label: a => `⏳ ${a.buffered_for ?? ''}`,                  cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  leased:    { label: a => `🔒 ${a.leased_by ?? ''}`,                     cls: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  completed: { label: a => `✓ ${a.disposition ?? 'done'}`,                cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  merged:    { label: () => 'merged',                                      cls: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' },
  cancelled: { label: () => 'cancelled',                                   cls: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' },
  expired:   { label: () => 'expired',                                     cls: 'bg-red-50 text-red-400 dark:bg-red-950/30 dark:text-red-400' },
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function StatusBadge({ attempt }: { attempt: Attempt }) {
  const cfg = STATUS_BADGE[attempt.status] ?? STATUS_BADGE.pending
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>
      {cfg.label(attempt)}
    </span>
  )
}

function CallStatusBadge({ attempt }: { attempt: Attempt }) {
  const s = attempt.status
  const cfg =
    s === 'completed'  ? { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' } :
    s === 'cancelled'  ? { label: 'Cancelled',  cls: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' } :
    s === 'expired'    ? { label: 'Expired',     cls: 'bg-red-50 text-red-400 dark:bg-red-950/30 dark:text-red-400' } :
    s === 'merged'     ? { label: 'Merged',      cls: 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500' } :
    s === 'leased'     ? { label: 'On Call',     cls: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300' } :
    s === 'buffered'   ? { label: 'Queued',      cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' } :
    /* pending */        { label: 'Pending',     cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' }

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function PaceIndicator({ completed, totalAttempts }: { completed: number; totalAttempts: number }) {
  if (totalAttempts === 0) return null

  // Simple pace: what % should be done by now vs what is done
  const now     = new Date()
  const dayStart = new Date(now); dayStart.setHours(8, 30, 0, 0)
  const dayEnd   = new Date(now); dayEnd.setHours(20, 30, 0, 0)
  const elapsed  = Math.max(0, now.getTime() - dayStart.getTime())
  const total    = dayEnd.getTime() - dayStart.getTime()
  const expectedFraction = Math.min(1, elapsed / total)
  const actualFraction   = completed / totalAttempts

  const diff = actualFraction - expectedFraction

  let label = 'On pace'
  let cls   = 'text-green-600 dark:text-green-400'
  if (diff < -0.15) { label = 'Falling behind'; cls = 'text-amber-500 dark:text-amber-400' }
  if (diff < -0.30) { label = 'Behind';          cls = 'text-red-500 dark:text-red-400'   }

  const pct = Math.round(actualFraction * 100)
  return (
    <div className="flex flex-col">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Pace</p>
      <p className={`text-sm font-bold ${cls}`}>{label}</p>
      <p className="text-xs text-gray-400">{pct}% done</p>
    </div>
  )
}

export default function QueueAdminPage() {
  const [items,    setItems]    = useState<Attempt[]>([])
  const [summary,  setSummary]  = useState<Summary | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)
  const [resetting, setResetting] = useState(false)
  const [toast,    setToast]    = useState<string | null>(null)

  // Filters
  const [firm,   setFirm]   = useState('')
  const [status, setStatus] = useState('')
  const [block,  setBlock]  = useState('')
  const [search, setSearch] = useState('')
  const [tab,    setTab]    = useState<'active' | 'done' | 'callbacks' | 'all'>('active')

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  // ── Rep status panel ──────────────────────────────────────────────────────
  interface RepRow {
    rep_identity: string
    status: string
    buffered: number
    leased: number
  }
  const [reps, setReps] = useState<RepRow[]>([])
  const [fillingRep, setFillingRep] = useState<string | null>(null)

  const fetchReps = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const db = createClient()
    const [{ data: repData }, { data: attData }] = await Promise.all([
      db.from('dialer_rep_status').select('rep_identity, status').neq('status', 'OFFLINE'),
      db.from('dialer_attempts')
        .select('buffered_for, leased_by, status')
        .eq('plan_date', today)
        .in('status', ['buffered', 'leased']),
    ])
    const rows = (repData ?? []).map(r => ({
      rep_identity: r.rep_identity,
      status: r.status,
      buffered: (attData ?? []).filter(a => a.status === 'buffered' && a.buffered_for === r.rep_identity).length,
      leased:   (attData ?? []).filter(a => a.status === 'leased'   && a.leased_by   === r.rep_identity).length,
    }))
    setReps(rows)
  }, [])

  async function fillRepQueue(rep: string) {
    setFillingRep(rep)
    await fetch('/api/dialer/queue/buffer/refill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rep, count: 5 }),
    })
    await fetchReps()
    await fetchData()
    setFillingRep(null)
  }

  async function fillAllReps() {
    setFillingRep('__all__')
    await fetch('/api/dialer/queue/buffer/fill-all', { method: 'POST' })
    await fetchReps()
    await fetchData()
    setFillingRep(null)
  }

  // Auto-fill all READY reps on mount
  const didAutoFill = useRef(false)
  useEffect(() => {
    if (didAutoFill.current) return
    didAutoFill.current = true
    fetch('/api/dialer/queue/buffer/fill-all', { method: 'POST' })
      .then(() => { fetchReps(); fetchData() })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ limit: '1000' })
    if (firm)   params.set('firm', firm)
    if (status) params.set('status', status)
    if (block)  params.set('block', block)
    if (tab === 'done') params.set('status', 'completed')

    const res  = await fetch(`/api/dialer/queue/admin?${params}`)
    const data = await res.json()
    setItems(data.items ?? [])
    setSummary(data.summary ?? null)
    setLoading(false)
  }, [firm, status, block, tab])

  // Initial load
  useEffect(() => { fetchData(); fetchReps() }, [fetchData, fetchReps])

  // Supabase Realtime — subscribe to dialer_attempts changes
  useEffect(() => {
    const db = createClient()
    supabaseRef.current = db

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const channel = db.channel('admin-queue')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'dialer_attempts',
        filter: `plan_date=eq.${today}`,
      }, (payload) => {
        fetchReps()
        const updated = payload.new as Attempt | null
        const old     = payload.old as { id?: string } | null

        setItems(prev => {
          if (payload.eventType === 'DELETE' && old?.id) {
            return prev.filter(i => i.id !== old.id)
          }
          if (payload.eventType === 'INSERT' && updated) {
            return [...prev, updated]
          }
          if (payload.eventType === 'UPDATE' && updated) {
            return prev.map(i => i.id === updated.id ? { ...i, ...updated } : i)
          }
          return prev
        })
      })
      .subscribe()

    // Subscribe to rep status changes — auto-fill when new rep goes READY
    const repChannel = db.channel('admin-reps')
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'dialer_rep_status',
      }, (payload) => {
        fetchReps()
        // Do NOT call per-rep refill here — it races with disposition's
        // fillBuffer and causes double-assignment. The on-mount fill-all
        // handles initial setup; disposition handles per-call top-up.
      })
      .subscribe()

    // Fallback poll every 10s if realtime drops
    const poll = setInterval(() => { fetchData(); fetchReps() }, 10_000)

    return () => {
      db.removeChannel(channel)
      db.removeChannel(repChannel)
      clearInterval(poll)
    }
  }, [fetchData, fetchReps])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSync() {
    setSyncing(true)
    const res    = await fetch('/api/dialer/queue/sync', { method: 'POST' })
    const result = await res.json()
    await fetchData()
    setSyncing(false)
    showToast(`Sync complete — ${result.created} created, ${result.updated} updated, ${result.cancelled} cancelled`)
  }

  async function handleReset() {
    if (!confirm('Reset today\'s plan? This cancels all pending attempts and re-syncs from GHL. Completed calls are untouched.')) return
    setResetting(true)
    const res    = await fetch('/api/dialer/queue/reset', { method: 'POST' })
    const result = await res.json()
    await fetchData()
    setResetting(false)
    showToast(`Reset complete — ${result.created} attempts planned`)
  }

  // Sort: status group (assigned first) → block chronological (morning→afternoon→evening→night) → priority
  // This keeps assigned leads contiguous AND blocks in time order.
  const sorted = useMemo(() => {
    const statusOrder = (s: string) => {
      if (s === 'leased')   return 0
      if (s === 'buffered') return 1
      if (s === 'pending')  return 2
      return 3
    }
    const blockOrder = (b: string) => {
      if (b === 'morning')   return 0
      if (b === 'afternoon') return 1
      if (b === 'evening')   return 2
      if (b === 'night')     return 3
      return 4
    }
    return [...items].sort((a, b) => {
      // 1. Status group: assigned before pending
      const sa = statusOrder(a.status)
      const sb = statusOrder(b.status)
      if (sa !== sb) return sa - sb
      // 2. Group by assigned rep (keeps each rep's leads contiguous)
      const repA = a.buffered_for || a.leased_by || ''
      const repB = b.buffered_for || b.leased_by || ''
      if (repA !== repB) return repA.localeCompare(repB)
      // 3. Block chronological: morning → afternoon → evening → night
      const ba = blockOrder(a.block)
      const bb = blockOrder(b.block)
      if (ba !== bb) return ba - bb
      // 4. Priority order within same block
      if (a.is_callback !== b.is_callback) return a.is_callback ? -1 : 1
      if (a.is_carryover !== b.is_carryover) return a.is_carryover ? -1 : 1
      if (a.priority !== b.priority) return b.priority - a.priority
      // Within same priority, newest NR leads first (most recent stage change)
      const scA = (a as any).stage_changed_at ?? ''
      const scB = (b as any).stage_changed_at ?? ''
      if (scA !== scB) return scB < scA ? -1 : 1
      if (a.attempt_number !== b.attempt_number) return a.attempt_number - b.attempt_number
      if (a.created_at !== b.created_at) return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
  }, [items])

  // Apply tab filter
  const tabFiltered = useMemo(() => {
    let list = sorted.filter(item => {
      if (tab === 'active')    return !['completed', 'cancelled', 'expired', 'merged'].includes(item.status)
      if (tab === 'done')      return item.status === 'completed'
      if (tab === 'callbacks') return item.is_callback || item.disposition === 'Callback'
      return true
    })
    // Sort callbacks by callback time (soonest first, completed at bottom)
    if (tab === 'callbacks') {
      list = [...list].sort((a, b) => {
        const aDone = a.status === 'completed' ? 1 : 0
        const bDone = b.status === 'completed' ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return (a.callback_at ?? '').localeCompare(b.callback_at ?? '')
      })
    }
    return list
  }, [sorted, tab])

  // Apply search
  const filtered = tabFiltered.filter(item =>
    !search ||
    item.contact_name.toLowerCase().includes(search.toLowerCase()) ||
    item.phone.includes(search)
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Calling Queue</h1>
            <p className="text-sm text-gray-500">Live view — today's call plan</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dialer/admin/queue/visual"
              className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
                <path fillRule="evenodd" d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H4z" clipRule="evenodd"/>
              </svg>
              Visual
            </Link>
            <button onClick={handleReset} disabled={resetting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {resetting ? 'Resetting…' : 'Reset Day'}
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}>
                <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z" clipRule="evenodd" />
                <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z" />
              </svg>
              {syncing ? 'Syncing…' : 'Sync from GHL'}
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      {summary && (
        <div className="grid grid-cols-4 gap-0 border-b border-gray-200 dark:border-gray-800 sm:grid-cols-8">
          {[
            { label: 'Unique Leads',  value: summary.uniqueLeads },
            { label: 'Total Attempts', value: summary.totalAttempts },
            { label: 'Completed',      value: `${summary.completed} / ${summary.totalAttempts}`, accent: true },
            { label: 'Due Now',        value: summary.dueNow, accent: summary.dueNow > 0 },
            { label: 'Callbacks',      value: summary.callbacks, accent: summary.callbacks > 0 },
            { label: 'In Buffer',      value: summary.buffered },
            { label: 'On Call',        value: summary.leased },
            { label: 'LHP / Fears / J&M',   value: `${summary.byFirm.lhp} / ${summary.byFirm.fears} / ${summary.byFirm.jm}` },
          ].map(({ label, value, accent }) => (
            <div key={label} className="border-r border-gray-200 bg-white px-3 py-3 last:border-r-0 dark:border-gray-800 dark:bg-gray-950">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${accent ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
      {summary && (
        <div className="border-b border-gray-200 bg-white px-6 py-2 dark:border-gray-800 dark:bg-gray-950">
          <PaceIndicator completed={summary.completed} totalAttempts={summary.totalAttempts} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-6 py-3 dark:border-gray-800 dark:bg-gray-950">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-cyan-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white" />

        <select value={firm} onChange={e => setFirm(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
          <option value="">All firms</option>
          <option value="lhp">Larry H. Parker</option>
          <option value="fears">Fears Law</option>
          <option value="jm">Jacoby &amp; Meyers</option>
        </select>

        <select value={block} onChange={e => setBlock(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
          <option value="">All blocks</option>
          <option value="morning">Morning</option>
          <option value="afternoon">Afternoon</option>
          <option value="evening">Evening</option>
          <option value="night">Night</option>
        </select>

        <select value={status} onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="buffered">Buffered</option>
          <option value="leased">On Call</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>

        {/* Tab */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden dark:border-gray-700">
          {(['active', 'done', 'callbacks', 'all'] as const).map(t => {
            const label = t === 'done' ? 'Completed' : t === 'callbacks' ? `Callbacks${summary?.callbacks ? ` (${summary.callbacks})` : ''}` : t
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white' : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400'}`}>
                {label}
              </button>
            )
          })}
        </div>

        <span className="text-xs text-gray-400">{filtered.length} attempts</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400 animate-pulse">Loading queue…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400">
                {tab === 'callbacks' ? 'No callbacks scheduled' : 'No attempts found'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {tab === 'callbacks'
                  ? 'Callbacks will appear here when reps set the Callback disposition'
                  : 'Click "Sync from GHL" to plan today\'s calls'}
              </p>
            </div>
          </div>
        ) : tab === 'callbacks' ? (
          /* ── Callbacks card view ─────────────────────────────── */
          <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(item => {
              const isPast = item.callback_at ? new Date(item.callback_at) < new Date() : false
              const isDone = item.status === 'completed'
              return (
                <div key={item.id}
                  className={`rounded-xl border p-4 transition-colors
                    ${isDone
                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                      : isPast
                        ? 'border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20'
                        : 'border-blue-200 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/20'}`}>
                  {/* Callback time — prominent */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`text-lg font-bold tabular-nums
                      ${isDone ? 'text-emerald-600 dark:text-emerald-400'
                        : isPast ? 'text-red-500 dark:text-red-400'
                        : 'text-blue-600 dark:text-blue-400'}`}>
                      {item.callback_at
                        ? new Date(item.callback_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : '—'}
                    </span>
                    <CallStatusBadge attempt={item} />
                  </div>
                  {/* Lead info */}
                  <p className="font-semibold text-gray-900 dark:text-white">{item.contact_name}</p>
                  <p className="text-xs font-mono text-gray-400">{item.phone}</p>
                  {/* Meta row */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800 dark:text-gray-400">
                      {FIRM_LABEL[item.firm] ?? item.firm}
                    </span>
                    {item.owner_rep && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
                        {item.owner_rep}
                      </span>
                    )}
                    {item.disposition && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800 dark:text-gray-400">
                        {item.disposition}
                      </span>
                    )}
                    {isPast && !isDone && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
              <tr>
                {['#', 'Lead', 'Firm / Stage', 'Attempt', 'Block / Window', 'Callback', 'Owner', 'Assigned', 'Status', 'Disposition', ''].map(h => (
                  <th key={h || '_actions'} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const isActive = !['completed','cancelled','expired','merged'].includes(item.status)
                return (
                  <tr key={item.id}
                    className={`border-b border-gray-50 dark:border-gray-800/50 transition-colors
                      ${item.status === 'leased'    ? 'bg-green-50/40 dark:bg-green-950/10'   : ''}
                      ${item.status === 'buffered'  ? 'bg-blue-50/30 dark:bg-blue-950/10'     : ''}
                      ${item.status === 'completed' ? 'bg-gray-50/50 dark:bg-gray-800/10 opacity-60' : ''}
                      ${isActive && item.is_carryover ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}
                    `}>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-gray-400 w-10">{idx + 1}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800 dark:text-gray-200">{item.contact_name}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.phone}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-700 dark:text-gray-300">{FIRM_LABEL[item.firm] ?? item.firm}</p>
                      <p className="text-xs text-gray-400">{item.stage_name}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {item.attempt_number}/{item.attempts_total}
                      </span>
                      {item.is_carryover && (
                        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-[9px]">
                          carried
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {formatBlockWindow(item.block as BlockName, item.due_from, item.due_until, item.lead_timezone)}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {item.is_callback && item.callback_at ? (
                        <span className="text-blue-600 dark:text-blue-400">{fmtTime(item.callback_at)}</span>
                      ) : <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {item.owner_rep ?? <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {item.buffered_for
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {item.buffered_for}
                          </span>
                        : item.leased_by
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
                              {item.leased_by}
                            </span>
                          : <span className="text-gray-300 dark:text-gray-700">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      <CallStatusBadge attempt={item} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {item.disposition ?? <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isActive && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Remove ${item.contact_name} from queue?`)) return
                            const res = await fetch(`/api/dialer/queue/admin?id=${item.id}`, { method: 'DELETE' })
                            if (res.ok) {
                              setItems(prev => prev.filter(i => i.id !== item.id))
                            }
                          }}
                          className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Remove from queue"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
