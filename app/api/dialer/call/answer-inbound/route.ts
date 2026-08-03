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

// POST /api/dialer/call/answer-inbound
// Rep claims an inbound call — atomically marks it as answered.
// Then adds the rep to the conference via REST API (same pattern as outbound calls).
export async function POST(req: NextRequest) {
  const { callSid, repIdentity } = await req.json()

  if (!callSid || !repIdentity) {
    return NextResponse.json({ error: 'callSid and repIdentity required' }, { status: 400 })
  }

  const db  = supabaseAdmin()
  const now = new Date().toISOString()

  // Atomically claim: only update if status is still 'ringing'
  const { data: claimed, error } = await db.from('dialer_inbound_queue')
    .update({ status: 'answered', answered_by: repIdentity, answered_at: now })
    .eq('call_sid', callSid)
    .eq('status', 'ringing')
    .select('conference_name, caller_phone, contact_id, contact_name, firm')
    .maybeSingle()

  if (error || !claimed) {
    return NextResponse.json({ error: 'Call already answered or missed' }, { status: 409 })
  }

  // Write active session so admin can see/monitor this call
  await db.from('dialer_active_sessions').upsert({
    rep_identity:      repIdentity,
    conference_name:   claimed.conference_name,
    customer_call_sid: callSid,
    customer_phone:    claimed.caller_phone,
    contact_id:        claimed.contact_id ?? '',
    contact_name:      claimed.contact_name ?? claimed.caller_phone,
    firm:              claimed.firm ?? '',
    campaign:          'Inbound',
    started_at:        now,
  }, { onConflict: 'rep_identity' })

  // Update the call record
  await db.from('dialer_calls')
    .update({
      rep_identity: repIdentity,
      call_status:  'in-progress',
      stage_name:   'Inbound',
    })
    .eq('call_sid', callSid)

  // Add rep to the conference via REST API (same approach as outbound calls).
  // This calls the rep's Twilio device, which auto-accepts and joins the conference.
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const base   = baseUrl()

  try {
    // Look up the conference by friendly name to get the SID
    const confs = await client.conferences.list({
      friendlyName: claimed.conference_name,
      limit: 1,
    })

    if (confs.length === 0) {
      console.error('[answer-inbound] Conference not found:', claimed.conference_name)
      return NextResponse.json({ error: 'Conference not found' }, { status: 404 })
    }

    const confSid   = confs[0].sid
    const statusUrl = new URL(`${base}/api/dialer/twiml/conference-status`)

    await client.conferences(confSid)
      .participants.create({
        to:                      `client:${repIdentity}`,
        from:                    process.env.TWILIO_CALLER_ID || '+12137344168',
        startConferenceOnEnter:  true,
        endConferenceOnExit:     true,
        beep:                    false,
        statusCallback:          statusUrl.toString(),
        statusCallbackEvent:     ['join', 'leave'],
        label:                   'rep',
      } as any)
  } catch (err: any) {
    console.error('[answer-inbound] Twilio error:', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to join conference' }, { status: 500 })
  }

  return NextResponse.json({
    confName:    claimed.conference_name,
    callerPhone: claimed.caller_phone,
    contactId:   claimed.contact_id,
    contactName: claimed.contact_name,
    firm:        claimed.firm,
  })
}
