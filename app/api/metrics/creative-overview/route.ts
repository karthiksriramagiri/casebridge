import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlFetch, readGhlLimits, GhlQuotaError } from '@/lib/ghl-pipelines'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GHL Pipeline config (mirrors kpi/route.ts) ───────────────────────────────
const GHL_API_KEY     = process.env.GHL_API_KEY || ''
const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'

const GHL_PIPELINES: Record<string, string> = {
  lhp:         'yMqNixSnChC5lcGQXA1g',
  lhp_spanish: 'r1AsAtC7lzwO9ybtkQlA',
  // Jacoby & Meyers was missing entirely, so none of its leads or signed cases
  // reached the Creative Center.
  jm:          '0tBzhg0eGSNKL870y3yV',
  jm_spanish:  'TiyXTHCkxjb2m2UG2COR',
  eisenberg:   'Yk4w3ML56ECc10PFzjpK',
  thl:         'DYtmw8WEUtGePFbEDAIZ',
  mca:         '6Ku9EwTtMFk51o7Re9x0',
  fears:       'Jj4DCdu5duYDgI87ERbx',
  levine:      'JPyMNjGGAIxUv0FWW7Cg',
}

/* Stage ids resolved from GHL rather than hand-maintained.

   The opportunity search returns a pipelineStageId but not the stage's name,
   so every stage has to be recognised by id — and the hardcoded table below
   had 2 of the 17 Pending Send / Signed/Sent ids in it. The other 15 silently
   matched nothing, which is why signed cases read as zero. Reading the
   pipelines once per request keeps the mapping true as stages are added. */
let _stageCache: { at: number; map: Record<string, StageLabel> } | null = null

