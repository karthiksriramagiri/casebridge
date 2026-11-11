'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, Skull, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, FirmSelect, matchesQuery, PageHeader, Pill, RangeSelect, SearchBox, Thumb } from '@/app/creative/_components/admin/shared'
import { addDays } from '@/app/creative/_lib/data'
import {
  formatDate,
  isDelivering,
  stageOf,
  adsetKey,
  adsetDupeTags,
  suggestDecision,
  totalsFor,
  usd,
  watchBand,
  watchStreak,
} from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, Decision, RangeKey } from '@/app/creative/_lib/types'
import type { StoredWatch } from '@/app/creative/_lib/board-api'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import { DayNav } from '@/app/creative/_components/admin/day-nav'
import { MetricCells, MetricHead, metricColumns, stickyCell, stickyTint, totalsOf } from '@/app/creative/_components/admin/metric-table'
import { useExpanded } from '@/app/creative/_lib/use-expanded'
import { cn } from '@/lib/utils'


export default function WatchListPage() {
  const { watch, watchAll, kill, creatives, getCreative, killedIds, removeWatch, setWatchDecision, addToKill, relaunch, adsetTotals, hasOutcomes } = useStore()
  /* The same columns Creative Analysis shows, in the same order. */
  const columns = useMemo(() => metricColumns(hasOutcomes), [hasOutcomes])
  /* And the same range selector driving them. The watch list was fixed to
     lifetime, so the figures beside a decision could not be narrowed to the
     window the decision is actually made on — the rules talk about the last
     3 and 7 days. The day nav above picks which day's LIST you are reading;
     this picks how far back its NUMBERS reach. They are different questions
     and now have different controls. */
  const [range, setRange] = useState<RangeKey>('max')
  /* Narrow the list to one firm, the same control Creative Analysis has.
     The list is already grouped by firm; this is for the days when only
     one of them is the job. */
  const [firmFilter, setFirmFilter] = useState('all')
  const [query, setQuery] = useState('')
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
  const { day: date, setDay: setDate, today: realToday } = useStore()
  const prevDay = addDays(date, -1)

  /* Kills are filtered out of today's working list — a decided ad is not
     still awaiting a decision. On a past day they stay, because the record
     of what was on that list is the point of looking. */
  const isToday = date === realToday
  /* And anything switched off in Ads Manager, whether or not it went
     through the kill list. A paused ad is not awaiting a decision — the
     decision has been made somewhere else. */
  const offInMeta = (id: string) => {
    const c = getCreative(id)
    return !!c && !isDelivering(c)
  }
  const live = isToday
    ? watch.filter((w) => !killedIds.has(w.creativeId) && !inKillAny.has(w.creativeId) && !offInMeta(w.creativeId))
    /* A past day reads back as it was, dismissed rows included — they were on
       that list and someone took them off, which is part of the record. */
    : watchAll
  const today = live.filter((w) => w.date === date)
  const yesterday = live.filter((w) => w.date === prevDay)
  const yIds = new Set(yesterday.map((w) => w.creativeId))
  const inKill = new Set(kill.map((k) => k.creativeId))
  const decidedKill = today.filter((w) => w.decision === 'KILL' && !inKill.has(w.creativeId))
  /* Marked for the kill list but not sent yet — the work the header
     button is waiting on. "Undecided" used to count anything without a
     WATCH or KILL label, which on a page where everything is already
     being watched meant counting the normal state as an outstanding job. */
  const markedToKill = decidedKill.length

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
  const allRows = today
    .map((w) => ({ w, c: getCreative(w.creativeId) }))
    .filter((r): r is { w: StoredWatch; c: Creative } => !!r.c)
    .sort((a, b) => (a.c.launchDate < b.c.launchDate ? 1 : -1))
  /* Offered from the day's own rows, so the dropdown never lists a firm
     that would empty the page. */
  const firmsPresent = [...new Set(allRows.map((r) => r.c.firm))]
  const byFirmFilter = firmFilter === 'all' ? allRows : allRows.filter((r) => r.c.firm === firmFilter)
  /* The search sits after the firm filter rather than beside it: the two
     narrow the same list, and a row has to pass both. */
  const rows = byFirmFilter.filter((r) =>
    matchesQuery(query, [r.c.convention, r.c.name, r.c.adId, r.c.adset, r.c.angle, firmName(r.c.firm), r.c.accountLabel, r.w.reason]))

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
  /* KILL marks the decision; it does not send.

     The two steps are deliberate. Nothing on this list leaves it until
     "Send to kill list" is pressed, so a mis-click costs one more click to
     undo rather than putting an ad on the kill list that has to be fished
     back out. The header button is the one action that writes.

     There is no WATCH button any more: everything on this page is already
     on the watch list, so the only decision left to make is whether it
     comes off. */
  const killOne = (w: StoredWatch) => {
    setWatchDecision(w.id, w.decision === 'KILL' ? undefined : 'KILL')
  }

  /* The same three actions, applied to every ad in the set. A set is the
     unit the decision is made on, so doing it one creative at a time is
     only a way to leave half of it done. */
  const killSet = (items: { w: StoredWatch }[], on: boolean) => {
    for (const { w } of items) setWatchDecision(w.id, on ? 'KILL' : undefined)
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

  /* The same two icons as the ad-set row above, and as Creative Analysis.
     The decision still reads at a glance: a cut marked WATCH shows a filled
     eye, one marked KILL a filled skull. */
  /* One button per cut: KILL, on or off. WATCH is gone — a cut is on the
     watch list already, so marking it "watch" said nothing the page was not
     saying by showing it. */
  const DecisionToggle = ({ w }: { w: StoredWatch }) => (
    <Button
      size="icon-sm"
      aria-pressed={w.decision === 'KILL'}
      aria-label={w.decision === 'KILL' ? 'Clear the KILL decision on this cut' : 'Mark this cut KILL'}
      title={w.decision === 'KILL' ? 'Marked KILL — click to clear' : 'KILL — mark it, then press Send to kill list'}
      variant={w.decision === 'KILL' ? 'destructive' : 'ghost'}
      disabled={inKill.has(w.creativeId)}
      onClick={() => killOne(w)}
    >
      <Skull aria-hidden />
    </Button>
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><DayNav date={date} onChange={setDate} label="Watch list day" /></div>
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search the watch list"
            placeholder="Search name, ad set, firm, ad ID"
            className="max-w-[16rem]"
          />
          <FirmSelect value={firmFilter} onChange={setFirmFilter} firms={firmsPresent} />
          <RangeSelect value={range} onChange={setRange} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill tone="blue">NEW = Day 1–3, judged on launch-to-date</Pill>
          <Pill>ACTIVE = Day 4+, judged on 7d trend</Pill>
          <Pill tone="amber">T&amp;Y CPL $250–299 = review</Pill>
          <Pill tone="red">Red = 2+ days in a row</Pill>
          {markedToKill > 0 && <Pill tone="red">{markedToKill} marked KILL — not sent yet</Pill>}
        </div>

        {live.length === 0 ? (
          <EmptyState title={isToday ? 'Watch list is empty' : `Nothing was watched on ${formatDate(date)}`}>
            {isToday ? 'Use Watch List Mode in Creative Analysis to add ad sets.' : 'Step back to another day, or return to today.'}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">
                  {isToday ? 'Today' : 'That day'} <span className="font-normal text-muted-foreground">· {formatDate(date)}</span>
                </h2>
                <span className="text-sm text-muted-foreground">
                  {byFirm.reduce((n, [, sets]) => n + sets.length, 0)} ad sets · {rows.length} ads
                </span>
              </div>

              {/* The firm filter can empty a list that is not actually empty.
                  Saying so beats a header claiming 0 ad sets over blank
                  space. */}
              {byFirm.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? `Nothing on this day matches “${query.trim()}”${firmFilter === 'all' ? '' : ` in ${firmName(firmFilter)}`}.`
                    : `Nothing on the watch list for ${firmName(firmFilter)} on this day.`}
                </p>
              )}
              {byFirm.map(([firm, sets]) => (
                <div key={firm}>
                  <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs">
                    <span className="font-semibold">{firmName(firm)}</span>
                    <span className="text-muted-foreground">
                      {sets.length} ad set{sets.length === 1 ? '' : 's'} · {sets.reduce((n, g) => n + g.items.length, 0)} ads
                    </span>
                  </div>

                  {/* The same columns Creative Analysis shows, in the same
                      order. This list used to say all of it as a wrapping
                      row of eight pills — T&Y spend, T&Y CPL, CPL week on
                      week, Life CPA, budget — which put every figure in a
                      different place on every row. Wide on purpose, and it
                      scrolls inside its own box so the page never does. */}
                  <div className="overflow-x-auto">
                    {/* No min-width: the whole row has to be readable without scrolling
                        sideways, so the table fits the page and the ad set name
                        — the one thing that can be any length — truncates
                        instead. */}
                    <table className="w-full min-w-[1100px] text-sm">
                      <MetricHead
                        columns={columns}
                        lead={
                          <>
                            <th scope="col" className="w-10 px-3 py-2.5" />
                            <th scope="col" className="px-3 py-2.5 text-left font-medium">Ad set</th>
                          </>
                        }
                      />

                      {sets.map((g) => {
                        const ids = g.items.map((r) => r.c.id)
                        const head = g.items[0].c
                        const streak = Math.max(...g.items.map((r) => watchStreak(r.c.id, watch)))
                        const suggestion = suggestDecision(head, streak, adsetTotals)
                        const repeat = streak >= 2
                        const decided = g.items.every((r) => r.w.decision === 'KILL')
                        const anyInKill = g.items.some((r) => inKill.has(r.c.id))
                        const isOpen = open.has(g.key)
                        const setAds = g.items.map((r) => r.c)

                        return (
                          <tbody key={g.key} className="border-t">
                            <tr className={cn('bg-card hover:bg-muted/40', repeat && 'bg-destructive/5')}>
                              <td className="px-3 py-2 align-top">
                                <button
                                  type="button"
                                  onClick={() => toggleOpen(g.key)}
                                  aria-expanded={isOpen}
                                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.adset}`}
                                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                                </button>
                              </td>

                              <td className="max-w-[460px] px-3 py-2">
                                {/* Laid out exactly like Creative Analysis: the
                                    name in the body face on one line, then one
                                    muted line of firm and tags. It used to run
                                    to four lines — a monospaced name, a row of
                                    pills, the reason, and the suggestion —
                                    which made every row three times the height
                                    of the same ad on the analysis page and
                                    nothing lined up between them. The reason
                                    and the suggestion are still here, as a tag
                                    and its tooltip. */}
                                <div className="flex items-center gap-2.5">
                                  <Thumb c={head} />
                                  <div className="flex min-w-0 flex-col gap-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleOpen(g.key)}
                                      className={cn('truncate text-left font-medium hover:text-primary', repeat && 'text-destructive')}
                                    >
                                      {g.adset}
                                    </button>
                                    {/* One line, always. With `flex-wrap` the
                                        firm, the ad count and each tag took a
                                        line of their own in a column this
                                        width — a four-line cell and a 93px
                                        row, three times the height of the same
                                        ad on Creative Analysis. It truncates
                                        now; the full name is on the row above
                                        and the detail is on hover. */}
                                    <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                                      <span className="min-w-0 shrink truncate text-[11px] text-muted-foreground">
                                        {firmName(firm)}
                                      </span>
                                      <span className="shrink-0">
                                        <Pill>{g.items.length} ad{g.items.length === 1 ? '' : 's'}</Pill>
                                      </span>
                                      {/* Why it is on the list, and what the rules
                                          say to do about it — one tag, the detail
                                          on hover, instead of two full lines. */}
                                      <span className="shrink-0" title={`Suggested ${suggestion.decision}${suggestion.why ? ` — ${suggestion.why}` : ''}${g.items[0].w.reason ? ` · on the list because: ${g.items[0].w.reason}` : ''}`}>
                                        <Pill tone={suggestion.decision === 'KILL' ? 'red' : 'blue'}>
                                          {suggestion.decision}?
                                        </Pill>
                                      </span>
                                      <span className="shrink-0">{dupeTags.get(g.key) && <Pill tone="amber">{dupeTags.get(g.key)} with this name</Pill>}</span>
                                      <span className="shrink-0">{streak >= 2 && <Pill tone="red">Day {streak} in a row</Pill>}</span>
                                      <span className="shrink-0">{watchBand(head, adsetTotals) === 'review' && <Pill tone="amber">Review band</Pill>}</span>
                                      {!isToday && g.items.every((r) => r.w.removed) && <Pill>Taken off the list</Pill>}
                                      {!isToday && g.items.some((r) => r.w.decision === 'KILL') && <Pill tone="red">Decided KILL</Pill>}
                                      {anyInKill && (
                                        <Pill tone="red">
                                          <Skull className="size-3" aria-hidden /> on today’s kill list
                                        </Pill>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <MetricCells columns={columns} t={totalsOf(setAds, range)} ads={setAds} />

                              {/* Acting on the set, which is the decision being made.
                                  A past day is a record and shows no controls — a row
                                  of dead buttons invites a click that writes today's
                                  kill against last week's list. */}
                              <td className={cn('whitespace-nowrap px-3 py-2 align-top', stickyCell)}>
                                {/* The same four icon buttons Creative Analysis
                                    uses, in the same place. Labelled WATCH/KILL
                                    buttons were twice the width and pushed the
                                    last column under the pinned edge; the
                                    decision still reads at a glance because a
                                    set already marked WATCH shows its eye
                                    filled in. */}
                                {isToday && (
                                  <div className="relative flex items-center justify-end gap-1">
                                    <Button
                                      size="icon-sm"
                                      aria-pressed={decided}
                                      variant={decided ? 'destructive' : 'ghost'}
                                      disabled={!isToday || anyInKill}
                                      onClick={() => killSet(g.items, !decided)}
                                      aria-label={decided ? `Clear the KILL decision on ${g.adset}` : `Mark ${g.adset} KILL`}
                                      title={decided ? 'Marked KILL — click to clear' : 'KILL — mark the set, then press Send to kill list'}
                                    >
                                      <Skull aria-hidden />
                                    </Button>
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      disabled={!isToday || anyInKill}
                                      onClick={() => relaunchSet(g.items, g.adset)}
                                      aria-label={`Relaunch ${g.adset}`}
                                      title="Relaunch — kill this ad set and put fresh versions in today's launch queue"
                                    >
                                      <RefreshCw aria-hidden />
                                    </Button>
                                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${g.adset} from the watch list`} onClick={() => removeSet(g.items)}>
                                      <Trash2 aria-hidden />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>

                            {isOpen && g.items.map(({ w, c }) => {
                              return (
                                <tr key={w.id} className="border-t border-dashed bg-muted/20 hover:bg-muted/40">
                                  <td className="px-3 py-2" />
                                  <td className="max-w-[460px] py-2 pl-8 pr-3">
                                    <div className="flex items-start gap-2.5 border-l-2 border-border pl-3">
                                      <Thumb c={c} />
                                      <div className="flex min-w-0 flex-col gap-1">
                                        <span className="truncate font-medium">{c.convention}</span>
                                        <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                                          <span className="min-w-0 shrink truncate text-[11px] text-muted-foreground">
                                            {c.angle} · launched {formatDate(c.launchDate)}
                                          </span>
                                          <span className="shrink-0">
                                            <Pill tone={stageOf(c) === 'NEW' ? 'blue' : 'muted'}>{stageOf(c)}</Pill>
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <MetricCells columns={columns} t={totalsFor(c, range)} ads={[c]} />

                                  {/* One cut can still be pulled on its own — a broken
                                      render, the wrong disclaimer — without touching
                                      the rest of the set. */}
                                  <td className={cn('whitespace-nowrap px-3 py-2 align-top', stickyTint)}>
                                    {isToday && (
                                      <div className="relative flex items-center justify-end gap-1">
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
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        )
                      })}
                    </table>
                  </div>
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
