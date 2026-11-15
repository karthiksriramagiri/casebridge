'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, TriangleAlert, X } from 'lucide-react'
import { money, shortDate } from '@/app/_metrics/dash'
import { Button } from '@/app/teams/_ui/button'
import { Input } from '@/app/teams/_ui/input'
import {
  PageHeader, PageBody, Section, Card, StatCard, Pill, EmptyState, TableCard, Skeleton,
} from '@/app/teams/_components/shared'
import { cn } from '@/lib/utils'

/* ═══════════════════════════════════════════════════════════════════════════
   Team & payroll.

   Lifted out of the old combined /metrics dashboard. It lives under
   /teams/admin rather than on its own subdomain because reps and the people
   managing them should not be two separate products — and because this route
   already inherits the Supabase admin-role gate in proxy.ts.

   Rebuilt off `metrics.css`. That stylesheet reaches into descendants —
   `.mx :where(td, th, …)` — so a page carrying `.mx` inside the Team
   Center's `.tc-root` had two palettes fighting over the same table: the
   center's tokens on the chrome and the metrics ink on every cell. The
   formatters (`money`, `shortDate`) still come from that module; they are
   arithmetic, not style.
   ═══════════════════════════════════════════════════════════════════════════ */

export default function TeamMetricsPage() {
  const [workers, setWorkers] = useState<any[]>([])
  const [timeEntries, setTimeEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const [showAddWorker, setShowAddWorker] = useState(false)
  const [createdWorker, setCreatedWorker] = useState<{ name: string; password: string } | null>(null)

  useEffect(() => {
    let c = false
    const today = new Date().toISOString().slice(0, 10)
    Promise.allSettled([
      fetch('/api/metrics/workers').then((r) => r.json()),
      fetch(`/api/metrics/time-entries?date=${today}`).then((r) => r.json()),
    ]).then(([w, t]) => {
      if (c) return
      if (w.status === 'fulfilled') setWorkers(w.value?.workers || [])
      if (t.status === 'fulfilled') setTimeEntries(t.value?.workers || [])
      setLoading(false)
    })
    return () => { c = true }
  }, [nonce])

  return (
    <>
      <PageHeader
        title="Team & payroll"
        description="$30 a close, $50 for an overtime close, a split close counts a half each. Overtime pays $6/hr past nine hours. Paid every second Friday."
        actions={
          <Button size="sm" onClick={() => setShowAddWorker(true)}>
            <Plus className="size-4" aria-hidden /> Add worker
          </Button>
        }
      />
      <PageBody>
        {loading ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-64" />
          </>
        ) : (
          <HRTab
            workers={workers}
            timeEntries={timeEntries}
            onAdd={() => setShowAddWorker(true)}
          />
        )}
      </PageBody>

      {(showAddWorker || createdWorker) && (
        <AddWorkerDialog
          created={createdWorker}
          onCreated={(w, id) => {
            setCreatedWorker(w)
            setWorkers((prev) => [...prev, { id, name: w.name }])
          }}
          onClose={() => {
            setShowAddWorker(false)
            setCreatedWorker(null)
            setNonce((n) => n + 1)
          }}
        />
      )}
    </>
  )
}

/* ── The team ──────────────────────────────────────────────────────────────── */

