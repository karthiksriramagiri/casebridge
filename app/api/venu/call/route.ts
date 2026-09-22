import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin, embedded } from '@/app/venu/_lib/auth'
import { getNuanceScenario } from '@/app/venu/_lib/nuance-scenarios'

/** Everything the review sidebar shows for one call. */
export async function GET(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id') ?? ''
  const { data: session } = await venuAdmin()
    .from('venu_sessions').select('*, venu_scores(*)').eq('id', id).single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user_id !== user.id && user.role !== 'admin') {
    return NextResponse.json({ error: 'Not yours' }, { status: 403 })
  }

  const score = embedded<any>(session.venu_scores)
  const scenario = getNuanceScenario(session.scenario_id)

  return NextResponse.json({
    id: session.id,
    title: session.scenario_title,
    category: session.scenario_category,
    mode: session.mode,
    status: session.status,
    startedAt: session.started_at,
    durationSec: session.duration_sec,
    repName: session.rep_name,
    transcript: session.transcript ?? [],
    metrics: session.metrics ?? {},
    scorecard: score?.scorecard ?? null,
    book: scenario ? { disposition: scenario.disposition, reason: scenario.reason, nuance: scenario.nuance } : null,
  })
}
