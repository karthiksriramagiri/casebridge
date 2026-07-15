import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

export const POINT_VALUES: Record<string, number> = {
  // Positives
  lead_closed:              2,
  perfect_day:              1,
  good_call:                1,
  // Negatives
  missed_checkmark:        -1,
  no_call_after_checkmark: -3,
  missed_followup_call:    -2,
  late_clockin:            -1,
  minor_violation:         -0.25,
  bad_call:                -1,
}

const BASE_SCORE = 2
const MAX_SCORE = 5

// GET /api/teams/admin/score-events — full scoreboard + today's scores
export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Accept client-supplied date to avoid UTC/local timezone mismatch
  const clientDate = req.nextUrl.searchParams.get('date')
  const today = clientDate || new Date().toISOString().slice(0, 10)

  const [eventsRes, repsRes, leadsRes] = await Promise.all([
    admin
      .from('score_events')
      .select('id, user_id, event_type, points, note, date, auto_generated, created_at, profiles!score_events_user_id_fkey(name)')
      .order('created_at', { ascending: false }),
    admin
      .from('profiles')
      .select('id, name')
      .eq('role', 'rep')
      .eq('team_type', 'intake')
      .or('hide_from_hr.is.null,hide_from_hr.eq.false'),
    admin
      .from('ghl_leads')
      .select('closed_by_profile_id, case_status')
      .not('closed_by_profile_id', 'is', null),
  ])

  const events = eventsRes.data || []
  const reps = repsRes.data || []

  // Count closes per rep from ghl_leads (anything that's not a replacement or cancelled)
  const closesByRep: Record<string, number> = {}
  for (const lead of leadsRes.data || []) {
    const status = (lead.case_status || '').toLowerCase()
    if (status === 'replacement' || status === 'cancelled') continue
    const pid = lead.closed_by_profile_id
    if (pid) closesByRep[pid] = (closesByRep[pid] ?? 0) + 1
  }

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
      todayScore: Math.min(MAX_SCORE, BASE_SCORE + (todayByRep[r.id] ?? 0)),
      todayEventTotal: todayByRep[r.id] ?? 0,
      closes: closesByRep[r.id] ?? 0,
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

  // Notify Slack
  {
    const { data: repProfile } = await admin.from('profiles').select('name').eq('id', user_id).single()
    const repName = repProfile?.name || user_id
    const EVENT_NAMES: Record<string, string> = {
      lead_closed:             'Lead Closed',
      perfect_day:             'Perfect Day Bonus',
      good_call:               'Good Call Quality',
      missed_checkmark:        'Lead Not Checkmarked in Time',
      missed_followup_call:    'Missed Follow-Up / Chase Call',
      late_clockin:            'Late Clock-In',
      minor_violation:         'Minor Rule Violation',
      bad_call:                'Bad Call Quality',
    }
    const label = EVENT_NAMES[event_type] || event_type
    const noteStr = note ? `\n*Note:* ${note}` : ''
    const icon = points > 0 ? '✅' : '⚠️'
    const ptsStr = points > 0 ? `+${points}` : `${points}`

    const perfWebhook = process.env.SLACK_PERFORMANCE_WEBHOOK
    if (perfWebhook && points < 0) {
      fetch(perfWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `⚠️ *${label} — ${repName}*\n*Penalty:* ${points} pt (manual)${noteStr}` }),
      }).catch(() => {})
    }

    try {
      const res = await fetch('https://hooks.slack.com/services/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', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${icon} *${repName}* — ${label}\n*Points:* ${ptsStr}${noteStr}` }),
      })
      console.log('[rep-score-webhook] status:', res.status, await res.text())
    } catch (e) {
      console.error('[rep-score-webhook] error:', e)
    }
  }

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