async function liveStageMap(): Promise<Record<string, StageLabel>> {
  if (_stageCache && Date.now() - _stageCache.at < 10 * 60_000) return _stageCache.map
  const map: Record<string, StageLabel> = {}
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${GHL_LOCATION_ID}`,
      { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
        next: { revalidate: 600 } })
    if (res.ok) {
      const data: any = await res.json()
      for (const p of data.pipelines ?? []) {
        for (const st of p.stages ?? []) {
          const label = labelForStageName(String(st.name || ''))
          if (label) map[st.id] = label
        }
      }
    }
  } catch { /* fall back to the static table */ }
  _stageCache = { at: Date.now(), map }
  return map
}

/** One place that turns a stage's name into the label the dashboard uses. */
function labelForStageName(name: string): StageLabel | undefined {
  const n = name.toLowerCase()
  if (n.includes('new lead') || n.includes('new_lead')) return 'new_lead'
  if (n.includes('no response') || n.includes('no_response')) return 'nr'
  if (n.includes('follow up') || n.includes('follow_up')) return 'fu'
  if (n.includes('chase')) return 'chase'
  if (n.includes('appointment')) return 'appointment'
  if (n.includes('contract sent') || n.includes('contract_sent')) return 'contract_sent'
  if (n.includes('pending send') || n.includes('pending_send')) return 'pending_send'
  if (n.includes('not qualified') || n.includes('not_qualified')) return 'nq'
  if (n === 'mia') return 'mia'
  if (n.includes('qualified lead')) return 'qualified'
  if (n.includes('signed') || n.includes('closed')) return 'signed'
  return undefined
}

type StageLabel = 'new_lead' | 'nr' | 'fu' | 'chase' | 'appointment' | 'contract_sent' | 'pending_send' | 'nq' | 'mia' | 'qualified' | 'signed'

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
  'f011f3ad-b429-443f-9ff3-4e0eff68854a': 'signed',
  // THL
  '51f0c592-1111-43ba-bb3b-2f2f489177a8': 'new_lead',
  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr',
  '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu',
  '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
  '20ffb08b-2f48-46e6-b86a-3eb46a79c322': 'signed',
  // MCA
  '402b0271-c256-4347-b217-4f771ec37992': 'new_lead',
  '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr',
  'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu',
  '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
  'cd35b35b-b09c-4151-b382-9c1574210d15': 'qualified',
  'e4c30bbe-35aa-4411-8c84-cc032b1c0252': 'signed',
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

type Lead = {
  name: string | null; phone: string | null; email: string | null; createdAt: string | null
  /** Where this person sits — pipeline stage for leads, Signed/Replacement for cases. */
  stage?: string
}

type AdData = {
  signedCases: number
  signedLeads: Lead[]
  firmSlug: string | null
  firmName: string | null
  latestInvoice: string | null
  newLeadCount: number;   newLeadLeads: Lead[]
  nrCount: number;        nrLeads: Lead[]
  fuCount: number;        fuLeads: Lead[]
  chaseCount: number;     chaseLeads: Lead[]
  appointmentCount: number; appointmentLeads: Lead[]
  contractSentCount: number; contractSentLeads: Lead[]
  pendingSendCount: number;  pendingSendLeads: Lead[]
  nqCount: number;        nqLeads: Lead[]
  miaCount: number;       miaLeads: Lead[]
  qualifiedCount: number; qualifiedLeads: Lead[]
  /* Signed/Sent specifically. signedCases below is this plus Pending Send —
     a case is signed once it reaches Pending Send, whether or not it has been
     sent on yet. */
  sentCount: number;      sentLeads: Lead[]
}

function emptyAdData(firmSlug: string | null = null, firmName: string | null = null, latestInvoice: string | null = null): AdData {
  return {
    signedCases: 0, signedLeads: [], firmSlug, firmName, latestInvoice,
    newLeadCount: 0,      newLeadLeads: [],
    nrCount: 0,           nrLeads: [],
    fuCount: 0,           fuLeads: [],
    chaseCount: 0,        chaseLeads: [],
    appointmentCount: 0,  appointmentLeads: [],
    contractSentCount: 0, contractSentLeads: [],
    pendingSendCount: 0,  pendingSendLeads: [],
    nqCount: 0,           nqLeads: [],
    miaCount: 0,          miaLeads: [],
    qualifiedCount: 0,    qualifiedLeads: [],
    sentCount: 0,         sentLeads: [],
  }
}

// Fetch all opportunities for a pipeline and return per-adId breakdown
// If start/end provided, filters by opp.createdAt date range
// Unattributed leads (no UTM ad_id) are resolved via ghl_leads or stored under '__unattributed__'
async function fetchPipelineBreakdown(
  stageMap: Record<string, StageLabel>,
  pipelineId: string,
  start: string | null = null,
  end: string | null = null,
): Promise<Record<string, { label: StageLabel; contact: Lead }[]>> {
  if (!GHL_API_KEY) return {}
  const result: Record<string, { label: StageLabel; contact: Lead }[]> = {}
  const unattributedContacts: { contactId: string; label: StageLabel; contact: Lead }[] = []
  let url: string | null =
    `https://services.leadconnectorhq.com/opportunities/search` +
    `?location_id=${GHL_LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`
  let pages = 0
  console.log('[metrics:creative-overview] GHL sweep start', { pipelineId })
  while (url && pages < 20) {
    pages++
    const res = await ghlFetch(url, {
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' },
      // 5-min shared cache: this sweep costs ~42 GHL calls per dashboard load
      // and was uncached on every request. Metrics minutes-stale are fine.
      next: { revalidate: 300 },
    })
    /* Breaking here reports a partial sweep as a complete one: every ad past
       the cut-off silently shows zero signed cases, which is indistinguishable
       from genuinely having none. ghlFetch already waits out a burst trip, so
       reaching this means a real refusal — say so rather than under-count. */
    if (!res.ok) {
      console.error('[metrics:creative-overview] GHL refused (%d) on pipeline %s after %d page(s)',
        res.status, pipelineId, pages - 1)
      throw new GhlQuotaError(res.status,
        res.headers.get('x-ratelimit-daily-remaining'),
        res.headers.get('x-ratelimit-daily-reset'),
        readGhlLimits(res.headers))
    }
    const data: any = await res.json()
    for (const opp of (data.opportunities || [])) {
      const stageName = (opp.pipelineStage?.name || '').toLowerCase()
      const label: StageLabel | undefined =
        stageMap[opp.pipelineStageId] ||
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
         /* The pipelines call it "Signed/Sent". The old branch looked for
            "closed", which no pipeline has, so every signed opportunity was
            dropped on the floor here. */
         stageName.includes('signed') || stageName.includes('closed') ? 'signed' : undefined)
      if (!label) continue

      /* Date filter. Signed cases are filtered on the stage change that made
         them signed; everything else on when the lead arrived. Filtering both
         the same way would hide a case that signed this month off a lead that
         came in last month. */
      if (start && end) {
        const inStage = label === 'pending_send' || label === 'signed'
        const when = ((inStage ? (opp.lastStageChangeAt || opp.updatedAt || opp.createdAt) : opp.createdAt) || '').split('T')[0]
        if (!when || when < start || when > end) continue
      }

      /* A case is signed when it reaches Pending Send, so that is the date it
         should be counted on — not when the lead first came in, which can be
         weeks earlier and would file the case in the wrong month.

         GHL exposes only the LAST stage change, so this is exact while the
         opportunity still sits in Pending Send and slightly late once it moves
         on to Signed/Sent. There is no stage history to do better with. */
      const signedAt = opp.lastStageChangeAt || opp.updatedAt || opp.createdAt || null
      const isSignedStage = label === 'pending_send' || label === 'signed'

      const contact: Lead = {
        name:      opp.contact?.name || opp.name || null,
        phone:     opp.contact?.phone || null,
        email:     opp.contact?.email || null,
        createdAt: isSignedStage ? signedAt : (opp.createdAt || null),
      }

      const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
      const adId = attr?.utmAdId || attr?.utmContent || null
      if (adId) {
        if (!result[adId]) result[adId] = []
        result[adId].push({ label, contact })
      } else {
        const cid = opp.contact?.id || opp.contactId || null
        if (cid) {
          unattributedContacts.push({ contactId: cid, label, contact })
        } else {
          if (!result['__unattributed__']) result['__unattributed__'] = []
          result['__unattributed__'].push({ label, contact })
        }
      }
    }
    url = data.meta?.nextPageUrl || null
  }

  // Resolve unattributed contacts via ghl_leads
  if (unattributedContacts.length > 0) {
    const contactIds = [...new Set(unattributedContacts.map(c => c.contactId))]
    const { data: signedRecords } = await supabase
      .from('ghl_leads')
      .select('contact_id, ad_id')
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
      if (!result[resolvedAdId]) result[resolvedAdId] = []
      result[resolvedAdId].push({ label, contact })
    }
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
  const datePreset  = searchParams.get('date_preset') || 'maximum'
  const startParam  = searchParams.get('start_date')
  const endParam    = searchParams.get('end_date')

  // Custom date range takes priority over preset
  const { start, end } = (startParam && endParam)
    ? { start: startParam, end: endParam }
    : getDateRange(datePreset)
  const isCustomOrPreset = !!(startParam && endParam) || datePreset !== 'maximum'

  try {
    // Fetch Supabase data and GHL pipeline data in parallel (separately to avoid spread issues)
    const pipelineStart = isCustomOrPreset ? start : null
    const pipelineEnd   = isCustomOrPreset ? end   : null

    /* contact_name/qualified_at come along so a signed case can be named, not
       just counted — the tile is clickable and has to show who. */
    let signedQuery = supabase.from('ghl_leads')
      .select('ad_id, firm_id, created_at, contact_name, contact_phone, contact_email, qualified_at, case_status')
    if (isCustomOrPreset) {
      signedQuery = signedQuery.gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`)
    }

    const stageMap = await liveStageMap()

    const [signedRes, firmsRes, invoicesRes, pipelineResults] = await Promise.all([
      signedQuery,
      supabase.from('firms').select('id, slug, name, meta_campaign_filter'),
      supabase.from('firm_invoices').select('firm_id, code').order('sort_order', { ascending: false }).order('period_start', { ascending: false }),
      Promise.all(
        Object.entries(GHL_PIPELINES).map(([slug, pid]) =>
          fetchPipelineBreakdown(stageMap, pid, pipelineStart, pipelineEnd)
            .then(data => ({ slug, data }))
            .catch(() => ({ slug, data: {} as Record<string, { label: StageLabel; contact: Lead }[]> }))
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

    const firmById: Record<string, { slug: string; name: string; latestInvoice: string | null; filter: string | null }> = {}
    for (const f of (firmsRes.data || [])) {
      if (f.id) firmById[f.id] = { slug: f.slug, name: f.name, latestInvoice: latestInvoiceByFirmId[f.id] || null, filter: f.meta_campaign_filter || null }
    }

    // Build adId pattern → firm map from meta_campaign_filter (e.g. "JLL" → Levine Law)
    const filterFirms = Object.values(firmById).filter(f => f.filter)

    const byAdId: Record<string, AdData> = {}

    /* Supabase rows attach a firm to an ad and nothing more. Signed cases are
       counted from the pipeline below: a case is signed once it reaches
       Pending Send, and the pipeline is where that state actually lives. */
    for (const row of (signedRes.data || [])) {
      if (!row.ad_id) continue
      const firm = firmById[row.firm_id] || null
      if (!byAdId[row.ad_id]) byAdId[row.ad_id] = emptyAdData(firm?.slug || null, firm?.name || null, firm?.latestInvoice || null)
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
          const d = byAdId[adId]
          if      (label === 'new_lead')      { d.newLeadCount++;      d.newLeadLeads.push(contact) }
          else if (label === 'nr')            { d.nrCount++;           d.nrLeads.push(contact) }
          else if (label === 'fu')            { d.fuCount++;           d.fuLeads.push(contact) }
          else if (label === 'chase')         { d.chaseCount++;        d.chaseLeads.push(contact) }
          else if (label === 'appointment')   { d.appointmentCount++;  d.appointmentLeads.push(contact) }
          else if (label === 'contract_sent') { d.contractSentCount++; d.contractSentLeads.push(contact) }
          else if (label === 'pending_send')  { d.pendingSendCount++;  d.pendingSendLeads.push(contact) }
          else if (label === 'nq')            { d.nqCount++;           d.nqLeads.push(contact) }
          else if (label === 'mia')           { d.miaCount++;          d.miaLeads.push(contact) }
          else if (label === 'qualified')     { d.qualifiedCount++;    d.qualifiedLeads.push(contact) }
          else if (label === 'signed')        { d.sentCount++;         d.sentLeads.push(contact) }
        }
      }
    }


    /* Signed = Pending Send + Signed/Sent. Pending Send is the point the case
       is ours; Signed/Sent is where it goes afterwards, so counting only the
       latter would under-report everything still in flight. */
    for (const d of Object.values(byAdId)) {
      d.signedCases = d.pendingSendCount + d.sentCount
      d.signedLeads = [
        ...d.pendingSendLeads.map(l => ({ ...l, stage: 'Pending Send' })),
        ...d.sentLeads.map(l => ({ ...l, stage: 'Signed/Sent' })),
      ]
    }

    // Attribution via meta_campaign_filter: any adId containing a firm's filter string → assign that firm
    for (const [adId, adData] of Object.entries(byAdId)) {
      if (adData.firmSlug) continue // already attributed
      const adIdUpper = adId.toUpperCase()
      for (const firm of filterFirms) {
        if (firm.filter && adIdUpper.includes(firm.filter.toUpperCase())) {
          adData.firmSlug      = firm.slug
          adData.firmName      = firm.name
          adData.latestInvoice = firm.latestInvoice
          break
        }
      }
    }

    return NextResponse.json({ byAdId })
  } catch (err) {
    /* A quota refusal is a known, temporary condition rather than a crash, and
       it carries a message worth showing — "burst limit, clears in seconds" is
       actionable, "unhandled error" is not. Either way byAdId is returned
       empty rather than partial: the outcome columns show nothing, which is
       honest, instead of a subset that reads as the whole truth. */
    if (err instanceof GhlQuotaError) {
      console.error('[creative-overview]', err.message)
      return NextResponse.json(
        { error: err.message, limit: err.kind, retryAfterMs: err.retryAfterMs, byAdId: {} },
        { status: 429 }
      )
    }
    console.error('[creative-overview] unhandled error:', err)
    return NextResponse.json({ error: String(err), byAdId: {} }, { status: 500 })
  }
}
