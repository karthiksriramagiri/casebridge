'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Paperclip,
  Plus, Rocket, Search, TriangleAlert, Undo2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AssignmentDetailSheet } from '@/app/creative/_components/assignment-detail-sheet'
import { ManualLaunchDialog } from '@/app/creative/_components/admin/manual-launch-dialog'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { Input } from '@/app/creative/_ui/input'
import { downloadCsv, EmptyState, PageHeader, Pill, StatCard, Thumb } from '@/app/creative/_components/admin/shared'
import { PriorityStars } from '@/app/creative/_components/admin/priority-stars'
import { TODAY, addDays } from '@/app/creative/_lib/data'
import { formatDate } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import {
  ASSIGNMENT_FIRMS, firmLabel,
  type Assignment, type AssignmentFirm,
} from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Launch Lists

   A finished creative and a creative with a launch date are two different
   things, and the old page could not tell them apart — it held its own list,
   written when someone pushed a card at it, which then had to be kept in step
   with the board by hand.

   So this reads the board directly. Anything at *Ready to Launch* is in the
   pool; giving it a date moves it onto that day's list. Nothing is copied,
   which means nothing can drift.

   Grouped by firm throughout, because a launch session is done one ad account
   at a time — you sit in Larry H. Parker and do its ads, then move on. A list
   sorted by anything else makes someone hop between accounts all morning.
   ═══════════════════════════════════════════════════════════════════════════ */

/* A firm with nothing in it is still shown while scheduling, so the four
   accounts always read in the same order and the eye learns where to look. */
const FIRM_ORDER: readonly string[] = [...ASSIGNMENT_FIRMS]
const firmRank = (f: string | undefined) => {
  const i = FIRM_ORDER.indexOf(f ?? '')
  return i === -1 ? FIRM_ORDER.length : i
}

const byPriority = (a: Assignment, b: Assignment) =>
  (b.priority ?? 3) - (a.priority ?? 3) || a.order - b.order

