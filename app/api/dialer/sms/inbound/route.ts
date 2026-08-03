import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Look up a contact by phone number from our own dialer data (calls + messages)
async function lookupByPhone(
  db: ReturnType<typeof supabaseAdmin>,
  phone: string
): Promise<{ id: string; name: string; firm: string | null } | null> {
  // Check dialer_calls first (most reliable — has contact_id from GHL at call time)
  const { data: callRow } = await db
    .from('dialer_calls')
    .select('contact_id, contact_name, firm')
    .eq('phone', phone)
    .not('contact_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (callRow?.contact_id) {
    return {
      id:   callRow.contact_id,
      name: callRow.contact_name ?? phone,
      firm: callRow.firm ?? null,
    }
  }

  // Fallback: check previous messages from this number
  const { data: msgRow } = await db
    .from('dialer_messages')
    .select('contact_id, contact_name, firm')
    .eq('from_number', phone)
    .not('contact_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (msgRow?.contact_id) {
    return {
      id:   msgRow.contact_id,
      name: msgRow.contact_name ?? phone,
      firm: msgRow.firm ?? null,
    }
  }

  return null
}

// Twilio POSTs here when an SMS is received on our number
export async function POST(req: NextRequest) {
  const body = await req.formData()

  const messageSid = body.get('MessageSid')?.toString() ?? ''
  const from       = body.get('From')?.toString()        ?? ''
  const to         = body.get('To')?.toString()          ?? ''
  const msgBody    = body.get('Body')?.toString()        ?? ''
  const mediaUrl   = body.get('MediaUrl0')?.toString()   ?? null
  const numMedia   = parseInt(body.get('NumMedia')?.toString() ?? '0', 10)

  console.log('[dialer:sms:inbound]', { messageSid, from, to })

  const db = supabaseAdmin()

  // Look up contact from our own data
  const contact = await lookupByPhone(db, from)

  if (!contact) {
    console.log('[dialer:sms:inbound] unknown number, storing without contact_id', from)
  }

  // Store ALL inbound messages — even unknown numbers (reps can see them)
  await db.from('dialer_messages').insert({
    message_sid:  messageSid,
    direction:    'inbound',
    from_number:  from,
    to_number:    to,
    body:         msgBody,
    status:       'received',
    media_url:    numMedia > 0 ? mediaUrl : null,
    contact_id:   contact?.id   ?? null,
    contact_name: contact?.name ?? null,
    firm:         contact?.firm ?? null,
    read:         false,
  })

  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
