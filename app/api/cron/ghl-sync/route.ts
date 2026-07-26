import { NextRequest, NextResponse } from 'next/server'
import { syncGHLToQueue } from '@/app/dialer/_lib/queue-engine'

// GET /api/cron/ghl-sync
// Called by Vercel Cron every 5 minutes. Syncs GHL → dialer_queue.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncGHLToQueue()
  console.log('[cron:ghl-sync]', result)
  return NextResponse.json({ ok: true, ...result })
}
