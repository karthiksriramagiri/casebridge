'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, BatteryLow, ChevronRight, Skull, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { EmptyState, PageHeader, Pill, StatCard, Thumb } from '@/app/creative/_components/admin/shared'
import { adsetBudget, adsetKey, formatDate, isDelivering, totalsFor, usd } from '@/app/creative/_lib/metrics'
import { TODAY } from '@/app/creative/_lib/data'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, KillItem } from '@/app/creative/_lib/types'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import { MetricCells, MetricHead, metricColumns, stickyCell, stickyTint, totalsOf, type MetricColumn } from '@/app/creative/_components/admin/metric-table'
import { DayNav } from '@/app/creative/_components/admin/day-nav'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Kill List

   Grouped by firm, like the launch list and the archive, because turning ads
   off is the same kind of session: you are inside one ad account working
   through its list, not hopping between four of them by whichever ad happened
   to be added first.

   Two outcomes from here, and they are not the same thing. Killed means it
   did not work. Fatigued means it worked and wore out — worth pulling back
   later, so it is archived apart.
   ═══════════════════════════════════════════════════════════════════════════ */

const firmRank = (code: string) => {
  const i = FIRMS.findIndex((f) => f.code === code)
  return i === -1 ? FIRMS.length : i
}

type Row = { k: KillItem; c: Creative }

