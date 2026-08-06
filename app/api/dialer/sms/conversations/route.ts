import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/sms/conversations
// Returns all known leads (from calls + messages), with message preview where available
export async function GET(_req: NextRequest) {
  const db = supabaseAdmin()
  const ourNumber = (process.env.TWILIO_CALLER_ID || '+12137344168').replace(/\s/g, '')

  // Fetch messages and calls in parallel
  const [{ data: messages }, { data: calls }] = await Promise.all([
    db
      .from('dialer_messages')
      .select('direction, from_number, to_number, body, contact_id, contact_name, firm, read, created_at')
      .not('contact_id', 'is', null)
      .order('created_at', { ascending: false }),
    db
      .from('dialer_calls')
      .select('contact_id, contact_name, phone, firm, started_at')
      .not('contact_id', 'is', null)
      .not('phone', 'is', null)
      .order('started_at', { ascending: false }),
  ])

  // Build threads from messages (most recent per lead phone)
  const threads: Record<string, {
    leadPhone:       string
    contactId:       string
    contactName:     string | null
    firm:            string | null
    lastMessage:     string | null
    lastAt:          string
    unreadCount:     number
    direction:       string
    hasMessages:     boolean
    smsDisposition:  string | null
    smsBotActive:    boolean
  }> = {}

  for (const msg of (messages ?? [])) {
    const leadPhone = msg.direction === 'inbound' ? msg.from_number : msg.to_number
    if (leadPhone === ourNumber || !msg.contact_id) continue

    if (!threads[msg.contact_id]) {
      threads[msg.contact_id] = {
        leadPhone,
        contactId:   msg.contact_id,
        contactName: msg.contact_name,
        firm:        msg.firm,
        lastMessage: msg.body ?? '',
        lastAt:      msg.created_at,
        unreadCount: 0,
        direction:   msg.direction,
        hasMessages: true,
        smsDisposition: null,
        smsBotActive:   false,
      }
    }
    if (!msg.read && msg.direction === 'inbound') {
      threads[msg.contact_id].unreadCount++
    }
  }

  // Add leads from dialer_calls that don't have a message thread yet
  const seenContacts = new Set<string>()
  for (const call of (calls ?? [])) {
    if (!call.contact_id || seenContacts.has(call.contact_id)) continue
    seenContacts.add(call.contact_id)

    if (!threads[call.contact_id]) {
      threads[call.contact_id] = {
        leadPhone:   call.phone,
        contactId:   call.contact_id,
        contactName: call.contact_name,
        firm:        call.firm,
        lastMessage: null,
        lastAt:      call.started_at ?? '',
        unreadCount: 0,
        direction:   'outbound',
        hasMessages: false,
        smsDisposition: null,
        smsBotActive:   false,
      }
    }
  }

  // Backfill missing contact names from dialer_calls by contact_id or phone
  const missingNames = Object.values(threads).filter(t => !t.contactName)
  if (missingNames.length > 0) {
    const contactIds = missingNames.map(t => t.contactId).filter(Boolean)
    const phones     = missingNames.map(t => t.leadPhone).filter(Boolean)

    // Look up names from calls
    const { data: nameLookup } = await db
      .from('dialer_calls')
      .select('contact_id, contact_name, phone')
      .not('contact_name', 'is', null)
      .or(
        [
          contactIds.length ? `contact_id.in.(${contactIds.join(',')})` : null,
          phones.length     ? `phone.in.(${phones.join(',')})` : null,
        ].filter(Boolean).join(',')
      )
      .order('started_at', { ascending: false })
      .limit(200)

    if (nameLookup?.length) {
      const nameByContactId = new Map<string, string>()
      const nameByPhone     = new Map<string, string>()
      for (const row of nameLookup) {
        if (row.contact_id && row.contact_name && !nameByContactId.has(row.contact_id))
          nameByContactId.set(row.contact_id, row.contact_name)
        if (row.phone && row.contact_name && !nameByPhone.has(row.phone))
          nameByPhone.set(row.phone, row.contact_name)
      }
      for (const t of missingNames) {
        t.contactName = nameByContactId.get(t.contactId) ?? nameByPhone.get(t.leadPhone) ?? null
      }
    }
  }

  // Populate SMS disposition and bot status from dialer_lead_state
  const allContactIds = Object.values(threads).map(t => t.contactId).filter(Boolean)
  if (allContactIds.length > 0) {
    const { data: leadStates } = await db
      .from('dialer_lead_state')
      .select('contact_id, sms_disposition, sms_drip_active')
      .in('contact_id', allContactIds)

    if (leadStates?.length) {
      const stateMap = new Map(leadStates.map(s => [s.contact_id, s]))
      for (const t of Object.values(threads)) {
        const ls = stateMap.get(t.contactId)
        if (ls) {
          t.smsDisposition = ls.sms_disposition ?? null
          t.smsBotActive   = ls.sms_drip_active ?? false
        }
      }
    }
  }

  // Sort: unread first, then conversations with messages, then by date
  const conversations = Object.values(threads).sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1
    if (b.unreadCount > 0 && a.unreadCount === 0) return 1
    if (a.hasMessages && !b.hasMessages) return -1
    if (b.hasMessages && !a.hasMessages) return 1
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  })

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  return NextResponse.json({ conversations, totalUnread })
}
