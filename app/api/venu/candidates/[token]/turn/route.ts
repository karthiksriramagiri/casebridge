import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/app/venu/_lib/anthropic'
import { deepgramKey, venuAdmin } from '@/app/venu/_lib/auth'
import { prewarm } from '@/app/venu/_lib/tts-prewarm'
import {
  OPENING, DONE_MARKER, SHIFTS_MARKER, PAY_MARKER, MARKERS, VENU_VOICE,
  interviewerSystem, nextStep, turnsOf, candidateIsComplete, type Turn,
} from '@/app/venu/_lib/candidates'
import { notifyNewSubmission } from '@/app/venu/_lib/candidate-notify'

/* One turn of the interview: their audio in, Venu's reply out.

   Transcription and the reply are strictly sequential, so they happen in one
   request — two round trips would put the network leg in front of a candidate
   who is already sitting in silence. The synthesis is kicked off here too, the
   moment the reply exists, so the browser's request for the audio lands on a
   connection that is already filling. */

export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const db = venuAdmin()

  const { data: row } = await db.from('venu_candidates').select('*').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (row.status !== 'invited') return NextResponse.json({ error: 'This interview is already in.' }, { status: 409 })

  const turns = turnsOf(row)
  const audio = await req.arrayBuffer()

  /* The opening needs no model call — it is the same every time, and making a
     candidate wait on an LLM to say hello is latency for nothing. */
  if (turns.length === 0 && audio.byteLength < 2000) {
    const opening: Turn = { who: 'venu', text: OPENING }
    await save(db, row, [opening])
    prewarm(OPENING, VENU_VOICE)
    return NextResponse.json({ reply: OPENING, index: 0, done: false })
  }

  /* The utterance is transcribed and thrown away. The call is recorded whole,
     in the browser, and uploaded once at the end — a player per answer turned
     a review into a dozen four-second clips to click through. */
  const sttRes = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true',
    {
      method: 'POST',
      headers: { Authorization: `Token ${deepgramKey()}`, 'Content-Type': 'audio/webm' },
      body: audio,
      cache: 'no-store',
    }
  )
  const stt = await sttRes.json().catch(() => null)
  const said: string = stt?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ''

  // Nothing intelligible — say so rather than letting the model invent a reply
  // to silence.
  if (!said) {
    return NextResponse.json({
      reply: 'Sorry, I did not catch that — could you say it again?',
      transcript: '',
      index: turns.length,
      done: false,
      retry: true,
    })
  }

  const ms = Number(req.headers.get('x-utterance-ms') ?? 0)
  const history: Turn[] = [...turns, { who: 'candidate', text: said, ms }]

  const model = process.env.VENU_TURN_MODEL || 'claude-haiku-4-5'
  const completion = await anthropic().messages.create({
    model,
    // The pay block is a long line she must deliver whole; a tight cap cut it
    // off mid-sentence and she never reached the question that ends the call.
    max_tokens: 420,
    // The step is recomputed every turn from what has actually happened, so
    // she cannot get stuck chasing an answer that is not coming.
    system: `${interviewerSystem(row.name)}\n\n${nextStep(history)}`,
    messages: history.map(t => ({
      role: t.who === 'venu' ? ('assistant' as const) : ('user' as const),
      content: t.text,
    })),
  })

  const raw = completion.content
    .map((b: any) => (b.type === 'text' ? b.text : ''))
    .join(' ')
    .trim()

  /* The marker is the intended signal, but it is a token the model has to
     remember to emit and it does not always do so. When it forgets, the
     interview never ends: the phone box never opens, the recording is never
     saved, and the candidate reads their number out to nobody. That failure
     was invisible — every candidate on file had a phone or a recording
     missing because of it.

     So the close is also recognised from the sentence itself. Asking for a
     number in the closing breath is unambiguous enough to act on, and acting
     early costs nothing: the box appears, which is what we wanted anyway. */
  const asksForNumber = /\b(phone|number|cell|mobile|digits)\b/i.test(raw)
    && /\b(share|give|leave|send|what(?:'s| is)|can i (?:get|have)|could you)\b/i.test(raw)

  const done = raw.includes(DONE_MARKER) || asksForNumber
  // What the page should put on screen alongside this line. A panel is shown
  // once: she sometimes marks two turns running while she waits for an answer,
  // and the shifts appearing twice in the feed just reads as a glitch.
  const alreadyShown = new Set(turns.map(t => t.card).filter(Boolean))
  const marked = raw.includes(SHIFTS_MARKER) ? 'shifts' as const
    : raw.includes(PAY_MARKER) ? 'pay' as const
    : undefined
  const card = marked && !alreadyShown.has(marked) ? marked : undefined

  let spoken = raw
  for (const m of MARKERS) spoken = spoken.replaceAll(m, '')
  spoken = spoken.replace(/\s+/g, ' ').trim()

  const next: Turn[] = [...history, { who: 'venu', text: spoken, card }]
  await save(db, row, next)

  // Start the synthesis now; the browser is about to ask for it.
  prewarm(spoken, VENU_VOICE)

  return NextResponse.json({
    transcript: said,
    reply: spoken,
    card,
    index: next.length - 1,
    done,
  })
}

async function save(db: ReturnType<typeof venuAdmin>, row: any, turns: Turn[]) {
  const answers = { ...(row.answers ?? {}), turns }
  const complete = candidateIsComplete({ ...row, answers })
  await db.from('venu_candidates').update({
    answers,
    ...(complete && row.status === 'invited'
      ? { status: 'submitted', submitted_at: new Date().toISOString() }
      : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', row.id)
  if (complete && row.status === 'invited') {
    const { data: saved } = await db.from('venu_candidates').select('*').eq('id', row.id).single()
    if (saved) await notifyNewSubmission(saved)
  }
}
