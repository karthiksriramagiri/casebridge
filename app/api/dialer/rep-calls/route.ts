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
  // "Today" = 12:00 AM – 11:59 PM Eastern (handles EST/EDT automatically)
  const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const isDST  = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT')
  const today  = new Date(`${etDate}T00:00:00${isDST ? '-04:00' : '-05:00'}`)

  const { data: callsData } = await db.from('dialer_calls')
    .select('call_sid, contact_id, contact_name, phone, call_status, duration, started_at, ended_at, firm, stage_name, answered_by, disposition, ended_by')
    .eq('rep_identity', rep)
    .gte('started_at', today.toISOString())
    .order('started_at', { ascending: false })

  const calls = (callsData ?? []).map(c => ({
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
    disposition: c.disposition ?? null,
    endedBy:     c.ended_by ?? null,
  }))

  return NextResponse.json({ calls })
}
