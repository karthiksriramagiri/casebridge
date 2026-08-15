import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN = (process.env.META_ACCESS_TOKEN || '').trim().replace(/\\n$/, '')
const BASE = 'https://graph.facebook.com/v25.0'

// ─── GHL Pipeline ──────────────────────────────────────────────────────────
const GHL_API_KEY = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

// Pipeline IDs per firm slug
const GHL_PIPELINES: Record<string, string> = {
  lhp:         'yMqNixSnChC5lcGQXA1g',
  lhp_spanish: 'r1AsAtC7lzwO9ybtkQlA',
  eisenberg:   'Yk4w3ML56ECc10PFzjpK',
  thl:         'DYtmw8WEUtGePFbEDAIZ',
  mca:         '6Ku9EwTtMFk51o7Re9x0',
  fears:       'Jj4DCdu5duYDgI87ERbx',
  levine:      'JPyMNjGGAIxUv0FWW7Cg',
}

type StageLabel = 'new_lead' | 'nr' | 'fu' | 'chase' | 'appointment' | 'contract_sent' | 'pending_send' | 'nq' | 'mia' | 'qualified' | 'closed'

// Stage IDs → normalized label (all pipelines, all stages)
const GHL_STAGE_LABEL: Record<string, StageLabel> = {
  // LHP
  '3f868702-6f7a-4775-8b1c-b47e868ffe3a': 'new_lead',
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr',
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu',
  '1a4eed62-09ea-4108-ab64-2e16930350d6': 'chase',
  'ebf66385-363b-4e9e-98ae-62be59369437': 'appointment',
  '65c64d09-1fe5-4c40-954a-9efce26c5dbd': 'contract_sent',
  '7d951bd5-f762-442c-9c89-a9b32acc72f5': 'pending_send',
  'a9e1b12f-94c4-4ca2-b696-1b3bf349d158': 'nq',
  'e222baf6-1253-4bb8-9be9-49ee79a37eab': 'mia',
  // LHP Spanish
  'f6c598ba-45ba-4c30-815d-a51fc221f09c': 'new_lead',
  '70ea4655-6fb0-4aa8-b2b9-a4928230211c': 'nr',
  'e32cd5fd-a883-4da2-a374-10d9911a98f5': 'fu',
  '3886bd4a-5ad9-4197-ae89-3ebe5f4a00c4': 'chase',
  '0bcfd145-ef2b-492d-9937-dff5343fbdfb': 'contract_sent',
  'eca88328-b4b2-4380-a9e0-2cc3da9098d6': 'nq',
  '7b923790-2400-4bf8-b48f-dacd1258337a': 'mia',
  // Eisenberg
  '4e209e89-c540-44fd-b5c2-91f35884bb3a': 'new_lead',
  'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr',
  'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu',
  'f0382a1e-b759-450f-8efe-d168cc10e3b1': 'nq',
  'f011f3ad-b429-443f-9ff3-4e0eff68854a': 'closed',
  // THL
  '51f0c592-1111-43ba-bb3b-2f2f489177a8': 'new_lead',
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr',
  '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu',
  '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
  '20ffb08b-2f48-46e6-b86a-3eb46a79c322': 'closed',
  // MCA
  '402b0271-c256-4347-b217-4f771ec37992': 'new_lead',
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr',
  'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu',
  '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
  'cd35b35b-b09c-4151-b382-9c1574210d15': 'qualified',
  'e4c30bbe-35aa-4411-8c84-cc032b1c0252': 'closed',
  // Fears Law
  'c894b249-0d17-40dd-8ac6-72294a874e9e': 'new_lead',
  '91ced34f-cb7b-4a03-a47d-f4ffd25fd108': 'nr',
  '1d6faa32-dd4b-4258-8595-93fdd6d0c8c5': 'fu',
  '8e00bca9-3318-442a-8f71-f358762878da': 'chase',
  '4612d574-c0c5-4280-bb7d-ed015f5e6e22': 'appointment',
  '6134ba10-9449-4d1b-971b-98aa6d395aa9': 'contract_sent',
  'cf799840-d3b1-43a8-9ea1-70eadb6ee8e7': 'pending_send',
  '04c022c5-2491-46d9-a37d-1c6410dfdc42': 'nq',
  'a6b2cede-5cf5-4c9a-bf57-0a5bee22a6a4': 'mia',
  // Levine Law
  '3d2d57c6-a91b-47a2-8a1a-16dd6bcaffa2': 'new_lead',
  '620b4cfc-fc0c-4c2c-a490-44a6bb36a3d1': 'nr',
  '0ce872eb-1757-4267-949b-cebf521b3466': 'fu',
  '47301b0f-3f04-4ab7-869f-55407e63c72d': 'chase',
  '42721281-30d6-4320-a89f-da91231353b4': 'nq',
}

type PipelineContact = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }
type PipelineAdLeads = {
  new_lead: PipelineContact[]; nr: PipelineContact[]; fu: PipelineContact[]; chase: PipelineContact[]
  appointment: PipelineContact[]; contract_sent: PipelineContact[]; pending_send: PipelineContact[]
  nq: PipelineContact[]; mia: PipelineContact[]; qualified: PipelineContact[]; closed: PipelineContact[]
}

const STAGE_MAP: Record<string, StageLabel> = {
  new_lead:      'new_lead',
  no_response:   'nr',
  follow_up:     'fu',
  chase:         'chase',
  appointment:   'appointment',
  contract_sent: 'contract_sent',
  sent:          'contract_sent',    // webhook sometimes sends 'sent' instead of 'contract_sent'
  pending_send:  'pending_send',
  not_qualified: 'nq',
  mia:           'mia',
  qualified:     'qualified',
  closed:        'closed',
}

