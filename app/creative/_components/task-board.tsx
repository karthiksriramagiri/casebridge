'use client'

import { useMemo } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { PriorityStars } from '@/app/creative/_components/admin/priority-stars'
import { Button } from '@/app/creative/_ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/creative/_ui/select'
import { matchesQuery, Pill } from '@/app/creative/_components/admin/shared'
import { BenchmarkField } from '@/app/creative/_components/admin/benchmark-field'
import { formatDate } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'
import { KTEAM_STATUSES, type KTaskStatus } from '@/app/creative/_lib/types'

export function TaskBoard({ query = '' }: { query?: string }) {
  const role = useRole()
  const isAdmin = role === 'admin'
  const { ktasks: allTasks, getCreative, setKTaskStatus, moveKTask, removeKTask, updateKTask } = useStore()
  /* Same rule as the brief board beside it, over what a task card shows. */
  const ktasks = useMemo(
    () => allTasks.filter((t) => matchesQuery(query, [
      t.title, t.type, t.firm, t.format, t.batch, t.visualCode, t.verbalCode,
      t.status, t.disclaimer, t.notes, getCreative(t.sourceCreativeId)?.convention,
    ])),
    [allTasks, query, getCreative],
  )

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {KTEAM_STATUSES.map((status) => {
        const items = ktasks.filter((t) => t.status === status).sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3) || a.order - b.order)
        return (
          <section key={status} aria-label={status} className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">{status}</h2>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <ol className="flex min-h-24 flex-col gap-2 rounded-lg bg-muted/70 p-2">
              {items.map((t, i) => {
                const src = getCreative(t.sourceCreativeId)
                return (
                  <li key={t.id} className="flex flex-col gap-2 rounded-md border bg-card p-3 shadow-xs">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 text-pretty text-sm font-medium leading-snug">{t.title}</p>
                      <div className="flex flex-col">
                        <Button size="icon-xs" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveKTask(t.id, -1)}>
                          <ChevronUp aria-hidden />
                        </Button>
                        <Button size="icon-xs" variant="ghost" aria-label="Move down" disabled={i === items.length - 1} onClick={() => moveKTask(t.id, 1)}>
                          <ChevronDown aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <PriorityStars value={t.priority ?? 3} size="sm" />
                      <Pill tone="blue">{t.type}</Pill>
                      {t.firm && <Pill>{t.firm}</Pill>}
                      {(t.visualCode || t.verbalCode) && (
                        <Pill>{[t.visualCode, t.verbalCode].filter(Boolean).join(' × ')}</Pill>
                      )}
                      {t.batch && <Pill>{t.batch}</Pill>}
                      {t.disclaimer && <Pill tone="amber">Disclaimer: {t.disclaimer}</Pill>}
                    </div>
                    {src && <code className="truncate font-mono text-[11px] text-muted-foreground">{src.convention}</code>}
                    {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                    {/* The reference, editable on the card itself. A task is
                        worked from its benchmark, and the right one often
                        turns up after the task was raised. */}
                    <BenchmarkField
                      url={t.benchmarkUrl}
                      name={t.benchmarkName}
                      canEdit={isAdmin}
                      compact
                      onChange={(next) => updateKTask(t.id, { benchmarkUrl: next.url, benchmarkName: next.name })}
                    />
                    <div className="flex items-center gap-1.5">
                      <Select value={t.status} onValueChange={(v) => setKTaskStatus(t.id, v as KTaskStatus, role)}>
                        <SelectTrigger size="sm" className="flex-1" aria-label="Status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KTEAM_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isAdmin && (
                        <Button size="icon-sm" variant="ghost" aria-label="Delete task" onClick={() => removeKTask(t.id)}>
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(t.createdAt)}
                      {t.doneAt && ` · done ${formatDate(t.doneAt)}`}
                    </p>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
