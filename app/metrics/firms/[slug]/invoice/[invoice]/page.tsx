'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { invoiceCodeFromRouteSegment } from '@/app/metrics/firms/_lib/invoice-routes'
import {
  fmt$, fmtPct, KPICard, PhaseBadge, InsightsPanel, ExpensesPanel,
} from '@/app/metrics/firms/_components/firm-metrics-shared'

const CARD = '#FFFFFF'
const BORDER = '#D9D3C8'
const TEXT = '#1A1A1A'
const MUTED = '#6B6560'
const ACCENT = '#C17A4A'

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
    setLoading(true); setInsights(null)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(invoiceCode)}`)
      .then(r => r.json()).then(data => { setKpiData(data); setLoading(false) })
  }, [slug, invoiceCode])

  const generateInsights = useCallback(async () => {
    if (!kpiData) return
    setInsightsLoading(true)
    try {
      const res = await fetch('/api/metrics/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kpiData) })
      setInsights(await res.json())
    } finally { setInsightsLoading(false) }
  }, [kpiData])

  const s = kpiData?.summary
  const firm = kpiData?.firm
  const phase = kpiData?.phase
  const inv = kpiData?.invoice

  const marginHighlight =
    s?.netMargin == null ? undefined :
    s.netMargin > 30 ? 'green' : s.netMargin > 10 ? 'yellow' : 'red'
  const grossMarginHighlight =
    s?.grossMargin == null ? undefined :
    s.grossMargin > 60 ? 'green' : s.grossMargin > 30 ? 'yellow' : 'red'

  const thCls = "text-left text-xs font-semibold py-3 px-4 uppercase tracking-wider whitespace-nowrap"

  return (
    <div className="p-6">
      {/* Sub-header row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {phase && <PhaseBadge label={phase.label} color={phase.color} />}
          <span className="text-xs" style={{ color: MUTED }}>
            Weekly spend (last 7d): {kpiData ? fmt$(kpiData.weeklySpend) : '—'}
          </span>
          {inv && (
            <span className="text-xs px-2 py-1 rounded-lg" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
              Invoice window: {inv.period_start} → {inv.period_end}
            </span>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          {(['overview', 'creatives'] as const).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className="px-3 py-1.5 rounded-md text-sm capitalize transition font-medium"
              style={activeTab === tab ? { background: TEXT, color: '#FFF' } : { color: MUTED }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-sm" style={{ color: MUTED }}>Loading...</div>
      ) : kpiData?.error ? (
        <div className="text-sm" style={{ color: '#B91C1C' }}>{kpiData.error}</div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* META ADS hero — kept dark for visual distinction */}
              {kpiData?.meta && (
                <div className="rounded-xl border p-6"
                  style={kpiData.meta.connected
                    ? { background: 'linear-gradient(135deg, #1e2a3a 0%, #0f172a 100%)', borderColor: '#3b82f6' + '40' }
                    : { background: '#FFFBEB', borderColor: '#FDE68A' }}>
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: kpiData.meta.connected ? '#9CA3AF' : MUTED }}>Meta Ads (invoice period)</p>
                      <p className="text-3xl font-bold tabular-nums" style={{ color: kpiData.meta.connected ? '#FFFFFF' : TEXT }}>
                        {fmt$(kpiData.meta.spend)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: kpiData.meta.connected ? '#6B7280' : MUTED }}>
                        {kpiData.meta.connected ? `Account ${kpiData.meta.accountId}` : 'No Meta account configured'}
                      </p>
                      {kpiData.meta.error && <p className="text-xs mt-1 max-w-lg" style={{ color: '#F87171' }}>{kpiData.meta.error}</p>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-right sm:text-left">
                      {[
                        { label: 'Impressions', val: (kpiData.meta.impressions ?? 0).toLocaleString() },
                        { label: 'Clicks', val: (kpiData.meta.clicks ?? 0).toLocaleString() },
                        { label: 'Meta leads', val: kpiData.meta.leads ?? 0 },
                        { label: 'CPL', val: kpiData.meta.cpl != null ? fmt$(kpiData.meta.cpl) : '—', accent: ACCENT },
                        { label: 'CTR', val: kpiData.meta.ctrPct != null ? `${kpiData.meta.ctrPct.toFixed(2)}%` : '—' },
                      ].map(item => (
                        <div key={item.label}>
                          <p className="text-xs" style={{ color: kpiData.meta.connected ? '#9CA3AF' : MUTED }}>{item.label}</p>
                          <p className="text-lg font-semibold tabular-nums" style={{ color: item.accent || (kpiData.meta.connected ? '#E5E7EB' : TEXT) }}>{item.val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 mt-4 text-sm"
                    style={{ borderTop: `1px solid ${kpiData.meta.connected ? 'rgba(255,255,255,0.1)' : BORDER}` }}>
                    {[
                      { label: 'Ops expenses (attributed)', val: fmt$(s?.opsExpenses) },
                      { label: 'Worker PR (window)', val: fmt$(s?.workerPR) },
                      { label: 'Non-ad spend total', val: fmt$((s?.opsExpenses ?? 0) + (s?.workerPR ?? 0) + (kpiData?.sanguine?.total ?? 0)) },
                      { label: 'All-in cost', val: fmt$((kpiData.meta.spend ?? 0) + (s?.opsExpenses ?? 0) + (s?.workerPR ?? 0) + (kpiData?.sanguine?.total ?? 0)) },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs" style={{ color: kpiData.meta.connected ? '#9CA3AF' : MUTED }}>{item.label}</p>
                        <p className="font-semibold tabular-nums" style={{ color: kpiData.meta.connected ? '#FDE68A' : ACCENT }}>{item.val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* KPI status panel */}
              {kpiData?.kpiStatus && (() => {
                const ks = kpiData.kpiStatus
                const health = kpiData.overallHealth
                const healthBorder = health === 'healthy' ? '#BBF7D0' : health === 'warning' ? '#FDE68A' : '#FECACA'
                const healthBg = health === 'healthy' ? '#F0FDF4' : health === 'warning' ? '#FFFBEB' : '#FEF2F2'
                const healthLabel = health === 'healthy' ? 'On track' : health === 'warning' ? 'Behind on KPIs' : 'Critical — action needed'
                const healthColor = health === 'healthy' ? '#15803D' : health === 'warning' ? '#92400E' : '#B91C1C'

                const rows = [
                  { label: 'Weekly Spend', ...ks.weeklySpend, fmt: fmt$, higherBetter: true },
                  { label: 'Weekly Leads', ...ks.weeklyLeads, fmt: (v: number) => v.toFixed(1), higherBetter: true },
                  { label: 'Weekly CPL', actual: ks.weeklyCpl?.actual ?? null, target: ks.weeklyCpl?.target ?? null, pct: ks.weeklyCpl?.pct ?? null, status: ks.weeklyCpl?.status ?? null, fmt: fmt$, higherBetter: false },
                  { label: 'CPQ (period)', ...ks.cpq, fmt: fmt$, higherBetter: false },
                  { label: 'Gross Margin', ...ks.grossMargin, fmt: fmtPct, higherBetter: true },
                ].filter(r => r.actual !== undefined || r.target != null)

                return (
                  <div className="border rounded-xl p-5" style={{ background: healthBg, borderColor: healthBorder }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-sm" style={{ color: healthColor }}>{healthLabel}</span>
                        {phase && <PhaseBadge label={phase.label} color={phase.color} />}
                      </div>
                      <span className="text-xs" style={{ color: MUTED }}>vs model targets</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {rows.map((row: any) => {
                        const hasData = row.actual != null
                        const st = row.status
                        const onTrack = st === 'on_track'
                        const critical = st === 'far_behind'
                        const valColor = !hasData ? MUTED : onTrack ? '#15803D' : critical ? '#B91C1C' : '#92400E'
                        const icon = !hasData ? '' : onTrack ? 'OK' : critical ? '!' : '↓'
                        const pctDiff = hasData && row.pct != null ? (row.higherBetter ? row.pct - 100 : 100 - row.pct) : null
                        return (
                          <div key={row.label} className="rounded-lg p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                            <p className="text-xs mb-1" style={{ color: MUTED }}>{row.label}</p>
                            <p className="text-lg font-bold" style={{ color: valColor }}>
                              {icon}{icon ? ' ' : ''}{hasData ? row.fmt(row.actual) : '—'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                              Target: {row.target != null ? row.fmt(row.target) : '—'}
                              {pctDiff != null && (
                                <span style={{ color: pctDiff >= 0 ? '#15803D' : '#B91C1C' }} className="ml-1">
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

              {/* Acquisition */}
              <div>
                <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: MUTED }}>Acquisition ({invoiceCode})</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KPICard label="Signed Cases" value={String(s.signedCases)}
                    sub={(() => {
                      const parts = []
                      if (s.originalCases > 0) parts.push(`${s.originalCases} original`)
                      if (s.minorCases > 0) parts.push(`${s.minorCases} minor`)
                      if (s.replacementCases > 0) parts.push(`${s.replacementCases} replacement`)
                      return parts.length > 1 ? parts.join(' · ') : 'in invoice window'
                    })()} />
                  <KPICard label="CPQ" value={fmt$(s.cpq)} sub="Cost per case" highlight={s.cpq && s.cpq > 3000 ? 'red' : s.cpq ? 'green' : undefined} />
                  <KPICard label="Adjusted CPQ" value={fmt$(s.adjustedCpq)} sub="Multi-victim adj." />
                  {kpiData?.sanguine?.rate > 0 && (
                    <KPICard label="Sanguine Payout" value={fmt$(kpiData.sanguine.total)}
                      sub={`(${kpiData.sanguine.eligibleCases} signed case${kpiData.sanguine.eligibleCases !== 1 ? 's' : ''})`}
                      highlight="yellow" />
                  )}
                </div>
              </div>

              {/* Cases closed by rep */}
              {kpiData?.workerClosedCases?.length > 0 && (
                <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: MUTED }}>Cases closed by rep ({invoiceCode})</p>
                  <div className="flex flex-wrap gap-3">
                    {kpiData.workerClosedCases.map((w: any) => (
                      <div key={w.profileId} className="px-4 py-2 rounded-lg" style={{ background: '#F5F0E8', border: `1px solid ${BORDER}` }}>
                        <span className="text-sm font-medium" style={{ color: TEXT }}>{w.name}</span>
                        <span className="text-sm ml-2" style={{ color: MUTED }}>{w.closedCases} closed</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Revenue & Gross */}
              <div>
                <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: MUTED }}>Revenue &amp; Gross</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <KPICard label="Gross Revenue"
                    value={fmt$(kpiData?.payment ? kpiData.payment.net : s.grossRevenue)}
                    sub={kpiData?.payment ? `${fmt$(kpiData.payment.received)} − ${(kpiData.payment.interestRate * 100).toFixed(1)}% fee` : `${s.signedCases} cases × ${fmt$(s.caseValue)}`}
                    highlight="green" />
                  <KPICard label="Gross Profit" value={fmt$(s.grossProfit)} sub="Revenue − Meta" highlight={s.grossProfit > 0 ? 'green' : 'red'} />
                  <KPICard label="Gross Margin" value={fmtPct(s.grossMargin)} highlight={grossMarginHighlight} />
                </div>
              </div>

              {/* Net */}
              <div>
                <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: MUTED }}>Net (After Ops + Workers + Sanguine)</p>
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

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <h2 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Daily Spend &amp; Signed Cases</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={kpiData.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis yAxisId="left" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', color: TEXT }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#3b82f6" name="Spend ($)" dot={false} strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="signedCases" stroke="#10b981" name="Signed Cases" dot={true} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <h2 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Daily Spend</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={kpiData.daily || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                      <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '8px', color: TEXT }} />
                      <Bar dataKey="spend" fill="#3b82f6" name="Spend ($)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <InsightsPanel data={insights} loading={insightsLoading} onGenerate={generateInsights} />
            </div>
          )}

          {activeTab === 'creatives' && (
            <div className="space-y-6">
              <div className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="p-5 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <h2 className="text-sm font-semibold" style={{ color: TEXT }}>Creative Performance — {invoiceCode}</h2>
                  <span className="text-xs" style={{ color: MUTED }}>{kpiData.adBreakdown?.length || 0} creatives</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {['Creative', 'Ad Set', 'Spend', 'Meta Leads', 'CPL', 'Signed Cases', 'CPQ', 'Adj. CPQ', 'CTR'].map(col => (
                          <th key={col} className={thCls} style={{ color: MUTED }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(kpiData.adBreakdown || []).map((a: any, i: number) => {
                        const cpqGood = a.cpq !== null && a.cpq < 2000
                        const cpqBad = a.cpq !== null && a.cpq > 4000
                        const noConvert = a.spend > 500 && a.signedCases === 0
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${BORDER}`, opacity: noConvert ? 0.65 : 1 }}
                            className="transition hover:bg-black/[0.02]">
                            <td className="py-3 px-4 max-w-[200px] truncate font-medium" style={{ color: TEXT }} title={a.adName}>{a.adName || '—'}</td>
                            <td className="py-3 px-4 text-xs max-w-[140px] truncate" style={{ color: MUTED }}>{a.adsetName || '—'}</td>
                            <td className="py-3 px-4 font-medium" style={{ color: TEXT }}>{fmt$(a.spend)}</td>
                            <td className="py-3 px-4" style={{ color: TEXT }}>{a.metaLeads ?? '—'}</td>
                            <td className="py-3 px-4" style={{ color: MUTED }}>{a.cpl ? fmt$(a.cpl) : '—'}</td>
                            <td className="py-3 px-4">
                              <span className="font-semibold" style={{ color: a.signedCases > 0 ? '#15803D' : '#D1D5DB' }}>{a.signedCases}</span>
                            </td>
                            <td className="py-3 px-4">
                              {a.cpq !== null ? (
                                <span className="font-semibold" style={{ color: cpqGood ? '#15803D' : cpqBad ? '#B91C1C' : '#92400E' }}>{fmt$(a.cpq)}</span>
                              ) : (
                                <span className="text-xs" style={{ color: noConvert ? '#B91C1C' : MUTED }}>{noConvert ? 'no conversions' : '—'}</span>
                              )}
                            </td>
                            <td className="py-3 px-4" style={{ color: MUTED }}>{a.adjustedCpq ? fmt$(a.adjustedCpq) : '—'}</td>
                            <td className="py-3 px-4" style={{ color: MUTED }}>{a.ctr ? a.ctr.toFixed(2) + '%' : '—'}</td>
                          </tr>
                        )
                      })}
                      {(!kpiData.adBreakdown || kpiData.adBreakdown.length === 0) && (
                        <tr>
                          <td colSpan={9} className="py-12 px-4 text-center text-sm" style={{ color: MUTED }}>No ad data for this invoice period.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <InsightsPanel data={insights} loading={insightsLoading} onGenerate={generateInsights} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