// Fetch all opportunities for a pipeline and return per-ad NR/NQ/FU contact lists
// Filters by createdAt within the invoice/date window
// Unattributed leads (no UTM ad_id) are collected under '__unattributed__'
async function fetchGHLPipelineBreakdown(
  pipelineId: string,
  start: string,
  end: string
): Promise<Record<string, PipelineAdLeads>> {
  if (!GHL_API_KEY) return {}
  const breakdown: Record<string, PipelineAdLeads> = {}
  // Track unattributed contact IDs so we can try to resolve them later
  const unattributedContacts: { contactId: string; label: StageLabel; contact: PipelineContact }[] = []
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
      const stageName = (opp.pipelineStage?.name || '').toLowerCase()
      const label: StageLabel | undefined =
        GHL_STAGE_LABEL[opp.pipelineStageId] ||
        (stageName.includes('new lead') || stageName.includes('new_lead') ? 'new_lead' :
         stageName.includes('no response') || stageName.includes('no_response') ? 'nr' :
         stageName.includes('follow up') || stageName.includes('follow_up') ? 'fu' :
         stageName.includes('chase') ? 'chase' :
         stageName.includes('appointment') ? 'appointment' :
         stageName.includes('contract sent') || stageName.includes('contract_sent') ? 'contract_sent' :
         stageName.includes('pending send') || stageName.includes('pending_send') ? 'pending_send' :
         stageName.includes('not qualified') || stageName.includes('not_qualified') ? 'nq' :
         stageName === 'mia' ? 'mia' :
         stageName.includes('qualified lead') ? 'qualified' :
         stageName.includes('closed') ? 'closed' : undefined)
      if (!label) continue

      // Filter to invoice/date window by opportunity createdAt
      const created = opp.createdAt ? opp.createdAt.split('T')[0] : ''
      if (created < start || created > end) continue

      const contact: PipelineContact = {
        name:      opp.contact?.name || opp.name || null,
        phone:     opp.contact?.phone || null,
        email:     opp.contact?.email || null,
        createdAt: opp.createdAt || null,
      }

      // Get ad_id from first attribution
      const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
      const adId = attr?.utmAdId || attr?.utmContent || null
      if (adId) {
        if (!breakdown[adId]) breakdown[adId] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
        breakdown[adId][label].push(contact)
      } else {
        // No UTM attribution — try to resolve via contact_id later
        const cid = opp.contact?.id || opp.contactId || null
        if (cid) {
          unattributedContacts.push({ contactId: cid, label, contact })
        } else {
          // Truly unattributed — store under special key
          if (!breakdown['__unattributed__']) breakdown['__unattributed__'] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
          breakdown['__unattributed__'][label].push(contact)
        }
      }
    }

    url = data.meta?.nextPageUrl || null
  }

  // Resolve unattributed contacts by looking up their ad_id in ghl_leads
  if (unattributedContacts.length > 0) {
    const contactIds = [...new Set(unattributedContacts.map(c => c.contactId))]
    const { data: signedRecords } = await supabase
      .from('ghl_leads')
      .select('contact_id, ad_id, ad_name')
      .in('contact_id', contactIds)
      .is('pipeline_stage', null)
    const contactAdMap: Record<string, string | null> = {}
    for (const sr of (signedRecords || [])) {
      if (sr.contact_id) {
        const hasRealAdId = sr.ad_id && !sr.ad_id.includes('{{')
        contactAdMap[sr.contact_id] = hasRealAdId ? sr.ad_id : null
      }
    }
    for (const { contactId, label, contact } of unattributedContacts) {
      const resolvedAdId = contactAdMap[contactId] || '__unattributed__'
      if (!breakdown[resolvedAdId]) breakdown[resolvedAdId] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
      breakdown[resolvedAdId][label].push(contact)
    }
  }

  return breakdown
}

// Manual Meta overrides — keyed by "slug:INVOICE-CODE"
// Use when Meta API data is incorrect or unavailable for a firm
const META_LEADS_OVERRIDES: Record<string, number> = {
  'eisenberg:INV-1': 19,
}
const META_SPEND_OVERRIDES: Record<string, number> = {}

let _metaError: string | null = null

async function fetchMeta(path: string, params: Record<string, string> = {}) {
  if (!TOKEN) {
    _metaError = 'META_ACCESS_TOKEN env var is not set.'
    return { data: [] }
  }
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `HTTP ${res.status}`
    const code = json?.error?.code
    console.error('Meta API error:', res.status, JSON.stringify(json?.error))
    // Code 190 = expired/invalid token
    if (code === 190) {
      _metaError = `Meta access token expired or invalid. Refresh it in Meta Business Manager → System Users → Generate Token. (${msg})`
    } else {
      _metaError = msg
    }
    return { data: [] }
  }
  return json
}

function getDateRange(preset: string): { start: string; end: string; days: number } {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  switch (preset) {
    case 'today':
      return { start: today, end: today, days: 1 }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const d = y.toISOString().split('T')[0]
      return { start: d, end: d, days: 1 }
    }
    case 'last_7d': {
      const s = new Date(now)
      s.setDate(s.getDate() - 6)
      return { start: s.toISOString().split('T')[0], end: today, days: 7 }
    }
    case 'last_14d': {
      const s = new Date(now)
      s.setDate(s.getDate() - 13)
      return { start: s.toISOString().split('T')[0], end: today, days: 14 }
    }
    case 'last_30d': {
      const s = new Date(now)
      s.setDate(s.getDate() - 29)
      return { start: s.toISOString().split('T')[0], end: today, days: 30 }
    }
    case 'maximum':
    default: {
      // Meta allows up to 37 months back
      const s = new Date(now)
      s.setMonth(s.getMonth() - 36)
      return { start: s.toISOString().split('T')[0], end: today, days: 36 * 30 }
    }
  }
}

function getLeads(actions: any[] = []) {
  return parseInt(
    actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead')?.value || '0'
  )
}

function getLandingPageViews(actions: any[] = []) {
  return parseInt(
    actions.find(a => a.action_type === 'landing_page_view')?.value || '0'
  )
}

function getPhase(weeklySpend: number, firm: any, caseCount?: number | null): { label: string; color: string } {
  // If an invoice has a case_count, use it to determine phase tier
  if (caseCount != null) {
    if (caseCount <= 10) return { label: 'Initial', color: 'gray' }
    if (caseCount <= 20) return { label: 'Scale', color: 'blue' }
    if (caseCount <= 30) return { label: 'Pre-Max', color: 'green' }
    return { label: 'Max', color: 'purple' }
  }
  // Fallback: spend-based (non-invoice views)
  if (weeklySpend <= firm.phase_initial_max_weekly_spend) {
    return { label: 'Initial', color: 'gray' }
  }
  if (weeklySpend <= firm.phase_scale_max_weekly_spend) {
    return { label: 'Scale', color: 'blue' }
  }
  return { label: 'Max', color: 'purple' }
}

function replacementWindow(
  qualifiedAt: string | null,
  windowDays: number,
  caseStatus: string | null
): { daysLeft: number | null; replacementEnds: string | null; note: string } {
  if (!qualifiedAt) {
    return { daysLeft: null, replacementEnds: null, note: '—' }
  }
  const signed = new Date(qualifiedAt)
  if (Number.isNaN(signed.getTime())) {
    return { daysLeft: null, replacementEnds: null, note: '—' }
  }
  const end = new Date(signed)
  end.setUTCDate(end.getUTCDate() + windowDays)
  const replacementEnds = end.toISOString().split('T')[0]
  const st = (caseStatus || 'e_signed').toLowerCase()
  if (st === 'closed') {
    return { daysLeft: null, replacementEnds, note: 'Closed' }
  }
  if (st === 'replacement') {
    return { daysLeft: null, replacementEnds, note: 'Replacement' }
  }
  const now = new Date()
  const dayMs = 86400000
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / dayMs)
  if (daysLeft < 0) {
    return { daysLeft: 0, replacementEnds, note: 'Window ended' }
  }
  return { daysLeft, replacementEnds, note: `${daysLeft}d left` }
}

