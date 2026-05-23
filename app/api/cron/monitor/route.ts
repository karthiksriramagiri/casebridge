import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const SLACK_WEBHOOK_BRIEFINGS = process.env.SLACK_WEBHOOK_URL!
const SLACK_WEBHOOK_CHECKS = process.env.SLACK_WEBHOOK_CHECKS!
const CRON_SECRET = process.env.CRON_SECRET
const META_TOKEN = process.env.META_ACCESS_TOKEN!
const META_BASE = 'https://graph.facebook.com/v25.0'
const TIMEZONE = 'America/New_York'
const FIRM_SLUG = 'lhp'

// ─────────────────────────────────────────────────────────────────────────────
// LAUNCH CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const LAUNCH_DATE = '2026-04-23'
const EARLIEST_GRADUATION = '2026-04-30'
const CAMPAIGN_NAME = 'CA | Leads | FS | ABO | 20260423'
const TOTAL_DAILY_BUDGET = 800

type Phase = 'early_learning' | 'watch' | 'candidate_emerging' | 'graduation_eligible'

type CheckType = 'morning' | 'evening' | 'check'
function isValidType(t: string | null): t is CheckType {
  return t === 'morning' || t === 'evening' || t === 'check'
}

// ─────────────────────────────────────────────────────────────────────────────
// META HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function fetchMeta(path: string, params: Record<string, string> = {}) {
  if (!META_TOKEN) return { data: [] }
  const url = new URL(`${META_BASE}${path}`)
  url.searchParams.set('access_token', META_TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  try {
    const res = await fetch(url.toString(), { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || json?.error) { console.warn('Meta error:', json?.error?.message); return { data: [] } }
    return json
  } catch { return { data: [] } }
}

function getLeads(actions: Array<{ action_type: string; value: string }> = []) {
  return parseInt(
    actions?.find(a =>
      a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead'
    )?.value || '0'
  )
}

function round2(n: number) { return Math.round(n * 100) / 100 }

// ─────────────────────────────────────────────────────────────────────────────
// PHASE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────
function computePhase(daysSinceLaunch: number): Phase {
  if (daysSinceLaunch <= 1) return 'early_learning'
  if (daysSinceLaunch <= 4) return 'watch'
  if (daysSinceLaunch <= 6) return 'candidate_emerging'
  return 'graduation_eligible'
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface CreativeStats {
  adId: string
  adName: string
  adsetName: string
  spendToday: number
  leadsToday: number
  ctrToday: number
  cpcToday: number
  cplToday: number | null
  clicksToday: number
  clickToLeadPctToday: number | null
  spendSinceLaunch: number
  leadsSinceLaunch: number
  cplSinceLaunch: number | null
  frequency: number
  spendShare: number
  peakCtr: number
  ctrDropFromPeak: number
  consecutiveCtrCplDrop: number
  consecutiveCpcFallCplRise: number
}

interface AdsetStats {
  adsetName: string
  adsetId: string
  totalSpend: number
  totalLeads: number
  spendToday: number
  leadsToday: number
  frequency: number
  ctr: number
}

interface AdsetGroup {
  adsetName: string
  adsetId: string
  creatives: CreativeStats[]
  adsetStats: AdsetStats | null
  totalSpend: number
  totalLeads: number
  spendToday: number
  leadsToday: number
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA GATHERING
// ─────────────────────────────────────────────────────────────────────────────
async function gatherData() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const week7Start = new Date(now.getTime() - 6 * 86400000).toISOString().split('T')[0]
  const estHour = parseInt(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: TIMEZONE }).format(now)
  )

  const launchMs = new Date(LAUNCH_DATE + 'T05:00:00Z').getTime()
  const daysSinceLaunch = Math.floor((now.getTime() - launchMs) / 86400000)
  const phase = computePhase(daysSinceLaunch)

  const { data: firm } = await supabase
    .from('firms')
    .select('id, name, meta_account_id, meta_campaign_filter, replacement_window_days, case_value, phase_initial_max_weekly_spend, phase_scale_max_weekly_spend')
    .eq('slug', FIRM_SLUG)
    .single()
  if (!firm) return null

  const { data: invoices } = await supabase
    .from('firm_invoices')
    .select('id, code, title, period_start, period_end, sort_order, payment_received')
    .eq('firm_id', firm.id)
    .order('sort_order', { ascending: false })
    .limit(1)
  const invoice = invoices?.[0] ?? null

  let caseStats = { today: 0, thisWeek: 0, thisPeriod: 0, replacements: 0 }
  let upcomingExpirations: Array<{ name: string; phone: string | null; expiresAt: string; daysLeft: number }> = []
  let invoiceProgress: Record<string, unknown> | null = null
  const week7StartDate = new Date(now.getTime() - 6 * 86400000).toISOString()

  if (invoice) {
    const { data: allCases } = await supabase
      .from('ghl_leads')
      .select('id, contact_name, contact_phone, case_status, qualified_at, created_at, ad_id, ad_name, closer')
      .eq('firm_id', firm.id)
      .eq('invoice_code', invoice.code)

    const allPeriodCases = allCases ?? []
    caseStats.today = allPeriodCases.filter(c => (c.qualified_at ?? c.created_at).startsWith(today)).length
    caseStats.thisWeek = allPeriodCases.filter(c => (c.qualified_at ?? c.created_at) >= week7StartDate).length
    caseStats.thisPeriod = allPeriodCases.filter(c => (c.case_status || '').toLowerCase() !== 'replacement').length
    caseStats.replacements = allPeriodCases.filter(c => (c.case_status || '').toLowerCase() === 'replacement').length

    const windowMs = (firm.replacement_window_days ?? 28) * 86400000
    upcomingExpirations = allPeriodCases
      .filter(c => (c.case_status || '').toLowerCase() !== 'replacement')
      .map(c => {
        const ref = new Date(c.qualified_at ?? c.created_at)
        const expiresAt = new Date(ref.getTime() + windowMs)
        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)
        return { name: c.contact_name ?? 'Unknown', phone: c.contact_phone ?? null, expiresAt: expiresAt.toISOString().split('T')[0], daysLeft }
      })
      .filter(c => c.daysLeft <= 5 && c.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)

    const deliveryDays = 30
    const start = new Date(invoice.period_start)
    const deadline = new Date(start.getTime() + deliveryDays * 86400000)
    const elapsedDays = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / 86400000))
    const remainingDays = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86400000))
    const pctElapsed = Math.min(100, Math.round((elapsedDays / deliveryDays) * 100))
    const dailyPace = caseStats.thisPeriod / elapsedDays
    const projectedTotal = Math.round(dailyPace * deliveryDays)
    const contractCases = invoice.payment_received && firm.case_value
      ? Math.round(invoice.payment_received / firm.case_value)
      : null
    const onPaceForContract = contractCases ? projectedTotal >= contractCases : null

    invoiceProgress = {
      code: invoice.code,
      title: invoice.title,
      periodStart: invoice.period_start,
      deliveryDeadline: deadline.toISOString().split('T')[0],
      deliveryWindowDays: deliveryDays,
      elapsedDays,
      remainingDays,
      pctElapsed,
      paymentReceived: invoice.payment_received,
      casesThisPeriod: caseStats.thisPeriod,
      dailyPace: round2(dailyPace),
      projectedTotalAtCurrentPace: projectedTotal,
      contractTargetCases: contractCases,
      onPaceForContract,
      casesNeededPerDayToHitTarget: contractCases && remainingDays > 0
        ? round2((contractCases - caseStats.thisPeriod) / remainingDays)
        : null,
    }
  }

  // ── Meta: dynamic adset discovery ─────────────────────────────────────────
  const adsetGroups: Record<string, AdsetGroup> = {}

  if (firm.meta_account_id) {
    const acct = `/${firm.meta_account_id}/insights`
    const filter = (firm.meta_campaign_filter || '').trim().toLowerCase()

    const adFieldsFull = 'spend,impressions,clicks,ctr,cpc,actions,ad_name,adset_name,campaign_name,ad_id,adset_id,frequency'
    const adFieldsToday = 'spend,impressions,clicks,ctr,cpc,actions,ad_name,adset_name,ad_id,adset_id'
    const adFieldsTrend = 'spend,actions,ctr,cpc,clicks,ad_id,ad_name,adset_name'
    const adsetFields = 'spend,actions,impressions,adset_name,adset_id,frequency,ctr'

    const [sinceLaunchRes, todayRes, trendRes, adsetRes, adsetTodayRes] = await Promise.all([
      fetchMeta(acct, {
        fields: adFieldsFull,
        time_range: JSON.stringify({ since: LAUNCH_DATE, until: today }),
        level: 'ad',
        limit: '500',
      }),
      fetchMeta(acct, {
        fields: adFieldsToday,
        date_preset: 'today',
        level: 'ad',
        limit: '500',
      }),
      fetchMeta(acct, {
        fields: adFieldsTrend,
        time_range: JSON.stringify({ since: week7Start, until: today }),
        time_increment: '1',
        level: 'ad',
        limit: '1000',
      }),
      fetchMeta(acct, {
        fields: adsetFields,
        time_range: JSON.stringify({ since: LAUNCH_DATE, until: today }),
        level: 'adset',
      }),
      fetchMeta(acct, {
        fields: adsetFields,
        date_preset: 'today',
        level: 'adset',
      }),
    ])

    function filterRows(rows: Array<Record<string, unknown>>) {
      if (!filter) return rows
      return rows.filter(a =>
        (a.campaign_name as string ?? '').toLowerCase().includes(filter) ||
        (a.adset_name as string ?? '').toLowerCase().includes(filter)
      )
    }

    const sinceLaunchRows = filterRows(sinceLaunchRes.data ?? [])
    const todayRows = filterRows(todayRes.data ?? [])
    const trendRows = filterRows(trendRes.data ?? [])
    const adsetRows = filterRows(adsetRes.data ?? [])
    const adsetTodayRows = filterRows(adsetTodayRes.data ?? [])

    const activeAdsetNames = new Set(
      adsetTodayRows
        .filter(r => parseFloat((r.spend as string) ?? '0') > 0)
        .map(r => (r.adset_name as string) ?? '')
        .filter(Boolean)
    )

    for (const row of adsetRows) {
      const name = (row.adset_name as string) ?? ''
      if (!name) continue
      if (activeAdsetNames.size > 0 && !activeAdsetNames.has(name)) continue
      const spend = parseFloat((row.spend as string) ?? '0')
      const leads = getLeads(row.actions as Array<{ action_type: string; value: string }> ?? [])
      const freq = parseFloat((row.frequency as string) ?? '0')
      const ctr = parseFloat((row.ctr as string) ?? '0')
      const adsetId = (row.adset_id as string) ?? ''
      const todayAdsetRow = adsetTodayRows.find(r => (r.adset_name as string) === name)
      const spendToday = todayAdsetRow ? round2(parseFloat((todayAdsetRow.spend as string) ?? '0')) : 0
      const leadsToday = todayAdsetRow ? getLeads(todayAdsetRow.actions as Array<{ action_type: string; value: string }> ?? []) : 0

      const stats: AdsetStats = { adsetName: name, adsetId, totalSpend: round2(spend), totalLeads: leads, spendToday, leadsToday, frequency: round2(freq), ctr: round2(ctr) }
      adsetGroups[name] = { adsetName: name, adsetId, creatives: [], adsetStats: stats, totalSpend: round2(spend), totalLeads: leads, spendToday, leadsToday }
    }

    // ── Trend maps ─────────────────────────────────────────────────────────
    const trendByAd: Record<string, Array<{ date: string; ctr: number; cpl: number | null; cpc: number }>> = {}
    for (const row of trendRows) {
      const id = (row.ad_id as string)
      if (!trendByAd[id]) trendByAd[id] = []
      const spend = parseFloat((row.spend as string) ?? '0')
      const leads = getLeads(row.actions as Array<{ action_type: string; value: string }> ?? [])
      const ctr = parseFloat((row.ctr as string) ?? '0')
      const cpc = parseFloat((row.cpc as string) ?? '0')
      const cpl = leads > 0 ? spend / leads : null
      trendByAd[id].push({ date: (row.date_start as string) ?? '', ctr, cpl, cpc })
    }
    for (const id of Object.keys(trendByAd)) {
      trendByAd[id].sort((a, b) => a.date.localeCompare(b.date))
    }

    function countConsecutiveCtrCplDrop(days: Array<{ ctr: number; cpl: number | null }>): number {
      let count = 0
      for (let i = days.length - 1; i >= 1; i--) {
        const prev = days[i - 1], curr = days[i]
        if (curr.cpl === null || prev.cpl === null) break
        if (curr.ctr < prev.ctr && curr.cpl < prev.cpl) { count++ } else { break }
      }
      return count
    }

    // CPC keeps falling while CPL rises consecutive days
    function countConsecutiveCpcFallCplRise(days: Array<{ cpc: number; cpl: number | null }>): number {
      let count = 0
      for (let i = days.length - 1; i >= 1; i--) {
        const prev = days[i - 1], curr = days[i]
        if (curr.cpl === null || prev.cpl === null) break
        if (curr.cpc < prev.cpc && curr.cpl > prev.cpl) { count++ } else { break }
      }
      return count
    }

    // ── Since-launch map ───────────────────────────────────────────────────
    const sinceLaunchMap: Record<string, {
      adId: string; adName: string; adsetName: string
      spend: number; leads: number; ctr: number; frequency: number
    }> = {}
    for (const row of sinceLaunchRows) {
      const id = (row.ad_id as string)
      if (!sinceLaunchMap[id]) {
        sinceLaunchMap[id] = { adId: id, adName: (row.ad_name as string) ?? '', adsetName: (row.adset_name as string) ?? '', spend: 0, leads: 0, ctr: 0, frequency: 0 }
      }
      sinceLaunchMap[id].spend += parseFloat((row.spend as string) ?? '0')
      sinceLaunchMap[id].leads += getLeads(row.actions as Array<{ action_type: string; value: string }> ?? [])
      sinceLaunchMap[id].ctr = parseFloat((row.ctr as string) ?? '0')
      sinceLaunchMap[id].frequency = parseFloat((row.frequency as string) ?? '0')
    }

    // ── Today map ─────────────────────────────────────────────────────────
    const todayMap: Record<string, { spend: number; leads: number; ctr: number; cpc: number; clicks: number }> = {}
    for (const row of todayRows) {
      const id = (row.ad_id as string)
      if (!todayMap[id]) todayMap[id] = { spend: 0, leads: 0, ctr: 0, cpc: 0, clicks: 0 }
      todayMap[id].spend += parseFloat((row.spend as string) ?? '0')
      todayMap[id].leads += getLeads(row.actions as Array<{ action_type: string; value: string }> ?? [])
      todayMap[id].ctr = parseFloat((row.ctr as string) ?? '0')
      todayMap[id].cpc = parseFloat((row.cpc as string) ?? '0')
      todayMap[id].clicks += parseInt((row.clicks as string) ?? '0', 10)
    }

    // ── Assign creatives to adset groups ──────────────────────────────────
    for (const c of Object.values(sinceLaunchMap)) {
      const adsetName = c.adsetName
      if (activeAdsetNames.size > 0 && !activeAdsetNames.has(adsetName)) continue
      if (!adsetGroups[adsetName]) {
        adsetGroups[adsetName] = { adsetName, adsetId: '', creatives: [], adsetStats: null, totalSpend: 0, totalLeads: 0, spendToday: 0, leadsToday: 0 }
      }
      const todayData = todayMap[c.adId]
      if (!todayData || todayData.spend === 0) continue

      const trend = trendByAd[c.adId] ?? []
      const peakCtr = trend.length > 0 ? Math.max(...trend.map(t => t.ctr)) : todayData.ctr
      const ctrDropFromPeak = peakCtr > 0 ? ((peakCtr - todayData.ctr) / peakCtr) * 100 : 0
      const consecutiveCtrCplDrop = countConsecutiveCtrCplDrop(trend)
      const consecutiveCpcFallCplRise = countConsecutiveCpcFallCplRise(trend)

      const spendToday = round2(todayData.spend)
      const leadsToday = todayData.leads
      const clicksToday = todayData.clicks
      const ctrToday = round2(todayData.ctr)
      const cpcToday = round2(todayData.cpc)
      const cplToday = leadsToday > 0 ? round2(spendToday / leadsToday) : null
      const clickToLeadPctToday = clicksToday > 0 ? round2((leadsToday / clicksToday) * 100) : null

      adsetGroups[adsetName].creatives.push({
        adId: c.adId, adName: c.adName, adsetName,
        spendToday, leadsToday, ctrToday, cpcToday, cplToday,
        clicksToday, clickToLeadPctToday,
        spendSinceLaunch: round2(c.spend),
        leadsSinceLaunch: c.leads,
        cplSinceLaunch: c.leads > 0 ? round2(c.spend / c.leads) : null,
        frequency: round2(c.frequency),
        spendShare: 0,
        peakCtr: round2(peakCtr),
        ctrDropFromPeak: round2(ctrDropFromPeak),
        consecutiveCtrCplDrop,
        consecutiveCpcFallCplRise,
      })
    }

    for (const group of Object.values(adsetGroups)) {
      const totalTodaySpend = group.creatives.reduce((s, c) => s + c.spendToday, 0)
      for (const creative of group.creatives) {
        creative.spendShare = totalTodaySpend > 0 ? round2((creative.spendToday / totalTodaySpend) * 100) : 0
      }
      group.creatives.sort((a, b) => b.spendToday - a.spendToday)
    }
  }

  // ── Workers ───────────────────────────────────────────────────────────────
  const { data: profiles } = await supabase.from('profiles').select('id, name, created_at').eq('role', 'rep')
  const { data: modules } = await supabase.from('modules').select('id, title, is_required').eq('is_active', true)
  const requiredModuleIds = (modules ?? []).filter(m => m.is_required).map(m => m.id as string)

  let workerSummary: Array<{
    name: string; certified: boolean; passedRequired: number
    totalRequired: number; daysSinceActive: number; pendingModules: string[]
  }> = []
  const repIds = (profiles ?? []).map(p => p.id as string)
  if (repIds.length > 0) {
    const { data: attempts } = await supabase
      .from('attempts')
      .select('user_id, module_id, score, passed, is_invalidated, created_at')
      .in('user_id', repIds).eq('is_invalidated', false).order('created_at', { ascending: false })

    workerSummary = (profiles ?? []).map(rep => {
      const repAttempts = (attempts ?? []).filter(a => a.user_id === rep.id)
      const passedIds = new Set(repAttempts.filter(a => a.passed).map(a => a.module_id as string))
      const lastActivity = repAttempts[0]?.created_at ?? rep.created_at
      const daysSinceActive = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / 86400000)
      const certified = requiredModuleIds.length > 0 && requiredModuleIds.every(id => passedIds.has(id))
      const pendingModules = (modules ?? [])
        .filter(m => m.is_required && !passedIds.has(m.id as string))
        .map(m => m.title as string)
      return {
        name: rep.name as string, certified,
        passedRequired: requiredModuleIds.filter(id => passedIds.has(id)).length,
        totalRequired: requiredModuleIds.length, daysSinceActive, pendingModules,
      }
    })
  }

  // ── PRE-COMPUTED ALERTS ───────────────────────────────────────────────────
  const preComputedAlerts: string[] = []

  for (const [adsetName, group] of Object.entries(adsetGroups)) {
    for (const creative of group.creatives) {
      const spendToday = creative.spendToday
      const leadsToday = creative.leadsToday
      const name = creative.adName

      // $400–$600 spend, 0 leads → Kill
      if (spendToday >= 400 && leadsToday === 0) {
        preComputedAlerts.push(`🔴 KILL · ${adsetName} · ${name} · $${Math.round(spendToday)} today · 0 leads`)
      } else if (spendToday >= 150 && leadsToday === 0 && phase !== 'early_learning') {
        preComputedAlerts.push(`🟡 WATCH · ${adsetName} · ${name} · $${Math.round(spendToday)} today · 0 leads`)
      }

      // $750 spend, CPL above $250 → Kill unless CTR/CPC strong
      if (spendToday >= 750 && creative.cplToday !== null && creative.cplToday > 250) {
        preComputedAlerts.push(`🔴 HIGH CPL · ${adsetName} · ${name} · $${Math.round(spendToday)} spent · CPL $${Math.round(creative.cplToday)} · Kill unless CTR/CPC are strong`)
      }

      // $1,000 spend, fewer than 4 leads → Kill or heavily reduce
      if (spendToday >= 1000 && leadsToday < 4) {
        preComputedAlerts.push(`🔴 KILL · ${adsetName} · ${name} · $${Math.round(spendToday)} spent · only ${leadsToday} lead${leadsToday !== 1 ? 's' : ''} · Kill or heavily reduce`)
      }

      // CPC keeps falling while CPL rises (2+ consecutive days) → Kill fast
      if (creative.consecutiveCpcFallCplRise >= 2) {
        preComputedAlerts.push(`🆘 KILL FAST · ${adsetName} · ${name} · CPC falling while CPL rising ${creative.consecutiveCpcFallCplRise} consecutive days — click quality degrading`)
      }

      // CTR + CPL both declining 3+ consecutive days → Kill fast
      if (creative.consecutiveCtrCplDrop >= 3) {
        preComputedAlerts.push(`🆘 KILL FAST · ${adsetName} · ${name} · CTR + CPL both declining ${creative.consecutiveCtrCplDrop} consecutive days — full fatigue`)
      }

      // CTR above 10% but click-to-lead below 0.5% → Kill fast
      if (creative.ctrToday > 10 && creative.clickToLeadPctToday !== null && creative.clickToLeadPctToday < 0.5) {
        preComputedAlerts.push(`🆘 KILL FAST · ${adsetName} · ${name} · CTR ${creative.ctrToday.toFixed(1)}% but click-to-lead ${creative.clickToLeadPctToday.toFixed(2)}% — bot traffic or broken LP`)
      }

      // Click-to-lead under 0.5% → Kill
      if (
        creative.clickToLeadPctToday !== null &&
        creative.clickToLeadPctToday < 0.5 &&
        !(creative.ctrToday > 10) // avoid double-alerting
      ) {
        preComputedAlerts.push(`🔴 KILL · ${adsetName} · ${name} · Click-to-lead ${creative.clickToLeadPctToday.toFixed(2)}% < 0.5%`)
      }

      // Frequency rising
      if (creative.frequency >= 2.5) {
        preComputedAlerts.push(`🟡 FREQUENCY · ${adsetName} · ${name} · Freq ${creative.frequency.toFixed(1)} — prep fresh creative ASAP`)
      }

      // CTR dropping from peak (watch+ phases only)
      if (
        phase !== 'early_learning' && phase !== 'watch' &&
        creative.ctrDropFromPeak >= 25 && creative.leadsSinceLaunch > 0
      ) {
        preComputedAlerts.push(`🟡 CTR DROP · ${adsetName} · ${name} · CTR down ${Math.round(creative.ctrDropFromPeak)}% from peak · Today ${creative.ctrToday.toFixed(2)}%`)
      }
    }

    // Winner candidate
    if (phase !== 'early_learning') {
      const candidate = group.creatives
        .filter(c => c.leadsToday >= 2 && c.ctrToday >= 1.5 && c.cplToday !== null)
        .sort((a, b) => (a.cplToday ?? 999) - (b.cplToday ?? 999))[0]
      if (candidate && candidate.cplToday !== null) {
        preComputedAlerts.push(`🟢 CANDIDATE · ${adsetName} · ${candidate.adName} · CPL $${Math.round(candidate.cplToday)} · ${candidate.leadsToday} leads · CTR ${candidate.ctrToday.toFixed(2)}%`)
      }
    }

    // Adset-level 0-leads
    if (group.spendToday >= 400 && group.leadsToday === 0) {
      preComputedAlerts.push(`🔴 KILL ADSET · ${adsetName} · $${Math.round(group.spendToday)} today · 0 leads`)
    } else if (group.spendToday >= 150 && group.leadsToday === 0 && phase !== 'early_learning') {
      preComputedAlerts.push(`🟡 WATCH · ${adsetName} · $${Math.round(group.spendToday)} today · 0 leads`)
    }

    // Best delivery winner
    const deliveryWinner = group.creatives.find(c => c.spendShare > 70)
    if (deliveryWinner) {
      preComputedAlerts.push(`🔧 BEST DELIVERY · ${adsetName} · ${deliveryWinner.adName} · ${deliveryWinner.spendShare}% of spend · LIB-ID:${deliveryWinner.adId}`)
    }
  }

  // ── Graduation check ──────────────────────────────────────────────────────
  if (phase === 'graduation_eligible') {
    const adsetCpls = Object.entries(adsetGroups)
      .map(([name, group]) => {
        const totalLeads = group.adsetStats?.totalLeads ?? group.creatives.reduce((s, c) => s + c.leadsSinceLaunch, 0)
        const totalSpend = group.adsetStats?.totalSpend ?? group.creatives.reduce((s, c) => s + c.spendSinceLaunch, 0)
        return { name, cpl: totalLeads > 0 ? totalSpend / totalLeads : null, leads: totalLeads, group }
      })
      .filter(a => a.cpl !== null)
      .sort((a, b) => (a.cpl ?? 999) - (b.cpl ?? 999))

    if (adsetCpls.length >= 2) {
      const best = adsetCpls[0]
      const second = adsetCpls[1]
      const runTimePassed = daysSinceLaunch >= 7
      if (best.cpl! < second.cpl! * 0.80) {
        const bestCreative = best.group.creatives.filter(c => c.cplSinceLaunch !== null).sort((a, b) => (a.cplSinceLaunch ?? 999) - (b.cplSinceLaunch ?? 999))[0]
        const winnerCtr = bestCreative?.peakCtr ?? 0
        const winnerFreq = best.group.adsetStats?.frequency ?? 0
        const winnerLeads = best.leads
        if (runTimePassed && winnerLeads >= 10 && winnerCtr >= 1.5 && winnerFreq < 2.5) {
          preComputedAlerts.push(`🔧 GRADUATE · ${best.name} · CPL $${Math.round(best.cpl!)} · ${winnerLeads} leads · CTR ${winnerCtr.toFixed(2)}% · Freq ${winnerFreq.toFixed(1)}`)
          preComputedAlerts.push(`CBO campaign: CA | Leads | FS | CBO | 20260430 · Budget $800/day · Scale 20–30% every 3–5 days only`)
        } else {
          const checks: string[] = []
          if (!runTimePassed) checks.push(`run time < 7 days`)
          if (winnerLeads < 10) checks.push(`leads ${winnerLeads} < 10`)
          if (winnerCtr < 1.5) checks.push(`CTR ${winnerCtr.toFixed(2)}% < 1.5%`)
          if (winnerFreq >= 2.5) checks.push(`freq ${winnerFreq.toFixed(1)} ≥ 2.5`)
          preComputedAlerts.push(`🟡 GRAD CHECK · ${best.name} leading but blocked: ${checks.join(', ')}`)
        }
      } else {
        preComputedAlerts.push(`🟡 GRAD CHECK · No adset has 20%+ CPL advantage — continue running`)
      }
    } else if (adsetCpls.length === 1) {
      preComputedAlerts.push(`🟡 GRAD CHECK · Only ${adsetCpls[0].name} has leads · Need comparison data`)
    }
  }

  return {
    timestamp: now.toISOString(),
    estHour,
    daysSinceLaunch,
    phase,
    launchConfig: { campaign: CAMPAIGN_NAME, launchDate: LAUNCH_DATE, earliestGraduation: EARLIEST_GRADUATION, totalDailyBudget: TOTAL_DAILY_BUDGET },
    firm: { name: firm.name as string, caseValue: firm.case_value, replacementWindowDays: firm.replacement_window_days },
    invoice: invoiceProgress,
    cases: caseStats,
    replacementExpirations: upcomingExpirations,
    adsetGroups,
    preComputedAlerts,
    workers: workerSummary,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECT MESSAGE BUILDER — no AI, just structured alerts
// ─────────────────────────────────────────────────────────────────────────────
function buildDirectMessage(data: NonNullable<Awaited<ReturnType<typeof gatherData>>>, type: CheckType): string {
  const now = new Date()
  const estTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIMEZONE }).format(now)
  const estDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TIMEZONE }).format(now)

  const lines: string[] = []
  const push = (s = '') => lines.push(s)

  const typeLabel = type === 'morning' ? 'Morning Briefing' : type === 'evening' ? 'Evening Recap' : 'Health Check'
  push(`*${estDate} · ${estTime} EST | ${typeLabel}*`)
  push(`Day ${data.daysSinceLaunch} of launch · Phase: ${data.phase.replace(/_/g, ' ')}`)
  push()

  // ── Alerts ────────────────────────────────────────────────────────────────
  const killAlerts = data.preComputedAlerts.filter(a => a.startsWith('🔴') || a.startsWith('🆘'))
  const watchAlerts = data.preComputedAlerts.filter(a => a.startsWith('🟡') || a.startsWith('⚠️'))
  const goodAlerts = data.preComputedAlerts.filter(a => a.startsWith('🟢') || a.startsWith('🔧'))

  if (data.preComputedAlerts.length === 0) {
    push('✅ *No alerts — all clear*')
  } else {
    push(`⚠️ *Alerts — ${data.preComputedAlerts.length} total*`)
    for (const alert of [...killAlerts, ...watchAlerts, ...goodAlerts]) {
      push(`• ${alert}`)
    }
  }
  push()

  // ── Quick Meta stats (today) ───────────────────────────────────────────────
  const groups = Object.values(data.adsetGroups)
  const totalSpendToday = groups.reduce((s, g) => s + g.spendToday, 0)
  const totalLeadsToday = groups.reduce((s, g) => s + g.leadsToday, 0)
  const cplToday = totalLeadsToday > 0 ? Math.round(totalSpendToday / totalLeadsToday) : null
  push(`*Meta Today* · Spend: $${Math.round(totalSpendToday)} · Leads: ${totalLeadsToday} · CPL: ${cplToday != null ? '$' + cplToday : '—'}`)
  push(`*Cases* · Today: ${data.cases.today} · This week: ${data.cases.thisWeek} · Period: ${data.cases.thisPeriod} signed + ${data.cases.replacements} repl`)

  if (type === 'check') return lines.join('\n')

  // ── Adset breakdown (morning/evening only) ────────────────────────────────
  push()
  if (groups.length > 0) {
    push('*Adsets — Today*')
    for (const g of groups) {
      const s = g.adsetStats
      if (!s) continue
      const cpl = s.leadsToday > 0 ? '$' + Math.round(s.spendToday / s.leadsToday) : '—'
      push(`• *${g.adsetName}* · $${Math.round(s.spendToday)} · ${s.leadsToday} leads · CPL ${cpl} · CTR ${s.ctr.toFixed(2)}% · Freq ${s.frequency.toFixed(1)}`)
      const top = g.creatives[0]
      if (top) {
        const topCpl = top.cplToday != null ? ' · CPL $' + Math.round(top.cplToday) : ''
        push(`  ↳ *${top.adName}* · ${top.spendShare}% of spend · ${top.leadsToday} leads${topCpl}`)
        if (top.clickToLeadPctToday != null) push(`     Click→Lead: ${top.clickToLeadPctToday.toFixed(2)}%`)
      }
    }
    push()
  }

  // ── Invoice progress ──────────────────────────────────────────────────────
  if (data.invoice) {
    const inv = data.invoice as any
    push('*Invoice Progress*')
    push(`• *${inv.code}* (${inv.title ?? ''}) · ${inv.casesThisPeriod} cases · Pace: ${inv.dailyPace}/day → projected ${inv.projectedTotalAtCurrentPace}`)
    if (inv.contractTargetCases) {
      const status = inv.onPaceForContract ? '✅ On pace' : '⚠️ Behind pace'
      push(`• Target: ${inv.contractTargetCases} cases · ${status} · ${inv.remainingDays}d remaining`)
    }
    push()
  }

  // ── Replacement expirations ───────────────────────────────────────────────
  if (data.replacementExpirations.length > 0) {
    push('*Replacement Windows Expiring Soon*')
    for (const e of data.replacementExpirations) {
      push(`• ${e.name} · ${e.daysLeft}d left (${e.expiresAt})`)
    }
    push()
  }

  // ── Workers ───────────────────────────────────────────────────────────────
  const uncertified = data.workers.filter(w => !w.certified)
  if (uncertified.length > 0) {
    push('*Workers — Pending Certification*')
    for (const w of uncertified) {
      push(`• ${w.name} · ${w.passedRequired}/${w.totalRequired} required · Pending: ${w.pendingModules.join(', ')}`)
    }
  }

  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// SLACK
