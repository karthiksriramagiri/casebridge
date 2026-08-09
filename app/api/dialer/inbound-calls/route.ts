import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const STALE_MINUTES = 5

export async function GET() {
  const db  = supabaseAdmin()
  const now = new Date()

  // Auto-clean stale "ringing" entries (caller hung up but status callback never fired)
  const staleThreshold = new Date(now.getTime() - STALE_MINUTES * 60 * 1000).toISOString()
  await db.from('dialer_inbound_queue')
    .update({ status: 'missed', ended_at: now.toISOString() })
    .eq('status', 'ringing')
    .lt('created_at', staleThreshold)

  // Fetch ringing calls + today's inbound history
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [ringingRes, historyRes] = await Promise.all([
    db.from('dialer_inbound_queue')
      .select('*')
      .eq('status', 'ringing')
      .order('created_at', { ascending: true }),
    db.from('dialer_inbound_queue')
      .select('*')
      .neq('status', 'ringing')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return NextResponse.json({
    ringing: ringingRes.data ?? [],
    history: historyRes.data ?? [],
  })
}
