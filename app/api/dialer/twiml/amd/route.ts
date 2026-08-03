import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Twilio POSTs AMD (Answering Machine Detection) results here.
// AnsweredBy: human | machine_start | machine_end_beep | machine_end_silence | machine_end_other | fax | unknown
export async function POST(req: NextRequest) {
  const body = await req.formData()
  const q    = req.nextUrl.searchParams

  const callSid    = body.get('CallSid')?.toString() || ''
  const answeredBy = body.get('AnsweredBy')?.toString() || ''
  const contactId  = q.get('ContactId') || ''
  const repIdentity = q.get('RepIdentity') || ''

  console.log('[dialer:amd]', { callSid, answeredBy, contactId, repIdentity })

  if (!callSid || !answeredBy) {
    return new NextResponse(null, { status: 204 })
  }

  const db = supabaseAdmin()
  const isMachine = answeredBy.startsWith('machine') || answeredBy === 'fax'

  // Update the call record with AMD result
  await db.from('dialer_calls')
    .update({ answered_by: answeredBy })
    .eq('call_sid', callSid)

  // Update the active session so the frontend can react in real-time
  if (repIdentity) {
    await db.from('dialer_active_sessions')
      .update({ answered_by: answeredBy })
      .eq('rep_identity', repIdentity)
  }

  return new NextResponse(null, { status: 204 })
}
