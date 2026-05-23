import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN = process.env.META_ACCESS_TOKEN!
const BASE = 'https://graph.facebook.com/v25.0'

// ─── GHL Pipeline ──────────────────────────────────────────────────────────
const GHL_API_KEY = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

// Pipeline IDs per firm slug
const GHL_PIPELINES: Record<string, string> = {
  lhp:       'yMqNixSnChC5lcGQXA1g',
  eisenberg: 'Yk4w3ML56ECc10PFzjpK',
  thl:       'DYtmw8WEUtGePFbEDAIZ',
  mca:       '6Ku9EwTtMFk51o7Re9x0',
}

// Stage IDs → normalized label (covers all four firm pipelines)
const GHL_STAGE_LABEL: Record<string, 'nr' | 'nq' | 'fu'> = {
  // LHP
  '1175a360-9914-4ce5-906d-d89adb27c732': 'nr',
  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu',
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

type PipelineContact = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }
type PipelineAdLeads = { nr: PipelineContact[]; nq: PipelineContact[]; fu: PipelineContact[] }

// Fetch all opportunities for a pipeline and return per-ad NR/NQ/FU contact lists
// Filters by createdAt within the invoice/date window
async function fetchGHLPipelineBreakdown(
  pipelineId: string,
  start: string,
  end: string
): Promise<Record<string, PipelineAdLeads>> {
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

      // Filter to invoice/date window by opportunity createdAt
      const created = opp.createdAt ? opp.createdAt.split('T')[0] : ''
      if (created < start || created > end) continue

      // Get ad_id from first attribution
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

function getPhase(weeklySpend: number, firm: any): { label: string; color: string } {
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
  let invoiceContext: { code: string; title: string | null; period_start: string; period_end: string; payment_received?: number | null; payment_interest_rate?: number | null } | null = null

  if (invoiceParam) {
    const { data: inv, error: invErr } = await supabase
      .from('firm_invoices')
      .select('code, title, period_start, period_end, payment_received, payment_interest_rate')
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

  const [adInsightsRes, dailyInsightsRes, weeklyInsightsRes, ghlLeadsRes, allFirmLeadsRes, opsRes, workerRatesRes, ghlPipelineBreakdown] = await Promise.all([
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
          'id, contact_name, contact_phone, contact_email, ad_name, ad_id, victim_count, qualified_at, invoice_code, case_status, closed_by_profile_id, closer, accident_group_id, form_data'
        )
        .eq('firm_id', firm.id)
        .order('qualified_at', { ascending: false })
      if (invoiceParam) q = q.eq('invoice_code', invoiceParam)
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
    // GHL pipeline breakdown — NR/NQ/FU counts per ad_id
    ghlPipelineId
      ? fetchGHLPipelineBreakdown(ghlPipelineId, start, end)
      : Promise.resolve({} as Record<string, PipelineAdLeads>),
  ])

  // Apply campaign filter if set (filters ad rows by campaign/adset/ad name)
  function matchesCampaignFilter(a: any) {
    if (!campaignFilter) return true
    return (
      (a.campaign_name || '').toLowerCase().includes(campaignFilter) ||
      (a.adset_name || '').toLowerCase().includes(campaignFilter)
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
  const phase = getPhase(weeklySpend, firm)

  // Helpers for per-case overrides stored in form_data JSONB
  function caseValue(lead: any): number {
    return lead.form_data?.custom_case_value ?? firm.case_value
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

  // Weekly signed cases for CPQ (cases qualified in the last 7 days within the current view)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const weeklySignedCases = allFirmLeads.filter((l: any) =>
    l.qualified_at && new Date(l.qualified_at) >= sevenDaysAgo
  ).length
  const weeklyCpq = weeklySignedCases > 0 ? weeklySpend / weeklySignedCases : null

  const closerIds = [...new Set(allFirmLeads.map((r: any) => r.closed_by_profile_id).filter(Boolean))]
  let closerNames: Record<string, string> = {}
  if (closerIds.length > 0) {
    const { data: profRows } = await supabase.from('profiles').select('id, name').in('id', closerIds)
    closerNames = Object.fromEntries((profRows || []).map((p: any) => [p.id, p.name || '']))
  }

  const pcs = allFirmLeads.map((row: any) => {
    const rw = replacementWindow(row.qualified_at, replacementDays, row.case_status)
    const wid = row.closed_by_profile_id as string | null
    return {
      id: row.id,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      adName: row.ad_name || adIdToName[row.ad_id] || null,
      adId: row.ad_id,
      victimCount: row.victim_count ?? 1,
      qualifiedAt: row.qualified_at,
      invoiceCode: row.invoice_code,
      caseStatus: row.case_status,
      workerName: (wid ? closerNames[wid] : null) || row.closer || null,
      closer: row.closer || null,
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
      grossRevenue: v.cases * parseFloat(firm.case_value || 0),
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
  // CPQ and revenue use only original cases — replacements don't count toward revenue
  // Cases with custom_case_value (e.g. minors at $500) use their override; excluded_from_payment
  // cases still contribute revenue at their custom value but are excluded from CPQ denominator
  const inWindowOriginalsForCpq = leads.filter((l: any) =>
    (l.case_status || 'e_signed').toLowerCase() !== 'replacement' && !isExcludedFromPayment(l)
  ).length
  const cpq = inWindowOriginalsForCpq > 0 ? totalSpend / inWindowOriginalsForCpq : null
  const adjustedCpq = totalVictims > 0 ? totalSpend / totalVictims : null
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

  // Creative CPQ breakdown
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

    // Pipeline stage counts — live from GHL API, keyed by Meta ad_id
    const pipeline = ghlPipelineBreakdown[a.ad_id] || { nr: [], nq: [], fu: [] }

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
      cpq: adSignedCases > 0 ? adSpend / adSignedCases : null,
      adjustedCpq: adVictims > 0 ? adSpend / adVictims : null,
      ctr: parseFloat(a.ctr || 0),
      impressions: parseInt(a.impressions || 0),
      // Pipeline breakdown — live from GHL (contacts + counts)
      nrLeads: pipeline.nr,
      nqLeads: pipeline.nq,
      fuLeads: pipeline.fu,
      nrCount: pipeline.nr.length,
      nqCount: pipeline.nq.length,
      fuCount: pipeline.fu.length,
    }
  }).sort((a: any, b: any) => {
    // Sort: ads with signed cases first (by CPQ asc), then by spend desc
    if (a.cpq !== null && b.cpq !== null) return a.cpq - b.cpq
    if (a.cpq !== null) return -1
    if (b.cpq !== null) return 1
    return b.spend - a.spend
  })

  // KPI targets — phase-aware (Initial / Scale / Max)
  const phaseKey = phase.label.toLowerCase() as 'initial' | 'scale' | 'max'
  const targetDailySpend: number =
    phaseKey === 'initial' ? (firm.target_initial_daily_spend ?? firm.target_daily_spend ?? 800)
    : phaseKey === 'scale' ? (firm.target_scale_daily_spend ?? firm.target_daily_spend ?? 800)
    : (firm.target_max_daily_spend ?? firm.target_daily_spend ?? 800)
  const targetDailyLeads: number =
    phaseKey === 'initial' ? (firm.target_initial_daily_leads ?? firm.target_daily_leads ?? 5)
    : phaseKey === 'scale' ? (firm.target_scale_daily_leads ?? firm.target_daily_leads ?? 5)
    : (firm.target_max_daily_leads ?? firm.target_daily_leads ?? 5)
  const targetCpq = firm.target_cpq ?? (firm.case_value > 0 ? firm.case_value * 0.4 : 800)
  const targetGrossMargin = firm.target_gross_margin ?? 60

  const targetWeeklyCpl = targetDailyLeads > 0 ? (targetDailySpend * 7) / (targetDailyLeads * 7) : null

  const targets = {
    dailySpend: targetDailySpend,
    dailyLeads: targetDailyLeads,
    cpq: targetCpq,
    grossMargin: targetGrossMargin,
    weeklySpend: targetDailySpend * 7,
    weeklyLeads: targetDailyLeads * 7,
    weeklyCpl: targetWeeklyCpl,
    weeklyCpq: targetCpq,
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
    cpq: cpq !== null ? {
      actual: cpq,
      target: targets.cpq,
      pct: targets.cpq > 0 ? (cpq / targets.cpq) * 100 : null,
      status: cpq <= targets.cpq * 1.1 ? 'on_track' : cpq <= targets.cpq * 1.5 ? 'behind' : 'far_behind',
    } : null,
    weeklyCpl: weeklyCpl !== null && targets.weeklyCpl !== null ? {
      actual: weeklyCpl,
      target: targets.weeklyCpl!,
      pct: targets.weeklyCpl! > 0 ? (weeklyCpl / targets.weeklyCpl!) * 100 : null,
      // lower is better
      status: weeklyCpl <= targets.weeklyCpl! * 1.1 ? 'on_track' : weeklyCpl <= targets.weeklyCpl! * 1.5 ? 'behind' : 'far_behind',
    } : null,
    weeklyCpq: weeklyCpq !== null ? {
      actual: weeklyCpq,
      target: targets.weeklyCpq,
      pct: targets.weeklyCpq > 0 ? (weeklyCpq / targets.weeklyCpq) * 100 : null,
      // lower is better
      status: weeklyCpq <= targets.weeklyCpq * 1.1 ? 'on_track' : weeklyCpq <= targets.weeklyCpq * 1.5 ? 'behind' : 'far_behind',
    } : null,
    grossMargin: grossMargin !== null ? {
      actual: grossMargin,
      target: targets.grossMargin,
      pct: targets.grossMargin > 0 ? (grossMargin / targets.grossMargin) * 100 : null,
      status: grossMargin >= targets.grossMargin * 0.95 ? 'on_track' : grossMargin >= targets.grossMargin * 0.7 ? 'behind' : 'far_behind',
    } : null,
  }

  // Overall health — critical if any key metric is far_behind, warning if any behind
  // Weekly spend excluded from health — running below full budget during initial test is expected
  const statuses = [kpiStatus.weeklyLeads.status, kpiStatus.cpq?.status, kpiStatus.grossMargin?.status].filter(Boolean)
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
      cpq,
      adjustedCpq,
      caseValue: firm.case_value,
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
  })
}
