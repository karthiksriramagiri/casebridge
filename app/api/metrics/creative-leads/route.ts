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

const GHL_STAGE_LABEL: Record<string, string> = {
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr', '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu', 'a9e1b12f-94c4-4ca2-b696-1b3bf349d158': 'nq',
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr', 'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu', 'f0382a1e-b759-450f-8efe-d168cc10e3b1': 'nq',
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr', '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu', '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr', 'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu', '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
}

const STAGE_FULL: Record<string, string> = {
  nr: 'No Response',
  nq: 'Not Qualified',
  fu: 'Follow Up',
}

// GET /api/metrics/creative-leads?ad_id=xxx
// Returns all GHL contacts attributed to a specific Meta ad ID
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const adId = searchParams.get('ad_id')
  if (!adId) return NextResponse.json({ error: 'ad_id required' }, { status: 400 })

  const leads: Array<{
    name: string | null
    phone: string | null
    email: string | null
    stage: string
    stageLabel: string
    createdAt: string | null
    source: 'ghl' | 'supabase'
  }> = []

  // 1. Check Supabase ghl_leads first (fast — from pipeline-stage webhook)
  const { data: dbLeads } = await supabase
    .from('ghl_leads')
    .select('contact_name, contact_phone, contact_email, pipeline_stage, created_at')
    .eq('ad_id', adId)
    .order('created_at', { ascending: false })

  const STAGE_MAP: Record<string, string> = {
    no_response:   'nr',
    not_qualified: 'nq',
    follow_up:     'fu',
    sent:          'fu',
  }

  for (const row of dbLeads || []) {
    const stageKey = row.pipeline_stage ? (STAGE_MAP[row.pipeline_stage] || 'fu') : 'signed'
    leads.push({
      name:       row.contact_name,
      phone:      row.contact_phone,
      email:      row.contact_email,
      stage:      stageKey,
      stageLabel: stageKey === 'signed' ? 'Signed' : (STAGE_FULL[stageKey] || stageKey),
      createdAt:  row.created_at,
      source:     'supabase',
    })
  }

  // 2. Fetch from GHL API — search all pipelines for opportunities with matching utmAdId
  if (GHL_API_KEY) {
    const seenContacts = new Set(leads.map(l => l.phone || l.email || l.name || '').filter(Boolean))

    await Promise.all(
      Object.values(GHL_PIPELINES).map(async (pipelineId) => {
        let url: string | null = `https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`
        let pages = 0
        while (url && pages < 10) {
          pages++
          try {
            const r: Response = await fetch(url, {
              headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
              cache: 'no-store',
            })
            if (!r.ok) break
            const d: any = await r.json()
            for (const opp of (d.opportunities || [])) {
              // Match by ad ID in attributions
              const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
              const oppAdId = attr?.utmAdId || attr?.utmContent || null
              if (oppAdId !== adId) continue

              const stageKey = GHL_STAGE_LABEL[opp.pipelineStageId] || 'fu'
              const name  = opp.contact?.name || opp.name || null
              const phone = opp.contact?.phone || null
              const email = opp.contact?.email || null

              // Skip if already in Supabase results
              const dedupeKey = phone || email || name || ''
              if (dedupeKey && seenContacts.has(dedupeKey)) continue
              if (dedupeKey) seenContacts.add(dedupeKey)

              leads.push({
                name,
                phone,
                email,
                stage:      stageKey,
                stageLabel: STAGE_FULL[stageKey] || stageKey,
                createdAt:  opp.createdAt || null,
                source:     'ghl',
              })
            }
            url = d.meta?.nextPageUrl || null
          } catch { break }
        }
      })
    )
  }

  // Sort by date descending
  leads.sort((a, b) => {
    if (!a.createdAt) return 1
    if (!b.createdAt) return -1
    return b.createdAt.localeCompare(a.createdAt)
  })

  return NextResponse.json({ leads, total: leads.length })
}
