/* ═══════════════════════════════════════════════════════════════════════════
   Creative benchmarks and decision logic

   Two questions, two verdicts, one set of numbers:

     Daily Creative Health  → should we keep running this ad?   KEEP/WATCH/KILL
     Creative Analysis      → why did it win or lose?     DOUBLE DOWN/IMPROVE/…

   These are *initial operating thresholds*. Every band is defined once, here,
   so the tables, the verdicts and the prompt Claude reads can never drift
   apart — and so that swapping fixed thresholds for rolling per-type
   benchmarks later is a change to this file alone.
   ═══════════════════════════════════════════════════════════════════════════ */

export const BENCH = {
  /* — Daily health — */
  frequency: { healthy: 2.0, watch: 3.0 },      // count
  linkCtr:   { healthy: 1.0, watch: 0.7 },      // %  (higher is better)
  linkCpc:   { healthy: 10,  watch: 15 },       // $  (lower is better)
  cpl:       { healthy: 250, watch: 300 },      // $  weekly average

  /* — Creative analysis — */
  hookRate:    { strong: 40,  good: 30,  watch: 20 },   // %
  ctrCreative: { strong: 1.5, good: 1.0, watch: 0.7 },  // %
  clickToLead: { strong: 8,   good: 5,   watch: 3 },    // %
}

/* Trend sensitivity. Fatigue is a direction, not a level — an ad at $240 CPL
   that was at $150 last week is in more trouble than one flat at $260. */
export const TREND = {
  watchPct: 20,   // any of CTR / CPC / CPL deteriorating this much → WATCH
  killPct:  30,   // CPL deteriorating this much, with CTR or CPC agreeing → KILL
  minSpend: 600,  // below this there is not enough data to kill on
  minLeads: 3,    // …nor to trust a CPL swing
}

/* ── Band helpers ───────────────────────────────────────────────────────── */

export type Band = 'strong' | 'good' | 'watch' | 'weak' | null

/** Higher is better: hook rate, CTR, CVR. */
export function bandUp(v: number | null, t: { strong: number; good: number; watch: number }): Band {
  if (v == null || !isFinite(v)) return null
  if (v >= t.strong) return 'strong'
  if (v >= t.good) return 'good'
  if (v >= t.watch) return 'watch'
  return 'weak'
}

/** Lower is better: CPC, CPL, frequency. Two thresholds, three states. */
export function bandDown(v: number | null, t: { healthy: number; watch: number }): Band {
  if (v == null || !isFinite(v)) return null
  if (v <= t.healthy) return 'good'
  if (v <= t.watch) return 'watch'
  return 'weak'
}

/** Higher is better, two thresholds. */
export function bandUp2(v: number | null, t: { healthy: number; watch: number }): Band {
  if (v == null || !isFinite(v)) return null
  if (v >= t.healthy) return 'good'
  if (v >= t.watch) return 'watch'
  return 'weak'
}

/* ── Derived metrics ────────────────────────────────────────────────────── */

export type AdMetrics = {
  spend: number
  impressions: number
  linkClicks: number
  leads: number
  frequency: number | null
  cpm: number | null
  linkCtr: number | null       // %
  linkCpc: number | null       // $
  cpl: number | null           // $
  hookRate: number | null      // % — 3s views / impressions
  videoPlays: number           // denominator for the retention quartiles
  clickToLead: number | null   // % — leads / link clicks
  p25: number; p50: number; p75: number; p100: number
  holdRate: number | null      // % — p100 / 3s plays
}

/* ── Daily health verdict ───────────────────────────────────────────────── */

export type Health = 'keep' | 'watch' | 'kill' | 'learning'

export type Delta = {
  cpl: number | null        // % change, positive = worse
  linkCtr: number | null    // % change, positive = better
  linkCpc: number | null    // % change, positive = worse
  frequency: number | null  // % change, positive = more saturated
}

export type HealthVerdict = {
  level: Health
  why: string
  fatigue: boolean
}

const pctChange = (now: number | null, was: number | null): number | null =>
  now == null || was == null || was === 0 ? null : ((now - was) / was) * 100

export function computeDelta(recent: Partial<AdMetrics>, baseline: Partial<AdMetrics>): Delta {
  return {
    cpl:       pctChange(recent.cpl ?? null,       baseline.cpl ?? null),
    linkCtr:   pctChange(recent.linkCtr ?? null,   baseline.linkCtr ?? null),
    linkCpc:   pctChange(recent.linkCpc ?? null,   baseline.linkCpc ?? null),
    frequency: pctChange(recent.frequency ?? null, baseline.frequency ?? null),
  }
}

