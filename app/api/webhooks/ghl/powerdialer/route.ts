import { NextRequest, NextResponse } from 'next/server'

// GHL pipeline stage ID → powerdialer.ai webhook URL
const STAGE_MAP: Record<string, string> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': 'https://power-dialer-backend-343035658909.us-central1.run.app/api/webhook/public/76663bf8-bcf8-41b5-b82c-7df7192607d9',  // No Response
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'https://power-dialer-backend-343035658909.us-central1.run.app/api/webhook/public/f158d817-f2df-4dcf-b2c8-63ea979a35c3',  // Follow Up Required
  '1a4eed62-09ea-4108-ab64-2e16930350d6': 'https://power-dialer-backend-343035658909.us-central1.run.app/api/webhook/public/c6bd3cec-a01b-4c76-919e-63a1f7c0fdd7',  // Chase
}

const WEBHOOK_SECRET = process.env.GHL_WEBHOOK_SECRET

// GHL calls this endpoint when a contact is added to or moves within any of the 3 pipelines.
// In GHL: create a workflow trigger "Opportunity stage change" or "Opportunity created"
// and set the webhook URL to: https://www.case-bridge.com/api/webhooks/ghl/powerdialer?secret=YOUR_SECRET
export async function POST(req: NextRequest) {
  if (WEBHOOK_SECRET) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  console.log('[powerdialer-webhook] received:', JSON.stringify(payload, null, 2))

  // Extract pipeline stage ID — GHL sends it at different paths depending on trigger type
  const stageId =
    payload.pipelineStageId ||
    payload.pipeline_stage_id ||
    payload.opportunity?.pipelineStageId ||
    payload.opportunity?.pipeline_stage_id ||
    null

  if (!stageId) {
    return NextResponse.json({ error: 'No pipelineStageId in payload' }, { status: 400 })
  }

  const webhookUrl = STAGE_MAP[stageId]
  if (!webhookUrl) {
    // Not one of our tracked stages — ignore silently
    return NextResponse.json({ ok: true, skipped: true, reason: 'stage not tracked' })
  }

  // Extract contact fields
  const contact = payload.contact || payload.opportunity?.contact || {}
  const firstName =
    payload.first_name || payload.firstName ||
    contact.first_name || contact.firstName || ''
  const lastName =
    payload.last_name || payload.lastName ||
    contact.last_name || contact.lastName || ''
  const phone = payload.phone || contact.phone || ''
  const email = payload.email || contact.email || ''
  const contactId =
    payload.contact_id || payload.contactId ||
    contact.id || payload.opportunity?.contactId || ''
  const opportunityId =
    payload.opportunity?.id || payload.opportunityId || payload.id || ''

  const body = {
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' '),
    phone,
    email,
    contact_id: contactId,
    opportunity_id: opportunityId,
    pipeline_stage_id: stageId,
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  console.log(`[powerdialer-webhook] forwarded to ${webhookUrl} — status ${res.status}`)

  return NextResponse.json({ ok: true, stageId, powerdialerStatus: res.status })
}
