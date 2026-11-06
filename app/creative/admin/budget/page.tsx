'use client'

import { PageHeader, Pill, StatCard } from '@/app/creative/_components/admin/shared'
import { totalsFor, usd } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import { FIRMS, firmName, firmOf } from '@/app/_metrics/firms'

type Row = { id: string; name: string; firm: string; budget: number; spent: number; isNew: boolean }

export default function BudgetPage() {
  const { creatives, killedIds, launches, kill } = useStore()

  const rows: Row[] = [
    ...creatives
      .filter((c) => !killedIds.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        firm: c.firm,
        budget: c.dailyBudget,
        spent: totalsFor(c, 'today').spend,
        isNew: false,
      })),
    ...launches
      .filter((l) => l.status === 'done')
      /* A launch has no firm field of its own — the firm is carried in the
         naming convention, the same place every live ad's firm is read from,
         so a pending launch files under the firm it will run for rather than
         into a "New launches" bucket of its own. */
      .map((l) => {
        const named = l.convention || l.name
        return { id: l.id, name: named, firm: firmOf(named), budget: l.dailyBudget, spent: 0, isNew: true }
      }),
  ]

  const totalBudget = rows.reduce((a, r) => a + r.budget, 0)
  const totalSpent = rows.reduce((a, r) => a + r.spent, 0)
  const pendingKillBudget = kill
    .filter((k) => k.status === 'pending')
    .reduce((a, k) => a + (creatives.find((c) => c.id === k.creativeId)?.dailyBudget ?? 0), 0)
  const pendingLaunchBudget = launches.filter((l) => l.status === 'pending').reduce((a, l) => a + l.dailyBudget, 0)

  /* Grouped by firm, not by Meta campaign. A campaign name is an ad-account
     artefact — "CA | JM | Leads | FS | ABO | 20260817" — and budget is
     decided per firm, so the sections now answer the question actually being
     asked of this page. Ordered by the canonical FIRMS list so a firm and its
     Spanish board stay adjacent, with anything unattributed last. */
  const firms = [...new Set(rows.map((r) => r.firm))].sort((a, b) => {
    const rank = (code: string) => {
      const i = FIRMS.findIndex((f) => f.code === code)
      return i === -1 ? FIRMS.length : i
    }
    return rank(a) - rank(b) || a.localeCompare(b)
  })

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Budget Tracker"
        description="Updates only when a launch or kill is marked done — not when it’s just listed."
      />
      <div className="flex flex-col gap-4 p-6">
        <section aria-label="Budget totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Daily budget (live)" value={usd(totalBudget, 0)} hint={`${rows.length} ads running`} />
          <StatCard label="Spent today" value={usd(totalSpent, 0)} hint={`${Math.round((totalSpent / totalBudget) * 100)}% of budget`} />
          <StatCard label="Pending kills" value={`−${usd(pendingKillBudget, 0)}`} hint="Drops once killed" tone="bad" />
          <StatCard label="Pending launches" value={`+${usd(pendingLaunchBudget, 0)}`} hint="Adds once launched" tone="good" />
        </section>

        {firms.map((firm) => {
          const items = rows.filter((r) => r.firm === firm)
          const sum = items.reduce((a, r) => a + r.budget, 0)
          const spent = items.reduce((a, r) => a + r.spent, 0)
          return (
            <section key={firm} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">{firmName(firm)}</h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {usd(spent, 0)} / {usd(sum, 0)} per day · {items.length} {items.length === 1 ? 'ad' : 'ads'}
                </span>
              </div>
              <ul className="divide-y">
                {items.map((r) => {
                  const ratio = r.budget ? r.spent / r.budget : 0
                  const status = r.isNew ? 'New' : ratio > 1.1 ? 'Over' : ratio < 0.5 ? 'Under-delivering' : 'On pace'
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted sm:block" aria-hidden>
                        <div
                          className={ratio > 1.1 ? 'h-full bg-destructive' : ratio < 0.5 ? 'h-full bg-warning' : 'h-full bg-primary'}
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                      <span className="w-36 text-right tabular-nums text-muted-foreground">
                        {usd(r.spent, 0)} / {usd(r.budget, 0)}
                      </span>
                      <Pill tone={status === 'Over' ? 'red' : status === 'Under-delivering' ? 'amber' : status === 'New' ? 'blue' : 'green'}>
                        {status}
                      </Pill>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
