import { NextResponse } from 'next/server'
import { syncGHLToQueue } from '@/app/dialer/_lib/queue-engine'

// POST /api/dialer/queue/sync
// Syncs GHL pipeline stages into dialer_queue.
// Safe to call repeatedly — upserts by contact_id+pipeline_id.
export async function POST() {
  const result = await syncGHLToQueue()
  return NextResponse.json({ ok: true, ...result })
}
