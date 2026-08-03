import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const db = supabaseAdmin()

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
