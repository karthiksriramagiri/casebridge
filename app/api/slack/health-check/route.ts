import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const META_TOKEN   = process.env.META_ACCESS_TOKEN!
const SLACK_URL    = process.env.SLACK_WEBHOOK_CHECKS!
const CRON_SECRET  = process.env.CRON_SECRET!
const BASE         = 'https://graph.facebook.com/v25.0'

// ─── Meta helper ─────────────────────────────────────────────────────────────
async function fetchMeta(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', META_TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000), cache: 'no-store' })
    if (!res.ok) return { data: [] }
    return await res.json()
  } catch { return { data: [] } }
}

function getLeads(actions: any[] = []) {
  return parseInt(actions.find(a =>
    a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead'
  )?.value || '0')
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// ─── Alert level — mirrors main dashboard logic ───────────────────────────────
function alertLevel(spend: number, leads: number, cpl: number | null, cpq: number | null, signed: number): string {
  if (spend < 600) { if (cpl != null && cpl > 300) return 'kill'; return 'floor' }
  if (leads === 0) return 'kill'
  if (leads >= 8 && signed >= 2 && (cpl == null || cpl <= 300) && (cpq == null || cpq <= 1200)) return 'scale'
  if (cpl != null && cpl > 300 && cpq != null && cpq > 1200 && signed === 0) return 'kill'
  if (cpl != null && cpl > 300) return 'watch'
  if (leads >= 5 && cpl != null && cpl > 220) return 'read_decide'
  if (cpq != null && cpq > 1200) return 'watch'
  if (cpl != null && cpl > 220) return 'watch'
  return 'active'
}

const ALERT_EMOJI: Record<string, string> = {
  kill:        '🔴',
  watch:       '🟡',
  floor:       '⚪',
  read_decide: '🟠',
  scale:       '🟢',
  active:      '🟢',
}
const ALERT_LABEL: Record<string, string> = {
  kill:        'KILL',
  watch:       'WATCH',
  floor:       'FLOOR',
  read_decide: 'READ/DECIDE',
  scale:       'SCALE',
  active:      'SCALE',
}

// ─── Parse creative launch date from ad name (YYYYMMDD segment) ───────────────
function creativeLaunchDate(adName: string): Date | null {
  const match = adName.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/)
  if (!match) return null
  return new Date(`${match[1]}-${match[2]}-${match[3]}`)
}

function creativeAge(adName: string, todayEST: string): number | null {
  const launch = creativeLaunchDate(adName)
  if (!launch) return null
  const today = new Date(todayEST)
  return Math.max(1, Math.ceil((today.getTime() - launch.getTime()) / 86400000) + 1)
}

// ─── Sort creatives old → new by embedded date, then by name ─────────────────
function sortCreativesOldToNew(ads: any[], todayEST: string) {
  return [...ads].sort((a, b) => {
    const da = creativeLaunchDate(a.ad_name || '')
    const db = creativeLaunchDate(b.ad_name || '')
    if (da && db) return da.getTime() - db.getTime()
    if (da) return -1
    if (db) return 1
    return (a.ad_name || '').localeCompare(b.ad_name || '')
  })
}

