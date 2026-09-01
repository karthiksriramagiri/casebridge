import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

/**
 * GHL Message webhook — handles OutboundMessage and InboundMessage events.
 *
 * OutboundMessage: store as unreplied outbound SMS for 5-min no-reply tracking.
 * InboundMessage:  mark the most recent unreplied outbound for that contact as replied.
 *
 * Configure in GHL:
 *   POST /api/webhooks/ghl/message?secret=YOUR_SECRET
 *   Trigger on: OutboundMessage, InboundMessage
 */
export async function POST(req: NextRequest) {
  if (WEBHOOK_SECRET) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const body = await req.json()
  console.log('[ghl:message] payload:', JSON.stringify(body).slice(0, 500))

  const eventType = body.type ?? body.eventType ?? body.event ?? ''
  const messageType = body.messageType ?? body.message_type ?? ''

  // Only track SMS, not emails
  if (messageType && messageType.toUpperCase() !== 'SMS') {
    return NextResponse.json({ ok: true, skipped: 'not SMS' })
  }

  const contactId  = body.contactId ?? body.contact_id ?? ''
  const messageId  = body.messageId ?? body.message_id ?? body.id ?? ''
  const phone      = body.phone ?? body.to ?? body.from ?? ''
  const msgBody    = body.body ?? body.message ?? ''
  const contactName = body.contactName ?? body.contact_name ?? body.name ?? null
  const dateAdded  = body.dateAdded ?? body.date_added ?? body.timestamp ?? null

  if (!contactId || !messageId) {
    return NextResponse.json({ error: 'Missing contactId or messageId' }, { status: 400 })
  }

  const sentAt = dateAdded ? new Date(dateAdded).toISOString() : new Date().toISOString()

  if (eventType.toLowerCase().includes('outbound') || body.direction === 'outbound') {
    // ── Outbound SMS: store for no-reply tracking ──
    const { error } = await supabase.from('ghl_sms_tracking').upsert(
      {
        message_id: messageId,
        contact_id: contactId,
        contact_name: contactName,
        phone,
        body: msgBody,
        direction: 'outbound',
        sent_at: sentAt,
        replied: false,
        notified: false,
      },
      { onConflict: 'message_id' }
    )
    if (error) console.error('[ghl:message] outbound insert error:', error.message)
    return NextResponse.json({ ok: true, tracked: 'outbound' })
  }

  if (eventType.toLowerCase().includes('inbound') || body.direction === 'inbound') {
    // ── Inbound SMS: mark most recent unreplied outbound as replied ──
    const now = new Date().toISOString()

    // Also store the inbound message for audit
    await supabase.from('ghl_sms_tracking').upsert(
      {
        message_id: messageId,
        contact_id: contactId,
        contact_name: contactName,
        phone,
        body: msgBody,
        direction: 'inbound',
        sent_at: sentAt,
      },
      { onConflict: 'message_id' }
    )

    // Mark all unreplied outbound messages for this contact as replied
    const { error } = await supabase
      .from('ghl_sms_tracking')
      .update({ replied: true, replied_at: now })
      .eq('contact_id', contactId)
      .eq('direction', 'outbound')
      .eq('replied', false)

    if (error) console.error('[ghl:message] reply update error:', error.message)
    return NextResponse.json({ ok: true, tracked: 'inbound' })
  }

  // Unknown event type — log and accept
  console.log('[ghl:message] unknown event type:', eventType)
  return NextResponse.json({ ok: true, skipped: 'unknown event' })
}
