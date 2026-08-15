import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN        = (process.env.META_ACCESS_TOKEN || '').trim().replace(/\\n$/, '')
const AD_ACCOUNT   = 'act_788484706914452'
const BASE         = 'https://graph.facebook.com/v25.0'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

// ─── Angle lookup tables ─────────────────────────────────────────────────────
// BR-AD angle (A = visual, B = verbal)
const VISUAL_HOOKS: Record<string, string> = {
  // BR-AD visual hooks
  A1:  'Skeleton',
  A2:  'Animated Surgery',
  A3:  'Accident',
  A4:  'Check',
  A5:  'New Car',
  A6:  'Split View (Half Screen)',
  A7:  'State Map',
  A8:  'Check & Talking Head (Bold Guy)',
  A9:  'Check & Talking Head (Working Woman)',
  A10: 'Animal',
  A11: 'Attention Hook',
  A12: 'Animated Bone',
  A13: 'Simulation Crash',
  // HYB-AD visual hooks
  C1:  'Black 30ish Lady Talking Head',
  C2:  'Bold Old Guy',
  C3:  'White Man',
  // AIUGC-AD visual hooks
  E1:  'In the Car',
  E2:  'Gas Station',
  E3:  'Gym',
  E4:  'Black AI Avatar',
  E5:  'Latino AI Avatar',
  // BNR-AD visual hooks
  G1:  'Accident',
  G2:  'Car Driving',
  // ANM-AD visual hooks (placeholder)
  // IMG-AD visual hooks (placeholder)
}

const VERBAL_HOOKS: Record<string, string> = {
  // BR-AD verbal hooks
  B1:  'Insurance Company',
  B2:  "They don't want you to know",
  B3:  'Never Sue',
  B4:  'New Claim Tool',
  B5:  'How I got new car',
  B6:  'Music Only',
  B7:  'Looking for 10 accident victims',
  B8:  'Understand your options (Educational)',
  B9:  'You may be owed a bigger check',
  B10: 'Injuries take days to appear',
  B11: 'Miss out on money',
  B12: 'Do I have to sue to get paid',
  B13: 'Passenger Angle',
  B14: '3 Mistakes',
  B15: 'Eligible for a bigger payout',
  B16: 'Do Not Call Attorney',
  B17: 'Been in car accident and did not go to the hospital',
  B18: "Didn't Go To ER",
  B19: "Insurance Company doesn't care you go to ER",
  B20: 'This is Viral Hack',
  B21: "Don't Accept first check from insurance",
  B22: 'Think you are fine after car accident no ER no AMB',
  B23: 'Never do this 3 things',
  B24: 'Never call insurance yourself',
  B25: 'Just Now feeling the pain',
  B26: 'Old lady crushed and said I ran green light',
  B27: 'Car looks like this Body feels like this',
  // HYB-AD verbal hooks
  D1:  'Settlement Comparison',
  D2:  'You will regret suing the person who hit you in a car accident',
  D3:  'If you skipped ER after your car accident',
  // AIUGC-AD verbal hooks
  F1:  'I need to tell you something (Whisper)',
  F2:  'How much did you get for the little accident',
  F3:  'First day back at gym after my accident',
  F4:  'Settlement Amount Comparison',
  // BNR-AD verbal hooks
  H1:  "Didn't go to the ER",
  H2:  'Never Sue the person who hit you',
  H3:  'I almost let insurance settle my accident for',
  H4:  "I didn't know there were two checks you could get",
  H5:  'Drink Driver hit my car (BNR)',
  H6:  'Biggest Mistake',
}

// Which angle type each letter prefix belongs to
const ANGLE_TYPE_BY_PREFIX: Record<string, string> = {
  A: 'BR-AD', B: 'BR-AD',
  C: 'HYB-AD', D: 'HYB-AD',
  E: 'AIUGC-AD', F: 'AIUGC-AD',
  G: 'BNR-AD', H: 'BNR-AD',
  I: 'ANM-AD', J: 'ANM-AD',
  K: 'IMG-AD', L: 'IMG-AD',
}

