import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.trim()}`
  return 'https://acutely-pronto-unloved.ngrok-free.dev'
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text()
  const body     = new URLSearchParams(rawBody)
  const event    = body.get('StatusCallbackEvent')
  const confName = body.get('FriendlyName') ?? ''
  const confSid  = body.get('ConferenceSid') ?? ''
  const callSid  = body.get('CallSid') ?? ''
  const label    = body.get('Label') ?? ''

  const db = supabaseAdmin()

  if (event === 'conference-start') {
    // 1. Update the active session with the real conference SID
    const { data: session } = await db
      .from('dialer_active_sessions')
      .update({ conference_sid: confSid })
      .eq('conference_name', confName)
      .select('customer_call_sid')
      .single()

    // 2. Stamp conference_sid onto the customer's dialer_calls row
    if (session?.customer_call_sid) {
      await db.from('dialer_calls')
        .update({ conference_sid: confSid })
        .eq('call_sid', session.customer_call_sid)
    }

    // 3. Start dual-channel conference recording via Twilio REST API directly.
    //    The twilio SDK v6 doesn't expose conferences().recordings.create(),
    //    so we call the REST endpoint with fetch() instead.
    const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim()
    const authToken  = process.env.TWILIO_AUTH_TOKEN!.trim()
    const base       = baseUrl()
    const twilioAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    try {
      const recRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Conferences/${confSid}/Recordings.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${twilioAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            RecordingChannels: 'two',
            RecordingStatusCallback: `${base}/api/dialer/twiml/recording`,
            RecordingStatusCallbackMethod: 'POST',
          }).toString(),
        }
      )
      if (!recRes.ok) {
        const errText = await recRes.text()
        console.error('[dialer:conference-status] Twilio recording API error', recRes.status, errText)
      } else {
        console.log('[dialer:conference-status] dual-channel recording started for', confSid)
      }
    } catch (err) {
      console.error('[dialer:conference-status] failed to start recording', err)
    }
  }

  if (event === 'participant-join' && label !== 'customer') {
    // Rep joined — store their call SID for whisper coaching
    await db.from('dialer_active_sessions')
      .update({ rep_call_sid: callSid })
      .eq('conference_name', confName)

    // Also stamp rep_call_sid onto dialer_calls so recording/route can find it
    await db.from('dialer_calls')
      .update({ rep_call_sid: callSid })
      .eq('conference_sid', confSid)
  }

  if (event === 'conference-end') {
    await db.from('dialer_active_sessions')
      .delete()
      .eq('conference_name', confName)
  }

  return new NextResponse(null, { status: 204 })
}
