import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST /api/dialer/call/end
// Called by the rep's browser when they click hang up.
// Force-terminates the customer's outbound call leg and clears the active session.
// This handles the case where the rep disconnects before fully joining the conference,
// which would otherwise leave the customer's call ringing indefinitely.
export async function POST(req: NextRequest) {
  const { identity } = await req.json()
  if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 })

  const db = supabaseAdmin()

  // Look up the active session for this rep
  const { data: session } = await db
    .from('dialer_active_sessions')
    .select('customer_call_sid, conference_sid, conference_name, started_at')
    .eq('rep_identity', identity)
    .maybeSingle()

  if (!session) return NextResponse.json({ ok: true, note: 'no active session' })

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

  // Kill the customer's outbound call leg
  if (session.customer_call_sid) {
    await client.calls(session.customer_call_sid)
      .update({ status: 'completed' })
      .catch(() => {}) // ignore if already ended
  }

  // End the conference if it exists (by SID or by name)
  if (session.conference_sid) {
    await client.conferences(session.conference_sid)
      .update({ status: 'completed' } as any)
      .catch(() => {})
  } else if (session.conference_name) {
    // Inbound calls may not have conference_sid yet — find by friendly name
    const confs = await client.conferences.list({
      friendlyName: session.conference_name,
      status: 'in-progress',
      limit: 1,
    }).catch(() => [] as any[])
    for (const c of confs) {
      await client.conferences(c.sid)
        .update({ status: 'completed' } as any)
        .catch(() => {})
    }
  }

  // Mark the call as completed — but don't overwrite duration if Twilio
  // already set it via status callback (which has the real talk time).
  if (session.customer_call_sid) {
    const { data: existingCall } = await db.from('dialer_calls')
      .select('duration, call_status')
      .eq('call_sid', session.customer_call_sid)
      .maybeSingle()

    // Only update duration if Twilio hasn't already set it
    const alreadyHasDuration = (existingCall?.duration ?? 0) > 0
    await db.from('dialer_calls').update({
      call_status: 'completed',
      ...(!alreadyHasDuration ? { duration: 0 } : {}),
      ended_at: new Date().toISOString(),
      ended_by: 'rep',
    }).eq('call_sid', session.customer_call_sid)
  }

  // Clear the active session — conference-end webhook will also try this but that's fine
  await db.from('dialer_active_sessions')
    .delete()
    .eq('rep_identity', identity)

  return NextResponse.json({ ok: true })
}
