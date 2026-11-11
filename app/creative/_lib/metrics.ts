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
/* Winner Analysis qualifies on the ad set, and an ad set pools the spend of
   several creatives, so its CPL sits higher than any single winning cut
   inside it. $120 at the ad level and $160 at the ad-set level describe the
   same standard from two places. The archive and the Execute view still
   count winners per ad at WINNER_CPL. */
export const WINNER_ADSET_CPL = 160
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
    /* The caller overrides these when it knows the lifetime figures; on a
       bare day-sum the range and the lifetime are the same thing. */
    lifeSpend: t.spend,
    rangeAcquisitions: t.acquisitions,
    cpl: t.leads ? t.spend / t.leads : null,
    cpa: t.acquisitions ? t.spend / t.acquisitions : null,
    rangeCpa: t.acquisitions ? t.spend / t.acquisitions : null,
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
  const t = sumDays(daysInRange(c, key))
  /* Two pairs of figures, and which is which matters.

     What is SHOWN follows the range, all of it — Signed and CPA included,
     the same as spend, leads and CPL beside them. A number on this page
     belongs to the window the picker is set to, with no exceptions to
     remember. At Maximum the range is the ad's whole life, so that is
     where the lifetime figures appear, under their own name.

     What the RULES read is lifetime: the kill and watch decisions judge an
     ad on every case it has ever produced, because a case signs days to
     weeks after the click that bought it and a day's spend over a day's
     signings is two different cohorts divided by each other. Those live on
     `acquisitions` / `cpa` / `lifeSpend` and never reach the screen. */
  const life = sumDays(c.daily)
  return {
    ...t,
    acquisitions: life.acquisitions,
    rangeAcquisitions: t.acquisitions,
    lifeSpend: life.spend,
    cpa: life.acquisitions ? life.spend / life.acquisitions : null,
    rangeCpa: t.acquisitions ? t.spend / t.acquisitions : null,
  }
}

/** The cases signed off this ad inside the range — dated by the stage change
 *  that signed them, so "today" means they reached Pending Send or
 *  Signed/Sent today, not that their lead came in today. */
/* Every case attributed to this ad, newest first.

   Not range-filtered, so the list matches the Signed column beside it —
   opening a count of 16 and being shown 3 people was the old behaviour,
   and the three were simply the ones who happened to sign inside the
   window. The `key` is kept so callers read the same as the other
   gatherers. */
