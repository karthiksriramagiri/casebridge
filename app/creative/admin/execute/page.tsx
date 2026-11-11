'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Download, Eye, Rocket, Skull, Trophy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { downloadCsv, EmptyState, matchesQuery, PageHeader, Pill, SearchBox, StatCard } from '@/app/creative/_components/admin/shared'
import { PriorityStars } from '@/app/creative/_components/admin/priority-stars'
import { AssignmentDetailSheet } from '@/app/creative/_components/assignment-detail-sheet'
import { addDays } from '@/app/creative/_lib/data'
import { adsetBudget, adsetKey, formatMix, isDelivering, formatDate, sumTotals, totalsFor, usd, WINNER_ADSET_CPL } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import {
  FIRM_KEYS, FIRM_KEY_LABEL, firmKey, RELAUNCH_TYPE,
  type Assignment, type Creative, type FirmKey, type KillItem, type WatchItem,
} from '@/app/creative/_lib/types'
import type { StoredWatch } from '@/app/creative/_lib/board-api'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Execute — the ad meeting, on one page

   The meeting has been run off a Notion page per firm, rebuilt by hand every
   morning: what we are killing, what we are watching, what is running and at
   what budget, and what goes live today. Four questions, and every one of
   them is already answered somewhere in this center — that page existed only
   because nothing put them side by side.

   So this compiles them. Nothing here is a new list: it is the kill list, the
   watch list, the live account and the launch list, cut by firm and stacked
   in the order the meeting runs. Ticking something here does the same thing
   as ticking it on its own page, because it is the same record.
   ═══════════════════════════════════════════════════════════════════════════ */

type FirmBlockData = {
  key: FirmKey
  toKill: { k: KillItem; c: Creative }[]
  /** The ones still to do — the done ones stay on screen, struck through. */
  killPending: { k: KillItem; c: Creative }[]
  watchToday: { w: WatchItem; c: Creative }[]
  watchYesterday: { w: WatchItem; c: Creative }[]
  live: Creative[]
  /** The ad sets those ads sit in — what the counts and budget are read off. */
  liveSets: { key: string; adset: string; ads: Creative[]; budget: number; cpl: number | null }[]
  /* Kills and watches grouped the way their own pages group them: the ad
     set first, its cuts behind a chevron. `freed` is what actually comes
     off — nothing unless the whole set is going, since the cuts left
     behind keep spending the ad set's budget. */
  killSets: { key: string; adset: string; items: { k: KillItem; c: Creative }[]; running: number; freed: number }[]
  watchSets: { key: string; adset: string; items: { w: StoredWatch; c: Creative }[] }[]
  launching: Assignment[]
  /** Still queued — the ticked ones stay on screen but are done. */
  launchPending: Assignment[]
  /** What the day's launches will add, once they are up. */
  launchBudget: number
  budget: number
  /** Ad sets live right now: Meta's, plus the ones ticked up today that it
      has not reported yet. */
  liveSetCount: number
  /** The IMG / BNR / V split of the firm's live ads. */
  mix: { kind: string; count: number; pct: number }[]
  winners: number
}

