import { NextResponse } from 'next/server'
import { resetDay, syncGHLToQueue } from '@/app/dialer/_lib/queue-engine'

export const maxDuration = 120

// POST /api/dialer/queue/reset
// Cancels all of today's non-completed attempts, then re-syncs from GHL.
// Requires an explicit confirm from the UI (confirm dialog) — no accidental resets.
export async function POST() {
  await resetDay()
  const result = await syncGHLToQueue()
  return NextResponse.json({ ok: true, ...result })
}
