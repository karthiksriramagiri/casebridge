import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cancelDrip } from '@/app/dialer/_lib/sms-drip'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/dialer/sms/lead-settings?contactId=xxx
// Returns SMS disposition + bot status for a contact
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId')
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const db = supabaseAdmin()
  const { data } = await db
    .from('dialer_lead_state')
    .select('sms_disposition, sms_drip_active')
    .eq('contact_id', contactId)
    .maybeSingle()

  return NextResponse.json({
    smsDisposition: data?.sms_disposition ?? null,
    smsBotActive:   data?.sms_drip_active ?? false,
  })
}

// PUT /api/dialer/sms/lead-settings
// Update SMS disposition and/or bot toggle
export async function PUT(req: NextRequest) {
  const { contactId, smsDisposition, smsBotActive } = await req.json()
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const db  = supabaseAdmin()
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = { updated_at: now }

  if (smsDisposition !== undefined) {
    updates.sms_disposition    = smsDisposition
    updates.sms_disposition_at = now
  }

  if (smsBotActive !== undefined) {
    updates.sms_drip_active = smsBotActive
    // If turning off the bot, cancel all pending drip messages
    if (!smsBotActive) {
      await cancelDrip(contactId)
    }
  }

  // Upsert so it works even if no lead_state row exists yet
  await db.from('dialer_lead_state').upsert(
    { contact_id: contactId, ...updates },
    { onConflict: 'contact_id' }
  )

  return NextResponse.json({ ok: true })
}
