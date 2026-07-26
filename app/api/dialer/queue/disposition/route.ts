import { NextRequest, NextResponse } from 'next/server'
import { applyDisposition } from '@/app/dialer/_lib/queue-engine'

// POST /api/dialer/queue/disposition
// Body: { queueId, disposition, repIdentity, callDuration, callbackAt?, callbackContext?, nqReason? }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { queueId, disposition, repIdentity, callDuration, callbackAt, callbackContext, nqReason } = body

  if (!queueId || !disposition || !repIdentity) {
    return NextResponse.json({ error: 'queueId, disposition, repIdentity required' }, { status: 400 })
  }

  await applyDisposition(queueId, disposition, {
    repIdentity,
    callDuration: callDuration ?? 0,
    callbackAt,
    callbackContext,
    nqReason,
  })

  return NextResponse.json({ ok: true })
}
