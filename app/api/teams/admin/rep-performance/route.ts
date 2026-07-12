import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_SCORE = 2

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const repId = req.nextUrl.searchParams.get('repId')
  if (!repId) return NextResponse.json({ error: 'repId required' }, { status: 400 })

  const clientDate = req.nextUrl.searchParams.get('date')
  const today = clientDate || new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [profileRes, eventsRes, closesRes] = await Promise.all([
    admin.from('profiles').select('id, name').eq('id', repId).single(),
    admin.from('score_events')
      .select('id, event_type, points, note, date, auto_generated, created_at')
      .eq('user_id', repId)
      .gte('date', thirtyDaysAgo)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    admin.from('ghl_leads')
      .select('id')
      .eq('closed_by_profile_id', repId)
      .not('case_status', 'in', '("replacement","cancelled")'),
  ])

  const profile = profileRes.data
  const events = eventsRes.data || []
  const closes = closesRes.data?.length ?? 0

  // Group events by date
  const byDate: Record<string, typeof events> = {}
  for (const e of events) {
    if (!byDate[e.date]) byDate[e.date] = []
    byDate[e.date].push(e)
  }

  // Only show days that have events, sorted newest first
  const dailyScores = Object.entries(byDate)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEvents]) => {
      const eventTotal = dayEvents.reduce((s, e) => s + Number(e.points), 0)
      return { date, events: dayEvents, eventTotal, dayScore: BASE_SCORE + eventTotal }
    })

  const todayEvents = byDate[today] ?? []
  const todayScore = BASE_SCORE + todayEvents.reduce((s, e) => s + Number(e.points), 0)

  return NextResponse.json({ profile, dailyScores, todayScore, todayEvents, closes, baseScore: BASE_SCORE })
}
