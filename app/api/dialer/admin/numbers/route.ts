import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getNumberPool } from '@/app/dialer/_lib/number-pool'

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// GET /api/dialer/admin/numbers
// Returns all purchased numbers with area code, state, firm, and connection rate stats
export async function GET() {
  const [pool, stats] = await Promise.all([
    getNumberPool(),
    getConnectionStats(),
  ])

  const statsMap = new Map(stats.map(s => [s.caller_id, s]))

  const numbers = pool.map(n => {
    const s = statsMap.get(n.phoneNumber)
    return {
      phoneNumber: n.phoneNumber,
      areaCode:    n.areaCode,
      state:       n.state,
      firm:        n.firm,
      totalCalls:     s?.total   ?? 0,
      connectedCalls: s?.connected ?? 0,
      connectRate:    s?.total ? Math.round((s.connected / s.total) * 100) : 0,
      avgDuration:    s?.avg_duration ?? 0,
      lastUsed:       s?.last_used ?? null,
    }
  })

  // Sort by total calls descending so most-used numbers are at top
  numbers.sort((a, b) => b.totalCalls - a.totalCalls)

  // State coverage summary
  const stateMap: Record<string, number> = {}
  for (const n of pool) {
    if (n.state) stateMap[n.state] = (stateMap[n.state] ?? 0) + 1
  }
  const stateCoverage = Object.entries(stateMap)
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    total: pool.length,
    numbers,
    stateCoverage,
  })
}

// PATCH /api/dialer/admin/numbers — assign/unassign a number to a firm
export async function PATCH(req: NextRequest) {
  const { phoneNumber, firm } = await req.json()
  if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })

  const db = supabaseAdmin()

  if (firm) {
    // Assign number to firm
    await db.from('dialer_number_firms').upsert(
      { phone_number: phoneNumber, firm },
      { onConflict: 'phone_number' }
    )
  } else {
    // Unassign — remove from table
    await db.from('dialer_number_firms').delete().eq('phone_number', phoneNumber)
  }

  // Bust the cache so next call picks up the change
  return NextResponse.json({ ok: true })
}

interface CallerIdStat {
  caller_id: string
  total: number
  connected: number
  avg_duration: number
  last_used: string
}

async function getConnectionStats(): Promise<CallerIdStat[]> {
  const db = supabaseAdmin()
  // Get per-caller-ID stats from dialer_calls
  const { data, error } = await db.rpc('caller_id_stats')

  if (error || !data) {
    // Fallback: raw query if RPC doesn't exist
    const { data: calls } = await db
      .from('dialer_calls')
      .select('caller_id_used, call_status, duration, created_at')
      .not('caller_id_used', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10000)

    if (!calls?.length) return []

    const map = new Map<string, { total: number; connected: number; duration_sum: number; last_used: string }>()
    for (const c of calls) {
      const id = c.caller_id_used
      if (!id) continue
      const entry = map.get(id) ?? { total: 0, connected: 0, duration_sum: 0, last_used: c.created_at }
      entry.total++
      if (c.call_status === 'completed' && (c.duration ?? 0) > 0) {
        entry.connected++
        entry.duration_sum += c.duration ?? 0
      }
      if (c.created_at > entry.last_used) entry.last_used = c.created_at
      map.set(id, entry)
    }

    return Array.from(map.entries()).map(([caller_id, s]) => ({
      caller_id,
      total:        s.total,
      connected:    s.connected,
      avg_duration: s.connected > 0 ? Math.round(s.duration_sum / s.connected) : 0,
      last_used:    s.last_used,
    }))
  }

  return data as CallerIdStat[]
}
