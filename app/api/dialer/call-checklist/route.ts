import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST — upsert checklist for a call
export async function POST(req: NextRequest) {
  const { callSid, contactId, repIdentity, checklist } = await req.json()

  if (!callSid || !contactId) {
    return NextResponse.json({ error: 'callSid and contactId required' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const now = new Date().toISOString()

  const { error } = await db.from('dialer_call_checklist').upsert(
    {
      call_sid: callSid,
      contact_id: contactId,
      rep_identity: repIdentity ?? null,
      checklist,
      updated_at: now,
    },
    { onConflict: 'call_sid' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
