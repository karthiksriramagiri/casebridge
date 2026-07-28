import { NextRequest, NextResponse } from 'next/server'
import { fillBuffer } from '@/app/dialer/_lib/queue-engine'

// POST /api/dialer/queue/buffer/refill
// Body: { rep: string, count?: number }
// Called when:
//   1. Rep transitions to READY
//   2. After each completed call (backfill to 5)
//   3. On demand from agent page
export async function POST(req: NextRequest) {
  const { rep, count = 5 } = await req.json().catch(() => ({}))
  if (!rep) return NextResponse.json({ error: 'rep required' }, { status: 400 })

  const buffered = await fillBuffer(rep, count)
  return NextResponse.json({ ok: true, buffered: buffered.length })
}
