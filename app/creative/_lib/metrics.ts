import { addDays, TODAY, YESTERDAY } from './data'
import type { Creative, DayMetric, Decision, RangeKey, SignedLead, Stage, Totals, WatchItem } from './types'

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yest', label: 'Yesterday' },
  { key: 'ty', label: 'Today & Yesterday' },
  { key: '3d', label: 'Last 3 days' },
  { key: '5d', label: 'Last 5 days' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'max', label: 'Maximum' },
]

export const WINNER_CPL = 120
export const WATCH_CPL = 250
export const GOOD_HOOK = 0.3
export const LOW_HOOK = 0.2
export const HIGH_CTR = 0.015
export const LOW_CTR = 0.01

export function rangeBounds(key: RangeKey): { start: string; end: string } {
  switch (key) {
    case 'today':
      return { start: TODAY, end: TODAY }
    case 'yest':
      return { start: YESTERDAY, end: YESTERDAY }
    case 'ty':
      return { start: YESTERDAY, end: TODAY }
    case '3d':
      return { start: addDays(TODAY, -2), end: TODAY }
    case '5d':
      return { start: addDays(TODAY, -4), end: TODAY }
    case '7d':
      return { start: addDays(TODAY, -6), end: TODAY }
    case 'month':
      return { start: `${TODAY.slice(0, 7)}-01`, end: TODAY }
    case 'max':
      return { start: '2000-01-01', end: TODAY }
  }
}

export function daysInRange(c: Creative, key: RangeKey): DayMetric[] {
  const { start, end } = rangeBounds(key)
  return c.daily.filter((d) => d.date >= start && d.date <= end)
}

export function sumDays(days: DayMetric[]): Totals {
  const t = days.reduce(
    (a, d) => ({
      spend: a.spend + d.spend,
      impressions: a.impressions + d.impressions,
      hooks: a.hooks + d.hooks,
      linkClicks: a.linkClicks + d.linkClicks,
      leads: a.leads + d.leads,
      acquisitions: a.acquisitions + d.acquisitions,
    }),
    { spend: 0, impressions: 0, hooks: 0, linkClicks: 0, leads: 0, acquisitions: 0 },
  )
  return {
    ...t,
    cpl: t.leads ? t.spend / t.leads : null,
    cpa: t.acquisitions ? t.spend / t.acquisitions : null,
    ctr: t.impressions ? t.linkClicks / t.impressions : 0,
    hookRate: t.impressions ? t.hooks / t.impressions : 0,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : 0,
  }
}

/* Switched on, at either level.

   Meta answers this through `effective_status`, which rolls the parents in —
   an ad set left on inside a paused campaign reports CAMPAIGN_PAUSED, not
   ACTIVE, and is just as off.

   An unknown status counts as on. Hiding something because a field was
   missing from the status sweep would be the worst of the options: a live ad
   spending real money would vanish. */
const OFF_STATUSES = new Set(['PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED', 'ARCHIVED', 'DELETED'])

/* Is this ad's ad set switched on?

   Read at the ad-set level and not the ad's, which is what the analysis table
   wants: an ad paused on its own inside a live ad set is still part of that
   ad set's work and belongs in the table. It is the ad set being turned off
   that makes its ads irrelevant. */
export function adsetIsOn(c: Creative): boolean {
  if (!c.adsetStatus) return true
  return !OFF_STATUSES.has(c.adsetStatus)
}

/** Is this ad itself switched on, ignoring its parents? */
export function adIsOn(c: Creative): boolean {
  if (!c.status) return true
  return !OFF_STATUSES.has(c.status)
}

/* Delivering: the ad is on and so is everything above it.

   The budget tracker wants both halves, where the analysis table wants only
   the ad set. A paused ad inside a live ad set spends nothing and holds no
   budget, so counting it inflates the daily figure this page exists to
   report. */
export function isDelivering(c: Creative): boolean {
  return adsetIsOn(c) && adIsOn(c)
}

/** Switched on, but Meta is reporting a problem with it. */
export function hasDeliveryIssue(c: Creative): boolean {
  return c.status === 'WITH_ISSUES'
}

export function totalsFor(c: Creative, key: RangeKey) {
  return sumDays(daysInRange(c, key))
}