export async function GET(request: NextRequest) {
  _metaError = null  // reset per-request
  const { searchParams } = new URL(request.url)
  const firmSlug = searchParams.get('firm') || 'mca'
  const datePreset = searchParams.get('date_preset') || ''
  const customStart = searchParams.get('start_date') || ''
  const customEnd = searchParams.get('end_date') || ''
  const invoiceParam = searchParams.get('invoice')?.trim() || ''

  // Load firm config
  const { data: firm, error: firmError } = await supabase
    .from('firms')
    .select('*')
    .eq('slug', firmSlug)
    .single()

  if (firmError || !firm) {
    return NextResponse.json({ error: 'Firm not found.' }, { status: 404 })
  }

  // Resolve date range (invoice tab = firm_invoices period drives Meta + attribution)
  let start: string
  let end: string
  let days: number
  let metaDateParam: Record<string, string>
  let invoiceContext: { code: string; title: string | null; period_start: string; period_end: string; payment_received?: number | null; payment_interest_rate?: number | null; case_count?: number | null } | null = null

  if (invoiceParam) {
    const { data: inv, error: invErr } = await supabase
      .from('firm_invoices')
      .select('code, title, period_start, period_end, payment_received, payment_interest_rate, case_count')
      .eq('firm_id', firm.id)
      .eq('code', invoiceParam)
      .single()

    if (invErr) {
      const msg = invErr.message || ''
      if (
        invErr.code === 'PGRST205' ||
        /firm_invoices/i.test(msg) ||
        /schema cache/i.test(msg)
      ) {
        return NextResponse.json(
          {
            error:
              'Table firm_invoices is missing. Run supabase/migration_firm_invoice_periods.sql in the Supabase SQL Editor, then retry.',
            setupRequired: true,
          },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }
    if (!inv) {
      return NextResponse.json({ error: 'Invoice not found for this firm.' }, { status: 404 })
    }
    invoiceContext = inv
    start = inv.period_start
    end = inv.period_end
    const ms = new Date(end).getTime() - new Date(start).getTime()
    days = Math.max(1, Math.round(ms / 86400000) + 1)
    metaDateParam = { time_range: JSON.stringify({ since: start, until: end }) }
  } else if (customStart && customEnd) {
    start = customStart
    end = customEnd
    const ms = new Date(end).getTime() - new Date(start).getTime()
    days = Math.max(1, Math.round(ms / 86400000) + 1)
    metaDateParam = { time_range: JSON.stringify({ since: start, until: end }) }
  } else {
    const preset = datePreset || 'last_30d'
    const range = getDateRange(preset)
    start = range.start; end = range.end; days = range.days
    metaDateParam = { date_preset: preset }
  }

  const insightFields = 'spend,impressions,clicks,ctr,cpc,reach,actions,ad_name,ad_id,adset_name,campaign_name,adset_id,campaign_id'
  const accountId = firm.meta_account_id
  const campaignFilter = (firm.meta_campaign_filter || '').trim().toLowerCase()
  const noMeta = !accountId

  // Pull Meta data + weekly spend in parallel
  const ghlPipelineId = GHL_PIPELINES[firmSlug] || null

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10)

  const [adInsightsRes, dailyInsightsRes, weeklyInsightsRes, ghlLeadsRes, allFirmLeadsRes, opsRes, workerRatesRes, pipelineLeadsRes, weeklySignedRes] = await Promise.all([
    // Ad-level insights for creative CPQ breakdown
    noMeta ? Promise.resolve({ data: [] }) : fetchMeta(`/${accountId}/insights`, {
      fields: insightFields,
      ...metaDateParam,
      level: 'ad',
      limit: '500',
    }),
    // Daily breakdown for chart (account level — not filtered, used for trend only)
    noMeta ? Promise.resolve({ data: [] }) : fetchMeta(`/${accountId}/insights`, {
      fields: 'spend,actions,impressions',
      ...metaDateParam,
      time_increment: '1',
      level: 'account',
    }),
    // Current week spend — use time_range for consistency (date_preset lags)
    noMeta ? Promise.resolve({ data: [] }) : fetchMeta(`/${accountId}/insights`, {
      fields: 'spend,actions,campaign_name,adset_name,ad_name',
      time_range: JSON.stringify({ since: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0] })(), until: new Date().toISOString().split('T')[0] }),
      level: 'ad',
      limit: '500',
    }),
    // GHL signed cases in period — for invoice: use invoice_code only (source of truth)
    // for other timeframes: filter by qualified_at date range
    (() => {
      let q = supabase
        .from('ghl_leads')
        .select('id, ad_id, ad_name, victim_count, qualified_at, case_status, form_data')
        .eq('firm_id', firm.id)
      if (invoiceParam) {
        q = q.eq('invoice_code', invoiceParam)
      } else {
        q = q.gte('qualified_at', `${start}T00:00:00Z`).lte('qualified_at', `${end}T23:59:59Z`)
      }
      return q
    })(),
    (() => {
      let q = supabase
        .from('ghl_leads')
        .select(
          'id, contact_name, contact_phone, contact_email, ad_name, ad_id, victim_count, qualified_at, invoice_code, case_status, closed_by_profile_id, closer, second_closer_profile_id, second_closer, is_ot_close, accident_group_id, form_data, raw_payload'
        )
        .eq('firm_id', firm.id)
        .order('qualified_at', { ascending: false })
      if (invoiceParam) {
        q = q.eq('invoice_code', invoiceParam)
      } else {
        // Apply same date range as the count query so modal matches table count
        q = q.gte('qualified_at', `${start}T00:00:00Z`).lte('qualified_at', `${end}T23:59:59Z`)
      }
      return q
    })(),
    // Ops — invoice view loads firm/shared rows; attribution filtered below (tagged invoice_code or dated in period)
    (() => {
      let q = supabase
        .from('ops_expenses')
        .select('amount, firm_id, invoice_code, date')
        .or(`firm_id.eq.${firm.id},firm_id.is.null`)
      if (!invoiceParam) {
        q = q.gte('date', start).lte('date', end)
      }
      return q
    })(),
    // Active worker pay rates
    supabase
      .from('worker_pay_rates')
      .select('weekly_rate, effective_from, effective_to')
      .lte('effective_from', end)
      .or(`effective_to.is.null,effective_to.gte.${start}`),
    // Pipeline stage leads from Supabase ghl_leads (pipeline_stage IS NOT NULL)
    (() => {
      let q = supabase
        .from('ghl_leads')
        .select('contact_id, ad_id, ad_name, pipeline_stage, contact_name, contact_phone, contact_email, created_at')
        .eq('firm_id', firm.id)
        .not('pipeline_stage', 'is', null)
      if (invoiceParam) {
        q = q.eq('invoice_code', invoiceParam)
      } else {
        q = q.gte('created_at', `${start}T00:00:00Z`).lte('created_at', `${end}T23:59:59Z`)
      }
      return q
    })(),
    // Weekly signed cases — last 7 days across ALL invoices (not scoped to current invoice)
    // Count all non-replacement cases: null, e_signed, closed all count
    supabase
      .from('ghl_leads')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', firm.id)
      .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
      .gte('qualified_at', `${sevenDaysAgoStr}T00:00:00Z`),
  ])

  // Fetch live pipeline data from GHL API (primary source — keyed by ad_id)
  const ghlPipelineBreakdown: Record<string, PipelineAdLeads> =
    ghlPipelineId ? await fetchGHLPipelineBreakdown(ghlPipelineId, start, end) : {}
  const ghlPipelineByName:    Record<string, PipelineAdLeads> = {}
  const unattributedPipelineRows: any[] = []
  for (const row of (pipelineLeadsRes.data || [])) {
    const label = STAGE_MAP[row.pipeline_stage]
    if (!label) continue
    const contact: PipelineContact = {
      name:      row.contact_name,
      phone:     row.contact_phone,
      email:     row.contact_email,
      createdAt: row.created_at,
    }
    const hasRealAdId = row.ad_id && !row.ad_id.includes('{{')
    if (hasRealAdId) {
      if (!ghlPipelineBreakdown[row.ad_id]) ghlPipelineBreakdown[row.ad_id] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
      ghlPipelineBreakdown[row.ad_id][label].push(contact)
    } else if (row.ad_name) {
      if (!ghlPipelineByName[row.ad_name]) ghlPipelineByName[row.ad_name] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
      ghlPipelineByName[row.ad_name][label].push(contact)
    } else if (row.contact_id) {
      // No ad attribution in this record — will try to inherit from signed record below
      unattributedPipelineRows.push(row)
    }
  }

  // Secondary attribution: look up signed records for unattributed pipeline contacts
  // (GHL stage-change webhooks often omit Meta ad attribution)
  if (unattributedPipelineRows.length > 0) {
    const contactIds = [...new Set(unattributedPipelineRows.map((r: any) => r.contact_id).filter(Boolean))]
    if (contactIds.length > 0) {
      const { data: signedRecords } = await supabase
        .from('ghl_leads')
        .select('contact_id, ad_id, ad_name')
        .eq('firm_id', firm.id)
        .is('pipeline_stage', null)
        .in('contact_id', contactIds)
      const contactAdMap: Record<string, { ad_id: string | null; ad_name: string | null }> = {}
      for (const sr of (signedRecords || [])) {
        if (sr.contact_id) contactAdMap[sr.contact_id] = { ad_id: sr.ad_id, ad_name: sr.ad_name }
      }
      for (const row of unattributedPipelineRows) {
        const label = STAGE_MAP[(row as any).pipeline_stage]
        if (!label) continue
        const attrib = contactAdMap[(row as any).contact_id]
        if (!attrib) continue
        const contact: PipelineContact = {
          name:      (row as any).contact_name,
          phone:     (row as any).contact_phone,
          email:     (row as any).contact_email,
          createdAt: (row as any).created_at,
        }
        const hasRealAdId = attrib.ad_id && !attrib.ad_id.includes('{{')
        if (hasRealAdId) {
          if (!ghlPipelineBreakdown[attrib.ad_id!]) ghlPipelineBreakdown[attrib.ad_id!] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
          ghlPipelineBreakdown[attrib.ad_id!][label].push(contact)
        } else if (attrib.ad_name) {
          if (!ghlPipelineByName[attrib.ad_name]) ghlPipelineByName[attrib.ad_name] = { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }
          ghlPipelineByName[attrib.ad_name][label].push(contact)
        }
      }
    }
  }

  // Apply campaign/firm filter to ad rows
  function matchesCampaignFilter(a: any) {
    // Fears Law (fl): "FL" must appear as a discrete pipe-delimited segment in the ad creative name
    if (firmSlug === 'fl') {
      const parts = (a.ad_name || '').split('|').map((p: string) => p.trim().toUpperCase())
      return parts.includes('FL')
    }
    // Levine Law (jll): "JLL" appears anywhere in campaign, adset, or ad name
    if (firmSlug === 'jll') {
      const combined = `${a.campaign_name || ''} ${a.adset_name || ''} ${a.ad_name || ''}`.toUpperCase()
      return combined.includes('JLL')
    }
    // Generic campaign filter (other firms with meta_campaign_filter set)
    if (!campaignFilter) return true
    return (
      (a.campaign_name || '').toLowerCase().includes(campaignFilter) ||
      (a.adset_name    || '').toLowerCase().includes(campaignFilter) ||
      (a.ad_name       || '').toLowerCase().includes(campaignFilter)
    )
  }

  // Meta spend totals
  const adInsights = (adInsightsRes.data || []).filter(matchesCampaignFilter)
  const overrideKey = `${firmSlug}:${invoiceParam}`
  const totalSpend = META_SPEND_OVERRIDES[overrideKey] ?? adInsights.reduce((s: number, a: any) => s + parseFloat(a.spend || 0), 0)
  const totalMetaLeads = META_LEADS_OVERRIDES[overrideKey] ?? adInsights.reduce((s: number, a: any) => s + getLeads(a.actions), 0)
  const totalImpressions = adInsights.reduce((s: number, a: any) => s + parseInt(a.impressions || '0', 10), 0)
  const totalClicks = adInsights.reduce((s: number, a: any) => s + parseInt(a.clicks || '0', 10), 0)

  // Weekly spend + leads for phase and KPI benchmarking (filtered)
  const weeklyData = (weeklyInsightsRes.data || []).filter(matchesCampaignFilter)
  const weeklySpend = weeklyData.reduce((s: number, d: any) => s + parseFloat(d.spend || 0), 0)
  const weeklyMetaLeads = weeklyData.reduce((s: number, d: any) => s + getLeads(d.actions), 0)
  const weeklyCpl = weeklyMetaLeads > 0 ? weeklySpend / weeklyMetaLeads : null
  const dailySpendAvg = days > 0 ? totalSpend / days : 0
  const dailyLeadsAvg = days > 0 ? totalMetaLeads / days : 0
  const phase = getPhase(weeklySpend, firm, invoiceContext?.case_count)

  // Helpers for per-case overrides stored in form_data JSONB
  const feePct = parseFloat(firm.fee_percentage || 0) / 100
  function caseValue(lead: any): number {
    if (lead.form_data?.custom_case_value != null) return lead.form_data.custom_case_value
    return firm.case_value * (1 - feePct)
  }
  function isExcludedFromPayment(lead: any): boolean {
    return lead.form_data?.excluded_from_payment === true
  }

  // GHL signed cases in window — used for CPQ, revenue, and financial calculations
  const leads = ghlLeadsRes.data || []
  const inWindowCases = leads.length
  // Revenue and CPQ use only original cases (replacements don't generate new revenue)
  // Cases excluded_from_payment still count as signed but use their custom_case_value
  const inWindowOriginals = leads.filter((l: any) => (l.case_status || 'e_signed').toLowerCase() !== 'replacement').length
  const totalVictims = leads
    .filter((l: any) => (l.case_status || 'e_signed').toLowerCase() !== 'replacement')
    .reduce((s: number, l: any) => s + (l.victim_count || 1), 0)

  const replacementDays = firm.replacement_window_days ?? 14
  let allFirmLeads = (allFirmLeadsRes.data || []) as any[]
  if (allFirmLeadsRes.error) {
    console.error('ghl_leads firm list error:', allFirmLeadsRes.error.message)
    allFirmLeads = []
  }

  // Build signed cases breakdown per ad_id for the leads modal
  const signedLeadsBreakdown: Record<string, { name: string | null; phone: string | null; email: string | null; createdAt: string | null }[]> = {}
  const signedLeadsByName: Record<string, { name: string | null; phone: string | null; email: string | null; createdAt: string | null }[]> = {}
  for (const row of allFirmLeads) {
    const contact = { name: row.contact_name, phone: row.contact_phone, email: row.contact_email, createdAt: row.qualified_at }
    const hasRealAdId = row.ad_id && !(row.ad_id as string).includes('{{')
    if (hasRealAdId) {
      if (!signedLeadsBreakdown[row.ad_id]) signedLeadsBreakdown[row.ad_id] = []
      signedLeadsBreakdown[row.ad_id].push(contact)
    } else if (row.ad_name) {
      if (!signedLeadsByName[row.ad_name]) signedLeadsByName[row.ad_name] = []
      signedLeadsByName[row.ad_name].push(contact)
    }
  }

  // Build ad_id → ad_name lookup from Meta insights to fill gaps in ghl_leads
  const adIdToName: Record<string, string> = {}
  for (const a of (adInsightsRes.data || [])) {
    if (a.ad_id && a.ad_name) adIdToName[a.ad_id] = a.ad_name
  }

  // signedCases = ALL cases assigned to this invoice (includes out-of-window) — for display only
  // inWindowCases (from leads) = date-filtered — used for CPQ/revenue/profit
  const signedCases = allFirmLeads.length
  const minorCases = allFirmLeads.filter((l: any) =>
    (l.case_status || 'e_signed').toLowerCase() !== 'replacement' && isExcludedFromPayment(l)
  ).length
  const originalCases = allFirmLeads.filter((l: any) =>
    (l.case_status || 'e_signed').toLowerCase() !== 'replacement' && !isExcludedFromPayment(l)
  ).length
  const replacementCases = allFirmLeads.filter((l: any) => (l.case_status || '').toLowerCase() === 'replacement').length
  const outOfWindowCases = signedCases - inWindowCases

  // Weekly signed cases — last 7 days across ALL invoices (cross-invoice KPI tracking)
  const weeklySignedCases = weeklySignedRes.count ?? 0
  const weeklyCpa = weeklySignedCases > 0 ? weeklySpend / weeklySignedCases : null

  const allCloserIds = [
    ...new Set([
      ...allFirmLeads.map((r: any) => r.closed_by_profile_id),
      ...allFirmLeads.map((r: any) => r.second_closer_profile_id),
    ].filter(Boolean))
  ]
  let closerNames: Record<string, string> = {}
  if (allCloserIds.length > 0) {
    const { data: profRows } = await supabase.from('profiles').select('id, name').in('id', allCloserIds)
    closerNames = Object.fromEntries((profRows || []).map((p: any) => [p.id, p.name || '']))
  }

  const pcs = allFirmLeads.map((row: any) => {
    const rw = replacementWindow(row.qualified_at, replacementDays, row.case_status)
    const wid = row.closed_by_profile_id as string | null
    const wid2 = row.second_closer_profile_id as string | null
    const rp = row.raw_payload || {}
    const cf: Record<string, string> = {}
    if (Array.isArray(rp.customField)) { for (const f of rp.customField) { if (f.fieldKey) cf[f.fieldKey] = f.value; if (f.name) cf[f.name] = f.value } }
    const incidentDate = rp.incident_date || rp['Date of Accident*'] || rp['Date of Accident'] || cf.incident_date || cf['Date of Accident*'] || cf['Date of Accident'] || null
    return {
      id: row.id,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      incidentDate,
      adName: row.ad_name || adIdToName[row.ad_id] || null,
      adId: row.ad_id,
      victimCount: row.victim_count ?? 1,
      qualifiedAt: row.qualified_at,
      invoiceCode: row.invoice_code,
      caseStatus: row.case_status,
      workerName: (wid ? closerNames[wid] : null) || row.closer || null,
      closer: row.closer || null,
      secondWorkerName: (wid2 ? closerNames[wid2] : null) || row.second_closer || null,
      secondCloser: row.second_closer || null,
      secondCloserProfileId: wid2 || null,
      isOtClose: row.is_ot_close === true,
      accidentGroupId: row.accident_group_id || null,
      replacementDaysLeft: rw.daysLeft,
      replacementEnds: rw.replacementEnds,
      replacementNote: rw.note,
      customCaseValue: row.form_data?.custom_case_value ?? null,
      excludedFromPayment: row.form_data?.excluded_from_payment ?? false,
    }
  })

  const invoiceBuckets: Record<string, { cases: number; originals: number; replacements: number; victims: number }> = {}
  for (const row of allFirmLeads) {
    const key = row.invoice_code || 'Unassigned'
    if (!invoiceBuckets[key]) invoiceBuckets[key] = { cases: 0, originals: 0, replacements: 0, victims: 0 }
    invoiceBuckets[key].cases += 1
    invoiceBuckets[key].victims += row.victim_count ?? 1
    if ((row.case_status || 'e_signed').toLowerCase() === 'replacement') {
      invoiceBuckets[key].replacements += 1
    } else {
      invoiceBuckets[key].originals += 1
    }
  }
  let invoiceBreakdown = Object.entries(invoiceBuckets)
    .map(([invoiceCode, v]) => ({
      invoiceCode,
      signedCases: v.cases,
      originalCases: v.originals,
      replacementCases: v.replacements,
      totalVictims: v.victims,
      grossRevenue: v.cases * parseFloat(firm.case_value || 0) * (1 - feePct),
    }))
    .sort((a, b) => a.invoiceCode.localeCompare(b.invoiceCode))

  if (invoiceParam) {
    invoiceBreakdown = invoiceBreakdown.filter(b => b.invoiceCode === invoiceParam)
  }

  // Sanguine payroll — $250 per case whose replacement window is closed/ended
  const sanguineRate = parseFloat(firm.sanguine_rate_per_closed_case || 0)
  // Sanguine is owed for original cases only — exclude replacements and minors (excluded_from_payment)
  const sanguineCases = allFirmLeads.filter((row: any) =>
    (row.case_status || 'e_signed').toLowerCase() !== 'replacement' && !isExcludedFromPayment(row)
  ).length
  const sanguineTotal = sanguineCases * sanguineRate

  // Payment summary for invoice (gross received minus interest cost)
  const paymentReceived = parseFloat(invoiceContext?.payment_received as any || 0)
  const paymentInterestRate = parseFloat(invoiceContext?.payment_interest_rate as any || 0)
  const paymentInterestCost = paymentReceived * paymentInterestRate
  const paymentNet = paymentReceived - paymentInterestCost

  const workerClosedMap: Record<string, { profileId: string; name: string; closedCases: number }> = {}
  for (const row of allFirmLeads) {
    if ((row.case_status || '').toLowerCase() !== 'closed' || !row.closed_by_profile_id) continue
    const pid = row.closed_by_profile_id
    const name = closerNames[pid] || 'Unknown'
    if (!workerClosedMap[pid]) workerClosedMap[pid] = { profileId: pid, name, closedCases: 0 }
    workerClosedMap[pid].closedCases += 1
  }
  const workerClosedCases = Object.values(workerClosedMap).sort((a, b) => b.closedCases - a.closedCases)

  // Ops expenses — invoice: tagged invoice_code OR unassigned row dated inside this invoice window
  const opsRows = (opsRes.data || []) as any[]
  const opsAttributed = invoiceParam
    ? opsRows.filter(
        e =>
          e.invoice_code === invoiceParam ||
          (!e.invoice_code && e.date >= start && e.date <= end)
      )
    : opsRows
  const opsExpenses = opsAttributed.reduce((s: number, e: any) => s + parseFloat(e.amount || 0), 0)

  // Worker PR — sum of rates for the period (weekly_rate * days / 7)
  const workerPR = (workerRatesRes.data || []).reduce((s: number, r: any) => {
    return s + parseFloat(r.weekly_rate || 0) * (days / 7)
  }, 0)

  // Financial KPIs
  // CPA (Cost Per Acquisition) uses only original signed cases — replacements don't count
  // Cases with custom_case_value (e.g. minors at $500) use their override; excluded_from_payment
  // cases still contribute revenue at their custom value but are excluded from CPA denominator
  const inWindowOriginalsForCpa = leads.filter((l: any) =>
    (l.case_status || 'e_signed').toLowerCase() !== 'replacement' && !isExcludedFromPayment(l)
  ).length
  const cpa = inWindowOriginalsForCpa > 0 ? totalSpend / inWindowOriginalsForCpa : null
  const adjustedCpa = totalVictims > 0 ? totalSpend / totalVictims : null
  // Revenue sums per-case values (respects custom_case_value overrides)
  const grossRevenue = leads
    .filter((l: any) => (l.case_status || 'e_signed').toLowerCase() !== 'replacement')
    .reduce((s: number, l: any) => s + caseValue(l), 0)
  const grossProfit = grossRevenue - totalSpend
  const grossMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : null
  const netProfit = grossProfit - opsExpenses - workerPR - sanguineTotal
  const netMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : null

  // Daily chart data
  const daily = (dailyInsightsRes.data || []).map((d: any) => ({
    date: d.date_start,
    spend: parseFloat(d.spend || 0),
    leads: getLeads(d.actions),
    impressions: parseInt(d.impressions || 0),
  }))

  // Merge daily GHL counts onto daily chart
  const leadsByDate: Record<string, number> = {}
  for (const lead of leads) {
    const d = (lead.qualified_at as string).split('T')[0]
    leadsByDate[d] = (leadsByDate[d] || 0) + 1
  }
  const dailyWithCases = daily.map((d: any) => ({
    ...d,
    signedCases: leadsByDate[d.date] || 0,
  }))

  // Creative CPA / CPQ breakdown
  const adRows = adInsights.map((a: any) => {
    const adSpend = parseFloat(a.spend || 0)
    const adMetaLeads = getLeads(a.actions)
    const adLpvs = getLandingPageViews(a.actions)
    const adClicks = parseInt(a.clicks || '0', 10)
    // Match by ad_id first; fall back to ad_name only when ad_id is the unresolved GHL template
    const matchesAd = (l: any) => {
      const hasRealAdId = l.ad_id && !l.ad_id.includes('{{')
      if (hasRealAdId) return l.ad_id === a.ad_id
      return l.ad_name && a.ad_name && l.ad_name === a.ad_name
    }
    const adMatchedLeads = leads.filter(matchesAd)
    const adSignedCases = adMatchedLeads.length
    const adVictims = adMatchedLeads.reduce((s: number, l: any) => s + (l.victim_count || 1), 0)

    // Pipeline stage counts — from Supabase ghl_leads, matched by ad_id then ad_name
    const pipeline = ghlPipelineBreakdown[a.ad_id] || ghlPipelineByName[a.ad_name] || { new_lead: [], nr: [], fu: [], chase: [], appointment: [], contract_sent: [], pending_send: [], nq: [], mia: [], qualified: [], closed: [] }

    return {
      adId: a.ad_id,
      adName: a.ad_name,
      adsetId: a.adset_id,
      adsetName: a.adset_name,
      campaignId: a.campaign_id,
      campaignName: a.campaign_name,
      spend: adSpend,
      metaLeads: adMetaLeads,
      clicks: adClicks,
      cpl: adMetaLeads > 0 ? adSpend / adMetaLeads : null,
      cpc: parseFloat(a.cpc || '0'),
      landingPageViews: adLpvs,
      lpvToLeadPct: adLpvs > 0 ? (adMetaLeads / adLpvs) * 100 : null,
      clickToLeadPct: adClicks > 0 ? (adMetaLeads / adClicks) * 100 : null,
      signedCases: adSignedCases,
      cpa: adSignedCases > 0 ? adSpend / adSignedCases : null,
      adjustedCpa: adVictims > 0 ? adSpend / adVictims : null,
      cpq: (() => { const q = (pipeline.chase?.length || 0) + (pipeline.contract_sent?.length || 0) + (pipeline.pending_send?.length || 0) + adSignedCases; return q > 0 ? adSpend / q : null })(),
      ctr: parseFloat(a.ctr || 0),
      impressions: parseInt(a.impressions || 0),
      // Pipeline breakdown — live from GHL (contacts + counts)
      newLeadLeads:      pipeline.new_lead,
      nrLeads:           pipeline.nr,
      fuLeads:           pipeline.fu,
      chaseLeads:        pipeline.chase,
      appointmentLeads:  pipeline.appointment,
      contractSentLeads: pipeline.contract_sent,
      pendingSendLeads:  pipeline.pending_send,
      nqLeads:           pipeline.nq,
      miaLeads:          pipeline.mia,
      qualifiedLeads:    pipeline.qualified,
      closedLeads:       pipeline.closed,
      signedLeads:       signedLeadsBreakdown[a.ad_id] || signedLeadsByName[a.ad_name] || [],
      newLeadCount:      pipeline.new_lead.length,
      nrCount:           pipeline.nr.length,
      fuCount:           pipeline.fu.length,
      chaseCount:        pipeline.chase.length,
      appointmentCount:  pipeline.appointment.length,
      contractSentCount: pipeline.contract_sent.length,
      pendingSendCount:  pipeline.pending_send.length,
      nqCount:           pipeline.nq.length,
      miaCount:          pipeline.mia.length,
      qualifiedCount:    pipeline.qualified.length,
      closedCount:       pipeline.closed.length,
    }
  }).sort((a: any, b: any) => {
    // Sort: ads with signed cases first (by CPA asc), then by spend desc
    if (a.cpa !== null && b.cpa !== null) return a.cpa - b.cpa
    if (a.cpa !== null) return -1
    if (b.cpa !== null) return 1
    return b.spend - a.spend
  })

  // Pipeline totals — sum across all ads + unattributed
  const allPipelineKeys = Object.keys(ghlPipelineBreakdown)
  const pipelineTotals = {
    newLeadCount: 0, nrCount: 0, fuCount: 0, chaseCount: 0,
    appointmentCount: 0, contractSentCount: 0, pendingSendCount: 0,
    nqCount: 0, miaCount: 0, qualifiedCount: 0, closedCount: 0,
    newLeadLeads: [] as PipelineContact[], nrLeads: [] as PipelineContact[],
    fuLeads: [] as PipelineContact[], chaseLeads: [] as PipelineContact[],
    appointmentLeads: [] as PipelineContact[], contractSentLeads: [] as PipelineContact[],
    pendingSendLeads: [] as PipelineContact[], nqLeads: [] as PipelineContact[],
    miaLeads: [] as PipelineContact[], qualifiedLeads: [] as PipelineContact[],
    closedLeads: [] as PipelineContact[],
  }
  for (const key of allPipelineKeys) {
    const p = ghlPipelineBreakdown[key]
    pipelineTotals.newLeadCount      += p.new_lead.length;      pipelineTotals.newLeadLeads.push(...p.new_lead)
    pipelineTotals.nrCount           += p.nr.length;            pipelineTotals.nrLeads.push(...p.nr)
    pipelineTotals.fuCount           += p.fu.length;            pipelineTotals.fuLeads.push(...p.fu)
    pipelineTotals.chaseCount        += p.chase.length;         pipelineTotals.chaseLeads.push(...p.chase)
    pipelineTotals.appointmentCount  += p.appointment.length;   pipelineTotals.appointmentLeads.push(...p.appointment)
    pipelineTotals.contractSentCount += p.contract_sent.length; pipelineTotals.contractSentLeads.push(...p.contract_sent)
    pipelineTotals.pendingSendCount  += p.pending_send.length;  pipelineTotals.pendingSendLeads.push(...p.pending_send)
    pipelineTotals.nqCount           += p.nq.length;            pipelineTotals.nqLeads.push(...p.nq)
    pipelineTotals.miaCount          += p.mia.length;           pipelineTotals.miaLeads.push(...p.mia)
    pipelineTotals.qualifiedCount    += p.qualified.length;     pipelineTotals.qualifiedLeads.push(...p.qualified)
    pipelineTotals.closedCount       += p.closed.length;        pipelineTotals.closedLeads.push(...p.closed)
  }
  // Also merge ghlPipelineByName data into totals
  for (const key of Object.keys(ghlPipelineByName)) {
    const p = ghlPipelineByName[key]
    pipelineTotals.newLeadCount      += p.new_lead.length;      pipelineTotals.newLeadLeads.push(...p.new_lead)
    pipelineTotals.nrCount           += p.nr.length;            pipelineTotals.nrLeads.push(...p.nr)
    pipelineTotals.fuCount           += p.fu.length;            pipelineTotals.fuLeads.push(...p.fu)
    pipelineTotals.chaseCount        += p.chase.length;         pipelineTotals.chaseLeads.push(...p.chase)
    pipelineTotals.appointmentCount  += p.appointment.length;   pipelineTotals.appointmentLeads.push(...p.appointment)
    pipelineTotals.contractSentCount += p.contract_sent.length; pipelineTotals.contractSentLeads.push(...p.contract_sent)
    pipelineTotals.pendingSendCount  += p.pending_send.length;  pipelineTotals.pendingSendLeads.push(...p.pending_send)
    pipelineTotals.nqCount           += p.nq.length;            pipelineTotals.nqLeads.push(...p.nq)
    pipelineTotals.miaCount          += p.mia.length;           pipelineTotals.miaLeads.push(...p.mia)
    pipelineTotals.qualifiedCount    += p.qualified.length;     pipelineTotals.qualifiedLeads.push(...p.qualified)
    pipelineTotals.closedCount       += p.closed.length;        pipelineTotals.closedLeads.push(...p.closed)
  }

  // CPQ (Cost Per Qualified) = spend / (chase + signed/sent leads from GHL)
  const cpqQualifiedCount = pipelineTotals.chaseCount + pipelineTotals.contractSentCount + pipelineTotals.pendingSendCount + signedCases
  const cpq = cpqQualifiedCount > 0 ? totalSpend / cpqQualifiedCount : null

  // KPI targets — phase-aware (Initial / Scale / Pre-Max / Max)
  const phaseKey = phase.label.toLowerCase().replace('-', '_') as 'initial' | 'scale' | 'pre_max' | 'max'
  const targetDailySpend: number =
    phaseKey === 'initial'  ? (firm.target_initial_daily_spend  ?? firm.target_daily_spend ?? 800)
    : phaseKey === 'scale'  ? (firm.target_scale_daily_spend    ?? firm.target_daily_spend ?? 800)
    : phaseKey === 'pre_max'? (firm.target_pre_max_daily_spend  ?? firm.target_max_daily_spend ?? firm.target_daily_spend ?? 800)
    : (firm.target_max_daily_spend ?? firm.target_daily_spend ?? 800)
  const targetDailyLeads: number =
    phaseKey === 'initial'  ? (firm.target_initial_daily_leads  ?? firm.target_daily_leads ?? 5)
    : phaseKey === 'scale'  ? (firm.target_scale_daily_leads    ?? firm.target_daily_leads ?? 5)
    : phaseKey === 'pre_max'? (firm.target_pre_max_daily_leads  ?? firm.target_max_daily_leads ?? firm.target_daily_leads ?? 5)
    : (firm.target_max_daily_leads ?? firm.target_daily_leads ?? 5)
  const targetCpa = firm.target_cpq ?? (firm.case_value > 0 ? firm.case_value * 0.4 : 800)
  const targetGrossMargin = firm.target_gross_margin ?? 60

  const targetWeeklyCpl = targetDailyLeads > 0 ? (targetDailySpend * 7) / (targetDailyLeads * 7) : null

  const targets = {
    dailySpend: targetDailySpend,
    dailyLeads: targetDailyLeads,
    cpa: targetCpa,
    cpq: targetCpa,
    grossMargin: targetGrossMargin,
    weeklySpend: targetDailySpend * 7,
    weeklyLeads: targetDailyLeads * 7,
    weeklyCpl: targetWeeklyCpl,
    weeklyCpa: targetCpa,
  }

  // KPI status — how actual vs targets
  const kpiStatus = {
    dailySpend: {
      actual: dailySpendAvg,
      target: targets.dailySpend,
      pct: targets.dailySpend > 0 ? (dailySpendAvg / targets.dailySpend) * 100 : null,
      status: dailySpendAvg >= targets.dailySpend * 0.9 ? 'on_track' : dailySpendAvg >= targets.dailySpend * 0.5 ? 'behind' : 'far_behind',
    },
    weeklySpend: {
      actual: weeklySpend,
      target: targets.weeklySpend,
      pct: targets.weeklySpend > 0 ? (weeklySpend / targets.weeklySpend) * 100 : null,
      status: weeklySpend >= targets.weeklySpend * 0.9 ? 'on_track' : weeklySpend >= targets.weeklySpend * 0.5 ? 'behind' : 'far_behind',
    },
    weeklyLeads: {
      actual: weeklyMetaLeads,
      target: targets.weeklyLeads,
      pct: targets.weeklyLeads > 0 ? (weeklyMetaLeads / targets.weeklyLeads) * 100 : null,
      status: weeklyMetaLeads >= targets.weeklyLeads * 0.9 ? 'on_track' : weeklyMetaLeads >= targets.weeklyLeads * 0.5 ? 'behind' : 'far_behind',
    },
    cpa: cpa !== null ? {
      actual: cpa,
      target: targets.cpa,
      pct: targets.cpa > 0 ? (cpa / targets.cpa) * 100 : null,
      status: cpa <= targets.cpa * 1.1 ? 'on_track' : cpa <= targets.cpa * 1.5 ? 'behind' : 'far_behind',
    } : null,
    weeklyCpl: weeklyCpl !== null && targets.weeklyCpl !== null ? {
      actual: weeklyCpl,
      target: targets.weeklyCpl!,
      pct: targets.weeklyCpl! > 0 ? (weeklyCpl / targets.weeklyCpl!) * 100 : null,
      // lower is better
      status: weeklyCpl <= targets.weeklyCpl! * 1.1 ? 'on_track' : weeklyCpl <= targets.weeklyCpl! * 1.5 ? 'behind' : 'far_behind',
    } : null,
    weeklyCpa: weeklyCpa !== null ? {
      actual: weeklyCpa,
      target: targets.weeklyCpa,
      pct: targets.weeklyCpa > 0 ? (weeklyCpa / targets.weeklyCpa) * 100 : null,
      // lower is better
      status: weeklyCpa <= targets.weeklyCpa * 1.1 ? 'on_track' : weeklyCpa <= targets.weeklyCpa * 1.5 ? 'behind' : 'far_behind',
    } : null,
    grossMargin: grossMargin !== null ? {
      actual: grossMargin,
      target: targets.grossMargin,
      pct: targets.grossMargin > 0 ? (grossMargin / targets.grossMargin) * 100 : null,
      status: grossMargin >= targets.grossMargin * 0.95 ? 'on_track' : grossMargin >= targets.grossMargin * 0.7 ? 'behind' : 'far_behind',
    } : null,
    weeklySignedCases: {
      actual: weeklySignedCases,
      target: 15,
      pct: (weeklySignedCases / 15) * 100,
      status: weeklySignedCases >= 14 ? 'on_track' : weeklySignedCases >= 8 ? 'behind' : 'far_behind',
    },
  }

  // Overall health — critical if any key metric is far_behind, warning if any behind
  // Weekly spend excluded from health — running below full budget during initial test is expected
  const statuses = [kpiStatus.weeklyLeads.status, kpiStatus.cpa?.status, kpiStatus.grossMargin?.status].filter(Boolean)
  const overallHealth =
    statuses.some(s => s === 'far_behind') ? 'critical' :
    statuses.some(s => s === 'behind') ? 'warning' : 'healthy'

  const metaCpl = totalMetaLeads > 0 ? totalSpend / totalMetaLeads : null
  const metaCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null

  return NextResponse.json({
    firm,
    phase,
    weeklySpend,
    weeklyMetaLeads,
    weeklySignedCases,
    dailySpendAvg,
    dailyLeadsAvg,
    overallHealth,
    targets,
    kpiStatus,
    invoice: invoiceContext,
    period: {
      start,
      end,
      days,
      preset: invoiceParam
        ? `invoice:${invoiceParam}`
        : datePreset || (customStart && customEnd ? 'custom' : ''),
    },
    meta: {
      accountId: firm.meta_account_id || accountId,
      connected: Boolean(firm.meta_account_id),
      campaignFilter: campaignFilter || null,
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      leads: totalMetaLeads,
      cpl: metaCpl,
      ctrPct: metaCtr,
      error: _metaError,
    },
    summary: {
      spend: totalSpend,
      metaLeads: totalMetaLeads,
      signedCases,
      originalCases,
      minorCases,
      replacementCases,
      inWindowCases,
      inWindowOriginals,
      outOfWindowCases,
      totalVictims,
      cpa,
      adjustedCpa,
      cpq,
      caseValue: firm.case_value * (1 - feePct),
      grossRevenue,
      grossProfit,
      grossMargin,
      opsExpenses,
      workerPR,
      netProfit,
      netMargin,
    },
    pcs,
    invoiceBreakdown,
    workerClosedCases,
    sanguine: {
      rate: sanguineRate,
      eligibleCases: sanguineCases,
      total: sanguineTotal,
    },
    payment: paymentReceived > 0 ? {
      received: paymentReceived,
      interestRate: paymentInterestRate,
      interestCost: paymentInterestCost,
      net: paymentNet,
    } : null,
    daily: dailyWithCases,
    adBreakdown: adRows,
    pipelineTotals,
  })
}
