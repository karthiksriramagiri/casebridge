import { NextResponse } from 'next/server'
import { resetDay, syncGHLToQueue } from '@/app/dialer/_lib/queue-engine'

export const maxDuration = 120

// GET /api/dialer/queue/reset — called by Vercel Cron at 4 AM PST daily
export async function GET() {
  await resetDay()
  const result = await syncGHLToQueue()
  return NextResponse.json({ ok: true, ...result })
}

// POST /api/dialer/queue/reset — manual reset from admin UI
export async function POST() {
  await resetDay()
  const result = await syncGHLToQueue()
  return NextResponse.json({ ok: true, ...result })
}