/** The cases signed off this ad inside the range — dated by the stage change
 *  that signed them, so "today" means they reached Pending Send or
 *  Signed/Sent today, not that their lead came in today. */
export function signedIn(c: Creative, key: RangeKey): SignedLead[] {
  const { start, end } = rangeBounds(key)
  return (c.signedLeads ?? []).filter((l) => l.date >= start && l.date <= end)
}

/** The leads that came in off this ad inside the range, newest first. */
export function leadsIn(c: Creative, key: RangeKey): SignedLead[] {
  const { start, end } = rangeBounds(key)
  return (c.leadPeople ?? []).filter((l) => l.date >= start && l.date <= end)
}

export function sumTotals(list: Totals[]): Totals {
  return sumDays(
    list.map((t) => ({
      date: '',
      spend: t.spend,
      impressions: t.impressions,
      hooks: t.hooks,
      linkClicks: t.linkClicks,
      leads: t.leads,
      acquisitions: t.acquisitions,
    })),
  )
}

export const REVIEW_CPL = 300
export const NEW_KILL_SPEND = 500
export const NEW_DEEP_CPL = 400
export const GOOD_CPA = 1500

/** Totals for the last `n` days including today, optionally shifted back `offset` days. */
export function lastNDays(c: Creative, n: number, offset = 0) {
  const end = addDays(TODAY, -offset)
  const start = addDays(end, -(n - 1))
  return sumDays(c.daily.filter((d) => d.date >= start && d.date <= end))
}

/** Week on Week CPL: last 7 days vs the 7 days before. Positive change = CPL got worse. */
export function weekOnWeek(c: Creative) {
  const cur = lastNDays(c, 7).cpl
  const prev = lastNDays(c, 7, 7).cpl
  const change = cur !== null && prev !== null && prev > 0 ? (cur - prev) / prev : null
  return { cur, prev, change }
}

/** Spend since the most recent day that produced a lead. */
export function spendSinceLastLead(c: Creative) {
  let spend = 0
  for (const d of [...c.daily].sort((a, b) => (a.date < b.date ? 1 : -1))) {
    if (d.date > TODAY) continue
    if (d.leads > 0) break
    spend += d.spend
  }
  return spend
}

export const FB_LIBRARY_SORT = 'sort_data[mode]=total_impressions&sort_data[direction]=desc'

/** Rewrites an Ad Library URL so results open sorted by impressions, high to low. */
export function libraryUrl(url: string) {
  return url.replace(/sort_data\[mode\]=[^&]*&sort_data\[direction\]=[^&]*/, FB_LIBRARY_SORT)
}

export function daysLive(c: Creative) {
  const ms = new Date(`${TODAY}T00:00:00Z`).getTime() - new Date(`${c.launchDate}T00:00:00Z`).getTime()
  return Math.floor(ms / 86_400_000) + 1
}

/** NEW = Day 1–3 since launch (judged on launch-to-date), ACTIVE = Day 4+ (judged on recent trend). */
export function stageOf(c: Creative): Stage {
  return daysLive(c) <= 3 ? 'NEW' : 'ACTIVE'
}

export type WatchBand = 'exclude' | 'review' | 'keep'

/** T&Y CPL: under $250 exclude, $250–299 review, $300+ (or 0 leads) keep. */
export function watchBand(c: Creative): WatchBand {
  const ty = totalsFor(c, 'ty')
  if (ty.cpl === null) return 'keep'
  if (ty.cpl < WATCH_CPL) return 'exclude'
  if (ty.cpl < REVIEW_CPL) return 'review'
  return 'keep'
}

/** Watch List Mode: exclude anything with a lead today, then apply the T&Y CPL band. */
export function isWatchCandidate(c: Creative) {
  if (totalsFor(c, 'today').leads > 0) return false
  return watchBand(c) !== 'exclude'
}

