import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAGE_MAP: Record<string, 'nr' | 'nq' | 'fu'> = {
  no_response:   'nr',
  not_qualified: 'nq',
  follow_up:     'fu',
  sent:          'fu',
}

type Lead = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }

/**
 * GET /api/metrics/creative-overview
 * Returns per-ad NR/NQ/FU counts + contact arrays from Supabase ghl_leads.
 * No GHL API call needed — webhook already populates pipeline_stage + ad_id.
 */
export async function GET() {
  const [signedRes, pipelineRes, firmsRes] = await Promise.all([
    // Signed cases (pipeline_stage IS NULL)
    supabase.from('ghl_leads')
      .select('ad_id, firm_id'),

    // NR / NQ / F/U (pipeline_stage IS NOT NULL)
    supabase.from('ghl_leads')
      .select('ad_id, firm_id, pipeline_stage, contact_name, contact_phone, contact_email, created_at')
      .not('pipeline_stage', 'is', null),

    supabase.from('firms').select('id, slug, name'),
  ])

  // Build firm lookup
  const firmById: Record<string, { slug: string; name: string }> = {}
  for (const f of (firmsRes.data || [])) {
    if (f.id) firmById[f.id] = { slug: f.slug, name: f.name }
  }

  // Signed cases per ad_id
  type AdData = {
    signedCases: number
    firmSlug: string | null
    firmName: string | null
    nrCount: number
    nqCount: number
    fuCount: number
    nrLeads: Lead[]
    nqLeads: Lead[]
    fuLeads: Lead[]
  }

  const byAdId: Record<string, AdData> = {}

  for (const row of (signedRes.data || [])) {
    if (!row.ad_id) continue
    const firm = firmById[row.firm_id] || null
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = {
      signedCases: 0, firmSlug: firm?.slug || null, firmName: firm?.name || null,
      nrCount: 0, nqCount: 0, fuCount: 0, nrLeads: [], nqLeads: [], fuLeads: [],
    }
    byAdId[row.ad_id].signedCases++
    if (firm?.slug && !byAdId[row.ad_id].firmSlug) {
      byAdId[row.ad_id].firmSlug = firm.slug
      byAdId[row.ad_id].firmName = firm.name
    }
  }

  // NR / NQ / F/U per ad_id — straight from Supabase webhook data
  for (const row of (pipelineRes.data || [])) {
    if (!row.ad_id || !row.pipeline_stage) continue
    const stage = STAGE_MAP[row.pipeline_stage.toLowerCase()]
    if (!stage) continue

    const firm = firmById[row.firm_id] || null
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = {
      signedCases: 0, firmSlug: firm?.slug || null, firmName: firm?.name || null,
      nrCount: 0, nqCount: 0, fuCount: 0, nrLeads: [], nqLeads: [], fuLeads: [],
    }

    const lead: Lead = {
      name:      row.contact_name || null,
      phone:     row.contact_phone || null,
      email:     row.contact_email || null,
      createdAt: row.created_at || null,
    }

    byAdId[row.ad_id][`${stage}Count`]++
    byAdId[row.ad_id][`${stage}Leads`].push(lead)

    if (firm?.slug && !byAdId[row.ad_id].firmSlug) {
      byAdId[row.ad_id].firmSlug = firm.slug
      byAdId[row.ad_id].firmName = firm.name
    }
  }

  return NextResponse.json({ byAdId })
}
