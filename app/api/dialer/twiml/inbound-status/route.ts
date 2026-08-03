import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Called when the inbound caller's <Dial> action completes (caller hung up or timeout)
export async function POST(req: NextRequest) {
  const body    = await req.formData()
  const q       = req.nextUrl.searchParams
  const callSid = body.get('CallSid')?.toString() || q.get('CallSid') || ''
  const dialStatus = body.get('DialCallStatus')?.toString() || ''

  console.log('[dialer:inbound-status]', { callSid, dialStatus })

  if (!callSid) return new NextResponse(null, { status: 204 })

  const db  = supabaseAdmin()
  const now = new Date().toISOString()

  // Mark as missed if it was still ringing (caller hung up before anyone answered)
  const { data: queueEntry } = await db.from('dialer_inbound_queue')
    .select('status')
    .eq('call_sid', callSid)
    .maybeSingle()

  if (queueEntry?.status === 'ringing') {
    await db.from('dialer_inbound_queue')
      .update({ status: 'missed', ended_at: now })
      .eq('call_sid', callSid)

    await db.from('dialer_calls')
      .update({ call_status: 'no-answer', ended_at: now })
      .eq('call_sid', callSid)
  }

  // Return empty TwiML (call is already over)
  const twilio = await import('twilio')
  const twiml = new twilio.default.twiml.VoiceResponse()
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