// ─────────────────────────────────────────────────────────────────────────────
async function postToSlack(text: string, type: CheckType): Promise<{ status: number; body: string; webhookSet: boolean }> {
  const webhook = type === 'check' ? SLACK_WEBHOOK_CHECKS : SLACK_WEBHOOK_BRIEFINGS
  if (!webhook) throw new Error(`Slack webhook not set for type=${type}`)

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const body = await res.text()
  console.log(`[monitor] Slack post type=${type} status=${res.status} body=${body}`)
  if (!res.ok) throw new Error(`Slack post failed: ${res.status} — ${body}`)
  return { status: res.status, body, webhookSet: !!webhook }
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const secretParam = new URL(request.url).searchParams.get('secret')
  const authorized = !CRON_SECRET || authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const typeParam = new URL(request.url).searchParams.get('type')
  if (!isValidType(typeParam)) return NextResponse.json({ error: 'type must be morning | check | evening' }, { status: 400 })
  const type = typeParam

  try {
    const data = await gatherData()
    if (!data) return NextResponse.json({ error: 'Could not load firm data' }, { status: 500 })

    const message = buildDirectMessage(data, type)
    const slackResult = await postToSlack(message, type)

    return NextResponse.json({
      success: true,
      type,
      firm: FIRM_SLUG,
      daysSinceLaunch: data.daysSinceLaunch,
      phase: data.phase,
      activeAdsets: Object.keys(data.adsetGroups),
      alertsDetected: data.preComputedAlerts.length,
      slack: slackResult,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/monitor] error:', err)
    try {
      const errWebhook = type === 'check' ? SLACK_WEBHOOK_CHECKS : SLACK_WEBHOOK_BRIEFINGS
      await fetch(errWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🔴 *Monitor Error* — ${type} check failed\n\`${message}\`` }),
      })
    } catch { /* ignore secondary error */ }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
