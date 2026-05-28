import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN        = process.env.META_ACCESS_TOKEN!
const AD_ACCOUNT   = 'act_788484706914452'
const BASE         = 'https://graph.facebook.com/v25.0'
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

// ─── Angle lookup tables ─────────────────────────────────────────────────────
const VISUAL_HOOKS: Record<string, string> = {
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
}

const VERBAL_HOOKS: Record<string, string> = {
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
  B18: 'Life after getting $100k (Banner)',
  B19: "Didn't Go To ER",
}

// ─── Parse A and B codes from a creative ad name ─────────────────────────────
// Format: B0003_V1 | LHP | BR | RIP | A2 | B2 | GA-WIN
function parseAngleCodes(adName: string): { visualCode: string | null; verbalCode: string | null } {
  const parts = adName.split('|').map(p => p.trim())
  let visualCode: string | null = null
  let verbalCode: string | null = null
  for (const part of parts) {
    if (/^A\d+$/.test(part)) visualCode = part
    if (/^B\d+$/.test(part)) {
      // Only capture as verbal if it looks like a hook code (B1-B19)
      // and not a creative code at the start (like B0003)
      const num = parseInt(part.slice(1))
      if (num >= 1 && num <= 19) verbalCode = part
    }
  }
  return { visualCode, verbalCode }
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
  adCount: number     // how many distinct ads use this angle
  cpl: number | null
  cpq: number | null
  conversionRate: number | null   // signedCases / leads
}

