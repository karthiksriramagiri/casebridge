import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GHL Pipeline config (mirrors kpi/route.ts) ───────────────────────────────
const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const GHL_PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
}

const GHL_STAGE_LABEL: Record<string, 'nr' | 'nq' | 'fu' | 'chase'> = {
  // LHP
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr',
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu',
  '1a4eed62-09ea-4108-ab64-2e16930350d6': 'chase',
  'a9e1b12f-94c4-4ca2-b696-1b3bf349d158': 'nq',
  // Eisenberg
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr',
  'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu',
  'f0382a1e-b759-450f-8efe-d168cc10e3b1': 'nq',
  // THL
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr',
  '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu',
  '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
  // MCA
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr',
  'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu',
  '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
}

type Lead = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }

type AdData = {
  signedCases: number
  firmSlug: string | null
  firmName: string | null
  nrCount: number
  nqCount: number
  fuCount: number
  chaseCount: number
  nrLeads: Lead[]
  nqLeads: Lead[]
  fuLeads: Lead[]
  chaseLeads: Lead[]
}

function emptyAdData(firmSlug: string | null = null, firmName: string | null = null): AdData {
  return { signedCases: 0, firmSlug, firmName, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, nrLeads: [], nqLeads: [], fuLeads: [], chaseLeads: [] }
}

// Fetch all opportunities for a pipeline and return per-adId breakdown
async function fetchPipelineBreakdown(pipelineId: string): Promise<Record<string, { label: 'nr' | 'nq' | 'fu' | 'chase'; contact: Lead }[]>> {
  if (!GHL_API_KEY) return {}
  const result: Record<string, { label: 'nr' | 'nq' | 'fu' | 'chase'; contact: Lead }[]> = {}
  let url: string | null =
    `https://services.leadconnectorhq.com/opportunities/search` +
    `?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`
  let pages = 0
  while (url && pages < 20) {
    pages++
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      cache: 'no-store',
    })
    if (!res.ok) break
    const data: any = await res.json()
    for (const opp of (data.opportunities || [])) {
      const stageName = (opp.pipelineStage?.name || '').toLowerCase()
      const label: 'nr' | 'nq' | 'fu' | 'chase' | undefined =
        GHL_STAGE_LABEL[opp.pipelineStageId] ||
        (stageName.includes('chase') ? 'chase' :
         stageName.includes('no response') ? 'nr' :
         stageName.includes('not qualified') ? 'nq' :
         stageName.includes('follow up') ? 'fu' : undefined)
      if (!label) continue
      const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
      const adId = attr?.utmAdId || attr?.utmContent || null
      if (!adId) continue
      if (!result[adId]) result[adId] = []
      result[adId].push({
        label,
        contact: {
          name:      opp.contact?.name || opp.name || null,
          phone:     opp.contact?.phone || null,
          email:     opp.contact?.email || null,
          createdAt: opp.createdAt || null,
        },
      })
    }
    url = data.meta?.nextPageUrl || null
  }
  return result
}

/**
 * GET /api/metrics/creative-overview
 * Returns per-ad signed cases + NR/NQ/FU/Chase counts from GHL API + Supabase.
 */
export async function GET() {
  // Fetch signed cases from Supabase + firm list + GHL pipeline data in parallel
  const pipelinePromises = Object.entries(GHL_PIPELINES).map(([slug, pid]) =>
    fetchPipelineBreakdown(pid).then(data => ({ slug, data }))
  )

  const [signedRes, firmsRes, ...pipelineResults] = await Promise.all([
    supabase.from('ghl_leads').select('ad_id, firm_id'),
    supabase.from('firms').select('id, slug, name'),
    ...pipelinePromises,
  ])

  // Build firm lookup
  const firmById: Record<string, { slug: string; name: string }> = {}
  for (const f of (firmsRes.data || [])) {
    if (f.id) firmById[f.id] = { slug: f.slug, name: f.name }
  }

  const byAdId: Record<string, AdData> = {}

  // Signed cases from Supabase
  for (const row of (signedRes.data || [])) {
    if (!row.ad_id) continue
    const firm = firmById[row.firm_id] || null
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = emptyAdData(firm?.slug || null, firm?.name || null)
    byAdId[row.ad_id].signedCases++
    if (firm?.slug && !byAdId[row.ad_id].firmSlug) {
      byAdId[row.ad_id].firmSlug = firm.slug
      byAdId[row.ad_id].firmName = firm.name
    }
  }

  // Pipeline data from GHL API
  for (const { slug, data } of pipelineResults as { slug: string; data: Record<string, { label: 'nr' | 'nq' | 'fu' | 'chase'; contact: Lead }[]> }[]) {
    for (const [adId, entries] of Object.entries(data)) {
      if (!byAdId[adId]) byAdId[adId] = emptyAdData(slug, slug)
      for (const { label, contact } of entries) {
        byAdId[adId][`${label}Count`]++
        byAdId[adId][`${label}Leads`].push(contact)
      }
    }
  }

  return NextResponse.json({ byAdId })
}