export default function LaunchListsPage() {
  const { assignments, updateAssignment, setLaunched, manualLaunch, boardLoading, boardError } = useStore()
  /* The day comes from the store, not from here. Every page in the center
     reads the same one, so the numbers and the boards can never disagree
     about what day it is. */
  const { day: date, setDay: setDate } = useStore()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [manualOpen, setManualOpen] = useState(false)
  /* The creative opens in the same sheet the assignment board uses, so the
     files, the script and the feedback are all here — a launch decision is
     usually "let me watch it once more" rather than a guess from a title. */
  const [openId, setOpenId] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const matches = (a: Assignment) =>
    !q || a.title.toLowerCase().includes(q) || (a.batch ?? '').toLowerCase().includes(q) ||
    (a.angle ?? '').toLowerCase().includes(q)

  /* Three states, from one list: waiting for a date, dated for the day on
     screen, and already out. */
  const { pool, scheduled, launched, datesWithWork } = useMemo(() => {
    const dates = new Set<string>()
    for (const a of assignments) if (a.launchDate) dates.add(a.launchDate)
    return {
      /* Still waiting: finished, but nobody has picked a day for it. */
      pool: assignments.filter((a) => a.status === 'Ready to Launch' && matches(a)).sort(byPriority),
      /* Picked. The status carries that on the board too, so a card queued
         here is sitting in Launching over there rather than looking untouched. */
      scheduled: assignments
        .filter((a) => a.status === 'Launching' && a.launchDate === date && matches(a))
        .sort(byPriority),
      launched: assignments
        .filter((a) => a.launchDate === date && (a.status === 'Ad Launched' || a.status === 'Winner Ad') && matches(a))
        .sort(byPriority),
      datesWithWork: dates,
    }
  }, [assignments, date, q])

  /* Anything dated before today and still not out. Carried on the header
     rather than inside a day, because the day it was meant for is not the day
     anyone is looking at. */
  const overdue = useMemo(
    () => assignments.filter((a) => a.status === 'Launching' && a.launchDate && a.launchDate < TODAY),
    [assignments],
  )

  const groupByFirm = (list: Assignment[]) => {
    const map = new Map<string, Assignment[]>()
    for (const a of list) {
      const key = a.firm ?? ''
      map.set(key, [...(map.get(key) ?? []), a])
    }
    return [...map.entries()].sort(([a], [b]) => firmRank(a) - firmRank(b) || a.localeCompare(b))
  }

  /* Picking an ad for a day is a move on the board, not a label on it: the
     card goes to Launching, and putting it back returns it to Ready to
     Launch. Written as one patch per card rather than through
     setAssignmentStatus, which would also fire a notification each — twenty
     at once is a queue, not twenty announcements. */
  const schedule = (ids: string[], when: string | undefined) => {
    for (const id of ids) {
      updateAssignment(id, {
        launchDate: when,
        status: when ? 'Launching' : 'Ready to Launch',
      })
    }
    setPicked(new Set())
    toast(
      when
        ? `${ids.length} moved to Launching for ${formatDate(when)}`
        : `${ids.length} back in the ready pool`,
    )
  }

  const launch = (a: Assignment) => {
    setLaunched(a.id, true)
    toast(`${a.title} marked launched`)
  }

  /* Marking something launched is a one-click action, which means it is a
     one-click mistake. Undo puts it back in the day's queue rather than the
     ready pool — the day was not wrong, only the "it is live" part. */
  const unlaunch = (a: Assignment) => {
    setLaunched(a.id, false)
    toast(`${a.title} back in the ${formatDate(date)} queue`)
  }

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Launch Lists"
        description="Everything finished and waiting, and what goes out on a given day."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setManualOpen(true)}>
              <Plus aria-hidden /> Manual launch
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(`launch-${date}.csv`, [
                  ['Firm', 'Title', 'Batch', 'Format', 'Visual', 'Verbal', 'Priority', 'Status'],
                  ...[...scheduled, ...launched].map((a) => [
                    firmLabel(a.firm), a.title, a.batch ?? '', a.format ?? '',
                    a.visualCode ?? '', a.verbalCode ?? '', String(a.priority ?? 3), a.status,
                  ]),
                ])
              }
            >
              <Download aria-hidden /> Export day
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <BoardStatus migration="supabase/migration_creative_board.sql" />
        {boardError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {boardError}
          </p>
        )}

        {overdue.length > 0 && (
          <button
            type="button"
            onClick={() => setDate(overdue[0].launchDate!)}
            className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-left hover:bg-warning/15"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">
                {overdue.length} {overdue.length === 1 ? 'creative was' : 'creatives were'} due before today and {overdue.length === 1 ? 'has' : 'have'} not gone out
              </p>
              <p className="text-muted-foreground">
                Earliest {formatDate(overdue[0].launchDate!)} — click to open that day.
              </p>
            </div>
          </button>
        )}

        <section aria-label="Launch totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Ready to launch" value={String(pool.length)} hint="finished, no date yet" />
          <StatCard label={`Queued ${formatDate(date)}`} value={String(scheduled.length)} tone={scheduled.length > 0 ? 'good' : undefined} hint="waiting to go out" />
          <StatCard label={`Launched ${formatDate(date)}`} value={String(launched.length)} hint="already live" />
          <StatCard label="Overdue" value={String(overdue.length)} tone={overdue.length > 0 ? 'bad' : undefined} hint="dated before today" />
        </section>

        {/* ── The day ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <input
            type="date"
            value={date}
            aria-label="Launch day"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border bg-background px-2.5 py-1.5 text-sm"
          />
          <Button variant="outline" size="icon-sm" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          {date !== TODAY && (
            <Button variant="ghost" size="sm" onClick={() => setDate(TODAY)}>Today</Button>
          )}
          {datesWithWork.has(date) && <Pill tone="blue">has launches</Pill>}

          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, batch or angle"
              aria-label="Search creatives"
              className="pl-8"
            />
          </div>
        </div>

        {boardLoading ? (
          <div className="h-72 animate-pulse rounded-lg border bg-card" />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            {/* ── Ready pool ───────────────────────────────────────────── */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Ready to launch <span className="font-normal text-muted-foreground">· {pool.length}</span>
                </h2>
                {picked.size > 0 && (
                  <Button size="sm" onClick={() => schedule([...picked], date)}>
                    <CalendarDays aria-hidden /> Queue {picked.size} for {formatDate(date)}
                  </Button>
                )}
              </div>

              {pool.length === 0 ? (
                <EmptyState title="Nothing waiting">
                  A creative lands here when its assignment reaches <strong>Ready to Launch</strong>, and
                  moves to <strong>Launching</strong> once you queue it for a day.
                </EmptyState>
              ) : (
                groupByFirm(pool).map(([firm, items]) => (
                  <FirmGroup
                    key={firm || 'none'}
                    firm={firm}
                    items={items}
                    pickedCount={items.filter((i) => picked.has(i.id)).length}
                    onSelectAll={() => {
                      const ids = items.map((i) => i.id)
                      const allPicked = ids.every((id) => picked.has(id))
                      setPicked((p) => {
                        const next = new Set(p)
                        /* A second press clears the firm again — otherwise
                           "select all" is a one-way door. */
                        for (const id of ids) allPicked ? next.delete(id) : next.add(id)
                        return next
                      })
                    }}
                  >
                    {items.map((a) => (
                      <Row
                        key={a.id}
                        a={a}
                        selected={picked.has(a.id)}
                        onSelect={() => toggle(a.id)}
                        onOpen={() => setOpenId(a.id)}
                      >
                        <Checkbox
                          aria-label={`Select ${a.title}`}
                          checked={picked.has(a.id)}
                          onClick={(e) => e.stopPropagation()}
                          onCheckedChange={() => toggle(a.id)}
                        />
                      </Row>
                    ))}
                  </FirmGroup>
                ))
              )}
            </section>

            {/* ── That day ─────────────────────────────────────────────── */}
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">
                Launching {formatDate(date)}{' '}
                <span className="font-normal text-muted-foreground">· {scheduled.length}</span>
              </h2>

              {scheduled.length === 0 ? (
                <EmptyState title={`Nothing queued for ${formatDate(date)}`}>
                  Tick creatives on the left and queue them for this day.
                </EmptyState>
              ) : (
                groupByFirm(scheduled).map(([firm, items]) => (
                  <FirmGroup key={firm || 'none'} firm={firm} items={items} defaultOpen>
                    {items.map((a) => (
                      <Row key={a.id} a={a} onOpen={() => setOpenId(a.id)}>
                        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="icon-sm" aria-label={`Mark ${a.title} launched`} title="Mark launched" onClick={() => launch(a)}>
                            <Rocket aria-hidden />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Put ${a.title} back in the pool`}
                            title="Back to ready pool"
                            onClick={() => schedule([a.id], undefined)}
                          >
                            <Undo2 aria-hidden />
                          </Button>
                        </div>
                      </Row>
                    ))}
                  </FirmGroup>
                ))
              )}

              {launched.length > 0 && (
                <>
                  <h2 className="pt-2 text-sm font-semibold text-muted-foreground">
                    Launched on {formatDate(date)} <span className="font-normal">· {launched.length}</span>
                  </h2>
                  {groupByFirm(launched).map(([firm, items]) => (
                    <FirmGroup key={firm || 'none'} firm={firm} items={items} muted defaultOpen>
                      {items.map((a) => (
                        <Row key={a.id} a={a} muted onOpen={() => setOpenId(a.id)}>
                          <div className="flex shrink-0 items-center gap-1">
                            <CheckCircle2 className="size-4 text-success" aria-hidden />
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Undo launch of ${a.title}`}
                              title="Undo — back to the day's queue"
                              onClick={(e) => { e.stopPropagation(); unlaunch(a) }}
                            >
                              <Undo2 aria-hidden />
                            </Button>
                          </div>
                        </Row>
                      ))}
                    </FirmGroup>
                  ))}
                </>
              )}
            </section>
          </div>
        )}
      </div>

      <AssignmentDetailSheet assignmentId={openId} onClose={() => setOpenId(null)} />

      {/* A launch that never had an assignment behind it — a straight
          relaunch, or something cut outside the board. */}
      <ManualLaunchDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreate={(input) => {
          manualLaunch(input)
          setManualOpen(false)
          toast('Added to the launch list')
        }}
      />
    </div>
  )
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

