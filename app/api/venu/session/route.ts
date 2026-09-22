import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'
import { randomScenario } from '@/app/venu/_lib/nuance-scenarios'
import { getLead, voiceFor } from '@/app/venu/_lib/nuance-leads'
import { loadWeights, weightFor } from '@/app/venu/_lib/draw-weights'
import { putSession } from '@/app/venu/_lib/session-state'
import type { Mode } from '@/app/venu/_lib/types'

const OPENERS = ['Hello?', 'Hello, this is...?', 'Hi, who\'s this?', 'Yeah, hello?', 'Hello?']

// Opens a session and picks the scenario. The fact pattern never leaves the
// server — the rep is supposed to find it by asking.
export async function POST(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!user.setter) {
    return NextResponse.json({ error: 'You do not have setter training enabled yet.' }, { status: 403 })
  }

  const { mode } = (await req.json()) as { mode: Mode }
  if (mode !== 'practice' && mode !== 'test') {
    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })
  }

  const db = venuAdmin()

  // Don't hand a rep the same case twice in a row — keep the drills fresh.
  const { data: recent } = await db
    .from('venu_sessions')
    .select('scenario_id')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(15)

  const weights = await loadWeights()
  const scenario = randomScenario({
    exclude: (recent ?? []).map((r) => r.scenario_id),
    weightOf: (s) => weightFor(s, weights),
  })

  const { data, error } = await db
    .from('venu_sessions')
    .insert({
      user_id: user.id,
      rep_name: user.name,
      scenario_id: scenario.id,
      scenario_title: scenario.title,
      scenario_category: scenario.category,
      track: 'setter',
      mode,
      status: 'live',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[venu:session] insert failed', error)
    return NextResponse.json({ error: 'Could not start the session' }, { status: 500 })
  }

  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)]

  // Seed the live conversation with the line the caller is about to say, so she
  // remembers answering the phone.
  putSession(data.id, {
    scenarioId: scenario.id,
    userId: user.id,
    history: [{ speaker: 'caller', text: opener }],
  })

  return NextResponse.json({
    sessionId: data.id,
    opener,
    // What the PC sees on screen when the call connects. Safe to send: it is
    // the client's own coarse self-report, not the fact pattern.
    lead: getLead(scenario.id) ?? null,
    voice: voiceFor(scenario.id),
  })
}
