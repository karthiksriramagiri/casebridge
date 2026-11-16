import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const VoiceResponse = twilio.twiml.VoiceResponse

/* ═══════════════════════════════════════════════════════════════════════════
   What the forwarded phone hears.

   Two steps, and the first one is the important one.

   A phone that goes to voicemail answers the call. If this bridged
   straight through, the caller would be handed to a voicemail greeting and
   the dialer would record a successful pickup — the exact failure the
   forward exists to stop, wearing a different hat. So the phone is asked
   to press 1 first. Voicemail cannot press 1.

   Only after the keypress does the leg join the conference the caller is
   already holding in, with `startConferenceOnEnter` — which is the moment
   the hold music stops.
   ═══════════════════════════════════════════════════════════════════════════ */

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.trim()}`
  return 'https://acutely-pronto-unloved.ngrok-free.dev'
}

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const conf = q.get('conf') ?? ''
  const inbound = q.get('inbound') ?? ''
  const who = q.get('who') ?? ''
  const body = new URLSearchParams(await req.text())
  const digits = body.get('Digits')

  const twiml = new VoiceResponse()
  const base = baseUrl()

  if (!conf) {
    twiml.say('This call could not be connected.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
  }

  /* First pass: ask for the keypress. */
  if (!digits) {
    const again = new URL(`${base}/api/dialer/twiml/forward-join`)
    again.searchParams.set('conf', conf)
    if (inbound) again.searchParams.set('inbound', inbound)
    if (who) again.searchParams.set('who', who)

    const gather = twiml.gather({
      numDigits: 1,
      timeout: 10,
      action: again.toString(),
      method: 'POST',
    } as any)
    gather.say(
      { voice: 'Polly.Joanna' } as any,
      who
        ? `Inbound CaseBridge call from ${who}. Press 1 to take it.`
        : 'Inbound CaseBridge call. Press 1 to take it.',
    )
    /* No key pressed — this is a voicemail, or nobody is there. Hang this
       leg up quietly; the caller is still holding and the browser can
       still answer. */
    twiml.hangup()
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
  }

  if (digits !== '1') {
    twiml.say('Call declined.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
  }

  /* A human pressed 1. Mark the call answered before bridging, so the
     browser overlay stops ringing on every rep's screen rather than
     showing a call that is already in progress on someone's phone. */
  if (inbound) {
    try {
      await db()
        .from('dialer_inbound_queue')
        .update({
          status: 'answered',
          answered_by: 'forward',
          answered_via: 'forward',
          answered_at: new Date().toISOString(),
        })
        .eq('call_sid', inbound)
        .eq('status', 'ringing')
    } catch (err) {
      /* The migration may not have been run, so `answered_via` may not
         exist. Losing the label must not cost us the bridge. */
      console.warn('[dialer:forward-join] could not mark answered', (err as Error).message)
    }
  }

  const dial = twiml.dial()
  dial.conference(
    {
      /* This is what releases the caller from the hold music. */
      startConferenceOnEnter: 'true',
      /* And this ends the call when the phone hangs up, the same way a
         rep leaving the browser conference ends it. */
      endConferenceOnExit: 'true',
      beep: 'false',
      statusCallback: `${base}/api/dialer/twiml/conference-status`,
      statusCallbackEvent: 'start end join leave',
      statusCallbackMethod: 'POST',
    } as any,
    conf,
  )

  return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } })
}
