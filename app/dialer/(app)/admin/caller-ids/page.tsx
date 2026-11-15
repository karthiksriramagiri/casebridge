'use client'

import { useState, useEffect, useMemo } from 'react'
import { PageBody, PageHeader } from '../../../_components/ui/shell'

interface NumberInfo {
  phoneNumber:    string
  areaCode:       string
  state:          string | null
  firm:           string | null
  totalCalls:     number
  connectedCalls: number
  connectRate:    number
  avgDuration:    number
  lastUsed:       string | null
}

const FIRMS = [
  { slug: 'lhp',    label: 'LHP' },
  { slug: 'fears',  label: 'Fears Law' },
  { slug: 'jm', label: 'Jacoby & Meyers' },
]

interface StateCoverage {
  state: string
  count: number
}

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',DC:'Washington DC',FL:'Florida',GA:'Georgia',HI:'Hawaii',
  ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',
  WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
}

function fmtPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) {
    return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  }
  return phone
}

function fmtDuration(sec: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type SortKey = 'phone' | 'state' | 'totalCalls' | 'connectRate' | 'avgDuration' | 'lastUsed'

export default function CallerIDsPage() {
  const [numbers,       setNumbers]       = useState<NumberInfo[]>([])
  const [stateCoverage, setStateCoverage] = useState<StateCoverage[]>([])
  const [loading,       setLoading]       = useState(true)
  const [total,         setTotal]         = useState(0)
  const [sortKey,       setSortKey]       = useState<SortKey>('totalCalls')
  const [sortAsc,       setSortAsc]       = useState(false)
  const [stateFilter,   setStateFilter]   = useState<string>('all')
  const [firmFilter,    setFirmFilter]    = useState<string>('all')

  async function assignFirm(phoneNumber: string, firm: string | null) {
    setNumbers(prev => prev.map(n => n.phoneNumber === phoneNumber ? { ...n, firm } : n))
    await fetch('/api/dialer/admin/numbers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, firm }),
    })
  }

  async function fetchNumbers() {
    setLoading(true)
    try {
      const res  = await fetch('/api/dialer/admin/numbers')
      const data = await res.json()
      setNumbers(data.numbers ?? [])
      setStateCoverage(data.stateCoverage ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      console.error('[caller-ids] fetch error', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchNumbers() }, [])

  function handleSort(key: SortKey) {
    if (sortKey === key) { setSortAsc(!sortAsc) }
    else { setSortKey(key); setSortAsc(key === 'phone' || key === 'state') }
  }

  const filtered = useMemo(() => {
    let list = numbers
    if (stateFilter !== 'all') {
      list = list.filter(n => n.state === stateFilter)
    }
    if (firmFilter !== 'all') {
      list = firmFilter === 'unassigned'
        ? list.filter(n => !n.firm)
        : list.filter(n => n.firm === firmFilter)
    }
    return [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'phone':       cmp = a.phoneNumber.localeCompare(b.phoneNumber); break
        case 'state':        cmp = (a.state ?? '').localeCompare(b.state ?? ''); break
        case 'totalCalls':   cmp = a.totalCalls - b.totalCalls; break
        case 'connectRate':  cmp = a.connectRate - b.connectRate; break
        case 'avgDuration':  cmp = a.avgDuration - b.avgDuration; break
        case 'lastUsed':     cmp = (a.lastUsed ?? '').localeCompare(b.lastUsed ?? ''); break
      }
      return sortAsc ? cmp : -cmp
    })
  }, [numbers, sortKey, sortAsc, stateFilter, firmFilter])

  // Summary stats
  const totalCalls    = numbers.reduce((s, n) => s + n.totalCalls, 0)
  const totalConnected = numbers.reduce((s, n) => s + n.connectedCalls, 0)
  const overallRate   = totalCalls > 0 ? Math.round((totalConnected / totalCalls) * 100) : 0
  const statesUsed    = new Set(numbers.map(n => n.state).filter(Boolean)).size

  const SortArrow = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null
    return <span className="ml-0.5">{sortAsc ? '↑' : '↓'}</span>
  }

  return (
    <>
      <PageHeader
        title="Caller IDs"
        description={loading ? 'Loading…' : `${total} numbers across ${statesUsed} states`}
        actions={
        <button
          onClick={fetchNumbers}
          disabled={loading}
          className="rounded-lg border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh from Twilio'}
        </button>
        }
      />
      <PageBody>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Numbers',   value: total },
          { label: 'States Covered',  value: statesUsed },
          { label: 'Total Calls',     value: totalCalls.toLocaleString() },
          { label: 'Connect Rate',    value: `${overallRate}%` },
        ].map(card => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* State coverage bar */}
      {stateCoverage.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">State Coverage</p>
          <div className="flex flex-wrap gap-1.5">
            {stateCoverage.map(sc => (
              <button
                key={sc.state}
                onClick={() => setStateFilter(stateFilter === sc.state ? 'all' : sc.state)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  stateFilter === sc.state
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted'
                }`}
              >
                {sc.state} <span className="opacity-60">({sc.count})</span>
              </button>
            ))}
            {stateFilter !== 'all' && (
              <button
                onClick={() => setStateFilter('all')}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* Firm filter */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Firm:</span>
        {[{ slug: 'all', label: 'All' }, ...FIRMS, { slug: 'unassigned', label: 'Unassigned' }].map(f => (
          <button key={f.slug} onClick={() => setFirmFilter(f.slug)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              firmFilter === f.slug
                ? 'bg-primary text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Numbers table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50/50">
                {([
                  ['phone',      'Phone Number'],
                  ['state',      'State'],
                  ['totalCalls', 'Calls'],
                  ['connectRate','Connect %'],
                  ['avgDuration','Avg Duration'],
                  ['lastUsed',   'Last Used'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="cursor-pointer select-none px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-muted-foreground"
                  >
                    {label}<SortArrow k={key} />
                  </th>
                ))}
                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Firm</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-muted-foreground animate-pulse">Fetching numbers from Twilio…</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {stateFilter !== 'all' ? `No numbers in ${STATE_NAMES[stateFilter] ?? stateFilter}` : 'No numbers found. Purchase numbers in your Twilio console.'}
                    </p>
                  </td>
                </tr>
              ) : filtered.map(n => (
                <tr key={n.phoneNumber} className="border-b border-border hover:bg-muted/50/50">
                  <td className="px-4 py-3">
                    <p className="font-mono text-sm font-medium text-foreground">{fmtPhone(n.phoneNumber)}</p>
                    <p className="text-[10px] text-muted-foreground">{n.areaCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    {n.state ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground">{n.state}</span>
                        <span className="text-xs text-muted-foreground">{STATE_NAMES[n.state] ?? ''}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{n.totalCalls}</p>
                    <p className="text-[10px] text-muted-foreground">{n.connectedCalls} connected</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div
                          className={`h-1.5 rounded-full ${
                            n.connectRate >= 50 ? 'bg-success' :
                            n.connectRate >= 25 ? 'bg-yellow-500' :
                            n.connectRate > 0   ? 'bg-destructive' : 'bg-muted-foreground/30'
                          }`}
                          style={{ width: `${Math.min(n.connectRate, 100)}%` }}
                        />
                      </div>
                      <span className={`text-sm font-medium ${
                        n.connectRate >= 50 ? 'text-success' :
                        n.connectRate >= 25 ? 'text-warning' :
                        n.connectRate > 0   ? 'text-destructive' : 'text-muted-foreground'
                      }`}>
                        {n.totalCalls > 0 ? `${n.connectRate}%` : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {n.avgDuration > 0 ? fmtDuration(n.avgDuration) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {fmtDate(n.lastUsed)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={n.firm ?? ''}
                      onChange={e => assignFirm(n.phoneNumber, e.target.value || null)}
                      className="rounded border border-border bg-card px-2 py-1 text-xs text-foreground"
                    >
                      <option value="">—</option>
                      {FIRMS.map(f => <option key={f.slug} value={f.slug}>{f.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top performers */}
      {numbers.filter(n => n.totalCalls >= 5).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top Performers (5+ calls)</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {numbers
              .filter(n => n.totalCalls >= 5)
              .sort((a, b) => b.connectRate - a.connectRate)
              .slice(0, 6)
              .map(n => (
                <div key={n.phoneNumber} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                    n.connectRate >= 50 ? 'bg-success' :
                    n.connectRate >= 25 ? 'bg-yellow-600' : 'bg-destructive'
                  }`}>
                    {n.connectRate}%
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{fmtPhone(n.phoneNumber)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {n.state ? `${STATE_NAMES[n.state] ?? n.state} · ` : ''}{n.connectedCalls}/{n.totalCalls} calls · avg {fmtDuration(n.avgDuration)}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      </PageBody>
    </>
  )
}
