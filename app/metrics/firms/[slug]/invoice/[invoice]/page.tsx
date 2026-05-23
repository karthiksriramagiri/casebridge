'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'
import {
  fmt$,
  fmtPct,
  KPICard,
  PhaseBadge,
  InsightsPanel,
  ExpensesPanel,
} from '@/app/metrics/firms/_components/firm-metrics-shared'

export default function FirmInvoiceDashboard() {
  const params = useParams()
  const slug = params.slug as string
  const invSeg = params.invoice as string
  const invoiceCode = invoiceCodeFromRouteSegment(invSeg)

  const [kpiData, setKpiData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<any>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'creatives'>('overview')

  useEffect(() => {
    setLoading(true)
    setInsights(null)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`)
      .then(r => r.json())
      .then(data => {
        setKpiData(data)
        setLoading(false)
      })
  }, [slug, invoiceCode])

  const generateInsights = useCallback(async () => {
    if (!kpiData) return
    setInsightsLoading(true)
    try {
      const res = await fetch('/api/metrics/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kpiData),
      })
      const data = await res.json()
      setInsights(data)
    } finally {
      setInsightsLoading(false)
    }
  }, [kpiData])

  const s = kpiData?.summary
  const firm = kpiData?.firm
  const phase = kpiData?.phase
  const inv = kpiData?.invoice

  const marginHighlight =
    s?.netMargin == null ? undefined :
    s.netMargin > 30 ? 'green' :
    s.netMargin > 10 ? 'yellow' : 'red'

  const grossMarginHighlight =
    s?.grossMargin == null ? undefined :
    s.grossMargin > 60 ? 'green' :
    s.grossMargin > 30 ? 'yellow' : 'red'

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {phase && <PhaseBadge label={phase.label} color={phase.color} />}
          <span className="text-gray-600 text-xs">
            Weekly spend (last 7d): {kpiData ? fmt$(kpiData.weeklySpend) : '—'}
          </span>
          {inv && (
            <span className="text-gray-500 text-xs border border-gray-800 rounded-lg px-2 py-1">
              Invoice window: {inv.period_start} → {inv.period_end}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['overview', 'creatives'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${activeTab === tab ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>
      ) : kpiData?.error ? (
        <div className="text-red-400">{kpiData.error}</div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {kpiData?.meta && (
                <div className={`rounded-xl border p-6 ${
                  kpiData.meta.connected
                    ? 'border-blue-500/40 bg-gradient-to-br from-blue-950/40 to-gray-900'
                    : 'border-amber-500/40 bg-amber-950/10'
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Meta Ads (invoice period)</p>
                      <p className="text-3xl font-bold text-white tabular-nums">
                        {fmt$(kpiData.meta.spend)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {kpiData.meta.connected ? `Account ${kpiData.meta.accountId}` : 'No Meta account configured'}
                      </p>
                      {kpiData.meta.error && (
                        <p className="text-xs text-red-400 mt-1 max-w-lg">{kpiData.meta.error}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-right sm:text-left">
                      <div>
                        <p className="text-xs text-gray-500">Impressions</p>
                        <p className="text-lg font-semibold text-gray-200 tabular-nums">
                          {(kpiData.meta.impressions ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Clicks</p>
                        <p className="text-lg font-semibold text-gray-200 tabular-nums">
                          {(kpiData.meta.clicks ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Meta leads</p>
                        <p className="text-lg font-semibold text-gray-200 tabular-nums">
                          {kpiData.meta.leads ?? 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">CPL</p>
                        <p className="text-lg font-semibold text-blue-300 tabular-nums">
                          {kpiData.meta.cpl != null ? fmt$(kpiData.meta.cpl) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">CTR</p>
                        <p className="text-lg font-semibold text-gray-200 tabular-nums">
                          {kpiData.meta.ctrPct != null ? `${kpiData.meta.ctrPct.toFixed(2)}%` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 mt-4 border-t border-gray-700/40 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Ops expenses (attributed)</p>
                      <p className="font-semibold text-amber-200/90 tabular-nums">{fmt$(s?.opsExpenses)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Worker PR (window)</p>
                      <p className="font-semibold text-amber-200/90 tabular-nums">{fmt$(s?.workerPR)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Non-ad spend total</p>
                      <p className="font-semibold text-white tabular-nums">
                        {fmt$((s?.opsExpenses ?? 0) + (s?.workerPR ?? 0) + (kpiData?.sanguine?.total ?? 0))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">All-in cost</p>
                      <p className="font-semibold text-gray-200 tabular-nums">
                        {fmt$((kpiData.meta.spend ?? 0) + (s?.opsExpenses ?? 0) + (s?.workerPR ?? 0) + (kpiData?.sanguine?.total ?? 0))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {kpiData?.kpiStatus && (() => {
                const ks = kpiData.kpiStatus
                const health = kpiData.overallHealth
                const healthCls =
                  health === 'healthy' ? 'border-green-500/30 bg-green-950/10' :
                  health === 'warning' ? 'border-yellow-500/30 bg-yellow-950/10' :
                  'border-red-500/30 bg-red-950/10'
                const healthLabel =
                  health === 'healthy' ? 'On track' :
                  health === 'warning' ? 'Behind on KPIs' :
                  'Critical — action needed'
                const healthTextCls =
                  health === 'healthy' ? 'text-green-400' :
                  health === 'warning' ? 'text-yellow-400' :
                  'text-red-400'

                const t = kpiData.targets || {}
                const rows = [
                  { label: 'Weekly Spend', ...ks.weeklySpend, fmt: fmt$, higherBetter: true },
                  { label: 'Weekly Leads', ...ks.weeklyLeads, fmt: (v: number) => v.toFixed(1), higherBetter: true },
                  { label: 'Weekly CPL', actual: ks.weeklyCpl?.actual ?? null, target: ks.weeklyCpl?.target ?? t.weeklyCpl ?? null, pct: ks.weeklyCpl?.pct ?? null, status: ks.weeklyCpl?.status ?? null, fmt: fmt$, higherBetter: false },
                  { label: 'CPQ (period)', ...ks.cpq, fmt: fmt$, higherBetter: false },
                  { label: 'Gross Margin', ...ks.grossMargin, fmt: fmtPct, higherBetter: true },
                ].filter(r => r.actual !== undefined || r.target != null)

                return (
                  <div className={`border rounded-xl p-5 ${healthCls}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`font-semibold text-sm ${healthTextCls}`}>{healthLabel}</span>
                        {phase && <PhaseBadge label={phase.label} color={phase.color} />}
                      </div>
                      <span className="text-xs text-gray-500">vs model targets</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {rows.map((row: any) => {
                        const hasData = row.actual != null
                        const st = row.status
                        const onTrack = st === 'on_track'
                        const critical = st === 'far_behind'
                        const stCls = !hasData ? 'text-gray-500' : onTrack ? 'text-green-400' : critical ? 'text-red-400' : 'text-yellow-400'
                        const icon = !hasData ? '' : onTrack ? 'OK' : critical ? '!' : '↓'
                        const pctDiff = hasData && row.pct != null
                          ? (row.higherBetter ? row.pct - 100 : 100 - row.pct)
                          : null
                        return (
                          <div key={row.label} className="bg-black/20 rounded-lg p-3 border border-gray-700/40">
                            <p className="text-xs text-gray-400 mb-1">{row.label}</p>
                            <p className={`text-lg font-bold ${stCls}`}>
                              {icon}{icon ? ' ' : ''}{hasData ? row.fmt(row.actual) : '—'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Target: {row.target != null ? row.fmt(row.target) : '—'}
                              {pctDiff != null && (
                                <span className={pctDiff >= 0 ? 'text-green-500 ml-1' : 'text-red-500 ml-1'}>
                                  {pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(0)}%
                                </span>
                              )}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Acquisition ({invoiceCode})</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPICard
                    label="Signed Cases"
                    value={String(s.signedCases)}
                    sub={(() => {
                      const parts = []
                      if (s.originalCases > 0) parts.push(`${s.originalCases} original`)
                      if (s.minorCases > 0) parts.push(`${s.minorCases} minor`)
                      if (s.replacementCases > 0) parts.push(`${s.replacementCases} replacement`)
                      return parts.length > 1 ? parts.join(' · ') : 'in invoice window'
                    })()}
                  />
                  <KPICard label="CPQ" value={fmt$(s.cpq)} sub="Cost per case" highlight={s.cpq && s.cpq > 3000 ? 'red' : s.cpq ? 'green' : undefined} />
                  <KPICard label="Adjusted CPQ" value={fmt$(s.adjustedCpq)} sub="Multi-victim adj." />
                  {kpiData?.sanguine?.rate > 0 && (
                    <KPICard
                      label="Sanguine Payout"
                      value={fmt$(kpiData.sanguine.total)}
                      sub={`(${kpiData.sanguine.eligibleCases} signed case${kpiData.sanguine.eligibleCases !== 1 ? 's' : ''})`}
                      highlight="yellow"
                    />
                  )}
                </div>
              </div>

              {kpiData?.workerClosedCases?.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Cases closed by rep ({invoiceCode})</p>
                  <div className="flex flex-wrap gap-3">
                    {kpiData.workerClosedCases.map((w: any) => (
                      <div key={w.profileId} className="bg-black/30 border border-gray-700/60 rounded-lg px-4 py-2">
                        <span className="text-gray-200 text-sm font-medium">{w.name}</span>
                        <span className="text-gray-500 text-sm ml-2">{w.closedCases} closed</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Revenue & Gross</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KPICard
                    label="Gross Revenue"
                    value={fmt$(kpiData?.payment ? kpiData.payment.net : s.grossRevenue)}
                    sub={kpiData?.payment
                      ? `${fmt$(kpiData.payment.received)} − ${(kpiData.payment.interestRate * 100).toFixed(1)}% fee`
                      : `${s.signedCases} cases × ${fmt$(s.caseValue)}`}
                    highlight="green"
                  />
                  <KPICard label="Gross Profit" value={fmt$(s.grossProfit)} sub="Revenue − Meta" highlight={s.grossProfit > 0 ? 'green' : 'red'} />
                  <KPICard label="Gross Margin" value={fmtPct(s.grossMargin)} highlight={grossMarginHighlight} />
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Net (After Ops + Workers + Sanguine)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPICard label="Ops Expenses" value={fmt$(s.opsExpenses)} sub="Attributed to this invoice" highlight={s.opsExpenses > 0 ? 'yellow' : undefined} />
                  <KPICard label="Worker PR" value={fmt$(s.workerPR)} sub="Prorated to window" highlight={s.workerPR > 0 ? 'yellow' : undefined} />
                  {kpiData?.sanguine?.rate > 0 && (
                    <KPICard label="Sanguine Payroll" value={fmt$(kpiData.sanguine.total)} sub={`${kpiData.sanguine.eligibleCases} signed case${kpiData.sanguine.eligibleCases !== 1 ? 's' : ''} × ${fmt$(kpiData.sanguine.rate)}`} highlight="yellow" />
                  )}
                  <KPICard label="Net Profit" value={fmt$(s.netProfit)} sub="After all costs" highlight={s.netProfit > 0 ? 'green' : 'red'} />
                  <KPICard label="Net Margin" value={fmtPct(s.netMargin)} highlight={marginHighlight} />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-medium text-gray-300 mb-4">Daily Spend & Signed Cases</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={kpiData.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#3b82f6" name="Spend ($)" dot={false} strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="signedCases" stroke="#10b981" name="Signed Cases" dot={true} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h2 className="text-sm font-medium text-gray-300 mb-4">Daily Spend</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={kpiData.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                      <Bar dataKey="spend" fill="#3b82f6" name="Spend ($)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <InsightsPanel
                data={insights}
                loading={insightsLoading}
                onGenerate={generateInsights}
              />
            </div>
          )}

          {activeTab === 'creatives' && (
            <div className="space-y-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-300">Creative Performance — {invoiceCode}</h2>
                  <span className="text-xs text-gray-500">{kpiData.adBreakdown?.length || 0} creatives</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Creative', 'Ad Set', 'Spend', 'Meta Leads', 'CPL', 'Signed Cases', 'CPQ', 'Adj. CPQ', 'CTR'].map(col => (
                          <th key={col} className="text-left text-gray-400 font-medium py-3 px-4 text-xs uppercase tracking-wider whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(kpiData.adBreakdown || []).map((a: any, i: number) => {
                        const cpqGood = a.cpq !== null && a.cpq < 2000
                        const cpqBad = a.cpq !== null && a.cpq > 4000
                        const noConvert = a.spend > 500 && a.signedCases === 0
                        return (
                          <tr
                            key={i}
                            className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition ${noConvert ? 'opacity-70' : ''}`}
                          >
                            <td className="py-3 px-4 text-gray-200 max-w-[200px] truncate" title={a.adName}>{a.adName || '—'}</td>
                            <td className="py-3 px-4 text-gray-400 text-xs max-w-[140px] truncate">{a.adsetName || '—'}</td>
                            <td className="py-3 px-4 text-gray-200">{fmt$(a.spend)}</td>
                            <td className="py-3 px-4 text-gray-200">{a.metaLeads ?? '—'}</td>
                            <td className="py-3 px-4 text-gray-400">{a.cpl ? fmt$(a.cpl) : '—'}</td>
                            <td className="py-3 px-4">
                              <span className={`font-semibold ${a.signedCases > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                                {a.signedCases}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {a.cpq !== null ? (
                                <span className={`font-semibold ${cpqGood ? 'text-green-400' : cpqBad ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {fmt$(a.cpq)}
                                </span>
                              ) : (
                                <span className={`text-xs ${noConvert ? 'text-red-400' : 'text-gray-500'}`}>
                                  {noConvert ? 'no conversions' : '—'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-gray-400">{a.adjustedCpq ? fmt$(a.adjustedCpq) : '—'}</td>
                            <td className="py-3 px-4 text-gray-400">{a.ctr ? a.ctr.toFixed(2) + '%' : '—'}</td>
                          </tr>
                        )
                      })}
                      {(!kpiData.adBreakdown || kpiData.adBreakdown.length === 0) && (
                        <tr>
                          <td colSpan={9} className="py-12 px-4 text-center text-gray-500">
                            No ad data for this invoice period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <InsightsPanel
                data={insights}
                loading={insightsLoading}
                onGenerate={generateInsights}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
