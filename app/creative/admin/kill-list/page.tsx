'use client'

import { Undo2, Trash2 } from 'lucide-react'
import { Button } from '@/app/creative/_ui/button'
import { Checkbox } from '@/app/creative/_ui/checkbox'
import { EmptyState, PageHeader, Pill, Thumb } from '@/app/creative/_components/admin/shared'
import { formatDate, totalsFor, usd } from '@/app/creative/_lib/metrics'
import { useRole } from '@/app/creative/_lib/role'
import { useStore } from '@/app/creative/_lib/store'

export default function KillListPage() {
  const role = useRole()
  const isAdmin = role === 'admin'
  const { kill, getCreative, markKillDone, removeKill } = useStore()
  const pending = kill.filter((k) => k.status === 'pending')
  const done = kill.filter((k) => k.status === 'done')

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
      <div className="flex flex-col gap-6 p-6">
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Pending</h2>
            <span className="text-sm text-muted-foreground">{pending.length} to kill</span>
          </div>
          {pending.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No pending kills" />
            </div>
          ) : (
            <ul className="divide-y">
              {pending.map((k) => {
                const c = getCreative(k.creativeId)
                if (!c) return null
                return (
                  <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                    <Checkbox aria-label={`Mark ${c.name} as killed`} onCheckedChange={() => markKillDone(k.id, true, role)} />
                    <Thumb c={c} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <code className="truncate font-mono text-sm font-medium">{c.convention}</code>
                      <p className="truncate text-xs text-muted-foreground">
                        Ad ID {c.adId} · {c.campaign} · {k.reason}
                      </p>
                    </div>
                    <Pill>Added {formatDate(k.addedAt)}</Pill>
                    <Pill>{usd(c.dailyBudget, 0)}/day</Pill>
                    {isAdmin && (
                      <Button size="icon-sm" variant="ghost" aria-label="Remove from kill list" onClick={() => removeKill(k.id)}>
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Killed</h2>
            <span className="text-sm text-muted-foreground">{done.length} done · moved to archives</span>
          </div>
          {done.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing killed yet.</p>
          ) : (
            <ul className="divide-y">
              {done.map((k) => {
                const c = getCreative(k.creativeId)
                if (!c) return null
                const t = totalsFor(c, 'max')
                return (
                  <li key={k.id} className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
                    <Thumb c={c} />
                    <code className="min-w-0 flex-1 truncate font-mono text-sm line-through">{c.convention}</code>
                    <Pill>Lifetime CPL {usd(t.cpl, 0)}</Pill>
                    <Pill tone="green">Killed {k.doneAt && formatDate(k.doneAt)}</Pill>
                    <Button size="sm" variant="ghost" onClick={() => markKillDone(k.id, false, role)}>
                      <Undo2 aria-hidden /> Undo
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
