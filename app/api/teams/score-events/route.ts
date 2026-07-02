import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const BASE_SCORE = 2

// GET /api/teams/score-events — rep's own events, daily scores, today's score, rank
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date().toISOString().slice(0, 10)

  const { data: events } = await admin
    .from('score_events')
    .select('id, event_type, points, note, date, auto_generated, created_at')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  // Group events by date → compute daily score = BASE_SCORE + sum(events)
  const byDate: Record<string, typeof events> = {}
  for (const e of events || []) {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date]!.push(e)
  }

  const dailyScores = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEvents]) => ({
      date,
      events: dayEvents,
      eventTotal: dayEvents!.reduce((s, e) => s + Number(e.points), 0),
      dayScore: BASE_SCORE + dayEvents!.reduce((s, e) => s + Number(e.points), 0),
    }))

  const todayEvents = byDate[today] ?? []
  const todayEventTotal = todayEvents.reduce((s, e) => s + Number(e.points), 0)
  const todayScore = BASE_SCORE + todayEventTotal

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
    .or('hide_from_hr.is.null,hide_from_hr.eq.false,name.eq.Karthik')

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
