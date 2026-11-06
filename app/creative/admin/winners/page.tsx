'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, PageHeader, Pill, RangeSelect, Thumb } from '@/app/creative/_components/admin/shared'
import { GOOD_HOOK, HIGH_CTR, LOW_CTR, LOW_HOOK, pct, remakeSuggestion, totalsFor, usd, WINNER_CPL } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import type { AssignmentType, Creative, RangeKey, Totals } from '@/app/creative/_lib/types'

export default function WinnersPage() {
  const { creatives, killedIds, assignments, addAssignment } = useStore()
  const isAdmin = useRole() === 'admin'
  const [range, setRange] = useState<RangeKey>('7d')

  const live = creatives.filter((c) => !killedIds.has(c.id)).map((c) => ({ c, t: totalsFor(c, range) }))
  const winners = live.filter((r) => r.t.cpl !== null && r.t.cpl < WINNER_CPL).sort((a, b) => a.t.cpl! - b.t.cpl!)
  const remakes = live
    .map((r) => ({ ...r, suggestion: remakeSuggestion(r.t) }))
    .filter((r): r is typeof r & { suggestion: NonNullable<typeof r.suggestion> } => r.suggestion !== null)

  const assigned = new Set(assignments.map((a) => `${a.sourceCreativeId}:${a.type}`))

  const push = (c: Creative, type: AssignmentType) => {
    addAssignment({ title: `${type} – ${c.id} ${c.angle}`, type, angle: c.angle, sourceCreativeId: c.id })
    toast(`${type} assigned to Faisal`)
  }

  const Row = ({ c, t, type, why }: { c: Creative; t: Totals; type: AssignmentType; why: string }) => {
    const done = assigned.has(`${c.id}:${type}`)
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Thumb c={c} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">{why}</p>
        </div>
        <div className="flex gap-1">
          <Pill>CPL {usd(t.cpl, 0)}</Pill>
          <Pill>Hook {pct(t.hookRate)}</Pill>
          <Pill>CTR {pct(t.ctr)}</Pill>
        </div>
        {isAdmin ? (
          <Button size="sm" variant={done ? 'outline' : 'default'} disabled={done} onClick={() => push(c, type)}>
            <Send aria-hidden /> {done ? 'Assigned' : type}
          </Button>
        ) : (
          <Pill tone={done ? 'green' : 'muted'}>{done ? 'Assigned to you' : type}</Pill>
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
            ? 'Spot winners to double down on, and near-misses worth remaking.'
            : 'View only. Winners and remake candidates Jason can assign to you.'
        }
        actions={<RangeSelect value={range} onChange={setRange} />}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Winners · Double down</h2>
            <p className="text-xs text-muted-foreground">{`CPL under $${WINNER_CPL}`}</p>
          </div>
          {winners.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No winners in this range" />
            </div>
          ) : (
            <ul className="divide-y">
              {winners.map(({ c, t }) => (
                <Row key={c.id} c={c} t={t} type="Double Down" why={`${t.leads} leads · ${t.acquisitions} signed · ${c.angle}`} />
              ))}
            </ul>
          )}
        </section>
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Remake candidates</h2>
            <p className="text-xs text-muted-foreground">
              {`Good hook (≥${pct(GOOD_HOOK)}) + weak CTR (<${pct(LOW_CTR)}) → improve body · Weak hook (<${pct(LOW_HOOK)}) + strong CTR (≥${pct(HIGH_CTR)}) → improve hook`}
            </p>
          </div>
          {remakes.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No remake candidates in this range" />
            </div>
          ) : (
            <ul className="divide-y">
              {remakes.map(({ c, t, suggestion }) => (
                <Row
                  key={c.id}
                  c={c}
                  t={t}
                  type={suggestion}
                  why={suggestion === 'Remake - Improve Body' ? 'Hook is stopping the scroll, body isn’t converting' : 'Body converts, hook isn’t stopping the scroll'}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
