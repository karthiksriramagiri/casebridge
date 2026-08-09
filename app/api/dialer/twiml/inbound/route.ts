import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

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
  const body = await req.formData()
  const callSid = body.get('CallSid')?.toString() ?? ''
  const from    = body.get('From')?.toString() ?? ''
  const to      = body.get('To')?.toString() ?? ''

  console.log('[dialer:inbound]', { callSid, from, to })

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
    contact_id:      contactId,
    contact_name:    contactName,
    firm,
    status:          'ringing',
  }, { onConflict: 'call_sid' })

  // Slack notification — fire and forget
  const INBOUND_SLACK_WEBHOOK = process.env.SLACK_INBOUND_CALL_WEBHOOK ?? ''
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
