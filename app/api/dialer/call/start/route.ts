import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

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
  const { phone, contactId, contactName, identity, firm, campaign, campaignId } = body

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

  // Dial the customer into the conference
  const participant = await client.conferences(confName).participants.create({
    to: phone,
    from: process.env.TWILIO_CALLER_ID || '+12137344168',
    label: 'customer',
    earlyMedia: true,
    endConferenceOnExit: true,
    statusCallback: statusUrl.toString(),
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    timeout: 30,
  } as any)

  // Store active session
  const db = supabaseAdmin()
  await db.from('dialer_active_sessions').upsert({
    rep_identity:       identity,
    conference_name:    confName,
    customer_call_sid:  participant.callSid,
    customer_phone:     phone,
    contact_id:         contactId ?? '',
    contact_name:       contactName ?? phone,
    firm:               firm ?? '',
    campaign:           campaign ?? '',
    started_at:         new Date().toISOString(),
  }, { onConflict: 'rep_identity' })

  return NextResponse.json({ confName, customerCallSid: participant.callSid })
}
