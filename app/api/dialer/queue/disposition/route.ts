import { NextRequest, NextResponse } from 'next/server'
import { applyDisposition, fillBuffer } from '@/app/dialer/_lib/queue-engine'

// POST /api/dialer/queue/disposition
// Body: { queueId (attemptId), disposition, repIdentity, callDuration, callbackAt?, callbackContext?, callSid?, firm?, nqReason? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { queueId, disposition, repIdentity, callDuration, callbackAt, callbackContext, callSid, firm, nqReason } = body

  if (!queueId || !disposition || !repIdentity) {
    return NextResponse.json({ error: 'queueId, disposition, repIdentity required' }, { status: 400 })
  }

  await applyDisposition(queueId, disposition, {
    repIdentity,
    callDuration: callDuration ?? 0,
    callbackAt,
    callbackContext,
    callSid,
    firm,
    nqReason,
  })

  // Backfill rep's buffer after completing a call
  fillBuffer(repIdentity, 5).catch(console.error)

  return NextResponse.json({ ok: true })
}
