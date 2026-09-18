import { NextResponse } from 'next/server'

import { GhlQuotaError, getPipelines } from '@/lib/ghl-pipelines'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const PIPELINES = [
  { id: 'yMqNixSnChC5lcGQXA1g', firm: 'Larry H. Parker',            firmSlug: 'lhp' },
  { id: 'r1AsAtC7lzwO9ybtkQlA', firm: 'Larry H. Parker (Spanish)',  firmSlug: 'lhp_s' },
  { id: 'Jj4DCdu5duYDgI87ERbx', firm: 'Fears Law',                  firmSlug: 'fears' },
  { id: '0tBzhg0eGSNKL870y3yV', firm: 'J&M',                        firmSlug: 'jm' },
]

function ghlHeaders() {
  const key = (process.env.GHL_API_KEY ?? '').trim()
  return {
    Authorization: `Bearer ${key}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
  }
}

export async function GET() {
  const headers = ghlHeaders()

  // One cached schema read for every pipeline. This used to fetch the whole
  // location-wide pipeline list once PER pipeline with cache:'no-store', and a
  // 429 on that fetch returned [] with HTTP 200 — so the leads page rendered
  // empty with no error, reps reloaded, and each reload spent ~26 more calls.
  let allPipelines
  try {
    allPipelines = await getPipelines()
  } catch (err) {
    if (err instanceof GhlQuotaError) {
      console.error('[dialer:campaigns]', err.message)
      return NextResponse.json(
        {
          error: err.message,
          dailyRemaining: err.dailyRemaining,
          resetInSeconds: err.resetMs ? Math.round(Number(err.resetMs) / 1000) : null,
        },
        { status: err.status === 429 ? 429 : 502 }
      )
    }
    throw err
  }

  const results = PIPELINES.map((p) => {
      const pipeline = allPipelines.find((pl) => pl.id === p.id)
      if (!pipeline) return []

      return (pipeline.stages ?? []).map((stage: any) => ({
        id: `${p.firmSlug}:${stage.id}`,
        name: `${p.firm} — ${stage.name}`,
        firm: p.firm,
        firmSlug: p.firmSlug,
        pipelineId: p.id,
        stageId: stage.id,
        stageName: stage.name,
        position: stage.position ?? 0,
        // leadCount comes from a separate count fetch below
        leadCount: 0,
        status: 'paused' as const,
      }))
  })

  const campaigns = results.flat()

  // Fetch lead counts per stage in parallel (batch of 22 requests)
  await Promise.all(
    campaigns.map(async (c) => {
      try {
        const res = await fetch(
          `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${c.pipelineId}&pipeline_stage_id=${c.stageId}&limit=1`,
          // 5-min shared cache: these ~22 counts are the bulk of this route's
          // cost and only feed a badge. At 60s a continuously-used page still
          // costs ~32k calls/day; at 300s it's ~6k. Lower it if the badges
          // need to feel live and the quota allows.
          { headers, next: { revalidate: 300 } }
        )
        if (res.ok) {
          const d = await res.json()
          c.leadCount = d.meta?.total ?? 0
        }
      } catch {
        // leave 0
      }
    })
  )

  // Sort: stages with leads first, then by pipeline position
  campaigns.sort((a, b) => {
    if (b.leadCount !== a.leadCount) return b.leadCount - a.leadCount
    return a.position - b.position
  })

  return NextResponse.json({ campaigns })
}