function HRTab({ workers, timeEntries, onAdd }: { workers: any[]; timeEntries: any[]; onAdd: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const byProfile: Record<string, any> = {}
    for (const te of timeEntries) byProfile[te.profileId] = te
    const now = Date.now()
    return workers.map((w) => {
      const entries: any[] = byProfile[w.profileId]?.entries || []
      // An open shift counts up to now, which is what makes this figure
      // worth looking at during the day rather than only after it.
      const hoursToday = entries.reduce((total, e) => {
        const end = e.clock_out ? new Date(e.clock_out).getTime() : now
        return total + Math.max(0, (end - new Date(e.clock_in).getTime()) / 3600000)
      }, 0)
      return { ...w, hoursToday, clockedIn: entries.some((e) => !e.clock_out) }
    })
  }, [workers, timeEntries])

  const onNow = rows.filter((w) => w.clockedIn).length
  const periodHours = rows.reduce((s, w) => s + (w.regularHours || 0) + (w.overtimeHours || 0), 0)
  const otHours = rows.reduce((s, w) => s + (w.overtimeHours || 0), 0)
  const payroll = rows.reduce((s, w) => s + (w.nextPayment || 0), 0)
  const signed = rows.reduce((s, w) => s + (w.signedCases || 0), 0)
  const closed = rows.reduce((s, w) => s + (w.closedCases || 0), 0)
  const hoursToday = rows.reduce((s, w) => s + w.hoursToday, 0)
  const regularHours = rows.reduce((s, w) => s + (w.regularHours || 0), 0)
  const period = workers[0]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="On the clock"
          value={String(onNow)}
          hint={`of ${rows.length} on the team`}
          tone={onNow > 0 ? 'good' : undefined}
        />
        <StatCard
          label="Period hours"
          value={`${periodHours.toFixed(1)}h`}
          hint={otHours > 0 ? `${otHours.toFixed(1)}h of it overtime` : 'No overtime this period'}
          tone={otHours > 0 ? 'warn' : undefined}
        />
        <StatCard label="Signed" value={String(signed)} hint={`${closed} closed`} />
        <StatCard
          label="Hours today"
          value={`${hoursToday.toFixed(1)}h`}
          hint="across everyone clocked in"
        />
        <StatCard
          label="Next payroll"
          value={money(payroll)}
          hint={[
            period?.nextPaymentDate ? `Due ${period.nextPaymentDate}` : '',
            period?.payPeriodStart ? `${shortDate(period.payPeriodStart)}–${shortDate(period.payPeriodEnd)}` : '',
          ].filter(Boolean).join(' · ') || undefined}
        />
      </div>

      <Section
        title="Everyone"
        description="Open a row for base pay, commission and closes by firm"
      >
        {rows.length === 0 ? (
          <EmptyState title="No workers yet">
            Add the first intake rep and they will appear here with hours, closes and payroll.
          </EmptyState>
        ) : (
          <TableCard>
            <thead>
              <tr>
                <th className="w-9" />
                <th>Worker</th>
                <th className="num">Rate</th>
                <th className="num">Today</th>
                <th className="num">Period</th>
                <th className="num">Overtime</th>
                <th className="num">Signed</th>
                <th className="num">Closed</th>
                <th className="num">Next payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const key = w.profileId || w.name
                const isOpen = expanded === key
                return (
                  <WorkerRow
                    key={key}
                    w={w}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : key)}
                  />
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/60 font-semibold">
                <td />
                <td>Total</td>
                <td />
                <td className="num">{hoursToday.toFixed(1)}h</td>
                <td className="num">{regularHours.toFixed(1)}h</td>
                <td className="num">{otHours > 0 ? `${otHours.toFixed(1)}h` : '—'}</td>
                <td className="num">{signed}</td>
                <td className="num">{closed}</td>
                <td className="num">{money(payroll)}</td>
              </tr>
            </tfoot>
          </TableCard>
        )}
      </Section>
    </>
  )
}

