import { NextRequest, NextResponse } from 'next/server'
import { DRIP_MAX_DAYS } from '@/app/dialer/_lib/sms-drip'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

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

// Quiet hours: only send between 8 AM – 9 PM Eastern
function isWithinTextingWindow(): boolean {
  const etNow = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  const hour = new Date(etNow).getHours()
  return hour >= 8 && hour < 21
}

// GET /api/cron/sms-drip
// Runs every 15 minutes via Vercel cron. Picks up due drip messages and sends them.
export async function GET(req: NextRequest) {
  // Verify cron secret in production
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!isWithinTextingWindow()) {
    return NextResponse.json({ skipped: true, reason: 'outside texting window (8am-9pm ET)' })
  }

  const db = supabaseAdmin()
  const tw = twilioClient()
  const from = process.env.TWILIO_CALLER_ID || '+12137344168'
  const now = new Date().toISOString()

  // Fetch pending messages that are due
  const { data: dueMessages, error } = await db
    .from('dialer_sms_drip')
    .select('id, contact_id, phone, message, template_key, scheduled_at')
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(50) // batch size

  if (error) {
    console.error('[sms-drip:cron] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!dueMessages || dueMessages.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0
  let failed = 0
  let expired = 0   // drips closed out for passing the 21-day limit

  for (const msg of dueMessages) {
    // Double-check that the lead's drip is still active before sending
    const { data: state } = await db
      .from('dialer_lead_state')
      .select('sms_drip_active, suppressed, sms_drip_started_at')
      .eq('contact_id', msg.contact_id)
      .maybeSingle()

    /* Hard stop at 21 days from the drip's start. The scheduler only ever
       creates 21 days of messages, but a message is sent whenever it becomes
       due — so a backlog turns a 21-day sequence into a 50-day one. Age is
       measured from the start, not from the message's own due date, because
       that is what the 21-day rule actually means.

       Falls back to the message's schedule when a start time is missing: a
       message scheduled more than 21 days ago cannot belong to a live drip. */
    const startedAt = state?.sms_drip_started_at
      ? +new Date(state.sms_drip_started_at)
      : +new Date(msg.scheduled_at)
    const ageDays = (Date.now() - startedAt) / 86_400_000

    if (ageDays > DRIP_MAX_DAYS) {
      await db.from('dialer_sms_drip').update({
        status: 'cancelled', cancelled_at: now,
      }).eq('contact_id', msg.contact_id).eq('status', 'pending')

      await db.from('dialer_lead_state').update({
        sms_drip_active: false,
        updated_at: now,
      }).eq('contact_id', msg.contact_id)

      expired++
      continue
    }

    if (!state?.sms_drip_active || state?.suppressed) {
      // Drip was cancelled or lead is suppressed — cancel this message
      await db.from('dialer_sms_drip').update({
        status: 'cancelled',
        cancelled_at: now,
      }).eq('id', msg.id)
      continue
    }

    try {
      const twilioMsg = await tw.messages.create({
        to: msg.phone,
        from,
        body: msg.message,
      })

      // Mark as sent
      await db.from('dialer_sms_drip').update({
        status: 'sent',
        sent_at: now,
      }).eq('id', msg.id)

      // Also log in dialer_messages for the conversation thread
      await db.from('dialer_messages').insert({
        message_sid:  twilioMsg.sid,
        direction:    'outbound',
        from_number:  from,
        to_number:    msg.phone,
        body:         msg.message,
        status:       'sent',
        contact_id:   msg.contact_id,
        rep_identity: 'william-bot',
        read:         true,
      })

      sent++
    } catch (err: any) {
      console.error(`[sms-drip:cron] send failed for ${msg.contact_id}`, err.message)
      failed++

      // If Twilio rejects (unsubscribed, invalid number), cancel the whole drip
      const code = err.code ?? 0
      if (code === 21610 || code === 21614 || code === 21211) {
        await db.from('dialer_sms_drip').update({
          status: 'cancelled', cancelled_at: now,
        }).eq('contact_id', msg.contact_id).eq('status', 'pending')

        await db.from('dialer_lead_state').update({
          sms_drip_active: false,
          suppressed: true,
          suppressed_at: now,
          suppressed_reason: `twilio_error_${code}`,
          updated_at: now,
        }).eq('contact_id', msg.contact_id)
      }
    }
  }

  console.log(`[sms-drip:cron] sent=${sent} failed=${failed} expired=${expired}`)
  return NextResponse.json({ sent, failed, expired })
}
