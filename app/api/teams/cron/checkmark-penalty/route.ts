import { NextRequest, NextResponse } from 'next/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { REP_IDS } from '@/lib/rep-ids'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PERF_WEBHOOK = process.env.SLACK_PERFORMANCE_WEBHOOK
const GHL_API_KEY = process.env.GHL_API_KEY!
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

// All NR pipeline stage IDs (from todos route)
const NR_STAGE_IDS = new Set([
  '1175a360-9914-4ce5-906d-d89adb27c732', // LHP NR
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b', // Eisenberg NR
  '121ae7a9-35c9-4204-a7d4-8fb19f297758', // THL NR
  '87d0a194-8841-4062-b6a3-bfedd9186070', // MCA NR
  '91ced34f-cb7b-4a03-a47d-f4ffd25fd108', // Fears NR
  '620b4cfc-fc0c-4c2c-a490-44a6bb36a3d1', // Levine NR
])

const PIPELINE_IDS = [
  'yMqNixSnChC5lcGQXA1g', // lhp
  'Yk4w3ML56ECc10PFzjpK', // eisenberg
  'DYtmw8WEUtGePFbEDAIZ', // thl
  '6Ku9EwTtMFk51o7Re9x0', // mca
  'Jj4DCdu5duYDgI87ERbx', // fears
  'JPyMNjGGAIxUv0FWW7Cg', // levine
]

async function notifySlack(text: string) {
  if (!PERF_WEBHOOK) return
  await fetch(PERF_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).catch(() => {})
}

function isPSTWorkHours(date: Date): boolean {
  const pstStr = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  const pst = new Date(pstStr)
  const hour = pst.getHours()
  return hour >= 7 && hour < 15 // 7am–3pm PST
}

