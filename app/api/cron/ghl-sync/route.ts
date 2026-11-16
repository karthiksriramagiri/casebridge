import { NextRequest, NextResponse } from 'next/server'
import { syncGHLToQueue, fillAllReadyReps, reapExpiredLeases } from '@/app/dialer/_lib/queue-engine'

// GET /api/cron/ghl-sync
// Called by Vercel Cron every 5 minutes. Syncs GHL → dialer_queue.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  /* Reclaim calls that were started and never finished.

     A rep who dials and then closes the tab leaves the lead leased to them.
     Nothing else returns it: the lease exists precisely so an abandoned call
     cannot strand a lead, and until now nothing ever swept it. */
  const reaped = await reapExpiredLeases().catch(err => {
    console.error('[cron:ghl-sync] lease reap failed', err)
    return 0
  })

  const result = await syncGHLToQueue()

  /* Top every online rep back up to five.

     Until now the only things that filled a buffer were the rep's own browser
     poll and the disposition handler. A throttled background tab or one
     failed fill left a rep staring at an empty queue in front of a full one,
     with nothing scheduled to correct it. This is the floor's safety net. */
  const filled = await fillAllReadyReps(5).catch(err => {
    console.error('[cron:ghl-sync] top-up failed', err)
    return {} as Record<string, number>
  })

  console.log('[cron:ghl-sync]', result, 'topped up', filled, 'reaped', reaped)
  return NextResponse.json({ ok: true, ...result, toppedUp: filled, reaped })
}
