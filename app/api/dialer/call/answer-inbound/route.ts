import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST /api/dialer/call/answer-inbound
// Rep claims an inbound call — atomically marks it as answered so no other rep can grab it.
// Returns the conference name so the rep's browser can join.
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

  return NextResponse.json({
    confName:    claimed.conference_name,
    callerPhone: claimed.caller_phone,
    contactId:   claimed.contact_id,
    contactName: claimed.contact_name,
    firm:        claimed.firm,
  })
}
