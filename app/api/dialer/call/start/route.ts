import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { extendLease, isLeadSuppressed } from '@/app/dialer/_lib/queue-engine'
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

  // Dial the customer into the conference and start recording immediately
  const participant = await client.conferences(confName).participants.create({
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
    timeout: 30,
    machineDetection: 'Enable',
    asyncAmd: 'true',
    asyncAmdStatusCallback: amdCallbackUrl.toString(),
    asyncAmdStatusCallbackMethod: 'POST',
  } as any)

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

  // Extend the lease while the call is live (queueId = attemptId in new system)
  if (queueId) await extendLease(queueId).catch(console.error)

  return NextResponse.json({ confName, customerCallSid: participant.callSid, callerIdUsed })
}
