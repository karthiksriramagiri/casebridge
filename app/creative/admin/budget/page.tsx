'use client'

import { PageHeader, Pill, StatCard } from '@/app/creative/_components/admin/shared'
import { adsetBudget, adsetKey, isDelivering, totalsFor, usd } from '@/app/creative/_lib/metrics'
import { useMemo } from 'react'
import { RELAUNCH_TYPE, type Assignment, type Creative } from '@/app/creative/_lib/types'
import { TODAY } from '@/app/creative/_lib/data'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName, firmOf } from '@/app/_metrics/firms'

type Row = { id: string; name: string; firm: string; budget: number; spent: number; isNew: boolean }

export default function BudgetPage() {
  const { creatives, killedIds, launches, kill, assignments } = useStore()

  const rows: Row[] = [
    ...creatives
      /* Only what is actually delivering. A paused ad — or any ad under a
         paused ad set or campaign — spends nothing and holds no budget, so
         listing it overstated "Daily budget (live)" by the budget of every
         ad that had been switched off. */
      .filter((c) => !killedIds.has(c.id) && isDelivering(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        firm: c.firm,
        budget: c.dailyBudget,
        spent: totalsFor(c, 'today').spend,
        isNew: false,
      })),
    ...launches
      .filter((l) => l.status === 'done')
      /* A launch has no firm field of its own — the firm is carried in the
         naming convention, the same place every live ad's firm is read from,
         so a pending launch files under the firm it will run for rather than
         into a "New launches" bucket of its own. */
      .map((l) => {
        const named = l.convention || l.name
        return { id: l.id, name: named, firm: firmOf(named), budget: l.dailyBudget, spent: 0, isNew: true }
      }),
  ]

  /* Counted once per ad set.

     Meta sets the budget on the ad set and the API copies it onto every ad
     inside, so adding it up per row counted the same money once per cut —
     $10,000 reported against a real $8,600. The rows still each show their
     ad set's figure, which is the right thing to see beside an ad; it is
     only the totals that must not add them together. */
  const liveAds = creatives.filter((c) => !killedIds.has(c.id) && isDelivering(c))

  /* The ad sets going off entirely today.

     Only those free anything: pulling one cut out of three leaves the other
     two spending the same budget. Kills whose ad has already stopped
     delivering are skipped — one switched off in Meta has nothing left to
     drop, and counting it promised the saving twice. */
  const killedWhole = useMemo(() => {
    const running = new Map<string, number>()
    for (const c of liveAds) running.set(adsetKey(c), (running.get(adsetKey(c)) ?? 0) + 1)

    const byKey = new Map<string, Creative[]>()
    for (const k of kill.filter((x) => x.status === 'pending')) {
      const c = creatives.find((x) => x.id === k.creativeId)
      if (!c || !isDelivering(c)) continue
      byKey.set(adsetKey(c), [...(byKey.get(adsetKey(c)) ?? []), c])
    }
    const keys = new Set<string>()
    const whole: Creative[] = []
    for (const [key, ads] of byKey) {
      if (ads.length < (running.get(key) ?? ads.length)) continue
      keys.add(key)
      whole.push(ads[0])
    }
    return { keys, budget: adsetBudget(whole) }
  }, [kill, creatives, liveAds])

  const pendingKillBudget = killedWhole.budget

  /* Today's launches, split by whether they have actually gone up.

     A launch only adds money if it opens an ad set that will not already be
     running: budget lives on the ad set, so a cut dropped into one that
     survives the day adds a cut and nothing else. An ad set being killed
     whole does not survive it — relaunching into one re-opens it, and the
     kill has already handed its budget back.

     A relaunch goes back into the exact ad set its source cut runs in,
     matched on the ad set id because two can share a name. Anything else is
     identified by the ad set name the assignment generated; a card with
     neither is a new ad set, which is the safe assumption since that is the
     case that costs money.

     Ticking one live is the moment its money starts. Before the tick it is
     the "+" column; after it, part of the live figure — Meta will not
     report a brand new ad for hours, so nothing else would show it. This
     used to add every launch row ever marked done, un-scoped to any day,
     while "Launching today" counted the same card again. */
  const surviving = liveAds.filter((c) => !killedWhole.keys.has(adsetKey(c)))
  const survivingKeys = new Set(surviving.map(adsetKey))
  const survivingNames = new Set(surviving.map((c) => c.adset))

  /* Only a relaunch can land somewhere for free — one specific ad going
     back where it came from, so if that ad set survives the day its budget
     is already being spent. Everything else opens a new ad set and new
     money: a Double Down duplicates a winner into one, a new concept is
     one, a manual launch generates a fresh name for one. Same rule as the
     Execute page, and it has to stay the same or the two disagree. */
  const landsInRunningSet = (a: Assignment) => {
    if (a.type !== RELAUNCH_TYPE) return false
    const named = a.adsetName?.trim()
    if (named) return survivingNames.has(named)
    if (!a.sourceCreativeId) return false
    const c = creatives.find((x) => x.id === a.sourceCreativeId)
    return !!c && survivingKeys.has(adsetKey(c))
  }
  const launchCost = (a: Assignment) => {
    if (landsInRunningSet(a)) return 0
    return launches.find((l) => l.assignmentId === a.id)?.dailyBudget
      ?? (a.sourceCreativeId ? creatives.find((c) => c.id === a.sourceCreativeId)?.dailyBudget : undefined)
      ?? 0
  }
  const todaysLaunches = assignments.filter((a) =>
    a.launchDate === TODAY
    && (a.status === 'Launching' || a.status === 'Ad Launched' || a.status === 'Winner Ad'))
  const launchedToday = todaysLaunches.filter((a) => a.status !== 'Launching')
  const newSetsLive = launchedToday.filter((a) => !landsInRunningSet(a)).length

  const totalBudget = adsetBudget(liveAds) + launchedToday.reduce((t, a) => t + launchCost(a), 0)
  const totalSpent = rows.reduce((a, r) => a + r.spent, 0)

  /* What is still to go up today. The ticked ones have moved into the live
     figure above, so counting them here as well would promise the same
     money twice. */
  const pendingLaunchBudget = todaysLaunches
    .filter((a) => a.status === 'Launching')
    .reduce((t, a) => t + launchCost(a), 0)

  /* Grouped by firm, not by Meta campaign. A campaign name is an ad-account
     artefact — "CA | JM | Leads | FS | ABO | 20260817" — and budget is
     decided per firm, so the sections now answer the question actually being
     asked of this page. Ordered by the canonical FIRMS list so a firm and its
     Spanish board stay adjacent, with anything unattributed last. */
  const firms = [...new Set(rows.map((r) => r.firm))].sort((a, b) => {
    const rank = (code: string) => {
      const i = FIRMS.findIndex((f) => f.code === code)
      return i === -1 ? FIRMS.length : i
    }
    return rank(a) - rank(b) || a.localeCompare(b)
  })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Budget Tracker"
        description="Active ad sets and ads only. Updates when a launch or kill is marked done — not when it’s just listed."
      />
      <div className="flex flex-col gap-4 p-6">
        <section aria-label="Budget totals" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Daily budget (live)" value={usd(totalBudget, 0)} /* Counted the way the money is, so the hint and the figure beside it
               cannot disagree — a name shared by two Meta ad sets is two. */
            hint={`${rows.length + launchedToday.length} ads across ${new Set(liveAds.map(adsetKey)).size + newSetsLive} ad sets`} />
          <StatCard label="Spent today" value={usd(totalSpent, 0)} hint={totalBudget ? `${Math.round((totalSpent / totalBudget) * 100)}% of budget` : 'no live budget'} />
          <StatCard label="Pending kills" value={`−${usd(pendingKillBudget, 0)}`} hint="Drops once killed" tone="bad" />
          <StatCard label="Launching today" value={`+${usd(pendingLaunchBudget, 0)}`} hint="not in the live figure yet" tone="good" />
          {/* Where the account lands once today's kills and launches are
              carried out — the number to check against what the firms have
              actually agreed to spend. */}
          <StatCard
            label="Budget after today"
            value={usd(totalBudget - pendingKillBudget + pendingLaunchBudget, 0)}
            hint={`${usd(totalBudget, 0)} − ${usd(pendingKillBudget, 0)} + ${usd(pendingLaunchBudget, 0)}`}
          />
        </section>

        {firms.map((firm) => {
          const items = rows.filter((r) => r.firm === firm)
          /* Same rule per firm: once per ad set, not once per cut. */
          const sum = adsetBudget(items.filter((r) => !r.isNew).map((r) => creatives.find((c) => c.id === r.id)!).filter(Boolean))
            + items.filter((r) => r.isNew).reduce((a, r) => a + r.budget, 0)
          const spent = items.reduce((a, r) => a + r.spent, 0)
          return (
            <section key={firm} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">{firmName(firm)}</h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {usd(spent, 0)} / {usd(sum, 0)} per day · {items.length} {items.length === 1 ? 'ad' : 'ads'}
                </span>
              </div>
              <ul className="divide-y">
                {items.map((r) => {
                  const ratio = r.budget ? r.spent / r.budget : 0
                  const status = r.isNew ? 'New' : ratio > 1.1 ? 'Over' : ratio < 0.5 ? 'Under-delivering' : 'On pace'
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                        <div
                          className={ratio > 1.1 ? 'h-full bg-destructive' : ratio < 0.5 ? 'h-full bg-warning' : 'h-full bg-primary'}
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                      <span className="w-36 text-right tabular-nums text-muted-foreground">
                        {usd(r.spent, 0)} / {usd(r.budget, 0)}
                      </span>
                      <Pill tone={status === 'Over' ? 'red' : status === 'Under-delivering' ? 'amber' : status === 'New' ? 'blue' : 'green'}>
                        {status}
                      </Pill>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
