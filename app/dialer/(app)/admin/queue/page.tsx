'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/app/dialer/_lib/supabase'
import { rankLabel, formatSlot } from '@/app/dialer/_lib/queue-rules'
import { stateForPhone } from '@/app/dialer/_lib/area-codes'
import { FIRM_LABEL } from '@/app/dialer/_lib/firms'

interface Attempt {
  id:             string
  contact_name:   string
  phone:          string
  firm:           string
  stage_name:     string
  plan_date:      string
  attempt_number: number
  attempts_total: number
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
  /* The lead behind the attempt — the list shows one row per lead. */
  contact_id:     string
  /* When the lead last changed stage — what "newest first" sorts on. */
  stage_changed_at: string | null
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



/** A firm code we have no label for is still a real firm — show the code. */
const firmLabel = (code: string) => FIRM_LABEL[code] ?? code.toUpperCase()

const STATUS_BADGE: Record<string, { label: (a: Attempt) => string; cls: string }> = {
  pending:   { label: () => 'pending',                                    cls: 'bg-muted text-muted-foreground' },
  buffered:  { label: a => `⏳ ${a.buffered_for ?? ''}`,                  cls: 'bg-accent text-primary' },
  leased:    { label: a => `🔒 ${a.leased_by ?? ''}`,                     cls: 'bg-success/15 text-success' },
  completed: { label: a => `✓ ${a.disposition ?? 'done'}`,                cls: 'bg-emerald-50 text-emerald-700' },
  merged:    { label: () => 'merged',                                      cls: 'bg-muted text-muted-foreground' },
  cancelled: { label: () => 'cancelled',                                   cls: 'bg-muted text-muted-foreground' },
  expired:   { label: () => 'expired',                                     cls: 'bg-destructive/10 text-destructive' },
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
    s === 'completed'  ? { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700' } :
    s === 'cancelled'  ? { label: 'Cancelled',  cls: 'bg-muted text-muted-foreground' } :
    s === 'expired'    ? { label: 'Expired',     cls: 'bg-destructive/10 text-destructive' } :
    s === 'merged'     ? { label: 'Merged',      cls: 'bg-muted text-muted-foreground' } :
    s === 'leased'     ? { label: 'On Call',     cls: 'bg-success/15 text-success' } :
    s === 'buffered'   ? { label: 'Queued',      cls: 'bg-accent text-primary' } :
    /* pending */        { label: 'Pending',     cls: 'bg-muted text-muted-foreground' }

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
  let cls   = 'text-success'
  if (diff < -0.15) { label = 'Falling behind'; cls = 'text-warning' }
  if (diff < -0.30) { label = 'Behind';          cls = 'text-destructive'   }

  const pct = Math.round(actualFraction * 100)
  return (
    <div className="flex flex-col">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pace</p>
      <p className={`text-sm font-bold ${cls}`}>{label}</p>
      <p className="text-xs text-muted-foreground">{pct}% done</p>
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
  const [state,  setState]  = useState('')      // table view only
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

  // ── Who the floor is dialling — persisted queue filters ───────────────────
  // Two gates on the same settings row: state (from the lead's area code) and
  // firm (from the attempt). A lead has to pass both. The table filters above
  // are view-only; these change what actually gets dialled.
  type FilterMode = 'off' | 'include' | 'exclude'

  const [savedMode,   setSavedMode]   = useState<FilterMode>('off')
  const [savedStates, setSavedStates] = useState<string[]>([])
  const [draftMode,   setDraftMode]   = useState<FilterMode>('off')
  const [draftStates, setDraftStates] = useState<string[]>([])
  const [statesOpen,  setStatesOpen]  = useState(false)
  const [savingStates, setSavingStates] = useState(false)

  const [savedFirmMode,  setSavedFirmMode]  = useState<FilterMode>('off')
  const [savedFirms,     setSavedFirms]     = useState<string[]>([])
  const [draftFirmMode,  setDraftFirmMode]  = useState<FilterMode>('off')
  const [draftFirms,     setDraftFirms]     = useState<string[]>([])
  const [firmsOpen,      setFirmsOpen]      = useState(false)
  const [savingFirms,    setSavingFirms]    = useState(false)
  const [filtersNeedMigration, setFiltersNeedMigration] = useState(false)

  const loadFilters = useCallback(async () => {
    const res  = await fetch('/api/dialer/queue/filters')
    const data = await res.json()
    const sMode   = (data.state?.mode ?? 'off') as FilterMode
    const sStates = (data.state?.states ?? []) as string[]
    const fMode   = (data.firm?.mode ?? 'off') as FilterMode
    const fFirms  = (data.firm?.firms ?? []) as string[]
    setSavedMode(sMode);      setSavedStates(sStates)
    setDraftMode(sMode);      setDraftStates(sStates)
    setSavedFirmMode(fMode);  setSavedFirms(fFirms)
    setDraftFirmMode(fMode);  setDraftFirms(fFirms)
    setFiltersNeedMigration(!!data.needsMigration)
  }, [])

  useEffect(() => { loadFilters() }, [loadFilters])

  async function saveStateFilter() {
    setSavingStates(true)
    const res  = await fetch('/api/dialer/queue/filters', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ state: { mode: draftMode, states: draftStates } }),
    })
    const data = await res.json()
    setSavingStates(false)
    if (!res.ok) { showToast(data.error ?? 'Could not save state filter'); return }
    setSavedMode(data.state.mode); setSavedStates(data.state.states ?? [])
    setStatesOpen(false)
    await Promise.all([fetchData(), fetchReps()])
    showToast(
      data.state.mode === 'off'
        ? 'Calling every state again'
        : `${data.state.mode === 'include' ? 'Calling only' : 'Skipping'} ${(data.state.states ?? []).join(', ')}` +
          (data.released ? ` — ${data.released} queued lead(s) released` : '')
    )
  }

