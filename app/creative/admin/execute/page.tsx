'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight,
  Download, Eye, Rocket, Skull, Trophy,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { downloadCsv, PageHeader, Pill, StatCard } from '@/app/creative/_components/admin/shared'
import { PriorityStars } from '@/app/creative/_components/admin/priority-stars'
import { AssignmentDetailSheet } from '@/app/creative/_components/assignment-detail-sheet'
import { TODAY, addDays } from '@/app/creative/_lib/data'
import { adsetIsOn, formatDate, totalsFor, usd, WINNER_CPL } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import {
  FIRM_KEYS, FIRM_KEY_LABEL, firmKey,
  type Assignment, type Creative, type FirmKey, type KillItem, type WatchItem,
} from '@/app/creative/_lib/types'
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
  launching: Assignment[]
  budget: number
  winners: number
}

export default function ExecutePage() {
  const role = useRole()
  const {
    creatives, kill, watch, assignments, killedIds,
    markKillDone, setAssignmentStatus, getCreative, boardLoading,
  } = useStore()
  const [date, setDate] = useState(TODAY)
  const [openId, setOpenId] = useState<string | null>(null)

  const firms = useMemo<FirmBlockData[]>(() => {
    const mine = (code: string | undefined, key: FirmKey) => firmKey(code) === key

    return FIRM_KEYS.map((key) => {
      /* Only what is switched on counts as the current structure — a paused
         ad is not part of the account anyone is about to discuss. */
      const live = creatives.filter((c) => mine(c.firm, key) && !killedIds.has(c.id) && adsetIsOn(c))

      const toKill = kill
        .filter((k) => k.status === 'pending' || k.doneAt === date)
        .flatMap((k) => { const c = getCreative(k.creativeId); return c && mine(c.firm, key) ? [{ k, c }] : [] })
        .sort((a, b) => Number(a.k.status === 'done') - Number(b.k.status === 'done'))

      return {
        key,
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
        launching: assignments
          .filter((a) => a.status === 'Launching' && a.launchDate === date && mine(a.firm, key))
          .sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3)),
        budget: live.reduce((s, c) => s + c.dailyBudget, 0),
        winners: live.filter((c) => { const t = totalsFor(c, 'max'); return t.cpl !== null && t.cpl < WINNER_CPL }).length,
      }
    })
  }, [creatives, kill, watch, assignments, killedIds, getCreative, date])

  const total = firms.reduce(
    (a, f) => ({
      kill: a.kill + f.killPending.length,
      watch: a.watch + f.watchToday.length,
      live: a.live + f.live.length,
      launching: a.launching + f.launching.length,
      budget: a.budget + f.budget,
      killBudget: a.killBudget + f.killPending.reduce((s, r) => s + r.c.dailyBudget, 0),
    }),
    { kill: 0, watch: 0, live: 0, launching: 0, budget: 0, killBudget: 0 },
  )

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
                  ...f.toKill.map((r) => [FIRM_KEY_LABEL[f.key], 'To kill', r.c.convention, String(r.c.dailyBudget), r.k.reason]),
                  ...f.watchToday.map((r) => [FIRM_KEY_LABEL[f.key], 'To watch', r.c.convention, String(r.c.dailyBudget), r.w.reason]),
                  ...f.live.map((c) => [FIRM_KEY_LABEL[f.key], 'Current structure', c.convention, String(c.dailyBudget), '']),
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
        <section aria-label="Meeting totals" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Killing" value={String(total.kill)} tone={total.kill > 0 ? 'bad' : undefined} hint={`${usd(total.killBudget, 0)}/day comes off`} />
          <StatCard label="Watching" value={String(total.watch)} hint="decisions due" />
          <StatCard label="Live ads" value={String(total.live)} hint="switched on right now" />
          <StatCard label="Launching" value={String(total.launching)} tone={total.launching > 0 ? 'good' : undefined} hint={`queued for ${formatDate(date)}`} />
          <StatCard label="Current budget" value={usd(total.budget, 0)} hint="all firms, per day" />
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <input
            type="date"
            value={date}
            aria-label="Meeting day"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
          />
          <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => setDate((d) => addDays(d, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          {date !== TODAY && <Button variant="ghost" size="sm" onClick={() => setDate(TODAY)}>Today</Button>}
        </div>

        {boardLoading ? (
          <div className="h-96 animate-pulse rounded-lg border bg-card" />
        ) : (
          firms.map((f) => (
            <FirmOverview
              key={f.key}
              f={f}
              date={date}
              onKill={(k, c, done) => { markKillDone(k.id, done, role); toast(`${c.convention} ${done ? 'marked killed' : 'put back on the kill list'}`) }}
              onLaunched={(a) => { setAssignmentStatus(a.id, 'Ad Launched', 'admin'); toast(`${a.title} marked launched`) }}
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
  onLaunched: (a: Assignment) => void
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const [showYesterday, setShowYesterday] = useState(false)
  /* The structure table is the long one — twenty-odd rows a firm — and it is
     reference rather than a decision, so it starts shut. */
  const [showStructure, setShowStructure] = useState(false)
  const empty = f.toKill.length + f.watchToday.length + f.live.length + f.launching.length === 0

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
          {f.watchToday.length > 0 && <Pill tone="amber">{f.watchToday.length} watching</Pill>}
          {f.launching.length > 0 && <Pill tone="green">{f.launching.length} launching</Pill>}
          <Pill>{f.live.length} live · {usd(f.budget, 0)}/day</Pill>
        </span>
      </button>

      {open && (empty ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing for this firm on {formatDate(date)}.</p>
      ) : (
        <div className="divide-y">
          <Section icon={Skull} label="To kill" tone="red" count={f.killPending.length}>
            {f.toKill.length === 0 ? <Nothing>Nothing coming off.</Nothing> : (
              <ul className="flex flex-col gap-1.5">
                {f.toKill.map(({ k, c }) => {
                  const done = k.status === 'done'
                  return (
                    <li key={k.id} className={cn('flex items-center gap-2.5 text-sm', done && 'text-muted-foreground')}>
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
                      <Pill>{usd(c.dailyBudget, 0)}/day</Pill>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section icon={Eye} label="To watch" tone="amber" count={f.watchToday.length}>
            {f.watchToday.length === 0 ? <Nothing>Nothing on watch.</Nothing> : (
              <ul className="flex flex-col gap-1.5">
                {f.watchToday.map(({ w, c }) => (
                  <li key={w.id} className="flex items-center gap-2.5 text-sm">
                    <code className="min-w-0 flex-1 truncate font-mono text-xs">{c.convention}</code>
                    <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:inline">{w.reason}</span>
                    {w.decision && <Pill tone={w.decision === 'KILL' ? 'red' : 'blue'}>{w.decision}</Pill>}
                  </li>
                ))}
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
            count={f.live.length}
            right={
              <span className="text-xs text-muted-foreground">
                Budget <strong className="text-foreground">{usd(f.budget, 0)}</strong>/day
                {f.winners > 0 && ` · ${f.winners} winner${f.winners === 1 ? '' : 's'}`}
              </span>
            }
          >
            {f.live.length === 0 ? <Nothing>Nothing running.</Nothing> : (
              <>
                <button
                  type="button"
                  onClick={() => setShowStructure((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className={cn('size-3 transition-transform', !showStructure && '-rotate-90')} aria-hidden />
                  {showStructure ? 'Hide' : 'Show'} the {f.live.length} live ads
                </button>
                {showStructure && (
                  <div className="mt-2 overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-left font-medium">Ad name</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Ad set budget</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Lifetime CPL</th>
                          <th scope="col" className="px-3 py-2 text-right font-medium">Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...f.live].sort((a, b) => b.dailyBudget - a.dailyBudget).map((c) => {
                          const t = totalsFor(c, 'max')
                          const winner = t.cpl !== null && t.cpl < WINNER_CPL
                          return (
                            <tr key={c.id} className="border-t">
                              <td className="max-w-[340px] truncate px-3 py-1.5 font-mono text-xs">{c.convention}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{c.dailyBudget ? usd(c.dailyBudget, 0) : '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{usd(t.cpl, 0)}</td>
                              <td className="px-3 py-1.5 text-right">{winner ? <Pill tone="green">Winner</Pill> : <span className="text-muted-foreground">—</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Section>

          <Section icon={Rocket} label={`Launching ${formatDate(date)}`} tone="green" count={f.launching.length}>
            {f.launching.length === 0 ? (
              <Nothing>Nothing queued — pick creatives on the Launch Lists page.</Nothing>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {f.launching.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5 text-sm">
                    <Checkbox aria-label={`Mark ${a.title} launched`} onCheckedChange={() => onLaunched(a)} />
                    <button
                      type="button"
                      onClick={() => onOpen(a.id)}
                      className="min-w-0 flex-1 truncate text-left hover:text-primary hover:underline"
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
                ))}
              </ul>
            )}
          </Section>
        </div>
      ))}
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
