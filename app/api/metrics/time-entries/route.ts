import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clockInIsLate, billableHoursForDay } from '@/lib/pay'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SLACK_WEBHOOK        = process.env.SLACK_TIMECLOCK_WEBHOOK
const SLACK_PABLO_WEBHOOK  = process.env.SLACK_PABLO_TIMECLOCK_WEBHOOK

async function sendSlack(text: string, workerName?: string) {
  const isPablo = workerName && workerName.toLowerCase().includes('pablo')
  // Always send to Pablo's dedicated webhook when it's him
  if (isPablo && SLACK_PABLO_WEBHOOK) {
    await fetch(SLACK_PABLO_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {})
  }
  // Also send to the general timeclock channel if configured
  if (SLACK_WEBHOOK && !isPablo) {
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {})
  }
}

function fmtTimeEST(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

// GET /api/metrics/time-entries?date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'rep')
    .order('name')

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const { data: rates } = await supabase
    .from('worker_pay_rates')
    .select('profile_id, hourly_rate')
    .order('effective_from', { ascending: false })

  const hourlyRateMap: Record<string, number> = {}
  for (const r of rates || []) {
    if (!(r.profile_id in hourlyRateMap)) hourlyRateMap[r.profile_id] = r.hourly_rate ?? 5
  }

  const { data: entries, error: eErr } = await supabase
    .from('time_entries')
    .select('id, profile_id, date, clock_in, clock_out, note')
    .eq('date', date)
    .order('clock_in', { ascending: true })

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  const entriesByProfile: Record<string, any[]> = {}
  for (const e of entries || []) {
    if (!entriesByProfile[e.profile_id]) entriesByProfile[e.profile_id] = []
    entriesByProfile[e.profile_id].push(e)
  }

  const workers = (profiles || []).map(p => ({
    profileId: p.id,
    name: p.name,
    hourlyRate: hourlyRateMap[p.id] ?? 5,
    entries: entriesByProfile[p.id] ?? [],
  }))

  return NextResponse.json({ date, workers })
}

// POST — clock in
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { profile_id, date } = body

  if (!profile_id) return NextResponse.json({ error: 'profile_id required' }, { status: 400 })

  const entryDate = date || new Date().toISOString().slice(0, 10)

  // Check if already clocked in
  const { data: open } = await supabase
    .from('time_entries')
    .select('id, clock_in')
    .eq('profile_id', profile_id)
    .eq('date', entryDate)
    .is('clock_out', null)
    .maybeSingle()

  if (open) return NextResponse.json({ error: 'Already clocked in', entry: open }, { status: 409 })

  const clockInTime = new Date().toISOString()

  const { data: entry, error } = await supabase
    .from('time_entries')
    .insert({ profile_id, date: entryDate, clock_in: clockInTime })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Lookup worker name for Slack
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', profile_id)
    .single()

  const name = profile?.name || 'Worker'
  const { late, minutesLate } = clockInIsLate(clockInTime)
  const timeStr = fmtTimeEST(clockInTime)

  let slackMsg: string
  if (late) {
    const hrs = Math.floor(minutesLate / 60)
    const mins = minutesLate % 60
    const lateStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
    slackMsg = `⚠️ *${name}* clocked in at ${timeStr} EST — *LATE by ${lateStr}* (shift starts 2:00 PM)`
  } else {
    slackMsg = `✅ *${name}* clocked in at ${timeStr} EST — on time`
  }

  await sendSlack(slackMsg, name)

  return NextResponse.json({ entry })
}

// PATCH — clock out
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const clockOutTime = new Date().toISOString()

  const { data: entry, error } = await supabase
    .from('time_entries')
    .update({ clock_out: clockOutTime })
    .eq('id', id)
    .is('clock_out', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entry) return NextResponse.json({ error: 'No open entry found' }, { status: 404 })

  // Calculate hours for Slack message
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', entry.profile_id)
    .single()

  // Get all entries for today to compute total billable hours
  const { data: dayEntries } = await supabase
    .from('time_entries')
    .select('clock_in, clock_out')
    .eq('profile_id', entry.profile_id)
    .eq('date', entry.date)

  const billable = billableHoursForDay(dayEntries || [])
  const overtime = Math.max(0, billable - 9)
  const name = profile?.name || 'Worker'
  const timeStr = fmtTimeEST(clockOutTime)

  let slackMsg = `🕐 *${name}* clocked out at ${timeStr} EST — ${billable.toFixed(2)}h billable today`
  if (overtime > 0) slackMsg += ` (${overtime.toFixed(2)}h OT @ $${6}/hr)`

  await sendSlack(slackMsg, name)

  return NextResponse.json({ entry })
}

// DELETE /api/metrics/time-entries?id=xxx
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