/* Collapsible, because a firm can hold fifty finished creatives and four of
   those open at once is a page nobody can scan. The header has to earn its
   keep while shut, so it carries the count and how many are urgent — enough
   to decide whether to open it at all.

   Selection and the picked count stay live while a group is closed: closing a
   firm hides its rows, it does not drop what you had chosen inside it. */
function FirmGroup({
  firm, items, children, onSelectAll, muted, defaultOpen = false, pickedCount = 0,
}: {
  firm: string
  items: Assignment[]
  children: React.ReactNode
  onSelectAll?: () => void
  muted?: boolean
  defaultOpen?: boolean
  pickedCount?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  const urgent = items.filter((a) => (a.priority ?? 3) >= 4).length

  return (
    <div className={cn('overflow-hidden rounded-lg border bg-card', muted && 'opacity-70')}>
      <div className="flex items-center gap-2 border-b bg-muted/50 px-2 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
          <span className="truncate text-sm font-medium">{firmLabel(firm)}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{items.length}</span>
          {urgent > 0 && <Pill tone="amber">{urgent} urgent</Pill>}
          {pickedCount > 0 && <Pill tone="blue">{pickedCount} picked</Pill>}
        </button>
        {onSelectAll && (
          <button type="button" onClick={onSelectAll} className="shrink-0 pr-1 text-xs text-primary hover:underline">
            Select all
          </button>
        )}
      </div>
      {open && <ul className="divide-y">{children}</ul>}
    </div>
  )
}

/* The whole row is the hit target for selecting — ticking fifty creatives
   through a 16px box is a worse job than it needs to be. The title is the one
   exception: it opens the creative, so it stops the click before it reaches
   the row and toggles something the reader did not mean to touch. */
function Row({
  a, children, muted, selected, onSelect, onOpen,
}: {
  a: Assignment
  children: React.ReactNode
  muted?: boolean
  selected?: boolean
  onSelect?: () => void
  onOpen: () => void
}) {
  return (
    <li
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 transition-colors',
        onSelect && 'cursor-pointer hover:bg-muted/50',
        selected && 'bg-accent/50 hover:bg-accent/60',
      )}
    >
      {children}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          className={cn(
            'block max-w-full truncate text-left text-sm font-medium hover:text-primary hover:underline',
            muted && 'text-muted-foreground',
          )}
          title="Open this creative"
        >
          {a.title}
        </button>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <PriorityStars value={a.priority ?? 3} size="sm" />
          {a.batch && <Pill>{a.batch}</Pill>}
          {a.format && <Pill tone="blue">{a.format}</Pill>}
          {(a.visualCode || a.verbalCode) && (
            <Pill>{[a.visualCode, a.verbalCode].filter(Boolean).join(' × ')}</Pill>
          )}
          {(a.attachments?.length ?? 0) > 0 && (
            <Pill><Paperclip className="size-3" aria-hidden /> {a.attachments.length}</Pill>
          )}
        </div>
      </div>
    </li>
  )
}
