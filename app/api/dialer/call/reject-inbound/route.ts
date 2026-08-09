import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST /api/dialer/call/reject-inbound
// Reject a ringing inbound call — force-redirect to hangup TwiML.
export async function POST(req: NextRequest) {
  const { callSid } = await req.json()
  if (!callSid) return NextResponse.json({ error: 'callSid required' }, { status: 400 })

  const db     = supabaseAdmin()
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const now    = new Date().toISOString()

  // Force-redirect the live call to hangup TwiML — works regardless of conference state
  try {
    await client.calls(callSid).update({
      twiml: '<Response><Hangup/></Response>',
    })
  } catch (err) {
    console.error('[reject-inbound] twiml redirect failed, trying status update', err)
    // Fallback: force-complete the call
    await client.calls(callSid).update({ status: 'completed' }).catch(console.error)
  }

  // Mark queue entry as rejected
  await db.from('dialer_inbound_queue')
    .update({ status: 'rejected', ended_at: now })
    .eq('call_sid', callSid)

  // Update call record
  await db.from('dialer_calls')
    .update({ call_status: 'rejected', ended_at: now })
    .eq('call_sid', callSid)

  return NextResponse.json({ ok: true })
}