// ─── Main GET handler ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth — Vercel cron sends Bearer CRON_SECRET; manual trigger skips if no secret set
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Current time in EST ───────────────────────────────────────────────────
  const now = new Date()
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const timeLabel = estFormatter.format(now).replace(' at ', ' · ')

  // Today's date in EST (YYYY-MM-DD)
  const todayEST = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now)

  // 3 hours ago (for per-notification delta)
  const threeHoursAgoISO = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()

  // Last 7 days window
  const sevenDaysAgoDate = new Date(now)
  sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 6)
  const sevenDaysAgoEST = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(sevenDaysAgoDate)

  // Previous 7-day window (14–7 days ago) for week-over-week comparison
  const fourteenDaysAgoDate = new Date(now)
  fourteenDaysAgoDate.setDate(fourteenDaysAgoDate.getDate() - 13)
  const fourteenDaysAgoEST = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(fourteenDaysAgoDate)

  // ── Fetch all firms ───────────────────────────────────────────────────────
  const { data: firms } = await supabase
    .from('firms')
    .select('id, name, slug, meta_account_id, case_value, meta_campaign_filter, phase_initial_max_weekly_spend, phase_scale_max_weekly_spend')
    .order('name')

  if (!firms?.length) {
    return NextResponse.json({ ok: true, message: 'No firms found' })
  }

  // ── Exclude Eisenberg and MCA ─────────────────────────────────────────────
  const activeFirms = firms.filter(f => {
    const key = (f.name + ' ' + f.slug).toLowerCase()
    return !key.includes('eisenberg') && !key.includes('mca')
  })

  // ── Build per-firm blocks in parallel ────────────────────────────────────
  const firmBlocks = await Promise.all(activeFirms.map(async (firm) => {
    if (!firm.meta_account_id) return null

    const accountId = firm.meta_account_id

    // Firm identifier: used to match pipe-segment in ad names (e.g. "LHP", "MCA", "THL")
    // Uses meta_campaign_filter if set, otherwise uppercased slug
    const firmTag = (firm.meta_campaign_filter || firm.slug || '').trim().toUpperCase()

    // Check if an ad belongs to this firm by looking for an exact pipe-segment match
    function adBelongsToFirm(adName: string): boolean {
      if (!firmTag) return true
      const parts = (adName || '').split('|').map(p => p.trim().toUpperCase())
      return parts.includes(firmTag)
    }

    // Get latest invoice for this firm
    const { data: latestInv } = await supabase
      .from('firm_invoices')
      .select('id, code, title, period_start, period_end')
      .eq('firm_id', firm.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    // All data fetches in parallel
    const [
      todayAdMeta,
      lifetimeAdMeta,
      invPeriodAdMeta,
      signedTodayRes,
      signed7dRes,
      signed3hRes,
      signedPrevWeekRes,
      invLeadsRes,
    ] = await Promise.all([
      // Today's ad-level data (all ads in account — will filter by firmTag below)
      fetchMeta(`/${accountId}/insights`, {
        fields:      'ad_id,ad_name,adset_name,campaign_name,spend,actions',
        date_preset: 'today',
        level:       'ad',
        limit:       '300',
      }),
      // Lifetime ad-level data — used for alert level (Kill/Watch/Scale)
      fetchMeta(`/${accountId}/insights`, {
        fields:      'ad_id,ad_name,spend,actions',
        date_preset: 'maximum',
        level:       'ad',
        limit:       '500',
      }),
      // Invoice period ad-level data for spend calculation
      latestInv
        ? fetchMeta(`/${accountId}/insights`, {
            fields:     'ad_name,spend',
            time_range: JSON.stringify({ since: latestInv.period_start, until: latestInv.period_end }),
            level:      'ad',
            limit:      '300',
          })
        : Promise.resolve({ data: [] }),
      // Today's signed cases
      supabase
        .from('ghl_leads')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
        .gte('qualified_at', `${todayEST}T00:00:00Z`),
      // Last 7 days signed cases
      supabase
        .from('ghl_leads')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
        .gte('qualified_at', `${sevenDaysAgoEST}T00:00:00Z`),
      // Cases in last 3 hours (delta since last notification)
      supabase
        .from('ghl_leads')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
        .gte('qualified_at', threeHoursAgoISO),
      // Previous 7-day period (14–7 days ago) for week-over-week
      supabase
        .from('ghl_leads')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', firm.id)
        .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
        .gte('qualified_at', `${fourteenDaysAgoEST}T00:00:00Z`)
        .lt('qualified_at', `${sevenDaysAgoEST}T00:00:00Z`),
      // Current invoice cases (signed + replacements)
      latestInv
        ? supabase
            .from('ghl_leads')
            .select('case_status')
            .eq('firm_id', firm.id)
            .eq('invoice_code', latestInv.code)
        : Promise.resolve({ data: [] }),
    ])

    // ── Filter today's ads to this firm only ──────────────────────────────
    const firmAdsToday = (todayAdMeta.data || []).filter((a: any) =>
      adBelongsToFirm(a.ad_name || '')
    )

    // ── Today's Meta stats (from firm-specific ads) ───────────────────────
    const todaySpend = firmAdsToday.reduce((sum: number, a: any) => sum + parseFloat(a.spend || '0'), 0)
    const todayLeads = firmAdsToday.reduce((sum: number, a: any) => sum + getLeads(a.actions), 0)
    const todayCpl   = todayLeads > 0 ? todaySpend / todayLeads : null

    // ── Signed case counts ────────────────────────────────────────────────
    const casesToday   = signedTodayRes.count ?? 0
    const cases7d      = signed7dRes.count ?? 0
    const cases3h      = signed3hRes.count ?? 0
    const casesPrevWk  = signedPrevWeekRes.count ?? 0

    const todayComp = cases3h > 0 ? ` (+${cases3h} last 3h)` : ' (none last 3h)'
    const wkDiff    = cases7d - casesPrevWk
    const wkComp    = wkDiff > 0 ? ` (+${wkDiff} vs prev wk)` : wkDiff < 0 ? ` (${wkDiff} vs prev wk)` : ' (same as prev wk)'

    // ── Invoice stats ─────────────────────────────────────────────────────
    let invBlock = ''
    if (latestInv) {
      const allLeads    = invLeadsRes.data || []
      const invSigned   = allLeads.filter((l: any) => (l.case_status || '').toLowerCase() !== 'replacement').length
      const invRepl     = allLeads.filter((l: any) => (l.case_status || '').toLowerCase() === 'replacement').length
      // Sum spend only from this firm's ads during the invoice period
      const invSpend    = (invPeriodAdMeta.data || [])
        .filter((a: any) => adBelongsToFirm(a.ad_name || ''))
        .reduce((sum: number, a: any) => sum + parseFloat(a.spend || '0'), 0)
      const invCpq      = invSigned > 0 ? invSpend / invSigned : null

      // Pace: cases / days elapsed
      const startDate     = new Date(latestInv.period_start + 'T00:00:00Z')
      const endDate       = new Date(latestInv.period_end   + 'T00:00:00Z')
      const totalDays     = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
      const daysElapsed   = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / 86400000))
      const daysRemaining = Math.max(0, totalDays - daysElapsed)
      const pace          = daysElapsed > 0 ? invSigned / daysElapsed : 0
      const projMonth     = Math.round(pace * 30)

      const invTitle = latestInv.title ? ` (${latestInv.title})` : ''
      invBlock = [
        `\n*Invoice Progress*`,
        `• *${latestInv.code}*${invTitle} · ${invSigned} signed${invRepl > 0 ? ` + ${invRepl} repl` : ''} · Pace: ${pace.toFixed(1)}/day → projected ${projMonth}/month`,
        `• ${daysRemaining} days remaining${invCpq ? ` · CPQ: ${fmt$(invCpq)}` : ''}`,
      ].join('\n')
    }

    // ── Lifetime lookup map (ad_id → lifetime stats) ─────────────────────
    const lifetimeMap = new Map<string, { spend: number; leads: number }>()
    for (const a of (lifetimeAdMeta.data || [])) {
      if (adBelongsToFirm(a.ad_name || '')) {
        lifetimeMap.set(a.ad_id, {
          spend: parseFloat(a.spend || '0'),
          leads: getLeads(a.actions),
        })
      }
    }

    // ── Active creatives (firm-specific, spend > 0) ───────────────────────
    let adsToday = firmAdsToday.filter((a: any) => parseFloat(a.spend || '0') > 0)

    adsToday = sortCreativesOldToNew(adsToday, todayEST)

    const creativeLines = adsToday.map((ad: any) => {
      const todSpend  = parseFloat(ad.spend || '0')
      const todLeads  = getLeads(ad.actions)
      // Alert level uses lifetime stats since launch
      const lt        = lifetimeMap.get(ad.ad_id) ?? { spend: todSpend, leads: todLeads }
      const ltCpl     = lt.leads > 0 ? lt.spend / lt.leads : null
      const level     = alertLevel(lt.spend, lt.leads, ltCpl, null, 0)
      const emoji     = ALERT_EMOJI[level] || '⚪'
      const label     = ALERT_LABEL[level] || level.toUpperCase()
      const age       = creativeAge(ad.ad_name || '', todayEST)
      const dayTag    = age != null ? ` · DAY ${age}` : ''
      return `${emoji} ${label} · ${ad.ad_name || ad.ad_id} · ${fmt$(todSpend)} today · ${todLeads} lead${todLeads !== 1 ? 's' : ''}${dayTag}`
    })

    const creativesBlock = adsToday.length > 0
      ? `\n*Total Active Creatives (Old → New)*\n` + creativeLines.join('\n')
      : ''

    // ── Invoice period case summary for Cases line ────────────────────────
    let periodStr = ''
    if (latestInv) {
      const allLeads  = invLeadsRes.data || []
      const invSigned = allLeads.filter((l: any) => (l.case_status || '').toLowerCase() !== 'replacement').length
      const invRepl   = allLeads.filter((l: any) => (l.case_status || '').toLowerCase() === 'replacement').length
      const invSpend  = (invPeriodAdMeta.data || [])
        .filter((a: any) => adBelongsToFirm(a.ad_name || ''))
        .reduce((sum: number, a: any) => sum + parseFloat(a.spend || '0'), 0)
      const invCpq    = invSigned > 0 ? invSpend / invSigned : null
      periodStr = ` · Period: ${invSigned} signed${invRepl > 0 ? ` + ${invRepl} repl` : ''}${invCpq ? ` · CPQ: ${fmt$(invCpq)}` : ''}`
    }

    return [
      `\n⭐ *${firm.name}* ⭐`,
      `*Meta Today* · Spend: ${fmt$(todaySpend)} · Leads: ${todayLeads} · CPL: ${todayCpl ? fmt$(todayCpl) : '—'}`,
      `*Cases* · Today: ${casesToday}${todayComp} · Last 7 days: ${cases7d}${wkComp}${periodStr}`,
      invBlock,
      creativesBlock,
    ].filter(Boolean).join('\n')
  }))

  // ── Assemble full message ─────────────────────────────────────────────────
  const blocks = firmBlocks.filter(Boolean) as string[]
  const header = `*${timeLabel} EST | Health Check*`
  const divider = '\n' + '─'.repeat(40)
  const message = [header, ...blocks].join(divider + '\n')

  // ── Send to Slack ─────────────────────────────────────────────────────────
  const slackRes = await fetch(SLACK_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text: message }),
  })

  return NextResponse.json({
    ok:        slackRes.ok,
    firms:     blocks.length,
    sentAt:    now.toISOString(),
  })
}
