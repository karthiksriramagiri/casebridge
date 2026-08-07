import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// A call is "connected" if the rep actually spoke to a human.
// - Must have duration > 0
// - If AMD ran: answered_by must be 'human'
// - If AMD didn't run (answered_by is null): use duration threshold —
//   calls under 15s that went to "completed" are almost certainly voicemail.
function isConnected(c: any): boolean {
  const dur = c.duration ?? 0
  if (dur <= 0) return false
  const ab = c.answered_by ?? null
  if (ab) return ab === 'human'
  // No AMD data — short completed calls are likely VM
  return dur >= 15
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
      .select('rep_identity, call_status, duration, started_at, answered_by')
      .gte('started_at', today.toISOString())
      .not('rep_identity', 'is', null),
  ])

  const users    = usersRes.data    ?? []
  const statuses = statusRes.data   ?? []
  const calls    = callsRes.data    ?? []

  // Filter out stale active sessions (older than 4 hours — no real call lasts that long)
  const STALE_SESSION_MS = 4 * 60 * 60 * 1000
  const allSessions = sessionsRes.data ?? []
  const sessions = allSessions.filter((s: any) => {
    if (!s.started_at) return true
    return Date.now() - new Date(s.started_at).getTime() < STALE_SESSION_MS
  })

  // Clean up stale session rows in the background (don't await)
  const staleSessions = allSessions.filter((s: any) =>
    s.started_at && Date.now() - new Date(s.started_at).getTime() >= STALE_SESSION_MS
  )
  if (staleSessions.length > 0) {
    const staleIds = staleSessions.map((s: any) => s.rep_identity)
    db.from('dialer_active_sessions')
      .delete()
      .in('rep_identity', staleIds)
      .then(() => console.log(`[live-floor] Cleaned up ${staleIds.length} stale session(s):`, staleIds))
      .catch(console.error)
  }

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
    const connectedCalls = repCalls.filter(c => isConnected(c)).length
    const connectRate    = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0
    const avgDuration    = connectedCalls > 0
      ? Math.round(repCalls.filter(c => isConnected(c)).reduce((s, c) => s + (c.duration ?? 0), 0) / connectedCalls)
      : 0

    let status = presence?.status ?? 'OFFLINE'
    // If status hasn't been updated in 2+ minutes, treat as OFFLINE (stale session)
    const isStalePresence = presence?.updated_at
      ? Date.now() - new Date(presence.updated_at).getTime() > 2 * 60 * 1000
      : false
    if (status !== 'OFFLINE' && isStalePresence) status = 'OFFLINE'
    // Only show ON_CALL if session exists AND rep presence isn't stale
    if (session && !isStalePresence) status = 'ON_CALL'

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