async function fetchGHLCalls(contactId: string): Promise<{ userId: string; dateAdded: string }[]> {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}/activities/calls?location_id=${GHL_LOCATION_ID}&limit=20`,
      { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.activities || data.calls || []).map((a: any) => ({
      userId:    a.userId || a.user_id || '',
      dateAdded: a.dateAdded || a.startedAt || a.createdAt || '',
    }))
  } catch {
    return []
  }
}

// Fetch NR leads from GHL created in the last `maxAgeSec` seconds and upsert into nr_lead_sightings
async function syncRecentNRSightings(maxAgeSec: number) {
  const cutoff = new Date(Date.now() - maxAgeSec * 1000)

  for (const pipelineId of PIPELINE_IDS) {
    try {
      const res = await fetch(
        `https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=50`,
        { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' } }
      )
      if (!res.ok) continue
      const data = await res.json()

      const recentNR = (data.opportunities || []).filter((opp: any) => {
        const isNR =
          NR_STAGE_IDS.has(opp.pipelineStageId) ||
          (opp.pipelineStage?.name || '').toLowerCase().includes('no response')
        if (!isNR) return false
        const created = opp.createdAt ? new Date(opp.createdAt) : null
        return created && created >= cutoff
      })

      if (recentNR.length === 0) continue

      await admin.from('nr_lead_sightings').upsert(
        recentNR.map((opp: any) => ({
          contact_id:    opp.contact?.id,
          contact_name:  opp.contact?.name || opp.name || null,
          first_seen_at: opp.createdAt,
          opp_created_at: opp.createdAt,
        })).filter((r: any) => r.contact_id),
        { onConflict: 'contact_id', ignoreDuplicates: true }
      )
    } catch {
      // continue to next pipeline
    }
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const authHeader = req.headers.get('authorization')
  if (secret !== process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  // ── SYNC: Pull recent NR leads from GHL into nr_lead_sightings ─────────────
  // This ensures sightings exist even if no rep has loaded the todos page yet
  await syncRecentNRSightings(420)

  // ── CHECK 1: Missed checkmark (-1pt all reps) ──────────────────────────────
  // Leads that appeared 61–300s ago with no checkmark within 60s
  const missedWindowStart = new Date(now.getTime() - 300 * 1000).toISOString()
  const missedWindowEnd   = new Date(now.getTime() - 61 * 1000).toISOString()

  const { data: missedSightings } = await admin
    .from('nr_lead_sightings')
    .select('contact_id, contact_name, first_seen_at, opp_created_at')
    .gte('first_seen_at', missedWindowStart)
    .lte('first_seen_at', missedWindowEnd)

  const { data: reps } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'rep')
    .or('hide_from_hr.is.null,hide_from_hr.eq.false,name.eq.Karthik')

  const repIds = (reps || []).map(r => r.id)
  let missedPenalized = 0

  for (const sighting of missedSightings || []) {
    const baseline = sighting.opp_created_at || sighting.first_seen_at
    if (!isPSTWorkHours(new Date(baseline))) continue

    const { data: fastResponses } = await admin
      .from('lead_response_events')
      .select('id')
      .eq('contact_id', sighting.contact_id)
      .lte('response_seconds', 60)
      .limit(1)

    if (fastResponses && fastResponses.length > 0) continue

    const noteKey = `No checkmark: ${sighting.contact_id}`
    const { count: existing } = await admin
      .from('score_events')
      .select('id', { count: 'exact', head: true })
      .eq('date', today)
      .eq('event_type', 'missed_checkmark')
      .eq('note', noteKey)

    if ((existing ?? 0) > 0) continue

    const contactLabel = sighting.contact_name || sighting.contact_id
    const inserts = repIds.map(repId => ({
      user_id: repId,
      event_type: 'missed_checkmark',
      points: -1,
      note: noteKey,
      date: today,
      auto_generated: true,
    }))

    if (inserts.length > 0) {
      await admin.from('score_events').insert(inserts)
      await notifySlack(`❌ *Missed Lead Checkmark — All Reps*\n*Penalty:* -1 pt each\n*Lead:* ${contactLabel}\n*Rule:* No one checkmarked within 60s (7am–3pm PST)`)
      missedPenalized++
    }
  }

  // ── CHECK 2: Checkmarked but no GHL call within 120s (-3pt individual) ─────
  // Leads that appeared 121–420s ago where the rep who checkmarked didn't call in GHL
  const callWindowStart = new Date(now.getTime() - 420 * 1000).toISOString()
  const callWindowEnd   = new Date(now.getTime() - 121 * 1000).toISOString()

  const { data: callSightings } = await admin
    .from('nr_lead_sightings')
    .select('contact_id, contact_name, first_seen_at, opp_created_at')
    .gte('first_seen_at', callWindowStart)
    .lte('first_seen_at', callWindowEnd)

  let callPenalized = 0

  for (const sighting of callSightings || []) {
    const baseline = sighting.opp_created_at || sighting.first_seen_at
    if (!isPSTWorkHours(new Date(baseline))) continue

    // Find reps who checkmarked this lead
    const { data: checkmarks } = await admin
      .from('lead_response_events')
      .select('worker_id, worker_name, responded_at')
      .eq('contact_id', sighting.contact_id)

    if (!checkmarks || checkmarks.length === 0) continue

    for (const checkmark of checkmarks) {
      if (!checkmark.worker_id || !checkmark.worker_name) continue

      // Dedup: only penalize once per rep per contact
      const noteKey = `No GHL call: ${sighting.contact_id}:${checkmark.worker_id}`
      const { count: existing } = await admin
        .from('score_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', checkmark.worker_id)
        .eq('date', today)
        .eq('event_type', 'no_call_after_checkmark')
        .eq('note', noteKey)

      if ((existing ?? 0) > 0) continue

      // Look up GHL user ID for this rep
      const repConfig = REP_IDS[checkmark.worker_name]
      if (!repConfig) {
        console.log(`[call-penalty] No GHL ID mapped for rep: ${checkmark.worker_name}`)
        continue
      }

      // Fetch GHL call logs for this contact
      const calls = await fetchGHLCalls(sighting.contact_id)
      const baselineMs = new Date(baseline).getTime()

      const calledInTime = calls.some(call => {
        if (call.userId !== repConfig.ghlUserId) return false
        const callMs = new Date(call.dateAdded).getTime()
        // Call must be after lead arrived and within 120s
        return callMs >= baselineMs && callMs - baselineMs <= 120_000
      })

      if (!calledInTime) {
        const contactLabel = sighting.contact_name || sighting.contact_id
        await admin.from('score_events').insert({
          user_id:        checkmark.worker_id,
          event_type:     'no_call_after_checkmark',
          points:         -3,
          note:           noteKey,
          date:           today,
          auto_generated: true,
        })
        await notifySlack(`📵 *No Call After Checkmark — ${checkmark.worker_name}*\n*Penalty:* -3 pts\n*Lead:* ${contactLabel}\n*Rule:* Checkmarked but no GHL call within 120s of lead arrival`)
        callPenalized++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    missedCheckmark: { checked: (missedSightings || []).length, penalized: missedPenalized },
    noCallAfterCheckmark: { checked: (callSightings || []).length, penalized: callPenalized },
  })
}