export function watchReason(c: Creative) {
  const stage = stageOf(c)
  if (stage === 'NEW') {
    const t = totalsFor(c, 'max')
    if (t.leads === 0) return `NEW · 0 leads on $${t.spend.toFixed(0)} since launch`
    return `NEW · launch CPL $${t.cpl!.toFixed(0)} (${t.leads} leads on $${t.spend.toFixed(0)})`
  }
  const ty = totalsFor(c, 'ty')
  const t7 = totalsFor(c, '7d')
  const parts = [ty.cpl === null ? `0 leads T&Y on $${ty.spend.toFixed(0)}` : `T&Y CPL $${ty.cpl.toFixed(0)}`]
  parts.push(`7d CPL ${t7.cpl === null ? '—' : `$${t7.cpl.toFixed(0)}`}`)
  return parts.join(' · ')
}

/** Suggested decision per the v4 kill logic. Admin always makes the final call. */
export function suggestDecision(c: Creative, streak: number): { decision: Decision; why: string } {
  const life = totalsFor(c, 'max')
  if (stageOf(c) === 'NEW') {
    if (life.leads === 0 && life.spend >= NEW_KILL_SPEND) return { decision: 'KILL', why: `0 leads after $${NEW_KILL_SPEND}+ spend` }
    if (life.cpl !== null && life.cpl >= NEW_DEEP_CPL) {
      if (life.cpa !== null && life.cpa <= GOOD_CPA) return { decision: 'WATCH', why: 'High CPL but acquisitions are coming in' }
      return { decision: 'KILL', why: `Launch CPL $${NEW_DEEP_CPL}+ with no good CPA` }
    }
    return { decision: 'WATCH', why: 'Too early — keep monitoring' }
  }
  const t7 = totalsFor(c, '7d')
  const weak = t7.cpl === null || t7.cpl >= REVIEW_CPL
  const cpaOk = life.cpa !== null && life.cpa <= GOOD_CPA
  if (streak >= 3 && weak && !cpaOk) return { decision: 'KILL', why: `${streak} days in a row, weak 7d trend, no good CPA` }
  if (streak >= 3 && weak && cpaOk) return { decision: 'WATCH', why: 'Repeat offender but lifetime CPA is good' }
  if (streak === 2) return { decision: 'WATCH', why: '2nd day in a row — stronger review' }
  return { decision: 'WATCH', why: 'Early warning only' }
}

/** Number of consecutive days (ending today) a creative has been on the watch list. */
export function watchStreak(creativeId: string, watch: WatchItem[]) {
  const dates = new Set(watch.filter((w) => w.creativeId === creativeId).map((w) => w.date))
  let n = 0
  let d = TODAY
  while (dates.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export function killReason(c: Creative) {
  const t3 = totalsFor(c, '3d')
  if (t3.cpl === null) return `0 leads in 3d on $${t3.spend.toFixed(0)} spend`
  return `3d CPL $${t3.cpl.toFixed(0)} (${t3.leads} leads on $${t3.spend.toFixed(0)})`
}

/** Existing creatives keep their naming and bump the version: V1 → V2, BNR1 → BNR2, IMG1 → IMG2. */
export function bumpConvention(convention: string) {
  return convention.replace(/_V(\d+)$/, (_, n) => `_V${Number(n) + 1}`)
}

export type RemakeSuggestion = 'Remake - Improve Hook' | 'Remake - Improve Body'

export function remakeSuggestion(t: Totals): RemakeSuggestion | null {
  if (t.hookRate >= GOOD_HOOK && t.ctr < LOW_CTR) return 'Remake - Improve Body'
  if (t.hookRate < LOW_HOOK && t.ctr >= HIGH_CTR) return 'Remake - Improve Hook'
  return null
}

export const usd = (n: number | null, digits = 2) =>
  n === null
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
export const pct = (n: number) => `${(n * 100).toFixed(2)}%`
export const num = (n: number) => n.toLocaleString('en-US')

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function buildConvention(opts: { angle: string; type: string; date: string; seq: number; sourceId?: string }) {
  const mmdd = opts.date.slice(5).replace('-', '')
  const angleCode = opts.angle
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  const typeCode = opts.type.startsWith('Double')
    ? 'DD'
    : opts.type.includes('Hook')
      ? 'RH'
      : opts.type.includes('Body')
        ? 'RB'
        : opts.type === 'Relaunch'
          ? 'RL'
          : 'NC'
  return `CB_${mmdd}_${angleCode}_${typeCode}${opts.sourceId ? `_${opts.sourceId}` : ''}_V${opts.seq}`
}
