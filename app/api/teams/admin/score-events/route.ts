import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

export const POINT_VALUES: Record<string, number> = {
  lead_closed:      2,
  good_call:        1,
  todo_complete:    1,
  late_clockin:    -0.5,
  minor_violation: -0.25,
  bad_call:        -1,
  slow_checkmark:  -1,
}

const BASE_SCORE = 3

// GET /api/teams/admin/score-events — full scoreboard + today's scores
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().slice(0, 10)

  const [eventsRes, repsRes] = await Promise.all([
    admin
      .from('score_events')
      .select('id, user_id, event_type, points, note, date, auto_generated, created_at, profiles!score_events_user_id_fkey(name)')
      .order('created_at', { ascending: false }),
    admin.from('profiles').select('id, name').eq('role', 'rep'),
  ])

  const events = eventsRes.data || []
  const reps = repsRes.data || []

  // Today's score per rep = BASE_SCORE + today's events sum
  const todayByRep: Record<string, number> = {}
  for (const e of events) {
    if (e.date === today) {
      todayByRep[e.user_id] = (todayByRep[e.user_id] ?? 0) + Number(e.points)
    }
  }

  const scoreboard = reps
    .map(r => ({
      id: r.id,
      name: r.name,
      todayScore: BASE_SCORE + (todayByRep[r.id] ?? 0),
      todayEventTotal: todayByRep[r.id] ?? 0,
    }))
    .sort((a, b) => b.todayScore - a.todayScore)

  return NextResponse.json({ events, scoreboard, baseScore: BASE_SCORE })
}

// POST /api/teams/admin/score-events — log a manual event
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { user_id, event_type, note, date } = body

  if (!user_id || !event_type) {
    return NextResponse.json({ error: 'user_id and event_type are required' }, { status: 400 })
  }

  const points = POINT_VALUES[event_type]
  if (points === undefined) {
    return NextResponse.json({ error: `Unknown event type: ${event_type}` }, { status: 400 })
  }

  const { data, error } = await admin
    .from('score_events')
    .insert({
      user_id,
      event_type,
      points,
      note: note?.trim() || null,
      date: date || new Date().toISOString().slice(0, 10),
      created_by: user.id,
      auto_generated: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

// DELETE /api/teams/admin/score-events?id=...
export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await admin.from('score_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