// ─── Parse angle codes from a creative ad name ────────────────────────────────
// Format: B0003_V1 | LHP | BR | RIP | A2 | B2 | GA-WIN
// Visual codes: A, C, E, G, I, K  |  Verbal codes: B, D, F, H, J, L
function parseAngleCodes(adName: string): { visualCode: string | null; verbalCode: string | null } {
  const parts = adName.split('|').map(p => p.trim())
  let visualCode: string | null = null
  let verbalCode: string | null = null
  for (const part of parts) {
    // Visual hook codes: A, C, E, G, I, K — limit to 1-50 to avoid batch ID false positives
    if (/^[ACEGIK]\d+$/.test(part)) {
      const num = parseInt(part.slice(1))
      if (num >= 1 && num <= 50) visualCode = part
    }
    // Verbal hook codes: B, D, F, H, J, L — limit to 1-50 to avoid batch ID false positives
    if (/^[BDFHJL]\d+$/.test(part)) {
      const num = parseInt(part.slice(1))
      if (num >= 1 && num <= 50) verbalCode = part
    }
  }
  return { visualCode, verbalCode }
}

// ─── Parse firm from ad/campaign/adset naming ─────────────────────────────────
// Fears Law:  ad creative name contains "FL" as a pipe-delimited segment
// Levine Law: campaign, adset, or ad name contains "JLL"
function parseFirm(adName: string, campaignName: string, adsetName: string): 'FL' | 'JLL' | 'other' {
  const combined = `${campaignName} ${adsetName} ${adName}`.toUpperCase()
  if (combined.includes('JLL')) return 'JLL'
  // FL check: must be a discrete segment in pipe-delimited ad name to avoid false positives
  const parts = adName.split('|').map(p => p.trim().toUpperCase())
  if (parts.includes('FL')) return 'FL'
  return 'other'
}

// ─── Meta API helper ─────────────────────────────────────────────────────────
async function fetchMeta(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal })
    if (!res.ok) return { data: [] }
    return await res.json()
  } catch { return { data: [] } }
  finally { clearTimeout(timer) }
}

