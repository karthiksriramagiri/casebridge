'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  ExternalLink, Loader2, Save, TriangleAlert,
} from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Textarea } from '@/app/creative/_ui/textarea'
import { PageHeader, Pill, StatCard } from '@/app/creative/_components/admin/shared'
import { COMPETITORS, TODAY, addDays } from '@/app/creative/_lib/data'
import { formatDate, libraryUrl } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { ROLE_LABEL } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Competitors

   The notes used to be one box per competitor, overwritten every time anyone
   typed in it — so there was nothing for the Creative Team to read before
   doing their own pass, and no way to see that a competitor had been drifting
   towards banner hooks for three weeks.

   A note is an observation made on a day. The value is in the sequence, so
   they are stored by day and the earlier ones stay readable underneath.
   ═══════════════════════════════════════════════════════════════════════════ */

type Note = { id: string; competitor: string; date: string; body: string; author: string | null; updatedAt: string }

export default function CompetitorsPage() {
  const role = useRole()
  const [date, setDate] = useState(TODAY)
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Which cards have been typed in and not saved. Tracked at the page so the
     browser can be told before it throws the work away. */
  const [dirty, setDirty] = useState<Set<string>>(new Set())

  const markDirty = useCallback((name: string, isDirty: boolean) => {
    setDirty((prev) => {
      if (prev.has(name) === isDirty) return prev
      const next = new Set(prev)
      isDirty ? next.add(name) : next.delete(name)
      return next
    })
  }, [])

  /* Nothing auto-saves any more, so leaving with a half-written note has to
     be an explicit choice rather than a silent loss. */
  useEffect(() => {
    if (dirty.size === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty.size])

  const load = useCallback(() => {
    fetch('/api/creative/competitor-notes?days=90', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setNotes(d.notes ?? [])
        setSetupNeeded(!!d.setupNeeded)
        setError(d.error ?? null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const byCompetitor = useMemo(() => {
    const m = new Map<string, Note[]>()
    for (const n of notes) m.set(n.competitor, [...(m.get(n.competitor) ?? []), n])
    for (const list of m.values()) list.sort((a, b) => b.date.localeCompare(a.date))
    return m
  }, [notes])

  const writtenToday = COMPETITORS.filter((c) => (byCompetitor.get(c.name) ?? []).some((n) => n.date === date)).length
  const lastSession = useMemo(() => {
    const earlier = notes.filter((n) => n.date < date).map((n) => n.date).sort()
    return earlier.length ? earlier[earlier.length - 1] : null
  }, [notes, date])

  /* The note being written is held locally and saved on blur, so a save is
     one request per competitor per sitting rather than one per keystroke. */
  const save = useCallback(async (competitor: string, body: string) => {
    const res = await fetch('/api/creative/competitor-notes', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ competitor, date, body, author: ROLE_LABEL[role] }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error ?? 'The note did not save.'); return false }
    setError(null)
    load()
    return true
  }, [date, role, load])

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Competitors"
        description="Meta Ad Library shortcuts, and what we noticed — by day, so the last pass is readable before the next one."
      />

      <div className="flex flex-col gap-4 p-6">
        {setupNeeded ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">The notes table has not been created yet</p>
              <p className="text-muted-foreground">
                Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">supabase/migration_creative_competitor_notes.sql</code>{' '}
                in the Supabase SQL editor. Until then nothing saves.
              </p>
            </div>
          </div>
        ) : error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>
        ) : null}

        {dirty.size > 0 && (
          <p className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm">
            {dirty.size} {dirty.size === 1 ? 'note has' : 'notes have'} unsaved changes — press <strong>Save</strong> on
            {dirty.size === 1 ? ' that card' : ' each card'} before leaving.
          </p>
        )}

        <section aria-label="Notes totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Competitors tracked" value={String(COMPETITORS.length)} hint="Ad Library shortcuts" />
          <StatCard
            label={`Noted ${formatDate(date)}`}
            value={`${writtenToday}/${COMPETITORS.length}`}
            tone={writtenToday === COMPETITORS.length ? 'good' : undefined}
            hint="covered in this pass"
          />
          <StatCard
            label="Previous pass"
            value={lastSession ? formatDate(lastSession) : '—'}
            hint={lastSession ? 'read it under each note' : 'nothing earlier recorded'}
          />
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <input
            type="date"
            value={date}
            aria-label="Note day"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
          />
          <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => setDate((d) => addDays(d, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          {date !== TODAY && <Button variant="ghost" size="sm" onClick={() => setDate(TODAY)}>Today</Button>}
          <span className="ml-auto text-xs text-muted-foreground">
            Writing {formatDate(date)} · earlier notes stay readable below each box
          </span>
        </div>

        {loading ? (
          <div className="h-80 animate-pulse rounded-lg border bg-card" />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {COMPETITORS.map((c) => {
              const all = byCompetitor.get(c.name) ?? []
              return (
                <CompetitorCard
                  key={c.name}
                  name={c.name}
                  url={c.url}
                  date={date}
                  today={all.find((n) => n.date === date) ?? null}
                  history={all.filter((n) => n.date !== date)}
                  onSave={(body) => save(c.name, body)}
                  onDirtyChange={(d) => markDirty(c.name, d)}
                />
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function CompetitorCard({
  name, url, date, today, history, onSave, onDirtyChange,
}: {
  name: string
  url: string
  date: string
  today: Note | null
  history: Note[]
  onSave: (body: string) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState(today?.body ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showHistory, setShowHistory] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stored = today?.body ?? ''
  const dirty = draft !== stored

  /* The box follows the day being viewed, and any edit the server has since
     accepted — but never mid-typing, which would fight the cursor. */
  useEffect(() => { setDraft(today?.body ?? ''); setState('idle') }, [date, today?.id, today?.updatedAt])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  /* Held in a ref because the parent rebuilds this callback on every render.
     Depending on its identity would re-run the unmount cleanup below on each
     render, which clears the dirty flag, which re-renders the parent — a loop
     that only stops when React gives up. */
  const notify = useRef(onDirtyChange)
  useEffect(() => { notify.current = onDirtyChange })
  useEffect(() => { notify.current(dirty) }, [dirty])
  /* A card that unmounts — the page navigating away — is no longer unsaved
     work anyone can act on, so it stops counting. */
  useEffect(() => () => notify.current(false), [])

  /* Saving on blur was invisible: no way to tell whether a note had been
     written or was about to be lost. The button is the save, and until it is
     pressed the card says so. */
  const commit = async () => {
    if (!dirty) return
    setState('saving')
    const ok = await onSave(draft)
    setState(ok ? 'saved' : 'idle')
    if (ok) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2500)
    }
  }

  const latest = history[0]

  return (
    <li className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4', dirty && 'border-primary/40')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-semibold">{name}</h2>
        <a
          href={libraryUrl(url)}
          target="_blank"
          rel="noreferrer"
          title="Opens active ads sorted by impressions, high to low"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Top ads <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in new tab)</span>
        </a>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor={`note-${name}`} className="text-xs font-medium text-muted-foreground">
            {formatDate(date)}
          </label>
          {dirty && <Pill tone="amber">Unsaved</Pill>}
          {today?.author && !dirty && state === 'idle' && (
            <span className="ml-auto text-xs text-muted-foreground">{today.author}</span>
          )}
        </div>
        <Textarea
          id={`note-${name}`}
          rows={4}
          placeholder="Winners spotted, recurring hooks, new formats…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            /* ⌘/Ctrl+Enter saves without reaching for the mouse — the hands
               are already on the keyboard after writing a note. */
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void commit() }
          }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty || state === 'saving'} onClick={commit}>
            {state === 'saving'
              ? <><Loader2 className="animate-spin" aria-hidden /> Saving…</>
              : state === 'saved'
                ? <><Check aria-hidden /> Saved</>
                : <><Save aria-hidden /> Save</>}
          </Button>
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(stored)}>Discard</Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">⌘↵</span>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No earlier notes.</p>
      ) : (
        <div className="flex flex-col gap-2 border-t pt-2">
          {/* The most recent earlier note is shown without asking, because it
              is the thing to read before writing today's. */}
          <PastNote n={latest} />
          {history.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn('size-3 transition-transform', !showHistory && '-rotate-90')} aria-hidden />
                {history.length - 1} earlier {history.length - 1 === 1 ? 'note' : 'notes'}
              </button>
              {showHistory && (
                <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                  {history.slice(1).map((n) => <PastNote key={n.id} n={n} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

function PastNote({ n }: { n: Note }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <Pill>{formatDate(n.date)}</Pill>
        {n.author && <span className="text-[11px] text-muted-foreground">{n.author}</span>}
      </div>
      <p className="whitespace-pre-wrap text-pretty text-xs leading-relaxed text-muted-foreground">{n.body}</p>
    </div>
  )
}
