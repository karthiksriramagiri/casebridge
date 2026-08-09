import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST /api/dialer/call/reject-inbound
// Reject a ringing inbound call — terminate via Twilio API + update DB.
export async function POST(req: NextRequest) {
  const { callSid, callerPhone } = await req.json()
  if (!callSid && !callerPhone) {
    return NextResponse.json({ error: 'callSid or callerPhone required' }, { status: 400 })
  }

  const db     = supabaseAdmin()
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const now    = new Date().toISOString()

  let terminated = false

  // Strategy 1: If we have a real call SID, use it directly
  if (callSid) {
    try {
      await client.calls(callSid).update({
        twiml: '<Response><Hangup/></Response>',
      })
      terminated = true
      console.log('[reject-inbound] terminated via callSid:', callSid)
    } catch (err) {
      console.error('[reject-inbound] twiml redirect failed for', callSid, err)
      try {
        await client.calls(callSid).update({ status: 'completed' })
        terminated = true
      } catch (err2) {
        console.error('[reject-inbound] status update also failed', err2)
      }
    }
  }

  // Strategy 2: Find active inbound calls from this phone number
  if (!terminated && callerPhone) {
    console.log('[reject-inbound] callSid failed/empty, searching by phone:', callerPhone)
    try {
      const activeCalls = await client.calls.list({
        from: callerPhone,
        status: 'in-progress',
        limit: 5,
      })
      // Also check queued/ringing calls
      const ringingCalls = await client.calls.list({
        from: callerPhone,
        status: 'ringing',
        limit: 5,
      })
      const queuedCalls = await client.calls.list({
        from: callerPhone,
        status: 'queued',
        limit: 5,
      })

      const allCalls = [...activeCalls, ...ringingCalls, ...queuedCalls]
      console.log('[reject-inbound] found', allCalls.length, 'active calls from', callerPhone)

      for (const call of allCalls) {
        try {
          await client.calls(call.sid).update({
            twiml: '<Response><Hangup/></Response>',
          })
          terminated = true
          console.log('[reject-inbound] terminated call', call.sid, 'via phone lookup')
        } catch (err) {
          await client.calls(call.sid).update({ status: 'completed' }).catch(console.error)
          terminated = true
        }
      }
    } catch (err) {
      console.error('[reject-inbound] phone lookup failed', err)
    }
  }

  // Strategy 3: End any conference matching this call
  if (!terminated) {
    console.log('[reject-inbound] trying conference termination')
    try {
      const confName = callSid ? `inbound-${callSid}` : null
      // Search for active conferences
      const conferences = await client.conferences.list({
        status: 'in-progress',
        limit: 20,
      })
      // Also check init status
      const initConfs = await client.conferences.list({
        status: 'init',
        limit: 20,
      })

      const allConfs = [...conferences, ...initConfs]
      for (const conf of allConfs) {
        if (conf.friendlyName.startsWith('inbound-')) {
          // If we have a specific confName, match it; otherwise end all ringing inbound conferences
          if (!confName || conf.friendlyName === confName) {
            await client.conferences(conf.sid).update({ status: 'completed' })
            terminated = true
            console.log('[reject-inbound] ended conference', conf.friendlyName, conf.sid)
          }
        }
      }
    } catch (err) {
      console.error('[reject-inbound] conference termination failed', err)
    }
  }

  // Update DB — handle both cases: real call_sid or empty
  if (callSid) {
    await db.from('dialer_inbound_queue')
      .update({ status: 'rejected', ended_at: now })
      .eq('call_sid', callSid)
    await db.from('dialer_calls')
      .update({ call_status: 'rejected', ended_at: now })
      .eq('call_sid', callSid)
  }
  if (callerPhone) {
    // Also update by phone for the empty-callSid case
    await db.from('dialer_inbound_queue')
      .update({ status: 'rejected', ended_at: now })
      .eq('caller_phone', callerPhone)
      .eq('status', 'ringing')
    await db.from('dialer_calls')
      .update({ call_status: 'rejected', ended_at: now })
      .eq('phone', callerPhone)
      .eq('call_status', 'ringing')
  }

  console.log('[reject-inbound] done, terminated:', terminated)
  return NextResponse.json({ ok: true, terminated })
}
