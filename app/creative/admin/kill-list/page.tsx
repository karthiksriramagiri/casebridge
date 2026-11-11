'use client'

import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, BatteryLow, CheckCircle2, ChevronRight, History, Send, Skull, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { EmptyState, PageHeader, Pill, SearchBox, StatCard, Thumb } from '@/app/creative/_components/admin/shared'
import { adsetBudget, adsetKey, formatDate, isDelivering, totalsFor, usd } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, KillItem } from '@/app/creative/_lib/types'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import { HistoryDialog, type HistoryRow } from '@/app/creative/_components/admin/history-dialog'
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
  /* `today` comes from the store, not from the TODAY constant: that one is
     fixed when the bundle evaluates, so a tab left open past midnight went
     on calling yesterday today — yesterday's completed kills stayed on the
     list as though they were this morning's work, and a kill ticked off
     after midnight was filed under yesterday. The store re-reads the real
     Pacific day on a timer and carries the day nav over with it. */
  const { day: date, setDay: setDate, today } = useStore()
  const isToday = date === today

  /* One rule, every day: a day's list is what was decided ON that day.

     It used to be two rules. Today showed every open kill whatever day it
     came from, which put Monday's leftovers in Tuesday's list with a tag
     on them; and the Execute page went further and showed open kills on
     days BEFORE they were decided. Both made the date on screen mean
     something different depending on where you were standing.

     So: `addedAt` decides which day a kill belongs to, and nothing else.
     The only thing a day borrows is its own completions — a kill added
     yesterday and ticked off today shows as done today, because that is
     when the work happened and it is what the undo button is for.

     Kills left open on earlier days are not lost. They are gathered under
     their own heading below, apart from today's list rather than mixed
     into it. */
  const pending = rows.filter((r) => r.k.status === 'pending' && r.k.addedAt === date)
  const done = rows.filter((r) => r.k.status === 'done' && (r.k.doneAt === date || (r.k.addedAt === date && !r.k.doneAt)))
  /* Still open, decided before the day being read. Only on today: on a past
     day what matters is what that day decided, not what was outstanding
     when it started. */
  const stillOpen = isToday
    ? rows.filter((r) => r.k.status === 'pending' && r.k.addedAt < date)
    : []

  /* Finding one ad in the list.

     The list is read against Ads Manager with a name in hand — someone says
     "is B000147 on here", or you are working one firm's account and want
     only its rows in front of you. Everything on the row is searchable, not
     just the name: the ad set, because that is what you have open in Ads
     Manager; the firm, because that is which account you are in; the ad id,
     because that is what a link to Ads Manager carries; and the reason,
     because "no leads" finds every ad that is here for the same cause.

     It filters what is SHOWN and nothing else. The totals above, the budget
     freed, and the list the Slack button sends all stay the day's real
     ones — a search is someone looking for a row, not a decision to kill
     fewer ads, and a count that moved with the search box would make the
     page lie about the day's work. */
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = useCallback(
    ({ k, c }: Row) =>
      !q ||
      [c.convention, c.name, c.adId, c.adset, c.angle, firmName(c.firm), c.accountLabel, k.reason]
        .some((field) => (field ?? '').toLowerCase().includes(q)),
    [q],
  )
  const shownPending = useMemo(() => pending.filter(matches), [pending, matches])
  const shownDone = useMemo(() => done.filter(matches), [done, matches])
  const shownOpen = useMemo(() => stillOpen.filter(matches), [stillOpen, matches])
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



  /* Telling the K-Team the list is ready.

     The list is decided here and carried out in Ads Manager by whoever is on
     the account — two people, two times of day. The handover used to be
     someone remembering to say so in Slack. The message carries the list
     itself, grouped the way the page groups it, so the person reading it
     knows what they are opening before they open it. */
  /* Every kill ever carried out, with the day taken out — see
     HistoryDialog. Built from the whole kill board rather than the day's
     rows, and it keeps ads whose creative has dropped out of Meta's window
     by falling back to the name recorded on the kill row. */
  const [historyOpen, setHistoryOpen] = useState(false)
  const history = useMemo<HistoryRow[]>(
    () => kill
      .filter((k) => k.status === 'done')
      .map((k) => {
        const c = getCreative(k.creativeId)
        const fatigue = k.kind === 'fatigue'
        return {
          id: k.id,
          name: c?.convention || c?.name || k.creativeId,
          adset: c?.adset,
          firm: c?.firm,
          date: k.doneAt ?? k.addedAt,
          c,
          tag: fatigue ? 'Fatigued' : 'Killed',
          tone: (fatigue ? 'amber' : 'red') as 'amber' | 'red',
        }
      }),
    [kill, getCreative],
  )

  const [notifying, setNotifying] = useState<'ready' | 'done' | null>(null)

  /* The day's list as Slack needs it: how much work, grouped the way the
     page groups it, and what it frees. */
  const payload = (phase: 'ready' | 'done') => ({
    board: 'kill' as const,
    phase,
    day: date,
    dateLabel: formatDate(date),
    count: phase === 'ready' ? pending.length : done.length,
    freed: spend,
    by: phase === 'ready' ? 'Jason' : 'The K-Team',
    url: typeof window === 'undefined' ? '' : window.location.href,
    groups: byFirm(phase === 'ready' ? pending : done).map(([firm, sets]) => ({
      firm: firmName(firm),
      adsets: sets.map((g) => ({ name: g.adset, ads: g.items.map((r) => r.c.convention || r.c.name) })),
    })),
  })

  const tellSlack = async (phase: 'ready' | 'done') => {
    setNotifying(phase)
    try {
      const res = await fetch('/api/creative/lists/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload(phase)),
      })
      const d = await res.json().catch(() => ({ sent: false, error: 'No answer from the server.' }))
      if (!d.sent) {
        toast.error('Slack was not notified', { description: d.error ?? 'The message was not accepted.' })
        return
      }
      if (phase === 'ready') {
        toast(`K-Team notified — ${pending.length} ad${pending.length === 1 ? '' : 's'} to turn off`, {
          /* Worth saying out loud: without the thread the "done" reply has
             nothing to hang under and posts on its own. */
          description: d.threaded === false
            ? 'Posted, but not as a thread — set SLACK_CREATIVE_OPS_CHANNEL and a bot token to thread the reply.'
            : d.threadKept === false
              ? 'Posted, but the thread could not be saved — run supabase/migration_creative_threads.sql so the reply can find it.'
              : undefined,
        })
      } else {
        toast('Jason notified — the kill list is done', {
          description: d.repliedTo ? 'Posted as a reply under this morning’s list.' : undefined,
        })
      }
    } catch (e) {
      toast.error('Slack was not notified', { description: (e as Error).message })
    } finally {
      setNotifying(null)
    }
  }

  /* One row of work, used by today's list and by the older kills below it:
     the same ad, the same three actions, wherever it is shown. */
  const pendingRow = ({ k, c }: Row) => (

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
                <Pill tone={isToday && k.addedAt !== today ? 'amber' : undefined}>
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
  )

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kill List"
        description={
          isAdmin
            ? 'Every kill comes from a KILL decision on the watch list. Budget only drops once the kill is marked done.'
            : 'Turn these ads off in Ads Manager, then check them off. Jason is notified automatically.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History aria-hidden /> Everything killed ({history.length})
            </Button>
            {/* Jason's end of the handover. */}
            {isAdmin && (
              <Button
                onClick={() => void tellSlack('ready')}
                disabled={!isToday || pending.length === 0 || notifying !== null}
                title={
                  !isToday ? 'Only today’s list can be sent'
                    : pending.length === 0 ? 'Nothing is pending'
                    : 'Post the list to the K-Team’s Slack channel'
                }
              >
                <Send aria-hidden /> {notifying === 'ready' ? 'Sending…' : 'Kill list ready — notify K-Team'}
              </Button>
            )}
            {/* The other end of it, and not admin-only: the person clicking
                this is whoever just worked through Ads Manager. It needs
                something actually done to report — a day where nothing was
                ticked off is not a finished list. */}
            <Button
              variant={done.length > 0 && pending.length === 0 ? 'default' : 'outline'}
              onClick={() => void tellSlack('done')}
              disabled={!isToday || done.length === 0 || notifying !== null}
              title={
                !isToday ? 'Only today’s list can be reported'
                  : done.length === 0 ? 'Nothing has been ticked off yet'
                  : pending.length > 0 ? `${pending.length} still pending — this reports the ${done.length} already done`
                  : 'Tell Jason the list is carried out'
              }
            >
              <CheckCircle2 aria-hidden /> {notifying === 'done' ? 'Sending…' : 'Kill list completed — notify Jason'}
            </Button>
          </div>
        }
      />

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        title="Everything ever killed"
        description="Every ad turned off through the kill list, newest first — what it cost, and what it produced before it went."
        dateLabel="Date killed"
        rows={history}
        csvName="killed-creatives.csv"
      />

      <div className="flex flex-col gap-4 p-6">
        <BoardStatus migration="supabase/migration_creative_board.sql" />
        <div className="flex flex-wrap items-center gap-2">
          <DayNav date={date} onChange={setDate} label="Kill list day" />
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search the kill list"
            placeholder="Search name, ad set, firm, ad ID"
          />
        </div>
        <section aria-label="Kill totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="To kill"
            value={String(pending.length)}
            tone={pending.length > 0 ? 'bad' : undefined}
            hint={
              isToday && stillOpen.length > 0
                ? `still running · ${stillOpen.length} older ${stillOpen.length === 1 ? 'kill' : 'kills'} still open below`
                : isToday ? 'still running' : `decided on ${formatDate(date)}`
            }
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
            Pending{' '}
            <span className="font-normal text-muted-foreground">
              {/* While searching, both numbers: what is in front of you and
                  what the day actually holds. */}
              · {q ? `${shownPending.length} of ${pending.length} to kill` : `${pending.length} to kill`}
            </span>
          </h2>
          {pending.length === 0 ? (
            <EmptyState title={isToday ? 'No pending kills' : `Nothing was pending on ${formatDate(date)}`}>
              A creative lands here from a <strong>KILL</strong> decision on the watch list.
            </EmptyState>
          ) : shownPending.length === 0 ? (
            <EmptyState title={`Nothing pending matches “${query.trim()}”`}>
              {pending.length === 1
                ? 'One pending kill on this day, and it is not that name, ad set, firm or ad ID.'
                : `${pending.length} pending kills on this day, none of them by that name, ad set, firm or ad ID.`}
            </EmptyState>
          ) : (
            byFirm(shownPending).map(([firm, sets]) => (
              <FirmBlock key={firm} firm={firm} sets={sets} columns={columns}>
                {sets.map((g) => (
                  <AdsetGroup
                    key={g.key}
                    g={g}
                    siblings={adsetAds.get(g.key) ?? []}
                    columns={columns}
                    renderRow={pendingRow}
                  />
                ))}
              </FirmBlock>
            ))
          )}
        </div>

        {/* ── Decided earlier, never carried out ───────────────────────── */}
        {shownOpen.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="pt-2 text-sm font-semibold">
              Still open from earlier days{' '}
              <span className="font-normal text-muted-foreground">
                · {q ? `${shownOpen.length} of ${stillOpen.length}` : stillOpen.length} never turned off
              </span>
            </h2>
            {/* Apart from today's list, not inside it — today's list is
                today's decisions, and these are older work that nobody
                carried out. Shut by default, because it is a backlog to
                clear rather than the job in front of you; the actions are
                the same ones, so it can be cleared from here. */}
            {byFirm(shownOpen).map(([firm, sets]) => (
              <FirmBlock key={firm} firm={firm} sets={sets} columns={columns} defaultOpen={false}>
                {sets.map((g) => (
                  <AdsetGroup
                    key={g.key}
                    g={g}
                    siblings={adsetAds.get(g.key) ?? []}
                    columns={columns}
                    defaultOpen={false}
                    renderRow={pendingRow}
                  />
                ))}
              </FirmBlock>
            ))}
          </div>
        )}

        {/* ── Already off ──────────────────────────────────────────────── */}
        {shownDone.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="pt-2 text-sm font-semibold text-muted-foreground">
              Killed{' '}
              <span className="font-normal">
                · {q ? `${shownDone.length} of ${done.length} done` : `${done.length} done, moved to archives`}
              </span>
            </h2>
            {byFirm(shownDone).map(([firm, sets]) => (
              <FirmBlock key={firm} firm={firm} sets={sets} columns={columns} muted defaultOpen={false}>
                {sets.map((g) => (
                  <AdsetGroup
                    key={g.key}
                    g={g}
                    siblings={adsetAds.get(g.key) ?? []}
                    columns={columns}
                    muted
                    defaultOpen={false}
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
  firm, sets, columns, children, muted, defaultOpen = true,
}: {
  firm: string
  sets: readonly { items: Row[]; freed?: number }[]
  columns: MetricColumn[]
  children: React.ReactNode
  muted?: boolean
  /* Pending opens, killed stays shut.

     The two halves of this page are read differently. The pending list is
     the job: you want every row in front of you without opening anything.
     The killed list is the receipt — it is there to confirm the work was
     done and to undo a mistake, and once a firm has turned off a dozen ads
     it is the longest thing on the page. Shut, it stays a line you can
     count; open, it buries the job underneath it. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
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
  g, siblings, columns, renderRow, muted, defaultOpen = true,
}: {
  g: { key: string; adset: string; items: Row[]; freed?: number }
  /** Every ad still delivering in this ad set, killed or not. */
  siblings: Creative[]
  columns: MetricColumn[]
  renderRow: (row: Row) => React.ReactNode
  muted?: boolean
  /** Open on the pending list, shut on the killed one. See FirmBlock. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
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
