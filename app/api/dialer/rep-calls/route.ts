import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function isConnected(c: any): boolean {
  const dur = c.duration ?? 0
  if (dur <= 0) return false
  const ab = c.answered_by ?? null
  if (ab) return ab === 'human'
  return dur >= 15
}

export async function GET(req: NextRequest) {
  const rep = req.nextUrl.searchParams.get('rep')
  if (!rep) return NextResponse.json({ calls: [] })

  const db    = supabaseAdmin()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Fetch calls and attempts in parallel
  const [callsRes, attemptsRes] = await Promise.all([
    db.from('dialer_calls')
      .select('call_sid, contact_id, contact_name, phone, call_status, duration, started_at, ended_at, firm, stage_name, answered_by')
      .eq('rep_identity', rep)
      .gte('started_at', today.toISOString())
      .order('started_at', { ascending: false }),
    db.from('dialer_attempts')
      .select('contact_id, disposition, completed_at')
      .eq('completed_by', rep)
      .eq('plan_date', today.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
      .not('disposition', 'is', null),
  ])

  const attempts = attemptsRes.data ?? []

  // Build a map: contact_id → most recent disposition
  const dispMap = new Map<string, string>()
  for (const a of attempts) {
    if (a.contact_id && a.disposition) {
      // Keep the latest disposition per contact
      if (!dispMap.has(a.contact_id)) {
        dispMap.set(a.contact_id, a.disposition)
      }
    }
  }

  const calls = (callsRes.data ?? []).map(c => ({
    callSid:     c.call_sid,
    contactName: c.contact_name ?? c.phone,
    phone:       c.phone,
    status:      c.call_status,
    duration:    c.duration ?? 0,
    startedAt:   c.started_at,
    endedAt:     c.ended_at,
    firm:        c.firm,
    stageName:   c.stage_name,
    answeredBy:  c.answered_by,
    connected:   isConnected(c),
    disposition: c.contact_id ? (dispMap.get(c.contact_id) ?? null) : null,
  }))

  return NextResponse.json({ calls })
}
