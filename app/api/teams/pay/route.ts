import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import {
  currentPayPeriodStart, nextPaymentDate, fmtPayDate,
  billableHoursForDay, splitOvertimeHours,
  COMMISSION_PER_CLOSED, COMMISSION_PER_REPLACEMENT,
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
  const todayStr = now.toISOString().slice(0, 10)
  const periodStart = currentPayPeriodStart(now)
  const periodEnd   = nextPaymentDate(now)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr   = periodEnd.toISOString().slice(0, 10)

  const [timeRes, casesRes, todayRes] = await Promise.all([
    // Time entries for this pay period
    admin.from('time_entries')
      .select('id, date, clock_in, clock_out')
      .eq('profile_id', user.id)
      .gte('date', periodStartStr)
      .lt('date', periodEndStr)
      .order('date', { ascending: true })
      .order('clock_in', { ascending: true }),

    // All cases ever closed by this rep — we need all, not just this period,
    // so we can show pending cases from previous periods too
    admin.from('ghl_leads')
      .select('id, contact_name, case_status, qualified_at, firms(replacement_window_days)')
      .eq('closed_by_profile_id', user.id)
      .order('qualified_at', { ascending: false }),

    // Today's time entries for the timeclock widget
    admin.from('time_entries')
      .select('id, clock_in, clock_out')
      .eq('profile_id', user.id)
      .eq('date', todayStr)
      .order('clock_in', { ascending: true }),
  ])

  // --- Aggregate hours by day, keep individual sessions ---
  type SessionEntry = { id: string; clock_in: string; clock_out: string | null; hours: number; pay: number }
  const byDay: Record<string, { clock_in: string; clock_out: string | null }[]> = {}
  const byDayWithIds: Record<string, { id: string; clock_in: string; clock_out: string | null }[]> = {}

  for (const e of timeRes.data || []) {
    if (!byDay[e.date]) byDay[e.date] = []
    if (!byDayWithIds[e.date]) byDayWithIds[e.date] = []
    byDay[e.date].push({ clock_in: e.clock_in, clock_out: e.clock_out })
    byDayWithIds[e.date].push({ id: e.id, clock_in: e.clock_in, clock_out: e.clock_out })
  }

  let totalRegular = 0
  let totalOvertime = 0
  const nowMs = now.getTime()

  const dailySessions: {
    date: string
    totalHours: number
    totalPay: number
    sessions: SessionEntry[]
  }[] = []

  for (const [date, entries] of Object.entries(byDay)) {
    const billable = billableHoursForDay(entries)
    const { regular, overtime } = splitOvertimeHours(billable)
    totalRegular += regular
    totalOvertime += overtime

    // Build individual session entries with duration
    const sessionEntries: SessionEntry[] = byDayWithIds[date].map(e => {
      const endMs = e.clock_out ? new Date(e.clock_out).getTime() : nowMs
      const rawHours = Math.max(0, (endMs - new Date(e.clock_in).getTime()) / 3_600_000)
      const sessionHours = Math.round(rawHours * 100) / 100
      return {
        id: e.id,
        clock_in: e.clock_in,
        clock_out: e.clock_out,
        hours: sessionHours,
        pay: Math.round(sessionHours * HOURLY_RATE * 100) / 100,
      }
    })

    dailySessions.push({
      date,
      totalHours: regular + overtime,
      totalPay: Math.round((regular * HOURLY_RATE + overtime * 6) * 100) / 100,
      sessions: sessionEntries,
    })
  }

  // --- Classify cases ---
  // Signed: eligible if qualified_at + replacement_window_days <= today
  // Replacement: always eligible for $10
  const signedEligible: any[] = []
  const signedPending: any[] = []
  const replacements: any[] = []

  for (const c of casesRes.data || []) {
    const status = c.case_status || 'e_signed'
    const windowDays = (c.firms as any)?.replacement_window_days ?? 14
    const qualifiedAt = new Date(c.qualified_at)
    const eligibleAt = new Date(qualifiedAt.getTime() + windowDays * 24 * 60 * 60 * 1000)
    const isEligible = eligibleAt <= now

    if (status === 'replacement') {
      replacements.push({ ...c, windowDays, eligibleAt: eligibleAt.toISOString().slice(0, 10) })
    } else {
      const entry = {
        id: c.id,
        name: c.contact_name || 'Unknown',
        date: c.qualified_at?.slice(0, 10),
        eligibleDate: eligibleAt.toISOString().slice(0, 10),
        windowDays,
        commission: COMMISSION_PER_CLOSED,
      }
      if (isEligible) {
        signedEligible.push(entry)
      } else {
        signedPending.push(entry)
      }
    }
  }

  const replacementEntries = replacements.map(c => ({
    id: c.id,
    name: c.contact_name || 'Unknown',
    date: c.qualified_at?.slice(0, 10),
    commission: COMMISSION_PER_REPLACEMENT,
  }))

  // --- Only count eligible cases toward this period's paycheck ---
  // Eligible signed cases closed within this pay period
  const eligibleThisPeriod = signedEligible.filter(
    c => c.date >= periodStartStr && c.date < periodEndStr
  )
  const replacementsThisPeriod = replacementEntries.filter(
    c => c.date >= periodStartStr && c.date < periodEndStr
  )

  const hourlyEarnings    = Math.round((totalRegular * HOURLY_RATE + totalOvertime * 6) * 100) / 100
  const commissionSigned  = eligibleThisPeriod.length * COMMISSION_PER_CLOSED
  const totalEstimated    = hourlyEarnings + commissionSigned

  return NextResponse.json({
    period: {
      start: periodStartStr,
      end: periodEndStr,
      nextPayDate: fmtPayDate(periodEnd),
    },
    hours: {
      regular: Math.round(totalRegular * 100) / 100,
      overtime: Math.round(totalOvertime * 100) / 100,
      dailySessions,
    },
    cases: {
      eligibleThisPeriod,
      pending: signedPending,
    },
    pay: {
      hourlyRate: HOURLY_RATE,
      hourlyEarnings,
      commissionSigned,
      totalEstimated,
    },
    todayEntries: todayRes.data || [],
  })
}