/** The classic saturation signature: seen more, clicked less, paid more. */
export function isFatiguePattern(d: Delta): boolean {
  return (d.frequency ?? 0) > 0
    && (d.linkCtr ?? 0) < 0
    && (d.linkCpc ?? 0) > 0
    && (d.cpl ?? 0) > 0
}

export function healthVerdict(m: AdMetrics, d: Delta): HealthVerdict {
  const fatigue = isFatiguePattern(d)
  const money = (n: number) => `$${Math.round(n)}`
  const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)}%`

  // Not enough spend to judge anything yet.
  if (m.spend < TREND.minSpend && (m.leads ?? 0) < TREND.minLeads) {
    return { level: 'learning', why: `${money(m.spend)} spent — below the ${money(TREND.minSpend)} read threshold`, fatigue }
  }

  const cplWorse = (d.cpl ?? 0) >= TREND.killPct
  const ctrWorse = (d.linkCtr ?? 0) <= -TREND.watchPct
  const cpcWorse = (d.linkCpc ?? 0) >= TREND.watchPct

  /* An ad still comfortably inside the CPL target cannot be killed on trend
     alone. A creative that moved from $64 to $84 has deteriorated 31% and is
     still less than a third of the ceiling — killing it would throw away the
     best performer in the account. Deterioration that has not yet reached the
     target is a WATCH; the kill waits until the absolute number also hurts. */
  const stillCheap = m.cpl != null && m.cpl <= BENCH.cpl.healthy

  if (m.spend >= TREND.minSpend && cplWorse && (ctrWorse || cpcWorse)) {
    const why = `CPL ${pct(d.cpl!)} vs baseline${ctrWorse ? `, link CTR ${pct(d.linkCtr!)}` : ''}${cpcWorse ? `, link CPC ${pct(d.linkCpc!)}` : ''}`
    if (stillCheap) {
      return { level: 'watch', why: `${why} — but still under the ${money(BENCH.cpl.healthy)} target`, fatigue }
    }
    return { level: 'kill', why, fatigue }
  }

  // Absolute floor: spending well past the read threshold with nothing to show.
  if (m.spend >= TREND.minSpend && m.leads === 0) {
    return { level: 'kill', why: `${money(m.spend)} spent, zero leads`, fatigue }
  }

  // Deterioration short of a kill, or a threshold breach.
  const watchReasons: string[] = []
  if ((d.cpl ?? 0) >= TREND.watchPct) watchReasons.push(`CPL ${pct(d.cpl!)}`)
  if (ctrWorse) watchReasons.push(`link CTR ${pct(d.linkCtr!)}`)
  if (cpcWorse) watchReasons.push(`link CPC ${pct(d.linkCpc!)}`)
  if (watchReasons.length > 0) {
    return { level: 'watch', why: `${watchReasons.join(', ')} vs baseline`, fatigue }
  }

  if (m.cpl != null && m.cpl > BENCH.cpl.watch) return { level: 'watch', why: `${money(m.cpl)} per lead, over the ${money(BENCH.cpl.watch)} ceiling`, fatigue }
  if (m.linkCtr != null && m.linkCtr < BENCH.linkCtr.watch) return { level: 'watch', why: `${m.linkCtr.toFixed(2)}% link CTR, under ${BENCH.linkCtr.watch}%`, fatigue }
  if (m.linkCpc != null && m.linkCpc > BENCH.linkCpc.watch) return { level: 'watch', why: `${money(m.linkCpc)} per link click`, fatigue }
  if (m.frequency != null && m.frequency >= BENCH.frequency.watch) {
    return { level: 'watch', why: `frequency ${m.frequency.toFixed(1)} — saturating`, fatigue }
  }

  return { level: 'keep', why: 'Inside every threshold', fatigue }
}

/* ── Creative verdict ───────────────────────────────────────────────────── */

export type CreativeAction =
  | 'double_down' | 'improve_body' | 'new_hook' | 'check_landing' | 'new_concept' | 'cost' | 'fatigue' | 'learning'

export type CreativeVerdict = { action: CreativeAction; label: string; why: string }

const ACTION_LABEL: Record<CreativeAction, string> = {
  double_down:   'Double down',
  improve_body:  'Improve body',
  new_hook:      'New hook',
  check_landing: 'Check landing page',
  cost:          'Cost, not creative',
  new_concept:   'New concept',
  fatigue:       'Fatigue — refresh',
  learning:      'Learning',
}

export function creativeVerdict(m: AdMetrics, d?: Delta): CreativeVerdict {
  const mk = (action: CreativeAction, why: string) => ({ action, label: ACTION_LABEL[action], why })

  if (m.spend < TREND.minSpend && (m.leads ?? 0) < TREND.minLeads) {
    return mk('learning', `${Math.round(m.spend)} spent — not enough signal to judge the creative yet`)
  }

  // A former winner on the way down is a fatigue call, not a creative fault:
  // the asset worked, the audience has simply seen it.
  if (d && isFatiguePattern(d) && (d.cpl ?? 0) >= TREND.watchPct) {
    return mk('fatigue', 'Was working, now decaying on every axis — cut fresh variations of the same concept')
  }

  const hook = bandUp(m.hookRate, BENCH.hookRate)
  const ctr  = bandUp(m.linkCtr, BENCH.ctrCreative)
  const cvr  = bandUp(m.clickToLead, BENCH.clickToLead)

  /* Static creative has no hook rate to read — there is no 3-second view on
     an image. Judging it on a missing hook would recommend "new hook" for
     every image ad in the account, so those are decided on CTR, CVR and CPL
     alone. */
  if (m.hookRate == null) {
    const ctrOk = ctr === 'strong' || ctr === 'good'
    const cplOk = m.cpl != null && m.cpl <= BENCH.cpl.healthy
    if (ctrOk && (cvr === 'weak' || cvr === 'watch')) {
      return mk('check_landing', `${m.linkCtr?.toFixed(2)}% link CTR but only ${m.clickToLead?.toFixed(1)}% of clicks convert — the drop is after the ad`)
    }
    if (ctrOk && cplOk) return mk('double_down', `${m.linkCtr?.toFixed(2)}% link CTR at ${Math.round(m.cpl!)} CPL — scale it`)
    if (ctrOk) return mk('improve_body', `${m.linkCtr?.toFixed(2)}% link CTR but ${m.cpl != null ? Math.round(m.cpl) + ' CPL' : 'no leads'} — the click is cheap, the lead is not`)
    return mk('new_concept', `${m.linkCtr?.toFixed(2)}% link CTR on a static image — below the ${BENCH.ctrCreative.watch}% floor`)
  }

  const hookStrong = hook === 'strong' || hook === 'good'
  const ctrStrong  = ctr === 'strong' || ctr === 'good'
  const cvrWeak    = cvr === 'weak' || cvr === 'watch'
  const cplGood    = m.cpl != null && m.cpl <= BENCH.cpl.healthy

  if (hookStrong && ctrStrong) {
    // The hook stops them and the copy sells them, but the page loses them.
    if (cvrWeak) {
      return mk('check_landing', `Hook and click-through both land, but only ${m.clickToLead?.toFixed(1)}% of clicks convert — the drop is after the ad`)
    }
    if (cplGood) {
      return mk('double_down', `${m.hookRate?.toFixed(0)}% hook, ${m.linkCtr?.toFixed(2)}% link CTR, ${Math.round(m.cpl!)} CPL — scale it`)
    }
    /* Every creative signal is healthy and clicks still convert, yet the lead
       costs too much. That is an auction and targeting problem, not a
       creative one — recommending a new concept here would throw away a
       working asset. */
    return mk('cost', m.cpl != null
      ? `Creative performs on every axis but CPL is ${Math.round(m.cpl)} — look at audience, placement and CPM, not the asset`
      : 'Creative performs on every axis but has produced no leads yet')
  }
  if (hookStrong && !ctrStrong) {
    return mk('improve_body', `${m.hookRate?.toFixed(0)}% hook holds attention but only ${m.linkCtr?.toFixed(2)}% click — keep the opening, rework body, offer and CTA`)
  }
  if (!hookStrong && ctrStrong) {
    return mk('new_hook', `Only ${m.hookRate?.toFixed(0)}% watch 3s, yet ${m.linkCtr?.toFixed(2)}% of those who do click — the offer works, the opening does not`)
  }
  if (!hookStrong && !ctrStrong) {
    return mk('new_concept', `${m.hookRate?.toFixed(0)}% hook and ${m.linkCtr?.toFixed(2)}% link CTR — nothing here to salvage`)
  }

  /* Unreachable with the branches above, but an explicit fallback beats a
     default that would read as an endorsement. */
  return mk('learning', 'Not enough of a pattern to call yet')
}
