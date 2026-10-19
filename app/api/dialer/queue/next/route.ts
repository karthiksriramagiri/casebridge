import { NextRequest, NextResponse } from 'next/server'
import { getNextAttempt, todayEastern, sortQueueCanonical } from '@/app/dialer/_lib/queue-engine'
import type { Attempt } from '@/app/dialer/_lib/queue-engine'

// POST /api/dialer/queue/next
// Pulls the rep's next leased attempt (top of their buffer) and returns it.
// The call-start flow uses the returned id as queueId.
//
// Also handles the legacy GET shape used by MiniQueue polling
// (returns up to `count` buffered attempts without leasing).
export async function POST(req: NextRequest) {
  const { rep } = await req.json().catch(() => ({}))
  if (!rep) return NextResponse.json({ error: 'rep required' }, { status: 400 })

  const attempt = await getNextAttempt(rep)
  if (!attempt) return NextResponse.json({ attempt: null })
  return NextResponse.json({ attempt, lead: attemptToLead(attempt) })
}

// GET — MiniQueue polls this to show the rep their upcoming buffer
export async function GET(req: NextRequest) {
  const rep   = req.nextUrl.searchParams.get('rep') ?? ''
  const count = parseInt(req.nextUrl.searchParams.get('count') ?? '10', 10)
  if (!rep) return NextResponse.json({ leads: [] })

  const { createClient } = await import('@supabase/supabase-js')
  const db    = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = todayEastern()

  // Refill the buffer first (so rep always has 5 ready)
  const { fillBuffer } = await import('@/app/dialer/_lib/queue-engine')
  await fillBuffer(rep, 5).catch(console.error)

  // Return current buffer (buffered + leased attempts for this rep)
  const { data } = await db.from('dialer_attempts')
    .select('*')
    .eq('plan_date', today)
    .in('status', ['buffered', 'leased'])
    .or(`buffered_for.eq.${rep},leased_by.eq.${rep}`)
    .order('buffered_at',    { ascending: true })
    .order('is_callback',    { ascending: false })
    .order('is_carryover',   { ascending: false })
    .order('priority',       { ascending: false })
    .order('attempt_number', { ascending: true })
    .order('created_at',     { ascending: true })
    .order('id',             { ascending: true })
    .limit(count)

  /* Show them in the order they will be dialed, not the order they happened
     to be buffered in — the same order as the admin queue. */
  const ordered = await sortQueueCanonical((data ?? []) as Attempt[])
  const leads = ordered.map(a => attemptToLead(a as Attempt))

  /* An empty queue has two very different causes and they looked identical to
     the rep. If this identity is not an active REP it can never be served, so
     say that instead of showing a blank list for the rest of the shift. */
  if (leads.length === 0) {
    const { data: who } = await db.from('dialer_users')
      .select('role, active')
      .eq('twilio_identity', rep)
      .maybeSingle()
    if (!who || who.role !== 'REP' || !who.active) {
      return NextResponse.json({
        leads: [],
        reason: `"${rep}" is not an active dialer rep, so the queue cannot serve it. Check the sign-in identity in dialer_users.`,
      })
    }
  }

  return NextResponse.json({ leads })
}

function attemptToLead(a: Attempt) {
  const isCallback = a.is_callback && !!a.callback_at &&
    new Date(a.callback_at) <= new Date(Date.now() + 60_000)
  return {
    // Shape matches what MiniQueue / agent page expects (QueueLead)
    id:               a.id,
    queueId:          a.id,
    contactId:        a.contact_id,
    contact_id:       a.contact_id,
    contact_name:     a.contact_name,
    name:             a.contact_name,
    phone:            a.phone,
    firm:             a.firm,
    stage_name:       a.stage_name,
    stageName:        a.stage_name,
    timezone:         a.lead_timezone,
    lead_timezone:    a.lead_timezone,
    isCallback,
    is_callback:      a.is_callback,
    callback_at:      a.callback_at,
    callbackAt:       a.callback_at,
    callbackContext:  (a as any).callback_context ?? null,
    ownerRepIdentity: a.owner_rep,
    owner_rep:        a.owner_rep,
    priority:         a.priority,
    // New fields
    block:            a.block,
    attempt_number:   a.attempt_number,
    attempts_total:   a.attempts_total,
    is_carryover:     a.is_carryover,
    due_from:         a.due_from,
    due_until:        a.due_until,
    status:           a.status,
  }
}
