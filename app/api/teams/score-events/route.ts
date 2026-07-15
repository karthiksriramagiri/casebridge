import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const BASE_SCORE = 2
const MAX_SCORE = 5

// GET /api/teams/score-events — rep's own events, daily scores, today's score, rank
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: events } = await admin
    .from('score_events')
    .select('id, event_type, points, note, date, auto_generated, created_at')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  // Group events by date
  const byDate: Record<string, typeof events> = {}
  for (const e of events || []) {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date]!.push(e)
  }

  // Build last 30 days array (newest first), always include every day
  const dailyScores = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const date = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const dayEvents = byDate[date] ?? []
    const eventTotal = dayEvents.reduce((s, e) => s + Number(e.points), 0)
    dailyScores.push({ date, events: dayEvents, eventTotal, dayScore: Math.min(MAX_SCORE, BASE_SCORE + eventTotal) })
  }

  const todayEvents = byDate[today] ?? []
  const todayEventTotal = todayEvents.reduce((s, e) => s + Number(e.points), 0)
  const todayScore = Math.min(MAX_SCORE, BASE_SCORE + todayEventTotal)

  // Rank by this week's cumulative event points (base is equal for all, so skip it for ranking)
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)) // Monday
  const weekStartStr = weekStart.toISOString().slice(0, 10)

  const { data: allWeekEvents } = await admin
    .from('score_events')
    .select('user_id, points')
    .gte('date', weekStartStr)

  const repWeekTotals: Record<string, number> = {}
  for (const e of allWeekEvents || []) {
    repWeekTotals[e.user_id] = (repWeekTotals[e.user_id] ?? 0) + Number(e.points)
  }

  const { data: allReps } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'rep')
    .or('hide_from_hr.is.null,hide_from_hr.eq.false')

  const allRepIds = (allReps || []).map(r => r.id)
  const totalReps = allRepIds.length

  const allWeekScores = allRepIds.map(id => repWeekTotals[id] ?? 0)
  allWeekScores.sort((a, b) => b - a)
  const myWeekTotal = repWeekTotals[user.id] ?? 0
  const rank = allWeekScores.findIndex(s => s <= myWeekTotal) + 1

  return NextResponse.json({
    events: events || [],
    todayScore,
    todayEventTotal,
    dailyScores,
    rank,
    totalReps,
  })
}
