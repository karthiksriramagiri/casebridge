'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, RefreshCw, Skull, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, PageHeader, Pill, Thumb } from '@/app/creative/_components/admin/shared'
import { TODAY, addDays } from '@/app/creative/_lib/data'
import {
  formatDate,
  lastNDays,
  spendSinceLastLead,
  stageOf,
  adsetKey,
  adsetDupeTags,
  adsetOf,
  GOOD_CPA,
  sumTotals,
  suggestDecision,
  totalsFor,
  usd,
  watchBand,
  watchStreak,
} from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, Decision } from '@/app/creative/_lib/types'
import type { StoredWatch } from '@/app/creative/_lib/board-api'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import { DayNav } from '@/app/creative/_components/admin/day-nav'
import { WeekOnWeek } from '@/app/creative/_components/admin/week-on-week'
import { useExpanded } from '@/app/creative/_lib/use-expanded'
import { cn } from '@/lib/utils'

/** NEW: launch-to-date only. ACTIVE: 3D/5D/7D/14D/30D/Life CPL, Week on Week and spend since last lead. */
function TrendStrip({ c }: { c: Creative }) {
  const life = totalsFor(c, 'max')
  if (stageOf(c) === 'NEW') {
    return (
      <p className="text-xs text-muted-foreground">
        Since launch: <span className="font-medium text-foreground">{usd(life.spend, 0)}</span> spend ·{' '}
        <span className="font-medium text-foreground">{life.leads}</span> leads · CPL{' '}
        <span className="font-medium text-foreground">{usd(life.cpl, 0)}</span>
      </p>
    )
  }
  const cells = [
    { label: '3D', v: lastNDays(c, 3).cpl },
    { label: '5D', v: lastNDays(c, 5).cpl },
    { label: '7D', v: lastNDays(c, 7).cpl },
    { label: '14D', v: lastNDays(c, 14).cpl },
    { label: '30D', v: lastNDays(c, 30).cpl },
    { label: 'Life', v: life.cpl },
  ]
  const sinceLead = spendSinceLastLead(c)
  return (
    <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {cells.map((x) => (
        <div key={x.label} className="flex gap-1">
          <dt className="text-muted-foreground">{x.label}</dt>
          <dd className={cn('font-medium tabular-nums', (x.v === null || x.v >= 300) && 'text-destructive')}>{usd(x.v, 0)}</dd>
        </div>
      ))}
      <div className="flex gap-1">
        <dt className="text-muted-foreground">WoW</dt>
        <dd><WeekOnWeek ads={[c]} /></dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Since last lead</dt>
        <dd className="font-medium tabular-nums">{usd(sinceLead, 0)}</dd>
      </div>
    </dl>
  )
}

