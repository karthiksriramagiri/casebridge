import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The watch list, the kill list and the launch queue.

   All three come back in one GET because every page that reads one reads at
   least one other — the Execute view reads all three at once — and a second
   round trip would only buy a second way for them to disagree.

   These boards used to live in React state, which meant a refresh threw the
   day's decisions away. Writes go through here now so they survive it.

   The tables may not exist yet: the migration is run by hand. That is
   reported as `setupNeeded` rather than as a failure, and the UI says what to
   run instead of showing an empty board as though nothing had been decided.
   ═══════════════════════════════════════════════════════════════════════════ */

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const MISSING = (msg: string) =>
  /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg)

const SETUP =
  'Run supabase/migration_creative_board.sql and migration_creative_board_2.sql in the Supabase SQL editor to create the board tables.'

const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : '')

/* ── Row ⇄ board shapes ──────────────────────────────────────────────────── */

type Row = Record<string, unknown>

const toWatch = (r: Row) => ({
  id: String(r.id),
  creativeId: String(r.creative_id),
  date: day(r.watch_date as string),
  reason: (r.reason as string) ?? '',
  decision: (r.decision as 'WATCH' | 'KILL' | null) ?? undefined,
  removed: Boolean(r.removed),
})

const toKill = (r: Row) => ({
  id: String(r.id),
  creativeId: String(r.creative_id),
  addedAt: day(r.added_at as string),
  reason: (r.reason as string) ?? '',
  status: (r.status as 'pending' | 'done') ?? 'pending',
  doneAt: r.done_at ? day(r.done_at as string) : undefined,
  kind: (r.kind as 'kill' | 'fatigue') ?? 'kill',
  /* Set when someone takes the ad off the Relaunch / Fatigue list. The kill
     is untouched — only the archive stops listing it. */
  archiveHiddenAt: r.archive_hidden_at ? String(r.archive_hidden_at) : undefined,
})

const toExclusion = (r: Row) => ({
  id: String(r.id),
  creativeId: String(r.creative_id),
  day: day(r.excluded_on as string),
})

const toNotification = (r: Row) => ({
  id: String(r.id),
  to: (r.recipient as string) ?? 'admin',
  text: (r.body as string) ?? '',
  href: (r.href as string) ?? '',
  at: String(r.created_at ?? ''),
  read: Boolean(r.read),
})

const toLaunch = (r: Row) => ({
  id: String(r.id),
  assignmentId: (r.assignment_id as string) ?? undefined,
  sourceCreativeId: (r.source_creative_id as string) ?? undefined,
  name: (r.name as string) ?? '',
  angle: (r.angle as string) ?? '',
  campaign: (r.campaign as string) ?? '',
  convention: (r.convention as string) ?? '',
  tags: (r.tags as object) ?? { resize: false, disclaimer: null, asIs: false },
  date: day(r.launch_date as string),
  dailyBudget: Number(r.daily_budget ?? 0),
  status: (r.status as 'pending' | 'done' | 'cancelled') ?? 'pending',
  doneAt: r.done_at ? day(r.done_at as string) : undefined,
  isNewTestBatch: Boolean(r.is_new_test_batch),
  requestedBy: (r.requested_by as string) ?? 'manual',
})

/** Only the fields a caller may set, mapped to their columns. Anything else
    in the body is ignored rather than trusted into an update. */
const WATCH_COLS: Record<string, string> = {
  creativeId: 'creative_id', date: 'watch_date', reason: 'reason',
  decision: 'decision', removed: 'removed',
}
const KILL_COLS: Record<string, string> = {
  creativeId: 'creative_id', addedAt: 'added_at', reason: 'reason',
  status: 'status', doneAt: 'done_at', kind: 'kind',
  archiveHiddenAt: 'archive_hidden_at',
}
const LAUNCH_COLS: Record<string, string> = {
  assignmentId: 'assignment_id', sourceCreativeId: 'source_creative_id', name: 'name',
  angle: 'angle', campaign: 'campaign', convention: 'convention', tags: 'tags',
  date: 'launch_date', dailyBudget: 'daily_budget', status: 'status',
  doneAt: 'done_at', isNewTestBatch: 'is_new_test_batch', requestedBy: 'requested_by',
}

const EXCLUSION_COLS: Record<string, string> = {
  creativeId: 'creative_id', day: 'excluded_on', createdBy: 'created_by',
}
const NOTIFICATION_COLS: Record<string, string> = {
  to: 'recipient', text: 'body', href: 'href', read: 'read',
}

const BOARDS = {
  watch:         { table: 'creative_watch',         cols: WATCH_COLS,        to: toWatch,        order: 'watch_date' },
  kill:          { table: 'creative_kill',          cols: KILL_COLS,         to: toKill,         order: 'added_at' },
  launches:      { table: 'creative_launches',      cols: LAUNCH_COLS,       to: toLaunch,       order: 'launch_date' },
  exclusions:    { table: 'creative_exclusions',    cols: EXCLUSION_COLS,    to: toExclusion,    order: 'excluded_on' },
  notifications: { table: 'creative_notifications', cols: NOTIFICATION_COLS, to: toNotification, order: 'created_at' },
} as const

type BoardKey = keyof typeof BOARDS

const columnsFrom = (board: BoardKey, body: Record<string, unknown>) => {
  const map = BOARDS[board].cols
  const out: Record<string, unknown> = {}
  for (const [key, col] of Object.entries(map)) {
    if (key in body) out[col] = body[key] === undefined ? null : body[key]
  }
  return out
}

