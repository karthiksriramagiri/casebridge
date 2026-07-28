import { NextResponse } from 'next/server'
import { fillAllReadyReps } from '@/app/dialer/_lib/queue-engine'

// POST /api/dialer/queue/buffer/fill-all
// Fills queue for every READY rep (5 leads each, sequential to avoid overlaps)
export async function POST() {
  const result = await fillAllReadyReps(5)
  return NextResponse.json({ ok: true, filled: result })
}
