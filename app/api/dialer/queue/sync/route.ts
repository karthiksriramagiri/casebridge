import { NextResponse } from 'next/server'
import { syncGHLToQueue } from '@/app/dialer/_lib/queue-engine'

export const maxDuration = 120

// POST /api/dialer/queue/sync
// Plans today's call attempts from GHL. Idempotent — safe to run any time.
// Awaits completion and returns counts. Also re-fills all READY rep buffers.
export async function POST() {
  const result = await syncGHLToQueue()
  return NextResponse.json(result)
}
