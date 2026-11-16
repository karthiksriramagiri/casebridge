import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { claimForCall, isLeadSuppressed } from '@/app/dialer/_lib/queue-engine'
import { getNumberPool, selectCallerId } from '@/app/dialer/_lib/number-pool'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.trim()}`
  return 'https://acutely-pronto-unloved.ngrok-free.dev'
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { phone, contactId, contactName, identity, firm, campaign, campaignId, queueId } = body

  if (!phone || !identity) {
    return NextResponse.json({ error: 'phone and identity required' }, { status: 400 })
  }

  // Hard block on suppressed (DNC) leads — checked at dial time as final safety net
  if (contactId && await isLeadSuppressed(contactId)) {
    return NextResponse.json({ error: 'Lead is on the Do Not Call list' }, { status: 403 })
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const confName = `conf-${identity}-${Date.now()}`
  const base = baseUrl()
  const db   = supabaseAdmin()

  // Resolve dynamic caller ID (area-code match → state match → random → fallback)
  let callerIdUsed = process.env.TWILIO_CALLER_ID || '+12137344168'
  if (contactId) {
    const [pool, { data: leadState }] = await Promise.all([
      getNumberPool(),
      db.from('dialer_lead_state')
        .select('last_disposition, assigned_caller_id')
        .eq('contact_id', contactId)
        .maybeSingle(),
    ])
    callerIdUsed = selectCallerId(
      phone,
      leadState?.last_disposition ?? null,
      leadState?.assigned_caller_id ?? null,
      pool,
      firm ?? null,
    )
  }

  // Embed contact/rep info in the status callback URL — participant callbacks
  // don't carry custom body params, so we pass them as query strings instead.
  const statusUrl = new URL(`${base}/api/dialer/twiml/status`)
  if (contactId)   statusUrl.searchParams.set('ContactId',   contactId)
  if (contactName) statusUrl.searchParams.set('ContactName', contactName)
  if (identity)    statusUrl.searchParams.set('RepIdentity', identity)
  if (firm)        statusUrl.searchParams.set('Firm',        firm)
  if (campaign)    statusUrl.searchParams.set('Campaign',    campaign)
  if (campaignId)  statusUrl.searchParams.set('CampaignId',  campaignId)

  // Recording status callback — Twilio posts here when the recording is ready
  const recordingCallbackUrl = new URL(`${base}/api/dialer/twiml/recording`)
  if (contactId) recordingCallbackUrl.searchParams.set('ContactId', contactId)

  // AMD callback — Twilio posts answering machine detection result here
  const amdCallbackUrl = new URL(`${base}/api/dialer/twiml/amd`)
  if (contactId)   amdCallbackUrl.searchParams.set('ContactId',   contactId)
  if (identity)    amdCallbackUrl.searchParams.set('RepIdentity', identity)

  // Dial the customer into the conference.
  // Dual-channel conference recording is started by conference-status/route.ts.
  // Participant-level record:true is a mono fallback in case conference recording fails.
  const conferenceStatusUrl = `${base}/api/dialer/twiml/conference-status`
  let participant: any
  try {
    participant = await client.conferences(confName).participants.create({
    to: phone,
    from: callerIdUsed,
    label: 'customer',
    earlyMedia: true,
    startConferenceOnEnter: false,
    endConferenceOnExit: true,
    record: true,
    recordingStatusCallback: recordingCallbackUrl.toString(),
    recordingStatusCallbackMethod: 'POST',
    statusCallback: statusUrl.toString(),
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    conferenceStatusCallback: conferenceStatusUrl,
    conferenceStatusCallbackEvent: ['start', 'end', 'join', 'leave'],
    conferenceStatusCallbackMethod: 'POST',
    timeout: 30,
    machineDetection: 'Enable',
    asyncAmd: 'true',
    asyncAmdStatusCallback: amdCallbackUrl.toString(),
    asyncAmdStatusCallbackMethod: 'POST',
  } as any)
  } catch (err: any) {
    console.error('[dialer:call/start] Twilio error:', err?.message ?? err)
    return NextResponse.json({ error: err?.message ?? 'Failed to dial' }, { status: 502 })
  }

  const now = new Date().toISOString()

  // Store active session
  await db.from('dialer_active_sessions').upsert({
    rep_identity:       identity,
    conference_name:    confName,
    customer_call_sid:  participant.callSid,
    customer_phone:     phone,
    contact_id:         contactId ?? '',
    contact_name:       contactName ?? phone,
    firm:               firm ?? '',
    campaign:           campaign ?? '',
    started_at:         now,
  }, { onConflict: 'rep_identity' })

  // Write the call record immediately — don't rely on Twilio status callbacks
  // which can fail to reach localhost or be delayed significantly.
  await db.from('dialer_calls').upsert({
    call_sid:     participant.callSid,
    contact_id:   contactId   ?? null,
    contact_name: contactName ?? null,
    rep_identity: identity,
    phone,
    firm:         firm        ?? null,
    campaign_id:  campaignId  ?? null,
    direction:       'outbound-api',
    call_status:     'initiated',
    caller_id_used:  callerIdUsed,
    started_at:      now,
  }, { onConflict: 'call_sid' })

  /* Take the lead out of the buffer and hold it for the duration of the call.

     This is the moment the queue has to know a call is in flight. It used to
     call extendLease, which only matches a row already in `leased` — and
     since nothing ever put a row INTO `leased`, it matched nothing: every
     in-flight call still read as "buffered", a rep who dialled and closed
     their tab held the lead until someone noticed, and the lease timeout
     that exists to recover exactly that could never fire.

     The claim is best-effort. Losing it means another rep got there first,
     which is worth knowing about but is not a reason to drop a call that is
     already connecting. */
  if (queueId) {
    const claimed = await claimForCall(queueId, identity).catch(() => false)
    if (!claimed) console.warn('[call:start] could not claim attempt %s for %s', queueId, identity)
  }

  /* Record the dial itself, not just its outcome.

     The redial gap reads last_dialed_at, which was only ever written when a
     rep submitted a disposition. A call placed and abandoned left no trace,
     so the guard that stops a lead being rung twice in two hours did not see
     it and the lead came straight back round. */
  if (contactId) {
    const { error: dialErr } = await db.from('dialer_lead_state').upsert(
      { contact_id: contactId, last_dialed_at: now, updated_at: now },
      { onConflict: 'contact_id' },
    )
    if (dialErr) console.warn('[call:start] could not stamp last_dialed_at', dialErr.message)
  }

  return NextResponse.json({ confName, customerCallSid: participant.callSid, callerIdUsed })
}
