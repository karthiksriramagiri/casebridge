'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────
interface ReportData {
  dateRange: { from: string; to: string }
  summary: {
    totalDials: number; connected: number; connectRate: number
    totalTalkTime: number; qualified: number; signed: number
    totalLeads: number; leadsTouched: number; exhausted: number
  }
  repPerformance: {
    repId: string; name: string; totalDials: number; connected: number
    connectRate: number; totalTalkTime: number; avgTalkTime: number
    dispositions: Record<string, number>; hourly: number[]
  }[]
  leaderboard: {
    repId: string; name: string; dials: number; connected: number
    connectRate: number; qualified: number; signed: number; talkTime: number
  }[]
  funnel: Record<string, number>
  avgAttemptsToConvert: number
  callQuality: {
    amdBreakdown: Record<string, number>
    callerIdStats: Record<string, { total: number; voicemail: number }>
    avgDurationByDisp: Record<string, number>
    recordingCoverage: number; transcriptCoverage: number
  }
  queueHealth: {
    blockCounts: Record<string, number>; carryoverRate: number
    callbackCompletionRate: number; totalCallbacks: number; completedCallbacks: number
  }
  sms: {
    dripTriggered: number; sent: number; delivered: number; failed: number
    inboundReplies: number; dispositions: Record<string, number>; botConversionRate: number
  }
  firmComparison: {
    firm: string; totalDials: number; connected: number; connectRate: number
    qualified: number; signed: number; avgDuration: number
  }[]
  inbound: {
    total: number; answered: number; missed: number; answerRate: number
    avgRingTime: number; byRep: Record<string, number>
  }
  deviceTime: Record<string, { desktop: number; mobile: number; tablet: number }>
  activityTime: Record<string, { ready: number; onCall: number; paused: number }>
  trends: {
    daily: { date: string; dials: number; connected: number; qualified: number; signed: number }[]
    dayOfWeek: Record<string, { dials: number; connected: number }>
    hourly: number[]
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────
function fmtDuration(secs: number) {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function fmtHours(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function pct(n: number, d: number) {
  if (d === 0) return '0%'
  return `${Math.round((n / d) * 100)}%`
}

// Simple horizontal bar (no chart library)
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0
  return (
    <div className="h-3 w-full rounded-full bg-muted">
      <div className={`h-3 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  )
}

// ── Card wrapper ─────────────────────────────────────────────────────────
function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [data, setData]       = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<'overview' | 'reps' | 'quality' | 'sms' | 'inbound' | 'activity'>('overview')

  // Date range — default last 7 days
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(weekAgo)
  const [toDate, setToDate]     = useState(today)
  const [preset, setPreset]     = useState<string>('7d')

  const applyPreset = (key: string) => {
    setPreset(key)
    const now = new Date()
    const t   = now.toISOString().split('T')[0]
    if (key === 'today') { setFromDate(t); setToDate(t) }
    else if (key === '7d') { setFromDate(new Date(Date.now() - 6*86400000).toISOString().split('T')[0]); setToDate(t) }
    else if (key === '30d') { setFromDate(new Date(Date.now() - 29*86400000).toISOString().split('T')[0]); setToDate(t) }
    else if (key === '90d') { setFromDate(new Date(Date.now() - 89*86400000).toISOString().split('T')[0]); setToDate(t) }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dialer/reports?from=${fromDate}&to=${toDate}`)
      const json = await res.json()
      setData(json)
    } catch { /* ignore */ }
    setLoading(false)
  }, [fromDate, toDate])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading && !data) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Loading...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-destructive mt-1">Failed to load report data.</p>
      </div>
    )
  }

  const s = data.summary
  const maxDials = Math.max(...data.repPerformance.map(r => r.totalDials), 1)

  const TABS: { key: typeof tab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'reps',      label: 'Rep Performance' },
    { key: 'quality',   label: 'Call Quality' },
    { key: 'sms',       label: 'SMS & Bot' },
    { key: 'inbound',   label: 'Inbound' },
    { key: 'activity',  label: 'Device & Activity' },
  ]

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}</p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { key: 'today', label: 'Today' },
            { key: '7d',    label: '7 Days' },
            { key: '30d',   label: '30 Days' },
            { key: '90d',   label: '90 Days' },
          ].map(p => (
            <button key={p.key}
              onClick={() => applyPreset(p.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                preset === p.key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              }`}
            >{p.label}</button>
          ))}
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreset('') }}
            className="px-2 py-1.5 text-xs rounded-lg border border-border bg-card" />
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreset('') }}
            className="px-2 py-1.5 text-xs rounded-lg border border-border bg-card" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Total Dials" value={s.totalDials} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Connected" value={s.connected} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Connect Rate" value={`${s.connectRate}%`} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Talk Time" value={fmtDuration(s.totalTalkTime)} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Qualified" value={s.qualified} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Signed" value={s.signed} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Leads" value={s.totalLeads} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Touched" value={s.leadsTouched} />
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <StatBox label="Exhausted" value={s.exhausted} />
            </div>
          </div>

          {/* Leaderboard */}
          <Card title="Leaderboard">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Rep</th>
                    <th className="pb-2 pr-4 text-right">Dials</th>
                    <th className="pb-2 pr-4 text-right">Connected</th>
                    <th className="pb-2 pr-4 text-right">Rate</th>
                    <th className="pb-2 pr-4 text-right">Qualified</th>
                    <th className="pb-2 pr-4 text-right">Signed</th>
                    <th className="pb-2 text-right">Talk Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((r, i) => (
                    <tr key={r.repId} className="border-b border-border">
                      <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium text-foreground">{r.name}</td>
                      <td className="py-2 pr-4 text-right">{r.dials}</td>
                      <td className="py-2 pr-4 text-right">{r.connected}</td>
                      <td className="py-2 pr-4 text-right">{r.connectRate}%</td>
                      <td className="py-2 pr-4 text-right text-success">{r.qualified}</td>
                      <td className="py-2 pr-4 text-right text-primary">{r.signed}</td>
                      <td className="py-2 text-right text-muted-foreground">{fmtDuration(r.talkTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Lead Funnel + Firm Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Lead Funnel">
              <div className="space-y-2">
                {Object.entries(data.funnel).sort(([,a], [,b]) => b - a).map(([disp, count]) => (
                  <div key={disp} className="flex items-center gap-3">
                    <span className="text-sm w-28 text-muted-foreground">{disp}</span>
                    <div className="flex-1"><Bar value={count} max={Math.max(...Object.values(data.funnel))} color="bg-primary" /></div>
                    <span className="text-sm font-medium w-10 text-right">{count}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">Avg {data.avgAttemptsToConvert} attempts to convert</p>
              </div>
            </Card>

            <Card title="Firm Comparison">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4">Firm</th>
                      <th className="pb-2 pr-4 text-right">Dials</th>
                      <th className="pb-2 pr-4 text-right">Connected</th>
                      <th className="pb-2 pr-4 text-right">Rate</th>
                      <th className="pb-2 pr-4 text-right">Qualified</th>
                      <th className="pb-2 pr-4 text-right">Signed</th>
                      <th className="pb-2 text-right">Avg Talk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.firmComparison.map(f => (
                      <tr key={f.firm} className="border-b border-border">
                        <td className="py-2 pr-4 font-medium text-foreground">{f.firm === 'lhp' ? 'LHP' : f.firm === 'lhp_s' ? 'LHP (ES)' : f.firm === 'jm' ? 'J&M' : 'Fears'}</td>
                        <td className="py-2 pr-4 text-right">{f.totalDials}</td>
                        <td className="py-2 pr-4 text-right">{f.connected}</td>
                        <td className="py-2 pr-4 text-right">{f.connectRate}%</td>
                        <td className="py-2 pr-4 text-right text-success">{f.qualified}</td>
                        <td className="py-2 pr-4 text-right text-primary">{f.signed}</td>
                        <td className="py-2 text-right text-muted-foreground">{fmtDuration(f.avgDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Daily Trends */}
          {data.trends.daily.length > 1 && (
            <Card title="Daily Trends">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 pr-4 text-right">Dials</th>
                      <th className="pb-2 pr-4 text-right">Connected</th>
                      <th className="pb-2 pr-4 text-right">Rate</th>
                      <th className="pb-2 pr-4 text-right">Qualified</th>
                      <th className="pb-2 text-right">Signed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trends.daily.map(d => (
                      <tr key={d.date} className="border-b border-border">
                        <td className="py-1.5 pr-4 text-muted-foreground">{d.date}</td>
                        <td className="py-1.5 pr-4 text-right">{d.dials}</td>
                        <td className="py-1.5 pr-4 text-right">{d.connected}</td>
                        <td className="py-1.5 pr-4 text-right">{d.dials > 0 ? Math.round((d.connected/d.dials)*100) : 0}%</td>
                        <td className="py-1.5 pr-4 text-right text-success">{d.qualified}</td>
                        <td className="py-1.5 text-right text-primary">{d.signed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Day of Week + Hourly */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Day of Week">
              <div className="space-y-2">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => {
                  const stats = data.trends.dayOfWeek[d]
                  if (!stats) return null
                  return (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-sm w-10 text-muted-foreground">{d}</span>
                      <div className="flex-1"><Bar value={stats.dials} max={Math.max(...Object.values(data.trends.dayOfWeek).map(v => v.dials), 1)} color="bg-primary" /></div>
                      <span className="text-xs text-muted-foreground w-20 text-right">{stats.dials} dials / {stats.connected} conn</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card title="Hourly Distribution (EST)">
              <div className="flex items-end gap-1 h-32">
                {data.trends.hourly.map((count, h) => {
                  const maxH = Math.max(...data.trends.hourly, 1)
                  const height = (count / maxH) * 100
                  return (
                    <div key={h} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-primary rounded-t" style={{ height: `${Math.max(height, 1)}%` }}
                        title={`${h}:00 — ${count} calls`} />
                      {h % 3 === 0 && <span className="text-[10px] text-muted-foreground">{h}</span>}
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* Queue Health */}
          <Card title="Queue Health">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.entries(data.queueHealth.blockCounts).map(([block, count]) => (
                <div key={block} className="text-center">
                  <div className="text-lg font-bold text-foreground">{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">{block}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
              <StatBox label="Carryover Rate" value={`${data.queueHealth.carryoverRate}%`} />
              <StatBox label="Callbacks" value={`${data.queueHealth.completedCallbacks}/${data.queueHealth.totalCallbacks}`} />
              <StatBox label="CB Completion" value={`${data.queueHealth.callbackCompletionRate}%`} />
            </div>
          </Card>
        </div>
      )}

      {/* ─── REP PERFORMANCE TAB ──────────────────────────────────── */}
      {tab === 'reps' && (
        <div className="space-y-4">
          {data.repPerformance.map(rep => (
            <Card key={rep.repId} title={rep.name}>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
                <StatBox label="Dials" value={rep.totalDials} />
                <StatBox label="Connected" value={rep.connected} />
                <StatBox label="Connect Rate" value={`${rep.connectRate}%`} />
                <StatBox label="Total Talk" value={fmtDuration(rep.totalTalkTime)} />
                <StatBox label="Avg Talk" value={fmtDuration(rep.avgTalkTime)} />
              </div>

              {/* Disposition breakdown */}
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(rep.dispositions).sort(([,a],[,b]) => b - a).map(([d, c]) => {
                  const colors: Record<string, string> = {
                    'Qualified': 'bg-success/15 text-success',
                    'Signed': 'bg-accent text-primary',
                    'Callback': 'bg-warning/20 text-warning',
                    'Not Qualified': 'bg-destructive/10 text-destructive',
                    'No Answer': 'bg-muted text-muted-foreground',
                  }
                  return (
                    <span key={d} className={`px-2.5 py-1 text-xs font-medium rounded-full ${colors[d] || 'bg-muted text-muted-foreground'}`}>
                      {d}: {c}
                    </span>
                  )
                })}
              </div>

              {/* Hourly heatmap */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Calls by hour (EST)</p>
                <div className="flex gap-0.5">
                  {rep.hourly.map((count, h) => {
                    const maxH = Math.max(...rep.hourly, 1)
                    const intensity = count / maxH
                    const bg = count === 0 ? 'bg-muted'
                      : intensity > 0.75 ? 'bg-primary'
                      : intensity > 0.5 ? 'bg-primary'
                      : intensity > 0.25 ? 'bg-blue-400'
                      : 'bg-blue-300'
                    return (
                      <div key={h} className={`w-full h-6 rounded-sm ${bg} relative group cursor-default`}
                        title={`${h}:00 — ${count} calls`}>
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-muted text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                          {h}:00 — {count}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Dials bar */}
              <div className="mt-3">
                <Bar value={rep.totalDials} max={maxDials} color="bg-primary" />
              </div>
            </Card>
          ))}

          {data.repPerformance.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No call data for this date range.</p>
          )}
        </div>
      )}

      {/* ─── CALL QUALITY TAB ─────────────────────────────────────── */}
      {tab === 'quality' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* AMD breakdown */}
            <Card title="Answering Machine Detection">
              <div className="space-y-2">
                {Object.entries(data.callQuality.amdBreakdown).sort(([,a],[,b]) => b - a).map(([type, count]) => {
                  const labels: Record<string, string> = {
                    human: 'Human', machine_start: 'Voicemail', machine_end_beep: 'VM (after beep)',
                    machine_end_silence: 'VM (silence)', machine_end_other: 'VM (other)',
                    fax: 'Fax', unknown: 'Unknown', no_amd: 'No AMD Data',
                  }
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-sm w-32 text-muted-foreground">{labels[type] || type}</span>
                      <div className="flex-1"><Bar value={count} max={Math.max(...Object.values(data.callQuality.amdBreakdown))} color={type === 'human' ? 'bg-success' : 'bg-destructive'} /></div>
                      <span className="text-sm font-medium w-10 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Avg duration by disposition */}
            <Card title="Avg Duration by Disposition">
              <div className="space-y-2">
                {Object.entries(data.callQuality.avgDurationByDisp).sort(([,a],[,b]) => b - a).map(([d, avg]) => (
                  <div key={d} className="flex items-center gap-3">
                    <span className="text-sm w-28 text-muted-foreground">{d}</span>
                    <div className="flex-1"><Bar value={avg} max={Math.max(...Object.values(data.callQuality.avgDurationByDisp))} color="bg-primary" /></div>
                    <span className="text-sm font-medium w-16 text-right">{fmtDuration(avg)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Caller ID performance */}
          <Card title="Voicemail Rate by Caller ID">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-4">Caller ID</th>
                    <th className="pb-2 pr-4 text-right">Total Calls</th>
                    <th className="pb-2 pr-4 text-right">Voicemail</th>
                    <th className="pb-2 text-right">VM Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.callQuality.callerIdStats)
                    .sort(([,a],[,b]) => b.total - a.total)
                    .map(([cid, stats]) => (
                    <tr key={cid} className="border-b border-border">
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{cid}</td>
                      <td className="py-1.5 pr-4 text-right">{stats.total}</td>
                      <td className="py-1.5 pr-4 text-right text-destructive">{stats.voicemail}</td>
                      <td className="py-1.5 text-right">{pct(stats.voicemail, stats.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Coverage stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card title="Recording Coverage">
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground">{data.callQuality.recordingCoverage}%</div>
                <p className="text-xs text-muted-foreground mt-1">of calls have recordings</p>
              </div>
            </Card>
            <Card title="Transcription Coverage">
              <div className="text-center">
                <div className="text-3xl font-bold text-foreground">{data.callQuality.transcriptCoverage}%</div>
                <p className="text-xs text-muted-foreground mt-1">of calls transcribed</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ─── SMS & BOT TAB ────────────────────────────────────────── */}
      {tab === 'sms' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Drips Triggered', value: data.sms.dripTriggered },
              { label: 'SMS Sent', value: data.sms.sent },
              { label: 'Delivered', value: data.sms.delivered },
              { label: 'Failed', value: data.sms.failed },
              { label: 'Inbound Replies', value: data.sms.inboundReplies },
              { label: 'Bot → Qualified', value: `${data.sms.botConversionRate}%` },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <StatBox label={s.label} value={s.value} />
              </div>
            ))}
          </div>

          <Card title="SMS Dispositions">
            {Object.keys(data.sms.dispositions).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(data.sms.dispositions).sort(([,a],[,b]) => b - a).map(([d, count]) => (
                  <div key={d} className="flex items-center gap-3">
                    <span className="text-sm w-32 text-muted-foreground capitalize">{d.replace(/_/g, ' ')}</span>
                    <div className="flex-1"><Bar value={count} max={Math.max(...Object.values(data.sms.dispositions))} color="bg-primary" /></div>
                    <span className="text-sm font-medium w-10 text-right">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No SMS dispositions recorded yet.</p>
            )}
          </Card>
        </div>
      )}

      {/* ─── INBOUND TAB ──────────────────────────────────────────── */}
      {tab === 'inbound' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Inbound', value: data.inbound.total },
              { label: 'Answered', value: data.inbound.answered },
              { label: 'Missed', value: data.inbound.missed },
              { label: 'Answer Rate', value: `${data.inbound.answerRate}%` },
              { label: 'Avg Ring Time', value: `${data.inbound.avgRingTime}s` },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <StatBox label={s.label} value={s.value} />
              </div>
            ))}
          </div>

          <Card title="Inbound Calls by Rep">
            {Object.keys(data.inbound.byRep).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(data.inbound.byRep).sort(([,a],[,b]) => b - a).map(([rep, count]) => (
                  <div key={rep} className="flex items-center gap-3">
                    <span className="text-sm w-24 text-muted-foreground capitalize">{rep}</span>
                    <div className="flex-1"><Bar value={count} max={Math.max(...Object.values(data.inbound.byRep))} color="bg-orange-500" /></div>
                    <span className="text-sm font-medium w-10 text-right">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No inbound call data for this range.</p>
            )}
          </Card>
        </div>
      )}

      {/* ─── DEVICE & ACTIVITY TAB ────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="space-y-4">
          <Card title="Device Usage by Rep">
            {Object.keys(data.deviceTime).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4">Rep</th>
                      <th className="pb-2 pr-4 text-right">Desktop</th>
                      <th className="pb-2 pr-4 text-right">Mobile</th>
                      <th className="pb-2 pr-4 text-right">Tablet</th>
                      <th className="pb-2 text-right">Desktop %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.deviceTime).sort(([a],[b]) => a.localeCompare(b)).map(([rep, dt]) => {
                      const total = dt.desktop + dt.mobile + dt.tablet
                      return (
                        <tr key={rep} className="border-b border-border">
                          <td className="py-2 pr-4 font-medium text-foreground capitalize">{rep}</td>
                          <td className="py-2 pr-4 text-right">{fmtHours(dt.desktop)}</td>
                          <td className="py-2 pr-4 text-right">{fmtHours(dt.mobile)}</td>
                          <td className="py-2 pr-4 text-right">{fmtHours(dt.tablet)}</td>
                          <td className="py-2 text-right font-medium">{total > 0 ? Math.round((dt.desktop / total) * 100) : 0}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No device data yet. Heartbeat tracking has just been enabled — data will appear after reps use the dialer.</p>
            )}
          </Card>

          <Card title="Activity Time by Rep">
            {Object.keys(data.activityTime).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4">Rep</th>
                      <th className="pb-2 pr-4 text-right">On Call</th>
                      <th className="pb-2 pr-4 text-right">Idle (Ready)</th>
                      <th className="pb-2 pr-4 text-right">Paused</th>
                      <th className="pb-2 pr-4 text-right">Total Online</th>
                      <th className="pb-2 text-right">Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.activityTime).sort(([a],[b]) => a.localeCompare(b)).map(([rep, at]) => {
                      const total = at.ready + at.onCall + at.paused
                      const util  = total > 0 ? Math.round((at.onCall / total) * 100) : 0
                      return (
                        <tr key={rep} className="border-b border-border">
                          <td className="py-2 pr-4 font-medium text-foreground capitalize">{rep}</td>
                          <td className="py-2 pr-4 text-right text-success">{fmtHours(at.onCall)}</td>
                          <td className="py-2 pr-4 text-right text-warning">{fmtHours(at.ready)}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{fmtHours(at.paused)}</td>
                          <td className="py-2 pr-4 text-right">{fmtHours(total)}</td>
                          <td className="py-2 text-right font-medium">{util}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No activity data yet. Heartbeat tracking has just been enabled — data will appear after reps use the dialer.</p>
            )}
          </Card>

          {/* Visual activity breakdown per rep */}
          {Object.keys(data.activityTime).length > 0 && (
            <Card title="Activity Breakdown">
              <div className="space-y-3">
                {Object.entries(data.activityTime).sort(([a],[b]) => a.localeCompare(b)).map(([rep, at]) => {
                  const total = at.ready + at.onCall + at.paused
                  if (total === 0) return null
                  const onCallPct = (at.onCall / total) * 100
                  const readyPct  = (at.ready / total) * 100
                  const pausedPct = (at.paused / total) * 100
                  return (
                    <div key={rep}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground capitalize">{rep}</span>
                        <span className="text-xs text-muted-foreground">{fmtHours(total)}</span>
                      </div>
                      <div className="flex h-4 rounded-full overflow-hidden">
                        <div className="bg-success" style={{ width: `${onCallPct}%` }} title={`On Call: ${fmtHours(at.onCall)}`} />
                        <div className="bg-yellow-400" style={{ width: `${readyPct}%` }} title={`Idle: ${fmtHours(at.ready)}`} />
                        <div className="bg-muted-foreground/30" style={{ width: `${pausedPct}%` }} title={`Paused: ${fmtHours(at.paused)}`} />
                      </div>
                    </div>
                  )
                })}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-success inline-block" /> On Call</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Idle</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-muted-foreground/30 inline-block" /> Paused</span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
