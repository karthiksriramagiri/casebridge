import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { cancelDrip } from '@/app/dialer/_lib/sms-drip'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function twilioClient() {
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )
}

// POST /api/dialer/sms/send
// Body: { to, body, repIdentity?, contactId?, contactName?, firm? }
export async function POST(req: NextRequest) {
  const { to, body: msgBody, repIdentity, contactId, contactName, firm } = await req.json()

  if (!to || !msgBody) {
    return NextResponse.json({ error: 'to and body are required' }, { status: 400 })
  }

  const from = process.env.TWILIO_CALLER_ID || '+12137344168'

  let messageSid = ''
  try {
    const msg = await twilioClient().messages.create({
      to,
      from,
      body: msgBody,
    })
    messageSid = msg.sid
  } catch (err: any) {
    console.error('[dialer:sms:send] Twilio error', err)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }

  const db = supabaseAdmin()
  await db.from('dialer_messages').insert({
    message_sid:  messageSid,
    direction:    'outbound',
    from_number:  from,
    to_number:    to,
    body:         msgBody,
    status:       'sent',
    contact_id:   contactId   || null,
    contact_name: contactName || null,
    rep_identity: repIdentity || null,
    firm:         firm        || null,
    read:         true,
  })

  // PC replied manually — cancel any active SMS drip automation for this contact
  if (contactId) {
    cancelDrip(contactId).catch(err =>
      console.error('[dialer:sms:send] cancel drip error', err)
    )
  }

  return NextResponse.json({ messageSid })
}