export function signedIn(c: Creative, _key: RangeKey): SignedLead[] {
  return [...(c.signedLeads ?? [])]
    .filter((l) => !l.isReplacement)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** The same people, narrowed to the ones who signed inside the range — the
 *  list behind the totals row's range-scoped Signed count. */
export function signedInRange(c: Creative, key: RangeKey): SignedLead[] {
  const { start, end } = rangeBounds(key)
  return signedIn(c, key).filter((l) => l.date >= start && l.date <= end)
}

/** The leads that came in off this ad inside the range, newest first. */
export function leadsIn(c: Creative, key: RangeKey): SignedLead[] {
  const { start, end } = rangeBounds(key)
  return (c.leadPeople ?? []).filter((l) => l.date >= start && l.date <= end)
}

export function sumTotals(list: Totals[]): Totals {
  const t = sumDays(
    list.map((x) => ({
      date: '',
      spend: x.spend,
      impressions: x.impressions,
      hooks: x.hooks,
      linkClicks: x.linkClicks,
      leads: x.leads,
      acquisitions: x.acquisitions,
    })),
  )
  /* Lifetime spend has to be summed too, and CPA rebuilt from it. sumDays
     only knows the range spend it was handed, so without this an ad set's
     CPA came out as range spend over lifetime cases. */
  const lifeSpend = list.reduce((a, x) => a + (x.lifeSpend ?? x.spend), 0)
  /* sumDays only saw the lifetime count each row was handed, so the range
     count has to be summed here or an ad set's Signed column comes back as
     the lifetime one while its spend beside it is the range's. */
  const rangeAcquisitions = list.reduce((a, x) => a + (x.rangeAcquisitions ?? 0), 0)
  return {
    ...t,
    lifeSpend,
    rangeAcquisitions,
    cpa: t.acquisitions ? lifeSpend / t.acquisitions : null,
    rangeCpa: rangeAcquisitions ? t.spend / rangeAcquisitions : null,
  }
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
  return weekOnWeekOf([c])
}

/* The same comparison over a set of ads, summed before the CPL is taken.

   Summed, not averaged: an ad set's CPL is its total spend over its total
   leads, and averaging the members' CPLs would weight a $5 ad the same as a
   $500 one. The two windows are the last 7 days including today, and the 7
   before that. */
export function weekOnWeekOf(list: Creative[]) {
  const cur = sumTotals(list.map((c) => lastNDays(c, 7))).cpl
  const prev = sumTotals(list.map((c) => lastNDays(c, 7, 7))).cpl
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

/* ═══════════════════════════════════════════════════════════════════════════
   The watch list is judged on the ad set, not the ad.

   An ad set holds several creatives and Meta spends across them as it likes.
   One of them going two days without a lead says almost nothing on its own —
   it may have taken a tenth of the budget while a sibling in the same ad set
   took the rest and converted. Judging each ad separately put most of an
   account on the watch list every morning and buried the ad sets that were
   actually failing.

   So the spend and the leads are totalled across the ad set first, and the
   CPL band is read off that. Every creative in a qualifying ad set comes
   onto the list together, which is also how the decision gets made: you kill
   or keep an ad set, not one cut inside it.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Groups a creative with its siblings — by Meta's ad set id.

   Not by name. The account holds two ad sets both called
   "JM | Broad | BNR | RIP | INV | 20261104 | B000124", each with its own
   $200/day and one ad inside it. Grouping on the name merged them into one
   row that appeared to hold two creatives and carry $400, which is neither
   how Meta is structured nor how the budget behaves: switching one off
   frees $200 and leaves the other running.

   The id is the only thing that identifies an ad set. Where two share a
   name, `adsetLabels` below numbers them so the rows can be told apart. */
export const adsetKey = (c: Creative) => c.adsetId ?? `${c.account}::${c.adset}`

/** Budget groups the same way, since the budget belongs to the ad set. */
export const adsetBudgetKey = adsetKey

/* Which ad sets share their name with another, and where each sits.

   Two ad sets with one name render as two identical rows, which reads as a
   rendering fault rather than as a fact about the account. Returns "1 of 2"
   for those and nothing for the rest, so a caller can show it as a tag
   beside the name rather than running it into the name itself — the name is
   what gets copied into Ads Manager and must stay exact.

   Numbered in a stable order so an ad set keeps the same tag between
   renders. */
export function adsetDupeTags(creatives: Creative[]): Map<string, string> {
  const byName = new Map<string, string[]>()
  for (const c of creatives) {
    const k = adsetKey(c)
    const seen = byName.get(c.adset) ?? []
    if (!seen.includes(k)) byName.set(c.adset, [...seen, k])
  }
  const out = new Map<string, string>()
  for (const keys of byName.values()) {
    if (keys.length < 2) continue
    const sorted = [...keys].sort()
    for (const [i, k] of sorted.entries()) out.set(k, `${i + 1} of ${sorted.length}`)
  }
  return out
}

/* Daily budget across a set of ads, counted once per ad set.

   `dailyBudget` on a creative is its AD SET's budget — Meta sets the budget
   on the ad set and the API copies it onto every ad inside. Adding it up
   across creatives therefore counts the same money once per cut: an ad set
   holding three ads at $200/day reported $600.

   It also means killing one cut out of an ad set frees nothing. The ad set
   keeps its budget and spends it on the cuts that remain, so only an ad set
   going off entirely changes what is being spent. */
export function adsetBudget(ads: Creative[]): number {
  const seen = new Map<string, number>()
  for (const c of ads) {
    const k = adsetBudgetKey(c)
    if (!seen.has(k)) seen.set(k, c.dailyBudget ?? 0)
  }
  return [...seen.values()].reduce((a, b) => a + b, 0)
}

export type AdsetTotals = { today: Totals; ty: Totals; d7: Totals; ads: number }

/** Spend and leads per ad set, over the ranges the watch rules read. Built
 *  once per creative list rather than per row — the alternative is re-summing
 *  an ad set's whole history for every ad inside it. */
export function adsetIndex(creatives: Creative[]): Map<string, AdsetTotals> {
  const groups = new Map<string, Creative[]>()
  for (const c of creatives) {
    const k = adsetKey(c)
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  const out = new Map<string, AdsetTotals>()
  for (const [k, list] of groups) {
    out.set(k, {
      today: sumTotals(list.map((c) => totalsFor(c, 'today'))),
      ty: sumTotals(list.map((c) => totalsFor(c, 'ty'))),
      d7: sumTotals(list.map((c) => totalsFor(c, '7d'))),
      ads: list.length,
    })
  }
  return out
}

/** The ad set's own numbers, or this ad's alone if the index has no entry —
 *  which only happens for a creative that is not in the list it was built
 *  from. Never silently reports zero. */
/** Totals per ad set over one of the named ranges. The watch rules read
 *  fixed windows; this is for pages that follow the range selector. */
export function adsetTotalsFor(creatives: Creative[], range: RangeKey): Map<string, Totals> {
  const groups = new Map<string, Creative[]>()
  for (const c of creatives) {
    const k = adsetKey(c)
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  const out = new Map<string, Totals>()
  for (const [k, list] of groups) out.set(k, sumTotals(list.map((c) => totalsFor(c, range))))
  return out
}

export function adsetOf(c: Creative, index?: Map<string, AdsetTotals>): AdsetTotals {
  return (
    index?.get(adsetKey(c)) ?? {
      today: totalsFor(c, 'today'),
      ty: totalsFor(c, 'ty'),
      d7: totalsFor(c, '7d'),
      ads: 1,
    }
  )
}

/** T&Y CPL across the ad set: under $250 exclude, $250–299 review, $300+ (or
 *  0 leads) keep. */
export function watchBand(c: Creative, index?: Map<string, AdsetTotals>): WatchBand {
  const { ty } = adsetOf(c, index)
  if (ty.cpl === null) return 'keep'
  if (ty.cpl < WATCH_CPL) return 'exclude'
  if (ty.cpl < REVIEW_CPL) return 'review'
  return 'keep'
}

/** Watch List Mode: exclude ad sets that got a lead today, then apply the
 *  T&Y CPL band to the ad set's totals. */
export function isWatchCandidate(c: Creative, index?: Map<string, AdsetTotals>) {
  if (adsetOf(c, index).today.leads > 0) return false
  return watchBand(c, index) !== 'exclude'
}

export function watchReason(c: Creative, index?: Map<string, AdsetTotals>) {
  const stage = stageOf(c)
  if (stage === 'NEW') {
    const t = totalsFor(c, 'max')
    if (t.leads === 0) return `NEW · 0 leads on $${t.spend.toFixed(0)} since launch`
    return `NEW · launch CPL $${t.cpl!.toFixed(0)} (${t.leads} leads on $${t.spend.toFixed(0)})`
  }
  const { ty, d7, ads } = adsetOf(c, index)
  /* Named as the ad set's numbers, because that is what they are — reading
     "T&Y CPL $310" off a row and finding the ad spent $40 is how someone
     stops trusting the list. */
  const scope = ads > 1 ? `ad set (${ads} ads)` : 'ad set'
  const parts = [
    ty.cpl === null
      ? `${scope}: 0 leads T&Y on $${ty.spend.toFixed(0)}`
      : `${scope}: T&Y CPL $${ty.cpl.toFixed(0)}`,
  ]
  parts.push(`7d CPL ${d7.cpl === null ? '—' : `$${d7.cpl.toFixed(0)}`}`)
  return parts.join(' · ')
}

/** Suggested decision per the v4 kill logic. Admin always makes the final call. */
export function suggestDecision(
  c: Creative,
  streak: number,
  index?: Map<string, AdsetTotals>,
): { decision: Decision; why: string } {
  const life = totalsFor(c, 'max')
  if (stageOf(c) === 'NEW') {
    if (life.leads === 0 && life.spend >= NEW_KILL_SPEND) return { decision: 'KILL', why: `0 leads after $${NEW_KILL_SPEND}+ spend` }
    if (life.cpl !== null && life.cpl >= NEW_DEEP_CPL) {
      if (life.cpa !== null && life.cpa <= GOOD_CPA) return { decision: 'WATCH', why: 'High CPL but acquisitions are coming in' }
      return { decision: 'KILL', why: `Launch CPL $${NEW_DEEP_CPL}+ with no good CPA` }
    }
    return { decision: 'WATCH', why: 'Too early — keep monitoring' }
  }
  /* Read off the ad set, like the band that put this row on the list. The
     single ad's 7d CPL is the same thin slice the ad-set rule exists to look
     past, and advising a kill on it would contradict the reason the row is
     here at all. Lifetime CPA stays the ad's own — that is this creative's
     signed cases, not the ad set's. */
  const t7 = adsetOf(c, index).d7
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

/* The next version of a creative's name.

   A double down keeps the ad set exactly as it is — same audience, same
   placement, same batch — and changes only which cut runs in it. So the ad
   set name is copied verbatim and the creative name steps forward:

     0908 | B000108_V1 | LHP | HYB | RIP | C6 | D10
     0908 | B000108_V2 | LHP | HYB | RIP | C6 | D10

   The version lives in the batch segment, the second one, not at the end of
   the string — which is why bumpConvention above does not apply here. The
   trailing number of that segment's suffix is what moves, whatever the
   letters are: _V1 → _V2, _IMG4 → _IMG5, _BNR1 → _BNR2.

   `step` is how far to move, so a second double down on the same cut lands
   on _V3 rather than colliding with the _V2 someone already has in hand.

   A name that does not follow the convention is left to speak for itself
   with a version appended — inventing structure for it would produce an ad
   name nobody can file. */
/* ═══════════════════════════════════════════════════════════════════════════
   The two names a brief produces.

   Every one of the 146 live ad sets follows one shape, and every one of the
   169 live ads follows the matching one:

     ad set    LHP | Broad | HYB | RIP | INV | 20260908 | B000108
     creative  0908 | B000108_V1 | LHP | HYB | RIP | C6 | D10

   They are not independent. Checked against the live account, all 169 ads
   agree with their ad set on both the date (YYYYMMDD there, MMDD here) and
   the offer segment, which is why one form can produce both and they cannot
   drift apart.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The offer segment, shared by both names. */
export const CREATIVE_OFFERS = ['OG', 'RIP'] as const
export type CreativeOffer = (typeof CREATIVE_OFFERS)[number]

/** Campaign type. INV 125, VAR 21 live. */
export const CAMPAIGN_TYPES = ['INV', 'VAR'] as const
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]

/* The suffix letters on a creative's batch segment say what kind of cut it
   is, and they follow the format:

     IMG   → _IMG1, _IMG2 …   static images
     BNR   → _BNR1, _BNR2 …   banners
     BR    → _V1, _V2 …       b-roll
     HYB   → _V1, _V2 …       hybrid
     AIUGC → _V1, _V2 …       AI UGC
     ANM   → _V1, _V2 …       animation, which follows the video cuts

   Video of any kind shares the _V series, so a batch's b-roll and hybrid
   cuts number through one sequence rather than two that collide. */
const SUFFIX: Record<string, string> = { IMG: 'IMG', BNR: 'BNR' }
export const creativeSuffix = (format: string) => SUFFIX[format] ?? 'V'

/* Which of the three kinds a live ad is: a banner, a static image, or a
   video of some sort.

   Meta only answers Image or Video, which cannot tell a banner from a
   still — and those are two different jobs for two different people. The
   ad name can: its fourth segment is the production format, the same
   letters the naming convention is built from.

     1106 | B00096_IMG4 | JM | IMG | RIP | Anxiety   →  IMG
     1104 | B000124_BNR3 | JM | BNR | RIP | G9 | H15 →  BNR
     0908 | B000108_V1 | LHP | HYB | RIP | C6 | D10  →  V   (HYB is a video)

   Grouped by the suffix the convention already uses, so BR, HYB, AIUGC and
   ANM all land in V — exactly the three buckets the launch sheet counts.
   Falls back to the batch suffix, then to what Meta says, for a name that
   does not follow the convention. */
export function creativeKind(c: { name?: string; convention?: string; format?: string }): 'IMG' | 'BNR' | 'V' {
  const name = c.convention || c.name || ''
  const parts = name.split('|').map((x) => x.trim())
  const seg = parts[3]
  if (seg && SUFFIX[seg]) return SUFFIX[seg] as 'IMG' | 'BNR' | 'V'
  const suffix = parts[1]?.match(/_(IMG|BNR|V)\d*$/i)?.[1]?.toUpperCase()
  if (suffix === 'IMG' || suffix === 'BNR' || suffix === 'V') return suffix
  return c.format === 'Image' ? 'IMG' : 'V'
}

/** The IMG / BNR / V mix of a set of ads, as whole percentages that sum to 100. */
export function formatMix(ads: { name?: string; convention?: string; format?: string }[]) {
  const n = ads.length
  const count = { IMG: 0, BNR: 0, V: 0 }
  for (const a of ads) count[creativeKind(a)]++
  /* Largest-remainder, so three thirds read 34/33/33 rather than 33/33/33
     and a mix that is all one kind reads 100 rather than 99. */
  const exact = (['IMG', 'BNR', 'V'] as const).map((k) => ({ k, v: n ? (count[k] / n) * 100 : 0 }))
  const out = exact.map((x) => ({ ...x, pct: Math.floor(x.v) }))
  let left = 100 - out.reduce((t, x) => t + x.pct, 0)
  for (const x of [...out].sort((a, b) => (b.v - b.pct) - (a.v - a.pct))) {
    if (left <= 0) break
    x.pct++
    left--
  }
  return out.map((x) => ({ kind: x.k, count: count[x.k], pct: n ? x.pct : 0 }))
}

export type NameParts = {
  /** Firm code as it appears in the ad name — LHP | LHP_SP | JM | JM_SP. */
  firm: string
  format: string
  offer: string
  campaignType: string
  /** ISO day. The ad set carries YYYYMMDD, the creative MMDD. */
  date: string
  batch: string
  visualCode?: string
  verbalCode?: string
  /** Which cut in the batch — the number after the suffix letters. */
  seq?: number
}

export function buildAdsetName(p: NameParts): string {
  const ymd = p.date.replace(/-/g, '')
  return [p.firm, 'Broad', p.format, p.offer, p.campaignType, ymd, p.batch].join(' | ')
}

export function buildCreativeName(p: NameParts): string {
  const mmdd = p.date.slice(5).replace('-', '')
  return [
    mmdd,
    `${p.batch}_${creativeSuffix(p.format)}${p.seq ?? 1}`,
    p.firm,
    p.format,
    p.offer,
    p.visualCode,
    p.verbalCode,
  ]
    .filter((x) => x !== undefined && x !== '')
    .join(' | ')
}

/* Which cut numbers a batch has already used, and the next free one.

   Scoped three ways, and all three matter:

     firm    B000123 at Larry H. Parker and B000123 at Jacoby & Meyers are
             unrelated batches that happen to share a number. Numbering
             across them is already wrong in the account — LHP_SP's first
             cut of B00019SP came out as BNR4 because JM_SP had BNR1–3.
     batch   the obvious one.
     suffix  a batch can hold B000108_IMG1 and B000108_V1 at once, and the
             two series run independently.

   Both the live account and the briefs already written are searched: a cut
   that is queued but not launched has still claimed its number, and handing
   the same one out twice is how two different ads end up filed as the same
   thing.

   `used` is what the warning reads from. A batch nobody has touched returns
   an empty list and seq 1. */
export function batchUsage(names: string[], batch: string, format: string, firm: string) {
  const b = batch.trim()
  const f = firm.trim().toUpperCase()
  if (!b || !f) return { used: [] as string[], seq: 1 }
  const suffix = creativeSuffix(format)
  const anySuffix = new RegExp(`^${b}_([A-Za-z]+)(\\d+)$`)
  /* Deduplicated: the same cut appears in the live account and in the brief
     that asked for it, and listing it twice makes the warning look like two
     different ads. */
  const seen = new Set<string>()
  let max = 0
  for (const name of names) {
    const parts = name.split('|')
    const seg = parts[1]?.trim()
    if (!seg) continue
    /* The firm segment, exactly as the convention writes it: LHP and LHP_SP
       are different firms and number their batches separately. */
    if ((parts[2]?.trim().toUpperCase() ?? '') !== f) continue
    const m = seg.match(anySuffix)
    if (!m) continue
    seen.add(seg)
    if (m[1].toUpperCase() === suffix.toUpperCase()) max = Math.max(max, Number(m[2]))
  }
  /* Grouped by suffix then in number order, so a run reads as a run. */
  const used = [...seen].sort((a, b) => {
    const pa = a.match(anySuffix)!
    const pb = b.match(anySuffix)!
    return pa[1].localeCompare(pb[1]) || Number(pa[2]) - Number(pb[2])
  })
  return { used, seq: max + 1 }
}

/* Read a creative name back into its parts.

   Positional, not a search: the convention is fixed at seven segments and
   every live ad follows it, so the offer is segment 4 whatever it says. A
   heuristic that hunts for a recognisable token gets this wrong the moment
   an angle happens to look like a format code.

     0908 | B000108_V1 | LHP | HYB | RIP | C6 | D10
       0        1        2     3     4     5    6

   The hook codes are taken only when they look like hook codes — some older
   names carry a word there instead ("Relief"), and copying that into a hook
   field would put a brief under an angle that does not exist. */
const HOOK_CODE = /^[A-Z]\d{1,3}$/i

export function parseCreativeName(convention: string) {
  const p = convention.split('|').map((x) => x.trim())
  const batchSeg = p[1] ?? ''
  const m = batchSeg.match(/^(.*?)_([A-Za-z]+)(\d+)$/)
  return {
    date: p[0] || undefined,
    batch: (m ? m[1] : batchSeg) || undefined,
    suffix: m?.[2],
    seq: m ? Number(m[3]) : undefined,
    firm: p[2] || undefined,
    format: p[3] || undefined,
    offer: p[4] || undefined,
    visualCode: p[5] && HOOK_CODE.test(p[5]) ? p[5].toUpperCase() : undefined,
    verbalCode: p[6] && HOOK_CODE.test(p[6]) ? p[6].toUpperCase() : undefined,
  }
}

/* Re-stamp a name with a given day.

   A double down is a new cut going up now, so both names carry today — the
   ad set it runs in is today's ad set, not the one the winner launched in.
   The rest of the name is untouched: same firm, format, offer, campaign
   type and batch, so the pair still reads as the same idea.

     ad set    JM | Broad | IMG | OG | VAR | 20261019 | B000138
            →  JM | Broad | IMG | OG | VAR | 20261107 | B000138

     creative  1019 | B000138_IMG3 | JM | IMG | OG | Man
            →  1107 | B000138_IMG4 | JM | IMG | OG | Man

   Both edit one segment by position and leave the spacing as found, so a
   name that does not match the convention comes back unchanged rather than
   rebuilt into something nobody can file. */
const restamp = (name: string, index: number, stamp: string, shape: RegExp) => {
  const parts = name.split('|')
  if (parts.length <= index) return name
  const m = parts[index].match(/^(\s*)(.*?)(\s*)$/)!
  if (!shape.test(m[2])) return name
  parts[index] = `${m[1]}${stamp}${m[3]}`
  return parts.join('|')
}

/** The ad set's date segment — YYYYMMDD, sixth of seven. */
export const withAdsetDate = (adset: string, iso: string) =>
  restamp(adset, 5, iso.replace(/-/g, ''), /^\d{8}$/)

/** The creative's date segment — MMDD, the first. */
export const withCreativeDate = (convention: string, iso: string) =>
  restamp(convention, 0, iso.slice(5).replace('-', ''), /^\d{4}$/)

/* The next batch number a firm has not used.

   Per firm, like the cut numbering inside a batch: Larry H. Parker's
   batches and Jacoby's run as separate sequences, and the two sharing a
   number is normal rather than a collision to design around.

   The width is preserved from the highest one seen, so B000123 gives
   B000124 rather than B124. */
export function nextBatchNumber(names: string[], firm: string, fallback = 'B000001'): string {
  const f = firm.trim().toUpperCase()
  if (!f) return fallback
  let max = 0
  let width = 6
  /* The Spanish boards tag the batch itself — B00032SP, not B00032 — so the
     suffix is carried onto the new number rather than dropped. Taken from
     the highest batch seen for this firm, which is the one being continued. */
  let suffix = ''
  for (const name of names) {
    const parts = name.split('|')
    /* The firm segment as the convention writes it — LHP and LHP_SP number
       their batches separately. */
    if ((parts[2]?.trim().toUpperCase() ?? '') !== f) continue
    const m = (parts[1]?.trim() ?? '').match(/^B(\d+)([A-Za-z]*?)(?:_|$)/)
    if (!m) continue
    const n = Number(m[1])
    if (n > max) { max = n; width = m[1].length; suffix = m[2] }
  }
  return max === 0 ? fallback : `B${String(max + 1).padStart(width, '0')}${suffix}`
}

/** Set the cut number on a creative name outright, rather than stepping it. */
export function withCreativeSeq(convention: string, seq: number): string {
  const parts = convention.split('|')
  if (parts.length < 2) return `${convention.trim()}_V${seq}`
  const lead = parts[1].match(/^(\s*)(.*?)(\s*)$/)!
  const seg = lead[2]
  const set = seg.replace(/_([A-Za-z]*)\d+$/, (_, letters: string) => `_${letters}${seq}`)
  parts[1] = `${lead[1]}${set === seg ? `${seg}_V${seq}` : set}${lead[3]}`
  return parts.join('|')
}

export function nextCreativeName(convention: string, step = 1): string {
  const parts = convention.split('|')
  if (parts.length < 2) return `${convention.trim()}_V${step + 1}`

  const lead = parts[1].match(/^(\s*)(.*?)(\s*)$/)!
  const seg = lead[2]
  const bumped = seg.replace(/_([A-Za-z]*)(\d+)$/, (_, letters: string, n: string) =>
    `_${letters}${Number(n) + step}`,
  )
  parts[1] = `${lead[1]}${bumped === seg ? `${seg}_V${step + 1}` : bumped}${lead[3]}`
  return parts.join('|')
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
