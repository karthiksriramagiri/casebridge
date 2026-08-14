import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import {
  currentPayPeriodStart, nextPaymentDate, fmtPayDate,
  billableHoursForDay, recentPayDates,
  tierCommission,
  DEFAULT_REPLACEMENT_WINDOW_DAYS,
  PERIOD_START_OVERRIDES,
} from '@/lib/pay'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HOURLY_RATE = 5

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const nowMs = now.getTime()
  const todayStr = now.toISOString().slice(0, 10)
  const periodStart = currentPayPeriodStart(now)
  const periodEnd   = nextPaymentDate(now)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr   = periodEnd.toISOString().slice(0, 10)

  // Build list of previous completed pay periods (last 4)
  const allPayDates = recentPayDates(now, 4)
  const pastDates = allPayDates.filter(d => d.getTime() < nowMs)
  const completedPeriods: { start: Date; end: Date }[] = []
  for (let i = 0; i < pastDates.length - 1; i++) {
    if (pastDates[i + 1].getTime() <= periodStart.getTime()) {
      completedPeriods.push({ start: pastDates[i], end: pastDates[i + 1] })
    }
  }
  const prevPeriods = completedPeriods.slice(-4)
  const historyStartStr = prevPeriods.length > 0
    ? prevPeriods[0].start.toISOString().slice(0, 10)
    : periodStartStr

  // Fetch the rep's display name so we can match closer text field
  const { data: profile } = await admin.from('profiles').select('name').eq('id', user.id).single()
  const repName = (profile?.name || '').trim()

  const [timeRes, histTimeRes, casesRes, todayRes] = await Promise.all([
    // Time entries for current period (with IDs for session detail)
    admin.from('time_entries')
      .select('id, date, clock_in, clock_out')
      .eq('profile_id', user.id)
      .gte('date', periodStartStr)
      .lt('date', periodEndStr)
      .order('date', { ascending: true })
      .order('clock_in', { ascending: true }),

    // Time entries for historical periods (with IDs for session detail)
    admin.from('time_entries')
      .select('id, date, clock_in, clock_out')
      .eq('profile_id', user.id)
      .gte('date', historyStartStr)
      .lt('date', periodStartStr)
      .order('date', { ascending: true })
      .order('clock_in', { ascending: true }),

    // All cases closed by this rep — match by profile_id OR closer name
    admin.from('ghl_leads')
      .select('id, contact_name, case_status, qualified_at, firms(replacement_window_days)')
      .or(`closed_by_profile_id.eq.${user.id}${repName ? `,closer.ilike.${repName}` : ''}`)
      .order('qualified_at', { ascending: false }),

    // Today's time entries for the timeclock widget
    admin.from('time_entries')
      .select('id, clock_in, clock_out')
      .eq('profile_id', user.id)
      .eq('date', todayStr)
      .order('clock_in', { ascending: true }),
  ])

  // --- Current period: aggregate hours by day, keep individual sessions ---
  type SessionEntry = { id: string; clock_in: string; clock_out: string | null; hours: number; pay: number }
  type DayEntry = { date: string; totalHours: number; totalPay: number; sessions: SessionEntry[] }

  function buildDailySessions(
    rows: { id: string; date: string; clock_in: string; clock_out: string | null }[]
  ): { sessions: DayEntry[]; totalHours: number } {
    const byDay: Record<string, typeof rows> = {}
    for (const e of rows) {
      if (!byDay[e.date]) byDay[e.date] = []
      byDay[e.date].push(e)
    }
    let totalHours = 0
    const days: DayEntry[] = []
    for (const [date, entries] of Object.entries(byDay)) {
      const billable = billableHoursForDay(entries.map(e => ({ clock_in: e.clock_in, clock_out: e.clock_out })))
      totalHours += billable
      const sessionEntries: SessionEntry[] = entries.map(e => {
        const endMs = e.clock_out ? new Date(e.clock_out).getTime() : nowMs
        const rawH = Math.max(0, (endMs - new Date(e.clock_in).getTime()) / 3_600_000)
        const h = Math.round(rawH * 100) / 100
        return { id: e.id, clock_in: e.clock_in, clock_out: e.clock_out, hours: h, pay: Math.round(h * HOURLY_RATE * 100) / 100 }
      })
      days.push({ date, totalHours: billable, totalPay: Math.round(billable * HOURLY_RATE * 100) / 100, sessions: sessionEntries })
    }
    days.sort((a, b) => a.date.localeCompare(b.date))
    return { sessions: days, totalHours: Math.round(totalHours * 100) / 100 }
  }

  const { sessions: dailySessions, totalHours } = buildDailySessions(timeRes.data || [])

  // --- Classify cases with tier-based commission (resets monthly) ---
  type CaseEntry = { id: string; name: string; date: string; eligibleAt: Date; commission: number; tier: number; closeNumber: number }
  const caseSeen = new Set<string>()

  // First pass: collect all non-replacement signed cases
  const rawCases: { id: string; name: string; date: string; eligibleAt: Date; monthKey: string }[] = []
  for (const c of casesRes.data || []) {
    if (!c.qualified_at) continue
    const isReplacement = (c.case_status || '').toLowerCase() === 'replacement'
    if (isReplacement) continue

    const dedupeKey = `${(c.contact_name || '').toLowerCase()}|${c.qualified_at.slice(0, 10)}`
    if (caseSeen.has(dedupeKey)) continue
    caseSeen.add(dedupeKey)

    const qualifiedAt = new Date(c.qualified_at)
    const windowDays = (c.firms as any)?.replacement_window_days ?? DEFAULT_REPLACEMENT_WINDOW_DAYS
    const eligibleAt = new Date(qualifiedAt.getTime() + windowDays * 24 * 60 * 60 * 1000)
    rawCases.push({
      id: c.id,
      name: c.contact_name || 'Unknown',
      date: c.qualified_at.slice(0, 10),
      eligibleAt,
      monthKey: c.qualified_at.slice(0, 7), // YYYY-MM
    })
  }

  // Sort by sign date to assign close numbers within each month
  rawCases.sort((a, b) => a.date.localeCompare(b.date))
  const monthCounts: Record<string, number> = {}
  const allSignedCases: CaseEntry[] = rawCases.map(c => {
    monthCounts[c.monthKey] = (monthCounts[c.monthKey] || 0) + 1
    const closeNumber = monthCounts[c.monthKey]
    const { tier, rate } = tierCommission(closeNumber)
    return { ...c, commission: rate, tier, closeNumber }
  })

  // Current period: became eligible after last paycheck (periodStart) and on/before today
  // This captures cases signed in ANY past period whose 28-day window cleared during this period
  const eligibleThisPeriod = allSignedCases.filter(
    c => c.eligibleAt > periodStart && c.eligibleAt <= now
  )
  // Pending: not yet eligible (will pay out in a future paycheck)
  const signedPending = allSignedCases.filter(
    c => c.eligibleAt > now
  )

  const hourlyEarnings   = Math.round(totalHours * HOURLY_RATE * 100) / 100
  const commissionSigned = eligibleThisPeriod.reduce((sum, c) => sum + c.commission, 0)
  const totalEstimated   = hourlyEarnings + commissionSigned

  // --- Historical periods: check eligibility against paycheck date (not today) ---
  const histRows = histTimeRes.data || []

  const previousPeriods = prevPeriods.map(({ start, end }) => {
    const endStr = end.toISOString().slice(0, 10)
    // Apply override: some pay dates cover non-standard periods (e.g. Jul 17 covers Jun 26–Jul 17)
    const effectiveStart = PERIOD_START_OVERRIDES[endStr] ? new Date(PERIOD_START_OVERRIDES[endStr]) : start
    const startStr = effectiveStart.toISOString().slice(0, 10)

    const periodRows = histRows.filter(e => e.date >= startStr && e.date < endStr)
    const { sessions: periodDailySessions, totalHours: periodHours } = buildDailySessions(periodRows)
    const periodHourlyPay = Math.round(periodHours * HOURLY_RATE * 100) / 100

    // Cases whose replacement window CLEARED during this paycheck period
    const eligibleInPeriod = allSignedCases.filter(
      c => c.eligibleAt > effectiveStart && c.eligibleAt <= end
    )
    const periodCommission = eligibleInPeriod.reduce((sum, c) => sum + c.commission, 0)
    const periodTotal = Math.round((periodHourlyPay + periodCommission) * 100) / 100

    return {
      start: startStr,
      end: endStr,
      payDate: fmtPayDate(end),
      hours: periodHours,
      hourlyPay: periodHourlyPay,
      commissionCases: eligibleInPeriod.length,
      commission: periodCommission,
      total: periodTotal,
      dailySessions: periodDailySessions,
      eligibleCases: eligibleInPeriod.map(({ id, name, date, commission, tier, closeNumber }) => ({ id, name, date, commission, tier, closeNumber })),
    }
  }).reverse() // Most recent first

  return NextResponse.json({
    period: {
      start: periodStartStr,
      end: periodEndStr,
      nextPayDate: fmtPayDate(periodEnd),
    },
    hours: {
      total: totalHours,
      dailySessions,
    },
    cases: {
      eligibleThisPeriod: eligibleThisPeriod.map(({ id, name, date, commission, tier, closeNumber }) => ({ id, name, date, commission, tier, closeNumber })),
      pending: signedPending.map(({ id, name, date, commission, tier, closeNumber }) => ({ id, name, date, commission, tier, closeNumber })),
    },
    pay: {
      hourlyRate: HOURLY_RATE,
      hourlyEarnings,
      commissionSigned,
      totalEstimated,
    },
    previousPeriods,
    todayEntries: todayRes.data || [],
  })
}
