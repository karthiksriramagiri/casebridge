'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { invoiceCodeFromRouteSegment } from '@/app/finance/firms/_lib/invoice-routes'
import { ExpensesPanel } from '@/app/finance/firms/_components/firm-metrics-shared'
import {
  money, CostBar, EmptyState, Banner, DashboardSkeleton,
} from '@/app/_metrics/dash'
import {
  invoicePnl, BASE_PAY_PER_CASE, COMMISSION_PER_CLOSED,
} from '@/app/finance/firms/_lib/invoice-finance'

export default function InvoiceFinances() {
  const params = useParams()
  const slug = params.slug as string
  const code = invoiceCodeFromRouteSegment(params.invoice as string)

  const [kpi, setKpi] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/metrics/kpi?firm=${encodeURIComponent(slug)}&invoice=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => { setKpi(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug, code])

  const s = kpi?.summary
  const payment = kpi?.payment
  const sanguine = kpi?.sanguine

  const pnl = useMemo(() => invoicePnl(kpi), [kpi])

  if (loading) return <DashboardSkeleton />
  if (kpi?.error) return <Banner tone="crit" title="This invoice could not be loaded">{kpi.error}</Banner>
  if (!s) return <EmptyState title="Nothing to report" text="This invoice returned no summary to build a P&L from." />

  const { revenue, adSpend, ops, sanguine: sang, totalCost, netProfit: net, netMargin: margin, replacementWindowDays: replacementDays } = pnl
  const payroll = { rows: pnl.payrollRows, total: pnl.payroll }

  const lines = [
    {
      label: 'Firm payment',
      value: revenue,
      inflow: true,
      sub: payment
        ? `${money(payment.received)} received, less ${money(payment.interestCost)} at ${(payment.interestRate * 100).toFixed(1)}%`
        : `${s.signedCases} signed ${s.signedCases === 1 ? 'case' : 'cases'} at ${money(s.caseValue)}`,
    },
    { label: 'Meta ad spend', value: -adSpend, sub: 'Delivery inside the invoice window' },
    { label: 'Ops expenses', value: -ops, sub: `Lines dated in this window or tagged ${code}` },
    {
      label: 'Worker payroll',
      value: -payroll.total,
      sub: payroll.rows.length
        ? `${payroll.rows.length} ${payroll.rows.length === 1 ? 'rep' : 'reps'} · ${money(BASE_PAY_PER_CASE)} per signed case, ${money(COMMISSION_PER_CLOSED)} per close`
        : 'No cases assigned to a rep',
    },
    {
      label: 'Sanguine payroll',
      value: -sang,
      sub: sanguine?.rate
        ? `${sanguine.eligibleCases} eligible ${sanguine.eligibleCases === 1 ? 'case' : 'cases'} at ${money(sanguine.rate)}`
        : 'No Sanguine rate set for this firm',
    },
  ]

  return (
    <div style={{ display: 'grid', gap: 26 }}>

      <section>
        <div className="mx-section-head">
          <div>
            <h1 className="mx-page-title" style={{ fontSize: 28 }}>Profit <i>&amp; loss</i></h1>
            <p className="mx-page-sub">Everything earned and spent against {code}.</p>
          </div>
        </div>

        <div className="mx-card" style={{ overflow: 'hidden' }}>
          <div className="mx-ledger">
            {lines.map(l => {
              const zero = l.value === 0
              return (
                <div className="mx-ledger-row" key={l.label}>
                  <div style={{ minWidth: 0 }}>
                    <div className="mx-ledger-label">{l.label}</div>
                    <div className="mx-ledger-sub">{l.sub}</div>
                  </div>
                  <div className={`mx-ledger-val ${zero ? 'zero' : l.inflow ? 'inflow' : 'outflow'}`}>
                    {zero ? money(0) : l.value < 0 ? `−${money(Math.abs(l.value))}` : money(l.value)}
                  </div>
                </div>
              )
            })}

            <div className="mx-ledger-row net">
              <div>
                <div className="mx-ledger-label">Net profit</div>
                <div className="mx-ledger-sub">
                  {money(revenue)} in, {money(totalCost)} out
                  {margin != null && ` · ${margin.toFixed(1)}% margin`}
                </div>
              </div>
              <div className={`mx-ledger-val ${net >= 0 ? 'pos' : 'neg'}`}>
                {net < 0 ? `−${money(Math.abs(net))}` : money(net)}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-strip">
          <Cell label="Revenue" value={money(revenue)} tone="var(--mx-good)" />
          <Cell label="Total costs" value={money(totalCost)} />
          <Cell label="Net profit" value={money(net)} tone={net >= 0 ? 'var(--mx-good)' : 'var(--mx-crit)'} />
          <Cell label="Net margin" value={margin == null ? '—' : `${margin.toFixed(1)}%`}
            tone={margin == null ? undefined : margin > 30 ? 'var(--mx-good)' : margin > 10 ? 'var(--mx-warn)' : 'var(--mx-crit)'} />
          <Cell label="Gross margin" value={s.grossMargin != null ? `${s.grossMargin.toFixed(1)}%` : '—'} />
          <Cell label="Cost per signed case" value={s.signedCases > 0 ? money(totalCost / s.signedCases) : '—'} />
        </div>
      </section>

      <section>
        <div className="mx-section-head">
          <p className="mx-eyebrow">Cost mix</p>
          <p className="mx-section-note">Share of the {money(totalCost)} spent to earn this invoice</p>
        </div>
        <div className="mx-card" style={{ padding: '16px 18px 17px' }}>
          <CostBar
            parts={[
              { label: 'Meta ads', value: adSpend },
              { label: 'Sanguine', value: sang },
              { label: 'Worker payroll', value: payroll.total },
              { label: 'Ops expenses', value: ops },
            ]}
            format={v => money(v)}
          />
        </div>
      </section>

      {payroll.rows.length > 0 && (
        <section>
          <div className="mx-section-head">
            <p className="mx-eyebrow">Payroll behind that line</p>
            <p className="mx-section-note">
              A case counts as closed once marked closed, or once its {replacementDays}-day replacement window elapses
            </p>
          </div>
          <div className="mx-card" style={{ overflow: 'hidden' }}>
            <div className="mx-tw">
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th className="num">Signed</th>
                    <th className="num">Closed</th>
                    <th className="num">Base</th>
                    <th className="num">Commission</th>
                    <th className="num">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.rows.map(r => (
                    <tr className="row" key={r.name}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="num" style={{ fontWeight: 650 }}>{r.signed}</td>
                      <td className="num" style={{ fontWeight: 650, color: r.closed ? 'var(--mx-good)' : undefined }}>
                        {r.closed || <span className="mx-dim">—</span>}
                      </td>
                      <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(r.signed * BASE_PAY_PER_CASE)}</td>
                      <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(r.closed * COMMISSION_PER_CLOSED)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(r.pay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="lbl">Total</td>
                    <td className="num">{payroll.rows.reduce((t, r) => t + r.signed, 0)}</td>
                    <td className="num">{payroll.rows.reduce((t, r) => t + r.closed, 0)}</td>
                    <td colSpan={2} />
                    <td className="num">{money(payroll.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      )}

      {kpi?.firm?.id && <ExpensesPanel firmId={kpi.firm.id} invoiceCode={code} />}
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''}`} style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  )
}
