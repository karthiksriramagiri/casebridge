import { NextResponse } from 'next/server'

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

  // Fetch pipeline stage data for both pipelines in parallel
  const results = await Promise.all(
    PIPELINES.map(async (p) => {
      const res = await fetch(
        `${GHL_BASE}/opportunities/pipelines?locationId=${LOCATION_ID}`,
        { headers, cache: 'no-store' }
      )
      if (!res.ok) {
        console.error('[dialer:campaigns] GHL error', res.status, await res.text())
        return []
      }
      const data = await res.json()
      const pipeline = (data.pipelines ?? []).find((pl: any) => pl.id === p.id)
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
  )

  const campaigns = results.flat()

  // Fetch lead counts per stage in parallel (batch of 22 requests)
  await Promise.all(
    campaigns.map(async (c) => {
      try {
        const res = await fetch(
          `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${c.pipelineId}&pipeline_stage_id=${c.stageId}&limit=1`,
          { headers, cache: 'no-store' }
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
