import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const META_TOKEN    = process.env.META_ACCESS_TOKEN!
const CRON_SECRET   = process.env.CRON_SECRET!
const BASE          = 'https://graph.facebook.com/v25.0'
const SLACK_WEBHOOK = process.env.SLACK_CPL_CPQ_WEBHOOK!

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
  return parseInt(
    actions.find(a =>
      a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead'
    )?.value || '0'
  )
}

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

// ─── Issue detection ──────────────────────────────────────────────────────────

// CPL is increasing: 7-day CPL is >15% above all-time average
function isCplIssue(weekCpl: number | null, maxCpl: number | null, weekLeads: number): boolean {
  if (weekCpl == null || maxCpl == null || maxCpl === 0) return false
  if (weekLeads < 3) return false // not enough data
  return weekCpl > maxCpl * 1.15
}

// CPQ is too high: 7-day CPQ is >15% above all-time average OR above firm target
function isCpqIssue(
  weekCpq: number | null,
  maxCpq: number | null,
  targetCpq: number | null,
  weekCases: number
): boolean {
  if (weekCpq == null || weekCases < 1) return false
  if (targetCpq != null && weekCpq > targetCpq) return true
  if (maxCpq != null && maxCpq > 0 && weekCpq > maxCpq * 1.15) return true
  return false
}

// Lead volume declining: last 4-day block has >25% fewer leads than prior 4-day block
function isLeadVolumeIssue(recentLeads: number, priorLeads: number): boolean {
  if (priorLeads < 3) return false // prior period too thin to compare
  return recentLeads < priorLeads * 0.75
}

