'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment, invoicePathSegment } from '@/app/finance/firms/_lib/invoice-routes'
import { InsightsPanel, PhaseBadge } from '@/app/finance/firms/_components/firm-metrics-shared'
import { invoicePnl } from '@/app/finance/firms/_lib/invoice-finance'
import {
  money, num, compact, pct, shortDate,
  caseBand, cplBand, bandClass,
  TrendPanels, type TrendSeries,
  PipelineBars, type StageRow,
  TargetMeter, Leaderboard, CostBar, EmptyState, Banner, DashboardSkeleton,
  IconArrow, IconWarn,
} from '@/app/_metrics/dash'

/* ═══════════════════════════════════════════════════════════════════════════
   Invoice overview

   Reads top to bottom as the invoice's own story: what we were paid, what it
   cost to earn it, what we bought with the spend, and how the period ran.
   ═══════════════════════════════════════════════════════════════════════════ */

const STAGE_LABELS: [string, string, 'open' | 'won' | 'lost'][] = [
  ['newLeadCount', 'New Lead', 'open'],
  ['nrCount', 'No Response', 'open'],
  ['fuCount', 'Follow Up', 'open'],
  ['chaseCount', 'Chase', 'open'],
  ['appointmentCount', 'Appointment', 'open'],
  ['contractSentCount', 'Contract Sent', 'open'],
  ['pendingSendCount', 'Pending Send', 'open'],
  ['qualifiedCount', 'Qualified', 'open'],
  ['closedCount', 'Closed', 'won'],
  ['nqCount', 'Not Qualified', 'lost'],
  ['miaCount', 'MIA', 'lost'],
]

