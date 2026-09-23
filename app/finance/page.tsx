'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MetricsHeader } from '@/app/_metrics/chrome'
import {
  money, num, shortDate,
  Banner, CostBar, DashboardSkeleton, EmptyState, TrendPanels,
  IconCalendar,
} from '@/app/_metrics/dash'
import { PnlChart, type PnlMonth } from '@/app/finance/_components/pnl-chart'
import { MoneyModel } from '@/app/finance/_components/money-model'

/* ═══════════════════════════════════════════════════════════════════════════
   Financial Center — the front page.

   One question: is the business making money. The rail answers it in five
   figures, the chart answers it month by month, the ledger shows the working,
   and everything below it says which firm the answer came from.

   Revenue here is booked, not collected — a case is revenue the day it signs.
   Cash actually banked is tracked separately against the invoices, because the
   gap between the two is the thing worth watching.
   ═══════════════════════════════════════════════════════════════════════════ */

const RANGES = [
  { key: 'this_month', label: 'Month' },
  { key: 'last_30d',   label: '30d' },
  { key: 'last_90d',   label: '90d' },
  { key: 'ytd',        label: 'YTD' },
  { key: 'all',        label: 'All time' },
]

const RANGE_BLURB: Record<string, string> = {
  this_month: 'this month so far',
  last_30d:   'over the last 30 days',
  last_90d:   'over the last 90 days',
  ytd:        'year to date',
  all:        'since the first case signed',
  custom:     'over the selected window',
}

