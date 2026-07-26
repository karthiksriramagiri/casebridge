import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET() {
  const db    = supabaseAdmin()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [usersRes, sessionsRes, statusRes, callsRes] = await Promise.all([
    db.from('dialer_users')
      .select('name, role')
      .eq('active', true)
      .eq('role', 'REP')
      .order('name', { ascending: true }),
    db.from('dialer_active_sessions').select('*'),
    db.from('dialer_rep_status').select('*'),
    db.from('dialer_calls')
      .select('rep_identity, call_status, duration, started_at')
      .gte('started_at', today.toISOString())
      .not('rep_identity', 'is', null),
  ])

  const users    = usersRes.data    ?? []
  const sessions = sessionsRes.data ?? []
  const statuses = statusRes.data   ?? []
  const calls    = callsRes.data    ?? []

  // Build rep list dynamically from dialer_users
  const repList = users.map((u: any) => {
    const firstName = (u.name as string).split(' ')[0]
    return {
      identity: firstName.toLowerCase(),
      name:     firstName,
      initials: firstName[0].toUpperCase(),
    }
  })

  const reps = repList.map(rep => {
    const session  = sessions.find(s => s.rep_identity === rep.identity)
    const presence = statuses.find(s => s.rep_identity === rep.identity)
    const repCalls = calls.filter(c => c.rep_identity === rep.identity)

    const totalCalls     = repCalls.length
    const connectedCalls = repCalls.filter(c => (c.duration ?? 0) > 0).length
    const connectRate    = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0
    const avgDuration    = connectedCalls > 0
      ? Math.round(repCalls.filter(c => (c.duration ?? 0) > 0).reduce((s, c) => s + (c.duration ?? 0), 0) / connectedCalls)
      : 0

    let status = presence?.status ?? 'OFFLINE'
    if (session) status = 'ON_CALL'

    return {
      ...rep,
      status,
      conferenceName:   session?.conference_name   ?? null,
      repCallSid:       session?.rep_call_sid       ?? null,
      contactName:      session?.contact_name       ?? null,
      contactId:        session?.contact_id         ?? null,
      contactPhone:     session?.customer_phone     ?? null,
      firm:             session?.firm               ?? null,
      campaign:         session?.campaign           ?? null,
      callStartedAt:    session?.started_at         ?? null,
      totalCalls,
      connectedCalls,
      connectRate,
      avgDuration,
    }
  })

  const onCall         = reps.filter(r => r.status === 'ON_CALL').length
  const active         = reps.filter(r => r.status !== 'OFFLINE').length
  const totalDials     = reps.reduce((s, r) => s + r.totalCalls, 0)
  const totalConnected = reps.reduce((s, r) => s + r.connectedCalls, 0)
  const avgConnectRate = totalDials > 0 ? Math.round((totalConnected / totalDials) * 100) : 0

  return NextResponse.json({ reps, stats: { onCall, active, totalDials, totalConnected, avgConnectRate } })
}
