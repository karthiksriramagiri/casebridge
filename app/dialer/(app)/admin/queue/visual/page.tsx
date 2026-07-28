'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/app/dialer/_lib/supabase'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────────

interface Lead {
  id:              string
  contact_name:    string
  phone:           string
  firm:            string
  stage_name:      string
  status:          string
  buffered_for:    string | null
  leased_by:       string | null
  priority:        number
  plan_date:       string
  attempt_number:  number
  attempts_total:  number
  is_callback:     boolean
  is_carryover:    boolean
}

interface RepInfo {
  rep_identity: string
  status:       string
}

// ── Constants ────────────────────────────────────────────────────────────────────

const DROP_DURATION = 700

const FIRM_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  lhp:   { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-400' },
  fears: { bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',  text: 'text-cyan-400',  dot: 'bg-cyan-400' },
}

// ── Lead card (compact, for inside jars) ─────────────────────────────────────────

function LeadCard({ lead, entering = false, index }: { lead: Lead; entering?: boolean; index?: number }) {
  const fc = FIRM_COLORS[lead.firm] ?? FIRM_COLORS.fears
  const isOnCall = lead.status === 'leased'

  return (
    <div
      className={`
        w-full rounded-lg border px-3 py-2 transition-all duration-300
        ${fc.border} ${fc.bg}
        ${isOnCall ? 'ring-1 ring-green-400/50 shadow-green-500/10 shadow-md' : ''}
        ${entering ? 'animate-[cardDropIn_0.6s_cubic-bezier(0.34,1.56,0.64,1)_forwards]' : ''}
      `}
      style={entering ? { opacity: 0 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate">{lead.contact_name}</p>
          <p className="text-[10px] font-mono text-gray-500 truncate">{lead.phone}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span className={`text-[10px] font-bold uppercase ${fc.text}`}>
            {lead.firm === 'lhp' ? 'LHP' : 'Fears'}
          </span>
          <span className="text-[9px] text-gray-500 tabular-nums">
            {lead.attempt_number}/{lead.attempts_total}
          </span>
        </div>
      </div>
      {isOnCall && (
        <div className="mt-1 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-green-400">On Call</span>
        </div>
      )}
    </div>
  )
}

// ── "Up Next" card (larger, for the queue preview) ───────────────────────────────

function UpNextCard({ lead, position, exiting = false }: { lead: Lead; position: number; exiting?: boolean }) {
  const fc = FIRM_COLORS[lead.firm] ?? FIRM_COLORS.fears

  return (
    <div
      className={`
        flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-500
        ${fc.border} bg-gray-900/80 backdrop-blur-sm
        ${exiting
          ? 'animate-[cardExitDown_0.5s_ease-in_forwards]'
          : 'animate-[cardSlideUp_0.4s_ease-out_forwards]'
        }
      `}
    >
      {/* Position badge */}
      <div className={`
        flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold tabular-nums
        ${position === 1 ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-500'}
      `}>
        {position}
      </div>

      {/* Lead info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{lead.contact_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs font-mono text-gray-500">{lead.phone}</span>
          <span className="text-[10px] text-gray-600">·</span>
          <span className="text-[10px] text-gray-400 truncate">{lead.stage_name}</span>
        </div>
      </div>

      {/* Firm + attempt */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${fc.dot}`} />
          <span className={`text-xs font-bold ${fc.text}`}>
            {lead.firm === 'lhp' ? 'LHP' : 'Fears'}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 tabular-nums">
          Attempt {lead.attempt_number}/{lead.attempts_total}
        </span>
      </div>

      {/* Arrow indicator */}
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-600 flex-shrink-0">
        <path fillRule="evenodd" d="M8 1a.5.5 0 01.5.5v11.793l3.146-3.147a.5.5 0 01.708.708l-4 4a.5.5 0 01-.708 0l-4-4a.5.5 0 01.708-.708L7.5 13.293V1.5A.5.5 0 018 1z" clipRule="evenodd" />
      </svg>
    </div>
  )
}

// ── Jar component ────────────────────────────────────────────────────────────────

function Jar({ rep, leads, newLeadIds }: {
  rep: RepInfo
  leads: Lead[]
  newLeadIds: Set<string>
}) {
  const isActive = rep.status === 'READY' || rep.status === 'ON_CALL'

  return (
    <div className="flex flex-col items-center gap-3 w-[220px]">
      {/* Rep header */}
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2.5 h-2.5 rounded-full ${
          rep.status === 'READY'   ? 'bg-green-400 shadow-green-400/50 shadow-sm' :
          rep.status === 'ON_CALL' ? 'bg-amber-400 shadow-amber-400/50 shadow-sm animate-pulse' :
          'bg-gray-600'
        }`} />
        <span className="text-base font-bold text-white capitalize">{rep.rep_identity}</span>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-bold tabular-nums text-gray-400">
          {leads.length}/5
        </span>
      </div>

      {/* Jar container */}
      <div
        className={`
          w-full rounded-2xl border-2 p-2 transition-all duration-300 min-h-[320px]
          flex flex-col gap-1.5
          ${isActive
            ? 'border-white/10 bg-white/[0.02]'
            : 'border-white/[0.04] bg-white/[0.01] opacity-40'
          }
        `}
        style={{ backdropFilter: 'blur(12px)' }}
      >
        {/* Glass reflection */}
        <div className="absolute inset-y-0 left-0 w-[20%] rounded-l-2xl pointer-events-none"
          style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.02) 0%, transparent 100%)' }} />

        {leads.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-700 italic">Empty</p>
          </div>
        ) : (
          leads.map((lead, i) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              index={i}
              entering={newLeadIds.has(lead.id)}
            />
          ))
        )}
      </div>

      {/* Status label */}
      <span className={`text-[10px] uppercase tracking-widest font-semibold ${
        rep.status === 'READY'   ? 'text-green-500' :
        rep.status === 'ON_CALL' ? 'text-amber-500' :
        'text-gray-600'
      }`}>
        {rep.status === 'READY' ? 'Ready' : rep.status === 'ON_CALL' ? 'On Call' : rep.status.toLowerCase()}
      </span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────────

export default function VisualQueuePage() {
  const [leads, setLeads]           = useState<Lead[]>([])
  const [reps, setReps]             = useState<RepInfo[]>([])
  const [filling, setFilling]       = useState(false)
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set())
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const prevLeadMap                 = useRef<Map<string, string>>(new Map())

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const db = createClient()

    const [{ data: attempts }, { data: repData }, { data: users }] = await Promise.all([
      db.from('dialer_attempts')
        .select('id, contact_name, phone, firm, stage_name, status, buffered_for, leased_by, priority, plan_date, attempt_number, attempts_total, is_callback, is_carryover')
        .eq('plan_date', today)
        .in('status', ['pending', 'buffered', 'leased'])
        .order('due_from',       { ascending: true })
        .order('is_callback',    { ascending: false })
        .order('is_carryover',   { ascending: false })
        .order('priority',       { ascending: false })
        .order('attempt_number', { ascending: true })
        .order('created_at',     { ascending: true })
        .order('id',             { ascending: true })
        .limit(2000),
      db.from('dialer_rep_status').select('rep_identity, status'),
      db.from('dialer_users').select('twilio_identity, role, active'),
    ])

    const validReps = new Set(
      (users ?? []).filter(u => u.role === 'REP' && u.active).map(u => u.twilio_identity)
    )

    setLeads((attempts ?? []) as Lead[])
    setReps((repData ?? []).filter(r => validReps.has(r.rep_identity)))

    const map = new Map<string, string>()
    for (const a of attempts ?? []) map.set(a.id, a.status)
    prevLeadMap.current = map
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Realtime ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const db = createClient()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const channel = db.channel('visual-queue')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'dialer_attempts',
        filter: `plan_date=eq.${today}`,
      }, (payload) => {
        const updated = payload.new as Lead | null
        const old     = payload.old as { id?: string; status?: string } | null

        if (payload.eventType === 'UPDATE' && updated) {
          const wasStatus = prevLeadMap.current.get(updated.id)

          // Lead newly assigned — trigger drop animation
          if (wasStatus === 'pending' && updated.status === 'buffered' && updated.buffered_for) {
            // Mark as exiting from Up Next
            setExitingIds(prev => new Set([...prev, updated.id]))
            setTimeout(() => setExitingIds(prev => {
              const next = new Set(prev)
              next.delete(updated.id)
              return next
            }), 600)

            // Mark as entering jar (after short delay so exit animation plays first)
            setTimeout(() => {
              setNewLeadIds(prev => new Set([...prev, updated.id]))
              setTimeout(() => setNewLeadIds(prev => {
                const next = new Set(prev)
                next.delete(updated.id)
                return next
              }), DROP_DURATION + 100)
            }, 200)
          }

          setLeads(prev => {
            const idx = prev.findIndex(l => l.id === updated.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...prev[idx], ...updated }
              return next
            }
            return [...prev, updated]
          })
          prevLeadMap.current.set(updated.id, updated.status)
        }

        if (payload.eventType === 'INSERT' && updated) {
          setLeads(prev => [...prev, updated])
          prevLeadMap.current.set(updated.id, updated.status)
        }

        if (payload.eventType === 'DELETE' && old?.id) {
          setLeads(prev => prev.filter(l => l.id !== old.id))
          prevLeadMap.current.delete(old.id)
        }
      })
      .subscribe()

    const repChannel = db.channel('visual-reps')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'dialer_rep_status',
      }, () => fetchData())
      .subscribe()

    const poll = setInterval(fetchData, 15_000)

    return () => { db.removeChannel(channel); db.removeChannel(repChannel); clearInterval(poll) }
  }, [fetchData])

  // ── Derived data ────────────────────────────────────────────────────────────

  const pendingLeads = useMemo(() =>
    leads.filter(l => l.status === 'pending'), [leads])

  const upNext = useMemo(() => pendingLeads.slice(0, 3), [pendingLeads])

  // Build rep lead map first — leads are already in queue order from the DB
  const leadsByRep = useMemo(() => {
    const map = new Map<string, Lead[]>()
    for (const l of leads) {
      const rep = l.buffered_for ?? l.leased_by
      if (rep && ['buffered', 'leased'].includes(l.status)) {
        const arr = map.get(rep) ?? []
        arr.push(l)
        map.set(rep, arr)
      }
    }
    return map
  }, [leads])

  // Sort reps by queue position — rep whose first lead appears earliest goes first
  // This matches the exact table order (e.g. ziyad has #1-5, karthik #6-10, pablo #11-15)
  const readyReps = useMemo(() => {
    const activeReps = reps.filter(r => ['READY', 'ON_CALL'].includes(r.status))
    // Build a map of rep → index of their first lead in the full leads array
    const leadIndex = new Map<string, number>()
    for (let i = 0; i < leads.length; i++) {
      const rep = leads[i].buffered_for ?? leads[i].leased_by
      if (rep && ['buffered', 'leased'].includes(leads[i].status) && !leadIndex.has(rep)) {
        leadIndex.set(rep, i)
      }
    }
    return activeReps.sort((a, b) =>
      (leadIndex.get(a.rep_identity) ?? Infinity) - (leadIndex.get(b.rep_identity) ?? Infinity)
    )
  }, [reps, leads])

  // ── Fill handler ────────────────────────────────────────────────────────────

  async function handleFill() {
    if (filling) return
    setFilling(true)

    const beforePending = new Set(pendingLeads.map(l => l.id))

    await fetch('/api/dialer/queue/buffer/fill-all', { method: 'POST' })

    // Refetch
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const db = createClient()
    const { data: newAttempts } = await db.from('dialer_attempts')
      .select('id, contact_name, phone, firm, stage_name, status, buffered_for, leased_by, priority, plan_date, attempt_number, attempts_total, is_callback, is_carryover')
      .eq('plan_date', today)
      .in('status', ['pending', 'buffered', 'leased'])
      .order('due_from',       { ascending: true })
      .order('is_callback',    { ascending: false })
      .order('is_carryover',   { ascending: false })
      .order('priority',       { ascending: false })
      .order('attempt_number', { ascending: true })
      .order('created_at',     { ascending: true })
      .order('id',             { ascending: true })
      .limit(2000)

    const newLeads = (newAttempts ?? []) as Lead[]

    // Find newly assigned
    const assigned = newLeads
      .filter(l => beforePending.has(l.id) && l.status === 'buffered')
      .map(l => l.id)

    setNewLeadIds(new Set(assigned))
    setLeads(newLeads)

    const map = new Map<string, string>()
    for (const l of newLeads) map.set(l.id, l.status)
    prevLeadMap.current = map

    setTimeout(() => {
      setNewLeadIds(new Set())
      setFilling(false)
    }, assigned.length * 80 + DROP_DURATION + 400)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-gray-950 overflow-hidden">
      <style>{`
        @keyframes cardDropIn {
          0%   { transform: translateY(-60px) scale(0.9); opacity: 0; }
          40%  { opacity: 1; transform: translateY(4px) scale(1.02); }
          70%  { transform: translateY(-3px) scale(1); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes cardExitDown {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(40px) scale(0.9); opacity: 0; }
        }
        @keyframes cardSlideUp {
          0%   { transform: translateY(12px); opacity: 0.5; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes gentlePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
          50%      { box-shadow: 0 0 0 6px rgba(99,102,241,0.1); }
        }
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800/50 bg-gray-950 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dialer/admin/queue"
            className="flex items-center gap-1.5 rounded-lg bg-gray-800/50 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M12 8a.5.5 0 01-.5.5H5.707l2.147 2.146a.5.5 0 01-.708.708l-3-3a.5.5 0 010-.708l3-3a.5.5 0 11.708.708L5.707 7.5H11.5A.5.5 0 0112 8z" clipRule="evenodd"/>
            </svg>
            Table View
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Visual Queue</h1>
            <p className="text-xs text-gray-500">Live assignment visualization</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-5 mr-4">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">In Queue</p>
              <p className="text-lg font-bold tabular-nums text-white">{pendingLeads.length}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Assigned</p>
              <p className="text-lg font-bold tabular-nums text-cyan-400">
                {leads.filter(l => ['buffered', 'leased'].includes(l.status)).length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Reps</p>
              <p className="text-lg font-bold tabular-nums text-green-400">{readyReps.length}</p>
            </div>
          </div>

          <button
            onClick={handleFill}
            disabled={filling || readyReps.length === 0}
            className={`
              relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white
              transition-all duration-300 disabled:opacity-40
              ${filling
                ? 'bg-indigo-600 shadow-lg shadow-indigo-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20'
              }
            `}
          >
            {filling ? 'Filling...' : 'Fill Queue'}
          </button>
        </div>
      </header>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Top section — Up Next */}
        <div className="flex-shrink-0 border-b border-gray-800/30 bg-gray-950/50 px-6 py-5">
          <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Up Next</h2>
              <span className="text-[10px] text-gray-600">
                {pendingLeads.length > 3 ? `+${pendingLeads.length - 3} more` : ''}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {upNext.length === 0 ? (
                <p className="text-sm text-gray-600 italic py-4 text-center">Queue is empty</p>
              ) : (
                upNext.map((lead, i) => (
                  <UpNextCard
                    key={lead.id}
                    lead={lead}
                    position={i + 1}
                    exiting={exitingIds.has(lead.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Arrow / flow indicator */}
        <div className="flex-shrink-0 flex justify-center py-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-4 bg-gradient-to-b from-transparent to-gray-700" />
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5 text-gray-700">
              <path fillRule="evenodd" d="M8 1a.5.5 0 01.5.5v11.793l3.146-3.147a.5.5 0 01.708.708l-4 4a.5.5 0 01-.708 0l-4-4a.5.5 0 01.708-.708L7.5 13.293V1.5A.5.5 0 018 1z" clipRule="evenodd" />
            </svg>
          </div>
        </div>

        {/* Bottom section — Rep jars */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <div className="flex justify-center gap-6 flex-wrap">
            {readyReps.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-sm text-gray-500">No reps online</p>
                <p className="text-xs text-gray-600 mt-1">Reps need to be READY to receive leads</p>
              </div>
            ) : (
              readyReps.map(rep => (
                <Jar
                  key={rep.rep_identity}
                  rep={rep}
                  leads={leadsByRep.get(rep.rep_identity) ?? []}
                  newLeadIds={newLeadIds}
                />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