type ComboStat = AngleStat & { visualCode: string; verbalCode: string }

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const datePreset = searchParams.get('date_preset') || 'maximum'
  const analyze    = searchParams.get('analyze') === 'true'

  // 1. Meta ad-level insights (all ads in account)
  const metaRes = await fetchMeta(`/${AD_ACCOUNT}/insights`, {
    fields:      'ad_id,ad_name,adset_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions',
    date_preset: datePreset,
    level:       'ad',
    limit:       '500',
  })
  const metaAds: any[] = metaRes.data || []

  // 2. Supabase: signed cases (pipeline_stage IS NULL → qualified/signed)
  const [signedRes, pipelineRes] = await Promise.all([
    supabase.from('ghl_leads')
      .select('ad_id, ad_name'),
    supabase.from('ghl_leads')
      .select('ad_id, ad_name, pipeline_stage')
      .not('pipeline_stage', 'is', null),
  ])

  const signedRows   = (signedRes.data   || []) as any[]
  const pipelineRows = (pipelineRes.data || []) as any[]

  // ─── Build signed + pipeline counts per ad_id from Supabase ────────────────
  type AdPipelineData = { signedCases: number; nrCount: number; nqCount: number; fuCount: number; chaseCount: number; adName: string | null }
  const byAdId: Record<string, AdPipelineData> = {}

  const STAGE_MAP: Record<string, 'nr' | 'nq' | 'fu' | 'chase'> = {
    no_response:   'nr',
    not_qualified: 'nq',
    follow_up:     'fu',
    sent:          'fu',
    chase:         'chase',
  }

  for (const row of signedRows) {
    if (!row.ad_id) continue
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = { signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, adName: row.ad_name || null }
    byAdId[row.ad_id].signedCases++
    if (row.ad_name && !byAdId[row.ad_id].adName) byAdId[row.ad_id].adName = row.ad_name
  }

  for (const row of pipelineRows) {
    if (!row.ad_id || !row.pipeline_stage) continue
    const stage = STAGE_MAP[row.pipeline_stage.toLowerCase()]
    if (!stage) continue
    if (!byAdId[row.ad_id]) byAdId[row.ad_id] = { signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, adName: row.ad_name || null }
    byAdId[row.ad_id][`${stage}Count`]++
    if (row.ad_name && !byAdId[row.ad_id].adName) byAdId[row.ad_id].adName = row.ad_name
  }

  // ─── Per-angle aggregation ─────────────────────────────────────────────────
  const visualMap: Record<string, AngleStat> = {}
  const verbalMap: Record<string, AngleStat> = {}
  const comboMap:  Record<string, ComboStat>  = {}

  // Ads we couldn't parse angle codes from
  let unparsedSpend = 0
  let unparsedAds   = 0

  for (const ad of metaAds) {
    const adName = ad.ad_name || byAdId[ad.ad_id]?.adName || ''
    const { visualCode, verbalCode } = parseAngleCodes(adName)

    const spend       = parseFloat(ad.spend || '0')
    const leads       = getLeads(ad.actions)
    const adData      = byAdId[ad.ad_id] || { signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0 }
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
      if (!map[code]) map[code] = { code, name, spend: 0, leads: 0, signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, adCount: 0, cpl: null, cpq: null, conversionRate: null }
      map[code].spend       += spend
      map[code].leads       += leads
      map[code].signedCases += signedCases
      map[code].nrCount     += nrCount
      map[code].nqCount     += nqCount
      map[code].fuCount     += fuCount
      map[code].chaseCount  += chaseCount
      map[code].adCount++
    }

    if (visualCode) addTo(visualMap, visualCode, VISUAL_HOOKS[visualCode] || visualCode)
    if (verbalCode) addTo(verbalMap, verbalCode, VERBAL_HOOKS[verbalCode] || verbalCode)

    if (visualCode && verbalCode) {
      const comboKey = `${visualCode}+${verbalCode}`
      if (!comboMap[comboKey]) comboMap[comboKey] = {
        code: comboKey, name: `${visualCode} × ${verbalCode}`, visualCode, verbalCode,
        spend: 0, leads: 0, signedCases: 0, nrCount: 0, nqCount: 0, fuCount: 0, chaseCount: 0, adCount: 0, cpl: null, cpq: null, conversionRate: null,
      }
      const c = comboMap[comboKey]
      c.spend += spend; c.leads += leads; c.signedCases += signedCases
      c.nrCount += nrCount; c.nqCount += nqCount; c.fuCount += fuCount; c.chaseCount += chaseCount; c.adCount++
    }
  }

  // Finalize CPL/CPQ/conversionRate
  function finalize(stat: AngleStat) {
    stat.cpl            = stat.leads       > 0 ? stat.spend / stat.leads        : null
    stat.cpq            = stat.signedCases > 0 ? stat.spend / stat.signedCases  : null
    stat.conversionRate = stat.leads       > 0 ? (stat.signedCases / stat.leads) * 100 : null
  }

  const visualStats = Object.values(visualMap)
  const verbalStats = Object.values(verbalMap)
  const comboStats  = Object.values(comboMap)

  for (const s of [...visualStats, ...verbalStats, ...comboStats]) finalize(s)

  // Sort by spend descending for base tables
  const sortByCpq = (a: AngleStat, b: AngleStat) => {
    // Put angles with signed cases first (sorted by CPQ asc), then rest by spend desc
    if (a.signedCases > 0 && b.signedCases > 0) return (a.cpq ?? 9999) - (b.cpq ?? 9999)
    if (a.signedCases > 0) return -1
    if (b.signedCases > 0) return 1
    return b.spend - a.spend
  }

  visualStats.sort(sortByCpq)
  verbalStats.sort(sortByCpq)
  comboStats.sort(sortByCpq)

  // ─── AI analysis ──────────────────────────────────────────────────────────
  let aiAnalysis: string | null = null

  if (analyze && ANTHROPIC_KEY) {
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY })

    const fmtStat = (s: AngleStat) =>
      `${s.code} (${s.name}): spend=$${s.spend.toFixed(0)} leads=${s.leads} CPL=${s.cpl ? '$' + s.cpl.toFixed(0) : '—'} signed=${s.signedCases} CPQ=${s.cpq ? '$' + s.cpq.toFixed(0) : '—'} NR=${s.nrCount} NQ=${s.nqCount} FU=${s.fuCount} ads=${s.adCount}`

    const prompt = `You are an expert digital advertising analyst for a personal injury law firm lead generation business. Analyze the following Facebook/Meta ad performance data segmented by "angle codes" — the creative hooks used in each ad.

ANGLE CODE REFERENCE:
Visual Hooks (the opening visual of the ad):
${Object.entries(VISUAL_HOOKS).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

Verbal Hooks (the spoken/text message in the ad):
${Object.entries(VERBAL_HOOKS).map(([k, v]) => `  ${k}: ${v}`).join('\n')}

KEY METRICS:
- CPL = Cost Per Lead (lower is better, target <$150)
- CPQ = Cost Per Qualified Case (lower is better, target <$800)
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

1. **VISUAL HOOK WINNERS & LOSERS** — Which A codes are working best (lowest CPQ, best conversion rate) and which should be cut. Be specific with numbers.

2. **VERBAL HOOK WINNERS & LOSERS** — Same for B codes. Which messages resonate most with auto accident victims?

3. **BEST COMBINATIONS** — Which A+B pairings are the strongest? Any surprising synergies?

4. **IMMEDIATE CUT LIST** — Which hooks have enough spend to call (>$500 spent) but zero conversions or very poor CPQ? These should be paused.

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
    visual:      visualStats,
    verbal:      verbalStats,
    combos:      comboStats.slice(0, 30),
    unparsedAds,
    unparsedSpend,
    aiAnalysis,
    analyzedAt:  analyze ? new Date().toISOString() : null,
  })
}
