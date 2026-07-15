import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function avg(nums: number[]) {
  if (!nums.length) return null
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function median(nums: number[]) {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function fmtSeconds(s: number | null) {
  if (s === null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

// Map Slack user IDs → real names. IDs not listed here are excluded from the report.
const SLACK_ID_TO_NAME: Record<string, string> = {
  'U0B8B2BE4BZ': 'Ziyad',
  'U0BDB0H8Z33': 'Mauricio',
}

function resolveWorkerName(workerName: string | null): string | null {
  if (!workerName) return null
  // If it looks like a Slack user ID, map it
  if (/^U[A-Z0-9]{8,}$/.test(workerName)) {
    return SLACK_ID_TO_NAME[workerName] ?? null // null = exclude
  }
  return workerName
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const days = Math.min(90, Math.max(1, Number(searchParams.get('days') || 7)))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: events } = await admin
    .from('lead_response_events')
    .select('worker_id, worker_name, event_type, response_seconds, responded_at')
    .gte('created_at', since)
    .order('responded_at', { ascending: false })

  const byWorker: Record<string, {
    workerName: string
    slackTimes: number[]
    callTimes: number[]
    recentEvents: { type: string; seconds: number; at: string }[]
  }> = {}

  for (const e of events || []) {
    const resolvedName = resolveWorkerName(e.worker_name)
    if (resolvedName === null) continue // exclude unmapped Slack IDs
    const key = e.worker_id || e.worker_name || 'unknown'
    if (!byWorker[key]) {
      byWorker[key] = { workerName: resolvedName, slackTimes: [], callTimes: [], recentEvents: [] }
    }
    const w = byWorker[key]
    if (e.response_seconds != null) {
      if (e.event_type === 'slack_reaction') w.slackTimes.push(e.response_seconds)
      if (e.event_type === 'called') w.callTimes.push(e.response_seconds)
    }
    if (w.recentEvents.length < 10) {
      w.recentEvents.push({ type: e.event_type, seconds: e.response_seconds, at: e.responded_at })
    }
  }

  const workers = Object.values(byWorker).map(w => ({
    workerName:     w.workerName,
    slack: {
      count:       w.slackTimes.length,
      avgSeconds:  avg(w.slackTimes),
      medSeconds:  median(w.slackTimes),
      avgFmt:      fmtSeconds(avg(w.slackTimes)),
      medFmt:      fmtSeconds(median(w.slackTimes)),
      under90:     w.slackTimes.filter(s => s <= 90).length,
      pctUnder90:  w.slackTimes.length ? Math.round(w.slackTimes.filter(s => s <= 90).length / w.slackTimes.length * 100) : 0,
    },
    call: {
      count:       w.callTimes.length,
      avgSeconds:  avg(w.callTimes),
      medSeconds:  median(w.callTimes),
      avgFmt:      fmtSeconds(avg(w.callTimes)),
      medFmt:      fmtSeconds(median(w.callTimes)),
      under90:     w.callTimes.filter(s => s <= 90).length,
      pctUnder90:  w.callTimes.length ? Math.round(w.callTimes.filter(s => s <= 90).length / w.callTimes.length * 100) : 0,
    },
    recentEvents: w.recentEvents,
  }))

  return NextResponse.json({ days, workers })
}

// PATCH — set slack_user_id on a profile
export async function PATCH(req: NextRequest) {
  const { profileId, slackUserId } = await req.json()
  if (!profileId) return NextResponse.json({ error: 'profileId required' }, { status: 400 })

  const { error } = await admin
    .from('profiles')
    .update({ slack_user_id: slackUserId || null })
    .eq('id', profileId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
