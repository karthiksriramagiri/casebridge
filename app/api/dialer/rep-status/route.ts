import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fillBuffer, releaseBuffer } from '@/app/dialer/_lib/queue-engine'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST handler for sendBeacon (tab close)
export async function POST(req: NextRequest) {
  return handleStatusUpdate(req)
}

export async function PUT(req: NextRequest) {
  return handleStatusUpdate(req)
}

async function handleStatusUpdate(req: NextRequest) {
  const { identity, status } = await req.json()
  if (!identity || !status) return NextResponse.json({ error: 'identity and status required' }, { status: 400 })

  const db = supabaseAdmin()

  // Fetch previous status to detect transitions
  const { data: prev } = await db.from('dialer_rep_status')
    .select('status').eq('rep_identity', identity).maybeSingle()
  const prevStatus = prev?.status ?? 'OFFLINE'

  await db.from('dialer_rep_status').upsert(
    { rep_identity: identity, status, updated_at: new Date().toISOString() },
    { onConflict: 'rep_identity' }
  )

  // READY: fill buffer (fire-and-forget — don't block the status response)
  if (status === 'READY' && prevStatus !== 'READY') {
    fillBuffer(identity, 5).catch(console.error)
  }

  // OFFLINE or PAUSED: release buffer back to pool
  if ((status === 'OFFLINE' || status === 'PAUSED') && prevStatus !== status) {
    // Give a brief grace period for PAUSED (2 min) — handled in selection RPC.
    // For OFFLINE, release immediately.
    if (status === 'OFFLINE') {
      releaseBuffer(identity).catch(console.error)
    }
    // PAUSED: the selection RPC checks paused_at; buffer stays for 2 min.
    // We still upsert the status so the RPC knows they're paused.
  }

  return NextResponse.json({ ok: true })
}
