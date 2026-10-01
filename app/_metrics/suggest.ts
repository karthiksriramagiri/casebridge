import { BENCH } from '@/app/_metrics/benchmarks'

/* These rules are plain business logic and are imported by server code as well
   as the table, so they cannot reach for the dashboard's `money` — that lives
   in a "use client" module. A local formatter keeps this file server-safe. */
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

const pct = (n: number, dp = 0) => `${n.toFixed(dp)}%`
const dash = '—'

type Ad = any

/* ── Suggested verdict ──────────────────────────────────────────────────────
   The rules the team actually decides by, written out rather than inferred.
   Everything here is a threshold someone chose, so the numbers live in one
   place and the reason each row got its badge is carried alongside it.

   Precedence is deliberate and is where most of the judgement sits:

     LEARNING first — a creative that started today or yesterday has no record
     to read, and every rule below would otherwise punish it for the silence
     of a creative that has barely run.

     KILL and WATCH before WINNER — both are about recent absence of results,
     and a strong lifetime average does not earn a creative another day of
     spend when it has gone quiet. Recency wins for a "what do I do today"
     call.

     KEEP last among the positives — a lead today is the weakest good signal
     on the list, so anything more specific claims the row first.           */

export const SUGGEST = {
  winnerCpl:    120,   // $ — average over the trailing window
  winnerCplDays:  5,
  winnerCpq:    500,   // $
  winnerCpa:   1500,   // $
  strongCpl:    150,   // $ — the "high hook + high CTR + good CPL" path
  killCpl:      500,   // $ — average at or above this is a kill
  killNoLeadDays: 5,
  watchNoLeadDays: 2,
  learningDays:   2,   // launched today or the day before
}

export type Suggestion = {
  key: string
  label: string
  /** One sentence naming what actually fired, with this creative's numbers. */
  why: string
  /** The threshold behind it, so the badge teaches the rule and not just the
      outcome — someone disagreeing with a verdict can see what to argue with. */
  rule?: string
  /** The measured values the rule was tested against. */
  facts?: { label: string; value: string }[]
}

/** Sum a field across the last n daily rows. */
function lastDays(ad: Ad, n: number): any[] {
  return (ad.daily || []).slice(-n)
}

/** Average CPL across a window, recomputed from spend and leads rather than
    averaging the daily CPLs — a $12 day and a $1,200 day are not equal terms. */
export function avgCpl(ad: Ad, days: number): number | null {
  const rows = lastDays(ad, days)
  const spend = rows.reduce((s, d) => s + (d.spend || 0), 0)
  const leads = rows.reduce((s, d) => s + (d.leads || 0), 0)
  return leads > 0 ? spend / leads : null
}

/** Consecutive days at the end of the window with no lead, counting only days
    the creative actually spent — a paused day is not a day without results. */
export function daysWithoutLead(ad: Ad): number {
  const rows = [...(ad.daily || [])].reverse()
  let n = 0
  for (const d of rows) {
    if ((d.spend || 0) <= 0) continue
    if ((d.leads || 0) > 0) break
    n++
  }
  return n
}

/** Spend across the last n days that had any. */
function spendOverDays(ad: Ad, n: number): number {
  return (ad.daily || []).slice(-Math.max(n, 1)).reduce((s: number, d: any) => s + (d.spend || 0), 0)
}

/** Leads on the most recent day the creative spent anything. */
function leadsOnLastSpendDay(ad: Ad): number {
  for (const d of [...(ad.daily || [])].reverse()) {
    if ((d.spend || 0) <= 0) continue
    return d.leads || 0
  }
  return 0
}

/** A signed percentage change off the trend block, for the fatigue readout. */
function delta(ad: Ad, key: string): string {
  const v = (ad.delta || {})[key]
  if (typeof v !== 'number' || !isFinite(v)) return dash
  const r = Math.round(v)
  return `${r > 0 ? '+' : ''}${r}%`
}

/** Did it deliver a lead on the most recent day it spent anything? */
function leadToday(ad: Ad): boolean {
  const rows = [...(ad.daily || [])].reverse()
  for (const d of rows) {
    if ((d.spend || 0) <= 0) continue
    return (d.leads || 0) > 0
  }
  return false
}

