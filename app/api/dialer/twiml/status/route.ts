import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Twilio POSTs call status updates here (initiated → ringing → in-progress → completed)
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const body    = new URLSearchParams(rawBody)
  const q       = req.nextUrl.searchParams

  // Helper: check form body first, fall back to URL query param
  const p = (key: string) => body.get(key) || q.get(key) || ''

  const callSid    = p('CallSid')
  const callStatus = p('CallStatus')
  const direction  = p('Direction')
  const duration   = p('CallDuration')
  const from       = p('From')
  const to         = p('To')

  // Custom params — may come from URL query string (participant status callbacks)
  const answeredBy  = p('AnsweredBy')
  const contactId   = p('ContactId')
  const contactName = p('ContactName')
  const repIdentity = p('RepIdentity')
  const campaignId  = p('CampaignId')
  const pipelineId  = p('PipelineId')
  const stageId     = p('StageId')
  const firm        = p('Firm')
  const stageName   = p('StageName')

  console.log('[dialer:status]', { callSid, callStatus, direction, duration, from, to, answeredBy })

  const db = supabaseAdmin()

  // Upsert — creates row on first callback, updates on completion
  await db.from('dialer_calls').upsert({
    call_sid:     callSid,
    call_status:  callStatus,
    direction,
    phone:        direction === 'outbound-api' ? to : from,
    ...(duration   ? { duration: parseInt(duration, 10) } : {}),
    ...(contactId  ? { contact_id: contactId }   : {}),
    ...(contactName? { contact_name: contactName }: {}),
    ...(repIdentity? { rep_identity: repIdentity }: {}),
    ...(campaignId ? { campaign_id: campaignId }  : {}),
    ...(pipelineId ? { pipeline_id: pipelineId }  : {}),
    ...(stageId    ? { stage_id: stageId }        : {}),
    ...(firm       ? { firm }                     : {}),
    ...(stageName  ? { stage_name: stageName }    : {}),
    ...(callStatus === 'completed' ? { ended_at: new Date().toISOString() } : {}),
    ...(callStatus === 'initiated' ? { started_at: new Date().toISOString() } : {}),
    ...(answeredBy ? { answered_by: answeredBy } : {}),
  }, { onConflict: 'call_sid' })

  // If call completed and ended_by wasn't already set by rep hangup → contact hung up
  if (callStatus === 'completed') {
    await db.from('dialer_calls')
      .update({ ended_by: 'contact' })
      .eq('call_sid', callSid)
      .is('ended_by', null)
  }

  return new NextResponse(null, { status: 204 })
}
