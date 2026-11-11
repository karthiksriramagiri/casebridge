'use client'

import { useMemo, useState } from 'react'
import { BatteryLow, ChevronRight, RotateCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, matchesQuery, PageHeader, Pill, SearchBox, StatCard, Thumb } from '@/app/creative/_components/admin/shared'
import { BoardStatus } from '@/app/creative/_components/admin/board-status'
import { formatDate, totalsFor, usd, WINNER_CPL } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Relaunch / Fatigue

   Everything here is off — that is what makes it an archive — so splitting
   it into "fatigued" and "killed" tabs was a filter that hid half the list to
   answer a question nobody asks. Why it came off is still worth knowing, so
   it rides on the row as a tag rather than as a wall between two lists.

   Grouped by firm because a relaunch decision is made inside one account: you
   are asking "what have I rested long enough in Larry H. Parker", not "what
   is the oldest thing anywhere".
   ═══════════════════════════════════════════════════════════════════════════ */

const firmRank = (code: string) => {
  const i = FIRMS.findIndex((f) => f.code === code)
  return i === -1 ? FIRMS.length : i
}

export default function ArchivesPage() {
  const { archived, relaunch, launches, hideFromArchive } = useStore()
  const isAdmin = useRole() === 'admin'

  /* Queued, and already gone back up, are two different states.

     An ad queued for relaunch is waiting on today's launch list. An ad that
     has already been relaunched has had its second run — and the whole point
     of this page is that a second run is the last one: the audience has seen
     it, and sending it up a third time is spending money to show people an
     ad they have already ignored twice. So it is tagged and the button is
     closed off, with the one exception below. */
  /* Relaunches only. A launch raised off a double down also carries the
     winner's id — that is a NEW cut going up, not this ad going up again,
     and counting it would tag an ad as relaunched that never was. */
  const relaunchRows = useMemo(() => launches.filter((l) => l.requestedBy === 'relaunch'), [launches])
  const queued = useMemo(
    () => new Set(relaunchRows.filter((l) => l.status === 'pending').map((l) => l.sourceCreativeId)),
    [relaunchRows],
  )
  const relaunched = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of relaunchRows) {
      if (l.status !== 'done' || !l.sourceCreativeId) continue
      const on = l.doneAt ?? l.date
      const seen = m.get(l.sourceCreativeId)
      if (!seen || on > seen) m.set(l.sourceCreativeId, on)
    }
    return m
  }, [relaunchRows])

  const fatigued = useMemo(() => archived.filter((c) => c.archived?.reason === 'Fatigue'), [archived])

  /* The archive only grows, so it is the list most in need of a search:
     what is being asked of it is nearly always one ad by name. */
  const [query, setQuery] = useState('')
  const shown = useMemo(
    () => archived.filter((c) => matchesQuery(query, [c.convention, c.name, c.adId, c.adset, c.angle, firmName(c.firm), c.accountLabel])),
    [archived, query],
  )

  /* Taking a row off this list, and nothing more.

     The archive is built out of the kill rows, so deleting one would tidy
     this page and take the record with it — the ad would vanish from the
     day it was killed on and out of "everything ever killed". The kill is
     left exactly as it was; the row is marked hidden and this page stops
     listing it. Ads Manager is not touched either way. */
  const forget = async (c: Creative) => {
    /* The toast waits for the write. Saying "removed" before the row is
       actually gone is how a failure comes to look like a success. */
    const gone = await hideFromArchive(c.id)
    if (!gone) return
    toast(`${c.convention || c.name} removed from the list`, {
      description: 'The kill itself is kept — it still shows on its own day and in the killed history.',
    })
  }

  const byFirm = (list: Creative[]) => {
    const map = new Map<string, Creative[]>()
    for (const c of list) map.set(c.firm, [...(map.get(c.firm) ?? []), c])
    return [...map.entries()].sort(([a], [b]) => firmRank(a) - firmRank(b) || a.localeCompare(b))
  }

  const relaunchIt = (c: Creative) => {
    relaunch(c.id)
    toast('Added to today’s launch list as a relaunch')
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Relaunch / Fatigue"
        description="Ads that are off, and which of them are worth running again."
      />

      <div className="flex flex-col gap-4 p-6">
        {/* Removing a row writes to the kill board, so a missing table — or
            a missing column, which is what an un-run migration looks like —
            has to say so here rather than letting the row quietly come back
            on the next poll. */}
        <BoardStatus migration="supabase/migration_creative_board_3.sql" />
        <section aria-label="Archive totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Archived" value={String(archived.length)} hint="ads that are off" />
          <StatCard label="Fatigued" value={String(fatigued.length)} hint="worked, then wore out" />
          <StatCard
            label="Past winners"
            value={String(archived.filter((c) => { const t = totalsFor(c, 'max'); return t.cpl !== null && t.cpl < WINNER_CPL }).length)}
            tone="good"
            hint={`lifetime CPL under ${usd(WINNER_CPL, 0)}`}
          />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Search the archive"
            placeholder="Search name, ad set, firm, ad ID"
          />
          {query.trim() && (
            <span className="text-xs text-muted-foreground">{shown.length} of {archived.length} archived</span>
          )}
        </div>

        {archived.length === 0 ? (
          <EmptyState title="Nothing archived yet">
            An ad lands here once it is killed or marked <strong>Fatigue</strong> on the kill list.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState title={`Nothing archived matches “${query.trim()}”`}>
            {archived.length} archived {archived.length === 1 ? 'ad' : 'ads'}, none of them by that name, ad set, firm or ad ID.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {byFirm(shown).map(([firm, items]) => (
              <FirmBlock key={firm} firm={firm} items={items}>
                {items.map((c) => (
                  <ArchiveRow
                    key={c.id}
                    c={c}
                    isAdmin={isAdmin}
                    queued={queued.has(c.id)}
                    relaunchedOn={relaunched.get(c.id)}
                    onRelaunch={() => relaunchIt(c)}
                    onForget={() => void forget(c)}
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

/* A firm's archive. Collapsible for the same reason the launch list's groups
   are — an account accumulates these forever, and all of them open at once is
   a page nobody reads. */
function FirmBlock({
  firm, items, children,
}: {
  firm: string
  items: Creative[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const winners = items.filter((c) => { const t = totalsFor(c, 'max'); return t.cpl !== null && t.cpl < WINNER_CPL }).length
  const fatigued = items.filter((c) => c.archived?.reason === 'Fatigue').length

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b bg-muted/50 px-2 py-2 text-left"
      >
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="truncate text-sm font-medium">{firmName(firm)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{items.length}</span>
        {fatigued > 0 && (
          <Pill tone="amber"><BatteryLow className="size-3" aria-hidden /> {fatigued} fatigued</Pill>
        )}
        {winners > 0 && <Pill tone="green">{winners} past {winners === 1 ? 'winner' : 'winners'}</Pill>}
      </button>
      {open && <ul className="divide-y">{children}</ul>}
    </div>
  )
}

function ArchiveRow({
  c, isAdmin, queued, relaunchedOn, onRelaunch, onForget,
}: {
  c: Creative
  isAdmin: boolean
  queued: boolean
  /** The day it last went back up, if it ever did. */
  relaunchedOn?: string
  onRelaunch: () => void
  onForget: () => void
}) {
  const t = totalsFor(c, 'max')
  /* A clear winner, and the only thing allowed a third run.

     Everything on this page beat its CPL once or it would not be worth
     relaunching at all. A clear winner beat it over its whole life AND
     signed cases off it — the two together are the difference between an ad
     that looked cheap and one that actually produced, and only the second is
     worth putting in front of an audience for a third time. */
  const winner = t.cpl !== null && t.cpl < WINNER_CPL
  const clearWinner = winner && t.acquisitions > 0
  const spent = !!relaunchedOn && !clearWinner

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Thumb c={c} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.name}</div>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          {clearWinner ? <Pill tone="green">Clear winner</Pill> : winner && <Pill tone="green">Past winner</Pill>}
          <Pill>Lifetime CPL {usd(t.cpl)}</Pill>
          <Pill>{t.leads} leads</Pill>
          {/* The tag this page exists for: it has already had its second
              run, so it is not going up again. */}
          {relaunchedOn && <Pill tone="blue"><RotateCw className="size-3" aria-hidden /> Relaunched {formatDate(relaunchedOn)}</Pill>}
          {queued && !relaunchedOn && <Pill tone="blue">Relaunch queued</Pill>}
          {c.archived?.reason === 'Fatigue' && c.archived.fatigueDate && (
            <Pill tone="amber">Fatigued {formatDate(c.archived.fatigueDate)}</Pill>
          )}
          {c.archived && <Pill>Off {formatDate(c.archived.killDate)}</Pill>}
        </div>
      </div>
      {isAdmin ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant={clearWinner ? 'default' : 'outline'}
            disabled={queued || spent}
            onClick={onRelaunch}
            title={
              queued ? 'Already on today’s launch list'
                : spent ? 'Already relaunched once. Only a clear winner — cheap CPL and signed cases — goes up a third time.'
                : clearWinner && relaunchedOn ? 'Clear winner: worth another run even though it has been relaunched'
                : undefined
            }
          >
            <RotateCw aria-hidden /> {queued ? 'Queued' : spent ? 'Relaunched' : relaunchedOn ? 'Relaunch again' : 'Relaunch'}
          </Button>
          {/* Forgetting a row, for the ones that will never go back up. The
              ad is not touched — this takes it off the center's list. */}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${c.name} from this list`}
            title="Remove from this list. The kill record and the ad itself are untouched."
            onClick={onForget}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : queued ? <Pill tone="blue">Relaunch queued</Pill> : relaunchedOn ? <Pill tone="blue">Relaunched</Pill> : null}
    </li>
  )
}
