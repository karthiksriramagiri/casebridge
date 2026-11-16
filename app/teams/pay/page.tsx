'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import TeamsShell from '../dashboard/TeamsShell'
import TimeclockWidget from '../dashboard/TimeclockWidget'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

interface CaseEntry {
  id: string; name: string; date: string; commission: number; tier?: number; closeNumber?: number
  /** The day its replacement window closes. */
  clearsOn?: string
  /** Already through that window. False means it clears before payday. */
  cleared?: boolean
}
interface Session { id: string; clock_in: string; clock_out: string | null; hours: number; pay: number }
interface DaySession { date: string; totalHours: number; totalPay: number; sessions: Session[] }

interface PreviousPeriod {
  start: string
  end: string
  payDate: string
  hours: number
  hourlyPay: number
  commissionCases: number
  commission: number
  total: number
  dailySessions: DaySession[]
  eligibleCases: CaseEntry[]
}

interface PayData {
  period: { start: string; end: string; nextPayDate: string }
  hours: { total: number; dailySessions: DaySession[] }
  cases: { eligibleThisPeriod: CaseEntry[]; pending: CaseEntry[] }
  pay: {
    hourlyRate: number; hourlyEarnings: number; commissionSigned: number; totalEstimated: number
    /* Split so the page can say which part of the figure is banked and
       which is still inside a replacement window. */
    commissionCleared?: number; commissionClearing?: number; clearingCount?: number
  }
  previousPeriods: PreviousPeriod[]
  todayEntries: { id: string; clock_in: string; clock_out: string | null }[]
}

// Creative pay types
interface CreativeCaseEntry { id: string; name: string; date: string }
interface CreativePreviousPeriod {
  start: string; end: string; payDate: string
  salary: number; cases: number; commission: number; total: number
  caseList: CreativeCaseEntry[]
}
interface CreativePayData {
  period: { start: string; end: string; nextPayDate: string }
  salary: number
  commissionPerCase: number
  cases: { thisPeriod: CreativeCaseEntry[] }
  pay: { salary: number; commission: number; totalEstimated: number }
  previousPeriods: CreativePreviousPeriod[]
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' })
}

