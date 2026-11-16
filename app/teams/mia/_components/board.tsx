'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock, GripVertical, Loader2, Phone, PhoneOutgoing, Plus, Search, Trash2, TriangleAlert, User, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  MIA_COLUMNS, MIA_STATUSES, STALE_AFTER_DAYS,
  type MiaCase, type MiaEvent, type MiaStatus, type MiaViewer,
} from '@/app/teams/mia/_lib/types'
import { Button } from '@/app/teams/_ui/button'
import { Input } from '@/app/teams/_ui/input'
import { Textarea } from '@/app/teams/_ui/textarea'
/* `Card` here is a case on the board, so the shared surface comes in as
   `Panel` — the local name is the more meaningful one. */
import { Card as Panel, Pill, SearchBox } from '@/app/teams/_components/shared'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   The MIA board.

   Four columns and a card per case. The card moves left to right as somebody
   gets the person back: dragged with a mouse, or moved with the buttons on
   the card itself — the buttons are not a fallback, they are the only way
   this works on a phone, and chasing people is done on a phone.

   The move is optimistic. A drag that waited for the server would leave the
   card under the cursor for half a second and feel broken; instead the card
   lands where it was dropped, and if the write fails it goes back and says
   so. That is the one case where moving the card twice is the honest thing
   to do.
   ═══════════════════════════════════════════════════════════════════════════ */

type Data = {
  cases: MiaCase[]
  firms: { id: string; name: string }[]
  reps: { id: string; name: string }[]
  viewer: MiaViewer
  setupNeeded?: boolean
  setup?: string
  error?: string
}

/* The four columns, in the centre's palette.

   The board used rose/amber/sky/emerald, one hue per column, which is the
   one thing here that genuinely needs colour: the columns are a sequence and
   the colour is how you read where a card is from across the room. Mapped
   onto the tokens rather than kept as raw Tailwind — `safe` is the same
   green as a passed quiz, `mia` the same red as a failed one. */
const TONE: Record<string, { head: string; dot: string; ring: string; pill: 'red' | 'amber' | 'blue' | 'green' }> = {
  red:   { head: 'text-destructive', dot: 'bg-destructive', ring: 'ring-destructive/40', pill: 'red' },
  amber: { head: 'text-warning',     dot: 'bg-warning',     ring: 'ring-warning/40',     pill: 'amber' },
  blue:  { head: 'text-primary',     dot: 'bg-primary',     ring: 'ring-primary/40',     pill: 'blue' },
  green: { head: 'text-success',     dot: 'bg-success',     ring: 'ring-success/40',     pill: 'green' },
}

/** Whole days since an instant. Used only for the stale flag. */
const daysSince = (iso: string) => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return Math.floor((Date.now() - t) / 86_400_000)
}