function getLeads(actions: any[] = []) {
  return parseInt(
    actions.find(a => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead')?.value || '0'
  )
}

// ─── Aggregation types ───────────────────────────────────────────────────────
type PipelineLead = { name: string | null; phone: string | null; email: string | null; createdAt: string | null }

type AngleStat = {
  code: string
  name: string
  spend: number
  leads: number
  signedCases: number
  nrCount: number
  nqCount: number
  fuCount: number
  chaseCount: number
  nrLeads: PipelineLead[]
  nqLeads: PipelineLead[]
  fuLeads: PipelineLead[]
  chaseLeads: PipelineLead[]
  adCount: number     // how many distinct ads use this angle
  cpl: number | null
  cpa: number | null
  conversionRate: number | null   // signedCases / leads
}

type ComboStat = AngleStat & { visualCode: string; verbalCode: string }

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const datePreset = searchParams.get('date_preset') || 'maximum'
  const analyze    = searchParams.get('analyze') === 'true'
  const firmFilter = searchParams.get('firm') || 'all' // 'all' | 'FL' | 'JLL'

  // 1. Meta ad-level insights (all ads in account)
  const metaRes = await fetchMeta(`/${AD_ACCOUNT}/insights`, {
    fields:      'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions',
    date_preset: datePreset,
    level:       'ad',
    limit:       '500',
  })
  const metaAds: any[] = metaRes.data || []

  // ─── GHL Pipeline config ───────────────────────────────────────────────────
  const GHL_API_KEY     = process.env.GHL_API_KEY || ''
  const GHL_LOCATION_ID = 'AGAoUCwWTwc4Bqslwt9r'
  const GHL_PIPELINES: Record<string, string> = {
    lhp: 'yMqNixSnChC5lcGQXA1g', eisenberg: 'Yk4w3ML56ECc10PFzjpK',
    thl: 'DYtmw8WEUtGePFbEDAIZ', mca: '6Ku9EwTtMFk51o7Re9x0',
  }
  const GHL_STAGE_LABEL: Record<string, 'nr' | 'nq' | 'fu' | 'chase'> = {
    '1175a360-9914-4ce5-906d-d89adb27c732': 'nr',  '87759fbc-6d3e-46b1-aa47-9ae42ff88393': 'fu',
    '1a4eed62-09ea-4108-ab64-2e16930350d6': 'chase','a9e1b12f-94c4-4ca2-b696-1b3bf349d158': 'nq',
    'c63f684a-f2eb-48f8-84f1-7ab35a1ba25b': 'nr',  'fd0f13e3-b535-471a-ac37-7dc2ca177854': 'fu',
    'f0382a1e-b759-450f-8efe-d168cc10e3b1': 'nq',  '121ae7a9-35c9-4204-a7d4-8fb19f297758': 'nr',
    '866213c6-c43e-47a2-a1d9-20a740f0dd0b': 'fu',  '0c82f94f-f013-4fd6-99f8-75ef7b547915': 'nq',
    '87d0a194-8841-4062-b6a3-bfedd9186070': 'nr',  'bda11191-0a4a-40da-b368-cd925ec884dc': 'fu',
    '8206445b-2ac5-46bb-be3e-93d116420161': 'nq',
  }

  // 2. Supabase signed cases + GHL pipeline data in parallel
  type GHLEntry = { label: 'nr' | 'nq' | 'fu' | 'chase'; contact: PipelineLead }
  const ghlPipelineFetches = GHL_API_KEY
    ? Object.values(GHL_PIPELINES).map(pid =>
        (async () => {
          const out: Record<string, GHLEntry[]> = {}
          let url: string | null = `https://services.leadconnectorhq.com/opportunities/search?location_id=${GHL_LOCATION_ID}&pipeline_id=${pid}&limit=100`
          let p = 0
          while (url && p < 20) {
            p++
            const r = await fetch(url, { headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: '2021-07-28' }, cache: 'no-store' })
            if (!r.ok) break
            const d: any = await r.json()
            for (const opp of (d.opportunities || [])) {
              const sn = (opp.pipelineStage?.name || '').toLowerCase()
              const label: 'nr' | 'nq' | 'fu' | 'chase' | undefined =
                GHL_STAGE_LABEL[opp.pipelineStageId] ||
                (sn.includes('chase') ? 'chase' : sn.includes('no response') ? 'nr' : sn.includes('not qualified') ? 'nq' : sn.includes('follow up') ? 'fu' : undefined)
              if (!label) continue
              const attr = opp.attributions?.find((a: any) => a.isFirst) || opp.attributions?.[0]
              const adId = attr?.utmAdId || attr?.utmContent || null
              if (!adId) continue
              if (!out[adId]) out[adId] = []
              out[adId].push({
                label,
                contact: {
                  name:      opp.contact?.name || opp.name || null,
                  phone:     opp.contact?.phone || null,
                  email:     opp.contact?.email || null,
                  createdAt: opp.createdAt || null,
                },
              })
            }
            url = d.meta?.nextPageUrl || null
          }
          return out
        })().catch(() => ({} as Record<string, GHLEntry[]>))
      )
    : []

  const [signedRes, ghlResultsArr] = await Promise.all([
    supabase.from('ghl_leads').select('ad_id, ad_name'),
    Promise.all(ghlPipelineFetches),
  ])

  const signedRows = (signedRes.data || []) as any[]

  // ─── Build signed + pipeline counts per ad_id ──────────────────────────────
  type AdPipelineData = {
    signedCases: number
    nrCount: number; nqCount: number; fuCount: number; chaseCount: number
    nrLeads: PipelineLead[]; nqLeads: PipelineLead[]; fuLeads: PipelineLead[]; chaseLeads: PipelineLead[]
    adName: string | null
  }
  const byAdId: Record<string, AdPipelineData> = {}

  function emptyAdData(adName: string | null = null): AdPipelineData {
    return { signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, nrLeads: [], nqLeads: [], fuLeads: [], chaseLeads: [], adName }
  }

  for (const row of signedRows) {
    if (!row.ad_id) continue
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = emptyAdData(row.ad_name || null)
    byAdId[row.ad_id].signedCases++
    if (row.ad_name && !byAdId[row.ad_id].adName) byAdId[row.ad_id].adName = row.ad_name
  }

  // Merge GHL pipeline data
  for (const result of ghlResultsArr) {
    for (const [adId, entries] of Object.entries(result)) {
      if (!byAdId[adId]) byAdId[adId] = emptyAdData(null)
      for (const { label, contact } of entries) {
        if (label === 'nr') { byAdId[adId].nrCount++; byAdId[adId].nrLeads.push(contact) }
        else if (label === 'nq') { byAdId[adId].nqCount++; byAdId[adId].nqLeads.push(contact) }
        else if (label === 'fu') { byAdId[adId].fuCount++; byAdId[adId].fuLeads.push(contact) }
        else if (label === 'chase') { byAdId[adId].chaseCount++; byAdId[adId].chaseLeads.push(contact) }
      }
    }
  }

  // ─── Per-angle aggregation ─────────────────────────────────────────────────
  const visualMap: Record<string, AngleStat> = {}
  const verbalMap: Record<string, AngleStat> = {}
  const comboMap:  Record<string, ComboStat>  = {}

  // Ads we couldn't parse angle codes from
  let unparsedSpend = 0
  let unparsedAds   = 0

  for (const ad of metaAds) {
    const adName       = ad.ad_name        || byAdId[ad.ad_id]?.adName || ''
    const campaignName = ad.campaign_name  || ''
    const adsetName    = ad.adset_name     || ''

    // Firm filter
    const firm = parseFirm(adName, campaignName, adsetName)
    if (firmFilter !== 'all' && firm !== firmFilter) continue

    const { visualCode, verbalCode } = parseAngleCodes(adName)

    const spend       = parseFloat(ad.spend || '0')
    const leads       = getLeads(ad.actions)
    const adData      = byAdId[ad.ad_id] || { signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, nrLeads: [] as PipelineLead[], nqLeads: [] as PipelineLead[], fuLeads: [] as PipelineLead[], chaseLeads: [] as PipelineLead[], adName: null }
    const signedCases = adData.signedCases
    const nrCount     = adData.nrCount
    const nqCount     = adData.nqCount
    const fuCount     = adData.fuCount
    const chaseCount  = adData.chaseCount

    if (!visualCode && !verbalCode) {
      unparsedSpend += spend
      unparsedAds++
      continue
    }

    function addTo(map: Record<string, AngleStat>, code: string, name: string) {
      if (!map[code]) map[code] = { code, name, spend: 0, leads: 0, signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, nrLeads: [], nqLeads: [], fuLeads: [], chaseLeads: [], adCount: 0, cpl: null, cpa: null, conversionRate: null }
      map[code].spend       += spend
      map[code].leads       += leads
      map[code].signedCases += signedCases
      map[code].nrCount     += nrCount
      map[code].nqCount     += nqCount
      map[code].fuCount     += fuCount
      map[code].chaseCount  += chaseCount
      map[code].nrLeads.push(...adData.nrLeads)
      map[code].nqLeads.push(...adData.nqLeads)
      map[code].fuLeads.push(...adData.fuLeads)
      map[code].chaseLeads.push(...adData.chaseLeads)
      map[code].adCount++
    }

    if (visualCode) addTo(visualMap, visualCode, VISUAL_HOOKS[visualCode] || visualCode)
    if (verbalCode) addTo(verbalMap, verbalCode, VERBAL_HOOKS[verbalCode] || verbalCode)

    if (visualCode && verbalCode) {
      const comboKey = `${visualCode}+${verbalCode}`
      if (!comboMap[comboKey]) comboMap[comboKey] = {
        code: comboKey, name: `${visualCode} × ${verbalCode}`, visualCode, verbalCode,
        spend: 0, leads: 0, signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, nrLeads: [], nqLeads: [], fuLeads: [], chaseLeads: [], adCount: 0, cpl: null, cpa: null, conversionRate: null,
      }
      const c = comboMap[comboKey]
      c.spend += spend; c.leads += leads; c.signedCases += signedCases
      c.nrCount += nrCount; c.nqCount += nqCount; c.fuCount += fuCount; c.chaseCount += chaseCount
      c.nrLeads.push(...adData.nrLeads); c.nqLeads.push(...adData.nqLeads)
      c.fuLeads.push(...adData.fuLeads); c.chaseLeads.push(...adData.chaseLeads)
      c.adCount++
    }
  }

  // Finalize CPL/CPQ/conversionRate
  function finalize(stat: AngleStat) {
    stat.cpl            = stat.leads       > 0 ? stat.spend / stat.leads        : null
    stat.cpa            = stat.signedCases > 0 ? stat.spend / stat.signedCases  : null
    stat.conversionRate = stat.leads       > 0 ? (stat.signedCases / stat.leads) * 100 : null
  }

  const visualStats = Object.values(visualMap)
  const verbalStats = Object.values(verbalMap)
  const comboStats  = Object.values(comboMap)

  for (const s of [...visualStats, ...verbalStats, ...comboStats]) finalize(s)

  // Sort by spend descending for base tables
  const sortByCpa = (a: AngleStat, b: AngleStat) => {
    // Put angles with signed cases first (sorted by CPA asc), then rest by spend desc
    if (a.signedCases > 0 && b.signedCases > 0) return (a.cpa ?? 9999) - (b.cpa ?? 9999)
    if (a.signedCases > 0) return -1
    if (b.signedCases > 0) return 1
    return b.spend - a.spend
  }

  visualStats.sort(sortByCpa)
  verbalStats.sort(sortByCpa)
  comboStats.sort(sortByCpa)

  // ─── AI analysis ──────────────────────────────────────────────────────────
  let aiAnalysis: string | null = null

  if (analyze && ANTHROPIC_KEY) {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    const fmtStat = (s: AngleStat) =>
      `${s.code} (${s.name}): spend=$${s.spend.toFixed(0)} leads=${s.leads} CPL=${s.cpl ? '$' + s.cpl.toFixed(0) : '—'} signed=${s.signedCases} CPA=${s.cpa ? '$' + s.cpa.toFixed(0) : '—'} NR=${s.nrCount} NQ=${s.nqCount} FU=${s.fuCount} ads=${s.adCount}`

    const prompt = `You are an expert digital advertising analyst for a personal injury law firm lead generation business. Analyze the following Facebook/Meta ad performance data segmented by "angle codes" — the creative hooks used in each ad.

ANGLE TYPE REFERENCE:
- BR-AD (Branded): Visual A codes + Verbal B codes
- HYB-AD (Hybrid): Visual C codes + Verbal D codes
- AIUGC-AD (AI UGC): Visual E codes + Verbal F codes
- BNR-AD (Banner): Visual G codes + Verbal H codes
- ANM-AD (Animated): Visual I codes + Verbal J codes
- IMG-AD (Image): Visual K codes + Verbal L codes

ANGLE CODE REFERENCE:
Visual Hooks (the opening visual of the ad):
${Object.entries(VISUAL_HOOKS).map(([k, v]) => `  ${k} [${ANGLE_TYPE_BY_PREFIX[k[0]]}]: ${v}`).join('\n')}

Verbal Hooks (the spoken/text message in the ad):
${Object.entries(VERBAL_HOOKS).map(([k, v]) => `  ${k} [${ANGLE_TYPE_BY_PREFIX[k[0]]}]: ${v}`).join('\n')}

KEY METRICS:
- CPL = Cost Per Lead (lower is better, target <$150)
- CPA = Cost Per Signed Case (lower is better, target <$800)
- NR = No Response (leads that didn't pick up)
- NQ = Not Qualified (leads that don't meet criteria)
- FU = Follow Up (active pipeline)
- Signed = cases that converted to paying clients

PERFORMANCE DATA BY VISUAL HOOK (A codes):
${visualStats.map(fmtStat).join('\n')}

PERFORMANCE DATA BY VERBAL HOOK (B codes):
${verbalStats.map(fmtStat).join('\n')}

TOP ANGLE COMBINATIONS (A visual + B verbal):
${comboStats.slice(0, 20).map(fmtStat).join('\n')}

Please provide a structured deep-dive analysis covering:

1. **VISUAL HOOK WINNERS & LOSERS** — Which A codes are working best (lowest CPA, best conversion rate) and which should be cut. Be specific with numbers.

2. **VERBAL HOOK WINNERS & LOSERS** — Same for B codes. Which messages resonate most with auto accident victims?

3. **BEST COMBINATIONS** — Which A+B pairings are the strongest? Any surprising synergies?

4. **IMMEDIATE CUT LIST** — Which hooks have enough spend to call (>$500 spent) but zero conversions or very poor CPA? These should be paused.

5. **SCALE RECOMMENDATIONS** — Which hooks/combos should get more budget based on efficiency?

6. **NEW COMBINATIONS TO TEST** — Based on what's working, suggest 3-5 untested A+B combinations that could outperform current top performers and why.

7. **STRATEGIC NARRATIVE** — What does this data tell us about what auto accident victims respond to? What psychological triggers are working?

Be direct, data-driven, and actionable. Use specific dollar amounts and percentages from the data.`

    const msg = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    })

    aiAnalysis = (msg.content[0] as any).text || null
  }

  return NextResponse.json({
    datePreset,
    firm:        firmFilter,
    visual:      visualStats,
    verbal:      verbalStats,
    combos:      comboStats.slice(0, 30),
    unparsedAds,
    unparsedSpend,
    aiAnalysis,
    analyzedAt:  analyze ? new Date().toISOString() : null,
  })
}
