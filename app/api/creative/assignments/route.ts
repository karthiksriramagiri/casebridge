import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The assignment board, and the production queue beside it.

   Both boards and their comment threads come back in one request, because the
   page shows both and a second round-trip would only buy a second way for the
   two to disagree about what time it is.

   Every write goes through POST/PATCH/DELETE here rather than being held in
   the page, so a brief, a status move or a comment survives a reload — which
   is the whole difference between a board and a mockup.

   The table may not exist yet: the migration is run by hand. That is reported
   as `setupNeeded` rather than as a failure, and the UI says what to run.
   ═══════════════════════════════════════════════════════════════════════════ */

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const MISSING = (msg: string) =>
  /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg)

/** A column this build knows about that the database has not been given yet. */
const MISSING_COLUMN = (msg: string) =>
  /could not find the '.*' column/i.test(msg) || /column .* does not exist/i.test(msg)

const SETUP =
  'Run supabase/migration_creative_assignments.sql in the Supabase SQL editor to create the assignment tables.'

/** The shape the board renders. Dates are ISO days; the UI never parses more. */
const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : '')

export async function GET() {
  const s = db()
  if (!s) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })

  const [a, t, c] = await Promise.all([
    s.from('creative_assignments').select('*').order('sort_order', { ascending: true }),
    s.from('creative_tasks').select('*').order('sort_order', { ascending: true }),
    s.from('creative_comments').select('*').order('created_at', { ascending: true }),
  ])

  const err = a.error ?? t.error ?? c.error
  if (err) {
    if (MISSING(err.message)) {
      return NextResponse.json({ assignments: [], tasks: [], setupNeeded: true, error: SETUP })
    }
    return NextResponse.json({ assignments: [], tasks: [], error: err.message }, { status: 500 })
  }

  const threads = new Map<string, any[]>()
  for (const row of c.data ?? []) {
    const key = `${row.parent_kind}:${row.parent_id}`
    const list = threads.get(key) ?? []
    list.push({ id: row.id, author: row.author, text: row.text, at: row.created_at, stage: row.stage ?? undefined })
    threads.set(key, list)
  }

  return NextResponse.json({
    assignments: (a.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      angle: r.angle ?? '',
      status: r.status,
      notes: r.notes ?? '',
      sourceCreativeId: r.source_ad_id ?? undefined,
      firm: r.firm ?? undefined,
      format: r.format ?? undefined,
      visualCode: r.visual_code ?? undefined,
      verbalCode: r.verbal_code ?? undefined,
      batch: r.batch ?? undefined,
      priority: r.priority ?? 3,
      benchmarkUrl: r.benchmark_url ?? undefined,
      benchmarkName: r.benchmark_name ?? undefined,
      script: r.script ?? undefined,
      order: r.sort_order ?? 0,
      createdAt: day(r.created_at),
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      comments: threads.get(`assignment:${r.id}`) ?? [],
    })),
    tasks: (t.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      status: r.status,
      notes: r.notes ?? '',
      disclaimer: r.disclaimer ?? undefined,
      sourceCreativeId: r.source_ad_id ?? undefined,
      firm: r.firm ?? undefined,
      format: r.format ?? undefined,
      visualCode: r.visual_code ?? undefined,
      verbalCode: r.verbal_code ?? undefined,
      batch: r.batch ?? undefined,
      priority: r.priority ?? 3,
      script: r.script ?? undefined,
      benchmarkUrl: r.benchmark_url ?? undefined,
      benchmarkName: r.benchmark_name ?? undefined,
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      order: r.sort_order ?? 0,
      createdAt: day(r.created_at),
      doneAt: r.done_at ? day(r.done_at) : undefined,
      comments: threads.get(`task:${r.id}`) ?? [],
    })),
    setupNeeded: false,
    error: null,
  })
}

/* POST — create an assignment, a task, or a comment on either.
   `kind` picks which; everything else is that kind's own fields. */