/** First day inside the window with delivery. Because the window is a rolling
    14 days, a first-spend day of today or yesterday can only mean the creative
    started then — anything older would have spent earlier in the window.
    A long-paused creative resuming today reads as launching too, which is the
    right call: it has no recent record to judge either. */
export function daysSinceLaunch(ad: Ad): number | null {
  const rows = (ad.daily || []).filter((d: any) => (d.spend || 0) > 0)
  if (!rows.length) return null
  const first = rows[0].date
  const all = ad.daily || []
  // Delivery on the window's first day means it predates the window.
  if (first === all[0]?.date) return null
  const idx = all.findIndex((d: any) => d.date === first)
  return all.length - 1 - idx
}

/* The fatigue signature: the audience has seen it more, and every downstream
   number moved the wrong way. One axis alone is noise. */
function isFatiguing(ad: Ad): boolean {
  const d = ad.delta || {}
  const up = (v: any) => typeof v === 'number' && v >= 5
  const down = (v: any) => typeof v === 'number' && v <= -5
  return up(d.frequency) && down(d.linkCtr) && up(d.linkCpc) && up(d.cpl)
}

export function statusOf(ad: Ad): Suggestion {
  /* Every rule below reads the daily series. Two different things can mean it
     is absent, and they are not the same answer:

       · spending today with no history at all — it launched today, which is
         precisely the LEARNING case and not something to wait for; and
       · nothing at all yet, because the table's first, fast request does not
         carry a series and the enrichment pass is still in flight.

     Reporting TEST for either would be asserting a verdict the data cannot
     support, so the first is named and the second is left visibly unresolved. */
  if (!(ad.daily || []).length) {
    return (ad.spendToday ?? 0) > 0
      ? { key: 'learning', label: 'LEARNING',
          why: 'Launched today — no prior delivery to read',
          rule: 'Anything launching today or the day before is left alone',
          facts: [{ label: 'Spend today', value: usd(ad.spendToday ?? 0) }] }
      : { key: 'pending',  label: '···', why: 'Reading the daily series…' }
  }

  const since = daysSinceLaunch(ad)
  if (since != null && since < SUGGEST.learningDays) {
    return { key: 'learning', label: 'LEARNING',
      why: since === 0 ? 'Launched today — too early to judge'
                       : 'Launched yesterday — too early to judge',
      rule: 'Anything launching today or the day before is left alone',
      facts: [{ label: 'Days running', value: String(since + 1) }] }
  }

  const noLead = daysWithoutLead(ad)
  const killAvg = avgCpl(ad, SUGGEST.killNoLeadDays)

  if (noLead >= SUGGEST.killNoLeadDays) {
    return { key: 'cut', label: 'KILL',
      why: `No lead in ${noLead} days of spend`,
      rule: `Kill at ${SUGGEST.killNoLeadDays}+ days without a lead`,
      facts: [
        { label: 'Days without a lead', value: String(noLead) },
        { label: 'Spend in that window', value: usd(spendOverDays(ad, noLead)) },
      ] }
  }
  if (killAvg != null && killAvg >= SUGGEST.killCpl) {
    return { key: 'cut', label: 'KILL',
      why: `${usd(killAvg)} average CPL — at or over the ${usd(SUGGEST.killCpl)} ceiling`,
      rule: `Kill at an average CPL of ${usd(SUGGEST.killCpl)} or higher`,
      facts: [
        { label: `Average CPL (${SUGGEST.killNoLeadDays}d)`, value: usd(killAvg) },
        { label: 'Ceiling', value: usd(SUGGEST.killCpl) },
      ] }
  }

  if (noLead >= SUGGEST.watchNoLeadDays) {
    return { key: 'watch', label: 'WATCH',
      why: `No lead in ${noLead} days of spend`,
      rule: `Watch at ${SUGGEST.watchNoLeadDays}+ days without a lead, kill at ${SUGGEST.killNoLeadDays}`,
      facts: [
        { label: 'Days without a lead', value: String(noLead) },
        { label: 'Spend in that window', value: usd(spendOverDays(ad, noLead)) },
      ] }
  }
  if (isFatiguing(ad)) {
    return { key: 'watch', label: 'WATCH',
      why: 'Frequency up, CTR down, CPC and CPL up — fatiguing',
      rule: 'All four moving the wrong way at once is the fatigue signature',
      facts: [
        { label: 'Frequency', value: delta(ad, 'frequency') },
        { label: 'Link CTR',  value: delta(ad, 'linkCtr') },
        { label: 'Link CPC',  value: delta(ad, 'linkCpc') },
        { label: 'CPL',       value: delta(ad, 'cpl') },
      ] }
  }

  /* WINNER, by either route. CPQ and CPA come from the lead pipeline and are
     frequently absent; they gate the verdict only when we actually have them,
     because requiring a number we do not hold would mean nothing ever wins. */
  const w = avgCpl(ad, SUGGEST.winnerCplDays)
  const cpqOk = ad.cpq == null || ad.cpq <= SUGGEST.winnerCpq
  const cpaOk = ad.cpa == null || ad.cpa <= SUGGEST.winnerCpa
  if (w != null && w <= SUGGEST.winnerCpl && cpqOk && cpaOk) {
    return { key: 'winner', label: 'WINNER',
      why: `${usd(w)} average CPL over ${SUGGEST.winnerCplDays} days` +
           (ad.cpq != null ? `, ${usd(ad.cpq)} CPQ` : '') +
           (ad.cpa != null ? `, ${usd(ad.cpa)} CPA` : ''),
      rule: `Average CPL ≤ ${usd(SUGGEST.winnerCpl)} over ${SUGGEST.winnerCplDays} days, CPQ ≤ ${usd(SUGGEST.winnerCpq)}, CPA ≤ ${usd(SUGGEST.winnerCpa)}`,
      facts: [
        { label: `Average CPL (${SUGGEST.winnerCplDays}d)`, value: usd(w) },
        { label: 'CPQ', value: ad.cpq != null ? usd(ad.cpq) : `${dash} not measured yet` },
        { label: 'CPA', value: ad.cpa != null ? usd(ad.cpa) : `${dash} not measured yet` },
      ] }
  }

  const highHook = ad.hookRate != null && ad.hookRate >= BENCH.hookRate.good
  const highCtr  = ad.linkCtr  != null && ad.linkCtr  >= BENCH.ctrCreative.good
  if (highHook && highCtr && ad.cpl != null && ad.cpl <= SUGGEST.strongCpl) {
    return { key: 'winner', label: 'WINNER',
      why: `${ad.hookRate!.toFixed(0)}% hook, ${ad.linkCtr!.toFixed(2)}% CTR, ${usd(ad.cpl)} CPL`,
      rule: `Hook ≥ ${BENCH.hookRate.good}%, link CTR ≥ ${BENCH.ctrCreative.good}% and CPL ≤ ${usd(SUGGEST.strongCpl)}`,
      facts: [
        { label: 'Hook rate', value: pct(ad.hookRate!) },
        { label: 'Link CTR',  value: pct(ad.linkCtr!, 2) },
        { label: 'CPL',       value: usd(ad.cpl) },
      ] }
  }

  if (leadToday(ad)) {
    return { key: 'keep', label: 'KEEP',
      why: 'Produced a lead on its last day of spend',
      rule: 'A lead on the most recent day of spend is enough to keep running',
      facts: [
        { label: 'Leads that day', value: String(leadsOnLastSpendDay(ad)) },
        { label: 'CPL',           value: ad.cpl != null ? usd(ad.cpl) : dash },
      ] }
  }

  return { key: 'test', label: 'TEST',
    why: 'Running, nothing decisive either way yet',
    rule: 'No winner, kill or watch threshold crossed, and no lead on the last day',
    facts: [
      { label: 'Days without a lead', value: String(noLead) },
      { label: `Average CPL (${SUGGEST.winnerCplDays}d)`, value: w != null ? usd(w) : dash },
    ] }
}

