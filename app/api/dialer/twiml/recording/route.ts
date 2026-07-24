import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Twilio POSTs here when a recording is ready — both direct-dial and conference recordings.
// Conference recordings include ConferenceSid; direct-dial recordings include CallSid.
export async function POST(req: NextRequest) {
  const body = await req.formData()

  const recordingSid    = body.get('RecordingSid')?.toString()    ?? ''
  const recordingUrl    = body.get('RecordingUrl')?.toString()    ?? ''
  const recordingStatus = body.get('RecordingStatus')?.toString() ?? ''
  const recordingChannels = parseInt(body.get('RecordingChannels')?.toString() ?? '1', 10)
  const duration        = parseInt(body.get('RecordingDuration')?.toString() ?? '0', 10)
  const conferenceSid   = body.get('ConferenceSid')?.toString()   ?? ''
  const rawCallSid      = body.get('CallSid')?.toString()         ?? ''

  console.log('[dialer:recording]', { recordingSid, recordingStatus, conferenceSid, rawCallSid, duration, recordingChannels })

  if (recordingStatus !== 'completed' || !recordingUrl) {
    return new NextResponse(null, { status: 204 })
  }

  const db = supabaseAdmin()

  // Resolve which dialer_calls row this recording belongs to.
  // Conference recordings: look up by conference_sid.
  // Direct-dial recordings: call_sid IS the customer's call SID.
  let callSid = rawCallSid
  if (conferenceSid) {
    const { data: callRow } = await db
      .from('dialer_calls')
      .select('call_sid')
      .eq('conference_sid', conferenceSid)
      .maybeSingle()

    if (callRow?.call_sid) {
      callSid = callRow.call_sid
    } else {
      console.warn('[dialer:recording] no dialer_calls row found for conference', conferenceSid)
    }
  }

  if (!callSid) {
    console.warn('[dialer:recording] could not resolve call_sid — skipping')
    return new NextResponse(null, { status: 204 })
  }

  // Persist recording info on the call row
  await db.from('dialer_calls').update({
    recording_url: `${recordingUrl}.mp3`,
    recording_sid: recordingSid,
    duration,
  }).eq('call_sid', callSid)

  // Insert a pending transcript row
  const { data: transcriptRow } = await db
    .from('dialer_transcripts')
    .insert({ call_sid: callSid, status: 'pending' })
    .select('id')
    .single()

  const deepgramKey = process.env.DEEPGRAM_API_KEY
  if (!deepgramKey) {
    console.warn('[dialer:recording] No DEEPGRAM_API_KEY — skipping transcription')
    return new NextResponse(null, { status: 204 })
  }

  // Build authenticated URL so Deepgram can fetch the audio from Twilio
  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim()
  const authToken  = process.env.TWILIO_AUTH_TOKEN!.trim()
  const audioUrl   = `https://${accountSid}:${authToken}@${recordingUrl.replace('https://', '')}.mp3`

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://acutely-pronto-unloved.ngrok-free.dev')

  const callbackUrl = `${baseUrl}/api/dialer/twiml/transcript-callback?transcriptId=${transcriptRow?.id ?? ''}&callSid=${callSid}`

  // Use multichannel when we have a dual-channel recording (rep vs customer separated)
  const dgParams = new URLSearchParams({
    model:        'nova-2',
    smart_format: 'true',
    multichannel: recordingChannels >= 2 ? 'true' : 'false',
    utterances:   'true',
    punctuate:    'true',
    summarize:    'v2',    // free built-in summary
    language:     'en-US',
    callback:     callbackUrl,
  })

  const dgRes = await fetch(`${DEEPGRAM_URL}?${dgParams}`, {
    method: 'POST',
    headers: {
      Authorization:  `Token ${deepgramKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: audioUrl }),
  })

  if (!dgRes.ok) {
    const err = await dgRes.text()
    console.error('[dialer:recording] Deepgram error', dgRes.status, err)
    await db.from('dialer_transcripts').update({ status: 'failed' }).eq('id', transcriptRow?.id)
  } else {
    const dgData    = await dgRes.json()
    const requestId = dgData.request_id ?? ''
    await db.from('dialer_transcripts').update({ request_id: requestId }).eq('id', transcriptRow?.id)
    console.log('[dialer:recording] Deepgram request submitted', requestId)
  }

  return new NextResponse(null, { status: 204 })
}
