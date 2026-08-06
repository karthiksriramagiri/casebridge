import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function deviceFromScreenWidth(w: number): 'mobile' | 'tablet' | 'desktop' {
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

// POST /api/dialer/heartbeat
// Client sends every 30s with identity + screen dimensions
export async function POST(req: NextRequest) {
  const { identity, screenWidth, screenHeight } = await req.json()
  if (!identity) return NextResponse.json({ ok: false }, { status: 400 })

  const deviceType = deviceFromScreenWidth(screenWidth || 1920)

  const db = supabaseAdmin()

  // Read current status from rep_status table (source of truth)
  const { data: rep } = await db.from('dialer_rep_status')
    .select('status')
    .eq('rep_identity', identity)
    .maybeSingle()

  const repStatus = rep?.status || 'OFFLINE'

  // Don't log heartbeats for offline reps (they're not using the app)
  if (repStatus === 'OFFLINE') return NextResponse.json({ ok: true })

  await db.from('dialer_rep_heartbeats').insert({
    rep_identity:  identity,
    device_type:   deviceType,
    status:        repStatus,
    screen_width:  screenWidth || null,
    screen_height: screenHeight || null,
  })

  return NextResponse.json({ ok: true })
}