  async function saveFirmFilter() {
    setSavingFirms(true)
    const res  = await fetch('/api/dialer/queue/filters', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ firm: { mode: draftFirmMode, firms: draftFirms } }),
    })
    const data = await res.json()
    setSavingFirms(false)
    if (!res.ok) { showToast(data.error ?? 'Could not save firm filter'); return }
    setSavedFirmMode(data.firm.mode); setSavedFirms(data.firm.firms ?? [])
    setFirmsOpen(false)
    await Promise.all([fetchData(), fetchReps()])
    showToast(
      data.firm.mode === 'off'
        ? 'Calling every firm again'
        : `${data.firm.mode === 'include' ? 'Calling only' : 'Paused'} ${(data.firm.firms ?? []).map(firmLabel).join(', ')}` +
          (data.released ? ` — ${data.released} queued lead(s) released` : '')
    )
  }

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ limit: '10000' })
    if (firm)   params.set('firm', firm)
    if (status) params.set('status', status)
    if (tab === 'done') params.set('status', 'completed')
    // Let the server drop terminal rows for the Active tab rather than
    // shipping them to be filtered out here.
    if (tab === 'active') params.set('active', '1')

    const res  = await fetch(`/api/dialer/queue/admin?${params}`)
    const data = await res.json()
    setItems(data.items ?? [])
    setSummary(data.summary ?? null)
    setLoading(false)
  }, [firm, status, tab])

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

  /* One order, the ladder, for everyone.

This used to group by assigned rep and then by block, which is
     why the list never read as a queue — the top of the page was whichever
     rep's morning happened to sort first. Neither influences the order any
     more; the ladder does. */
  /* One row per lead — the attempt that is actually next for them.

     The table listed every planned attempt, so a lead with six scheduled
     calls occupied six rows. Only the lowest pending attempt for a contact
     can ever be served (the sequential rule in the engine), which meant the
     other five rows were permanently unassignable and the queue could never
     read as assigned-from-the-top however correct the engine was. Rows 1-8
     were two leads wearing eight rows between them.

     Collapsing here rather than in the query keeps the Completed and All
     tabs showing the full history. */
  const collapsed = useMemo(() => {
    const best = new Map<string, any>()
    for (const it of items) {
      const key = it.contact_id ?? it.id
      const cur = best.get(key)
      if (!cur) { best.set(key, it); continue }
      const rank = (x: any) =>
        x.status === 'leased' ? 0 : x.status === 'buffered' ? 1 : x.status === 'pending' ? 2 : 3
      const ra = rank(it), rc = rank(cur)
      if (ra < rc || (ra === rc && (it.attempt_number ?? 0) < (cur.attempt_number ?? 0))) {
        best.set(key, it)
      }
    }
    return [...best.values()]
  }, [items])

  /* The server's order, kept.

     This page used to re-sort what it was given with a comparator of its
     own — a different one from the engine's, missing the fresh tier and the
     redial gap entirely. So the list on screen was not the list leads went
     out in, and "start from the top" meant nothing.

     /api/dialer/queue/admin already runs every waiting row through
     sortQueueCanonical, which is the same function that decides what each
     rep is handed next and the only one that can see last_dialed_at. The
     one useful thing left to do here is collapse a lead's several attempts
     into the single row that represents it. */
  const sorted = collapsed



  /* One row per lead. A lead carries three to six attempts for the day, and
     once recency groups them they land in consecutive slots — the top twelve
     rows of the list were two people repeated six times each. The row shown
     is the highest-ranked attempt for that lead, and the Attempt column
     already says which of how many it is. */
  const onePerLead = useMemo(() => {
    const seen = new Set<string>()
    return sorted.filter(item => {
      if (seen.has(item.contact_id)) return false
      seen.add(item.contact_id)
      return true
    })
  }, [sorted])

  // Apply tab filter
  const tabFiltered = useMemo(() => {
    let list = onePerLead.filter(item => {
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
  }, [onePerLead, tab])

  // States present in today's plan, with counts — drives the pickers below
  /* Firms present in today's plan, with counts — drives the picker below.
     Built from the plan rather than a hardcoded list so a new pipeline shows
     up without a code change. */
  const firmCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (['cancelled', 'expired', 'merged'].includes(item.status)) continue
      counts.set(item.firm, (counts.get(item.firm) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [items])

  /* How many of today's attempts the saved firm filter holds back. */
  const heldByFirmFilter = useMemo(() => {
    if (savedFirmMode === 'off' || savedFirms.length === 0) return 0
    return items.filter(item => {
      if (['cancelled', 'expired', 'merged', 'completed'].includes(item.status)) return false
      if (item.is_callback) return false          // callbacks bypass the filter
      return savedFirmMode === 'include'
        ? !savedFirms.includes(item.firm)
        :  savedFirms.includes(item.firm)
    }).length
  }, [items, savedFirmMode, savedFirms])

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (['cancelled', 'expired', 'merged'].includes(item.status)) continue
      const st = stateForPhone(item.phone) ?? '??'
      counts.set(st, (counts.get(st) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [items])

  // How many of today's attempts the saved filter keeps reps away from
  const skippedByFilter = useMemo(() => {
    if (savedMode === 'off' || savedStates.length === 0) return 0
    return items.filter(item => {
      if (['cancelled', 'expired', 'merged', 'completed'].includes(item.status)) return false
      if (item.is_callback) return false                       // callbacks bypass the filter
      const st = stateForPhone(item.phone)
      if (!st) return savedMode === 'include'                  // unknown state: dropped on include
      return savedMode === 'include' ? !savedStates.includes(st) : savedStates.includes(st)
    }).length
  }, [items, savedMode, savedStates])

  // Apply state + search
  const filtered = tabFiltered.filter(item =>
    (!state || (stateForPhone(item.phone) ?? '??') === state) &&
    (!search ||
      item.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      item.phone.includes(search))
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-muted px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Calling Queue</h1>
            <p className="text-sm text-muted-foreground">Live view — today's call plan</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dialer/admin/queue/visual"
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8 4a.5.5 0 01.5.5v3h3a.5.5 0 010 1h-3v3a.5.5 0 01-1 0v-3h-3a.5.5 0 010-1h3v-3A.5.5 0 018 4z"/>
                <path fillRule="evenodd" d="M2 2a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V2zm2-1a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V2a1 1 0 00-1-1H4z" clipRule="evenodd"/>
              </svg>
              Visual
            </Link>
            <button onClick={handleReset} disabled={resetting}
              className="rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors">
              {resetting ? 'Resetting…' : 'Reset Day'}
            </button>
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary disabled:opacity-50 transition-colors">
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
        <div className="grid grid-cols-4 gap-0 border-b border-border sm:grid-cols-8">
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
            <div key={label} className="border-r border-border bg-card px-3 py-3 last:border-r-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
      {summary && (
        <div className="border-b border-border bg-card px-6 py-2">
          <PaceIndicator completed={summary.completed} totalAttempts={summary.totalAttempts} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-6 py-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="w-44 rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none" />

        <select value={firm} onChange={e => setFirm(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground">
          <option value="">All firms</option>
          <option value="lhp">Larry H. Parker</option>
          <option value="fears">Fears Law</option>
          <option value="jm">Jacoby &amp; Meyers</option>
        </select>

        <select value={state} onChange={e => setState(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground">
          <option value="">All states</option>
          {stateCounts.map(([st, n]) => (
            <option key={st} value={st}>{st === '??' ? 'Unknown' : st} ({n})</option>
          ))}
        </select>

        <select value={status} onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="buffered">Buffered</option>
          <option value="leased">On Call</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
        </select>

        {/* Tab */}
        <div className="flex rounded-lg border border-input overflow-hidden">
          {(['active', 'done', 'callbacks', 'all'] as const).map(t => {
            const label = t === 'done' ? 'Completed' : t === 'callbacks' ? `Callbacks${summary?.callbacks ? ` (${summary.callbacks})` : ''}` : t
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
                {label}
              </button>
            )
          })}
        </div>

        <span className="text-xs text-muted-foreground">{filtered.length} attempts</span>

        {/* Calling firms — which clients the floor is dialling at all */}
        <div className="relative ml-auto">
          <button onClick={() => setFirmsOpen(o => !o)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
              ${savedFirmMode === 'off'
                ? 'border-input bg-card text-muted-foreground hover:bg-muted/50'
                : 'border-warning/40/40 bg-warning/20 text-warning hover:bg-warning/20'}`}>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2 14V5.5a.5.5 0 01.28-.45l5-2.5a.5.5 0 01.44 0l5 2.5A.5.5 0 0113 5.5V14h1.5a.5.5 0 010 1h-13a.5.5 0 010-1H2zm3-7a.5.5 0 000 1h1a.5.5 0 000-1H5zm0 2.5a.5.5 0 000 1h1a.5.5 0 000-1H5zM9 7a.5.5 0 000 1h1a.5.5 0 000-1H9zm0 2.5a.5.5 0 000 1h1a.5.5 0 000-1H9z"/>
            </svg>
            {savedFirmMode === 'off'
              ? 'Calling: all firms'
              : savedFirmMode === 'include'
                ? `Calling only: ${savedFirms.map(firmLabel).join(', ')}`
                : `Paused: ${savedFirms.map(firmLabel).join(', ')}`}
            {heldByFirmFilter > 0 && (
              <span className="rounded-full bg-amber-200/70 px-1.5 text-[10px] tabular-nums text-amber-900">
                {heldByFirmFilter} held
              </span>
            )}
          </button>

          {firmsOpen && (
            <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-border bg-card p-4 shadow-xl">
              <p className="text-sm font-semibold text-foreground">Which firms do reps call?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pausing a firm stops its leads being served without cancelling them — turn it back
                on and they return. Callbacks are always served, whatever the filter says.
              </p>

              {filtersNeedMigration && (
                <p className="mt-2 rounded-lg border border-warning/40 bg-warning/20 px-2 py-1.5 text-[11px] text-warning">
                  Run <code>supabase/migration_dialer_state_filter.sql</code> to enable this.
                </p>
              )}

              <div className="mt-3 flex rounded-lg border border-input overflow-hidden">
                {([
                  ['off',     'All firms'],
                  ['include', 'Only these'],
                  ['exclude', 'All but these'],
                ] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setDraftFirmMode(m)}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors
                      ${draftFirmMode === m
                        ? 'bg-muted text-foreground'
                        : 'bg-card text-muted-foreground hover:bg-muted'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {draftFirmMode !== 'off' && (
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-border">
                  {firmCounts.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No leads in today's plan yet — sync from GHL first.</p>
                  ) : firmCounts.map(([code, n]) => {
                    const on = draftFirms.includes(code)
                    return (
                      <label key={code}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                        <input type="checkbox" checked={on}
                          onChange={() => setDraftFirms(prev =>
                            on ? prev.filter(x => x !== code) : [...prev, code].sort()
                          )}
                          className="h-3.5 w-3.5 accent-cyan-600" />
                        <span className="font-medium text-foreground">{firmLabel(code)}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{n}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              {draftFirmMode !== 'off' && draftFirms.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {draftFirmMode === 'include'
                    ? `Reps will only be served ${draftFirms.map(firmLabel).join(', ')} leads.`
                    : `${draftFirms.map(firmLabel).join(', ')} will not be dialled.`}
                </p>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={() => { setDraftFirmMode(savedFirmMode); setDraftFirms(savedFirms); setFirmsOpen(false) }}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button onClick={saveFirmFilter}
                  disabled={savingFirms || (draftFirmMode !== 'off' && draftFirms.length === 0)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary disabled:opacity-50 transition-colors">
                  {savingFirms ? 'Saving…' : 'Apply to queue'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Calling states — what reps actually get served */}
        <div className="relative">
          <button onClick={() => setStatesOpen(o => !o)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
              ${savedMode === 'off'
                ? 'border-input bg-card text-muted-foreground hover:bg-muted/50'
                : 'border-warning/40/40 bg-warning/20 text-warning hover:bg-warning/20'}`}>
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M1.5 2.5A.5.5 0 012 2h12a.5.5 0 01.39.812L10 8.34V13a.5.5 0 01-.724.447l-3-1.5A.5.5 0 016 11.5V8.34L1.61 2.812A.5.5 0 011.5 2.5z" />
            </svg>
            {savedMode === 'off'
              ? 'Calling: all states'
              : savedMode === 'include'
                ? `Calling only: ${savedStates.join(', ')}`
                : `Skipping: ${savedStates.join(', ')}`}
            {skippedByFilter > 0 && (
              <span className="rounded-full bg-amber-200/70 px-1.5 text-[10px] tabular-nums text-amber-900">
                {skippedByFilter} held
              </span>
            )}
          </button>

          {statesOpen && (
            <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-border bg-card p-4 shadow-xl">
              <p className="text-sm font-semibold text-foreground">Which states do reps call?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                State comes from the lead's area code. Callbacks are always served, whatever the filter says.
              </p>

              <div className="mt-3 flex rounded-lg border border-input overflow-hidden">
                {([
                  ['off',     'All states'],
                  ['include', 'Only these'],
                  ['exclude', 'All but these'],
                ] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setDraftMode(m)}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium transition-colors
                      ${draftMode === m
                        ? 'bg-muted text-foreground'
                        : 'bg-card text-muted-foreground hover:bg-muted'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {draftMode !== 'off' && (
                <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-border">
                  {stateCounts.filter(([st]) => st !== '??').length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No leads in today's plan yet — sync from GHL first.</p>
                  ) : stateCounts.filter(([st]) => st !== '??').map(([st, n]) => {
                    const on = draftStates.includes(st)
                    return (
                      <label key={st}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                        <input type="checkbox" checked={on}
                          onChange={() => setDraftStates(prev =>
                            on ? prev.filter(x => x !== st) : [...prev, st].sort()
                          )}
                          className="h-3.5 w-3.5 accent-cyan-600" />
                        <span className="font-medium text-foreground">{st}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{n}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              {draftMode !== 'off' && draftStates.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {draftMode === 'include'
                    ? `Reps will only be served ${draftStates.join(', ')} leads.`
                    : `Reps will be served everything except ${draftStates.join(', ')}.`}
                </p>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button onClick={() => { setDraftMode(savedMode); setDraftStates(savedStates); setStatesOpen(false) }}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button onClick={saveStateFilter}
                  disabled={savingStates || (draftMode !== 'off' && draftStates.length === 0)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary disabled:opacity-50 transition-colors">
                  {savingStates ? 'Saving…' : 'Apply to queue'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground animate-pulse">Loading queue…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {tab === 'callbacks' ? 'No callbacks scheduled' : 'No attempts found'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
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
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : isPast
                        ? 'border-destructive/40 bg-destructive/10/40'
                        : 'border-primary bg-accent/40'}`}>
                  {/* Callback time — prominent */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`text-lg font-bold tabular-nums
                      ${isDone ? 'text-emerald-600'
                        : isPast ? 'text-destructive'
                        : 'text-primary'}`}>
                      {item.callback_at
                        ? new Date(item.callback_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : '—'}
                    </span>
                    <CallStatusBadge attempt={item} />
                  </div>
                  {/* Lead info */}
                  <p className="font-semibold text-foreground">{item.contact_name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{item.phone}</p>
                  {/* Meta row */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {FIRM_LABEL[item.firm] ?? item.firm}
                    </span>
                    {item.disposition && (
                      <span className="rounded bg-muted px-1.5 py-0.5">
                        {item.disposition}
                      </span>
                    )}
                    {isPast && !isDone && (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
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
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                {['#', 'Lead', 'State', 'Firm / Stage', 'Attempt', 'Next call', 'Callback', 'Assigned', 'Status', 'Disposition', ''].map(h => (
                  <th key={h || '_actions'} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const isActive = !['completed','cancelled','expired','merged'].includes(item.status)
                return (
                  <tr key={item.id}
                    className={`border-b border-border transition-colors
                      ${item.status === 'leased'    ? 'bg-success/15/40'   : ''}
                      ${item.status === 'buffered'  ? 'bg-accent/30'     : ''}
                      ${item.status === 'completed' ? 'bg-muted/50/50 opacity-60' : ''}
                      ${isActive && item.is_carryover ? 'bg-warning/20/30' : ''}
                    `}>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground w-10">{idx + 1}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{item.contact_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.phone}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {(() => {
                        const st = stateForPhone(item.phone)
                        if (!st) return <span className="text-muted-foreground">—</span>
                        const held = savedMode !== 'off' && !item.is_callback && (
                          savedMode === 'include' ? !savedStates.includes(st) : savedStates.includes(st)
                        )
                        return (
                          <span title={held ? 'Not served — filtered out by the state filter' : undefined}
                            className={`inline-block rounded px-1.5 py-0.5 font-medium ${held
                              ? 'bg-warning/20 text-warning line-through'
                              : 'bg-muted text-muted-foreground'}`}>
                            {st}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{FIRM_LABEL[item.firm] ?? item.firm}</p>
                      {/* The tier, when it is not simply the stage name.

                          A lead's position on this page is decided by its
                          tier, and for the two tiers that cut across stages
                          — a lead inside its first 48 hours, an appointment
                          live right now — the stage name alone cannot
                          explain why it is sitting where it is. */}
                      {(() => {
                        const tier = rankLabel(item as any)
                        return tier === item.stage_name ? (
                          <p className="text-xs text-muted-foreground">{item.stage_name}</p>
                        ) : (
                          <p className="text-xs">
                            <span className="font-semibold text-primary">{tier}</span>
                            <span className="text-muted-foreground"> · {item.stage_name}</span>
                          </p>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {item.attempt_number}/{item.attempts_total}
                      </span>
                      {item.is_carryover && (
                        <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-warning text-[9px]">
                          carried
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-xs text-muted-foreground">
                        {formatSlot(item.due_from, item.due_until, item.lead_timezone)}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {item.is_callback && item.callback_at ? (
                        <span className="text-primary">{fmtTime(item.callback_at)}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {item.buffered_for
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-primary">
                            {item.buffered_for}
                          </span>
                        : item.leased_by
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 font-medium text-success">
                              {item.leased_by}
                            </span>
                          : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-2.5">
                      <CallStatusBadge attempt={item} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.disposition ?? <span className="text-muted-foreground">—</span>}
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
                          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