export default function ExecutePage() {
  const role = useRole()
  const {
    creatives, kill, watch, assignments, launches, killedIds,
    markKillDone, setLaunched, getCreative, boardLoading,
  } = useStore()
  /* The day comes from the store, not from here. Every page in the center
     reads the same one, so the numbers and the boards can never disagree
     about what day it is. */
  const { day: date, setDay: setDate, today } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const firms = useMemo<FirmBlockData[]>(() => {
    const mine = (code: string | undefined, key: FirmKey) => firmKey(code) === key

    return FIRM_KEYS.map((key) => {
      /* Only what is switched on counts as the current structure — a paused
         ad is not part of the account anyone is about to discuss. */
      const live = creatives.filter((c) => mine(c.firm, key) && !killedIds.has(c.id) && isDelivering(c))

      /* Left in the order they arrived, done or not. Sorting the ticked
         ones to the bottom meant a row jumped away from the cursor the
         moment it was checked, and the next tick landed on whatever slid
         up into its place. A struck-through row is marked clearly enough
         without being moved. */
      /* Scoped to the day being read, in both directions.

         `status === 'pending'` on its own put every open kill on every
         day's meeting: a kill decided this morning appeared in the TO KILL
         block of a meeting held two days ago, which is a record of a
         decision nobody had made yet. A day holds the kills decided on it
         — plus, on today, the ones ticked off today, so the meeting can
         see its own work and undo a mistake. */
      const toKill = kill
        .filter((k) => k.addedAt === date || k.doneAt === date)
        .flatMap((k) => { const c = getCreative(k.creativeId); return c && mine(c.firm, key) ? [{ k, c }] : [] })

      /* The account is built out of ad sets, so the meeting counts ad sets.
         Counting ads double-counted a set holding three cuts and made a
         firm look twice the size it is.

         Grouped over every switched-on ad, killed ones included, and the
         group counts as running while any one of its cuts is still up. An
         ad set spends its budget whatever is inside it: pulling one cut of
         two leaves the other spending the same money, so the budget must
         not move until the last cut goes. Building the groups from `live`
         alone dropped the killed cut out and took its ad set's budget with
         it — $400 became $200 on a kill that freed nothing. */
      /* Switched on at both levels — the ad's own switch and its ad set's.
         An ad paused in Ads Manager is not part of the structure anyone is
         about to discuss, and it holds no budget. */
      const switchedOn = creatives.filter((c) => mine(c.firm, key) && isDelivering(c))
      const sets = new Map<string, Creative[]>()
      for (const c of switchedOn) {
        const k = adsetKey(c)
        sets.set(k, [...(sets.get(k) ?? []), c])
      }
      const liveSets = [...sets.entries()]
        .filter(([, ads]) => ads.some((c) => !killedIds.has(c.id)))
        .map(([k, ads]) => ({
          key: k,
          adset: ads[0].adset,
          /* The cuts still up. The budget below is the ad set's own, which
             is why it reads the whole group rather than this. */
          ads: ads.filter((c) => !killedIds.has(c.id)),
          /* Once per ad set: Meta sets the budget there and the API copies
             it onto every ad, so summing per cut counts the same money
             several times over. */
          budget: adsetBudget(ads),
          cpl: sumTotals(ads.filter((c) => !killedIds.has(c.id)).map((c) => totalsFor(c, 'max'))).cpl,
        }))
        .sort((a, b) => b.budget - a.budget || a.adset.localeCompare(b.adset))

      /* Every delivering ad per ad set, so a partial kill can say how much
         of the set is going and what stays. */
      /* How many cuts the ad set holds in total — the denominator for
         "1 of 3". Counted over every switched-on cut so a kill already
         ticked off does not shrink the set it came out of. */
      const allSets = new Map<string, Creative[]>()
      for (const c of creatives) {
        if (!isDelivering(c)) continue
        const k = adsetKey(c)
        allSets.set(k, [...(allSets.get(k) ?? []), c])
      }

      const groupBy = <T,>(rows: T[], of: (r: T) => Creative) => {
        const m = new Map<string, { key: string; adset: string; items: T[] }>()
        for (const r of rows) {
          const c = of(r)
          const k = adsetKey(c)
          const g = m.get(k) ?? { key: k, adset: c.adset, items: [] }
          g.items.push(r)
          m.set(k, g)
        }
        return [...m.values()]
      }

      const killSets = groupBy(toKill, (r) => r.c).map((g) => {
        const running = allSets.get(g.key)?.length ?? g.items.length
        const all = sets.get(g.key) ?? g.items.map((r) => r.c)
        /* The cuts still spending the ad set's money — everything in it that
           has not already been switched off. */
        const spending = all.filter((c) => !killedIds.has(c.id))
        const pending = g.items.filter((r) => r.k.status === 'pending')
        /* Freed only by a kill still to be carried out, and only when it
           takes the last cut spending the money. A kill already ticked off
           has freed its budget already: `budget` below drops the ad set the
           moment it goes, so counting it here as well took the same $200 off
           twice and "Budget after today" fell by double on every kill. */
        const whole = spending.length > 0 && pending.length >= spending.length
        return { ...g, running, freed: whole ? adsetBudget(all) : 0 }
      })

      /* What a queued launch will cost per day. The figure lives on the
         launch row that raised it; a card with none falls back to the ad
         set its source cut runs in, which is the budget it will inherit. */
      const launchCost = (a: Assignment) =>
        launches.find((l) => l.assignmentId === a.id)?.dailyBudget
        ?? (a.sourceCreativeId ? getCreative(a.sourceCreativeId)?.dailyBudget : undefined)
        ?? 0

      /* Queued for the day, plus anything already ticked live on it. A card
         that vanished the moment it was launched took the meeting's record
         of its own work with it — you could not see what had gone up, or
         undo a mis-tick. Launched ones stay, struck through. */
      const launching = assignments
        .filter((a) =>
          a.launchDate === date
          && mine(a.firm, key)
          && (a.status === 'Launching' || a.status === 'Ad Launched' || a.status === 'Winner Ad'))
        .sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3))

      /* A launch only adds money if it opens a NEW ad set. Budget lives on
         the ad set, so a cut dropped into one already running adds a cut
         and nothing else — the same rule the kill side works to. Which ad
         set a card is for comes off its generated name; a relaunch with no
         name yet is going back where it came from, and anything else with
         none is new. */
      /* The ad sets that will still be running when the day is done: what is
         live now, less the ones going off entirely today. An ad set being
         killed whole is not somewhere a launch can land for free — putting
         an ad back into it re-opens it, and the kill above has already
         handed its budget back. Testing against what is live *now* instead
         made a relaunch into an ad set on the kill list cost nothing, so
         the kill took $200 off and the relaunch put none of it back. */
      const killedWhole = new Set(killSets.filter((g) => g.freed > 0).map((g) => g.key))
      const surviving = liveSets.filter((g) => !killedWhole.has(g.key))
      const survivingKeys = new Set(surviving.map((g) => g.key))
      const survivingNames = new Set(surviving.map((g) => g.adset))

      /* Whether a launch costs anything, which is the same question as
         whether it opens an ad set that is not already running.

         Only a relaunch can land somewhere for free: it is one specific ad
         going back where it came from, so if that ad set survives the day
         the budget is already being spent and the ad is just another cut in
         it. Matched on the ad set id rather than its name, because two ad
         sets can share a name.

         Everything else makes a new ad set and new money — a Double Down
         duplicates a winner into one, a new concept is one, and a manual
         launch generates a fresh name for one. Reading their ad set name
         and checking it against what is live got this wrong in exactly the
         case it matters: a Double Down carrying its source's date, from
         before the name was restamped to today, matched the very ad set it
         was doubling down on and reported as free. */
      const landsInRunningSet = (a: Assignment) => {
        if (a.type !== RELAUNCH_TYPE) return false
        const named = a.adsetName?.trim()
        if (named) return survivingNames.has(named)
        if (!a.sourceCreativeId) return false
        const c = getCreative(a.sourceCreativeId)
        return !!c && survivingKeys.has(adsetKey(c))
      }
      const launchCost2 = (a: Assignment) => (landsInRunningSet(a) ? 0 : launchCost(a))

      const launchPending = launching.filter((a) => a.status === 'Launching')
      const launchedToday = launching.filter((a) => a.status !== 'Launching')
      const launchedLive = launchedToday.reduce((t, a) => t + launchCost2(a), 0)

      return {
        key,
        killSets,
        watchSets: groupBy(
          watch.filter((w) => w.date === date).flatMap((w) => {
            const c = getCreative(w.creativeId)
            return c && mine(c.firm, key) ? [{ w, c }] : []
          }),
          (r) => r.c,
        ),
        /* Pending, plus anything ticked off today. A kill that vanished the
           moment it was ticked took the meeting's own record of its work
           with it — you could not see what had already been done, or undo a
           mistake. Done ones stay, struck through. */
        toKill,
        watchToday: watch
          .filter((w) => w.date === date)
          .flatMap((w) => { const c = getCreative(w.creativeId); return c && mine(c.firm, key) ? [{ w, c }] : [] }),
        watchYesterday: watch
          .filter((w) => w.date === addDays(date, -1))
          .flatMap((w) => { const c = getCreative(w.creativeId); return c && mine(c.firm, key) ? [{ w, c }] : [] }),
        killPending: toKill.filter((r) => r.k.status === 'pending'),
        live,
        liveSets,
        launching,
        launchPending,
        launchBudget: launchPending.reduce((t, a) => t + launchCost2(a), 0),
        /* The ad sets Meta reports, plus what has been ticked up today and
           is not in its numbers yet. Striking a launch through is the
           moment the money starts: before the tick it is the "+ launches"
           figure below, after it, part of the account. */
        budget: liveSets.reduce((t, g) => t + g.budget, 0) + launchedLive,
        liveSetCount: liveSets.length + launchedToday.filter((a) => !landsInRunningSet(a)).length,
        /* Counted over the ads, not the ad sets — the question is what
           share of the creative in market is each kind. */
        mix: live.length ? formatMix(live) : [],
        /* A winner is an ad set under the ad-set CPL, same as Winner
           Analysis — one cheap cut inside an expensive set is not one. */
        winners: liveSets.filter((g) => g.cpl !== null && g.cpl < WINNER_ADSET_CPL).length,
      }
    })
  }, [creatives, kill, watch, assignments, killedIds, getCreative, date])

  const total = firms.reduce(
    (a, f) => ({
      kill: a.kill + f.killPending.length,
      watch: a.watch + f.watchSets.length,
      live: a.live + f.liveSetCount,
      launching: a.launching + f.launchPending.length,
      launchBudget: a.launchBudget + f.launchBudget,
      budget: a.budget + f.budget,
      /* Only ad sets going off entirely free anything — pulling one cut of
         three leaves the other two spending the same budget. Summed per cut
         it reported $1,000 against a real $800. */
      killBudget: a.killBudget + f.killSets.reduce((s, g) => s + g.freed, 0),
    }),
    { kill: 0, watch: 0, live: 0, launching: 0, budget: 0, killBudget: 0, launchBudget: 0 },
  )

  /* Searching the meeting.

     Four lists per firm — to kill, to watch, the current structure, and
     what is going up — and the question in the room is usually about one
     ad set across all of them. Each list is narrowed by the same query and
     a firm whose lists all come back empty drops out, so what is left on
     screen is every mention of the thing you searched for.

     The totals above are untouched: they are the day's meeting, not the
     search's. */
  const shownFirms = useMemo(() => {
    const q = query.trim()
    if (!q) return firms
    const ad = (c: Creative) => [c.convention, c.name, c.adId, c.adset, c.angle, c.accountLabel]
    const set = (g: { adset: string; ads?: Creative[]; items?: { c: Creative }[] }) =>
      [g.adset, ...(g.ads ?? []).flatMap(ad), ...(g.items ?? []).flatMap((r) => ad(r.c))]
    const out = firms.map((f) => ({
      ...f,
      killSets: f.killSets.filter((g) => matchesQuery(q, set(g))),
      watchSets: f.watchSets.filter((g) => matchesQuery(q, set(g))),
      liveSets: f.liveSets.filter((g) => matchesQuery(q, set(g))),
      launching: f.launching.filter((a) => matchesQuery(q, [a.title, a.batch, a.format, a.visualCode, a.verbalCode, a.angle, a.adsetName, a.creativeName])),
      watchToday: f.watchToday.filter((r) => matchesQuery(q, ad(r.c))),
      watchYesterday: f.watchYesterday.filter((r) => matchesQuery(q, ad(r.c))),
      toKill: f.toKill.filter((r) => matchesQuery(q, ad(r.c))),
    }))
    return out.filter((f) => f.killSets.length || f.watchSets.length || f.liveSets.length || f.launching.length)
  }, [firms, query])

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Execute"
        description="The ad meeting, by firm — what comes off, what we are watching, what is running, and what goes live."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(`ad-meeting-${date}.csv`, [
                ['Firm', 'Section', 'Ad', 'Budget', 'Note'],
                ...firms.flatMap((f) => [
                  ...f.killSets.map((g) => [FIRM_KEY_LABEL[f.key], 'To kill', g.adset, String(g.freed), g.items[0].k.reason]),
                  ...f.watchSets.map((g) => [FIRM_KEY_LABEL[f.key], 'To watch', g.adset, '', g.items[0].w.reason]),
                  ...f.liveSets.map((g) => [FIRM_KEY_LABEL[f.key], 'Current structure', g.adset, String(g.budget), `${g.ads.length} ads`]),
                  ...f.launching.map((a) => [FIRM_KEY_LABEL[f.key], 'Launching', a.title, '', [a.batch, a.format, a.visualCode, a.verbalCode].filter(Boolean).join(' | ')]),
                ]),
              ])
            }
          >
            <Download aria-hidden /> Export meeting
          </Button>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <BoardStatus migration="supabase/migration_creative_board.sql" />
        <section aria-label="Meeting totals" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard label="Killing" value={String(total.kill)} tone={total.kill > 0 ? 'bad' : undefined} hint={`${usd(total.killBudget, 0)}/day comes off`} />
          <StatCard label="Watching" value={String(total.watch)} hint="ad sets awaiting a decision" />
          <StatCard label="Live ad sets" value={String(total.live)} hint="switched on right now" />
          <StatCard label="Launching" value={String(total.launching)} tone={total.launching > 0 ? 'good' : undefined} hint={`queued for ${formatDate(date)}`} />
          <StatCard label="Current budget" value={usd(total.budget, 0)} hint="all firms, per day" />
          {/* What the account is committing to once today's decisions are
              carried out. The meeting's whole output in one number: what is
              running now, minus what comes off, plus what goes up. */}
          <StatCard
            label="Budget after today"
            value={usd(total.budget - total.killBudget + total.launchBudget, 0)}
            tone={total.budget - total.killBudget + total.launchBudget > total.budget ? 'good' : undefined}
            hint={`${usd(total.budget, 0)} − ${usd(total.killBudget, 0)} kills + ${usd(total.launchBudget, 0)} launches`}
          />
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <input
            type="date"
            value={date}
            aria-label="Meeting day"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
          />
          <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          {date !== today && <Button variant="ghost" size="sm" onClick={() => setDate(today)}>Today</Button>}
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search the meeting"
            placeholder="Search ad set, creative, brief"
            className="ml-auto max-w-[18rem]"
          />
        </div>

        {boardLoading ? (
          <div className="h-96 animate-pulse rounded-lg border bg-card" />
        ) : shownFirms.length === 0 ? (
          <EmptyState title={`Nothing in the meeting matches “${query.trim()}”`}>
            The day holds {total.kill} to kill, {total.watch} to watch and {total.live} live ad sets — none of them by that name, ad set or angle.
          </EmptyState>
        ) : (
          shownFirms.map((f) => (
            <FirmOverview
              key={f.key}
              f={f}
              date={date}
              onKill={(k, c, done) => { markKillDone(k.id, done, role); toast(`${c.convention} ${done ? 'marked killed' : 'put back on the kill list'}`) }}
              onLaunched={(a, live) => {
                setLaunched(a.id, live)
                toast(`${a.title} ${live ? 'marked launched' : 'put back in the queue'}`)
              }}
              onOpen={setOpenId}
            />
          ))
        )}
      </div>

      <AssignmentDetailSheet assignmentId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