export default function FinanceOverview() {
  const [range, setRange] = useState('last_90d')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/finance/overview?range=${range}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) { setError(d.error); setData(null) }
        else { setError(null); setData(d) }
      })
      .catch(() => { if (!cancelled) setError('The finance rollup could not be loaded.') })
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false) } })
    return () => { cancelled = true }
  }, [range, nonce])

  const t = data?.totals
  const blurb = RANGE_BLURB[data?.range?.key] || RANGE_BLURB[range]

  return (
    <>
      <MetricsHeader
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); setNonce(n => n + 1) }}
        actions={
          <div className="mx-seg" role="group" aria-label="Reporting period">
            {RANGES.map(r => (
              <button key={r.key} className="mx-seg-btn" aria-pressed={range === r.key}
                onClick={() => setRange(r.key)}>
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <main className="mx-main" id="mx-main">
        <div className="mx-section-head" style={{ marginBottom: 18 }}>
          <div>
            <h1 className="mx-page-title">Company <i>P&amp;L</i></h1>
            <p className="mx-page-sub">
              Every firm, every dollar in and out, {blurb}. Signed cases come from each firm's case
              management sheet where one exists, and revenue is booked the day a case signs.
            </p>
          </div>
          {data?.range && (
            <p className="mx-section-note" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IconCalendar />
              {shortDate(data.range.start)} – {shortDate(data.range.end)} · {num(data.range.days)} days
            </p>
          )}
        </div>

        {error && <div style={{ marginBottom: 16 }}><Banner tone="crit" title="Could not load the rollup">{error}</Banner></div>}

        {loading || !t ? (!error && <DashboardSkeleton />) : (
          <div style={{ display: 'grid', gap: 26 }}>

            {data.meta?.error && (
              <Banner tone="warn" title="Meta figures may be incomplete">{data.meta.error}</Banner>
            )}
            {data.payments?.missing && (
              <Banner tone="warn" title="Payments table missing">
                Cash figures are falling back to the hand-entered invoice amounts. Run{' '}
                <code>supabase/migration_payments.sql</code> then <code>supabase/seed_payments.sql</code>{' '}
                to read what the processor actually collected.
              </Banner>
            )}

            {Object.entries(data.sheets?.errors || {}).map(([slug, msg]) => (
              <Banner key={slug} tone="crit" title={`The ${slug.toUpperCase()} case sheet could not be read`}>
                {String(msg)} — that firm's figures fall back to the CRM records until the sheet is reachable.
              </Banner>
            ))}
            {data.setup?.invoicesMissing && (
              <Banner tone="warn" title="Invoice table missing">
                Collections and billing cannot be shown until <code>supabase/migration_firm_invoice_periods.sql</code> is run.
              </Banner>
            )}

            <MoneyModel />

            {/* ── The five figures ─────────────────────────────────────────── */}
            <section>
              <div className="mx-hero">
                <Hero label="Revenue booked" value={money(t.revenue)}
                  foot={`${num(t.billableCases)} billable ${t.billableCases === 1 ? 'case' : 'cases'} · ${money(t.revenuePerCase)} each`} />
                <Hero label="Ad spend" value={money(t.adSpend)}
                  foot={t.cpa != null ? `${money(t.cpa)} per signed case` : 'no signed cases yet'} />
                <Hero label="Total costs" value={money(t.totalCost)}
                  foot={`ads, payroll, Sanguine, ops${t.interestCost > 0 ? ', financing' : ''}`} />
                <Hero label="Net profit" value={money(t.netProfit)}
                  tone={t.netProfit > 0 ? 'good' : t.netProfit < 0 ? 'crit' : undefined}
                  foot={t.netMargin == null ? 'no revenue in this window' : `${t.netMargin.toFixed(1)}% net margin`} />
                <Hero label="Cash collected" value={money(t.collectedGross || t.collected)}
                  tone="good"
                  foot={t.paymentCount
                    ? `${num(t.paymentCount)} payments · ${money(t.processingFees)} in fees`
                    : t.outstanding > 0 ? `${money(t.outstanding)} still outstanding` : 'nothing outstanding'} />
              </div>

              <div className="mx-strip">
                <Stat label="Signed cases" value={num(t.signedCases)} />
                <Stat label="Replacements" value={num(t.replacementCases)}
                  tone={t.replacementCases > 0 ? 'var(--mx-warn)' : undefined} />
                <Stat label="Meta leads" value={num(t.metaLeads)} />
                <Stat label="Cost per lead" value={money(t.cpl)} />
                <Stat label="Cost per case" value={money(t.costPerCase)} />
                <Stat label="Return on ad spend" value={t.roas == null ? '—' : `${t.roas.toFixed(2)}×`}
                  tone={t.roas == null ? undefined : t.roas >= 1.5 ? 'var(--mx-good)' : t.roas >= 1 ? 'var(--mx-warn)' : 'var(--mx-crit)'} />
              </div>
            </section>

            {/* ── Month by month, and where it went ────────────────────────── */}
            <section className="mx-fin-split">
              <div style={{ display: 'grid', gap: 16 }}>
                <MonthlyCard months={data.monthly} />
              <div className="mx-card" style={{ overflow: 'hidden' }}>
                <div className="mx-card-head">
                  <span className="mx-card-title">The working</span>
                  <span className="mx-fin-note">Company-wide, {blurb}</span>
                </div>
                <div className="mx-ledger">
                  <LedgerRow label="Revenue booked" value={t.revenue} inflow
                    sub={`${num(t.billableCases)} billable ${t.billableCases === 1 ? 'case' : 'cases'} at their firm's case value${t.minorCases > 0 ? `, ${num(t.minorCases)} of them at a reduced rate` : ''}`} />
                  <LedgerRow label="Meta ad spend" value={-t.adSpend}
                    sub={`${num(t.metaLeads)} leads across ${data.meta.accounts.length || 'no'} ad ${data.meta.accounts.length === 1 ? 'account' : 'accounts'}`} />
                  <LedgerRow label="Sanguine payroll" value={-t.sanguine}
                    sub="Per original case, at each firm's agreed rate" />
                  <LedgerRow label="Rep case pay" value={-t.repPay}
                    sub="$5 per signed case, $25 per close" />
                  <LedgerRow label="Team salaries" value={-t.salary}
                    sub={t.activeReps > 0
                      ? `${num(t.activeReps)} weekly ${t.activeReps === 1 ? 'rate' : 'rates'} prorated over the window`
                      : 'No weekly pay rates on file'} />
                  <LedgerRow label="Ops expenses" value={-t.ops}
                    sub={t.opsShared > 0 ? `${money(t.opsShared)} of it company-wide rather than firm-specific` : 'Software, labour and overhead lines'} />
                  {t.interestCost > 0 && (
                    <LedgerRow label="Financing interest" value={-t.interestCost}
                      sub="Charged on the invoice payments advanced" />
                  )}

                  <div className="mx-ledger-row net">
                    <div>
                      <div className="mx-ledger-label">Net profit</div>
                      <div className="mx-ledger-sub">
                        {money(t.revenue)} in, {money(t.totalCost)} out
                        {t.netMargin != null && ` · ${t.netMargin.toFixed(1)}% margin`}
                      </div>
                    </div>
                    <div className={`mx-ledger-val ${t.netProfit >= 0 ? 'pos' : 'neg'}`}>
                      {t.netProfit < 0 ? `−${money(Math.abs(t.netProfit))}` : money(t.netProfit)}
                    </div>
                  </div>
                </div>
              </div>
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                <div className="mx-card">
                  <div className="mx-card-head">
                    <span className="mx-card-title">Where the money goes</span>
                    <span className="mx-fin-note">{money(t.totalCost)} total</span>
                  </div>
                  <div style={{ padding: '15px 18px 17px' }}>
                    <CostBar
                      parts={[
                        { label: 'Meta ads', value: t.adSpend },
                        { label: 'Sanguine', value: t.sanguine },
                        { label: 'Ops expenses', value: t.ops },
                        { label: 'Rep case pay', value: t.repPay },
                        { label: 'Team salaries', value: t.salary },
                        { label: 'Financing interest', value: t.interestCost },
                      ]}
                      format={v => money(v)}
                    />
                  </div>
                </div>

                <SpendPaceCard firms={data.firms} weeklySpend={t.weeklySpend} weekStart={t.weekStart} />

                <div className="mx-card">
                  <div className="mx-card-head">
                    <span className="mx-card-title">Cash position</span>
                  </div>
                  <div className="mx-fin-facts">
                    {t.paymentCount > 0 ? (
                      <>
                        <Fact label="Collected" sub={`${num(t.paymentCount)} payments from the processor`}
                          value={money(t.collectedGross)} tone="var(--mx-good)" />
                        <Fact label="Processing fees" sub="Taken by the processor before it lands"
                          value={money(t.processingFees)} />
                        <Fact label="Net received" sub="What actually reached the bank"
                          value={money(t.collectedNet)} tone="var(--mx-good)" />
                        <Fact label="Revenue booked" sub="Cases signed in this window"
                          value={money(t.revenue)} />
                        <Fact label="Cash vs booked"
                          sub={t.collectionRate == null ? 'no revenue booked here'
                            : t.collectionRate >= 100
                              ? 'collected more than booked — prepaid packages'
                              : 'booked ahead of cash'}
                          value={t.collectionRate == null ? '—' : `${t.collectionRate.toFixed(0)}%`}
                          tone={t.collectionRate != null && t.collectionRate >= 100 ? 'var(--mx-good)' : 'var(--mx-warn)'} />
                        <Fact label="Financing interest" sub="Cost of advancing those payments" value={money(t.interestCost)} />
                      </>
                    ) : (
                      <>
                        <Fact label="Billed on invoices" sub="Cases delivered in these periods" value={money(t.billedOnInvoices)} />
                        <Fact label="Collected" sub="Payments recorded against invoices" value={money(t.collected)}
                          tone="var(--mx-good)" />
                        <Fact label="Financing interest" sub="Cost of advancing those payments" value={money(t.interestCost)} />
                        <Fact label="Outstanding" sub="Billed and not yet paid" value={money(t.outstanding)}
                          tone={t.outstanding > 0 ? 'var(--mx-warn)' : undefined} />
                      </>
                    )}
                  </div>

                  {data.payments?.unmatched?.length > 0 && (
                    <p className="mx-fin-note" style={{ marginTop: 10 }}>
                      {money(t.unmatchedCollected)} came from payers with no firm record
                      ({data.payments.unmatched.map((u: any) => u.name).join(', ')}). Counted in the
                      company total, absent from the per-firm table below.
                    </p>
                  )}
                </div>

                <div className="mx-card" style={{ overflow: 'hidden' }}>
                  <div className="mx-card-head">
                    <span className="mx-card-title">Ops expenses</span>
                    <span className="mx-fin-note">{money(t.ops)} across {num(data.expenseCategories.reduce((s: number, c: any) => s + c.count, 0))} lines</span>
                  </div>
                  {data.expenseCategories.length === 0 ? (
                    <div style={{ padding: 6 }}>
                      <EmptyState compact title="No ops expenses in this window"
                        text="Expense lines are logged per firm or per invoice and roll up here." />
                    </div>
                  ) : (
                    <div className="mx-fin-facts">
                      {data.expenseCategories.map((c: any) => (
                        <Fact key={c.category}
                          label={c.category.charAt(0).toUpperCase() + c.category.slice(1)}
                          sub={`${c.count} ${c.count === 1 ? 'line' : 'lines'}`}
                          value={money(c.amount)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── By firm ──────────────────────────────────────────────────── */}
            <FirmTable firms={data.firms} totals={t} />

            {/* ── Delivery trend ───────────────────────────────────────────── */}
            <section>
              <div className="mx-card" style={{ overflow: 'hidden' }}>
                <div className="mx-card-head">
                  <span className="mx-card-title">Day by day</span>
                  <span className="mx-fin-note">Spend, cases signed and revenue booked</span>
                </div>
                {data.daily.length > 0 ? (
                  <TrendPanels
                    dates={data.daily.map((d: any) => d.date)}
                    series={[
                      { key: 'spend', title: 'Ad spend', values: data.daily.map((d: any) => d.spend), format: v => money(v), tone: 'accent', kind: 'area' },
                      { key: 'cases', title: 'Cases signed', values: data.daily.map((d: any) => d.cases), format: v => (v == null ? '—' : num(v)), tone: 'ink', kind: 'bar' },
                      { key: 'revenue', title: 'Revenue booked', values: data.daily.map((d: any) => d.revenue), format: v => money(v), tone: 'good', kind: 'bar' },
                    ]}
                  />
                ) : (
                  <div style={{ padding: 6 }}>
                    <EmptyState compact title="Too long a window for a daily view"
                      text="Pick 90 days or less to see the day-by-day breakdown. The monthly chart above covers this range." />
                  </div>
                )}
              </div>

            </section>

            {/* ── Sheet vs system ──────────────────────────────────────────── */}
            {(data.sheets?.firms || []).map((r: any) => <SheetPanel key={r.firmSlug} recon={r} />)}

            {/* ── Collections ──────────────────────────────────────────────── */}
            <InvoiceTable rows={data.invoices} />
          </div>
        )}
      </main>
    </>
  )
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthName = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1] || key} ${key.slice(0, 4)}`

/* ── Rail and strip cells ──────────────────────────────────────────────── */

function Hero({ label, value, foot, tone }: { label: string; value: string; foot: string; tone?: 'good' | 'crit' }) {
  return (
    <div className="mx-hero-cell">
      <span className="mx-hero-label">{label}</span>
      <span className={`mx-hero-value ${tone ? `is-${tone}` : ''}`}>{value}</span>
      <span className="mx-hero-foot">{foot}</span>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mx-strip-cell">
      <div className="mx-strip-label">{label}</div>
      <div className={`mx-strip-value ${value === '—' ? 'is-empty' : ''}`} style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  )
}

function Fact({ label, sub, value, tone }: { label: string; sub?: string; value: string; tone?: string }) {
  return (
    <div className="mx-fin-fact">
      <div style={{ minWidth: 0 }}>
        <div className="mx-fin-fact-label">{label}</div>
        {sub && <div className="mx-fin-fact-sub">{sub}</div>}
      </div>
      <div className="mx-fin-fact-val" style={tone ? { color: tone } : undefined}>{value}</div>
    </div>
  )
}

function LedgerRow({ label, sub, value, inflow }: { label: string; sub: string; value: number; inflow?: boolean }) {
  const zero = value === 0
  return (
    <div className="mx-ledger-row">
      <div style={{ minWidth: 0 }}>
        <div className="mx-ledger-label">{label}</div>
        <div className="mx-ledger-sub">{sub}</div>
      </div>
      <div className={`mx-ledger-val ${zero ? 'zero' : inflow ? 'inflow' : 'outflow'}`}>
        {zero ? money(0) : value < 0 ? `−${money(Math.abs(value))}` : money(value)}
      </div>
    </div>
  )
}

/* ── Monthly chart, with the table behind it ───────────────────────────── */

function MonthlyCard({ months }: { months: PnlMonth[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const spread = months.filter(m => m.revenue > 0 || m.totalCost > 0)

  return (
    <div className="mx-card" style={{ overflow: 'hidden' }}>
      <div className="mx-card-head">
        <span className="mx-card-title">Revenue against cost, by month</span>
        <div className="mx-seg" role="group" aria-label="Chart or table">
          <button className="mx-seg-btn" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
          <button className="mx-seg-btn" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
        </div>
      </div>

      {spread.length === 0 ? (
        <div style={{ padding: 6 }}>
          <EmptyState compact title="Nothing booked in this window"
            text="No revenue and no cost landed inside the selected period." />
        </div>
      ) : view === 'chart' ? (
        <PnlChart months={months} />
      ) : (
        <div className="mx-tw">
          <table className="mx-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Cases</th>
                <th className="num">Revenue</th>
                <th className="num">Ad spend</th>
                <th className="num">Other cost</th>
                <th className="num">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => (
                <tr className="row" key={m.month}>
                  <td style={{ fontWeight: 600 }}>{monthName(m.month)}</td>
                  <td className="num">{m.cases || <span className="mx-dim">—</span>}</td>
                  <td className="num">{money(m.revenue)}</td>
                  <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(m.adSpend)}</td>
                  <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(m.totalCost - m.adSpend)}</td>
                  <td className={`num ${m.netProfit >= 0 ? 'pos' : 'neg'}`}>
                    {m.netProfit < 0 ? `−${money(Math.abs(m.netProfit))}` : money(m.netProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Ad spend pace ─────────────────────────────────────────────────────────
   The only part of this page that ignores the selected window: a weekly cap
   is breached now or it isn't, and a 90-day view would hide that.          */

function SpendPaceCard({ firms, weeklySpend, weekStart }: { firms: any[]; weeklySpend: number; weekStart: string }) {
  const spending = firms
    .filter(f => f.weeklySpend > 0)
    .sort((a, b) => b.weeklySpend - a.weeklySpend)

  return (
    <div className="mx-card" style={{ overflow: 'hidden' }}>
      <div className="mx-card-head">
        <span className="mx-card-title">Ad spend pace</span>
        <span className="mx-fin-note">{money(weeklySpend)} since {shortDate(weekStart)}</span>
      </div>

      {spending.length === 0 ? (
        <div style={{ padding: 6 }}>
          <EmptyState compact title="No delivery this week"
            text="Nothing has been spent on any firm's campaigns in the last seven days." />
        </div>
      ) : (
        <div className="mx-pace">
          {spending.map(f => {
            const cap = f.capScale || f.capInitial || 0
            const ratio = cap > 0 ? f.weeklySpend / cap : 0
            const over = ratio > 1
            const near = !over && ratio >= 0.85
            return (
              <div className="mx-pace-row" key={f.id}>
                <span className="mx-pace-name">{f.name}</span>
                <span className="mx-pace-val" style={{ color: over ? 'var(--mx-crit)' : undefined }}>
                  {money(f.weeklySpend)}
                </span>
                <span className="mx-pace-track">
                  <span className={`mx-pace-fill ${over ? 'over' : near ? 'near' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(ratio * 100, 2))}%` }} />
                  {cap > 0 && f.capInitial > 0 && f.capInitial < cap && (
                    <span className="mx-pace-mark" style={{ left: `${(f.capInitial / cap) * 100}%` }} />
                  )}
                </span>
                <span className="mx-pace-foot">
                  <span>{f.phase} phase · cap <b>{money(cap)}</b> a week</span>
                  <span style={{ color: over ? 'var(--mx-crit)' : near ? 'var(--mx-warn)' : undefined }}>
                    {cap === 0 ? 'no cap set'
                      : over ? `${money(f.weeklySpend - cap)} over`
                      : `${money(cap - f.weeklySpend)} of room`}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Per-firm P&L ──────────────────────────────────────────────────────────
   Shared ops, salaries and financing interest belong to no single firm, so
   they are not smeared across them — they stand as their own row, which is
   also what makes the column totals reconcile with the rail above.         */

function FirmTable({ firms, totals }: { firms: any[]; totals: any }) {
  const active = firms.filter(f => f.signedCases > 0 || f.adSpend > 0 || f.totalCost > 0)
  const idle = firms.length - active.length
  const maxRevenue = Math.max(1, ...active.map(f => f.revenue))

  const shared = totals.opsShared + totals.salary + totals.interestCost + totals.unattributedSpend

  return (
    <section>
      <div className="mx-section-head">
        <p className="mx-eyebrow">By firm</p>
        <p className="mx-section-note">
          {idle > 0 && `${idle} firm${idle === 1 ? '' : 's'} with no activity in this window hidden · `}
          Open a firm for its invoices and delivery
        </p>
      </div>

      {active.length === 0 ? (
        <div className="mx-card">
          <EmptyState title="No firm activity in this window"
            text="No cases signed and no spend delivered against any firm in the selected period." />
        </div>
      ) : (
        <div className="mx-card" style={{ overflow: 'hidden' }}>
          <div className="mx-tw">
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Firm</th>
                  <th className="num">Cases</th>
                  <th className="num">Revenue</th>
                  <th className="num">Ad spend</th>
                  <th className="num">Ad CPA</th>
                  <th className="num">Other cost</th>
                  <th className="num">Net profit</th>
                  <th className="num">Margin</th>
                </tr>
              </thead>
              <tbody>
                {active.map(f => (
                  <tr className="row" key={f.id}>
                    <td>
                      <Link href={`/finance/firms/${f.slug}`} className="mx-firmlink">{f.name}</Link>
                      {f.sheetBacked && <span className="mx-src" title="Signed cases come from this firm's case management sheet">sheet</span>}
                      {f.replacementCases > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--mx-muted)', marginTop: 1 }}>
                          {f.replacementCases} replacement{f.replacementCases === 1 ? '' : 's'} issued
                        </div>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 650 }}>{f.billableCases || <span className="mx-dim">—</span>}</td>
                    <td className="num mx-bar-cell">
                      {money(f.revenue)}
                      <span className="rail" style={{ width: `${(f.revenue / maxRevenue) * 100}%` }} />
                    </td>
                    <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(f.adSpend)}</td>
                    <td className="num">{f.cpa == null ? <span className="mx-dim">—</span> : money(f.cpa)}</td>
                    <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(f.ops + f.repPay + f.sanguine)}</td>
                    <td className={`num ${f.netProfit >= 0 ? 'pos' : 'neg'}`}>
                      {f.netProfit < 0 ? `−${money(Math.abs(f.netProfit))}` : money(f.netProfit)}
                    </td>
                    <td className="num">
                      {f.netMargin == null ? <span className="mx-dim">—</span> : `${f.netMargin.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}

                {shared > 0 && (
                  <tr className="row">
                    <td>
                      <span style={{ fontWeight: 650 }}>Company-wide</span>
                      <div style={{ fontSize: 11, color: 'var(--mx-muted)', marginTop: 1 }}>
                        Shared ops, salaries and financing — not attributed to a firm
                      </div>
                    </td>
                    <td className="num"><span className="mx-dim">—</span></td>
                    <td className="num"><span className="mx-dim">—</span></td>
                    <td className="num" style={{ color: 'var(--mx-muted)' }}>
                      {totals.unattributedSpend > 0 ? money(totals.unattributedSpend) : <span className="mx-dim">—</span>}
                    </td>
                    <td className="num"><span className="mx-dim">—</span></td>
                    <td className="num" style={{ color: 'var(--mx-muted)' }}>{money(totals.opsShared + totals.salary + totals.interestCost)}</td>
                    <td className="num neg">−{money(shared)}</td>
                    <td className="num"><span className="mx-dim">—</span></td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="lbl">All firms</td>
                  <td className="num">{num(totals.billableCases)}</td>
                  <td className="num">{money(totals.revenue)}</td>
                  <td className="num">{money(totals.adSpend)}</td>
                  <td className="num">{money(totals.cpa)}</td>
                  <td className="num">{money(totals.totalCost - totals.adSpend)}</td>
                  <td className={`num ${totals.netProfit >= 0 ? 'pos' : 'neg'}`}>
                    {totals.netProfit < 0 ? `−${money(Math.abs(totals.netProfit))}` : money(totals.netProfit)}
                  </td>
                  <td className="num">{totals.netMargin == null ? '—' : `${totals.netMargin.toFixed(0)}%`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

/* ── Sheet vs system ───────────────────────────────────────────────────────
   The sheet decides what gets billed, so every row it disagrees with the CRM
   about is money moving. A case the CRM has and the sheet does not is a case
   nobody is being invoiced for — it belongs on screen, not swallowed.      */

const DIFF_KINDS: Record<string, { label: string; tone: string; note: string }> = {
  onlyInSheet:  { label: 'Only in the sheet', tone: 'var(--mx-accent-ink)', note: 'Billed, but no CRM record to attribute it to' },
  onlyInSystem: { label: 'Only in the CRM',   tone: 'var(--mx-warn)',       note: 'Not billed — the sheet has no row for it' },
  movedInvoice: { label: 'Different invoice', tone: 'var(--mx-ink-2)',      note: 'Billed under the sheet\u2019s invoice' },
  statusDiff:   { label: 'Different status',  tone: 'var(--mx-ink-2)',      note: 'The sheet\u2019s disposition wins' },
}

function SheetPanel({ recon }: { recon: any }) {
  const [open, setOpen] = useState(false)

  const rows: any[] = [
    ...recon.onlyInSystem.map((c: any) => ({ kind: 'onlyInSystem', name: c.name, invoice: c.invoice, detail: c.status, date: c.signedAt })),
    ...recon.onlyInSheet.map((c: any) => ({ kind: 'onlyInSheet', name: c.name, invoice: c.invoice, detail: c.status, date: c.signedAt })),
    ...recon.movedInvoice.map((c: any) => ({ kind: 'movedInvoice', name: c.name, invoice: c.sheetInvoice, detail: `CRM says ${c.systemInvoice}`, date: null })),
    ...recon.statusDiff.map((c: any) => ({ kind: 'statusDiff', name: c.name, invoice: c.invoice, detail: `${c.sheetStatus} · CRM says ${c.systemStatus}`, date: null })),
  ]

  const shown = open ? rows : rows.slice(0, 8)

  return (
    <section>
      <div className="mx-section-head">
        <p className="mx-eyebrow">{recon.firmName} · case management sheet</p>
        <p className="mx-section-note">
          <a href={recon.url} target="_blank" rel="noreferrer" className="mx-crumb">{recon.title}</a>
          {' · every invoice, not only this window · read '}
          {new Date(recon.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>

      <div className="mx-card" style={{ overflow: 'hidden' }}>
        <div className="mx-strip" style={{ border: 0, borderRadius: 0, boxShadow: 'none' }}>
          <Stat label="Cases in the sheet" value={num(recon.sheetCases)} />
          <Stat label="Matched to the CRM" value={num(recon.matched)} />
          <Stat label="Closed per the sheet" value={num(recon.closedInSheet)} tone="var(--mx-good)" />
          <Stat label="Only in the CRM" value={num(recon.onlyInSystem.length)}
            tone={recon.onlyInSystem.length > 0 ? 'var(--mx-warn)' : undefined} />
          <Stat label="Only in the sheet" value={num(recon.onlyInSheet.length)} />
          <Stat label="Invoice moved" value={num(recon.movedInvoice.length)} />
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: 6 }}>
            <EmptyState compact title="The sheet and the CRM agree"
              text="Every case in the sheet matches a CRM record, on the same invoice with the same status." />
          </div>
        ) : (
          <>
            <div className="mx-tw">
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Invoice</th>
                    <th>Difference</th>
                    <th>Detail</th>
                    <th>Signed</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => {
                    const kind = DIFF_KINDS[r.kind]
                    return (
                      <tr className="row" key={`${r.kind}-${r.name}-${i}`}>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td style={{ color: 'var(--mx-muted)' }}>{r.invoice}</td>
                        <td style={{ color: kind.tone, fontWeight: 600 }}>{kind.label}</td>
                        <td style={{ color: 'var(--mx-muted)' }}>{r.detail || kind.note}</td>
                        <td style={{ color: 'var(--mx-muted)', whiteSpace: 'nowrap' }}>
                          {r.date ? shortDate(r.date) : <span className="mx-dim">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {rows.length > 8 && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--mx-line-2)' }}>
                <button className="mx-btn mx-btn-quiet" onClick={() => setOpen(o => !o)}>
                  {open ? 'Show fewer' : `Show all ${rows.length} differences`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ── Collections ───────────────────────────────────────────────────────── */

function InvoiceTable({ rows }: { rows: any[] }) {
  if (!rows || rows.length === 0) return null

  return (
    <section>
      <div className="mx-section-head">
        <p className="mx-eyebrow">Invoices in this window</p>
        <p className="mx-section-note">What was delivered against each billing period, and what has been paid</p>
      </div>

      <div className="mx-card" style={{ overflow: 'hidden' }}>
        <div className="mx-tw">
          <table className="mx-table">
            <thead>
              <tr>
                <th>Firm</th>
                <th>Invoice</th>
                <th>Period</th>
                <th className="num">Cases</th>
                <th className="num">Closed</th>
                <th className="num">Billed</th>
                <th className="num">Collected</th>
                <th className="num">Interest</th>
                <th className="num">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr className="row" key={r.id}>
                  <td>
                    <Link href={`/finance/firms/${r.firmSlug}`} className="mx-firmlink">{r.firmName}</Link>
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {r.code}
                    {r.fromSheet && <span className="mx-src" title="Counted from the case management sheet">sheet</span>}
                  </td>
                  <td style={{ color: 'var(--mx-muted)', whiteSpace: 'nowrap' }}>
                    {shortDate(r.periodStart)} – {shortDate(r.periodEnd)}
                  </td>
                  <td className="num">
                    {r.cases || <span className="mx-dim">—</span>}
                    {r.sheetReplacements > 0 && (
                      <span style={{ color: 'var(--mx-muted)', fontWeight: 400 }}> +{r.sheetReplacements}r</span>
                    )}
                  </td>
                  <td className="num" style={{ color: 'var(--mx-muted)' }}>
                    {r.sheetClosed == null ? <span className="mx-dim">—</span> : `${r.sheetClosed}/${r.cases}`}
                  </td>
                  <td className="num">{money(r.billed)}</td>
                  <td className="num" style={{ color: r.collected > 0 ? 'var(--mx-good)' : undefined, fontWeight: r.collected > 0 ? 650 : undefined }}>
                    {r.collected > 0 ? money(r.collected) : <span className="mx-dim">—</span>}
                  </td>
                  <td className="num" style={{ color: 'var(--mx-muted)' }}>
                    {r.interestCost > 0 ? `${money(r.interestCost)} · ${(r.interestRate * 100).toFixed(1)}%` : <span className="mx-dim">—</span>}
                  </td>
                  <td className="num" style={{ color: r.outstanding > 0 ? 'var(--mx-warn)' : undefined, fontWeight: r.outstanding > 0 ? 700 : undefined }}>
                    {r.outstanding > 0 ? money(r.outstanding) : <span className="mx-dim">settled</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="lbl" colSpan={3}>Total</td>
                <td className="num">{num(rows.reduce((s, r) => s + r.cases, 0))}</td>
                <td className="num">{num(rows.reduce((s, r) => s + (r.sheetClosed || 0), 0))}</td>
                <td className="num">{money(rows.reduce((s, r) => s + r.billed, 0))}</td>
                <td className="num">{money(rows.reduce((s, r) => s + r.collected, 0))}</td>
                <td className="num">{money(rows.reduce((s, r) => s + r.interestCost, 0))}</td>
                <td className="num">{money(rows.reduce((s, r) => s + r.outstanding, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  )
}
