/**
 * Daily creative performance monitor.
 * Pulls KPI data from CaseBridge for each active firm, evaluates CPL/CPQ
 * against Phase 1/2/3 thresholds, and posts a structured report to Slack.
 */

const FIRMS = [
  { slug: "lhp",       name: "Larry H. Parker" },
  { slug: "eisenberg", name: "Eisenberg Law Group PC" },
  { slug: "thl",       name: "The Herro Law Firm" },
]

// Phase thresholds — must match marketing page alertLevel()
const SPEND_FLOOR   = 600
const CPL_WARN      = 220
const CPL_KILL      = 300
const CPQ_WARN      = 1200
const CPQ_KILL      = 2000
const LEADS_READ    = 5
const LEADS_SCALE   = 8
const SIGNED_SCALE  = 2

function fmt$(n) {
  if (n == null) return "—"
  return "$" + Math.round(n).toLocaleString("en-US")
}

function phaseFlag(ad) {
  const spend  = ad.spend        ?? 0
  const leads  = ad.metaLeads    ?? 0
  const cpl    = ad.cpl          ?? null
  const cpq    = ad.cpq          ?? null
  const signed = ad.signedCases  ?? 0

  // Phase 1 — floor
  if (spend < SPEND_FLOOR) {
    if (cpl != null && cpl > CPL_KILL)
      return { emoji: "🔴", tag: "KILL",         reason: `CPL ${fmt$(cpl)} before $${SPEND_FLOOR} floor` }
    return   { emoji: "⚪", tag: "FLOOR",        reason: `${fmt$(spend)} spent — hold, needs more data` }
  }

  // Phase 1 kill — $600+ with zero leads
  if (leads === 0)
    return     { emoji: "🔴", tag: "KILL",         reason: `0 leads at ${fmt$(spend)} spend` }

  // Phase 3 — scale signal
  if (leads >= LEADS_SCALE && signed >= SIGNED_SCALE &&
      (cpl == null || cpl <= CPL_KILL) && (cpq == null || cpq <= CPQ_WARN))
    return     { emoji: "🟢", tag: "SCALE ↑",      reason: `${leads} leads · ${signed} signed · ready to scale` }

  // Phase 2 hard kill
  if (cpl != null && cpl > CPL_KILL && cpq != null && cpq > CPQ_WARN && signed === 0)
    return     { emoji: "🔴", tag: "KILL",         reason: `CPL ${fmt$(cpl)} + CPQ ${fmt$(cpq)} + 0 signed` }

  // Phase 2 watch — CPL high but CPQ still ok
  if (cpl != null && cpl > CPL_KILL)
    return     { emoji: "🟡", tag: "WATCH",        reason: `CPL ${fmt$(cpl)} > $${CPL_KILL} — monitor CPQ` }

  // Phase 2 read & decide
  if (leads >= LEADS_READ && cpl != null && cpl > CPL_WARN)
    return     { emoji: "🟠", tag: "READ & DECIDE", reason: `${leads} leads · CPL ${fmt$(cpl)} — review pipeline` }

  // General watch
  if (cpq != null && cpq > CPQ_WARN)
    return     { emoji: "🟡", tag: "WATCH",        reason: `CPQ ${fmt$(cpq)} > $${CPQ_WARN}` }
  if (cpl != null && cpl > CPL_WARN)
    return     { emoji: "🟡", tag: "WATCH",        reason: `CPL ${fmt$(cpl)} > $${CPL_WARN}` }

  return       { emoji: "🟢", tag: "OK",           reason: null }
}

async function fetchFirmKpi(apiBase, slug, preset) {
  const url = `${apiBase}/api/metrics/kpi?firm=${slug}&date_preset=${preset}`
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } })
  if (!res.ok) throw new Error(`KPI API ${res.status} for ${slug} [${preset}]`)
  return res.json()
}

// Merge today's live CPL/spend with 30d CPQ — today data is always live,
// 30d may lag for brand-new ads that only started spending today.
function mergeAdData(todayAd, periodAd) {
  return {
    ...todayAd,
    // CPQ and signed cases come from the period (need accumulated history)
    cpq:         periodAd?.cpq         ?? null,
    signedCases: periodAd?.signedCases ?? 0,
    nrCount:     periodAd?.nrCount     ?? todayAd?.nrCount ?? 0,
    nqCount:     periodAd?.nqCount     ?? todayAd?.nqCount ?? 0,
    fuCount:     periodAd?.fuCount     ?? todayAd?.fuCount ?? 0,
    isNew:       !periodAd,  // true = no 30d history yet
  }
}