export default function KillListPage() {
  const role = useRole()
  const isAdmin = role === 'admin'
  const { kill, creatives, killedIds, getCreative, markKillDone, markFatigued, removeKill, hasOutcomes } = useStore()
  /* The same columns Creative Analysis shows, in the same order. */
  const columns = useMemo(() => metricColumns(hasOutcomes), [hasOutcomes])

  /* An entry whose creative is no longer in the account cannot be rendered or
     acted on, so it is dropped here rather than returning null per row. */
  const rows = useMemo(
    () => kill.flatMap((k) => { const c = getCreative(k.creativeId); return c ? [{ k, c }] : [] }),
    [kill, getCreative],
  )

  /* The day being looked at. Every kill carries the day it was decided, so
     an earlier list reads back as it was rather than being reconstructed. */
  /* The day comes from the store, not from here. Every page in the center
     reads the same one, so the numbers and the boards can never disagree
     about what day it is. */
  const { day: date, setDay: setDate } = useStore()
  const isToday = date === TODAY

  /* On today, pending means pending — including kills decided on an earlier
     day that nobody has carried out yet. Hiding those behind their original
     date would quietly drop real work off the list, which is the opposite of
     what a kill list is for; they are tagged with the day instead.

     On a past day the list is a record: exactly what was decided then. */
  const pending = isToday
    ? rows.filter((r) => r.k.status === 'pending')
    : rows.filter((r) => r.k.status === 'pending' && r.k.addedAt === date)
  const done = isToday
    ? rows.filter((r) => r.k.status === 'done' && r.k.doneAt === TODAY)
    : rows.filter((r) => r.k.status === 'done' && (r.k.doneAt === date || r.k.addedAt === date))
  const carriedOver = isToday ? pending.filter((r) => r.k.addedAt !== TODAY).length : 0
  /* How many ads the ad set is actually running, so a kill that takes only
     some of them can say so. Counted off the live account rather than off
     this list — the whole point is what is NOT here. */
  const adsetAds = useMemo(() => {
    const m = new Map<string, Creative[]>()
    for (const c of creatives) {
      /* Running cuts only. A cut already paused in Ads Manager is not one
         the ad set "keeps running", and counting it made a whole-ad-set
         kill look partial — so the budget it frees was reported as $0. */
      if (killedIds.has(c.id) || !isDelivering(c)) continue
      const k = adsetKey(c)
      m.set(k, [...(m.get(k) ?? []), c])
    }
    return m
  }, [creatives, killedIds])

  /* What killing these actually frees.

     An ad set's budget is spent by the ad set, not by the cut — pulling one
     of three leaves the other two spending the same $200/day. So only ad
     sets going off entirely count, and the budget is counted once per set
     rather than once per cut. */
  const spend = useMemo(() => {
    const whole: Creative[] = []
    const byKey = new Map<string, Row[]>()
    for (const r of pending) {
      const k = adsetKey(r.c)
      byKey.set(k, [...(byKey.get(k) ?? []), r])
    }
    for (const [k, rows] of byKey) {
      const running = adsetAds.get(k)?.length ?? rows.length
      if (rows.length >= running) whole.push(rows[0].c)
    }
    return adsetBudget(whole)
  }, [pending, adsetAds])

  const partialSets = useMemo(() => {
    const byKey = new Map<string, number>()
    for (const r of pending) {
      const k = adsetKey(r.c)
      byKey.set(k, (byKey.get(k) ?? 0) + 1)
    }
    let n = 0
    for (const [k, count] of byKey) if (count < (adsetAds.get(k)?.length ?? count)) n++
    return n
  }, [pending, adsetAds])

  /* Firm → ad set → the cuts being killed inside it.

     The kill list is read against Ads Manager, where the thing you have open
     is an ad set — a flat list of creative names means finding each one's ad
     set yourself. Grouping them the way the account is arranged means you
     open an ad set once and do everything in it. */
  type SetGroup = { key: string; adset: string; items: Row[]; freed?: number }

  const byFirm = (list: Row[]) => {
    const firms = new Map<string, Map<string, SetGroup>>()
    for (const r of list) {
      const sets = firms.get(r.c.firm) ?? new Map<string, SetGroup>()
      const k = adsetKey(r.c)
      const g = sets.get(k) ?? { key: k, adset: r.c.adset, items: [] }
      g.items.push(r)
      sets.set(k, g)
      firms.set(r.c.firm, sets)
    }
    return [...firms.entries()]
      .sort(([a], [b]) => firmRank(a) - firmRank(b) || a.localeCompare(b))
      .map(([firm, sets]) => {
        const out = [...sets.values()]
        /* What each set actually frees: nothing unless every delivering cut
           in it is on the list, and then its budget — via adsetBudget, which
           counts per Meta ad set, so a name backed by two real ad sets frees
           both their budgets rather than one. */
        for (const g of out) {
          const running = adsetAds.get(g.key)?.length ?? g.items.length
          g.freed = g.items.length >= running ? adsetBudget(g.items.map((r) => r.c)) : 0
        }
        return [firm, out] as const
      })
  }



  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kill List"
        description={
          isAdmin
            ? 'Every kill comes from a KILL decision on the watch list. Budget only drops once the kill is marked done.'
            : 'Turn these ads off in Ads Manager, then check them off. Jason is notified automatically.'
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <BoardStatus migration="supabase/migration_creative_board.sql" />
        <DayNav date={date} onChange={setDate} label="Kill list day" />
        <section aria-label="Kill totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="To kill"
            value={String(pending.length)}
            tone={pending.length > 0 ? 'bad' : undefined}
            hint={carriedOver > 0 ? `${carriedOver} carried over from earlier days` : 'still running'}
          />
          <StatCard
            label="Daily budget freed"
            value={usd(spend, 0)}
            hint={
              partialSets > 0
                ? `${partialSets} ad set${partialSets === 1 ? '' : 's'} only part-killed — ${partialSets === 1 ? 'it keeps' : 'they keep'} spending`
                : 'once the whole ad set is off'
            }
          />
          <StatCard label="Killed" value={String(done.length)} hint={isToday ? 'turned off today' : `turned off on ${formatDate(date)}`} />
        </section>

        {/* ── Still running ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            Pending <span className="font-normal text-muted-foreground">· {pending.length} to kill</span>
          </h2>
          {pending.length === 0 ? (
            <EmptyState title={isToday ? 'No pending kills' : `Nothing was pending on ${formatDate(date)}`}>
              A creative lands here from a <strong>KILL</strong> decision on the watch list.
            </EmptyState>
          ) : (
            byFirm(pending).map(([firm, sets]) => (
              <FirmBlock key={firm} firm={firm} sets={sets} columns={columns}>
                {sets.map((g) => (
                  <AdsetGroup
                    key={g.key}
                    g={g}
                    siblings={adsetAds.get(g.key) ?? []}
                    columns={columns}
                    renderRow={({ k, c }) => (
                      <>
                        <td className="px-3 py-2">
                          <Checkbox
                            aria-label={`Mark ${c.name} as killed`}
                            disabled={!isToday}
                            onCheckedChange={() => markKillDone(k.id, true, role)}
                          />
                        </td>
                        <td className="max-w-[420px] py-2 pl-8 pr-3">
                          <div className="flex items-center gap-2.5 border-l-2 border-border pl-3">
                            <Thumb c={c} />
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="truncate font-medium">{c.convention}</span>
                              <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                                {/* Why it is on the list reads first and plain,
                                    the way the firm does on Creative Analysis;
                                    the tags that follow keep their width. */}
                                <span className="min-w-0 shrink truncate text-[11px] text-muted-foreground">
                                  {k.reason || `${usd(c.dailyBudget, 0)}/day`}
                                </span>
                                <span className="shrink-0">
                                  <Pill tone={isToday && k.addedAt !== TODAY ? 'amber' : undefined}>
                                    Added {formatDate(k.addedAt)}
                                  </Pill>
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <MetricCells columns={columns} t={totalsFor(c, 'max')} ads={[c]} />
                        <td className={cn('whitespace-nowrap px-3 py-2', stickyTint)}>
                          <div className="relative flex items-center justify-end gap-1">
                            {/* Same action in Ads Manager, different meaning here: a
                                fatigued ad is a winner worth pulling back later, so it
                                is archived apart from the ones that simply failed.
                                Tagging it does not switch it off — the kill still has
                                to be carried out and ticked like any other. */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              disabled={!isToday}
                              title="Worked, but worn out — tag it for the fatigue list. Does not switch it off."
                              onClick={() => {
                                markFatigued(k.id)
                                toast(`${c.convention} marked fatigued — still on the kill list until you pull it`)
                              }}
                            >
                              <BatteryLow aria-hidden /> Fatigue
                            </Button>
                            {isAdmin && (
                              <Button size="icon-sm" variant="ghost" disabled={!isToday} aria-label="Remove from kill list" onClick={() => removeKill(k.id)}>
                                <Trash2 aria-hidden />
                              </Button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  />
                ))}
              </FirmBlock>
            ))
          )}
        </div>

        {/* ── Already off ──────────────────────────────────────────────── */}
        {done.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="pt-2 text-sm font-semibold text-muted-foreground">
              Killed <span className="font-normal">· {done.length} done, moved to archives</span>
            </h2>
            {byFirm(done).map(([firm, sets]) => (
              <FirmBlock key={firm} firm={firm} sets={sets} columns={columns} muted>
                {sets.map((g) => (
                  <AdsetGroup
                    key={g.key}
                    g={g}
                    siblings={adsetAds.get(g.key) ?? []}
                    columns={columns}
                    muted
                    renderRow={({ k, c }) => (
                      <>
                        <td className="px-3 py-2" />
                        <td className="max-w-[420px] py-2 pl-8 pr-3">
                          <div className="flex items-center gap-2.5 border-l-2 border-border pl-3">
                            <Thumb c={c} />
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="truncate font-medium line-through">{c.convention}</span>
                              <div className="flex flex-wrap items-center gap-1">
                                <Pill tone="green">Killed {k.doneAt && formatDate(k.doneAt)}</Pill>
                              </div>
                            </div>
                          </div>
                        </td>
                        <MetricCells columns={columns} t={totalsFor(c, 'max')} ads={[c]} muted />
                        <td className={cn('px-3 py-2', stickyTint)}>
                          <div className="relative flex justify-end">
                            {isToday && (
                              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => markKillDone(k.id, false, role)}>
                                <Undo2 aria-hidden /> Undo
                              </Button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  />
                ))}
              </FirmBlock>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* One firm's ads, as a table.

   The columns are Creative Analysis's, in the same order, so a figure means
   the same thing and sits in the same place wherever you read it. The list
   used to say all of this as a wrapping row of pills per row, which put
   every number in a different column and made the two pages where money is
   decided the two hardest to scan.

   The header carries what it costs to leave this firm's ads running — the
   number that decides whether this group is today's job. */
function FirmBlock({
  firm, sets, columns, children, muted,
}: {
  firm: string
  sets: readonly { items: Row[]; freed?: number }[]
  columns: MetricColumn[]
  children: React.ReactNode
  muted?: boolean
}) {
  const [open, setOpen] = useState(true)
  const items = sets.flatMap((g) => g.items)
  /* Same rule as the rows below: once per ad set, and only for sets going
     off entirely. A firm header that adds up per cut reported $400 for one
     $200 ad set holding two ads. */
  const spend = sets.reduce((t, g) => t + (g.freed ?? 0), 0)

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', muted && 'opacity-70')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b bg-muted/50 px-2 py-2 text-left"
      >
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <Skull className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-sm font-medium">{firmName(firm)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {sets.length} ad set{sets.length === 1 ? '' : 's'} · {items.length} ad{items.length === 1 ? '' : 's'}
        </span>
        {!muted && spend > 0 && <Pill tone="red">{usd(spend, 0)}/day</Pill>}
      </button>
      {/* Wide on purpose: ten measures do not fit a sidebar-width page, and
          squeezing them wraps the names. It scrolls inside its own box so
          the page itself never does. */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            {/* Without a header the ten figures are unlabelled, which is how
                the old pill rows read — the numbers were there and nobody
                could say which was which. */}
            <MetricHead
              columns={columns}
              lead={
                <>
                  <th scope="col" className="w-10 px-3 py-2.5" />
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Ad set</th>
                </>
              }
            />
            {children}
          </table>
        </div>
      )}
    </div>
  )
}

/* One ad set and the cuts of it being killed, as a <tbody>.

   The count says how much of the set is going: "2 of 2" is the whole thing,
   and anything less is called out. Killing one cut out of three leaves the
   ad set running — obvious when you are looking at Ads Manager, easy to
   forget from a list that only shows what you picked. */
function AdsetGroup({
  g, siblings, columns, renderRow, muted,
}: {
  g: { key: string; adset: string; items: Row[]; freed?: number }
  /** Every ad still delivering in this ad set, killed or not. */
  siblings: Creative[]
  columns: MetricColumn[]
  renderRow: (row: Row) => React.ReactNode
  muted?: boolean
}) {
  const [open, setOpen] = useState(true)
  const killing = g.items.length
  const running = Math.max(siblings.length, killing)
  const partial = running > killing

  /* The ad set's own budget, once — not the per-cut figure times the number
     of cuts. And it is only freed if the whole set goes: the two cuts left
     behind keep spending it. */
  const spend = g.freed ?? 0

  /* The cuts in this ad set that are NOT on the list, so the dropdown shows
     the whole ad set rather than only the part being pulled. Seeing what
     survives is the point — it is what the ad set will still be running
     tomorrow. */
  const killedIdsHere = new Set(g.items.map((r) => r.c.id))
  const surviving = siblings.filter((c) => !killedIdsHere.has(c.id))

  /* The ad set's own numbers, read over every cut in it — the ones being
     killed and the ones staying. A set is judged as a set, the same rule
     the watch list and Winner Analysis work to. */
  const setAds = [...g.items.map((r) => r.c), ...surviving]

  return (
    <tbody className="border-t">
      <tr className={cn('bg-card hover:bg-muted/40', muted && 'opacity-80')}>
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${g.adset}`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden />
          </button>
        </td>
        <td className="max-w-[420px] px-3 py-2">
          {/* Same anatomy as Creative Analysis: the name in the body face,
              then one muted line of context. */}
          <div className="flex items-center gap-2.5">
            <Thumb c={g.items[0].c} />
            <div className="flex min-w-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="truncate text-left font-medium hover:text-primary"
              >
                {g.adset}
              </button>
              {/* One line, always — see the watch list for why. */}
              <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                <span className="min-w-0 shrink truncate text-[11px] text-muted-foreground">
                  {partial ? 'budget unchanged' : `${usd(spend, 0)}/day frees up`}
                </span>
                <span className="shrink-0">
                  {partial ? (
                    <Pill tone="amber">
                      <AlertTriangle className="size-3" aria-hidden /> {killing} of {running} — ad set keeps running
                    </Pill>
                  ) : (
                    <Pill tone="red">whole ad set · {killing}</Pill>
                  )}
                </span>
              </div>
            </div>
          </div>
        </td>
        <MetricCells columns={columns} t={totalsOf(setAds)} ads={setAds} muted={muted} />
        <td className={cn('px-3 py-2', stickyCell)} />
      </tr>

      {open && g.items.map((r) => (
        <tr key={r.k.id} className="border-t border-dashed bg-muted/20 hover:bg-muted/40">
          {renderRow(r)}
        </tr>
      ))}

      {/* What the ad set keeps. Shown dimmed under the kills so a partial
          kill reads as what it is — a set that carries on. */}
      {open && surviving.map((c) => (
        <tr key={c.id} className="border-t border-dashed bg-muted/20 text-muted-foreground">
          <td className="px-3 py-2" />
          <td className="max-w-[420px] py-2 pl-8 pr-3">
            <div className="flex items-center gap-2.5 border-l-2 border-border pl-3">
              <Thumb c={c} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">{c.convention}</span>
                <span><Pill tone="green">staying on</Pill></span>
              </div>
            </div>
          </td>
          <MetricCells columns={columns} t={totalsFor(c, 'max')} ads={[c]} muted />
          <td className={cn('px-3 py-2', stickyTint)} />
        </tr>
      ))}
    </tbody>
  )
}
