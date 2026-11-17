import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { isMiaStatus, type MiaStatus } from '@/app/teams/mia/_lib/types'
import { announce } from '@/lib/mia/announce'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The MIA board.

   Everything the board does goes through here: reading it, adding a case,
   moving a card, claiming one, editing and deleting.

   Two rules decide who may do what, and they are enforced here rather than
   in the page — a page can be bypassed, a route cannot:

     adding and deleting   admins only. The board is a list of work handed
                           out, and a rep inventing their own entries makes
                           it something else.
     moving and claiming   anybody signed in. That is the whole job, and a
                           rep who has just got someone back on the phone
                           should not have to ask permission to say so.

   The table may not exist yet — the migration is run by hand — which is
   reported as `setupNeeded` rather than as a failure, so the page can say
   what to run instead of showing an empty board as though nothing were on it.
   ═══════════════════════════════════════════════════════════════════════════ */

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MISSING = (msg: string) =>
  /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg) || /schema cache/i.test(msg)

const SETUP = 'Run supabase/migration_mia_center.sql in the Supabase SQL editor to create the MIA board tables.'


/** Who is asking, and may they add or delete? */
async function viewer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await admin
    .from('profiles').select('name, role').eq('id', user.id).single()
  return {
    id: user.id,
    name: (profile?.name || '').trim() || 'Someone',
    isAdmin: profile?.role === 'admin',
  }
}

const clean = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)

type Row = Record<string, any>

const toCase = (r: Row, firmName: (id: string | null) => string | null, repName: (id: string | null) => string | null) => ({
  id: String(r.id),
  name: r.name ?? '',
  phone: r.phone ?? null,
  email: r.email ?? null,
  firmId: r.firm_id ?? null,
  firmName: firmName(r.firm_id ?? null),
  leadId: r.lead_id ?? null,
  status: (isMiaStatus(r.status) ? r.status : 'mia') as MiaStatus,
  order: Number(r.sort_order ?? 0),
  ownerId: r.owner_id ?? null,
  ownerName: repName(r.owner_id ?? null),
  closerId: r.closer_id ?? null,
  /* The stored name wins over the looked-up one: a closer who has since left
     still has a name on the row and no longer has a profile. */
  closerName: r.closer ?? repName(r.closer_id ?? null),
  reconnectedById: r.reconnected_by_id ?? null,
  reconnectedByName: r.reconnected_by ?? repName(r.reconnected_by_id ?? null),
  reconnectedAt: r.reconnected_at ?? null,
  note: r.note ?? '',
  createdBy: r.created_by ?? null,
  createdAt: String(r.created_at ?? ''),
  updatedAt: String(r.updated_at ?? ''),
  movedAt: String(r.moved_at ?? r.created_at ?? ''),
})

/** One event row. Written on every change — see the table comment. */
async function logEvent(e: {
  caseId: string
  kind: string
  fromStatus?: string | null
  toStatus?: string | null
  detail?: string
  actorId: string
  actorName: string
}) {
  await admin.from('mia_case_events').insert({
    case_id: e.caseId,
    kind: e.kind,
    from_status: e.fromStatus ?? null,
    to_status: e.toStatus ?? null,
    detail: e.detail ?? '',
    actor_id: e.actorId,
    actor_name: e.actorName,
  })
}

