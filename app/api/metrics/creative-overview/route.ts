import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_API_KEY = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

// Pipeline IDs per firm slug — identical to kpi/route.ts
const GHL_PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
}

// Stage IDs → NR/NQ/FU — identical to kpi/route.ts
const GHL_STAGE_LABEL: Record<string, 'nr' | 'nq' | 'fu'> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr', '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu', 'a9e1b12f-94c4-4ca2-b696-1b3bf349d158': 'nq',
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr', 'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu', 'f0382a1e-b759-450f-8efe-d168cc10e3b1': 'nq',
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr', '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu', '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr', 'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu', '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
}

type PipelineContact = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }
type PipelineAdLeads = { nr: PipelineContact[]; nq: PipelineContact[]; fu: PipelineContact[] }

/**
 * Identical to fetchGHLPipelineBreakdown in kpi/route.ts.
 * Fetches ONE pipeline and returns contact details per ad ID.
 */
async function fetchGHLPipelineBreakdown(pipelineId: string, start: string, end: string): Promise<Record<string, PipelineAdLeads>> {
  if (!GHL_API_KEY) return {}
  const breakdown: Record<string, PipelineAdLeads> = {}
  let url: string | null =
    `https://services.leadconnectorhq.com/opportunities/search` +
    `?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`

  let pages = 0
  while (url && pages < 20) {
    pages++
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    })
    if (!res.ok) break
    const data: any = await res.json()

    for (const opp of (data.opportunities || [])) {
      const label = GHL_STAGE_LABEL[opp.pipelineStageId]
      if (!label) continue

      const created = opp.createdAt ? opp.createdAt.split('T')[0] : ''
      if (created < start || created > end) continue

      const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
      const adId = attr?.utmAdId || attr?.utmContent || null
      if (!adId) continue

      if (!breakdown[adId]) breakdown[adId] = { nr: [], nq: [], fu: [] }
      breakdown[adId][label].push({
        name:      opp.contact?.name || opp.name || null,
        phone:     opp.contact?.phone || null,
        email:     opp.contact?.email || null,
        createdAt: opp.createdAt || null,
      })
    }

    url = data.meta?.nextPageUrl || null
  }

  return breakdown
}

/**
 * GET /api/metrics/creative-overview
 * ?firm=lhp          — fetch ONE GHL pipeline (fast, mirrors kpi/route.ts per-firm call)
 * ?leads=1           — include full contact arrays in response
 * (no params)        — only Supabase signed cases, no GHL call
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const firmSlug   = searchParams.get('firm')     // single pipeline slug
  const includeLeads = searchParams.get('leads') === '1'

  // Always: signed cases per ad_id from Supabase (pipeline_stage IS NULL = signed)
  const [leadsRes, firmsRes] = await Promise.all([
    supabase.from('ghl_leads').select('ad_id, firm_id').is('pipeline_stage', null),
    supabase.from('firms').select('id, slug, name'),
  ])

  const firmById: Record<string, { slug: string; name: string }> = {}
  for (const f of (firmsRes.data || [])) {
    if (f.id) firmById[f.id] = { slug: f.slug, name: f.name }
  }

  const byAdId: Record<string, { signedCases: number; firmSlug: string | null; firmName: string | null }> = {}
  for (const row of (leadsRes.data || [])) {
    if (!row.ad_id) continue
    const firm = firmById[row.firm_id] || null
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = { signedCases: 0, firmSlug: firm?.slug || null, firmName: firm?.name || null }
    byAdId[row.ad_id].signedCases++
  }

  // GHL pipeline data — same logic as kpi/route.ts, for ONE pipeline at a time
  let pipelineBreakdown: Record<string, PipelineAdLeads> = {}
  if (firmSlug && includeLeads) {
    const pipelineId = GHL_PIPELINES[firmSlug]
    if (pipelineId) {
      const now = new Date()
      const start = new Date(now); start.setDate(start.getDate() - 89)
      pipelineBreakdown = await fetchGHLPipelineBreakdown(
        pipelineId,
        start.toISOString().split('T')[0],
        now.toISOString().split('T')[0]
      )
    }
  }

  // Build result
  const allAdIds = new Set([...Object.keys(byAdId), ...Object.keys(pipelineBreakdown)])
  const result: Record<string, any> = {}

  for (const adId of allAdIds) {
    const s = byAdId[adId]
    const p = pipelineBreakdown[adId]
    result[adId] = {
      signedCases: s?.signedCases ?? 0,
      firmSlug:    s?.firmSlug   ?? null,
      firmName:    s?.firmName   ?? null,
      nrCount:     p?.nr.length  ?? 0,
      nqCount:     p?.nq.length  ?? 0,
      fuCount:     p?.fu.length  ?? 0,
      ...(includeLeads ? {
        nrLeads: p?.nr ?? [],
        nqLeads: p?.nq ?? [],
        fuLeads: p?.fu ?? [],
      } : {}),
    }
    if (s?.firmSlug) { result[adId].firmSlug = s.firmSlug; result[adId].firmName = s.firmName }
  }

  return NextResponse.json({ byAdId: result, firm: firmSlug })
}
