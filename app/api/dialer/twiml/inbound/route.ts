import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { forwardNumber, startForwardLeg } from '@/lib/dialer/forward'

const VoiceResponse = twilio.twiml.VoiceResponse

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.trim()}`
  return 'https://acutely-pronto-unloved.ngrok-free.dev'
}

// Twilio POSTs here when someone calls our number.
// We put the caller into a conference with hold music and alert all reps.
export async function POST(req: NextRequest) {
  // Parse URL-encoded body reliably (formData() can silently drop fields)
  const rawBody = await req.text()
  const params  = new URLSearchParams(rawBody)
  const callSid = params.get('CallSid') ?? ''
  const from    = params.get('From') ?? ''
  const to      = params.get('To') ?? ''

  console.log('[dialer:inbound]', { callSid, from, to, rawKeys: Array.from(params.keys()) })

  if (!callSid) {
    console.error('[dialer:inbound] Missing CallSid — raw body:', rawBody.slice(0, 500))
    const twiml = new VoiceResponse()
    twiml.say('System error. Please try again.')
    twiml.hangup()
    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const db   = supabaseAdmin()
  const base = baseUrl()
  const confName = `inbound-${callSid}`

  // Look up the caller by phone number in previous calls
  const { data: prevCall } = await db.from('dialer_calls')
    .select('contact_id, contact_name, firm')
    .eq('phone', from)
    .not('contact_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const contactId   = prevCall?.contact_id ?? null
  const contactName = prevCall?.contact_name ?? null
  const firm        = prevCall?.firm ?? null

  // Write to inbound queue — Supabase Realtime will push to all rep browsers
  await db.from('dialer_inbound_queue').upsert({
    call_sid:        callSid,
    conference_name: confName,
    caller_phone:    from,
    dialed_number:   to,
    contact_id:      contactId,
    contact_name:    contactName,
    firm,
    status:          'ringing',
  }, { onConflict: 'call_sid' })

  /* Slack notification — fire and forget.

     Two spellings of this variable exist in the environment and the two
     routes that post inbound calls each read a different one:
     SLACK_INBOUND_CALL_WEBHOOK here, SLACK_INBOUND_CALLS_WEBHOOK in the
     Quo webhook. Production happens to define both, which is the only
     reason this has been firing; locally it defines only the plural, so
     the notification was silently dead in development and would have
     been dead in production the day somebody tidied the unused-looking
     one away. Either name works now. */
  const INBOUND_SLACK_WEBHOOK =
    (process.env.SLACK_INBOUND_CALL_WEBHOOK ?? process.env.SLACK_INBOUND_CALLS_WEBHOOK ?? '').trim()
  if (INBOUND_SLACK_WEBHOOK) fetch(INBOUND_SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `📞 *Inbound Call*\nCaller: ${contactName ? `${contactName} · ` : ''}${from}\nCalling: ${to}${firm ? `\nFirm: ${firm}` : ''}`,
    }),
  }).catch(err => console.error('[inbound] Slack notification failed', err))

  // Write call record
  await db.from('dialer_calls').upsert({
    call_sid:     callSid,
    phone:        from,
    contact_id:   contactId,
    contact_name: contactName,
    firm,
    direction:    'inbound',
    call_status:  'ringing',
    started_at:   new Date().toISOString(),
  }, { onConflict: 'call_sid' })

  /* Ring a real phone too.

     The conference below holds the caller on music until somebody with
     `startConferenceOnEnter` joins. Until now the only thing that could
     was a rep with the dialer open in a browser, and when nobody was
     watching the caller heard music for two minutes and was hung up on.
     The forward leg rings a phone at the same time; whichever answers
     first starts the conference and the other is cancelled.

     Fired before the TwiML is returned but deliberately not awaited for
     its result beyond the sid — the caller must not wait on Twilio's API
     to hear ringing. Disabled unless DIALER_FORWARD_NUMBER is set. */
  let forwardSid: string | null = null
  if (forwardNumber()) {
    forwardSid = await startForwardLeg({
      confName, callSid, dialedNumber: to, callerName: contactName, base,
    })
    if (forwardSid) {
      /* Best-effort: the column arrives with migration_inbound_forward.sql
         and the forward still works without it — it just cannot be
         cancelled when a rep answers first. */
      await db.from('dialer_inbound_queue')
        .update({ forward_call_sid: forwardSid })
        .eq('call_sid', callSid)
        .then(({ error }) => {
          if (error) console.warn('[dialer:inbound] forward_call_sid not stored —', error.message)
        })
    }
  }

  // TwiML: put caller into a conference with hold music
  // The conference won't truly start until a rep joins with startConferenceOnEnter=true
  const twiml = new VoiceResponse()

  // Status callback so we know when the caller hangs up
  const statusUrl = new URL(`${base}/api/dialer/twiml/inbound-status`)
  statusUrl.searchParams.set('CallSid', callSid)

  const dial = twiml.dial({
    action: statusUrl.toString(),
    timeout: 120,
  } as any)

  dial.conference({
    startConferenceOnEnter: false,
    endConferenceOnExit: true,
    waitUrl: 'http://twimlets.com/holdmusic?Bucket=com.twilio.music.soft-rock',
    waitMethod: 'GET',
    beep: false,
    statusCallback: `${base}/api/dialer/twiml/conference-status`,
    statusCallbackEvent: 'start end join leave',
    statusCallbackMethod: 'POST',
    record: 'record-from-start',
    recordingStatusCallback: `${base}/api/dialer/twiml/recording`,
    recordingStatusCallbackMethod: 'POST',
  } as any, confName)

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
