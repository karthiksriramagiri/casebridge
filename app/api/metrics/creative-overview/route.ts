import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GHL_API_KEY = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const GHL_PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
}

const GHL_STAGE_LABEL: Record<string, 'nr' | 'nq' | 'fu'> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr', '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu', 'a9e1b12f-94c4-4ca2-b696-1b3bf349d158': 'nq',
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr', 'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu', 'f0382a1e-b759-450f-8efe-d168cc10e3b1': 'nq',
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr', '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu', '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr', 'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu', '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
}

async function fetchAllPipelines(): Promise<Record<string, { nr: number; nq: number; fu: number }>> {
  if (!GHL_API_KEY) return {}
  const now = new Date()
  const start = new Date(now); start.setDate(start.getDate() - 89)
  const startStr = start.toISOString().split('T')[0]
  const endStr = now.toISOString().split('T')[0]
  const combined: Record<string, { nr: number; nq: number; fu: number }> = {}

  await Promise.all(
    Object.entries(GHL_PIPELINES).map(async ([, pipelineId]) => {
      let url: string | null = `https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`
      let pages = 0
      while (url && pages < 20) {
        pages++
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' }, cache: 'no-store' })
          if (!res.ok) break
          const data = await res.json()
          for (const opp of (data.opportunities || [])) {
            const label = GHL_STAGE_LABEL[opp.pipelineStageId]
            if (!label) continue
            const created = opp.createdAt ? opp.createdAt.split('T')[0] : ''
            if (created < startStr || created > endStr) continue
            const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
            const adId = attr?.utmAdId || attr?.utmContent || null
            if (!adId) continue
            if (!combined[adId]) combined[adId] = { nr: 0, nq: 0, fu: 0 }
            combined[adId][label]++
          }
          url = data.meta?.nextPageUrl || null
        } catch { break }
      }
    })
  )
  return combined
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const includePipeline = searchParams.get('pipeline') === '1'

  // Fast: signed cases per ad_id from Supabase + firm lookup
  const [leadsRes, firmsRes] = await Promise.all([
    supabase.from('ghl_leads').select('ad_id, firm_id'),
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

  // Optional slow: GHL pipeline counts
  let pipelineData: Record<string, { nr: number; nq: number; fu: number }> = {}
  if (includePipeline) {
    pipelineData = await fetchAllPipelines()
  }

  const result: Record<string, any> = {}
  for (const [adId, data] of Object.entries(byAdId)) {
    result[adId] = {
      ...data,
      nrCount: pipelineData[adId]?.nr || 0,
      nqCount: pipelineData[adId]?.nq || 0,
      fuCount: pipelineData[adId]?.fu || 0,
    }
  }
  if (includePipeline) {
    for (const [adId, p] of Object.entries(pipelineData)) {
      if (!result[adId]) result[adId] = { signedCases: 0, firmSlug: null, firmName: null, nrCount: p.nr, nqCount: p.nq, fuCount: p.fu }
      else { result[adId].nrCount = p.nr; result[adId].nqCount = p.nq; result[adId].fuCount = p.fu }
    }
  }

  return NextResponse.json({ byAdId: result })
}
