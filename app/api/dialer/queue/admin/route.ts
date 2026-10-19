import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { todayEastern, sortQueueCanonical } from '@/app/dialer/_lib/queue-engine'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// GET /api/dialer/queue/admin
// Query params:
//   firm=lhp|fears
//   status=pending|buffered|leased|completed|cancelled|expired|merged
//   block=morning|afternoon|evening|night
//   exhausted=true|false  (reads dialer_lead_state)
//   limit, offset
export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams
  const firm    = sp.get('firm')    ?? ''
  const status  = sp.get('status')  ?? ''
  const block   = sp.get('block')   ?? ''
  const exhausted = sp.get('exhausted')
  const limit   = parseInt(sp.get('limit')  ?? '10000', 10)
  /* The Active tab drops completed/cancelled client-side. Sending them anyway
     cost ~1MB a refresh AND pushed the rows it wanted past the row cap — see
     the pagination note below. Filtering here is both the fix and the
     speed-up. */
  const activeOnly = sp.get('active') === '1'
  const offset  = parseInt(sp.get('offset') ?? '0',   10)

  const db    = supabaseAdmin()
  const today = todayEastern()

  // ── Exhausted filter reads lead_state, not attempts ──────────────────────
  let exhaustedContactIds: string[] | null = null
  if (exhausted === 'true') {
    const { data } = await db.from('dialer_lead_state')
      .select('contact_id').eq('exhausted', true)
    exhaustedContactIds = (data ?? []).map(r => r.contact_id)
    if (exhaustedContactIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, summary: emptySummary() })
    }
  }

  // ── Main query ────────────────────────────────────────────────────────────
  let q = db.from('dialer_attempts')
    .select('*', { count: 'exact' })
    .eq('plan_date', today)

  if (firm)   q = q.eq('firm', firm)
  if (status) q = q.eq('status', status)
  if (block)  q = q.eq('block', block)
  if (activeOnly) q = q.not('status', 'in', '(completed,cancelled,expired,merged)')
  if (exhausted === 'false') {
    // Exclude exhausted leads — join isn't directly possible; filter via NOT IN
    const { data: exh } = await db.from('dialer_lead_state')
      .select('contact_id').eq('exhausted', true)
    const ids = (exh ?? []).map(r => r.contact_id)
    if (ids.length > 0) q = q.not('contact_id', 'in', `(${ids.join(',')})`)
  }
  if (exhaustedContactIds) {
    q = q.in('contact_id', exhaustedContactIds)
  }

  q = q
    .order('due_from',       { ascending: true })   // block chronological: morning → afternoon → evening
    .order('is_callback',    { ascending: false })
    .order('is_carryover',   { ascending: false })
    .order('priority',       { ascending: false })
    .order('attempt_number', { ascending: true })
    .order('created_at',     { ascending: true })
    .order('id',             { ascending: true })   // deterministic tiebreaker

  /* PostgREST caps a response at 1000 rows no matter what .range() asks for.
     The page requests 10,000 and quietly got the first 1000 by due_from —
     the morning block, every row of it already completed or cancelled — so
     the Active tab rendered "No attempts found" while 3,180 pending leads sat
     behind the cap. Page through instead of trusting one range call. */
  let data: any[] = []
  let count: number | null = null
  let error: any = null
  for (let from = offset; from < offset + limit; from += 1000) {
    const size = Math.min(1000, offset + limit - from)
    const res = await q.range(from, from + size - 1)
    if (res.error) { error = res.error; break }
    if (count === null) count = res.count ?? null
    const batch = res.data ?? []
    data = data.concat(batch)
    if (batch.length < size) break
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* Re-order into the one queue order the floor is actually served in.

     The SQL order above is only there to decide which rows survive the row
     cap; it is not the serving order. Leads waiting to be worked go first, in
     exactly the order fillBuffer will hand them out — so the top of this list
     is the next call — and everything already dealt with keeps its place
     underneath. */
  const WAITING = new Set(['pending', 'buffered', 'leased'])
  const waiting = data.filter((r: any) => WAITING.has(r.status))
  const settled = data.filter((r: any) => !WAITING.has(r.status))
  data = [...(await sortQueueCanonical(waiting as any)) as any[], ...settled]

  // ── Summary stats via count queries (no row-limit cap) ───────────────────
  const now = new Date()
  const baseQ = () => db.from('dialer_attempts').select('*', { count: 'exact', head: true }).eq('plan_date', today)
  const activeFilter = (q: any) => q.not('status', 'in', '(cancelled,expired,merged)')

  const [
    totalRes, completedRes, bufferedRes, leasedRes,
    callbacksRes, dueNowRes,
    lhpRes, fearsRes, jmRes,
  ] = await Promise.all([
    baseQ(),
    baseQ().eq('status', 'completed'),
    baseQ().eq('status', 'buffered'),
    baseQ().eq('status', 'leased'),
    baseQ().eq('is_callback', true).not('status', 'in', '(completed,cancelled)'),
    baseQ().eq('status', 'pending').lte('due_from', now.toISOString()).gt('day_ends_at', now.toISOString()),
    activeFilter(baseQ().eq('firm', 'lhp')),
    activeFilter(baseQ().eq('firm', 'fears')),
    activeFilter(baseQ().eq('firm', 'jm')),
  ])

  // Unique leads from the current page of results
  const uniqueLeads = new Set((data ?? []).map((r: any) => r.contact_id)).size

  const summary = {
    uniqueLeads,
    totalAttempts: totalRes.count ?? 0,
    completed:     completedRes.count ?? 0,
    dueNow:        dueNowRes.count ?? 0,
    callbacks:     callbacksRes.count ?? 0,
    buffered:      bufferedRes.count ?? 0,
    leased:        leasedRes.count ?? 0,
    byFirm: {
      lhp:   lhpRes.count ?? 0,
      fears: fearsRes.count ?? 0,
      jm:    jmRes.count ?? 0,
    },
  }

  return NextResponse.json({ items: data, total: count, summary })
}

// DELETE /api/dialer/queue/admin?id=<attempt_id>
// Sets the attempt status to 'cancelled' so it won't be served.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = supabaseAdmin()
  const { error } = await db.from('dialer_attempts')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'buffered', 'leased'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function emptySummary() {
  return {
    uniqueLeads: 0, totalAttempts: 0, completed: 0, dueNow: 0,
    callbacks: 0, buffered: 0, leased: 0, byFirm: { lhp: 0, fears: 0, jm: 0 },
  }
}