function buildFirmSection(firm, todayData, periodData) {
  const todayAds  = (todayData.adBreakdown || []).filter(a => (a.spend ?? 0) > 0)
  if (!todayAds.length) return null

  const periodById = Object.fromEntries(
    (periodData.adBreakdown || []).map(a => [a.adId, a])
  )

  // Merge today's live data with 30d CPQ/signed
  const ads = todayAds.map(a => mergeAdData(a, periodById[a.adId]))

  const meta    = todayData.meta    || {}
  const summary = periodData.summary || {}

  if (!ads.length) return null

  const headerParts = [
    `*${firm.name}*`,
    `Spend: ${fmt$(meta.spend)}`,
    `Leads: ${meta.leads ?? 0}`,
    summary.cpq != null ? `CPQ: ${fmt$(summary.cpq)}` : null,
    summary.signedCases ? `${summary.signedCases} signed` : null,
  ].filter(Boolean)

  const lines = [`${headerParts.join(" · ")}`]

  // Sort: kills first, then watches, then rest by spend
  const ranked = [...ads].sort((a, b) => {
    const order = { KILL: 0, WATCH: 1, "READ & DECIDE": 2, FLOOR: 3, "SCALE ↑": 4, OK: 5 }
    const fa = phaseFlag(a).tag
    const fb = phaseFlag(b).tag
    if (fa !== fb) return (order[fa] ?? 9) - (order[fb] ?? 9)
    return (b.spend ?? 0) - (a.spend ?? 0)
  })

  for (const ad of ranked) {
    const { emoji, tag, reason } = phaseFlag(ad)
    const name = (ad.adName || ad.adId || "—").slice(0, 55)

    const metrics = [
      `CPL: ${fmt$(ad.cpl)}`,
      `CPQ: ${fmt$(ad.cpq)}`,
      ad.signedCases > 0 ? `${ad.signedCases} signed` : null,
    ].filter(Boolean).join(" · ")

    const pipeline = [
      ad.nrCount > 0 ? `${ad.nrCount} NR` : null,
      ad.nqCount > 0 ? `${ad.nqCount} NQ` : null,
      ad.fuCount > 0 ? `${ad.fuCount} F/U` : null,
    ].filter(Boolean).join(", ")

    lines.push(`  ${emoji} *${tag}* — ${name}`)
    lines.push(`       ${metrics}${pipeline ? " · " + pipeline : ""}`)
    if (reason) lines.push(`       ↳ _${reason}_`)
  }

  return lines.join("\n")
}

async function runDailyMonitor(config) {
  const slack = require("./adapters/slack")
  const apiBase = config.casebridgeApiUrl
  if (!apiBase) {
    console.warn("[monitor] CASEBRIDGE_API_URL not set — skipping daily monitor")
    return
  }

  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  })

  // Two fetches per firm in parallel:
  //   today  → which ad IDs are actively spending RIGHT NOW (live CPL)
  //   last_30d → CPQ / signed cases / pipeline history for those ads
  const results = await Promise.allSettled(
    FIRMS.map(async f => {
      const [todayData, periodData] = await Promise.all([
        fetchFirmKpi(apiBase, f.slug, "today"),
        fetchFirmKpi(apiBase, f.slug, "last_30d"),
      ])
      return { firm: f, todayData, periodData }
    })
  )

  const sections = []
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[monitor] KPI fetch failed:", r.reason?.message)
      continue
    }
    const { firm, todayData, periodData } = r.value
    const section = buildFirmSection(firm, todayData, periodData)
    if (section) sections.push(section)
  }

  if (!sections.length) {
    console.log("[monitor] no active ad data — skipping Slack post")
    return
  }

  const allText = sections.join("\n")
  const totalKills  = (allText.match(/🔴/g) || []).length
  const totalScales = (allText.match(/🟢 \*SCALE/g) || []).length

  const summaryLine = [
    totalKills  > 0 ? `🔴 ${totalKills} to kill`     : null,
    totalScales > 0 ? `🟢 ${totalScales} ready to scale` : null,
  ].filter(Boolean).join("  ·  ") || "✅ Nothing urgent"

  const text = [
    `*📊 Daily Creative Monitor — ${today}*`,
    summaryLine,
    "",
    sections.join("\n\n"),
  ].join("\n")

  await slack.sendDailyMonitor(config, text)
  console.log("[monitor] daily report posted to Slack")
}

// Called from server.js — checks once per minute if it's time to run
let _lastRunDate = null

function scheduleDailyMonitor(config) {
  const runHour   = Number(process.env.MONITOR_HOUR   ?? 9)   // 9am default
  const runMinute = Number(process.env.MONITOR_MINUTE ?? 0)
  const tz        = process.env.MONITOR_TIMEZONE || "America/Los_Angeles"

  setInterval(() => {
    const now = new Date()
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "numeric",
      hour12: false, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(now)

    const get = (type) => parseInt(local.find(p => p.type === type)?.value ?? "0")
    const dateStr = `${local.find(p => p.type === "year")?.value}-${local.find(p => p.type === "month")?.value}-${local.find(p => p.type === "day")?.value}`

    if (get("hour") === runHour && get("minute") === runMinute && dateStr !== _lastRunDate) {
      _lastRunDate = dateStr
      runDailyMonitor(config).catch(err => {
        console.error("[monitor] daily run failed:", err.message)
      })
    }
  }, 60_000)

  console.log(`[monitor] daily creative monitor scheduled — ${runHour}:${String(runMinute).padStart(2, "0")} ${tz}`)
}

module.exports = { runDailyMonitor, scheduleDailyMonitor }
