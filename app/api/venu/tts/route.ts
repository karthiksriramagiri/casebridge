import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, deepgramKey } from '@/app/venu/_lib/auth'
import { claim } from '@/app/venu/_lib/tts-prewarm'
import { venuAdmin } from '@/app/venu/_lib/auth'
import { voiceFor } from '@/app/venu/_lib/nuance-leads'

// Venu's voice.
//
// This is a GET so the browser's <audio> element can stream it directly.
// Deepgram starts returning audio ~250ms in but takes ~3s to finish a sentence,
// so buffering the whole response before playback (the obvious POST + blob
// shape) adds about three seconds of dead air to every single turn.

export async function GET(req: NextRequest) {
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const text = req.nextUrl.searchParams.get('text')
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  // Resolve the voice in this order: an explicit one, then the session's own
  // caller, then a neutral default.
  //
  // The fallback used to be aura-2-thalia-en — the original bright voice this
  // was moved off — so any caller that reached this route without an explicit
  // voice came out sounding like a cheerful woman regardless of who they were.
  let model = req.nextUrl.searchParams.get('voice') ?? ''

  if (!model.startsWith('aura')) {
    const sessionId = req.nextUrl.searchParams.get('session')
    if (sessionId) {
      const { data } = await venuAdmin()
        .from('venu_sessions').select('scenario_id').eq('id', sessionId).single()
      if (data?.scenario_id) model = voiceFor(data.scenario_id)
    }
  }
  if (!model.startsWith('aura')) model = 'aura-2-andromeda-en'

  // If /api/venu/say already started this line, take that stream — it has a
  // head start measured in hundreds of milliseconds.
  const res = await (claim(text, model) ?? fetch(`https://api.deepgram.com/v1/speak?model=${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${deepgramKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  }))

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    console.error('[venu:tts] speak failed', res.status, detail)
    return NextResponse.json({ error: 'Text-to-speech failed' }, { status: 502 })
  }

  // Passed straight through — the bytes reach the audio element as they arrive.
  return new Response(res.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
}
