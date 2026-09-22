import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { anthropic } from '@/app/venu/_lib/anthropic'
import { getVenuUser, venuAdmin, deepgramKey } from '@/app/venu/_lib/auth'
import { getNuanceScenario } from '@/app/venu/_lib/nuance-scenarios'
import { getLead } from '@/app/venu/_lib/nuance-leads'
import { personaSystem } from '@/app/venu/_lib/persona'
import { getSession, putSession } from '@/app/venu/_lib/session-state'
import { voiceFor } from '@/app/venu/_lib/nuance-leads'
import { prewarm } from '@/app/venu/_lib/tts-prewarm'
import { finish as finishStream } from '@/app/venu/_lib/stt-stream'

/**
 * One rep utterance in, one caller reply out.
 *
 * This used to be two client round trips (/stt then /turn). Each leg costs a
 * network round trip plus an auth resolve before any real work starts, and the
 * rep hears silence for all of it. Transcription and the persona turn are
 * strictly sequential anyway, so doing both server-side removes a leg for free.
 */

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const user = await getVenuUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const tAuth = Date.now()

  const sessionId = req.headers.get('x-session-id') ?? ''
  const audio = await req.arrayBuffer()

  let session = getSession(sessionId)
  if (!session) {
    // Process restarted mid-call, or this is a resumed session. Rebuild what we
    // can; the caller loses her memory of the conversation so far.
    const { data } = await venuAdmin()
      .from('venu_sessions').select('scenario_id, user_id').eq('id', sessionId).single()
    if (data) {
      session = { scenarioId: data.scenario_id, userId: data.user_id, history: [] }
      putSession(sessionId, session)
    }
  }

  if (!session || session.userId !== user.id) {
    return NextResponse.json({ error: 'Unknown session' }, { status: 404 })
  }
  const scenario = getNuanceScenario(session.scenarioId)
  if (!scenario) return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 })

  if (audio.byteLength < 2000) return NextResponse.json({ transcript: '', text: '' })

  // Keep the rep's own audio so they can listen back to the call. Fire and
  // forget: a storage hiccup must never cost the caller a turn.
  const audioPath = `${sessionId}/${Date.now()}.webm`
  void venuAdmin().storage
    .from('venu-audio')
    .upload(audioPath, audio, { contentType: 'audio/webm', upsert: true })
    .then(({ error }) => { if (error) console.warn('[venu:say] audio store failed', error.message) })

  // The live socket has been transcribing while the rep talked, so usually
  // there is only the tail left to flush. Batch is the fallback for the first
  // turn, a dropped socket, or a browser that never sent chunks.
  let transcript = (await finishStream(sessionId)) ?? ''
  let sttMode = 'stream'

  // Guard against a clipped stream. A dropped tail comes back as plausible but
  // short text, which the empty-check below would happily accept — and the last
  // few words of an intake question are usually the question itself. If the
  // transcript is too sparse for how long they spoke, redo it from the
  // complete recording, which we have anyway.
  const utteranceMs = Number(req.headers.get('x-utterance-ms') ?? 0)
  if (transcript && utteranceMs > 1500) {
    const words = transcript.trim().split(/\s+/).length
    const perSecond = words / (utteranceMs / 1000)
    if (perSecond < 1.2) {
      console.warn(`[venu:say] live transcript looks clipped (${words} words in ${Math.round(utteranceMs / 1000)}s) — redoing`)
      transcript = ''
    }
  }

  if (!transcript) {
    sttMode = 'batch'
    const sttRes = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${deepgramKey()}`,
          'Content-Type': req.headers.get('content-type') ?? 'audio/webm',
        },
        body: audio,
        cache: 'no-store',
      }
    )
    if (!sttRes.ok) {
      console.error('[venu:say] stt failed', sttRes.status)
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
    }
    const sttData = await sttRes.json()
    transcript = (sttData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim()
  }

  const tStt = Date.now()

  if (!transcript) return NextResponse.json({ transcript: '', text: '' })

  session.history.push({ speaker: 'rep', text: transcript })

  // Only the recent stretch goes to the model. Input tokens are the main thing
  // that grows during a call, and a caller answering "and your insurance?" does
  // not need turn three verbatim. The full transcript is kept client-side and
  // is what gets scored, so nothing is lost from the record.
  const RECENT_TURNS = 12
  const recent = session.history.slice(-RECENT_TURNS)
  const messages: Anthropic.MessageParam[] = recent
    .filter((t) => t.text.trim())
    .map((t) => ({ role: t.speaker === 'rep' ? 'user' : 'assistant', content: t.text }))

  // Claude requires the exchange to start with the rep.
  while (messages.length && messages[0].role !== 'user') messages.shift()

  const model = process.env.VENU_TURN_MODEL || 'claude-haiku-4-5'
  const reply = await anthropic().messages.create({
    model,
    max_tokens: 90,
    ...(model.startsWith('claude-haiku') ? {} : { output_config: { effort: 'low' as const } }),
    system: [{
      type: 'text' as const,
      text: personaSystem(scenario.story, getLead(scenario.id)),
      cache_control: { type: 'ephemeral' as const },
    }],
    messages,
  })
  const raw = reply.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const tTurn = Date.now()

  const spoken = raw.replace(/\[\[(DONE|HANGUP)\]\]/g, '').trim()
  session.history.push({ speaker: 'caller', text: spoken })

  const done = raw.includes('[[DONE]]')
  const hungUp = raw.includes('[[HANGUP]]')

  // Begin synthesising now, so the audio request that follows lands on a
  // connection that is already open and streaming.
  prewarm(spoken, voiceFor(scenario.id))

  const usage: any = reply.usage
  console.log(
    `[venu:say] auth ${tAuth - t0}ms | stt(${sttMode}) ${tStt - tAuth}ms (${audio.byteLength}B) | ` +
    `turn ${tTurn - tStt}ms (in ${usage?.input_tokens ?? '?'} cached ${usage?.cache_read_input_tokens ?? 0} out ${usage?.output_tokens ?? '?'}) | ` +
    `total ${tTurn - t0}ms`
  )

  return NextResponse.json({
    transcript,
    audioPath,
    text: spoken,
    endCall: done || hungUp,
    endReason: done ? 'completed' : hungUp ? 'hung_up' : null,
    timing: { auth: tAuth - t0, stt: tStt - tAuth, turn: tTurn - tStt },
  })
}