function FirmOverview({
  f, date, onKill, onLaunched, onOpen,
}: {
  f: FirmBlockData
  date: string
  onKill: (k: KillItem, c: Creative, done: boolean) => void
  onLaunched: (a: Assignment, live: boolean) => void
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [showYesterday, setShowYesterday] = useState(false)
  /* The structure table is the long one — twenty-odd rows a firm — and it is
     reference rather than a decision, so it starts shut. */
  const [showStructure, setShowStructure] = useState(false)
  const empty = f.killSets.length + f.watchSets.length + f.liveSets.length + f.launching.length === 0

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b bg-muted/50 px-3 py-2.5 text-left"
      >
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="truncate font-semibold">{FIRM_KEY_LABEL[f.key]}</span>
        <span className="ml-auto flex shrink-0 flex-wrap items-center gap-1">
          {f.killPending.length > 0 && <Pill tone="red">{f.killPending.length} to kill</Pill>}
          {f.watchSets.length > 0 && <Pill tone="amber">{f.watchSets.length} watching</Pill>}
          {f.launchPending.length > 0 && <Pill tone="green">{f.launchPending.length} launching</Pill>}
          <Pill>{f.liveSetCount} live ad set{f.liveSetCount === 1 ? '' : 's'} · {usd(f.budget, 0)}/day</Pill>
        </span>
      </button>

      {open && (empty ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing for this firm on {formatDate(date)}.</p>
      ) : (
        <div className="divide-y">
          {/* Ad set first, cuts behind a chevron — the same shape as the
              Kill List's own page, so the meeting reads one layout. */}
          <Section icon={Skull} label="To kill" tone="red" count={f.killPending.length}>
            {f.killSets.length === 0 ? <Nothing>Nothing coming off.</Nothing> : (
              <ul className="flex flex-col gap-1">
                {f.killSets.map((g) => {
                  const partial = g.running > g.items.length
                  const allDone = g.items.every((r) => r.k.status === 'done')
                  return (
                    <li key={g.key}>
                      <AdsetRow
                        adset={g.adset}
                        right={
                          <>
                            {partial ? (
                              <Pill tone="amber">{g.items.length} of {g.running} — ad set keeps running</Pill>
                            ) : (
                              <Pill tone="red">whole ad set · {g.items.length}</Pill>
                            )}
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {partial ? 'budget unchanged' : `${usd(g.freed, 0)}/day frees up`}
                            </span>
                          </>
                        }
                        muted={allDone}
                      >
                        {g.items.map(({ k, c }) => {
                          const done = k.status === 'done'
                          return (
                            <div key={k.id} className={cn('flex items-center gap-2.5 py-1 text-sm', done && 'text-muted-foreground')}>
                              <Checkbox
                                aria-label={`Mark ${c.name} killed`}
                                checked={done}
                                onCheckedChange={(v) => onKill(k, c, v === true)}
                              />
                              <code className={cn('min-w-0 flex-1 truncate font-mono text-xs', done && 'line-through')}>
                                {c.convention}
                              </code>
                              {k.kind === 'fatigue' && <Pill tone="amber">Fatigued</Pill>}
                              {k.reason && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{k.reason}</span>}
                            </div>
                          )
                        })}
                      </AdsetRow>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section icon={Eye} label="To watch" tone="amber" count={f.watchSets.length}>
            {f.watchSets.length === 0 ? <Nothing>Nothing on watch.</Nothing> : (
              <ul className="flex flex-col gap-1">
                {f.watchSets.map((g) => {
                  const decision = g.items.find((r) => r.w.decision)?.w.decision
                  return (
                    <li key={g.key}>
                      <AdsetRow
                        adset={g.adset}
                        right={
                          <>
                            <Pill>{g.items.length} ad{g.items.length === 1 ? '' : 's'}</Pill>
                            {decision && <Pill tone={decision === 'KILL' ? 'red' : 'blue'}>{decision}</Pill>}
                            <span className="hidden max-w-[22rem] truncate text-xs text-muted-foreground sm:inline">
                              {g.items[0].w.reason}
                            </span>
                          </>
                        }
                      >
                        {g.items.map(({ w, c }) => (
                          <div key={w.id} className="flex items-center gap-2.5 py-1 text-sm">
                            <code className="min-w-0 flex-1 truncate font-mono text-xs">{c.convention}</code>
                            {w.decision && <Pill tone={w.decision === 'KILL' ? 'red' : 'blue'}>{w.decision}</Pill>}
                          </div>
                        ))}
                      </AdsetRow>
                    </li>
                  )
                })}
              </ul>
            )}
            {f.watchYesterday.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowYesterday((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn('size-3 transition-transform', !showYesterday && '-rotate-90')} aria-hidden />
                  Yesterday’s · {f.watchYesterday.length}
                </button>
                {showYesterday && (
                  <ul className="flex flex-col gap-1 pl-4 pt-1.5">
                    {f.watchYesterday.map(({ w, c }) => (
                      <li key={w.id} className="truncate font-mono text-xs text-muted-foreground">{c.convention}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Section>

          <Section
            icon={Trophy}
            label="Current structure"
            count={f.liveSets.length}
            right={
              <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {/* What this firm is actually running, by kind. The counts
                    are what the meeting argues about — "we are all banners
                    again" — and nothing on the page answered it: Meta only
                    reports Image or Video, which cannot tell a banner from
                    a still. Read off the ad name's format segment instead. */}
                {f.mix.length > 0 && (
                  <span className="flex items-center gap-2">
                    {/* The count first, the share after it. The percentage
                        alone answers "are we all banners again" but not
                        "how many do we need", and the second question is
                        the one that turns into a brief. */}
                    {f.mix.map((m) => (
                      <span
                        key={m.kind}
                        title={`${m.count} of ${f.live.length} live ${f.live.length === 1 ? 'ad' : 'ads'}`}
                        className={cn('tabular-nums', m.count === 0 && 'opacity-40')}
                      >
                        <strong className="text-foreground">{m.kind}</strong> {m.count}
                        <span className="text-muted-foreground/70"> · {m.pct}%</span>
                      </span>
                    ))}
                  </span>
                )}
                <span>
                  Budget <strong className="text-foreground">{usd(f.budget, 0)}</strong>/day
                  {f.winners > 0 && ` · ${f.winners} winner${f.winners === 1 ? '' : 's'}`}
                </span>
              </span>
            }
          >
            {f.liveSets.length === 0 ? <Nothing>Nothing running.</Nothing> : (
              <>
                <button
                  type="button"
                  onClick={() => setShowStructure((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn('size-3 transition-transform', !showStructure && '-rotate-90')} aria-hidden />
                  {showStructure ? 'Hide' : 'Show'} the {f.liveSets.length} live ad set{f.liveSets.length === 1 ? '' : 's'} · {f.live.length} ads
                </button>
                {showStructure && (
                  <div className="mt-2 overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left font-medium">Ad set</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Ads</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Budget</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Lifetime CPL</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* The ad set is the row, with its cuts underneath —
                            the structure the meeting is actually discussing,
                            and the only level at which the budget is real. */}
                        {f.liveSets.map((g) => {
                          const winner = g.cpl !== null && g.cpl < WINNER_ADSET_CPL
                          return (
                            <Fragment key={g.key}>
                              <tr className="border-t bg-muted/20">
                                <td className="max-w-[340px] truncate px-3 py-1.5 font-mono text-xs font-medium">{g.adset}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{g.ads.length}</td>
                                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{g.budget ? usd(g.budget, 0) : '—'}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{usd(g.cpl, 0)}</td>
                                <td className="px-3 py-1.5 text-right">{winner ? <Pill tone="green">Winner</Pill> : <span className="text-muted-foreground">—</span>}</td>
                              </tr>
                              {g.ads.map((c) => (
                                <tr key={c.id} className="border-t text-muted-foreground">
                                  <td className="max-w-[340px] truncate py-1.5 pl-7 pr-3 font-mono text-xs">{c.convention}</td>
                                  <td />
                                  {/* No budget on a cut: it does not have one
                                      of its own, and repeating the ad set's
                                      here is what made the column add up to
                                      more than the account spends. */}
                                  <td />
                                  <td className="px-3 py-1.5 text-right tabular-nums">{usd(totalsFor(c, 'max').cpl, 0)}</td>
                                  <td />
                                </tr>
                              ))}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section icon={Rocket} label={`Launching ${formatDate(date)}`} tone="green" count={f.launchPending.length}>
            {f.launching.length === 0 ? (
              <Nothing>Nothing queued — pick creatives on the Launch Lists page.</Nothing>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {f.launching.map((a) => {
                  const live = a.status === 'Ad Launched' || a.status === 'Winner Ad'
                  return (
                  <li key={a.id} className={cn('flex items-center gap-2.5 text-sm', live && 'text-muted-foreground')}>
                    <Checkbox
                      aria-label={`Mark ${a.title} launched`}
                      checked={live}
                      onCheckedChange={(v) => onLaunched(a, v === true)}
                    />
                    <button
                      type="button"
                      onClick={() => onOpen(a.id)}
                      className={cn('min-w-0 flex-1 truncate text-left hover:text-primary hover:underline', live && 'line-through')}
                      title="Open this creative"
                    >
                      {a.title}
                    </button>
                    <PriorityStars value={a.priority ?? 3} size="sm" />
                    {a.batch && <Pill>{a.batch}</Pill>}
                    {(a.visualCode || a.verbalCode) && (
                      <Pill>{[a.visualCode, a.verbalCode].filter(Boolean).join(' × ')}</Pill>
                    )}
                  </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </div>
      ))}
    </div>
  )
}

/* An ad set and its cuts, collapsed by default.

   The watch and kill lists both show the ad set first and open to the cuts
   inside it, and the meeting reads all three in one sitting — a different
   shape here would mean re-learning the page every time you scroll past a
   firm boundary. */
function AdsetRow({
  adset, right, children, muted,
}: {
  adset: string
  right?: React.ReactNode
  children: React.ReactNode
  muted?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('rounded-md border', muted && 'opacity-60')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${adset}`}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40"
      >
        <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{adset}</code>
        <span className="flex shrink-0 items-center gap-1.5">{right}</span>
      </button>
      {open && <div className="border-t px-2 py-1 pl-7">{children}</div>}
    </div>
  )
}

function Section({
  icon: Icon, label, count, tone, right, children,
}: {
  icon: typeof Skull
  label: string
  count: number
  tone?: 'red' | 'amber' | 'green'
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="px-4 py-3">
      <div className="flex items-center gap-2 pb-2">
        <Icon
          className={cn(
            'size-3.5 shrink-0',
            tone === 'red' ? 'text-destructive' :
            tone === 'amber' ? 'text-warning-foreground' :
            tone === 'green' ? 'text-success' : 'text-muted-foreground',
          )}
          aria-hidden
        />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">{count}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  )
}

const Nothing = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
)
