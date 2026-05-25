import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { currentPayPeriodStart, billableHoursForDay, splitOvertimeHours, clockInIsLate } from '@/lib/pay'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REPORT_WEBHOOK = process.env.SLACK_PABLO_REPORT_WEBHOOK!
const CRON_SECRET    = process.env.CRON_SECRET!

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

/** Check if today (UTC) is the 2nd or 4th Friday of the month */
function isBiweeklyFriday(now: Date): boolean {
  // Get date in EST
  const estDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  if (estDate.getDay() !== 5) return false // must be Friday
  // Count how many Fridays have occurred in this month up to and including today
  const dayOfMonth = estDate.getDate()
  const fridayNumber = Math.ceil(dayOfMonth / 7)
  return fridayNumber === 2 || fridayNumber === 4
}

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Only send on 2nd and 4th Fridays (unless ?force=true for testing)
  const force = new URL(req.url).searchParams.get('force') === 'true'
  if (!force && !isBiweeklyFriday(now)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Not a 2nd or 4th Friday' })
  }

  // ── Find Pablo ────────────────────────────────────────────────────────────
  const { data: pablo } = await supabase
    .from('profiles')
    .select('id, name')
    .ilike('name', '%pablo%')
    .eq('role', 'rep')
    .maybeSingle()

  if (!pablo) {
    return NextResponse.json({ error: 'Pablo not found in profiles' }, { status: 404 })
  }

  // ── Pay period window ─────────────────────────────────────────────────────
  const periodStart = currentPayPeriodStart(now)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now)

  // ── Fetch time entries for the period ─────────────────────────────────────
  const { data: entries } = await supabase
    .from('time_entries')
    .select('id, date, clock_in, clock_out')
    .eq('profile_id', pablo.id)
    .gte('date', periodStartStr)
    .lte('date', todayStr)
    .order('date', { ascending: true })
    .order('clock_in', { ascending: true })

  // ── Fetch signed PCs closed by Pablo in the period ────────────────────────
  const { data: signedCases } = await supabase
    .from('ghl_leads')
    .select('id, qualified_at, case_status')
    .eq('closed_by_profile_id', pablo.id)
    .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
    .gte('qualified_at', `${periodStartStr}T00:00:00Z`)

  // ── Aggregate by day ───────────────────────────────────────────────────────
  const byDay: Record<string, { clock_in: string; clock_out: string | null }[]> = {}
  for (const e of entries || []) {
    if (!byDay[e.date]) byDay[e.date] = []
    byDay[e.date].push({ clock_in: e.clock_in, clock_out: e.clock_out })
  }

  let totalRegular  = 0
  let totalOvertime = 0
  let daysWorked    = 0
  const lateDays: string[]     = []
  const overtimeDays: string[] = []

  for (const [date, dayEntries] of Object.entries(byDay)) {
    daysWorked++
    const hours = billableHoursForDay(dayEntries)
    const { regular, overtime } = splitOvertimeHours(hours)
    totalRegular  += regular
    totalOvertime += overtime

    // Check if first clock-in of the day was late
    const firstIn = dayEntries.reduce((min, e) =>
      e.clock_in < min ? e.clock_in : min, dayEntries[0].clock_in)
    const { late, minutesLate } = clockInIsLate(firstIn)
    if (late) {
      const hrs  = Math.floor(minutesLate / 60)
      const mins = minutesLate % 60
      const lateStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
      lateDays.push(`${fmtDate(date)} — ${lateStr} late (in at ${fmtTime(firstIn)})`)
    }
    if (overtime > 0) {
      overtimeDays.push(`${fmtDate(date)} — ${overtime.toFixed(2)}h OT`)
    }
  }

  const signedCount = (signedCases || []).length
  const totalHours  = totalRegular + totalOvertime

  // ── Build Slack message ───────────────────────────────────────────────────
  const periodLabel = `${fmtDate(periodStartStr)} – ${fmtDate(todayStr)}`

  const lines: string[] = [
    `📊 *Pablo — Pay Period Report*`,
    `*Period:* ${periodLabel}`,
    ``,
    `*Hours & Attendance*`,
    `• Total hours: *${totalHours.toFixed(2)}h* (regular: ${totalRegular.toFixed(2)}h · OT: ${totalOvertime.toFixed(2)}h)`,
    `• Days worked: *${daysWorked}*`,
  ]

  if (lateDays.length > 0) {
    lines.push(`• Late arrivals: *${lateDays.length} day${lateDays.length !== 1 ? 's' : ''}*`)
    for (const d of lateDays) lines.push(`  ↳ ${d}`)
  } else {
    lines.push(`• Late arrivals: *0* — on time every day ✅`)
  }

  if (overtimeDays.length > 0) {
    lines.push(`• Overtime days: *${overtimeDays.length}*`)
    for (const d of overtimeDays) lines.push(`  ↳ ${d}`)
  } else {
    lines.push(`• Overtime days: *0*`)
  }

  lines.push(``)
  lines.push(`*Signed PCs Closed*`)
  lines.push(`• *${signedCount}* signed case${signedCount !== 1 ? 's' : ''} closed this period`)

  const message = lines.join('\n')

  // ── Send to Slack ─────────────────────────────────────────────────────────
  const slackRes = await fetch(REPORT_WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text: message }),
  })

  return NextResponse.json({
    ok:          slackRes.ok,
    period:      periodLabel,
    daysWorked,
    totalHours:  totalHours.toFixed(2),
    lateDays:    lateDays.length,
    overtimeDays: overtimeDays.length,
    signedCases: signedCount,
  })
}
