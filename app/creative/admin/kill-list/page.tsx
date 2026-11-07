'use client'

import { useMemo, useState } from 'react'
import { BatteryLow, ChevronRight, Skull, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { EmptyState, PageHeader, Pill, StatCard, Thumb } from '@/app/creative/_components/admin/shared'
import { formatDate, totalsFor, usd } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, KillItem } from '@/app/creative/_lib/types'
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
  const { kill, getCreative, markKillDone, markFatigued, removeKill } = useStore()

  /* An entry whose creative is no longer in the account cannot be rendered or
     acted on, so it is dropped here rather than returning null per row. */
  const rows = useMemo(
    () => kill.flatMap((k) => { const c = getCreative(k.creativeId); return c ? [{ k, c }] : [] }),
    [kill, getCreative],
  )

  const pending = rows.filter((r) => r.k.status === 'pending')
  const done = rows.filter((r) => r.k.status === 'done')
  const spend = pending.reduce((s, r) => s + r.c.dailyBudget, 0)

  const byFirm = (list: Row[]) => {
    const map = new Map<string, Row[]>()
    for (const r of list) map.set(r.c.firm, [...(map.get(r.c.firm) ?? []), r])
    return [...map.entries()].sort(([a], [b]) => firmRank(a) - firmRank(b) || a.localeCompare(b))
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
        <section aria-label="Kill totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="To kill" value={String(pending.length)} tone={pending.length > 0 ? 'bad' : undefined} hint="still running" />
          <StatCard label="Daily spend on them" value={usd(spend, 0)} hint="drops once they are off" />
          <StatCard label="Killed" value={String(done.length)} hint="moved to archives" />
        </section>

        {/* ── Still running ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">
            Pending <span className="font-normal text-muted-foreground">· {pending.length} to kill</span>
          </h2>

          {pending.length === 0 ? (
            <EmptyState title="No pending kills">
              A creative lands here from a <strong>KILL</strong> decision on the watch list.
            </EmptyState>
          ) : (
            byFirm(pending).map(([firm, items]) => (
              <FirmBlock key={firm} firm={firm} items={items}>
                {items.map(({ k, c }) => (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Checkbox aria-label={`Mark ${c.name} as killed`} onCheckedChange={() => markKillDone(k.id, true, role)} />
                    <Thumb c={c} />
                    <div className="min-w-0 flex-1">
                      <code className="block truncate font-mono text-sm font-medium">{c.convention}</code>
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <Pill>{usd(c.dailyBudget, 0)}/day</Pill>
                        <Pill>Added {formatDate(k.addedAt)}</Pill>
                        {k.reason && <span className="truncate text-xs text-muted-foreground">{k.reason}</span>}
                      </div>
                    </div>
                    {/* Same action in Ads Manager, different meaning here: a
                        fatigued ad is a winner worth pulling back later, so it
                        is archived apart from the ones that simply failed. */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      title="Worked, but worn out — archive it as fatigued"
                      onClick={() => {
                        markFatigued(k.id)
                        toast(`${c.convention} archived as fatigued`)
                      }}
                    >
                      <BatteryLow aria-hidden /> Fatigue
                    </Button>
                    {isAdmin && (
                      <Button size="icon-sm" variant="ghost" aria-label="Remove from kill list" onClick={() => removeKill(k.id)}>
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </li>
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
            {byFirm(done).map(([firm, items]) => (
              <FirmBlock key={firm} firm={firm} items={items} muted>
                {items.map(({ k, c }) => {
                  const t = totalsFor(c, 'max')
                  return (
                    <li key={k.id} className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground">
                      <Thumb c={c} />
                      <code className="min-w-0 flex-1 truncate font-mono text-sm line-through">{c.convention}</code>
                      <Pill>Lifetime CPL {usd(t.cpl, 0)}</Pill>
                      <Pill tone="green">Killed {k.doneAt && formatDate(k.doneAt)}</Pill>
                      <Button size="sm" variant="ghost" className="shrink-0" onClick={() => markKillDone(k.id, false, role)}>
                        <Undo2 aria-hidden /> Undo
                      </Button>
                    </li>
                  )
                })}
              </FirmBlock>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* One firm's ads. Collapsible, and the header carries what it costs to leave
   them running — the number that decides whether this group is today's job. */
function FirmBlock({
  firm, items, children, muted,
}: {
  firm: string
  items: Row[]
  children: React.ReactNode
  muted?: boolean
}) {
  const [open, setOpen] = useState(true)
  const spend = items.reduce((s, r) => s + r.c.dailyBudget, 0)

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
        <span className="shrink-0 text-xs text-muted-foreground">{items.length}</span>
        {!muted && spend > 0 && <Pill tone="red">{usd(spend, 0)}/day</Pill>}
      </button>
      {open && <ul className="divide-y">{children}</ul>}
    </div>
  )
}
