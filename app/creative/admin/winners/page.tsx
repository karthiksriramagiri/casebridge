'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, PageHeader, Pill, RangeSelect, Thumb } from '@/app/creative/_components/admin/shared'
import { pct, totalsFor, usd, WINNER_CPL } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName } from '@/app/_metrics/firms'
import type { Creative, RangeKey, Totals } from '@/app/creative/_lib/types'

/* ═══════════════════════════════════════════════════════════════════════════
   Winner Analysis — what is working, and what to make more of.

   Remake candidates used to sit in a second column here. They were a
   different question: a remake is a near-miss being rescued, judged on hook
   and CTR, while this page is about ads that are already winning. Mixing the
   two meant the winners got half the width and half the attention, and the
   page answered neither question well.

   Grouped by firm, like every other list in the center: a winner for Larry H.
   Parker is not a winner the Jacoby board can use, and budget is decided per
   firm.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function WinnersPage() {
  const { creatives, killedIds, assignments, addAssignment } = useStore()
  const isAdmin = useRole() === 'admin'
  const [range, setRange] = useState<RangeKey>('7d')

  const winners = creatives
    .filter((c) => !killedIds.has(c.id))
    .map((c) => ({ c, t: totalsFor(c, range) }))
    .filter((r) => r.t.cpl !== null && r.t.cpl < WINNER_CPL)
    .sort((a, b) => a.t.cpl! - b.t.cpl!)

  /* Ordered by the canonical FIRMS list so a firm and its Spanish board stay
     adjacent, with anything unattributed last. */
  const byFirm = Object.entries(
    winners.reduce<Record<string, typeof winners>>((acc, r) => {
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

  const assigned = new Set(assignments.map((a) => `${a.sourceCreativeId}:${a.type}`))

  const push = (c: Creative) => {
    addAssignment({
      title: `Double Down – ${c.id} ${c.angle}`,
      type: 'Double Down',
      angle: c.angle,
      sourceCreativeId: c.id,
    })
    toast('Double Down assigned to Faisal')
  }

  const Row = ({ c, t }: { c: Creative; t: Totals }) => {
    const done = assigned.has(`${c.id}:Double Down`)
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Thumb c={c} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">
            {t.leads} leads · {t.acquisitions} signed · {c.angle}
          </p>
        </div>
        <div className="flex gap-1">
          <Pill>CPL {usd(t.cpl, 0)}</Pill>
          <Pill>Hook {pct(t.hookRate)}</Pill>
          <Pill>CTR {pct(t.ctr)}</Pill>
        </div>
        {isAdmin ? (
          <Button size="sm" variant={done ? 'outline' : 'default'} disabled={done} onClick={() => push(c)}>
            <Send aria-hidden /> {done ? 'Assigned' : 'Double Down'}
          </Button>
        ) : (
          <Pill tone={done ? 'green' : 'muted'}>{done ? 'Assigned to you' : 'Double Down'}</Pill>
        )}
      </li>
    )
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Winner Analysis"
        description={
          isAdmin
            ? `Ads under $${WINNER_CPL} CPL, by firm. Send one to Faisal to make more of it.`
            : `View only. Ads under $${WINNER_CPL} CPL that Jason can assign to you.`
        }
        actions={<RangeSelect value={range} onChange={setRange} />}
      />
      <div className="flex flex-col gap-4 p-6">
        {winners.length === 0 ? (
          <div className="rounded-lg border bg-card p-4">
            <EmptyState title="No winners in this range" />
          </div>
        ) : (
          byFirm.map(([firm, rows]) => (
            <section key={firm} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">{firmName(firm)}</h2>
                <span className="text-sm text-muted-foreground">
                  {rows.length} {rows.length === 1 ? 'winner' : 'winners'}
                </span>
              </div>
              <ul className="divide-y">
                {rows.map(({ c, t }) => (
                  <Row key={c.id} c={c} t={t} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
