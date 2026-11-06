'use client'

import { useMemo, useState } from 'react'
import { Download, Plus, RotateCcw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { ManualLaunchDialog } from '@/app/creative/_components/admin/manual-launch-dialog'
import { useRole } from '@/app/creative/_lib/role'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { Input } from '@/app/creative/_ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/app/creative/_ui/tabs'
import { downloadCsv, EmptyState, PageHeader, Pill } from '@/app/creative/_components/admin/shared'
import { TODAY } from '@/app/creative/_lib/data'
import { formatDate, usd } from '@/app/creative/_lib/metrics'
import { useStore } from '@/app/creative/_lib/store'
import type { LaunchTask } from '@/app/creative/_lib/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'pending' | 'missed' | 'done' | 'cancelled'

const isMissed = (l: LaunchTask) => l.status === 'pending' && l.date < TODAY

export default function LaunchListsPage() {
  const role = useRole()
  const isAdmin = role === 'admin'
  const { launches, updateLaunch, markLaunchDone, cancelLaunch, manualLaunch } = useStore()
  const [filter, setFilter] = useState<Filter>(isAdmin ? 'all' : 'pending')
  const [query, setQuery] = useState('')
  const [manualOpen, setManualOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return launches
      .filter((l) =>
        filter === 'all' ? true : filter === 'missed' ? isMissed(l) : filter === 'pending' ? l.status === 'pending' && !isMissed(l) : l.status === filter,
      )
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.convention.toLowerCase().includes(q) || l.angle.toLowerCase().includes(q))
  }, [launches, filter, query])

  const byDate = useMemo(() => {
    const map = new Map<string, LaunchTask[]>()
    for (const l of [...filtered].sort((a, b) => b.date.localeCompare(a.date))) {
      map.set(l.date, [...(map.get(l.date) ?? []), l])
    }
    return [...map.entries()]
  }, [filtered])

  const missedCount = launches.filter(isMissed).length

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Launch Lists"
        description={
          isAdmin
            ? 'What was queued to launch, by day. Edit, rewind or cancel anything that’s off.'
            : 'Launch each ad with its naming, tags and budget, then check it off. Missed launches stay red until done.'
        }
        actions={
          <div className="flex gap-2">
          {isAdmin && (
            <Button onClick={() => setManualOpen(true)}>
              <Plus aria-hidden /> Manual launch
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(`launch-lists-${TODAY}.csv`, [
                ['Date', 'Name', 'Convention', 'Angle', 'Resize', 'Disclaimer', 'As-is', 'Budget', 'Status'],
                ...filtered.map((l) => [
                  l.date,
                  l.name,
                  l.convention,
                  l.angle,
                  l.tags.resize ? 'Yes' : 'No',
                  l.tags.disclaimer ?? '',
                  l.tags.asIs ? 'Yes' : 'No',
                  l.dailyBudget,
                  isMissed(l) ? 'missed' : l.status,
                ]),
              ])
            }
          >
            <Download aria-hidden /> Download CSV
          </Button>
          </div>
        }
      />
      <ManualLaunchDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreate={(input) => {
          manualLaunch(input)
          setManualOpen(false)
          toast('Added to the launch list')
        }}
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="missed">Missed{missedCount ? ` (${missedCount})` : ''}</TabsTrigger>
              <TabsTrigger value="done">Done</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search launches"
              aria-label="Search launches"
              className="bg-card pl-8"
            />
          </div>
        </div>

        {byDate.length === 0 ? (
          <EmptyState title="No launches match">Move an assignment to Launching to push it here.</EmptyState>
        ) : (
          byDate.map(([date, items]) => (
            <section key={date} className="overflow-hidden rounded-lg border bg-card">
              <h2 className="border-b px-4 py-2.5 text-sm font-semibold">
                {date === TODAY ? 'Today' : formatDate(date)}{' '}
                <span className="font-normal text-muted-foreground">· {items.length} launches</span>
              </h2>
              <ul className="divide-y">
                {items.map((l) => {
                  const missed = isMissed(l)
                  return (
                    <li key={l.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3', missed && 'bg-destructive/5')}>
                      <Checkbox
                        aria-label={`Mark ${l.name} launched`}
                        checked={l.status === 'done'}
                        disabled={l.status === 'cancelled'}
                        onCheckedChange={(v) => markLaunchDone(l.id, !!v, role)}
                      />
                      <div className={cn('flex min-w-0 flex-1 flex-col gap-1', l.status === 'cancelled' && 'opacity-50')}>
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {l.campaign}
                          {l.requestedBy !== 'assignment' && ` · ${l.requestedBy === 'manual' ? 'Manual request' : 'Relaunch'}`}
                        </p>
                        {l.isNewTestBatch && !l.convention ? (
                          <Input
                            aria-label="Naming convention"
                            placeholder="New test batch — enter naming convention"
                            className="h-7 max-w-sm font-mono text-xs"
                            onBlur={(e) => e.target.value && updateLaunch(l.id, { convention: e.target.value })}
                          />
                        ) : (
                          <code className="font-mono text-xs text-muted-foreground">{l.convention}</code>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {missed && <Pill tone="red">Missed</Pill>}
                        {l.status === 'done' && <Pill tone="green">Launched</Pill>}
                        {l.status === 'cancelled' && <Pill>Cancelled</Pill>}
                        <Pill tone="blue">{l.angle}</Pill>
                        {l.tags.resize && <Pill>Resize</Pill>}
                        {l.tags.asIs && <Pill>As-is</Pill>}
                        {l.tags.disclaimer && <Pill tone="amber">Disclaimer: {l.tags.disclaimer}</Pill>}
                        <Pill>{usd(l.dailyBudget, 0)}/day</Pill>
                      </div>
                      <div className="flex gap-1">
                        {l.status === 'done' && (
                          <Button size="sm" variant="ghost" onClick={() => markLaunchDone(l.id, false, role)}>
                            <RotateCcw aria-hidden /> Rewind
                          </Button>
                        )}
                        {isAdmin && l.status === 'pending' && (
                          <Button size="sm" variant="ghost" onClick={() => cancelLaunch(l.id)}>
                            <X aria-hidden /> Cancel
                          </Button>
                        )}
                        {isAdmin && l.status === 'cancelled' && (
                          <Button size="sm" variant="ghost" onClick={() => updateLaunch(l.id, { status: 'pending' })}>
                            <RotateCcw aria-hidden /> Restore
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