export async function POST(req: NextRequest) {
  const s = db()
  if (!s) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const kind = String(body.kind ?? 'assignment')

  if (kind === 'comment') {
    const parentKind = body.parentKind === 'task' ? 'task' : 'assignment'
    const text = String(body.text ?? '').trim()
    if (!body.parentId || !text) {
      return NextResponse.json({ error: 'parentId and text are required.' }, { status: 400 })
    }
    const stage = ['v1', 'v2', 'final'].includes(String(body.stage)) ? String(body.stage) : null
    const base = { parent_kind: parentKind, parent_id: body.parentId, author: String(body.author ?? 'admin'), text }

    /* `stage` is a later column, and this runs against databases that have
       not had it added yet. Losing which version a note was about is a
       smaller harm than losing the note, so a missing column retries without
       it — and the moment the column exists, grouping starts working on its
       own with no code change. */
    let { data, error } = await s.from('creative_comments').insert({ ...base, stage })
      .select('id, author, text, created_at, stage').single()

    if (error && MISSING_COLUMN(error.message)) {
      ;({ data, error } = await s.from('creative_comments').insert(base)
        .select('id, author, text, created_at').single())
    }
    if (error || !data) return fail(error?.message ?? 'The comment was not saved.')
    return NextResponse.json({
      comment: { id: data.id, author: data.author, text: data.text, at: data.created_at, stage: (data as any).stage ?? undefined },
    })
  }

  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })

  if (kind === 'task') {
    const row: Record<string, unknown> = {
      title,
      type: String(body.type ?? 'Resize Images'),
      status: String(body.status ?? 'To Do'),
      notes: String(body.notes ?? ''),
      disclaimer: body.disclaimer ?? null,
      source_ad_id: body.sourceCreativeId ?? null,
      firm: body.firm ?? null,
      format: body.format ?? null,
      visual_code: upperCode(body.visualCode),
      verbal_code: upperCode(body.verbalCode),
      batch: body.batch ? String(body.batch).trim() : null,
      priority: clampPriority(body.priority),
      script: body.script ?? null,
      benchmark_url: body.benchmarkUrl ?? null,
      benchmark_name: body.benchmarkName ?? null,
      sort_order: Number(body.order ?? 0),
      created_by: body.createdBy ?? null,
    }
    let { data, error } = await s.from('creative_tasks').insert(row).select('id').single()
    while (error && MISSING_COLUMN(error.message)) {
      const col = error.message.match(/'([a-z_]+)' column/i)?.[1] ?? error.message.match(/column "?([a-z_]+)"?/i)?.[1]
      if (!col || !(col in row)) break
      delete row[col]
      ;({ data, error } = await s.from('creative_tasks').insert(row).select('id').single())
    }
    if (error || !data) return fail(error?.message ?? 'The task was not saved.')
    return NextResponse.json({ id: data.id })
  }

  /* Same tolerance as comments: a column this build knows about may not be in
     the database yet, and a brief is worth saving without its script. */
  const row: Record<string, unknown> = {
      title,
      type: String(body.type ?? 'Double Down'),
      angle: String(body.angle ?? ''),
      status: String(body.status ?? 'Assigned'),
      notes: String(body.notes ?? ''),
      source_ad_id: body.sourceCreativeId ?? null,
      firm: body.firm ?? null,
      format: body.format ?? null,
      /* Stored upper-case so a code typed as "a3" still joins to the angle
         reports, which only ever speak in capitals. */
      visual_code: upperCode(body.visualCode),
      verbal_code: upperCode(body.verbalCode),
      batch: body.batch ? String(body.batch).trim() : null,
      priority: clampPriority(body.priority),
      benchmark_url: body.benchmarkUrl ?? null,
      benchmark_name: body.benchmarkName ?? null,
      script: body.script ?? null,
    sort_order: Number(body.order ?? 0),
    created_by: body.createdBy ?? null,
  }

  let { data, error } = await s.from('creative_assignments').insert(row).select('id').single()
  while (error && MISSING_COLUMN(error.message)) {
    const col = error.message.match(/'([a-z_]+)' column/i)?.[1] ?? error.message.match(/column "?([a-z_]+)"?/i)?.[1]
    if (!col || !(col in row)) break
    delete row[col]
    ;({ data, error } = await s.from('creative_assignments').insert(row).select('id').single())
  }
  if (error || !data) return fail(error?.message ?? 'The assignment was not saved.')
  return NextResponse.json({ id: data.id })
}

