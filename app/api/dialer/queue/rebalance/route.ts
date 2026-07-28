import { NextResponse } from 'next/server'

// /api/dialer/queue/rebalance is no longer used — buffer/refill replaced it.
// Kept as a no-op so any existing callers don't 404.
export async function POST() {
  return NextResponse.json({ ok: true, note: 'rebalance is a no-op in the new attempt-based system' })
}
