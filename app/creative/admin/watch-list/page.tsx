'use client'

import { Eye, RefreshCw, Skull, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, PageHeader, Pill, Thumb } from '@/app/creative/_components/admin/shared'
import { TODAY, YESTERDAY } from '@/app/creative/_lib/data'
import {
  formatDate,
  lastNDays,
  spendSinceLastLead,
  stageOf,
  suggestDecision,
  totalsFor,
  usd,
  watchBand,
  watchStreak,
  weekOnWeek,
} from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, Decision, WatchItem } from '@/app/creative/_lib/types'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
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
  const wow = weekOnWeek(c)
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
        <dd className={cn('font-medium tabular-nums', wow.change !== null && (wow.change > 0 ? 'text-destructive' : 'text-success'))}>
          {wow.change === null ? '—' : `${wow.change > 0 ? '+' : ''}${(wow.change * 100).toFixed(0)}%`}
        </dd>
      </div>
      <div className="flex gap-1">
        <dt className="text-muted-foreground">Since last lead</dt>
        <dd className="font-medium tabular-nums">{usd(sinceLead, 0)}</dd>
      </div>
    </dl>
  )
}

export default function WatchListPage() {
  const { watch, kill, getCreative, killedIds, removeWatch, setWatchDecision, addToKill, relaunch } = useStore()
  /* Anything already on the kill list is off this list, pending or done.
     Filtering on `killedIds` alone only caught kills that had been carried
     out in Ads Manager, so a creative sat here with a KILL decision and an
     "on today's kill list" tag beside it — decided, but still asking to be
     decided. */
  const inKillAny = new Set(kill.map((k) => k.creativeId))
  const live = watch.filter((w) => !killedIds.has(w.creativeId) && !inKillAny.has(w.creativeId))
  const today = live.filter((w) => w.date === TODAY)
  const yesterday = live.filter((w) => w.date === YESTERDAY)
  const yIds = new Set(yesterday.map((w) => w.creativeId))
  const inKill = new Set(kill.map((k) => k.creativeId))
  const decidedKill = today.filter((w) => w.decision === 'KILL' && !inKill.has(w.creativeId))
  const undecided = today.filter((w) => !w.decision).length

  /* Grouped by firm, not by Meta campaign — the campaign name is an
     ad-account artefact, while the decision being made here is a firm's.
     Ordered by the canonical FIRMS list so a firm and its Spanish board stay
     adjacent, with anything unattributed last. */
  const byFirm = Object.entries(
    today
      .map((w) => ({ w, c: getCreative(w.creativeId) }))
      .filter((r): r is { w: WatchItem; c: Creative } => !!r.c)
      .sort((a, b) => (a.c.launchDate < b.c.launchDate ? 1 : -1))
      .reduce<Record<string, { w: WatchItem; c: Creative }[]>>((acc, r) => {
        ;(acc[r.c.firm] ??= []).push(r)
        return acc
      }, {}),
  ).sort(([a], [b]) => {
    const rank = (code: string) => {
      const i = FIRMS.findIndex((f) => f.code === code)
      return i === -1 ? FIRMS.length : i
    }
    return rank(a) - rank(b) || a.localeCompare(b)
  })

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

  const relaunchOne = (creativeId: string, name: string) => {
    addToKill([creativeId])
    relaunch(creativeId)
    toast(`“${name}” killed and queued to relaunch today`)
  }

  const DecisionToggle = ({ w }: { w: WatchItem }) => (
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
        description="Every creative here gets a decision. Only KILL decisions carry through — Watch List → Decision → Kill List."
        actions={
          <Button variant="destructive" disabled={!decidedKill.length} onClick={sendKills}>
            <Skull aria-hidden /> Send {decidedKill.length || ''} to kill list
          </Button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <BoardStatus migration="supabase/migration_creative_board.sql" />
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill tone="blue">NEW = Day 1–3, judged on launch-to-date</Pill>
          <Pill>ACTIVE = Day 4+, judged on 7d trend</Pill>
          <Pill tone="amber">T&amp;Y CPL $250–299 = review</Pill>
          <Pill tone="red">Red = 2+ days in a row</Pill>
          {undecided > 0 && <Pill tone="amber">{undecided} still need a decision</Pill>}
        </div>

        {live.length === 0 ? (
          <EmptyState title="Watch list is empty">Use Watch List Mode in Creative Analysis to add creatives.</EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">
                  Today <span className="font-normal text-muted-foreground">· {formatDate(TODAY)}</span>
                </h2>
                <span className="text-sm text-muted-foreground">{today.length} creatives</span>
              </div>
              {byFirm.map(([firm, items]) => (
              <div key={firm}>
              <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-1.5 text-xs">
                <span className="font-semibold">{firmName(firm)}</span>
                <span className="text-muted-foreground">{items.length} · newest launch first</span>
              </div>
              <ul className="divide-y border-b">
                {items.map(({ w, c }) => {
                  const streak = watchStreak(c.id, watch)
                  const stage = stageOf(c)
                  const suggestion = suggestDecision(c, streak)
                  const ty = totalsFor(c, 'ty')
                  const life = totalsFor(c, 'max')
                  const repeat = streak >= 2
                  return (
                    <li key={w.id} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start', repeat && 'bg-destructive/5')}>
                      <Thumb c={c} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <code className={cn('truncate font-mono text-sm font-medium', repeat && 'text-destructive')}>{c.convention}</code>
                        <p className="text-xs text-muted-foreground">{w.reason}</p>
                        <div className="flex flex-wrap gap-1">
                          <Pill tone={stage === 'NEW' ? 'blue' : 'muted'}>{stage}</Pill>
                          {streak >= 2 && <Pill tone="red">Day {streak} in a row</Pill>}
                          {watchBand(c) === 'review' && <Pill tone="amber">Review band</Pill>}
                          {/* Same wording as the tag on Creative Analysis — the
                              two lists describe the same state and should not
                              call it two different things. */}
                          {inKill.has(c.id) && (
                            <Pill tone="red">
                              <Skull className="size-3" aria-hidden /> on today’s kill list
                            </Pill>
                          )}
                          <Pill>T&amp;Y {usd(ty.spend, 0)}</Pill>
                          <Pill>Life CPA {usd(life.cpa, 0)}</Pill>
                          <Pill>Launched {formatDate(c.launchDate)}</Pill>
                        </div>
                        <TrendStrip c={c} />
                        <p className="text-xs">
                          <span className="text-muted-foreground">Suggested: </span>
                          <span className={cn('font-medium', suggestion.decision === 'KILL' ? 'text-destructive' : 'text-primary')}>
                            {suggestion.decision}
                          </span>
                          <span className="text-muted-foreground"> — {suggestion.why}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <DecisionToggle w={w} />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={inKill.has(c.id)}
                          onClick={() => relaunchOne(c.id, c.convention || c.name)}
                          title="Kill this version and put a fresh one in today's launch queue"
                        >
                          <RefreshCw aria-hidden /> Relaunch
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Remove from watch list" onClick={() => removeWatch(w.id)}>
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              </div>
              ))}
            </section>

            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">
                  Yesterday <span className="font-normal text-muted-foreground">· {formatDate(YESTERDAY)}</span>
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