/* PATCH — update one assignment or task. Only the fields present are written,
   so a status move does not have to send the whole row back. */
export async function PATCH(req: NextRequest) {
  const s = db()
  if (!s) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  const task = body.kind === 'task'

  const patch: Record<string, unknown> = {}
  const set = (key: string, value: unknown) => { if (value !== undefined) patch[key] = value }
  set('title', body.title)
  set('type', body.type)
  set('status', body.status)
  set('notes', body.notes)
  set('sort_order', body.order)
  if (task) {
    set('disclaimer', body.disclaimer)
    set('firm', body.firm)
    set('format', body.format)
    set('batch', body.batch)
    set('script', body.script)
    set('benchmark_url', body.benchmarkUrl)
    set('benchmark_name', body.benchmarkName)
    set('attachments', body.attachments)
    if (body.priority !== undefined) patch.priority = clampPriority(body.priority)
    if (body.visualCode !== undefined) patch.visual_code = upperCode(body.visualCode)
    if (body.verbalCode !== undefined) patch.verbal_code = upperCode(body.verbalCode)
    /* A task that leaves Done loses its completion stamp — otherwise a row
       reopened by mistake keeps claiming it finished yesterday. */
    if (body.status !== undefined) patch.done_at = body.status === 'Done' ? new Date().toISOString() : null
  } else {
    set('angle', body.angle)
    set('firm', body.firm)
    set('format', body.format)
    set('batch', body.batch)
    if (body.priority !== undefined) patch.priority = clampPriority(body.priority)
    set('benchmark_url', body.benchmarkUrl)
    set('benchmark_name', body.benchmarkName)
    set('script', body.script)
    set('attachments', body.attachments)
    if (body.visualCode !== undefined) patch.visual_code = upperCode(body.visualCode)
    if (body.verbalCode !== undefined) patch.verbal_code = upperCode(body.verbalCode)
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const { error } = await s.from(task ? 'creative_tasks' : 'creative_assignments').update(patch).eq('id', id)
  if (error) return fail(error.message)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = db()
  if (!s) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  const id = req.nextUrl.searchParams.get('id') ?? ''
  const kind = req.nextUrl.searchParams.get('kind') ?? 'assignment'
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  if (kind === 'comment') {
    const { error } = await s.from('creative_comments').delete().eq('id', id)
    if (error) return fail(error.message)
    return NextResponse.json({ ok: true })
  }

  const table = kind === 'task' ? 'creative_tasks' : 'creative_assignments'
  /* Take the thread with it — a comment whose parent is gone is unreachable
     from every screen and would sit in the table forever. */
  await s.from('creative_comments').delete().eq('parent_kind', kind === 'task' ? 'task' : 'assignment').eq('parent_id', id)
  const { error } = await s.from(table).delete().eq('id', id)
  if (error) return fail(error.message)
  return NextResponse.json({ ok: true })
}

/** 1–5, with anything unparseable landing in the middle rather than erroring. */
function clampPriority(v: unknown): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

/** A hook code, normalised — or null, which is how "not set" is stored. */
function upperCode(v: unknown): string | null {
  const code = String(v ?? '').trim().toUpperCase()
  return /^[A-L][0-9]{1,3}$/.test(code) ? code : null
}

function fail(message: string) {
  if (MISSING(message)) return NextResponse.json({ error: SETUP, setupNeeded: true }, { status: 503 })
  return NextResponse.json({ error: message }, { status: 500 })
}
