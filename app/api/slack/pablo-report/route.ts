import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { billableHoursForDay, splitOvertimeHours, clockInIsLate, OVERTIME_HOURLY, COMMISSION_PER_CLOSED } from '@/lib/pay'

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

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Returns the 2nd and 4th Fridays of the given year/month (0-indexed) as YYYY-MM-DD strings */
function payFridaysOfMonth(year: number, month: number): { second: string; fourth: string | null } {
  const fridays: string[] = []
  const d = new Date(Date.UTC(year, month, 1))
  while (d.getUTCMonth() === month) {
    if (d.getUTCDay() === 5) {
      fridays.push(d.toISOString().slice(0, 10))
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return { second: fridays[1], fourth: fridays[3] ?? null }
}

/** Which pay period are we in, and what are the start/end dates?
 *  nowEST is a UTC-midnight Date representing today's EST calendar date.
 *  Period A: month 1st  → 2nd Friday (paid on 2nd Friday)
 *  Period B: 2nd Friday → 4th Friday (paid on 4th Friday)
 */
function payPeriodFor(nowEST: Date): { start: string; end: string; label: 'A' | 'B' } {
  const year  = nowEST.getUTCFullYear()
  const month = nowEST.getUTCMonth()
  const { second, fourth } = payFridaysOfMonth(year, month)
  const todayStr   = nowEST.toISOString().slice(0, 10)
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`

  if (todayStr <= second) {
    return { start: monthStart, end: second, label: 'A' }
  }
  return { start: second, end: fourth ?? todayStr, label: 'B' }
}

/** Is today (nowEST = UTC-midnight of EST date) the 2nd or 4th Friday? */
function isBiweeklyFriday(nowEST: Date): boolean {
  if (nowEST.getUTCDay() !== 5) return false
  const fridayNumber = Math.ceil(nowEST.getUTCDate() / 7)
  return fridayNumber === 2 || fridayNumber === 4
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Get today's date string in EST (YYYY-MM-DD), then derive a UTC midnight Date
  // so getUTCDay() / getUTCDate() are reliable regardless of server timezone
  const todayStrEST = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now)
  const nowEST = new Date(todayStrEST + 'T00:00:00Z') // UTC midnight on EST calendar date

  const force = new URL(req.url).searchParams.get('force') === 'true'
  if (!force && !isBiweeklyFriday(nowEST)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Not a 2nd or 4th Friday' })
  }

  // ── Find Pablo ─────────────────────────────────────────────────────────────
  const { data: pablo } = await supabase
    .from('profiles')
    .select('id, name')
    .ilike('name', '%pablo%')
    .eq('role', 'rep')
    .maybeSingle()

  if (!pablo) {
    return NextResponse.json({ error: 'Pablo not found in profiles' }, { status: 404 })
  }

  // ── Determine pay period ───────────────────────────────────────────────────
  const { start: periodStartStr, end: periodEndStr } = payPeriodFor(nowEST)

  // ── Fetch data in parallel ─────────────────────────────────────────────────
  const [entriesRes, signedRes, rateRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('id, date, clock_in, clock_out')
      .eq('profile_id', pablo.id)
      .gte('date', periodStartStr)
      .lte('date', periodEndStr)
      .order('date', { ascending: true })
      .order('clock_in', { ascending: true }),

    supabase
      .from('ghl_leads')
      .select('id, qualified_at, case_status, closer')
      .eq('closed_by_profile_id', pablo.id)
      .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
      .gte('qualified_at', `${periodStartStr}T00:00:00Z`)
      .lte('qualified_at', `${periodEndStr}T23:59:59Z`)
      .order('qualified_at', { ascending: true }),

    supabase
      .from('worker_pay_rates')
      .select('hourly_rate')
      .eq('profile_id', pablo.id)
      .is('effective_to', null)
      .maybeSingle(),
  ])

  const hourlyRate = rateRes.data?.hourly_rate ?? 5

  // ── Aggregate time entries by day ──────────────────────────────────────────
  const byDay: Record<string, { clock_in: string; clock_out: string | null }[]> = {}
  for (const e of entriesRes.data || []) {
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

    const firstIn = dayEntries.reduce((min, e) =>
      e.clock_in < min ? e.clock_in : min, dayEntries[0].clock_in)
    const { late, minutesLate } = clockInIsLate(firstIn)
    if (late) {
      const hrs     = Math.floor(minutesLate / 60)
      const mins    = minutesLate % 60
      const lateStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
      lateDays.push(`${fmtDate(date)} — ${lateStr} late (in at ${fmtTime(firstIn)})`)
    }
    if (overtime > 0) {
      overtimeDays.push(`${fmtDate(date)} — ${overtime.toFixed(2)}h OT`)
    }
  }

  const totalHours  = totalRegular + totalOvertime
  const signedCases = signedRes.data || []
  const signedCount = signedCases.length

  // ── Pay calculation ────────────────────────────────────────────────────────
  const basePay    = totalRegular * hourlyRate + totalOvertime * OVERTIME_HOURLY
  const commission = signedCount * COMMISSION_PER_CLOSED
  const totalPay   = basePay + commission

  // ── Build Slack message ────────────────────────────────────────────────────
  const periodLabel = `${fmtDate(periodStartStr)} – ${fmtDate(periodEndStr)}`

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
    lines.push(`• Late arrivals: *0* ✅`)
  }

  if (overtimeDays.length > 0) {
    lines.push(`• Overtime days: *${overtimeDays.length}*`)
    for (const d of overtimeDays) lines.push(`  ↳ ${d}`)
  } else {
    lines.push(`• Overtime days: *0*`)
  }

  lines.push(``)
  lines.push(`*Signed PCs Closed (${periodLabel})*`)

  if (signedCount === 0) {
    lines.push(`• No signed cases this period`)
  } else {
    for (const c of signedCases) {
      const closedDate = fmtDate(c.qualified_at.slice(0, 10))
      lines.push(`• ${closedDate} — ${c.closer || 'case closed'}`)
    }
    lines.push(`• *Total: ${signedCount} signed case${signedCount !== 1 ? 's' : ''}*`)
  }

  lines.push(``)
  lines.push(`*💰 Pay Summary*`)
  lines.push(`• Base: ${totalRegular.toFixed(2)}h reg × ${fmt$(hourlyRate)}/hr = ${fmt$(totalRegular * hourlyRate)}`)
  if (totalOvertime > 0) {
    lines.push(`• OT: ${totalOvertime.toFixed(2)}h × ${fmt$(OVERTIME_HOURLY)}/hr = ${fmt$(totalOvertime * OVERTIME_HOURLY)}`)
  }
  lines.push(`• Commission: ${signedCount} × ${fmt$(COMMISSION_PER_CLOSED)} = ${fmt$(commission)}`)
  lines.push(`• *Total owed: ${fmt$(totalPay)}*`)

  const message = lines.join('\n')

  const slackRes = await fetch(REPORT_WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text: message }),
  })

  return NextResponse.json({
    ok: slackRes.ok,
    period: periodLabel,
    daysWorked,
    totalHours: totalHours.toFixed(2),
    lateDays: lateDays.length,
    overtimeDays: overtimeDays.length,
    signedCases: signedCount,
    totalPay: fmt$(totalPay),
  })
}