/* ── GET: the whole board ────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const me = await viewer()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caseId = req.nextUrl.searchParams.get('events')
  if (caseId) {
    const { data, error } = await admin
      .from('mia_case_events').select('*').eq('case_id', caseId)
      .order('created_at', { ascending: false }).limit(100)
    if (error) return NextResponse.json({ events: [], error: error.message })
    return NextResponse.json({
      events: (data ?? []).map((r) => ({
        id: r.id, caseId: r.case_id, kind: r.kind,
        fromStatus: r.from_status, toStatus: r.to_status,
        detail: r.detail ?? '', actorName: r.actor_name ?? '', createdAt: r.created_at,
      })),
    })
  }

  const [cases, firms, profiles] = await Promise.all([
    admin.from('mia_cases').select('*').order('sort_order', { ascending: true }),
    admin.from('firms').select('id, name'),
    admin.from('profiles').select('id, name'),
  ])

  if (cases.error) {
    if (MISSING(cases.error.message)) {
      return NextResponse.json({ cases: [], firms: [], reps: [], viewer: me, setupNeeded: true, setup: SETUP })
    }
    return NextResponse.json({ cases: [], firms: [], reps: [], viewer: me, error: cases.error.message }, { status: 500 })
  }

  const firmById = new Map((firms.data ?? []).map((f) => [f.id, f.name as string]))
  const repById = new Map((profiles.data ?? []).map((p) => [p.id, (p.name as string) || '']))

  return NextResponse.json({
    cases: (cases.data ?? []).map((r) =>
      toCase(r, (id) => (id ? firmById.get(id) ?? null : null), (id) => (id ? repById.get(id) ?? null : null))),
    firms: (firms.data ?? []).map((f) => ({ id: f.id, name: f.name })),
    /* Only people with a name — the table carries a couple of blank rows
       that would show as an empty option in the owner picker. */
    reps: (profiles.data ?? []).filter((p) => (p.name || '').trim()).map((p) => ({ id: p.id, name: p.name })),
    viewer: me,
    setupNeeded: false,
  })
}

