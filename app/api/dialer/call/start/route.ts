import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { lockQueueItem } from '@/app/dialer/_lib/queue-engine'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function baseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://acutely-pronto-unloved.ngrok-free.dev'
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { phone, contactId, contactName, identity, firm, campaign, campaignId, queueId } = body

  if (!phone || !identity) {
    return NextResponse.json({ error: 'phone and identity required' }, { status: 400 })
  }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const confName = `conf-${identity}-${Date.now()}`
  const base = baseUrl()

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

  // Dial the customer into the conference and start recording immediately
  const participant = await client.conferences(confName).participants.create({
    to: phone,
    from: process.env.TWILIO_CALLER_ID || '+12137344168',
    label: 'customer',
    earlyMedia: true,
    endConferenceOnExit: true,
    record: true,
    recordingStatusCallback: recordingCallbackUrl.toString(),
    recordingStatusCallbackMethod: 'POST',
    statusCallback: statusUrl.toString(),
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    timeout: 30,
  } as any)

  const db  = supabaseAdmin()
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
    direction:    'outbound-api',
    call_status:  'initiated',
    started_at:   now,
  }, { onConflict: 'call_sid' })

  // Lock the queue item so no other rep gets this lead
  if (queueId) await lockQueueItem(queueId, identity).catch(console.error)

  return NextResponse.json({ confName, customerCallSid: participant.callSid })
}
