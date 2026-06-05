import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { clockInIsLate, billableHoursForDay } from '@/lib/pay'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK =
  process.env.SLACK_TIMECLOCK_WEBHOOK ||
  process.env.SLACK_TASK_REMINDERS

async function sendSlack(text: string) {
  if (!SLACK_WEBHOOK) return
  await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {})
}

function fmtTimeEST(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET /api/teams/timeclock?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const date = new URL(req.url).searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const { data: entries, error } = await admin
    .from('time_entries')
    .select('id, clock_in, clock_out')
    .eq('profile_id', user.id)
    .eq('date', date)
    .order('clock_in', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: entries || [] })
}

// POST /api/teams/timeclock — clock in
export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)

  // Check if already clocked in
  const { data: open } = await admin
    .from('time_entries')
    .select('id, clock_in')
    .eq('profile_id', user.id)
    .eq('date', today)
    .is('clock_out', null)
    .maybeSingle()

  if (open) return NextResponse.json({ error: 'Already clocked in', entry: open }, { status: 409 })

  const clockInTime = new Date().toISOString()

  const { data: entry, error } = await admin
    .from('time_entries')
    .insert({ profile_id: user.id, date: today, clock_in: clockInTime })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await admin.from('profiles').select('name').eq('id', user.id).single()
  const name = profile?.name || 'Worker'
  const { late, minutesLate } = clockInIsLate(clockInTime)
  const timeStr = fmtTimeEST(clockInTime)

  if (late) {
    const hrs = Math.floor(minutesLate / 60)
    const mins = minutesLate % 60
    const lateStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
    await sendSlack(`⚠️ *${name}* clocked in at ${timeStr} EST — *LATE by ${lateStr}* (shift starts 2:00 PM)`)
  } else {
    await sendSlack(`✅ *${name}* clocked in at ${timeStr} EST — on time`)
  }

  return NextResponse.json({ entry })
}

// PATCH /api/teams/timeclock — clock out
export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const clockOutTime = new Date().toISOString()

  const { data: entry, error } = await admin
    .from('time_entries')
    .update({ clock_out: clockOutTime })
    .eq('id', id)
    .eq('profile_id', user.id)
    .is('clock_out', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'No open entry found' }, { status: 404 })

  const { data: profile } = await admin.from('profiles').select('name').eq('id', user.id).single()
  const { data: dayEntries } = await admin
    .from('time_entries')
    .select('clock_in, clock_out')
    .eq('profile_id', user.id)
    .eq('date', entry.date)

  const billable = billableHoursForDay(dayEntries || [])
  const overtime = Math.max(0, billable - 9)
  const name = profile?.name || 'Worker'
  const timeStr = fmtTimeEST(clockOutTime)

  let msg = `🕐 *${name}* clocked out at ${timeStr} EST — ${billable.toFixed(2)}h billable today`
  if (overtime > 0) msg += ` (${overtime.toFixed(2)}h OT @ $6/hr)`
  await sendSlack(msg)

  return NextResponse.json({ entry })
}
