'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'
import TimeclockWidget from '../dashboard/TimeclockWidget'

interface CaseEntry { id: string; name: string; date: string; commission: number }
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
  pay: { hourlyRate: number; hourlyEarnings: number; commissionSigned: number; totalEstimated: number }
  previousPeriods: PreviousPeriod[]
  todayEntries: { id: string; clock_in: string; clock_out: string | null }[]
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Hours</h2>
        <span className="text-sm font-bold text-gray-700">{totalHours.toFixed(2)}h</span>
      </div>
      {dailySessions.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">No hours logged this period.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {dailySessions.map(day => (
            <div key={day.date}>
              <div className="flex items-center justify-between px-5 py-2 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {format(parseISO(day.date), 'EEE, MMM d')}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-600">{day.totalHours.toFixed(2)}h</span>
                  <span className="text-xs font-semibold text-green-700">{fmt$(day.totalPay)}</span>
                </div>
              </div>
              {day.sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between px-5 py-2.5 pl-8">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span>{fmtTime(s.clock_in)}</span>
                    <span className="text-gray-300">→</span>
                    <span>{s.clock_out ? fmtTime(s.clock_out) : <span className="text-green-600 font-semibold">Active</span>}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{s.hours.toFixed(2)}h</span>
                    <span className="text-sm font-semibold text-gray-800">{fmt$(s.pay)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between text-sm">
        <span className="text-gray-500">{totalHours.toFixed(2)}h × ${hourlyRate}/hr</span>
        <span className="font-bold text-gray-900">{fmt$(hourlyPay)}</span>
      </div>
    </div>
  )
}

function CommissionBreakdown({ eligibleCases, commission }: { eligibleCases: CaseEntry[]; commission: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Commission</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cases cleared during this pay period</p>
        </div>
        <span className="text-sm font-bold text-green-700">{fmt$(commission)}</span>
      </div>
      {eligibleCases.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-gray-400">No commission this period.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {eligibleCases.map(c => (
            <div key={c.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400">{c.date ? format(parseISO(c.date), 'MMM d, yyyy') : '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Signed</span>
                <span className="text-sm font-bold text-green-700">+{fmt$(c.commission)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PayPage() {
  const router = useRouter()
  const [profileId, setProfileId] = useState<string | null>(null)
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')
  const [data, setData] = useState<PayData | null>(null)
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
      if (prof.team_type === 'creative') { router.push('/teams/dashboard'); return }

      setProfileId(prof.id)
      setTimeclockEnabled(!!prof.timeclock_enabled)
      setTeamType(prof.team_type ?? 'intake')

      const res = await fetch('/api/teams/pay')
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  const { period, hours, cases, pay, previousPeriods } = data
  const totalHours = hours.total
  const totalCommission = pay.commissionSigned
  const pendingTotal = cases.pending.reduce((sum, c) => sum + c.commission, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Pay</h1>
          <p className="text-gray-500 mt-1">
            Period: {format(parseISO(period.start), 'MMM d')} – {format(parseISO(period.end), 'MMM d, yyyy')} · Next paycheck: <span className="font-semibold text-gray-700">{period.nextPayDate}</span>
          </p>
        </div>

        {timeclockEnabled && profileId && (
          <TimeclockWidget profileId={profileId} />
        )}

        {/* Estimated paycheck */}
        <div className="bg-[#0f1e3c] rounded-xl px-6 py-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-wide mb-1">Estimated Next Paycheck</p>
              <p className="text-4xl font-bold text-white">{fmt$(pay.totalEstimated)}</p>
              <p className="text-blue-300 text-xs mt-1">{period.nextPayDate}</p>
            </div>
            <div className="text-right space-y-1.5 shrink-0">
              <p className="text-sm text-blue-200">
                <span className="text-white font-semibold">{totalHours.toFixed(2)}h</span> × ${pay.hourlyRate}/hr
                <span className="text-white font-semibold ml-1">= {fmt$(pay.hourlyEarnings)}</span>
              </p>
              {cases.eligibleThisPeriod.length > 0 && (
                <p className="text-sm text-blue-200">
                  <span className="text-white font-semibold">{cases.eligibleThisPeriod.length}</span> signed =
                  <span className="text-white font-semibold ml-1">{fmt$(pay.commissionSigned)}</span>
                </p>
              )}
            </div>
          </div>
          {cases.pending.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-yellow-300 text-xs font-semibold">
                ⏳ {cases.pending.length} case{cases.pending.length !== 1 ? 's' : ''} ({fmt$(pendingTotal)}) still in replacement window — not included yet.
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
            />

            {cases.pending.length > 0 && (
              <div className="bg-yellow-50 rounded-xl border border-yellow-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-yellow-200 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-yellow-900">Pending Commission</h2>
                    <p className="text-xs text-yellow-700 mt-0.5">Awaiting end of replacement window</p>
                  </div>
                  <span className="text-sm font-bold text-yellow-800">{fmt$(pendingTotal)}</span>
                </div>
                <div className="divide-y divide-yellow-100">
                  {cases.pending.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-yellow-900">{c.name}</p>
                        <p className="text-xs text-yellow-700">
                          Signed {c.date ? format(parseISO(c.date), 'MMM d') : '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800">⏳ Pending</span>
                        <span className="text-sm font-semibold text-yellow-800">{fmt$(c.commission)}</span>
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
            <h2 className="text-lg font-bold text-gray-900 mb-3">Previous Paychecks</h2>
            <div className="space-y-3">
              {previousPeriods.map(p => {
                const isOpen = expandedPeriod === p.start
                return (
                  <div key={p.start} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Summary row — click to expand */}
                    <button
                      className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedPeriod(isOpen ? null : p.start)}
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{p.payDate}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(parseISO(p.start), 'MMM d')} – {format(parseISO(p.end), 'MMM d, yyyy')}
                        </p>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500">
                          <span>{p.hours.toFixed(2)}h × $5/hr = <span className="font-semibold text-gray-700">{fmt$(p.hourlyPay)}</span></span>
                          {p.commissionCases > 0 && (
                            <span>{p.commissionCases} signed = <span className="font-semibold text-gray-700">{fmt$(p.commission)}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-xl font-bold text-gray-900">{fmt$(p.total)}</p>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded breakdown */}
                    {isOpen && (
                      <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-4">
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
      </main>
    </div>
  )
}