function WorkerRow({ w, isOpen, onToggle }: { w: any; isOpen: boolean; onToggle: () => void }) {
  // Nothing signed, no hours banked and not on the clock: a name with no week
  // behind it yet. Dimmed rather than hidden — they are still on the team.
  const idle = !w.signedCases && !w.regularHours && !w.hoursToday
  const dash = <span className="text-muted-foreground/50">—</span>

  return (
    <>
      <tr>
        <td>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Hide details for ${w.name}` : `Show details for ${w.name}`}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} aria-hidden />
          </button>
        </td>
        <td>
          <div className="flex items-center gap-2">
            <span
              title={w.clockedIn ? 'Clocked in' : 'Not clocked in'}
              className={cn('size-2 shrink-0 rounded-full', w.clockedIn ? 'bg-success' : 'bg-border')}
            />
            <span className={cn('font-medium', idle && 'text-muted-foreground')}>{w.name}</span>
          </div>
        </td>
        <td className="num text-muted-foreground">${(w.hourlyRate ?? 5).toFixed(2)}</td>
        <td className={cn('num', w.hoursToday > 0 ? 'font-semibold' : 'text-muted-foreground/50')}>
          {w.hoursToday > 0 ? `${w.hoursToday.toFixed(2)}h` : '—'}
        </td>
        <td className="num font-semibold">{w.regularHours > 0 ? `${w.regularHours.toFixed(2)}h` : dash}</td>
        <td className={cn('num', w.overtimeHours > 0 ? 'font-semibold text-warning' : 'text-muted-foreground/50')}>
          {w.overtimeHours > 0 ? `${w.overtimeHours.toFixed(2)}h` : '—'}
        </td>
        <td className="num font-semibold">{w.signedCases || dash}</td>
        <td className={cn('num font-semibold', w.closedCases > 0 && 'text-success')}>
          {w.closedCases || dash}
        </td>
        <td className={cn('num font-semibold', !(w.nextPayment > 0) && 'text-muted-foreground/50')}>
          {w.nextPayment > 0 ? money(w.nextPayment, { cents: true }) : '—'}
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={9} className="bg-muted/40 p-0">
            <div className="flex flex-col gap-5 px-5 py-4">
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  How the next payment is built
                </p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <PayCell
                    label="Base pay"
                    value={money(w.basePay ?? 0, { cents: true })}
                    note={`${(w.regularHours || 0).toFixed(2)}h at $${(w.hourlyRate ?? 5).toFixed(2)}`}
                  />
                  <PayCell
                    label="Commission"
                    value={money(w.commissionInPeriod ?? 0)}
                    note={`${w.closedInPeriod || 0} × $30${w.otClosedInPeriod ? ` · ${w.otClosedInPeriod} OT × $50` : ''}`}
                  />
                  <PayCell
                    label="Replacements"
                    value={String(w.replacementsInPeriod ?? 0)}
                    note="in this period"
                  />
                  <PayCell
                    label="Total"
                    value={money(w.nextPayment ?? 0, { cents: true })}
                    note={w.nextPaymentDate ? `due ${w.nextPaymentDate}` : undefined}
                    accent
                  />
                </div>
              </div>

              {w.closedByFirm?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Closes by firm
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {w.closedByFirm.map((f: any) => (
                      <span
                        key={f.firmId}
                        className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs"
                      >
                        {f.firmName}
                        <b className="font-semibold tabular-nums">{f.signedCases} signed</b>
                        <b className="font-semibold tabular-nums text-success">{f.closedCases} closed</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function PayCell({
  label, value, note, accent,
}: {
  label: string
  value: string
  note?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className={cn('text-base font-semibold tabular-nums', accent && 'text-primary')}>{value}</span>
      {note && <span className="text-[10.5px] text-muted-foreground">{note}</span>}
    </div>
  )
}

/* ── Adding a worker ──────────────────────────────────────────────────────── */

function AddWorkerDialog({
  created, onCreated, onClose,
}: {
  created: { name: string; password: string } | null
  onCreated: (w: { name: string; password: string }, id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('A full name is required.'); return }
    if (password.length < 6) { setError('The temporary password needs at least 6 characters.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/teams/admin/reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'The worker could not be created.'); return }
      onCreated({ name: name.trim(), password }, data.id)
      setName(''); setPassword('')
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    /* `.ui-portal` carries the tokens: this sits on <body>, outside
       `.tc-root`, so without it the dialog would borrow the app's palette. */
    <div
      className="ui-portal fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-title"
        className="w-full max-w-md overflow-hidden shadow-lg"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 id="worker-title" className="text-sm font-semibold">
            {created ? 'Worker created' : 'Add worker'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4">
          {created ? (
            <>
              <p className="mb-3.5 text-sm text-muted-foreground">
                Send these to {created.name}. The password is shown once.
              </p>
              <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</div>
                  <div className="font-medium">{created.name}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Temporary password
                  </div>
                  <div className="font-mono text-sm">{created.password}</div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Sign-in URL
                  </div>
                  <div className="font-mono text-xs text-accent-foreground">
                    teams.case-bridge.com/teams/login
                  </div>
                </div>
              </div>
            </>
          ) : (
            <form onSubmit={submit} id="worker-form" className="grid gap-3.5">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="w-name">Full name</label>
                <Input
                  id="w-name"
                  value={name}
                  autoFocus
                  aria-invalid={!!error && !name.trim()}
                  onChange={(e) => { setName(e.target.value); setError('') }}
                  placeholder="Marisol Otero"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="w-pass">Temporary password</label>
                <Input
                  id="w-pass"
                  type="password"
                  value={password}
                  aria-invalid={!!error && password.length < 6}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="At least 6 characters"
                />
                <span className="text-xs text-muted-foreground">
                  They will be asked to change it at first sign-in.
                </span>
              </div>
              {error && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <TriangleAlert className="size-3.5" aria-hidden /> {error}
                </p>
              )}
            </form>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/40 px-5 py-3">
          {created ? (
            <Button size="sm" onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" type="button" onClick={onClose}>Cancel</Button>
              <Button size="sm" form="worker-form" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create worker'}
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