function HoursBreakdown({ dailySessions, totalHours, hourlyRate, hourlyPay }: {
  dailySessions: DaySession[]
  totalHours: number
  hourlyRate: number
  hourlyPay: number
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Hours</h2>
        <span className="text-sm font-bold text-foreground/90">{totalHours.toFixed(2)}h</span>
      </div>
      {dailySessions.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No hours logged this period.</p>
      ) : (
        <div className="divide-y divide-border">
          {dailySessions.map(day => (
            <div key={day.date}>
              <div className="flex items-center justify-between px-5 py-2 bg-muted/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {format(parseISO(day.date), 'EEE, MMM d')}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">{day.totalHours.toFixed(2)}h</span>
                  <span className="text-xs font-semibold text-success">{fmt$(day.totalPay)}</span>
                </div>
              </div>
              {day.sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between px-5 py-2.5 pl-8">
                  <div className="flex items-center gap-2 text-sm text-foreground/90">
                    <span>{fmtTime(s.clock_in)}</span>
                    <span className="text-muted-foreground/50">→</span>
                    <span>{s.clock_out ? fmtTime(s.clock_out) : <span className="text-success font-semibold">Active</span>}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">{s.hours.toFixed(2)}h</span>
                    <span className="text-sm font-semibold text-foreground">{fmt$(s.pay)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="px-5 py-3 bg-muted/40 border-t border-border flex justify-between text-sm">
        <span className="text-muted-foreground">{totalHours.toFixed(2)}h × ${hourlyRate}/hr</span>
        <span className="font-bold text-foreground">{fmt$(hourlyPay)}</span>
      </div>
    </div>
  )
}

/* The whole cheque, not just the part that has already cleared.

   This used to list only cases whose replacement window had closed on or
   before today, which meant the figure crept up through the fortnight and
   was only the real one on the morning of payday — you could not plan
   against it, and a case clearing tomorrow looked like it belonged to next
   month. It now covers the period to its own end, with the few still to
   clear marked as such: they are on this cheque unless the case is
   replaced first, and that is worth seeing rather than hiding. */
function CommissionBreakdown({
  eligibleCases, commission, clearing, clearingCount, payDate,
}: {
  eligibleCases: CaseEntry[]
  commission: number
  clearing?: number
  clearingCount?: number
  payDate?: string
}) {
  const stillClearing = clearingCount ?? 0
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Commission</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {eligibleCases.length} case{eligibleCases.length === 1 ? '' : 's'} on this paycheck
            {payDate ? ` · ${payDate}` : ''}
          </p>
        </div>
        <span className="text-sm font-bold text-success">{fmt$(commission)}</span>
      </div>
      {stillClearing > 0 && (
        /* Said once at the top rather than inferred from the rows: part of
           the total is not final yet. */
        <p className="px-5 py-2 bg-warning/10 border-b border-warning/30 text-xs text-warning">
          {fmt$(clearing ?? 0)} of this ({stillClearing} case{stillClearing === 1 ? '' : 's'}) clears its
          replacement window before payday — included here, and only at risk if a case is replaced.
        </p>
      )}
      {eligibleCases.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">No commission this period.</p>
      ) : (
        <div className="divide-y divide-border">
          {eligibleCases.map(c => {
            const pendingClear = c.cleared === false
            return (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {c.name}
                    {c.tier != null && c.closeNumber != null && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        (Tier {c.tier}, {ordinal(c.closeNumber)} Close)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.date ? format(parseISO(c.date), 'MMM d, yyyy') : '—'}
                    {pendingClear && c.clearsOn && ` · clears ${format(parseISO(c.clearsOn), 'MMM d')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pendingClear ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
                    {pendingClear ? 'Clearing' : 'Signed'}
                  </span>
                  <span className={`text-sm font-bold ${pendingClear ? 'text-warning' : 'text-success'}`}>+{fmt$(c.commission)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Creative Pay View ────────────────────────────────────────────────────────

function CreativePayView({ data, teamType, timeclockEnabled }: {
  data: CreativePayData; teamType: string; timeclockEnabled: boolean
}) {
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)
  const { period, pay, cases, commissionPerCase, previousPeriods } = data

  return (
      <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <PageHeader
        title="Pay"
        description={`Period ${format(parseISO(period.start), 'MMM d')} – ${format(parseISO(period.end), 'MMM d, yyyy')} · next paycheck ${period.nextPayDate}`}
      />
      <PageBody>

        {/* Estimated paycheck */}
        <div className="bg-primary rounded-xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-primary-foreground/75 text-xs font-semibold uppercase tracking-wide mb-1">Estimated Next Paycheck</p>
              <p className="text-4xl font-bold text-primary-foreground">{fmt$(pay.totalEstimated)}</p>
              <p className="text-primary-foreground/75 text-xs mt-1">{period.nextPayDate}</p>
            </div>
            <div className="text-right space-y-1.5 shrink-0">
              <p className="text-sm text-primary-foreground/85">
                Salary: <span className="text-primary-foreground font-semibold">{fmt$(pay.salary)}</span>
              </p>
              <p className="text-sm text-primary-foreground/85">
                <span className="text-primary-foreground font-semibold">{cases.thisPeriod.length}</span> case{cases.thisPeriod.length !== 1 ? 's' : ''} × ${commissionPerCase} =
                <span className="text-primary-foreground font-semibold ml-1">{fmt$(pay.commission)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Salary card */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Salary</h2>
              <span className="text-sm font-bold text-foreground/90">{fmt$(pay.salary)}</span>
            </div>
            <div className="px-5 py-6 text-center">
              <p className="text-3xl font-bold text-foreground">{fmt$(pay.salary)}</p>
              <p className="text-xs text-muted-foreground mt-1">Bi-weekly fixed salary</p>
            </div>
          </div>

          {/* Commission card */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Commission</h2>
                <p className="text-xs text-muted-foreground mt-0.5">${commissionPerCase} per signed case</p>
              </div>
              <span className="text-sm font-bold text-success">{fmt$(pay.commission)}</span>
            </div>
            {cases.thisPeriod.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No cases this period.</p>
            ) : (
              <div className="divide-y divide-border">
                {cases.thisPeriod.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.date ? format(parseISO(c.date), 'MMM d, yyyy') : '—'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-success/15 text-success">Signed</span>
                      <span className="text-sm font-bold text-success">+{fmt$(commissionPerCase)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-5 py-3 bg-muted/40 border-t border-border flex justify-between text-sm">
              <span className="text-muted-foreground">{cases.thisPeriod.length} case{cases.thisPeriod.length !== 1 ? 's' : ''} × ${commissionPerCase}</span>
              <span className="font-bold text-foreground">{fmt$(pay.commission)}</span>
            </div>
          </div>
        </div>

        {/* Previous Paychecks */}
        {previousPeriods.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold text-foreground mb-3">Previous Paychecks</h2>
            <div className="space-y-3">
              {previousPeriods.map(p => {
                const isOpen = expandedPeriod === p.start
                return (
                  <div key={p.start} className="bg-card rounded-xl border border-border overflow-hidden">
                    <button
                      className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedPeriod(isOpen ? null : p.start)}
                    >
                      <div>
                        <p className="font-semibold text-foreground">{p.payDate}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(p.start), 'MMM d')} – {format(parseISO(p.end), 'MMM d, yyyy')}
                        </p>
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>Salary: <span className="font-semibold text-foreground/90">{fmt$(p.salary)}</span></span>
                          {p.cases > 0 && (
                            <span>{p.cases} case{p.cases !== 1 ? 's' : ''} = <span className="font-semibold text-foreground/90">{fmt$(p.commission)}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-xl font-bold text-foreground">{fmt$(p.total)}</p>
                        <svg
                          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border">
                        {p.caseList.length === 0 ? (
                          <p className="px-5 py-6 text-center text-sm text-muted-foreground">No cases this period.</p>
                        ) : (
                          <div className="divide-y divide-border">
                            {p.caseList.map(c => (
                              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                                  <p className="text-xs text-muted-foreground">{c.date ? format(parseISO(c.date), 'MMM d, yyyy') : '—'}</p>
                                </div>
                                <span className="text-sm font-bold text-success">+{fmt$(commissionPerCase)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </PageBody>
      </TeamsShell>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PayPage() {
  const router = useRouter()
  const [profileId, setProfileId] = useState<string | null>(null)
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')
  const [data, setData] = useState<PayData | null>(null)
  const [creativeData, setCreativeData] = useState<CreativePayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/teams/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, nda_signed, timeclock_enabled, team_type')
        .eq('id', user.id)
        .single()

      if (!prof || !prof.nda_signed) { router.push('/teams/onboarding'); return }
      if (prof.role === 'admin') { router.push('/teams/admin'); return }

      setProfileId(prof.id)
      setTimeclockEnabled(!!prof.timeclock_enabled)
      setTeamType(prof.team_type ?? 'intake')

      if (prof.team_type === 'creative') {
        const res = await fetch('/api/teams/pay/creative')
        if (res.ok) setCreativeData(await res.json())
      } else {
        const res = await fetch('/api/teams/pay')
        if (res.ok) setData(await res.json())
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="tc-root min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Creative team view
  if (teamType === 'creative' && creativeData) {
    return <CreativePayView data={creativeData} teamType={teamType} timeclockEnabled={timeclockEnabled} />
  }

  // Intake team view
  if (!data) {
    return (
      <div className="tc-root min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Unable to load pay data.</p>
      </div>
    )
  }

  const { period, hours, cases, pay, previousPeriods } = data
  const totalHours = hours.total
  const totalCommission = pay.commissionSigned
  const pendingTotal = cases.pending.reduce((sum, c) => sum + c.commission, 0)

  return (
      <TeamsShell timeclockEnabled={timeclockEnabled} teamType={teamType}>
      <PageHeader
        title="Pay"
        description={`Period ${format(parseISO(period.start), 'MMM d')} – ${format(parseISO(period.end), 'MMM d, yyyy')} · next paycheck ${period.nextPayDate}`}
      />
      <PageBody>

        {timeclockEnabled && profileId && (
          <TimeclockWidget profileId={profileId} />
        )}

        {/* Estimated paycheck */}
        {/* The figure the page exists for.

            It was a solid blue panel, which made the page open on a block
            of colour and put every number on it in white-on-blue — the
            replacement-window note worst of all, amber on blue. The accent
            tint keeps it first without that. */}
        <div className="mb-6 rounded-xl border border-primary/25 bg-accent px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent-foreground/80">
                Estimated next paycheck
              </p>
              <p className="text-4xl font-bold text-accent-foreground">{fmt$(pay.totalEstimated)}</p>
              <p className="mt-1 text-xs text-accent-foreground/75">{period.nextPayDate}</p>
            </div>
            <div className="shrink-0 space-y-1.5 text-right text-sm text-accent-foreground/85">
              <p>
                <span className="font-semibold text-accent-foreground">{totalHours.toFixed(2)}h</span> × ${pay.hourlyRate}/hr
                <span className="ml-1 font-semibold text-accent-foreground">= {fmt$(pay.hourlyEarnings)}</span>
              </p>
              {cases.eligibleThisPeriod.length > 0 && (
                <p>
                  <span className="font-semibold text-accent-foreground">{cases.eligibleThisPeriod.length}</span> signed =
                  <span className="ml-1 font-semibold text-accent-foreground">{fmt$(pay.commissionSigned)}</span>
                </p>
              )}
            </div>
          </div>
          {cases.pending.length > 0 && (
            <div className="mt-4 border-t border-primary/20 pt-4">
              <p className="text-xs font-semibold text-foreground/70">
                ⏳ {cases.pending.length} case{cases.pending.length !== 1 ? 's' : ''} ({fmt$(pendingTotal)}) still in the
                replacement window — not included yet.
              </p>
            </div>
          )}
        </div>

        {/* Current period breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <HoursBreakdown
            dailySessions={hours.dailySessions}
            totalHours={totalHours}
            hourlyRate={pay.hourlyRate}
            hourlyPay={pay.hourlyEarnings}
          />

          <div className="space-y-4">
            <CommissionBreakdown
              eligibleCases={cases.eligibleThisPeriod}
              commission={totalCommission}
              clearing={pay.commissionClearing}
              clearingCount={pay.clearingCount}
              payDate={period.nextPayDate}
            />

            {cases.pending.length > 0 && (
              <div className="bg-warning/10 rounded-xl border border-warning/30 overflow-hidden">
                <div className="px-5 py-4 border-b border-warning/30 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-warning">Pending Commission</h2>
                    <p className="text-xs text-warning mt-0.5">Awaiting end of replacement window</p>
                  </div>
                  <span className="text-sm font-bold text-warning">{fmt$(pendingTotal)}</span>
                </div>
                <div className="divide-y divide-warning/30">
                  {cases.pending.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-warning">
                          {c.name}
                          {c.tier != null && c.closeNumber != null && (
                            <span className="ml-1.5 text-xs font-normal text-warning">
                              (Tier {c.tier}, {ordinal(c.closeNumber)} Close)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-warning">
                          Signed {c.date ? format(parseISO(c.date), 'MMM d') : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warning/25 text-warning">⏳ Pending</span>
                        <span className="text-sm font-semibold text-warning">{fmt$(c.commission)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Previous Paychecks */}
        {previousPeriods.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold text-foreground mb-3">Previous Paychecks</h2>
            <div className="space-y-3">
              {previousPeriods.map(p => {
                const isOpen = expandedPeriod === p.start
                return (
                  <div key={p.start} className="bg-card rounded-xl border border-border overflow-hidden">
                    {/* Summary row — click to expand */}
                    <button
                      className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedPeriod(isOpen ? null : p.start)}
                    >
                      <div>
                        <p className="font-semibold text-foreground">{p.payDate}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(p.start), 'MMM d')} – {format(parseISO(p.end), 'MMM d, yyyy')}
                        </p>
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>{p.hours.toFixed(2)}h × $5/hr = <span className="font-semibold text-foreground/90">{fmt$(p.hourlyPay)}</span></span>
                          {p.commissionCases > 0 && (
                            <span>{p.commissionCases} signed = <span className="font-semibold text-foreground/90">{fmt$(p.commission)}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-xl font-bold text-foreground">{fmt$(p.total)}</p>
                        <svg
                          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded breakdown */}
                    {isOpen && (
                      <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <HoursBreakdown
                            dailySessions={p.dailySessions}
                            totalHours={p.hours}
                            hourlyRate={5}
                            hourlyPay={p.hourlyPay}
                          />
                          <CommissionBreakdown
                            eligibleCases={p.eligibleCases}
                            commission={p.commission}
                            payDate={p.payDate}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </PageBody>
      </TeamsShell>
  )
}