const agoLabel = (iso: string) => {
  const d = daysSince(iso)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

export function MiaBoard({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<MiaStatus | null>(null)
  /* Writes in flight. A poll landing mid-drag would pull the old position
     back and read as the card snapping home on its own. */
  const inFlight = useRef(0)

  const me = data.viewer
  const cases = data.cases

  const refresh = useCallback(async () => {
    if (inFlight.current > 0) return
    try {
      const res = await fetch('/api/mia', { cache: 'no-store' })
      const d = await res.json()
      if (!d.error) setData((prev) => ({ ...prev, ...d }))
    } catch { /* a dropped poll is not worth a message; the next one runs in 20s */ }
  }, [])

  /* The board is shared — two people chase different cases at once — so it
     polls, and again whenever the tab is brought back. */
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refresh() }
    const id = setInterval(tick, 20_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(id); window.removeEventListener('focus', tick) }
  }, [refresh])

  const write = useCallback(async (body: Record<string, unknown>, revert: () => void) => {
    inFlight.current += 1
    try {
      const res = await fetch('/api/mia', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) {
        revert()
        toast.error('That did not save', { description: d.error ?? 'The board has been put back.' })
      }
    } catch (e) {
      revert()
      toast.error('That did not save', { description: (e as Error).message })
    } finally {
      inFlight.current -= 1
    }
  }, [])

  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () => cases.filter((c) =>
      !q || [c.name, c.phone, c.email, c.firmName, c.ownerName, c.note]
        .some((f) => (f ?? '').toLowerCase().includes(q))),
    [cases, q],
  )

  const byColumn = useMemo(() => {
    const m = new Map<MiaStatus, MiaCase[]>(MIA_STATUSES.map((s) => [s, []]))
    for (const c of visible) m.get(c.status)?.push(c)
    for (const [, list] of m) list.sort((a, b) => a.order - b.order)
    return m
  }, [visible])

  /** Move a card into a column, optimistically. */
  const move = useCallback((id: string, to: MiaStatus) => {
    const card = cases.find((c) => c.id === id)
    if (!card || card.status === to) return
    const from = card.status
    const prevOrder = card.order
    /* Dropped cards go to the top of the column they land in: the thing you
       just touched is the thing you are working on. */
    const top = Math.min(0, ...cases.filter((c) => c.status === to).map((c) => c.order)) - 1

    setData((d) => ({
      ...d,
      cases: d.cases.map((c) =>
        c.id === id ? { ...c, status: to, order: top, movedAt: new Date().toISOString() } : c),
    }))
    void write({ id, status: to, order: top }, () =>
      setData((d) => ({
        ...d,
        cases: d.cases.map((c) => (c.id === id ? { ...c, status: from, order: prevOrder } : c)),
      })))
  }, [cases, write])

  const claim = useCallback((id: string, ownerId: string | null) => {
    const card = cases.find((c) => c.id === id)
    if (!card) return
    const before = card.ownerId
    const beforeName = card.ownerName
    const name = ownerId ? (data.reps.find((r) => r.id === ownerId)?.name ?? null) : null
    setData((d) => ({ ...d, cases: d.cases.map((c) => (c.id === id ? { ...c, ownerId, ownerName: name } : c)) }))
    void write({ id, ownerId }, () =>
      setData((d) => ({ ...d, cases: d.cases.map((c) => (c.id === id ? { ...c, ownerId: before, ownerName: beforeName } : c)) })))
  }, [cases, data.reps, write])

  const remove = useCallback(async (c: MiaCase) => {
    const keep = data.cases
    setData((d) => ({ ...d, cases: d.cases.filter((x) => x.id !== c.id) }))
    inFlight.current += 1
    try {
      const res = await fetch(`/api/mia?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) {
        setData((prev) => ({ ...prev, cases: keep }))
        toast.error('Not removed', { description: d.error ?? 'The card has been put back.' })
        return
      }
      toast(`${c.name} taken off the board`)
      setOpenId(null)
    } finally { inFlight.current -= 1 }
  }, [data.cases])

  if (data.setupNeeded) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">The MIA board has no tables yet</p>
          <p className="text-muted-foreground">
            Run <code className="rounded bg-warning/15 px-1 py-0.5 font-mono text-xs">supabase/migration_mia_center.sql</code>{' '}
            in the Supabase SQL editor. Nothing will save until it exists.
          </p>
        </div>
      </div>
    )
  }

  const total = cases.length
  const open = cases.filter((c) => c.status !== 'safe').length

  return (
    <div className="flex flex-col gap-4">
      {/* ── Controls ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={query}
          onChange={setQuery}
          label="Search the MIA board"
          placeholder="Search name, phone, firm, owner"
        />
        {/* Only while filtering. The standing counts are in the page header;
            repeating them here would be two sources for one number. */}
        {q && (
          <span className="text-xs text-muted-foreground">
            {visible.length} of {total}
          </span>
        )}
        {me.isAdmin && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add a case
          </Button>
        )}
      </div>

      {/* ── The board ─────────────────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-4">
        {MIA_COLUMNS.map((col) => {
          const list = byColumn.get(col.key) ?? []
          const tone = TONE[col.tone]
          return (
            <section
              key={col.key}
              aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.key) }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => {
                e.preventDefault()
                const id = dragId ?? e.dataTransfer.getData('text/plain')
                setOverCol(null); setDragId(null)
                if (id) move(id, col.key)
              }}
              className={cn(
                'flex min-h-[18rem] flex-col rounded-lg border bg-muted/40 transition-colors',
                overCol === col.key && `bg-card ring-2 ${tone.ring}`,
              )}
            >
              <header className="flex items-center gap-2 border-b bg-card px-3 py-2.5">
                <span className={cn('size-2 rounded-full', tone.dot)} aria-hidden />
                <h2 className={cn('text-sm font-semibold', tone.head)}>{col.label}</h2>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {list.length}
                </span>
              </header>
              <p className="px-3 pt-2 text-[11px] leading-snug text-muted-foreground">{col.blurb}</p>

              <div className="flex flex-1 flex-col gap-2 p-2">
                {list.length === 0 && (
                  <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    {q ? 'Nothing here matches' : 'Nothing here'}
                  </p>
                )}
                {list.map((c) => (
                  <Card
                    key={c.id}
                    c={c}
                    me={me}
                    dragging={dragId === c.id}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    onMove={(to) => move(c.id, to)}
                    onOpen={() => setOpenId(c.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {adding && (
        <AddDialog
          firms={data.firms}
          reps={data.reps}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); void refresh() }}
        />
      )}
      {openId && (
        <DetailSheet
          c={cases.find((x) => x.id === openId)!}
          me={me}
          reps={data.reps}
          onClose={() => setOpenId(null)}
          onClaim={(owner) => claim(openId, owner)}
          onMove={(to) => move(openId, to)}
          onRemove={remove}
          onSaveNote={(note) => {
            const before = cases.find((x) => x.id === openId)?.note ?? ''
            setData((d) => ({ ...d, cases: d.cases.map((x) => (x.id === openId ? { ...x, note } : x)) }))
            void write({ id: openId, note }, () =>
              setData((d) => ({ ...d, cases: d.cases.map((x) => (x.id === openId ? { ...x, note: before } : x)) })))
          }}
        />
      )}
    </div>
  )
}

/* ── One case ─────────────────────────────────────────────────────────── */

function Card({
  c, me, dragging, onDragStart, onDragEnd, onMove, onOpen,
}: {
  c: MiaCase
  me: MiaViewer
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (to: MiaStatus) => void
  onOpen: () => void
}) {
  const idx = MIA_STATUSES.indexOf(c.status)
  const prev = idx > 0 ? MIA_STATUSES[idx - 1] : null
  const next = idx < MIA_STATUSES.length - 1 ? MIA_STATUSES[idx + 1] : null
  const limit = STALE_AFTER_DAYS[c.status]
  const stale = limit !== null && daysSince(c.movedAt) >= limit

  return (
    <article
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      className={cn(
        'group rounded-lg border bg-card p-2.5 transition-opacity',
        dragging && 'opacity-40',
        /* A card that has sat too long says so on its own edge — the whole
           point of the board is that nothing goes quiet twice. */
        stale && 'border-destructive/40',
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground/50 group-hover:text-muted-foreground" aria-hidden />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold">{c.name}</p>
          {c.phone && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <Phone className="size-3" aria-hidden /> {c.phone}
            </p>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 pl-5 pt-1.5">
        {c.firmName && <Pill>{c.firmName}</Pill>}
        {c.ownerName ? (
          <Pill tone="blue">
            <User className="size-2.5" aria-hidden /> {c.ownerName}
          </Pill>
        ) : c.closerName ? (
          /* Unclaimed, but not unassigned in spirit: the closer gets the
             first call, so an untouched card says whose it is rather than
             inviting whoever is nearest to ring a stranger's client. */
          <Pill tone="amber">
            <PhoneOutgoing className="size-2.5" aria-hidden /> {c.closerName} calls first
          </Pill>
        ) : (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground/70">unclaimed</span>
        )}
        {/* How long it has sat here. The whole point of the board is that
            nothing goes quiet twice. */}
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]',
          stale ? 'bg-destructive/10 font-medium text-destructive' : 'text-muted-foreground/70',
        )}>
          <Clock className="size-2.5" aria-hidden /> {agoLabel(c.movedAt)}
        </span>
      </div>

      {/* Who closed it, once somebody else has taken the card. While it is
          unclaimed the chip above already says it; repeating it here would
          be the same fact twice on a card three lines tall. */}
      {c.closerName && c.ownerName && c.ownerId !== c.closerId && (
        <p className="truncate pl-5 pt-1 text-[10px] text-muted-foreground">
          closed by {c.closerName}
        </p>
      )}

      {/* The note, on the card rather than one click into it. It is what the
          first call opens with, and a board you have to open every card on
          to know anything is a board nobody reads before dialling. */}
      {c.note && (
        <p className="line-clamp-2 pl-5 pt-1 text-[11px] leading-snug text-muted-foreground">
          {c.note}
        </p>
      )}

      {/* Touch and keyboard get the same moves the mouse does. A board that
          can only be driven by dragging is a board nobody can use from a
          phone, which is where this work actually happens. */}
      <div className="flex gap-1 pl-5 pt-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {prev && (
          <button type="button" onClick={() => onMove(prev)}
            className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
            aria-label={`Move ${c.name} back to ${prev}`}>← {prev}</button>
        )}
        {next && (
          <button type="button" onClick={() => onMove(next)}
            className="rounded border border-primary bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            aria-label={`Move ${c.name} on to ${next}`}>{next} →</button>
        )}
      </div>
    </article>
  )
}

/* ── Adding one ───────────────────────────────────────────────────────── */

type SignedLeadHit = {
  id: string
  name: string
  phone: string | null
  firmId: string | null
  firmName: string | null
  invoiceCode: string | null
  closer: string | null
  closerId: string | null
  signedOn: string
  onBoard: string | null
}

function AddDialog({
  firms, reps, onClose, onAdded,
}: {
  firms: { id: string; name: string }[]
  reps: { id: string; name: string }[]
  onClose: () => void
  onAdded: () => void
}) {
  /* Two ways in, and the search is the default because it is the right one
     almost always: it carries the lead's own id, phone and firm across, so
     the card and the pipeline agree about who this is. Typing a name by
     hand is how "Jon Porter" ends up on the board beside "John Porter" in
     GHL with nothing linking them. Manual entry stays for the case that is
     not in the pipeline yet. */
  const [mode, setMode] = useState<'search' | 'manual'>('search')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [firmId, setFirmId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [closer, setCloser] = useState('')
  const [closerId, setCloserId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [leadId, setLeadId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SignedLeadHit[] | null>(null)
  const [searching, setSearching] = useState(false)

  /* Debounced, and the in-flight request is tracked so a slow early reply
     cannot overwrite the results of a later keystroke. */
  const seq = useRef(0)
  useEffect(() => {
    if (mode !== 'search') return
    const mine = ++seq.current
    setSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/mia/leads?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => { if (mine === seq.current) setHits(d.leads ?? []) })
        .catch(() => { if (mine === seq.current) setHits([]) })
        .finally(() => { if (mine === seq.current) setSearching(false) })
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, mode])

  const pick = (l: SignedLeadHit) => {
    setLeadId(l.id)
    setName(l.name)
    setPhone(l.phone ?? '')
    setFirmId(l.firmId ?? '')
    setCloser(l.closer ?? '')
    setCloserId(l.closerId ?? null)
    /* Assigned to the closer by default, because they get to call first:
       they are the one voice the person already agreed to. Only when the
       closer is a rep with a profile — a name with nobody behind it cannot
       own a card — and the admin can still change it before adding. */
    if (l.closerId && reps.some((r) => r.id === l.closerId)) setOwnerId(l.closerId)
    setMode('manual')
  }

  const submit = async () => {
    if (!name.trim()) { toast.error('A name is required'); return }
    /* The note is required, not merely asked for. Whoever rings first opens
       with it, and a card added without one sends them in knowing nothing
       but the name — which is how the second call goes the same way as the
       first. */
    if (!note.trim()) { toast.error('Add a note', { description: 'Whoever calls first opens with it.' }); return }
    setBusy(true)
    try {
      const res = await fetch('/api/mia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, phone, email,
          firmId: firmId || null,
          ownerId: ownerId || null,
          closer: closer || null,
          closerId: closerId || null,
          note, leadId,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) { toast.error('Not added', { description: d.error }); return }
      toast(`${name.trim()} added to MIA`)
      onAdded()
    } finally { setBusy(false) }
  }

  return (
    /* `.ui-portal` carries the tokens: this renders on <body>, outside
       `.tc-root`, so without it the dialog borrows the app's palette. */
    <div className="ui-portal fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4" onClick={onClose}>
      <Panel className="my-8 w-full max-w-lg p-5 shadow-lg" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold">Add a case to MIA</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([['search', 'Find a signed case'], ['manual', leadId ? 'Details' : 'Enter by hand']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={cn('flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === k ? 'bg-card' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'search' ? (
          <div className="flex flex-col gap-2 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search signed cases by name or phone"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              {searching && hits === null ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</p>
              ) : (hits ?? []).length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {q ? `No signed case matches “${q}”.` : 'No signed cases found.'}
                </p>
              ) : (
                <ul className="divide-y">
                  {(hits ?? []).map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        disabled={!!l.onBoard}
                        onClick={() => pick(l)}
                        className={cn('flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                          l.onBoard ? 'cursor-default opacity-50' : 'hover:bg-muted/50')}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {[l.phone, l.firmName, l.closer && `closed by ${l.closer}`, l.signedOn && `signed ${l.signedOn}`]
                              .filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {l.onBoard ? (
                          <Pill>on the board · {l.onBoard}</Pill>
                        ) : (
                          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Signed cases only, replacements excluded. Not in the pipeline yet?{' '}
              <button type="button" onClick={() => setMode('manual')} className="underline hover:text-foreground">
                Enter it by hand
              </button>.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 pt-3">
            {leadId && (
              /* Says plainly that this card is tied to a pipeline row, and
                 offers the way out — picking the wrong person is easy and
                 the link is invisible once it is made. */
              <div className="flex items-center gap-2 rounded-md bg-success/10 px-2.5 py-2 text-xs text-success">
                <span className="flex-1">Linked to the signed case for <b>{name}</b></span>
                <button type="button" onClick={() => setLeadId(null)} className="underline hover:no-underline">unlink</button>
              </div>
            )}
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Firm">
                <select value={firmId} onChange={(e) => setFirmId(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>
              <Field label="Closed by">
                {/* Filled in from the signed case when one was picked, and
                    typeable otherwise — plenty of closers have no profile.
                    Editing the name clears the link to the rep so the card
                    cannot claim to be owned by somebody it no longer names. */}
                <Input
                  value={closer}
                  onChange={(e) => { setCloser(e.target.value); setCloserId(null) }}
                  placeholder="Who signed them"
                />
              </Field>
            </div>
            <Field label="Assign to">
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                <option value="">Unclaimed</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {closerId && ownerId === closerId && (
                <span className="text-[11px] text-muted-foreground">
                  {closer} closed this case, so the first call is theirs.
                </span>
              )}
            </Field>
            <Field label="Note" required>
              {/* Not optional in practice: whoever rings first opens with it.
                  A card that says only "went quiet" sends a rep in with
                  nothing, which is how the second call goes the same way as
                  the first. */}
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                placeholder="Why they went quiet, what has been tried, what to open with" />
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy || !name.trim() || !note.trim()}>
            {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Add to board
          </Button>
        </div>
      </Panel>
    </div>
  )
}

/* ── One case, opened ─────────────────────────────────────────────────── */

function DetailSheet({
  c, me, reps, onClose, onClaim, onMove, onRemove, onSaveNote,
}: {
  c: MiaCase
  me: MiaViewer
  reps: { id: string; name: string }[]
  onClose: () => void
  onClaim: (ownerId: string | null) => void
  onMove: (to: MiaStatus) => void
  onRemove: (c: MiaCase) => void
  onSaveNote: (note: string) => void
}) {
  const [note, setNote] = useState(c.note)
  const [events, setEvents] = useState<MiaEvent[] | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/mia?events=${encodeURIComponent(c.id)}`)
      .then((r) => r.json())
      .then((d) => { if (live) setEvents(d.events ?? []) })
      .catch(() => { if (live) setEvents([]) })
    return () => { live = false }
  }, [c.id])

  return (
    <div className="ui-portal fixed inset-0 z-50 flex justify-end bg-foreground/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{c.name}</h2>
            <p className="text-xs text-muted-foreground">
              {c.phone ?? 'no phone'}{c.firmName ? ` · ${c.firmName}` : ''} · in {c.status} since {agoLabel(c.movedAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">Move to</p>
            <div className="flex flex-wrap gap-1.5">
              {MIA_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  type="button"
                  disabled={col.key === c.status}
                  onClick={() => onMove(col.key)}
                  className={cn('rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    col.key === c.status
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted')}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          {/* Who closed it, stated before the owner picker rather than after,
              because it is the fact that decides who the owner should be. */}
          {c.closerName && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
              <p className="text-xs">
                Closed by <b className="font-semibold">{c.closerName}</b> — they call first.
              </p>
              {c.closerId && c.ownerId !== c.closerId && reps.some((r) => r.id === c.closerId) && (
                <button
                  type="button"
                  onClick={() => onClaim(c.closerId)}
                  className="pt-1 text-xs font-medium text-primary hover:underline"
                >
                  Hand it to {c.closerName}
                </button>
              )}
            </div>
          )}

          <div>
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">Owner</p>
            <div className="flex gap-2">
              <select
                value={c.ownerId ?? ''}
                onChange={(e) => onClaim(e.target.value || null)}
                aria-label="Owner"
                className={cn(inputCls, 'flex-1')}
              >
                <option value="">Unclaimed</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {c.ownerId !== me.id && (
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => onClaim(me.id)}>
                  I&rsquo;ll take it
                </Button>
              )}
            </div>
          </div>

          <div>
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">Note</p>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} aria-label="Note" />
            {note !== c.note && (
              <Button size="sm" className="mt-1.5" onClick={() => onSaveNote(note)}>
                Save note
              </Button>
            )}
          </div>

          <div>
            <p className="pb-1.5 text-xs font-medium text-muted-foreground">History</p>
            {events === null ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {events.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 text-xs">
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="flex-1 text-foreground/90">{e.detail || e.kind}</span>
                    <span className="shrink-0 text-muted-foreground">{e.actorName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {me.isAdmin && (
            <div className="border-t pt-4">
              <button type="button" onClick={() => onRemove(c)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:underline">
                <Trash2 className="size-3.5" aria-hidden /> Remove from the board
              </button>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Takes the case off this board and deletes its history. Nothing else is touched.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* The two <select>s here stay native rather than becoming the shared Select:
   one is inside a drag-and-drop surface and the other inside a sheet, and a
   portalled listbox in either closes the thing underneath it. This is the
   shared Input's styling, applied to a native control. */
const inputCls = 'w-full rounded-md border border-input bg-card px-2.5 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  )
}
