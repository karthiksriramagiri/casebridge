import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'
import { getNuanceScenario } from '@/app/venu/_lib/nuance-scenarios'
import { computeMetrics } from '@/app/venu/_lib/metrics'
import { scoreSetterSession } from '@/app/venu/_lib/scoring'
import type { Mode, Turn } from '@/app/venu/_lib/types'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { sessionId, turns, endReason } = (await req.json()) as {
    sessionId: string
    turns: Turn[]
    endReason: string
  }

  const db = venuAdmin()
  const { data: session } = await db
    .from('venu_sessions')
    .select('scenario_id, user_id, mode, track')
    .eq('id', sessionId)
    .single()

  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: 'Unknown session' }, { status: 404 })
  }

  const scenario = getNuanceScenario(session.scenario_id)
  if (!scenario) return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 })

  const metrics = computeMetrics(turns ?? [])

  await db.from('venu_sessions').update({
    status: 'scoring',
    end_reason: endReason,
    ended_at: new Date().toISOString(),
    duration_sec: metrics.durationSec,
    transcript: turns,
    metrics,
  }).eq('id', sessionId)

  if (!turns?.some((t) => t.speaker === 'rep' && t.text.trim())) {
    await db.from('venu_sessions').update({ status: 'abandoned' }).eq('id', sessionId)
    return NextResponse.json({ error: 'You never spoke — nothing to score.' }, { status: 422 })
  }

  try {
    const scorecard = await scoreSetterSession({
      scenario, turns, metrics, endReason, mode: (session.mode ?? 'practice') as Mode,
    })

    const { error } = await db.from('venu_scores').upsert({
      session_id: sessionId,
      user_id: user.id,
      overall_score: Math.round(scorecard.overallScore),
      criteria_score: Math.round(scorecard.criteriaScore),
      empathy_score: Math.round(scorecard.empathy.score),
      empathy: Math.round(scorecard.empathy.score / 10),
      nuance_caught: scorecard.nuance.caught,
      coaching_summary: scorecard.coachingSummary,
      mode: session.mode,
      track: session.track,
      scorecard,
    }, { onConflict: 'session_id' })

    if (error) {
      console.error('[venu:score] save failed', error)
      return NextResponse.json({ error: 'Scored, but could not save' }, { status: 500 })
    }

    await db.from('venu_sessions').update({ status: 'scored' }).eq('id', sessionId)
    return NextResponse.json({ sessionId })
  } catch (err) {
    console.error('[venu:score] scoring failed', err)
    await db.from('venu_sessions').update({ status: 'live' }).eq('id', sessionId)
    return NextResponse.json({ error: 'Scoring failed. Your transcript was saved.' }, { status: 502 })
  }
}
