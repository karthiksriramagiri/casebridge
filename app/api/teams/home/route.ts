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
  const today = now.toISOString().split('T')[0]

  // This month
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // Last month
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
  const lastMonthEnd = thisMonthStart

  // Pay period
  const periodStart = currentPayPeriodStart(now)
  const periodEnd   = nextPaymentDate(now)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const periodEndStr   = periodEnd.toISOString().slice(0, 10)

  // All rep profiles
  const { data: repProfiles } = await admin.from('profiles').select('id, name').eq('role', 'rep')
  const profileById: Record<string, string> = {}
  for (const p of repProfiles || []) { if (p.id && p.name) profileById[p.id] = p.name }

  const [
    ghlThisMonthRes, ghlLastMonthRes,
    ghlAllRes, repAllRes,
    prizeRes, todayScoreRes,
    modulesRes, attemptsRes,
    timeRes, payCasesRes,
  ] = await Promise.all([
    // GHL closes this month
    admin.from('ghl_leads')
      .select('closed_by_profile_id')
      .gte('qualified_at', thisMonthStart + 'T00:00:00Z')
      .not('closed_by_profile_id', 'is', null)
      .neq('case_status', 'replacement'),

    // GHL closes last month
    admin.from('ghl_leads')
      .select('closed_by_profile_id')
      .gte('qualified_at', lastMonthStart + 'T00:00:00Z')
      .lt('qualified_at', lastMonthEnd + 'T00:00:00Z')
      .not('closed_by_profile_id', 'is', null)
      .neq('case_status', 'replacement'),

    // All-time for current user (ghl)
    admin.from('ghl_leads').select('id').eq('closed_by_profile_id', user.id).neq('case_status', 'replacement'),

    // All-time for current user (rep_cases manual)
    admin.from('rep_cases').select('id').eq('user_id', user.id).eq('status', 'signed'),

    // Monthly prize
    admin.from('site_config').select('value').eq('key', 'monthly_prize').single(),

    // Today's performance score
    admin.from('rep_performance').select('score, notes').eq('user_id', user.id).eq('date', today).maybeSingle(),

    // All active required modules
    admin.from('modules').select('id, title').eq('is_active', true).eq('is_required', true),

    // User's passed attempts
    admin.from('attempts').select('module_id').eq('user_id', user.id).eq('passed', true).eq('is_invalidated', false),

    // Time entries this pay period
    admin.from('time_entries')
      .select('date, clock_in, clock_out')
      .eq('profile_id', user.id)
      .gte('date', periodStartStr)
      .lt('date', periodEndStr)
      .order('clock_in', { ascending: true }),

    // Cases for pay estimate (all, to check replacement window)
    admin.from('ghl_leads')
      .select('id, case_status, qualified_at, firms(replacement_window_days)')
      .eq('closed_by_profile_id', user.id)
      .gte('qualified_at', periodStartStr + 'T00:00:00Z')
      .lt('qualified_at', periodEndStr + 'T00:00:00Z'),
  ])

  // --- Build leaderboards ---
  function buildLeaderboard(rows: any[]) {
    const counts: Record<string, { name: string; count: number; userId: string }> = {}
    for (const row of rows) {
      const uid = row.closed_by_profile_id
      if (!uid) continue
      const name = profileById[uid]
      if (!name) continue
      if (!counts[uid]) counts[uid] = { name, count: 0, userId: uid }
      counts[uid].count++
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .map((e, i) => ({ ...e, rank: i + 1, isMe: e.userId === user.id }))
  }

  const thisMonthLeaderboard = buildLeaderboard(ghlThisMonthRes.data || [])
  const lastMonthLeaderboard = buildLeaderboard(ghlLastMonthRes.data || [])

  const myMonthCloses = thisMonthLeaderboard.find(e => e.isMe)?.count ?? 0
  const allTimeCloses = (ghlAllRes.data?.length ?? 0) + (repAllRes.data?.length ?? 0)

  // --- Modules progress ---
  const totalModules = modulesRes.data?.length ?? 0
  const passedModuleIds = new Set((attemptsRes.data || []).map((a: any) => a.module_id))
  const completedModules = (modulesRes.data || []).filter((m: any) => passedModuleIds.has(m.id)).length
  const modulesRemaining = totalModules - completedModules

  // --- Paycheck estimate ---
  const byDay: Record<string, { clock_in: string; clock_out: string | null }[]> = {}
  for (const e of timeRes.data || []) {
    if (!byDay[e.date]) byDay[e.date] = []
    byDay[e.date].push({ clock_in: e.clock_in, clock_out: e.clock_out })
  }
  let totalRegular = 0, totalOvertime = 0
  for (const entries of Object.values(byDay)) {
    const { regular, overtime } = splitOvertimeHours(billableHoursForDay(entries))
    totalRegular += regular
    totalOvertime += overtime
  }
  const hourlyEarnings = Math.round((totalRegular * HOURLY_RATE + totalOvertime * 6) * 100) / 100

  let commissionSigned = 0
  for (const c of payCasesRes.data || []) {
    const windowDays = (c.firms as any)?.replacement_window_days ?? 14
    const eligibleAt = new Date(new Date(c.qualified_at).getTime() + windowDays * 24 * 60 * 60 * 1000)
    if (c.case_status !== 'replacement' && eligibleAt <= now) commissionSigned += COMMISSION_PER_CLOSED
  }
  const paycheckEstimate = hourlyEarnings + commissionSigned

  return NextResponse.json({
    thisMonthLeaderboard,
    lastMonthLeaderboard,
    monthlyPrize: prizeRes.data?.value || null,
    todayScore: todayScoreRes.data || null,
    myMonthCloses,
    allTimeCloses,
    myRank: thisMonthLeaderboard.find(e => e.isMe)?.rank ?? null,
    modules: { total: totalModules, completed: completedModules, remaining: modulesRemaining },
    paycheck: {
      estimate: paycheckEstimate,
      nextPayDate: fmtPayDate(periodEnd),
      periodEnd: periodEndStr,
    },
  })
}
