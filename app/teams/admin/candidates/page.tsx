'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { STAGES, STAGE_LABEL, type StageKey } from './stages'

/* ═══════════════════════════════════════════════════════════════════════════
   Candidates — where every rep sits between getting a login and going live.

   Cards are reps, not a separate candidate record: these people already have
   profiles, and a second table would only drift from the one that matters.

   Two columns fill themselves. Booking the call moves a rep to Booked Call;
   starting module 2 moves them to Nuance Book. Both only ever move a rep
   forward, so dragging someone to Exam Prep is never undone by an automation
   arriving late.
   ═══════════════════════════════════════════════════════════════════════════ */

type Candidate = {
  id: string
  name: string
  team: string
  shift: string
  createdAt: string
  stage: StageKey
  position: number | null
  bookedAt: string | null
  level2At: string | null
  placed: boolean
}

export default function CandidatesPage() {
  const [cands, setCands] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [error, setError] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageKey | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/teams/admin/candidates')
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setCands(data.candidates ?? [])
      setNeedsMigration(Boolean(data.needsMigration))
    } catch {
      setError('Could not load candidates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const byStage = useMemo(() => {
    const m: Record<string, Candidate[]> = {}
    for (const s of STAGES) m[s.key] = []
    for (const c of cands) (m[c.stage] ??= []).push(c)
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) =>
        (a.position ?? 1e9) - (b.position ?? 1e9) ||
        a.name.localeCompare(b.name))
    }
    return m
  }, [cands])

  /* Where a card lands when dropped on a column: after everything already in
     it, on the sparse scale the migration describes.

     This used to send Date.now(). It reads as "newest last" and sorts
     correctly, but candidate_position is an integer column and a millisecond
     epoch is ~1.79e12 — far past the 2,147,483,647 ceiling — so every drag
     failed with 'value "1792376196043" is out of range for type integer' and
     the card snapped back. */
  function nextPosition(stage: StageKey): number {
    const col = byStage[stage] ?? []
    const highest = col.reduce((max, c) => Math.max(max, c.position ?? 0), 0)
    return highest + 1000
  }

  async function move(id: string, stage: StageKey) {
    const before = cands
    const position = nextPosition(stage)
    // Move it on screen first — a drag that waits on the network feels broken.
    setCands(prev => prev.map(c => (c.id === id ? { ...c, stage, position, placed: true } : c)))
    const res = await fetch('/api/teams/admin/candidates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, stage, position }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not save that move.')
      setCands(before)
    } else {
      setError('')
    }
  }

  function onDrop(stage: StageKey) {
    setOverStage(null)
    if (!dragId) return
    const c = cands.find(x => x.id === dragId)
    setDragId(null)
    if (!c || c.stage === stage) return
    move(c.id, stage)
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-400 text-sm">Loading candidates…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Candidates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cands.length} rep{cands.length === 1 ? '' : 's'} · drag a card to move it
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {needsMigration && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
          Moves won&apos;t save yet — run <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">supabase/migration_candidate_board.sql</code>.
          Until then the board shows where each rep sits from their booking and module&nbsp;2 progress.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map(stage => {
          const column = byStage[stage.key] ?? []
          const isOver = overStage === stage.key
          return (
            <div
              key={stage.key}
              onDragOver={e => { e.preventDefault(); setOverStage(stage.key) }}
              onDragLeave={() => setOverStage(s => (s === stage.key ? null : s))}
              onDrop={e => { e.preventDefault(); onDrop(stage.key) }}
              className={`flex-none w-64 rounded-xl border transition-colors ${
                isOver ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-none ${
                      stage.auto ? 'bg-blue-400' : 'bg-gray-300'}`} />
                    <h2 className="text-xs font-semibold text-gray-700 truncate">{stage.label}</h2>
                  </div>
                  {stage.hint && (
                    <p className="text-[10px] leading-snug text-gray-400 mt-1">{stage.hint}</p>
                  )}
                </div>
                <span className="text-xs font-medium text-gray-400 tabular-nums">{column.length}</span>
              </div>

              <div className="px-2 pb-2 space-y-2 min-h-[120px]">
                {column.map(c => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null) }}
                    className={`bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5 cursor-grab active:cursor-grabbing ${
                      dragId === c.id ? 'opacity-40' : 'hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{c.name}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {c.team && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {c.team}
                        </span>
                      )}
                      {c.shift && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {c.shift}
                        </span>
                      )}
                      {!c.placed && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600"
                              title="Placed from their booking and module 2 progress, not moved by hand">
                          auto
                        </span>
                      )}
                    </div>
                    {(c.bookedAt || c.level2At) && (
                      <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                        {c.level2At
                          ? `Module 2 · ${format(new Date(c.level2At), 'MMM d')}`
                          : `Booked · ${format(new Date(c.bookedAt!), 'MMM d, h:mm a')}`}
                      </p>
                    )}
                  </article>
                ))}

                {column.length === 0 && (
                  <p className="text-[11px] text-gray-300 text-center py-6">Drop here</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 align-middle mr-1.5" />
        These columns fill themselves — a rep moves here on their own when they book the call or start module 2.
      </p>
    </div>
  )
}
