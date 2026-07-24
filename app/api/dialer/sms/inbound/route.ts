import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GHL_BASE    = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Look up a GHL contact by exact phone number
async function lookupByPhone(phone: string): Promise<{ id: string; name: string } | null> {
  const key = (process.env.GHL_API_KEY ?? '').trim()

  const url = new URL(`${GHL_BASE}/contacts/search/duplicate`)
  url.searchParams.set('locationId', LOCATION_ID)
  url.searchParams.set('phone', phone)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28' },
    cache: 'no-store',
  })

  if (!res.ok) return null
  const data = await res.json()
  const c = data.contact ?? data.contacts?.[0]
  if (!c?.id) return null
  return {
    id:   c.id,
    name: c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
  }
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

  // Only store messages from known GHL leads
  const contact = await lookupByPhone(from)
  if (!contact) {
    console.log('[dialer:sms:inbound] unknown number, ignoring', from)
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const db = supabaseAdmin()

  // Also pull firm from most recent call for this contact
  const { data: callRow } = await db
    .from('dialer_calls')
    .select('firm')
    .eq('contact_id', contact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  await db.from('dialer_messages').insert({
    message_sid:  messageSid,
    direction:    'inbound',
    from_number:  from,
    to_number:    to,
    body:         msgBody,
    status:       'received',
    media_url:    numMedia > 0 ? mediaUrl : null,
    contact_id:   contact.id,
    contact_name: contact.name,
    firm:         callRow?.firm ?? null,
    read:         false,
  })

  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