/* ── POST: add a case ────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  const me = await viewer()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!me.isAdmin) {
    return NextResponse.json({ error: 'Only an admin can add a case to the board.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const name = clean(body.name, 120)
  if (!name) return NextResponse.json({ error: 'A name is required.' }, { status: 400 })

  const status: MiaStatus = isMiaStatus(body.status) ? body.status : 'mia'

  /* New cards go to the top of their column. A fresh MIA is the most urgent
     thing on the board, and the bottom is where cards go to be forgotten. */
  const { data: top } = await admin
    .from('mia_cases').select('sort_order').eq('status', status)
    .order('sort_order', { ascending: true }).limit(1)
  const sort = (top?.[0]?.sort_order ?? 0) - 1

  const row = {
    name,
    phone: clean(body.phone, 40) || null,
    email: clean(body.email, 160) || null,
    firm_id: body.firmId || null,
    lead_id: body.leadId || null,
    status,
    sort_order: sort,
    owner_id: body.ownerId || null,
    closer_id: body.closerId || null,
    closer: clean(body.closer, 120) || null,
    note: clean(body.note, 2000),
    created_by: me.id,
  }

  const { data, error } = await admin.from('mia_cases').insert(row).select('*').single()
  if (error) {
    if (MISSING(error.message)) return NextResponse.json({ setupNeeded: true, error: SETUP }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logEvent({
    caseId: data.id, kind: 'created', toStatus: status,
    detail: row.closer ? `Added to ${status} · closed by ${row.closer}` : `Added to ${status}`,
    actorId: me.id, actorName: me.name,
  })

  /* After the insert, never before: the channel should only hear about a
     case that is actually on the board. The firm is looked up for the
     message rather than stored on the row — the card holds an id and Slack
     needs a name.

     Awaited rather than left floating, because this runs in a serverless
     function that can be frozen the moment the response is returned, which
     drops an in-flight request. `announce` swallows its own failures, so
     this cannot turn a Slack problem into a failed add. */
  let firmName: string | null = null
  if (row.firm_id) {
    const { data: firm } = await admin.from('firms').select('name').eq('id', row.firm_id).maybeSingle()
    firmName = (firm?.name as string) ?? null
  }
  await announce({
    name: row.name,
    phone: row.phone,
    firmName,
    closer: row.closer,
    note: row.note,
    addedBy: me.name,
  })

  return NextResponse.json({ id: data.id })
}

/* ── PATCH: move, claim, edit ────────────────────────────────────────── */

export async function PATCH(req: NextRequest) {
  const me = await viewer()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = clean(body.id, 60)
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { data: before, error: readErr } = await admin.from('mia_cases').select('*').eq('id', id).single()
  if (readErr || !before) return NextResponse.json({ error: 'That case is no longer on the board.' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const events: { kind: string; from?: string; to?: string; detail: string }[] = []

  /* Names are stored alongside ids throughout this table, so that a rep who
     leaves still reads as a person rather than a dangling uuid. */
  const { data: repRows } = await admin.from('profiles').select('id, name')
  const repNameById = new Map((repRows ?? []).map((r: any) => [String(r.id), String(r.name ?? '').trim()]))

  if (body.status !== undefined) {
    if (!isMiaStatus(body.status)) return NextResponse.json({ error: 'Unknown column.' }, { status: 400 })
    if (body.status !== before.status) {
      patch.status = body.status
      /* Only a real column change restamps this. Reordering inside a column
         is not progress, and letting it reset the clock would hide a card
         that has been sitting untouched for a week. */
      patch.moved_at = new Date().toISOString()
      events.push({ kind: 'moved', from: before.status, to: body.status, detail: `${before.status} → ${body.status}` })
    }
  }
  if (body.order !== undefined) patch.sort_order = Number(body.order) || 0

  if (body.ownerId !== undefined && body.ownerId !== before.owner_id) {
    patch.owner_id = body.ownerId || null
    events.push({
      kind: 'claimed',
      detail: body.ownerId ? (body.ownerId === me.id ? `${me.name} took it on` : 'Owner changed') : 'Owner cleared',
    })
  }

  /* Who got them back on the phone.

     Recorded against the case rather than inferred from the history, because
     a quarter of the commission hangs on it: the trail says who dragged the
     card, which is not the same question as who made the call. A rep who
     reconnects a case somebody else closed earns 25% of that case's tier —
     see lib/mia/reconnect-bonus.ts — so this field is a pay record and is
     written deliberately, by hand. */
  if (body.reconnectedById !== undefined && body.reconnectedById !== before.reconnected_by_id) {
    const repId = clean(body.reconnectedById, 60) || null
    patch.reconnected_by_id = repId
    patch.reconnected_by = repId ? (repNameById.get(repId) ?? null) : null
    /* Cleared as well as set: an entry made in error must not leave a date
       behind that pay would read as an unpaid bonus. */
    patch.reconnected_at = repId ? new Date().toISOString() : null
    events.push({
      kind: 'reconnected',
      detail: repId
        ? `Reconnected by ${repNameById.get(repId) ?? 'a rep'}`
        : 'Reconnected-by cleared',
    })
  }

  for (const [key, col, max] of [['name', 'name', 120], ['phone', 'phone', 40], ['email', 'email', 160], ['note', 'note', 2000]] as const) {
    if (body[key] !== undefined) {
      const v = clean(body[key], max)
      if (v !== (before[col] ?? '')) {
        patch[col] = key === 'note' || key === 'name' ? v : v || null
        if (key === 'note') events.push({ kind: 'note', detail: v.slice(0, 180) })
      }
    }
  }
  if (body.firmId !== undefined) patch.firm_id = body.firmId || null

  const { error } = await admin.from('mia_cases').update(patch).eq('id', id)
  if (error) {
    /* The reconnected-by columns are added by their own migration. Until it
       is run the field simply cannot be written, and saying which file to
       run is more use than the raw Postgres complaint. */
    if (/reconnected_by|reconnected_at/.test(error.message || '')) {
      return NextResponse.json({
        error: 'Run supabase/migration_mia_reconnect.sql in the Supabase SQL editor to record who reconnected a case.',
      }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const e of events) {
    await logEvent({ caseId: id, kind: e.kind, fromStatus: e.from, toStatus: e.to, detail: e.detail, actorId: me.id, actorName: me.name })
  }
  return NextResponse.json({ ok: true })
}

/* ── DELETE: take a case off the board ───────────────────────────────── */

export async function DELETE(req: NextRequest) {
  const me = await viewer()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!me.isAdmin) {
    return NextResponse.json({ error: 'Only an admin can remove a case from the board.' }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  /* The events go with it, by the cascade on the table. A trail pointing at
     a card nobody can open is not a trail. */
  const { error } = await admin.from('mia_cases').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