const empty = { watch: [], kill: [], launches: [], exclusions: [], notifications: [] }

/* ── GET: all three boards ───────────────────────────────────────────────── */

export async function GET() {
  const supabase = db()
  if (!supabase) return NextResponse.json({ ...empty, setupNeeded: true, setup: 'Supabase env vars are missing.' })

  const [w, k, l, x, n] = await Promise.all([
    supabase.from('creative_watch').select('*').order('watch_date', { ascending: false }),
    supabase.from('creative_kill').select('*').order('added_at', { ascending: false }),
    supabase.from('creative_launches').select('*').order('launch_date', { ascending: false }),
    supabase.from('creative_exclusions').select('*').order('excluded_on', { ascending: false }),
    /* The bell only ever shows the recent end of the list, and an unbounded
       read grows forever. */
    supabase.from('creative_notifications').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  /* Each table answers for itself.

     Failing the whole request because one table is missing would mean the
     day a new migration lands and has not been run yet, the boards that do
     exist go blank — the working lists punished for the absence of a table
     they have nothing to do with. A missing table reports its own absence
     and returns nothing; the rest come back as usual. */
  const missing: string[] = []
  const errors: string[] = []
  const rows = <T,>(
    res: { data: Row[] | null; error: { message: string } | null },
    table: string,
    to: (r: Row) => T,
  ): T[] => {
    if (!res.error) return (res.data ?? []).map(to)
    if (MISSING(res.error.message)) missing.push(table)
    else errors.push(`${table}: ${res.error.message}`)
    return []
  }

  const body = {
    watch:         rows(w, 'creative_watch', toWatch),
    kill:          rows(k, 'creative_kill', toKill),
    launches:      rows(l, 'creative_launches', toLaunch),
    exclusions:    rows(x, 'creative_exclusions', toExclusion),
    notifications: rows(n, 'creative_notifications', toNotification),
  }

  return NextResponse.json({
    ...body,
    ...(missing.length ? { setupNeeded: true, setup: `${SETUP} Missing: ${missing.join(', ')}.` } : {}),
    ...(errors.length ? { error: errors.join(' · ') } : {}),
  })
}

/* ── POST / PATCH / DELETE: one row on one board ─────────────────────────── */

function board(req: NextRequest): BoardKey | null {
  const b = req.nextUrl.searchParams.get('board')
  return b && b in BOARDS ? (b as BoardKey) : null
}

export async function POST(req: NextRequest) {
  const b = board(req)
  if (!b) return NextResponse.json({ error: `board must be one of ${Object.keys(BOARDS).join(', ')}` }, { status: 400 })
  const supabase = db()
  if (!supabase) return NextResponse.json({ error: 'Supabase env vars are missing.' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const { data, error } = await supabase.from(BOARDS[b].table)
    .insert(columnsFrom(b, body))
    .select('*')
    .single()

  if (error) {
    if (MISSING(error.message)) return NextResponse.json({ setupNeeded: true, setup: SETUP }, { status: 503 })
    /* A row already exists for this ad on this day.

       Treated as a re-add rather than an error, and the posted values are
       written over the row that is there. Simply handing the old row back
       would resurrect whatever state it was left in — a watch row taken off
       the list earlier carries `removed`, so re-adding it would appear to
       work and then vanish on the next poll. */
    if (/duplicate key/i.test(error.message)) {
      const key = b === 'watch' ? 'watch_date' : b === 'exclusions' ? 'excluded_on' : 'added_at'
      const on = b === 'watch' ? body.date : b === 'exclusions' ? body.day : body.addedAt
      const { data: revived, error: reviveError } = await supabase.from(BOARDS[b].table)
        .update({ ...columnsFrom(b, body), updated_at: new Date().toISOString() })
        .eq('creative_id', body.creativeId).eq(key, on)
        .select('*').maybeSingle()
      if (revived && !reviveError) return NextResponse.json({ item: BOARDS[b].to(revived), existed: true })
      /* The table may predate updated_at; fall back to reading it back. */
      const { data: existing } = await supabase.from(BOARDS[b].table)
        .select('*').eq('creative_id', body.creativeId).eq(key, on).maybeSingle()
      if (existing) return NextResponse.json({ item: BOARDS[b].to(existing), existed: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: BOARDS[b].to(data) })
}

export async function PATCH(req: NextRequest) {
  const b = board(req)
  if (!b) return NextResponse.json({ error: `board must be one of ${Object.keys(BOARDS).join(', ')}` }, { status: 400 })
  const supabase = db()
  if (!supabase) return NextResponse.json({ error: 'Supabase env vars are missing.' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const columns = columnsFrom(b, body)
  if (Object.keys(columns).length === 0) return NextResponse.json({ ok: true, unchanged: true })
  columns.updated_at = new Date().toISOString()

  const { data, error } = await supabase.from(BOARDS[b].table)
    .update(columns).eq('id', id).select('*').single()

  if (error) {
    if (MISSING(error.message)) return NextResponse.json({ setupNeeded: true, setup: SETUP }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: BOARDS[b].to(data) })
}

export async function DELETE(req: NextRequest) {
  const b = board(req)
  if (!b) return NextResponse.json({ error: `board must be one of ${Object.keys(BOARDS).join(', ')}` }, { status: 400 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = db()
  if (!supabase) return NextResponse.json({ error: 'Supabase env vars are missing.' }, { status: 500 })

  const { error } = await supabase.from(BOARDS[b].table).delete().eq('id', id)
  if (error) {
    if (MISSING(error.message)) return NextResponse.json({ setupNeeded: true, setup: SETUP }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
