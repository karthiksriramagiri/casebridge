import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import {
  currentPayPeriodStart, nextPaymentDate, fmtPayDate,
  billableHoursForDay,
  COMMISSION_PER_CLOSED, COMMISSION_PER_CLOSED_NEW,
  COMMISSION_CUTOFF, DEFAULT_REPLACEMENT_WINDOW_DAYS,
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

  // All rep closers — exclude hidden/demo profiles, creative team, but always include Karthik
  const { data: repProfiles } = await admin
    .from('profiles')
    .select('id, name')
    .eq('role', 'rep')
    .or('team_type.is.null,team_type.eq.intake,name.eq.Karthik')
    .or('hide_from_hr.is.null,hide_from_hr.eq.false,name.eq.Karthik')
  const profileById: Record<string, string> = {}   // id → name
  const profileIdByName: Record<string, string> = {} // name → id
  for (const p of repProfiles || []) {
    if (p.id && p.name) {
      profileById[p.id] = p.name
      profileIdByName[p.name.trim().toLowerCase()] = p.id
    }
  }

  const [
    ghlThisMonthRes, ghlLastMonthRes,
    ghlAllRes, repAllRes,
    prizeRes, todayScoreRes,
    modulesRes, attemptsRes,
    timeRes, payCasesRes,
  ] = await Promise.all([
    // GHL closes this month (include closer text field as fallback for unlinked reps)
    admin.from('ghl_leads')
      .select('closed_by_profile_id, closer')
      .gte('qualified_at', thisMonthStart + 'T00:00:00Z')
      .not('case_status', 'in', '("replacement","cancelled")'),

    // GHL closes last month
    admin.from('ghl_leads')
      .select('closed_by_profile_id, closer')
      .gte('qualified_at', lastMonthStart + 'T00:00:00Z')
      .lt('qualified_at', lastMonthEnd + 'T00:00:00Z')
      .not('case_status', 'in', '("replacement","cancelled")'),

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

  // --- Build leaderboards (include all reps, fall back to closer text field) ---
  function buildLeaderboard(rows: any[]) {
    const counts: Record<string, { name: string; count: number; userId: string }> = {}
    // Seed every rep at 0
    for (const [uid, name] of Object.entries(profileById)) {
      counts[uid] = { name, count: 0, userId: uid }
    }
    for (const row of rows) {
      // Resolve rep: prefer profile_id link, fall back to closer text
      let uid = row.closed_by_profile_id as string | null
      if (!uid && row.closer) {
        uid = profileIdByName[(row.closer as string).trim().toLowerCase()] ?? null
      }
      if (!uid || !counts[uid]) continue
      counts[uid].count++
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
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
  let totalHours = 0
  for (const entries of Object.values(byDay)) {
    totalHours += billableHoursForDay(entries)
  }
  const hourlyEarnings = Math.round(totalHours * HOURLY_RATE * 100) / 100

  let commissionSigned = 0
  for (const c of payCasesRes.data || []) {
    if (!c.qualified_at || c.case_status === 'replacement') continue
    const qualifiedAt = new Date(c.qualified_at)
    const windowDays = (c.firms as any)?.replacement_window_days ?? DEFAULT_REPLACEMENT_WINDOW_DAYS
    const eligibleAt = new Date(qualifiedAt.getTime() + windowDays * 24 * 60 * 60 * 1000)
    if (eligibleAt <= now) {
      commissionSigned += qualifiedAt < COMMISSION_CUTOFF ? COMMISSION_PER_CLOSED : COMMISSION_PER_CLOSED_NEW
    }
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
