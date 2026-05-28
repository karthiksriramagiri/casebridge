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
  latestInvoice: string | null
  nrCount: number
  nqCount: number
  fuCount: number
  chaseCount: number
  nrLeads: Lead[]
  nqLeads: Lead[]
  fuLeads: Lead[]
  chaseLeads: Lead[]
}

function emptyAdData(firmSlug: string | null = null, firmName: string | null = null, latestInvoice: string | null = null): AdData {
  return { signedCases: 0, firmSlug, firmName, latestInvoice, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, nrLeads: [], nqLeads: [], fuLeads: [], chaseLeads: [] }
}

// Fetch all opportunities for a pipeline and return per-adId breakdown
// If start/end provided, filters by opp.createdAt date range
async function fetchPipelineBreakdown(
  pipelineId: string,
  start: string | null = null,
  end: string | null = null,
): Promise<Record<string, { label: 'nr' | 'nq' | 'fu' | 'chase'; contact: Lead }[]>> {
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
      // Date filter: skip opps outside the requested date range
      if (start && end) {
        const created = (opp.createdAt || '').split('T')[0]
        if (created < start || created > end) continue
      }
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

function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  switch (preset) {
    case 'today':     return { start: today, end: today }
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      const d = y.toISOString().split('T')[0]
      return { start: d, end: d }
    }
    case 'last_7d': {
      const s = new Date(now); s.setDate(s.getDate() - 6)
      return { start: s.toISOString().split('T')[0], end: today }
    }
    case 'last_14d': {
      const s = new Date(now); s.setDate(s.getDate() - 13)
      return { start: s.toISOString().split('T')[0], end: today }
    }
    case 'last_30d': {
      const s = new Date(now); s.setDate(s.getDate() - 29)
      return { start: s.toISOString().split('T')[0], end: today }
    }
    default: return { start: '2020-01-01', end: today }
  }
}

/**
 * GET /api/metrics/creative-overview
 * Returns per-ad signed cases (date-filtered) + NR/NQ/FU/Chase counts from GHL API + Supabase.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const datePreset = searchParams.get('date_preset') || 'maximum'
  const { start, end } = getDateRange(datePreset)

  try {
    // Fetch Supabase data and GHL pipeline data in parallel (separately to avoid spread issues)
    const pipelineStart = datePreset !== 'maximum' ? start : null
    const pipelineEnd   = datePreset !== 'maximum' ? end   : null

    let signedQuery = supabase.from('ghl_leads').select('ad_id, firm_id, created_at')
    if (datePreset !== 'maximum') {
      signedQuery = signedQuery.gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`)
    }

    const [signedRes, firmsRes, invoicesRes, pipelineResults] = await Promise.all([
      signedQuery,
      supabase.from('firms').select('id, slug, name'),
      supabase.from('firm_invoices').select('firm_id, code').order('sort_order', { ascending: false }).order('period_start', { ascending: false }),
      Promise.all(
        Object.entries(GHL_PIPELINES).map(([slug, pid]) =>
          fetchPipelineBreakdown(pid, pipelineStart, pipelineEnd)
            .then(data => ({ slug, data }))
            .catch(() => ({ slug, data: {} as Record<string, { label: 'nr' | 'nq' | 'fu' | 'chase'; contact: Lead }[]> }))
        )
      ),
    ])

    // Build firm lookup with latest invoice
    const latestInvoiceByFirmId: Record<string, string> = {}
    for (const inv of (invoicesRes.data || [])) {
      if (inv.firm_id && !latestInvoiceByFirmId[inv.firm_id]) {
        latestInvoiceByFirmId[inv.firm_id] = inv.code
      }
    }

    const firmById: Record<string, { slug: string; name: string; latestInvoice: string | null }> = {}
    for (const f of (firmsRes.data || [])) {
      if (f.id) firmById[f.id] = { slug: f.slug, name: f.name, latestInvoice: latestInvoiceByFirmId[f.id] || null }
    }

    const byAdId: Record<string, AdData> = {}

    // Signed cases from Supabase
    for (const row of (signedRes.data || [])) {
      if (!row.ad_id) continue
      const firm = firmById[row.firm_id] || null
      if (!byAdId[row.ad_id]) byAdId[row.ad_id] = emptyAdData(firm?.slug || null, firm?.name || null, firm?.latestInvoice || null)
      byAdId[row.ad_id].signedCases++
      if (firm?.slug && !byAdId[row.ad_id].firmSlug) {
        byAdId[row.ad_id].firmSlug = firm.slug
        byAdId[row.ad_id].firmName = firm.name
        byAdId[row.ad_id].latestInvoice = firm.latestInvoice
      }
    }

    // Pipeline data from GHL API
    const firmBySlug: Record<string, { slug: string; name: string; latestInvoice: string | null }> = {}
    for (const f of Object.values(firmById)) firmBySlug[f.slug] = f

    for (const { slug, data } of pipelineResults) {
      for (const [adId, entries] of Object.entries(data)) {
        if (!byAdId[adId]) {
          const firm = firmBySlug[slug] || null
          byAdId[adId] = emptyAdData(slug, slug, firm?.latestInvoice || null)
        }
        for (const { label, contact } of entries) {
          if (label === 'nr') { byAdId[adId].nrCount++; byAdId[adId].nrLeads.push(contact) }
          else if (label === 'nq') { byAdId[adId].nqCount++; byAdId[adId].nqLeads.push(contact) }
          else if (label === 'fu') { byAdId[adId].fuCount++; byAdId[adId].fuLeads.push(contact) }
          else if (label === 'chase') { byAdId[adId].chaseCount++; byAdId[adId].chaseLeads.push(contact) }
        }
      }
    }

    return NextResponse.json({ byAdId })
  } catch (err) {
    console.error('[creative-overview] unhandled error:', err)
    return NextResponse.json({ error: String(err), byAdId: {} }, { status: 500 })
  }
}
