import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  currentPayPeriodStart, nextPaymentDate, fmtPayDate,
  billableHoursForDay, splitOvertimeHours, grossPay,
  COMMISSION_PER_CLOSED,
} from '@/lib/pay'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // ── Pay period ─────────────────────────────────────────────────────────────
  const now = new Date()
  const periodStart = currentPayPeriodStart(now)
  const periodEnd   = nextPaymentDate(now)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr   = periodEnd.toISOString().slice(0, 10)

  // ── Leads / cases ──────────────────────────────────────────────────────────
  const { data: leads, error } = await supabase
    .from('ghl_leads')
    .select('closer, closed_by_profile_id, case_status, qualified_at, firm_id, firms(name, slug)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Profiles ───────────────────────────────────────────────────────────────
  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const profileNames: Record<string, string> = {}
  const profileIds: Record<string, string> = {}
  for (const p of profiles || []) {
    if (p.name) { profileNames[p.id] = p.name; profileIds[p.name.trim()] = p.id }
  }

  // ── Aggregate cases ────────────────────────────────────────────────────────
  type FirmStats = { firmId: string; firmName: string; firmSlug: string; signedCases: number; closedCases: number }
  const byWorker: Record<string, {
    profileId: string | null
    signedCases: number
    closedCases: number
    closedInPeriod: number   // closed cases in current pay period
    byFirm: Record<string, FirmStats>
  }> = {}

  for (const lead of leads || []) {
    const name =
      (lead.closed_by_profile_id ? profileNames[lead.closed_by_profile_id] : null) ||
      lead.closer || null
    if (!name) continue

    const key = name.trim()
    if (!byWorker[key]) byWorker[key] = { profileId: lead.closed_by_profile_id || profileIds[key] || null, signedCases: 0, closedCases: 0, closedInPeriod: 0, byFirm: {} }

    byWorker[key].signedCases += 1
    const isClosed = (lead.case_status || '').toLowerCase() === 'closed'
    if (isClosed) {
      byWorker[key].closedCases += 1
      // Check if closed in pay period
      if (lead.qualified_at) {
        const d = lead.qualified_at.slice(0, 10)
        if (d >= periodStartStr && d < periodEndStr) byWorker[key].closedInPeriod += 1
      }
    }

    const firmId = lead.firm_id || 'unknown'
    const firm = (lead as any).firms
    const firmName = firm?.name || 'Unknown'
    const firmSlug = firm?.slug || ''
    if (!byWorker[key].byFirm[firmId]) byWorker[key].byFirm[firmId] = { firmId, firmName, firmSlug, signedCases: 0, closedCases: 0 }
    byWorker[key].byFirm[firmId].signedCases += 1
    if (isClosed) byWorker[key].byFirm[firmId].closedCases += 1
  }

  // Include registered reps with 0 cases
  const { data: reps } = await supabase.from('profiles').select('id, name, role').eq('role', 'rep')
  for (const rep of reps || []) {
    const name = (rep.name || '').trim()
    if (!name) continue
    if (!byWorker[name]) byWorker[name] = { profileId: rep.id, signedCases: 0, closedCases: 0, closedInPeriod: 0, byFirm: {} }
    if (!byWorker[name].profileId) byWorker[name].profileId = rep.id
  }

  // ── Hourly rates ───────────────────────────────────────────────────────────
  const { data: rates } = await supabase
    .from('worker_pay_rates')
    .select('profile_id, hourly_rate')
    .order('effective_from', { ascending: false })

  const hourlyRateMap: Record<string, number> = {}
  for (const r of rates || []) {
    if (r.profile_id && !(r.profile_id in hourlyRateMap)) hourlyRateMap[r.profile_id] = r.hourly_rate ?? 5
  }

  // ── Time entries in pay period ─────────────────────────────────────────────
  // Group entries by profile_id + date so we can compute daily billable hours
  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('profile_id, date, clock_in, clock_out')
    .gte('date', periodStartStr)
    .lt('date', periodEndStr)
    .order('clock_in', { ascending: true })

  // Group by profile_id → date → entries[]
  const entriesByProfileDate: Record<string, Record<string, { clock_in: string; clock_out: string | null }[]>> = {}
  for (const e of timeEntries || []) {
    if (!entriesByProfileDate[e.profile_id]) entriesByProfileDate[e.profile_id] = {}
    if (!entriesByProfileDate[e.profile_id][e.date]) entriesByProfileDate[e.profile_id][e.date] = []
    entriesByProfileDate[e.profile_id][e.date].push({ clock_in: e.clock_in, clock_out: e.clock_out })
  }

  // Compute pay-period hours + pay per worker
  const hoursAndPay: Record<string, { regularHours: number; overtimeHours: number; basePay: number }> = {}
  for (const [profileId, byDate] of Object.entries(entriesByProfileDate)) {
    let totalRegular = 0, totalOvertime = 0
    const rate = hourlyRateMap[profileId] ?? 5
    for (const dayEntries of Object.values(byDate)) {
      const billable = billableHoursForDay(dayEntries)
      const { regular, overtime } = splitOvertimeHours(billable)
      totalRegular += regular
      totalOvertime += overtime
    }
    hoursAndPay[profileId] = {
      regularHours: Math.round(totalRegular * 100) / 100,
      overtimeHours: Math.round(totalOvertime * 100) / 100,
      basePay: Math.round(grossPay(totalRegular, totalOvertime, rate) * 100) / 100,
    }
  }

  // ── Assemble workers ───────────────────────────────────────────────────────
  const nextPay = nextPaymentDate(now)
  const nextPayLabel = fmtPayDate(nextPay)

  const workers = Object.entries(byWorker).map(([name, stats]) => {
    const pid = stats.profileId
    const rate = pid ? (hourlyRateMap[pid] ?? 5) : 5
    const { regularHours = 0, overtimeHours = 0, basePay = 0 } = pid ? (hoursAndPay[pid] || {}) : {}
    const commissionInPeriod = stats.closedInPeriod * COMMISSION_PER_CLOSED
    const totalPayment = Math.round((basePay + commissionInPeriod) * 100) / 100

    return {
      name,
      profileId: pid,
      signedCases: stats.signedCases,
      closedCases: stats.closedCases,
      commission: stats.closedCases * COMMISSION_PER_CLOSED,
      hourlyRate: rate,
      // Pay period
      payPeriodStart: periodStartStr,
      payPeriodEnd: periodEndStr,
      regularHours,
      overtimeHours,
      basePay,
      commissionInPeriod,
      nextPayment: totalPayment,
      nextPaymentDate: nextPayLabel,
      closedByFirm: Object.values(stats.byFirm).sort((a, b) => b.closedCases - a.closedCases),
    }
  }).sort((a, b) => b.signedCases - a.signedCases)

  return NextResponse.json({ workers, commissionPerClosed: COMMISSION_PER_CLOSED, nextPaymentDate: nextPayLabel, periodStart: periodStartStr, periodEnd: periodEndStr })
}
