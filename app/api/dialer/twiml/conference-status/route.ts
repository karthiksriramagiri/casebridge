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
  const body     = await req.formData()
  const event    = body.get('StatusCallbackEvent')?.toString()
  const confName = body.get('FriendlyName')?.toString() ?? ''
  const confSid  = body.get('ConferenceSid')?.toString() ?? ''
  const callSid  = body.get('CallSid')?.toString() ?? ''
  const label    = body.get('Label')?.toString() ?? ''

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

    // 3. Start dual-channel conference recording via REST API.
    //    TwiML-based recording can't request two channels; REST API can.
    //    Channel 0 = outbound leg (customer), Channel 1 = inbound leg (rep).
    const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
    const base   = baseUrl()
    try {
      await (client.conferences(confSid).recordings as any).create({
        recordingChannels: 'two',
        recordingStatusCallback: `${base}/api/dialer/twiml/recording`,
        recordingStatusCallbackMethod: 'POST',
      })
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
