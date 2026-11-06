'use client'

import { RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/app/creative/_ui/button'
import { EmptyState, PageHeader, Pill, Thumb } from '@/app/creative/_components/admin/shared'
import { formatDate, totalsFor, usd, WINNER_CPL } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'

export default function ArchivesPage() {
  const { archived, relaunch, launches } = useStore()
  const isAdmin = useRole() === 'admin'
  const queued = new Set(launches.filter((l) => l.status !== 'cancelled').map((l) => l.sourceCreativeId))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Relaunch / Fatigue Archives"
        description="Killed creatives with lifetime performance. Pull a past winner back into the launch list."
      />
      <div className="p-6">
        {archived.length === 0 ? (
          <EmptyState title="No archived creatives yet" />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  {['Creative', 'Overall CPL', 'Overall CPA', 'Leads', 'Launched', 'Fatigued', 'Killed', ''].map((h, i) => (
                    <th key={i} scope="col" className="px-3 py-2.5 text-right font-medium first:text-left">
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {archived.map((c) => {
                  const t = totalsFor(c, 'max')
                  const winner = t.cpl !== null && t.cpl < WINNER_CPL
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="max-w-[340px] px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Thumb c={c} />
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="truncate font-medium">{c.name}</span>
                            <div className="flex gap-1">
                              {winner && <Pill tone="green">Past winner</Pill>}
                              <Pill>{c.archived?.reason}</Pill>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{usd(t.cpl)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{usd(t.cpa)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{t.leads}</td>
                      <td className="px-3 py-2.5 text-right">{formatDate(c.launchDate)}</td>
                      <td className="px-3 py-2.5 text-right">{c.archived?.fatigueDate ? formatDate(c.archived.fatigueDate) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">{c.archived ? formatDate(c.archived.killDate) : '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        {!isAdmin ? (
                          queued.has(c.id) ? <Pill tone="blue">Relaunch queued</Pill> : null
                        ) : (
                        <Button
                          size="sm"
                          variant={winner ? 'default' : 'outline'}
                          disabled={queued.has(c.id)}
                          onClick={() => {
                            relaunch(c.id)
                            toast('Added to today’s launch list as a relaunch')
                          }}
                        >
                          <RotateCw aria-hidden /> {queued.has(c.id) ? 'Queued' : 'Relaunch'}
                        </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
