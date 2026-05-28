import { NextRequest, NextResponse } from 'next/server'

const GHL_API_KEY = process.env.GHL_API_KEY || ''

const GHL_PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
}

export async function GET(request: NextRequest) {
  if (!GHL_API_KEY) return NextResponse.json({ error: 'No GHL_API_KEY' }, { status: 500 })

  const results: Record<string, any> = {}

  // Fetch all pipelines for the location once
  const res = await fetch(
    `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=AGAoUCwWTwc4Bqslwt9r`,
    {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    }
  )
  if (!res.ok) {
    return NextResponse.json({ error: `HTTP ${res.status}`, body: await res.text() }, { status: 500 })
  }
  const data = await res.json()
  const pipelines: any[] = data.pipelines || []

  for (const [slug, pipelineId] of Object.entries(GHL_PIPELINES)) {
    const pipeline = pipelines.find((p: any) => p.id === pipelineId)
    results[slug] = pipeline
      ? (pipeline.stages || []).map((s: any) => ({ id: s.id, name: s.name }))
      : { error: 'not found' }
  }

  return NextResponse.json(results)
}