export default function InvoiceOverview() {
  const params = useParams()
  const slug = params.slug as string
  const invSeg = params.invoice as string
  const code = invoiceCodeFromRouteSegment(invSeg)

  const [kpi, setKpi] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState<any>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)

  useEffect(() => {
    setLoading(true); setInsights(null)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => { setKpi(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug, code])

  const generateInsights = useCallback(async () => {
    if (!kpi) return
    setInsightsLoading(true)
    try {
      const res = await fetch('/api/metrics/insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kpi),
      })
      setInsights(await res.json())
    } finally { setInsightsLoading(false) }
  }, [kpi])

  const s = kpi?.summary
  const meta = kpi?.meta
  const daily: any[] = kpi?.daily || []
  const payment = kpi?.payment
  const sanguine = kpi?.sanguine
  const ks = kpi?.kpiStatus

  /* ── Money — one shared derivation, so this page and Finances agree ────── */

  const pnl = useMemo(() => invoicePnl(kpi), [kpi])
  const { revenue, adSpend, ops, payroll: workers, sanguine: sang, totalCost, netProfit, netMargin } = pnl

  const costParts = [
    { label: 'Meta ads', value: adSpend },
    { label: 'Sanguine', value: sang },
    { label: 'Worker payroll', value: workers },
    { label: 'Ops expenses', value: ops },
  ]

  /* ── Charts ────────────────────────────────────────────────────────────── */

  const trend: TrendSeries[] = useMemo(() => ([
    { key: 'spend', title: 'Spend', tone: 'accent', kind: 'area', values: daily.map(d => d.spend ?? 0), format: v => money(v) },
    { key: 'leads', title: 'Leads', tone: 'ink', kind: 'bar', values: daily.map(d => d.leads ?? 0), format: v => (v == null ? '—' : num(v)) },
    { key: 'signed', title: 'Signed cases', tone: 'good', kind: 'bar', values: daily.map(d => d.signedCases ?? 0), format: v => (v == null ? '—' : num(v)) },
  ]), [daily])

  /* pipelineTotals is returned by the API on every invoice and was not rendered
     anywhere — this is the first place it becomes visible. */
  const stageRows: StageRow[] = useMemo(() => {
    const pt = kpi?.pipelineTotals
    if (!pt) return []
    const rows: StageRow[] = STAGE_LABELS.map(([key, label, klass]) => ({
      key, label, klass, count: Number(pt[key]) || 0,
    }))
    const closedAt = rows.findIndex(r => r.key === 'closedCount')
    rows.splice(closedAt + 1, 0, { key: 'signed', label: 'Signed', klass: 'won', count: s?.signedCases ?? 0 })
    return rows
  }, [kpi, s])

  const closers = useMemo(() => {
    const raw: any[] = kpi?.workerClosedCases || []
    return raw
      .map(w => ({ name: w.name, value: w.closedCases }))
      .filter(w => w.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [kpi])

  const topAds = useMemo(() => {
    return [...(kpi?.adBreakdown || [])].sort((a, b) => (b.spend || 0) - (a.spend || 0))
  }, [kpi])

  const targetRows = useMemo(() => {
    if (!ks) return []
    return [
      { label: 'Weekly spend', k: ks.weeklySpend, fmt: (v: number) => money(v), higher: true },
      { label: 'Weekly leads', k: ks.weeklyLeads, fmt: (v: number) => v.toFixed(0), higher: true },
      { label: 'Weekly CPL', k: ks.weeklyCpl, fmt: (v: number) => money(v), higher: false },
      { label: 'Weekly signed', k: ks.weeklySignedCases, fmt: (v: number) => String(Math.round(v)), higher: true },
      { label: 'CPA', k: ks.cpa, fmt: (v: number) => money(v), higher: false },
      { label: 'Gross margin', k: ks.grossMargin, fmt: (v: number) => `${v.toFixed(1)}%`, higher: true },
    ].filter(r => r.k && (r.k.actual != null || r.k.target != null))
  }, [ks])

  if (loading) return <DashboardSkeleton />

  if (kpi?.error) {
    return <Banner tone="crit" title="This invoice could not be loaded">{kpi.error}</Banner>
  }
  if (!s) {
    return <EmptyState title="No data for this invoice" text="The invoice exists but returned no summary. Check that its period dates are set." />
  }

  const health = kpi.overallHealth as 'healthy' | 'warning' | 'critical' | undefined
  const healthCopy = health === 'healthy' ? 'Tracking against the model'
    : health === 'warning' ? 'Behind on some targets'
    : 'Off the model — needs action'
  const healthTone = health === 'healthy' ? 'var(--mx-good)' : health === 'warning' ? 'var(--mx-warn)' : 'var(--mx-crit)'

  return (
    <div style={{ display: 'grid', gap: 30 }}>

      {/* ── Bottom line ─────────────────────────────────────────────────── */}
      <section>
        <div className="mx-section-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p className="mx-eyebrow">The bottom line</p>
            {kpi.phase && <PhaseBadge label={kpi.phase.label} color={kpi.phase.color} />}
            {health && (
              <span style={{ fontSize: 12, fontWeight: 650, color: healthTone }}>{healthCopy}</span>
            )}
          </div>
          <p className="mx-section-note">
            {kpi.period?.days ? `${kpi.period.days} days` : ''}
            {kpi.period?.start ? ` · ${shortDate(kpi.period.start)} – ${shortDate(kpi.period.end)}` : ''}
          </p>
        </div>

        <div className="mx-hero">
          <div className="mx-hero-cell">
            <span className="mx-hero-label">Revenue</span>
            <span className="mx-hero-value is-good">{money(revenue)}</span>
            <span className="mx-hero-foot">
              {payment
                ? `${money(payment.received)} received, less ${money(payment.interestCost)} fee at ${(payment.interestRate * 100).toFixed(1)}%`
                : `${s.signedCases} cases at ${money(s.caseValue)}`}
            </span>
          </div>

          <div className="mx-hero-cell">
            <span className="mx-hero-label">All-in cost</span>
            <span className="mx-hero-value">{money(totalCost)}</span>
            <span className="mx-hero-foot">
              {money(adSpend)} of it on ads
              {revenue > 0 && ` · ${((totalCost / revenue) * 100).toFixed(0)}% of revenue`}
            </span>
          </div>

          <div className="mx-hero-cell">
            <span className="mx-hero-label">Net profit</span>
            <span className={`mx-hero-value ${netProfit >= 0 ? 'is-good' : 'is-crit'}`}>{money(netProfit)}</span>
            <span className="mx-hero-foot">After ads, ops, payroll and Sanguine</span>
          </div>

          <div className="mx-hero-cell">
            <span className="mx-hero-label">Net margin</span>
            <span className={`mx-hero-value ${netMargin == null ? 'is-empty' : netMargin > 30 ? 'is-good' : netMargin > 10 ? 'is-warn' : 'is-crit'}`}>
              {netMargin == null ? '—' : `${netMargin.toFixed(1)}%`}
            </span>
            <span className="mx-hero-foot">
              Gross margin {s.grossMargin != null ? `${s.grossMargin.toFixed(1)}%` : '—'}
            </span>
          </div>

          <div className="mx-hero-cell">
            <span className="mx-hero-label">Signed cases</span>
            <span className={`mx-hero-value ${s.signedCases > 0 ? '' : 'is-empty'}`}>{s.signedCases}</span>
            <span className="mx-hero-foot">
              {[
                s.originalCases > 0 && `${s.originalCases} original`,
                s.minorCases > 0 && `${s.minorCases} extra ${s.minorCases === 1 ? 'victim' : 'victims'}`,
                s.replacementCases > 0 && `${s.replacementCases} replacement${s.replacementCases === 1 ? '' : 's'}`,
              ].filter(Boolean).join(' · ') || 'in the invoice window'}
            </span>
          </div>
        </div>

        {/* Where the money went */}
        <div className="mx-card" style={{ marginTop: 10, padding: '15px 18px 16px' }}>
          <p className="mx-eyebrow" style={{ marginBottom: 10 }}>Where the {money(totalCost)} went</p>
          <CostBar parts={costParts} format={v => money(v)} />
        </div>

        {s.outOfWindowCases > 0 && (
          <div style={{ marginTop: 10 }}>
            <Banner tone="warn" title={`${s.outOfWindowCases} case${s.outOfWindowCases === 1 ? '' : 's'} tagged to ${code} but signed outside the window`}>
              They are counted here because they carry this invoice code. Move them from the Signed cases tab if that is wrong.
            </Banner>
          </div>
        )}
      </section>

      {/* ── Targets ─────────────────────────────────────────────────────── */}
      {targetRows.length > 0 && (
        <section>
          <div className="mx-section-head">
            <p className="mx-eyebrow">Against the model</p>
            <p className="mx-section-note">Bars show attainment — a cost metric fills when it comes in under target</p>
          </div>
          <div className="mx-card" style={{ overflow: 'hidden' }}>
            <div className="mx-targets">
              {targetRows.map(r => (
                <TargetMeter key={r.label}
                  label={r.label}
                  actual={r.k.actual}
                  target={r.k.target}
                  format={r.fmt}
                  higherBetter={r.higher}
                  status={r.k.status}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── What the spend bought ───────────────────────────────────────── */}
      <section>
        <div className="mx-section-head">
          <p className="mx-eyebrow">What the spend bought</p>
          {meta && (
            <p className="mx-section-note">
              {meta.connected ? `Meta account ${meta.accountId}` : 'No Meta account configured for this firm'}
            </p>
          )}
        </div>

        {meta?.error && (
          <div style={{ marginBottom: 10 }}>
            <Banner tone="crit" title="Meta returned an error">{meta.error}</Banner>
          </div>
        )}

        <div className="mx-strip" style={{ marginTop: 0 }}>
          <Cell label="Ad spend" value={money(adSpend)} />
          <Cell label="Impressions" value={compact(meta?.impressions)} />
          <Cell label="Clicks" value={num(meta?.clicks)} />
          <Cell label="CTR" value={meta?.ctrPct != null ? pct(meta.ctrPct) : '—'} />
          <Cell label="Meta leads" value={num(meta?.leads)} />
          <Cell label="CPL" value={money(meta?.cpl)} band={cplBand(meta?.cpl)} />
          <Cell label="CPQ" value={money(s.cpq)} band={caseBand(s.cpq)} />
          <Cell label="CPA" value={money(s.cpa)} band={caseBand(s.cpa)} />
          <Cell label="Adjusted CPA" value={money(s.adjustedCpa)} band={caseBand(s.adjustedCpa)} />
        </div>
      </section>

      {/* ── Day by day + pipeline ───────────────────────────────────────── */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 4fr) minmax(0, 5fr)', gap: 14, alignItems: 'start' }} className="mx-split">
          <div>
            <div className="mx-section-head">
              <p className="mx-eyebrow">Day by day</p>
              <p className="mx-section-note">{daily.length} {daily.length === 1 ? 'day' : 'days'}</p>
            </div>
            <div className="mx-card">
              <TrendPanels dates={daily.map(d => d.date)} series={trend} />
            </div>
          </div>

          <div>
            <div className="mx-section-head">
              <p className="mx-eyebrow">Pipeline attributed to this window</p>
              <p className="mx-section-note">One stage per contact</p>
            </div>
            <div className="mx-card">
              {stageRows.length > 0
                ? <PipelineBars rows={stageRows} />
                : <EmptyState compact title="No pipeline data" text="No CRM contacts are attributed to this invoice's ads." />}
            </div>
          </div>
        </div>
      </section>

      {/* ── People ──────────────────────────────────────────────────────── */}
      {closers.length > 0 && (
        <section>
          <div className="mx-section-head">
            <p className="mx-eyebrow">Cases closed by rep</p>
            <Link href={`/finance/firms/${slug}/invoice/${invoicePathSegment(code)}/hr`} className="mx-section-note"
              style={{ color: 'var(--mx-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              Full team view <IconArrow size={13} />
            </Link>
          </div>
          <div className="mx-card" style={{ overflow: 'hidden' }}>
            <Leaderboard rows={closers} unit="closed" />
          </div>
        </section>
      )}

      {/* ── Creatives preview ───────────────────────────────────────────── */}
      <section>
        <div className="mx-section-head">
          <p className="mx-eyebrow">Creatives in this window</p>
          <Link href={`/finance/firms/${slug}/invoice/${invoicePathSegment(code)}/marketing`} className="mx-section-note"
            style={{ color: 'var(--mx-accent-ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Open the Creatives section <IconArrow size={13} />
          </Link>
        </div>

        <div className="mx-card" style={{ overflow: 'hidden' }}>
          {topAds.length === 0 ? (
            <EmptyState compact title="No ad data in this window" text="Meta returned no delivery for these dates." />
          ) : (
            <div className="mx-tw">
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Creative</th>
                    <th>Ad set</th>
                    <th className="num">Spend</th>
                    <th className="num">Leads</th>
                    <th className="num">CPL</th>
                    <th className="num">CTR</th>
                    <th className="num">Signed</th>
                    <th className="num">CPA</th>
                    <th className="num">Adj. CPA</th>
                    <th className="num">CPQ</th>
                  </tr>
                </thead>
                <tbody>
                  {topAds.map((a: any, i: number) => {
                    const stalled = a.spend > 500 && !a.signedCases
                    return (
                      <tr className="row" key={a.adId || i}>
                        <td style={{ maxWidth: 220 }}>
                          <span className="mx-creative" style={{ display: 'block' }} title={a.adName}>
                            {a.adName || 'Unnamed creative'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--mx-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.adsetName}>
                          {a.adsetName || '—'}
                        </td>
                        <td className="num" style={{ fontWeight: 650 }}>{money(a.spend)}</td>
                        <td className="num">{a.metaLeads ?? <span className="mx-dim">—</span>}</td>
                        <td className="num"><span className={bandClass(cplBand(a.cpl))}>{money(a.cpl)}</span></td>
                        <td className="num" style={{ color: 'var(--mx-muted)' }}>{a.ctr ? pct(a.ctr) : '—'}</td>
                        <td className="num">
                          {a.signedCases > 0
                            ? <strong style={{ color: 'var(--mx-good)' }}>{a.signedCases}</strong>
                            : <span className="mx-dim">—</span>}
                        </td>
                        <td className="num">
                          {a.cpa != null
                            ? <span className={bandClass(caseBand(a.cpa))}>{money(a.cpa)}</span>
                            : <span style={{ fontSize: 11, color: stalled ? 'var(--mx-crit)' : 'var(--mx-faint)' }}>
                                {stalled ? 'no conversions' : '—'}
                              </span>}
                        </td>
                        <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(a.adjustedCpa)}</td>
                        <td className="num"><span className={bandClass(caseBand(a.cpq))}>{money(a.cpq)}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="lbl">Total</td>
                    <td />
                    <td className="num">{money(topAds.reduce((t, a) => t + (a.spend || 0), 0))}</td>
                    <td className="num">{topAds.reduce((t, a) => t + (a.metaLeads || 0), 0) || '—'}</td>
                    <td colSpan={2} />
                    <td className="num">{topAds.reduce((t, a) => t + (a.signedCases || 0), 0) || '—'}</td>
                    <td className="num">{money(s.cpa)}</td>
                    <td className="num">{money(s.adjustedCpa)}</td>
                    <td className="num">{money(s.cpq)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>

      <InsightsPanel data={insights} loading={insightsLoading} onGenerate={generateInsights} />
    </div>
  )
}

function Cell({ label, value, band }: { label: string; value: string; band?: ReturnType<typeof caseBand> }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''} ${band ? bandClass(band) : ''}`}>{value}</div>
    </div>
  )
}
