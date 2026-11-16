import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cancelForwardLeg } from '@/lib/dialer/forward'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST /api/dialer/call/answer-inbound
// Rep claims an inbound call — atomically marks it as answered.
// Returns confName so the client can join via device.connect().
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
    .select('conference_name, caller_phone, contact_id, contact_name, firm, forward_call_sid')
    .maybeSingle()

  if (error || !claimed) {
    return NextResponse.json({ error: 'Call already answered or missed' }, { status: 409 })
  }

  /* The rep got there first, so stop the phone ringing. Not awaited: the
     rep is already joining the conference and should not wait on Twilio's
     API to hear the caller. */
  void cancelForwardLeg((claimed as any).forward_call_sid)

  /* Which way it was answered, for the miss-rate question this whole
     forward exists to answer. Best-effort — the column arrives with
     migration_inbound_forward.sql. */
  void db.from('dialer_inbound_queue')
    .update({ answered_via: 'browser' })
    .eq('call_sid', callSid)
    .then(({ error: e }) => { if (e) console.warn('[answer-inbound] answered_via not stored') })

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