// ─── Main GET handler ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Time label in EST
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const timeLabel = estFormatter.format(now).replace(' at ', ' · ')

  // EST date strings
  const toESTDate = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)

  const todayEST = toESTDate(now)

  const d7 = new Date(now); d7.setDate(d7.getDate() - 6)
  const sevenDaysAgoEST = toESTDate(d7)

  // Recent 4-day block: today back to 3 days ago (days 0–3)
  const d4r = new Date(now); d4r.setDate(d4r.getDate() - 3)
  const recent4StartEST = toESTDate(d4r)

  // Prior 4-day block: days 4–7 ago
  const d4pEnd = new Date(now); d4pEnd.setDate(d4pEnd.getDate() - 4)
  const d4pStart = new Date(now); d4pStart.setDate(d4pStart.getDate() - 7)
  const prior4StartEST = toESTDate(d4pStart)
  const prior4EndEST   = toESTDate(d4pEnd)

  // ── Fetch all firms ───────────────────────────────────────────────────────
  const { data: firms } = await supabase
    .from('firms')
    .select('id, name, slug, meta_account_id, meta_campaign_filter')
    .order('name')

  if (!firms?.length) {
    return NextResponse.json({ ok: true, message: 'No firms found' })
  }

  const activeFirms = firms.filter(f => f.meta_account_id)

  // Collect all issue lines across firms, grouped by firm
  const firmSections: string[] = []
  let totalIssues = 0

  await Promise.all(activeFirms.map(async (firm) => {
    const accountId = firm.meta_account_id!
    const firmTag = (firm.meta_campaign_filter || firm.slug || '').trim().toUpperCase()

    function adBelongsToFirm(adName: string): boolean {
      if (!firmTag) return true
      const parts = (adName || '').split('|').map(p => p.trim().toUpperCase())
      return parts.includes(firmTag)
    }

    // Fetch Meta data: all-time, last 7d, recent 4d, prior 4d
    const [maxMeta, week7dMeta, recent4dMeta, prior4dMeta] = await Promise.all([
      fetchMeta(`/${accountId}/insights`, {
        fields:      'ad_id,ad_name,spend,actions',
        date_preset: 'maximum',
        level:       'ad',
        limit:       '500',
      }),
      fetchMeta(`/${accountId}/insights`, {
        fields:      'ad_id,ad_name,spend,actions',
        time_range:  JSON.stringify({ since: sevenDaysAgoEST, until: todayEST }),
        level:       'ad',
        limit:       '300',
      }),
      fetchMeta(`/${accountId}/insights`, {
        fields:      'ad_id,ad_name,spend,actions',
        time_range:  JSON.stringify({ since: recent4StartEST, until: todayEST }),
        level:       'ad',
        limit:       '300',
      }),
      fetchMeta(`/${accountId}/insights`, {
        fields:      'ad_id,ad_name,spend,actions',
        time_range:  JSON.stringify({ since: prior4StartEST, until: prior4EndEST }),
        level:       'ad',
        limit:       '300',
      }),
    ])

    type AdStats = { adName: string; spend: number; leads: number }

    function buildMap(data: any[]): Map<string, AdStats> {
      const map = new Map<string, AdStats>()
      for (const a of data) {
        if (!adBelongsToFirm(a.ad_name || '')) continue
        map.set(a.ad_id, {
          adName: a.ad_name || a.ad_id,
          spend:  parseFloat(a.spend || '0'),
          leads:  getLeads(a.actions),
        })
      }
      return map
    }

    const maxMap     = buildMap(maxMeta.data || [])
    const week7dMap  = buildMap(week7dMeta.data || [])
    const recent4dMap = buildMap(recent4dMeta.data || [])
    const prior4dMap  = buildMap(prior4dMeta.data || [])

    // Fetch signed cases per ad_id for this firm: 7-day and all-time
    const [signed7dRes, signedMaxRes] = await Promise.all([
      supabase
        .from('ghl_leads')
        .select('ad_id')
        .eq('firm_id', firm.id)
        .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed')
        .gte('qualified_at', `${sevenDaysAgoEST}T00:00:00Z`),
      supabase
        .from('ghl_leads')
        .select('ad_id')
        .eq('firm_id', firm.id)
        .or('case_status.is.null,case_status.eq.e_signed,case_status.eq.closed'),
    ])

    const cases7dByAd = new Map<string, number>()
    for (const row of (signed7dRes.data || [])) {
      if (row.ad_id) cases7dByAd.set(row.ad_id, (cases7dByAd.get(row.ad_id) || 0) + 1)
    }

    const casesMaxByAd = new Map<string, number>()
    for (const row of (signedMaxRes.data || [])) {
      if (row.ad_id) casesMaxByAd.set(row.ad_id, (casesMaxByAd.get(row.ad_id) || 0) + 1)
    }

    // ── Evaluate each ad with 7-day spend ────────────────────────────────
    const issueLines: string[] = []

    for (const [adId, week] of week7dMap.entries()) {
      if (week.spend < 200) continue // skip very low spend ads

      const max      = maxMap.get(adId)
      const recent4d = recent4dMap.get(adId)
      const prior4d  = prior4dMap.get(adId)

      const weekCpl = week.leads > 0 ? week.spend / week.leads : null
      const maxCpl  = max && max.leads > 0 ? max.spend / max.leads : null

      const weekCases = cases7dByAd.get(adId) || 0
      const maxCases  = casesMaxByAd.get(adId) || 0
      const weekCpq   = weekCases > 0 ? week.spend / weekCases : null
      const maxCpq    = maxCases > 0 && max ? max.spend / maxCases : null
      const targetCpq = firm.target_cpq ?? null

      const recentLeads = recent4d?.leads ?? 0
      const priorLeads  = prior4d?.leads ?? 0

      const cplIssue    = isCplIssue(weekCpl, maxCpl, week.leads)
      const cpqIssue    = isCpqIssue(weekCpq, maxCpq, targetCpq, weekCases)
      const volumeIssue = isLeadVolumeIssue(recentLeads, priorLeads)

      if (!cplIssue && !cpqIssue && !volumeIssue) continue

      // Standard metrics (always shown)
      const cplDisplay  = weekCpl  != null ? fmt$(weekCpl)  : '—'
      const cpqDisplay  = weekCpq  != null ? fmt$(weekCpq)  : '—'
      const maxCplDisplay = maxCpl != null ? fmt$(maxCpl)   : '—'
      const maxCpqDisplay = maxCpq != null ? fmt$(maxCpq)   : '—'

      // Issue reasons
      const issues: string[] = []

      if (cplIssue && weekCpl != null && maxCpl != null) {
        const pct = Math.round(((weekCpl - maxCpl) / maxCpl) * 100)
        issues.push(`⚠️ *CPL is rising* — ${fmt$(weekCpl)} this week vs ${fmt$(maxCpl)} all-time avg (+${pct}%), cost per lead is trending up`)
      }

      if (cpqIssue && weekCpq != null) {
        if (targetCpq != null && weekCpq > targetCpq) {
          issues.push(`⚠️ *CPQ above target* — ${fmt$(weekCpq)} this week vs target ${fmt$(targetCpq)}, spend per signed case is too high`)
        } else if (maxCpq != null) {
          const pct = Math.round(((weekCpq - maxCpq) / maxCpq) * 100)
          issues.push(`⚠️ *CPQ is rising* — ${fmt$(weekCpq)} this week vs ${fmt$(maxCpq)} all-time avg (+${pct}%), fewer cases relative to spend`)
        }
      }

      if (volumeIssue) {
        const drop = Math.round(((priorLeads - recentLeads) / priorLeads) * 100)
        issues.push(`⚠️ *Lead volume dropping* — ${recentLeads} leads last 4d vs ${priorLeads} prior 4d (−${drop}%), creative may be fatiguing`)
      }

      issueLines.push([
        `• *${week.adName}*`,
        `  CPL: ${cplDisplay} (7d) vs ${maxCplDisplay} avg  |  CPQ: ${cpqDisplay} (7d) vs ${maxCpqDisplay} avg  |  Spend 7d: ${fmt$(week.spend)} · Leads: ${week.leads} · Signed: ${weekCases}`,
        ...issues.map(i => `  ${i}`),
      ].join('\n'))
    }

    if (issueLines.length > 0) {
      totalIssues += issueLines.length
      firmSections.push(
        `\n*${firm.name}* — ${issueLines.length} issue creative${issueLines.length !== 1 ? 's' : ''}\n` +
        issueLines.join('\n\n')
      )
    }
  }))

  // ── Assemble and send Slack message ──────────────────────────────────────
  let message: string

  if (totalIssues === 0) {
    message = `*${timeLabel} ET | CPL & CPQ Monitor*\n✅ All creatives within normal range — no issues detected.`
  } else {
    const header    = `*${timeLabel} ET | CPL & CPQ Monitor* — ⚠️ ${totalIssues} Issue Creative${totalIssues !== 1 ? 's' : ''}`
    const subheader = `_Flagged if: 7d CPL/CPQ >15% above all-time avg · lead volume down >25% last 4d vs prior 4d_`
    const divider   = '\n' + '─'.repeat(40)
    message = [header, subheader, ...firmSections].join(divider)
  }

  const slackRes = await fetch(SLACK_WEBHOOK, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text: message }),
  })

  return NextResponse.json({
    ok:         slackRes.ok,
    totalIssues,
    sentAt:     now.toISOString(),
  })
}
