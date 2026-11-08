'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Loader2, Save, TriangleAlert } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Textarea } from '@/app/creative/_ui/textarea'
import { PageHeader, Pill, StatCard } from '@/app/creative/_components/admin/shared'
import { DayNav } from '@/app/creative/_components/admin/day-nav'
import { COMPETITORS, TODAY } from '@/app/creative/_lib/data'
import { formatDate, libraryUrl } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
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
  /* The day comes from the store, not from here. Every page in the center
     reads the same one, so the numbers and the boards can never disagree
     about what day it is. */
  const { day: date, setDay: setDate } = useStore()
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

        <DayNav date={date} onChange={setDate} label="Note day" />

        {loading ? (
          <div className="h-80 animate-pulse rounded-lg border bg-card" />
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                Writing <span className="font-normal text-muted-foreground">{formatDate(date)}</span>
              </h2>
              <span className="text-xs text-muted-foreground">{writtenToday} of {COMPETITORS.length} covered</span>
            </div>
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
                    onSave={(body) => save(c.name, body)}
                    onDirtyChange={(d) => markDirty(c.name, d)}
                  />
                )
              })}
            </ul>

            <PastPasses notes={notes} writing={date} onPick={setDate} />
          </>
        )}
      </div>
    </div>
  )
}

function CompetitorCard({
  name, url, date, today, onSave, onDirtyChange,
}: {
  name: string
  url: string
  date: string
  today: Note | null
  onSave: (body: string) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [draft, setDraft] = useState(today?.body ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
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

    </li>
  )
}

/* Every earlier pass, by the day it was written.

   The notes were only ever reachable through the competitor that wrote them
   — six cards each holding their own little history, so "what did we see on
   the 5th" meant opening six collapsibles and reading across them. A pass is
   a sitting: one person goes down the list on one day. This shows it that
   way, newest first, with the day you are writing excluded because it is
   already on screen above. */
function PastPasses({
  notes, writing, onPick,
}: {
  notes: Note[]
  writing: string
  onPick: (d: string) => void
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, Note[]>()
    for (const n of notes) {
      if (n.date === writing) continue
      m.set(n.date, [...(m.get(n.date) ?? []), n])
    }
    for (const list of m.values()) list.sort((a, b) => a.competitor.localeCompare(b.competitor))
    return [...m.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [notes, writing])

  const [open, setOpen] = useState<Set<string>>(new Set())
  /* The most recent pass is open on arrival — it is the one worth reading
     before writing today's. The rest stay shut so the page is a list of
     days rather than a wall of text. */
  const isOpen = (d: string, i: number) => (open.size === 0 ? i === 0 : open.has(d))
  const toggle = (d: string) =>
    setOpen((prev) => {
      const next = new Set(prev.size === 0 ? byDate.slice(0, 1).map(([x]) => x) : prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })

  if (byDate.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">
        Earlier passes <span className="font-normal text-muted-foreground">· {byDate.length}</span>
      </h2>
      <div className="overflow-hidden rounded-lg border bg-card">
        {byDate.map(([d, list], i) => {
          const shown = isOpen(d, i)
          return (
            <div key={d} className="border-b last:border-b-0">
              <div className="flex items-center gap-2 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toggle(d)}
                  aria-expanded={shown}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !shown && '-rotate-90')} aria-hidden />
                  <span className="text-sm font-medium">{formatDate(d)}</span>
                  <span className="text-xs text-muted-foreground">
                    {list.length} of {COMPETITORS.length} competitors
                  </span>
                </button>
                <Button size="sm" variant="ghost" onClick={() => onPick(d)}>Open that day</Button>
              </div>
              {shown && (
                <ul className="divide-y border-t">
                  {list.map((n) => (
                    <li key={n.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:gap-4">
                      <div className="flex shrink-0 items-baseline gap-2 sm:w-52">
                        <span className="text-sm font-medium">{n.competitor}</span>
                        {n.author && <span className="text-[11px] text-muted-foreground">{n.author}</span>}
                      </div>
                      <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