export default function WatchListPage() {
  const { watch, watchAll, kill, creatives, getCreative, killedIds, removeWatch, setWatchDecision, addToKill, relaunch, adsetTotals } = useStore()
  /* Two ad sets can share a name. Tagged beside the name rather than run
     into it — the name is copied into Ads Manager and must stay exact. */
  const dupeTags = useMemo(() => adsetDupeTags(creatives), [creatives])
  /* Anything already on the kill list is off this list, pending or done.
     Filtering on `killedIds` alone only caught kills that had been carried
     out in Ads Manager, so a creative sat here with a KILL decision and an
     "on today's kill list" tag beside it — decided, but still asking to be
     decided. */
  const inKillAny = new Set(kill.map((k) => k.creativeId))

  /* The day being looked at. Every row carries its date, so an earlier list
     is read back exactly as it was left rather than being reconstructed. */
  /* The day comes from the store, not from here. Every page in the center
     reads the same one, so the numbers and the boards can never disagree
     about what day it is. */
  const { day: date, setDay: setDate } = useStore()
  const prevDay = addDays(date, -1)

  /* Kills are filtered out of today's working list — a decided ad is not
     still awaiting a decision. On a past day they stay, because the record
     of what was on that list is the point of looking. */
  const isToday = date === TODAY
  const live = isToday
    ? watch.filter((w) => !killedIds.has(w.creativeId) && !inKillAny.has(w.creativeId))
    /* A past day reads back as it was, dismissed rows included — they were on
       that list and someone took them off, which is part of the record. */
    : watchAll
  const today = live.filter((w) => w.date === date)
  const yesterday = live.filter((w) => w.date === prevDay)
  const yIds = new Set(yesterday.map((w) => w.creativeId))
  const inKill = new Set(kill.map((k) => k.creativeId))
  const decidedKill = today.filter((w) => w.decision === 'KILL' && !inKill.has(w.creativeId))
  const undecided = today.filter((w) => !w.decision).length

  /* Grouped by firm, not by Meta campaign — the campaign name is an
     ad-account artefact, while the decision being made here is a firm's.
     Ordered by the canonical FIRMS list so a firm and its Spanish board stay
     adjacent, with anything unattributed last. */
  /* Firm, then ad set, then the creatives inside it.

     The decision being made on this page is an ad set's: Meta spends across
     the cuts in a set as it likes, the watch rules already read the set's
     numbers, and killing one creative out of a live set is not a thing
     anyone does. So the ad set is the row, and its creatives sit behind a
     chevron the way they do in Creative Analysis — there when you want to
     see which cut is carrying the set, out of the way when you are working
     down the list. */
  const rows = today
    .map((w) => ({ w, c: getCreative(w.creativeId) }))
    .filter((r): r is { w: StoredWatch; c: Creative } => !!r.c)
    .sort((a, b) => (a.c.launchDate < b.c.launchDate ? 1 : -1))

  type SetGroup = { key: string; adset: string; items: { w: StoredWatch; c: Creative }[] }

  const byFirm = Object.entries(
    rows.reduce<Record<string, Record<string, SetGroup>>>((acc, r) => {
      const firm = (acc[r.c.firm] ??= {})
      const k = adsetKey(r.c)
      ;(firm[k] ??= { key: k, adset: r.c.adset, items: [] }).items.push(r)
      return acc
    }, {}),
  )
    .sort(([a], [b]) => {
      const rank = (code: string) => {
        const i = FIRMS.findIndex((f) => f.code === code)
        return i === -1 ? FIRMS.length : i
      }
      return rank(a) - rank(b) || a.localeCompare(b)
    })
    .map(([firm, sets]) => [firm, Object.values(sets)] as const)

  const { open, toggle: toggleOpen } = useExpanded(`cc:watch-open:${date}`)

  const sendKills = () => {
    const n = addToKill(decidedKill.map((w) => w.creativeId))
    toast(n ? `Sent ${n} to the kill list` : 'Nothing new to send')
  }

  /* Relaunch: take it down and put a fresh version up, in one action.

     An ad that wore out is still a winner — the audience has had enough of
     this cut, not of the idea. Killing it and queuing the replacement are
     always done together, and doing them on two screens is how one of the
     two gets forgotten. The kill is what comes off today; the launch is what
     goes up in its place, with the convention bumped to the next version. */
  /* KILL is the action, not a label. Marking the decision and then pressing
     a second button to send it was the step that left creatives sitting here
     already decided — so the button does the thing it says. WATCH stays a
     toggle, because watching is a decision to wait. */
  const killOne = (creativeId: string) => {
    addToKill([creativeId])
    toast('Sent to the kill list')
  }

  /* The same three actions, applied to every ad in the set. A set is the
     unit the decision is made on, so doing it one creative at a time is
     only a way to leave half of it done. */
  const killSet = (ids: string[], label: string) => {
    const n = addToKill(ids)
    toast(n ? `${label} — ${n} ad${n === 1 ? '' : 's'} sent to the kill list` : 'Already on the kill list')
  }
  const watchSet = (items: { w: StoredWatch }[], on: boolean) => {
    for (const { w } of items) setWatchDecision(w.id, on ? 'WATCH' : undefined)
  }
  const relaunchSet = (items: { w: StoredWatch; c: Creative }[], label: string) => {
    for (const { c } of items) {
      addToKill([c.id])
      relaunch(c.id)
    }
    toast(`${label} — ${items.length} queued to relaunch today`)
  }
  const removeSet = (items: { w: StoredWatch }[]) => {
    for (const { w } of items) removeWatch(w.id)
  }

  const relaunchOne = (creativeId: string, name: string) => {
    addToKill([creativeId])
    relaunch(creativeId)
    toast(`“${name}” killed and queued to relaunch today`)
  }

  const DecisionToggle = ({ w }: { w: StoredWatch }) => (
    <div role="radiogroup" aria-label="Decision" className="flex overflow-hidden rounded-md border">
      {(['WATCH', 'KILL'] as Decision[]).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={w.decision === d}
          disabled={inKill.has(w.creativeId)}
          onClick={() =>
            d === 'KILL'
              ? killOne(w.creativeId)
              : setWatchDecision(w.id, w.decision === d ? undefined : d)
          }
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
            w.decision === d ? (d === 'KILL' ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground') : 'bg-card hover:bg-muted',
          )}
        >
          {d === 'KILL' ? <Skull className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
          {d}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Watch List"
        description="Decisions are made on the ad set. Open one to see the cuts inside it."
        actions={
          <Button variant="destructive" disabled={!isToday || !decidedKill.length} onClick={sendKills}>
            <Skull aria-hidden /> Send {decidedKill.length || ''} to kill list
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <BoardStatus migration="supabase/migration_creative_board.sql" />
        <DayNav date={date} onChange={setDate} label="Watch list day" />
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill tone="blue">NEW = Day 1–3, judged on launch-to-date</Pill>
          <Pill>ACTIVE = Day 4+, judged on 7d trend</Pill>
          <Pill tone="amber">T&amp;Y CPL $250–299 = review</Pill>
          <Pill tone="red">Red = 2+ days in a row</Pill>
          {undecided > 0 && <Pill tone="amber">{undecided} still need a decision</Pill>}
        </div>

        {live.length === 0 ? (
          <EmptyState title={isToday ? 'Watch list is empty' : `Nothing was watched on ${formatDate(date)}`}>
            {isToday ? 'Use Watch List Mode in Creative Analysis to add ad sets.' : 'Step back to another day, or return to today.'}
          </EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">
                  {isToday ? 'Today' : 'That day'} <span className="font-normal text-muted-foreground">· {formatDate(date)}</span>
                </h2>
                <span className="text-sm text-muted-foreground">
                  {byFirm.reduce((n, [, sets]) => n + sets.length, 0)} ad sets · {today.length} ads
                </span>
              </div>
              {byFirm.map(([firm, sets]) => (
                <div key={firm}>
                  <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs">
                    <span className="font-semibold">{firmName(firm)}</span>
                    <span className="text-muted-foreground">
                      {sets.length} ad set{sets.length === 1 ? '' : 's'} · {sets.reduce((n, g) => n + g.items.length, 0)} ads
                    </span>
                  </div>

                  {sets.map((g) => {
                    const ids = g.items.map((r) => r.c.id)
                    const head = g.items[0].c
                    const set = adsetOf(head, adsetTotals)
                    const setLife = sumTotals(g.items.map((r) => totalsFor(r.c, 'max')))
                    const streak = Math.max(...g.items.map((r) => watchStreak(r.c.id, watch)))
                    const suggestion = suggestDecision(head, streak, adsetTotals)
                    const repeat = streak >= 2
                    const decided = g.items.every((r) => r.w.decision === 'WATCH')
                    const anyInKill = g.items.some((r) => inKill.has(r.c.id))
                    const isOpen = open.has(g.key)
                    const budget = g.items.reduce((n, r) => n + r.c.dailyBudget, 0)

                    return (
                      <div key={g.key} className="border-b last:border-b-0">
                        <div className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start', repeat && 'bg-destructive/5')}>
                          <button
                            type="button"
                            onClick={() => toggleOpen(g.key)}
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.adset}`}
                            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                          </button>

                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <button
                              type="button"
                              onClick={() => toggleOpen(g.key)}
                              className={cn('truncate text-left font-mono text-sm font-medium hover:underline', repeat && 'text-destructive')}
                            >
                              {g.adset}
                            </button>
                            <p className="text-xs text-muted-foreground">{g.items[0].w.reason}</p>
                            <div className="flex flex-wrap gap-1">
                              {dupeTags.get(g.key) && <Pill tone="amber">{dupeTags.get(g.key)} with this name</Pill>}
                              <Pill>{g.items.length} ad{g.items.length === 1 ? '' : 's'}</Pill>
                              {streak >= 2 && <Pill tone="red">Day {streak} in a row</Pill>}
                              {watchBand(head, adsetTotals) === 'review' && <Pill tone="amber">Review band</Pill>}
                              {!isToday && g.items.every((r) => r.w.removed) && <Pill>Taken off the list</Pill>}
                              {!isToday && g.items.some((r) => r.w.decision === 'KILL') && <Pill tone="red">Decided KILL</Pill>}
                              {anyInKill && (
                                <Pill tone="red">
                                  <Skull className="size-3" aria-hidden /> on today’s kill list
                                </Pill>
                              )}
                              {/* "T&Y" alone was the spend and "T&Y CPL" the
                                  cost per lead, which only reads as two
                                  different things once you already know. */}
                              <Pill>T&amp;Y spend {usd(set.ty.spend, 0)}</Pill>
                              <Pill>T&amp;Y CPL {usd(set.ty.cpl, 0)}</Pill>
                              {/* Last week against this one. It carries the
                                  7-day CPL that used to sit here on its own,
                                  plus what it was the week before. */}
                              <Pill>
                                CPL <WeekOnWeek ads={g.items.map((r) => r.c)} />
                              </Pill>
                              {/* Cost per signed case, over the ad set's whole
                                  run. Lifetime rather than the T&Y window
                                  because cases sign days after the click, so
                                  a two-day CPA is almost always "—" and says
                                  nothing about whether the set pays. */}
                              <Pill tone={setLife.cpa !== null && setLife.cpa <= GOOD_CPA ? 'green' : undefined}>
                                Life CPA {usd(setLife.cpa, 0)}
                              </Pill>
                              <Pill>{usd(budget, 0)}/day</Pill>
                            </div>
                            <p className="text-xs">
                              <span className="text-muted-foreground">Suggested: </span>
                              <span className={cn('font-medium', suggestion.decision === 'KILL' ? 'text-destructive' : 'text-primary')}>
                                {suggestion.decision}
                              </span>
                              <span className="text-muted-foreground"> — {suggestion.why}</span>
                            </p>
                          </div>

                          {/* Acting on the set, which is the decision being made. A
                              past day is a record and shows no controls — a row
                              of dead buttons invites a click that writes today's
                              kill against last week's list. */}
                          {isToday && (
                          <div className="flex shrink-0 items-center gap-1">
                            <div role="group" aria-label="Decision" className="flex overflow-hidden rounded-md border">
                              <button
                                type="button"
                                aria-pressed={decided}
                                disabled={!isToday || anyInKill}
                                onClick={() => watchSet(g.items, !decided)}
                                className={cn(
                                  'flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                                  decided ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
                                )}
                              >
                                <Eye className="size-3" aria-hidden /> WATCH
                              </button>
                              <button
                                type="button"
                                disabled={!isToday || anyInKill}
                                onClick={() => killSet(ids, g.adset)}
                                className="flex items-center gap-1 bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                              >
                                <Skull className="size-3" aria-hidden /> KILL
                              </button>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!isToday || anyInKill}
                              onClick={() => relaunchSet(g.items, g.adset)}
                              title="Kill this ad set and put fresh versions in today's launch queue"
                            >
                              <RefreshCw aria-hidden /> Relaunch
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${g.adset} from the watch list`} onClick={() => removeSet(g.items)}>
                              <Trash2 aria-hidden />
                            </Button>
                          </div>
                          )}
                        </div>

                        {isOpen && (
                          <ul className="divide-y border-t bg-muted/20">
                            {g.items.map(({ w, c }) => {
                              const ty = totalsFor(c, 'ty')
                              const life = totalsFor(c, 'max')
                              return (
                                <li key={w.id} className="flex flex-col gap-2 py-2.5 pl-12 pr-4 sm:flex-row sm:items-start">
                                  <Thumb c={c} />
                                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <code className="truncate font-mono text-xs font-medium">{c.convention}</code>
                                    <div className="flex flex-wrap gap-1">
                                      <Pill tone={stageOf(c) === 'NEW' ? 'blue' : 'muted'}>{stageOf(c)}</Pill>
                                      <Pill>T&amp;Y spend {usd(ty.spend, 0)}</Pill>
                                      <Pill>T&amp;Y CPL {usd(ty.cpl, 0)}</Pill>
                                      <Pill tone={life.cpa !== null && life.cpa <= GOOD_CPA ? 'green' : undefined}>
                                        Life CPA {usd(life.cpa, 0)}
                                      </Pill>
                                      <Pill>Launched {formatDate(c.launchDate)}</Pill>
                                    </div>
                                    <TrendStrip c={c} />
                                  </div>
                                  {/* One cut can still be pulled on its own —
                                      a broken render, the wrong disclaimer —
                                      without touching the rest of the set. */}
                                  {isToday && (
                                  <div className="flex shrink-0 items-center gap-1">
                                    <DecisionToggle w={w} />
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={`Remove ${c.convention} from the watch list`}
                                      onClick={() => removeWatch(w.id)}
                                    >
                                      <Trash2 aria-hidden />
                                    </Button>
                                  </div>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </section>

            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">
                  Day before <span className="font-normal text-muted-foreground">· {formatDate(prevDay)}</span>
                </h2>
                <span className="text-sm text-muted-foreground">{yesterday.length} creatives</span>
              </div>
              {yesterday.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">Nothing on this list.</p>
              ) : (
                <ul className="divide-y">
                  {yesterday.map((w) => {
                    const c = getCreative(w.creativeId)
                    if (!c) return null
                    const stillOn = today.some((t) => t.creativeId === c.id)
                    return (
                      <li key={w.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Thumb c={c} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <code className={cn('truncate font-mono text-xs', stillOn && 'text-destructive')}>{c.convention}</code>
                          <p className="truncate text-xs text-muted-foreground">{w.reason}</p>
                        </div>
                        {stillOn ? <Pill tone="red">Still on today</Pill> : <Pill tone="green">Recovered</Pill>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
