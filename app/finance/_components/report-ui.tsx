import Link from 'next/link'
import { PaidToggle } from './paid-toggle'
import { formatRange } from '@/lib/finance/reporting/dates'
import { formatPct, formatUSD, formatUSDCompact, pctChange, type Cents } from '@/lib/finance/reporting/money'
import type { Metrics, ReportData, TrendPoint } from '@/lib/finance/reporting/report-types'
import { OPEX_CATEGORY_LABELS, type OpexCategory } from '@/lib/finance/reporting/types'

/* The report, as read. Server components throughout — nothing here needs
   state, and a page about money should render the same for everyone who
   loads it at the same moment. */

const tone = (n: number | null) => (n === null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

/** A figure with its change against the comparison window underneath. */
function Delta({
  current, previous, invert, complete = true,
}: {
  current: Cents
  previous: Cents | null
  invert?: boolean
  /** False when the comparison window reaches back past the first data. */
  complete?: boolean
}) {
  if (previous === null) return <span className="fin-fig-s">no comparison</span>
  /* Zero is not a baseline. Growth from nothing is undefined, and "— vs $0"
     reads as a comparison that was made and came out flat; this says no
     comparison was possible. */
  if (previous === 0) {
    return <span className="fin-fig-s">{complete ? 'nothing in the prior period' : 'no prior data'}</span>
  }
  const pct = pctChange(current, previous)
  /* On a cost, down is good. The arrow still points the way the number
     moved — only the colour reads as better or worse. */
  const good = pct === null ? null : invert ? -pct : pct
  return (
    <span className={`fin-kpi-d ${tone(good)}`}>
      {pct === null ? '—' : `${pct > 0 ? '↑' : pct < 0 ? '↓' : ''} ${formatPct(Math.abs(pct))}`}
      <span className="muted">vs {formatUSDCompact(previous)}</span>
    </span>
  )
}

export function KpiCards({ report }: { report: ReportData }) {
  const prev = report.comparison?.metrics ?? null
  const m = report.current
  const cards: { label: string; value: string; cls?: string; prev: Cents | null; cur: Cents; invert?: boolean }[] = [
    { label: 'Revenue', value: formatUSD(m.revenue), cur: m.revenue, prev: prev?.revenue ?? null },
    { label: 'Advertising', value: formatUSD(m.advertising), cur: m.advertising, prev: prev?.advertising ?? null, invert: true },
    { label: 'Intake cost', value: formatUSD(m.intake), cur: m.intake, prev: prev?.intake ?? null, invert: true },
    { label: 'Operating expenses', value: formatUSD(m.opex), cur: m.opex, prev: prev?.opex ?? null, invert: true },
    {
      label: 'Profit',
      value: formatUSD(m.profit),
      cls: m.profit > 0 ? 'pos' : m.profit < 0 ? 'neg' : '',
      cur: m.profit,
      prev: prev?.profit ?? null,
    },
  ]
  const onCases = report.meta.filters.basis === 'cases'
  const other = onCases ? m.invoicedRevenue : m.caseRevenue
  /* The average only reads as a case price when every firm charges the
     same; with a mix it is still the right divisor for the sum. */
  const perCase = m.cases > 0 ? Math.round(m.caseRevenue / m.cases) : null

  return (
    <>
      {/* Which basis the figures are on, and what the other one says.
          Billing runs ahead of delivery, so the two rarely agree and the
          gap is worth reading rather than hiding. */}
      {/* Where the number comes from, in the number's own terms. A reader
          who cannot reproduce a figure has no way to tell a real change
          from a bug in how it is counted. */}
      <p className="fin-note" style={{ marginBottom: 8 }}>
        Revenue is <strong>{onCases ? 'cases delivered' : 'invoiced'}</strong>
        {onCases ? ' — ' : ' — each invoice recognised straight-line across its service period. '}
        {onCases && (
          <>
            {m.cases.toLocaleString('en-US')} case{m.cases === 1 ? '' : 's'} signed in this range,
            each at its firm&rsquo;s case price
            {perCase !== null && <> ({formatUSD(perCase)} average)</>}
            {' = '}<strong>{formatUSD(m.revenue)}</strong>.{' '}
          </>
        )}
        {onCases
          ? `Invoiced over the same range: ${formatUSD(other)}.`
          : `Cases delivered over the same range: ${formatUSD(other)} from ${m.cases.toLocaleString('en-US')} case${m.cases === 1 ? '' : 's'}.`}
      </p>

      <div className="fin-figs">
        {cards.map((c) => (
          <div key={c.label} className="fin-fig">
            <div className="fin-fig-l">{c.label}</div>
            <div className={`fin-fig-v fin-num ${c.cls ?? ''}`}>{c.value}</div>
            <Delta current={c.cur} previous={c.prev} invert={c.invert} complete={report.comparison?.dataComplete !== false} />
          </div>
        ))}
        <div className="fin-fig">
          <div className="fin-fig-l">Margin</div>
          <div className={`fin-fig-v fin-num ${tone(m.margin)}`}>{formatPct(m.margin)}</div>
          <span className="fin-fig-s">
            {prev && prev.margin !== null && m.margin !== null
              ? `${(m.margin - prev.margin) >= 0 ? '+' : '−'}${Math.abs(m.margin - prev.margin).toFixed(1)} pp`
              : 'no comparison'}
          </span>
        </div>
      </div>

      {/* The arithmetic, spelled out. Every figure above is in it, so there
          is no question which number came from where. */}
      <div className="fin-eq fin-num">
        <b>{formatUSD(m.revenue)}</b>
        <span className="op">{onCases ? 'delivered' : 'invoiced'}</span>
        <span className="op">−</span> {formatUSD(m.advertising)} ads
        <span className="op">−</span> {formatUSD(m.intake)} intake
        <span className="op">−</span> {formatUSD(m.opex)} opex
        <span className="res">
          = {formatUSD(m.profit)} <span className="op">({formatPct(m.margin)})</span>
        </span>
      </div>
    </>
  )
}

/** Day, week, month, quarter and year — all ending on the report's end date. */
export function PeriodStrip({ report }: { report: ReportData }) {
  return (
    <div className="fin-strip">
      {report.periodComparisons.map((row) => {
        const pct = pctChange(row.currentMetrics.revenue, row.previousMetrics.revenue)
        return (
          <div key={row.key} className="fin-strip-c">
            <div className="fin-strip-k">{row.label}</div>
            <div className="fin-strip-v fin-num">{formatUSDCompact(row.currentMetrics.revenue)}</div>
            <div className={`fin-strip-s ${tone(pct)}`}>
              {pct === null
                ? row.dataComplete ? 'nothing in the prior period' : 'no prior data'
                : `${formatPct(pct, { signed: true })} vs ${formatUSDCompact(row.previousMetrics.revenue)}`}
            </div>
            {!row.dataComplete && pct !== null && <div className="fin-strip-s">partial history</div>}
          </div>
        )
      })}
    </div>
  )
}

/* Revenue and spend as bars, profit as a line. Plain SVG, no chart library.

   The viewBox is not stretched: `preserveAspectRatio="none"` made the
   chart fill its box by distorting it, so the bars were different widths
   at different window sizes and the profit line changed slope with the
   browser. It keeps its aspect ratio now and the box is sized to match. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <p className="fin-empty">Nothing in this range.</p>

  const W = 900
  const H = 300
  const PAD = { l: 62, r: 16, t: 14, b: 34 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b

  const hi = Math.max(...data.map((d) => Math.max(d.revenue, d.totalSpend, d.profit)), 1)
  const lo = Math.min(0, ...data.map((d) => d.profit))
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  const band = iw / data.length
  const bw = Math.max(1.5, Math.min(18, band * 0.32))
  const zero = y(0)

  const line = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${(PAD.l + band * (i + 0.5)).toFixed(1)},${y(d.profit).toFixed(1)}`)
    .join(' ')

  /* At most ten labels, whatever the grain — ninety daily points each
     labelled is a smear, not an axis. */
  const step = Math.max(1, Math.ceil(data.length / 10))

  return (
    <>
      <div className="fin-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="fin-chart" role="img"
             aria-label="Revenue, spend and profit over the selected range">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const gy = PAD.t + ih * f
            return (
              <g key={f}>
                <line x1={PAD.l} x2={W - PAD.r} y1={gy} y2={gy} stroke="var(--line)" strokeWidth="1" />
                <text x={PAD.l - 8} y={gy + 3.5} textAnchor="end">
                  {formatUSDCompact(lo + (hi - lo) * (1 - f))}
                </text>
              </g>
            )
          })}

          {data.map((d, i) => {
            const x = PAD.l + band * i + band / 2
            return (
              <g key={d.key}>
                <rect x={x - bw - 1} y={y(d.revenue)} width={bw} height={Math.max(0.5, zero - y(d.revenue))}
                      fill="var(--pos)" opacity="0.5" rx="1.5">
                  <title>{`${d.label} · revenue ${formatUSD(d.revenue)}`}</title>
                </rect>
                <rect x={x + 1} y={y(d.totalSpend)} width={bw} height={Math.max(0.5, zero - y(d.totalSpend))}
                      fill="#5B7FB9" opacity="0.5" rx="1.5">
                  <title>{`${d.label} · spend ${formatUSD(d.totalSpend)}`}</title>
                </rect>
                {i % step === 0 && <text x={x} y={H - 11} textAnchor="middle">{d.label}</text>}
              </g>
            )
          })}

          {/* The zero line only shows when something sits below it. */}
          {lo < 0 && <line x1={PAD.l} x2={W - PAD.r} y1={zero} y2={zero} stroke="var(--line-2)" strokeWidth="1" />}
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={d.key} cx={PAD.l + band * (i + 0.5)} cy={y(d.profit)} r={data.length > 40 ? 0 : 2.2}
                    fill="var(--card)" stroke="var(--ink)" strokeWidth="1.4">
              <title>{`${d.label} · profit ${formatUSD(d.profit)}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="fin-legend">
        <span><i style={{ background: 'var(--pos)', opacity: 0.5 }} />Revenue</span>
        <span><i style={{ background: '#5B7FB9', opacity: 0.5 }} />Total spend</span>
        <span><i style={{ background: 'var(--ink)' }} />Profit</span>
      </div>
    </>
  )
}

/** Where the money went, as a share of revenue. */
export function CostBreakdown({ metrics }: { metrics: Metrics }) {
  const base = Math.max(metrics.revenue, metrics.totalSpend, 1)
  const rows = [
    { label: 'Advertising', cents: metrics.advertising, cls: 'ad' },
    { label: 'Intake cost', cents: metrics.intake, cls: 'intake' },
    { label: 'Operating expenses', cents: metrics.opex, cls: 'opex' },
    { label: 'Profit', cents: Math.max(0, metrics.profit), cls: 'profit' },
  ]
  return (
    <div className="fin-bars">
      {rows.map((r) => (
        <div key={r.label} className="fin-bar-row">
          <div className="fin-bar-top">
            <span>{r.label}</span>
            <span className="fin-num">
              {formatUSD(r.cents)}
              <span className="fin-bar-sub"> · {metrics.revenue ? formatPct((r.cents / metrics.revenue) * 100) : '—'}</span>
            </span>
          </div>
          <div className="fin-bar-track">
            <div className={`fin-bar-fill ${r.cls}`} style={{ width: `${Math.min(100, (r.cents / base) * 100)}%` }} />
          </div>
        </div>
      ))}
      {metrics.profit < 0 && (
        <p className="fin-note">Spend exceeded revenue by {formatUSD(Math.abs(metrics.profit))} in this range.</p>
      )}
    </div>
  )
}

/** Revenue against target, with pace. */
export function TargetAttainment({ report }: { report: ReportData }) {
  if (!report.targets) {
    return (
      <p className="fin-empty">
        No revenue targets set yet. Add them to <code>reporting_targets</code> to track pace and projection.
      </p>
    )
  }
  return (
    <div className="fin-bars">
      {report.targets.items.map((t) => (
        <div key={t.key} className="fin-bar-row">
          <div className="fin-bar-top">
            <span>
              {t.label} <span className="fin-bar-sub">{t.periodLabel}</span>
            </span>
            <span className="fin-num">
              {formatUSDCompact(t.actual)} / {t.target ? formatUSDCompact(t.target) : '—'}
            </span>
          </div>
          <div className="fin-bar-track">
            <div className={`fin-bar-fill ${t.status === 'behind' ? 'under' : 'over'}`}
                 style={{ width: `${Math.min(100, t.attainment ?? 0)}%` }} />
          </div>
          <div className="fin-bar-sub">
            {t.status === 'no_target'
              ? 'no target set'
              : `${formatPct(t.attainment)} of target · ${t.status === 'behind' ? 'behind' : t.status === 'ahead' ? 'ahead of' : 'on'} pace · projecting ${formatUSDCompact(t.projected)}`}
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td className="n fin-num">{formatUSD(m.revenue)}</td>
      <td className="n fin-num">{formatUSD(m.advertising)}</td>
      <td className="n fin-num">{formatUSD(m.intake)}</td>
      <td className="n fin-num">{formatUSD(m.opex)}</td>
      <td className={`n fin-num ${tone(m.profit)}`}>{formatUSD(m.profit)}</td>
      <td className={`n fin-num ${tone(m.margin)}`}>{formatPct(m.margin)}</td>
    </>
  )
}

const HEAD = ['Revenue', 'Advertising', 'Intake', 'OpEx', 'Profit', 'Margin']

export function FirmTable({ report, hrefForFirm }: { report: ReportData; hrefForFirm: (id: string) => string }) {
  const { total } = report.firms
  /* Only firms with something in this range. A row of zeroes is not an
     observation, and six of them pushed the two firms that are actually
     trading off the bottom of the card. */
  const rows = report.firms.rows.filter(
    (r) => r.metrics.revenue !== 0 || r.metrics.totalSpend !== 0,
  )
  if (rows.length === 0) return <p className="fin-empty">No firm had revenue or cost in this range.</p>
  return (
    <div className="fin-scroll">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Law firm</th>
            <th className="n">Cases</th>
            <th className="n">Invoices</th>
            {HEAD.map((h) => <th key={h} className="n">{h}</th>)}
            <th className="n">Rev. growth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.firmId ?? r.name}>
              <td>{r.firmId ? <Link href={hrefForFirm(r.firmId)}>{r.name}</Link> : r.name}</td>
              <td className="n fin-num">{r.metrics.cases || '—'}</td>
              <td className="n fin-num">{r.invoiceCount}</td>
              <MetricCells m={r.metrics} />
              <td className={`n fin-num ${tone(r.revenueGrowth)}`}>{formatPct(r.revenueGrowth, { signed: true })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="fin-tfoot">
          <tr>
            <td>Total</td>
            <td className="n fin-num">{total.cases || '—'}</td>
            <td className="n fin-num">{rows.reduce((a, r) => a + r.invoiceCount, 0)}</td>
            <MetricCells m={total} />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function InvoiceTable({ report, hrefForInvoice }: { report: ReportData; hrefForInvoice: (id: string) => string }) {
  const { rows, total } = report.invoices
  if (rows.length === 0) return <p className="fin-empty">No invoices in this range.</p>
  return (
    <div className="fin-scroll">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Law firm</th>
            <th>Period</th>
            <th className="n">Payment</th>
            {HEAD.map((h) => <th key={h} className="n">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.invoiceId ?? r.number}>
              <td>
                {r.invoiceId ? <Link href={hrefForInvoice(r.invoiceId)}>{r.number}</Link> : r.number}
                {r.kind !== 'invoice' && <> <span className="fin-tag warn">unattributed</span></>}
              </td>
              <td>{r.firmName}</td>
              <td className="fin-num">
                {r.periodStart && r.periodEnd ? formatRange(r.periodStart, r.periodEnd) : '—'}
              </td>
              <td className="n">
                {r.invoiceId
                  ? <PaidToggle id={r.invoiceId} paid={r.receivedCents !== null} amount={formatUSD(r.receivedCents ?? 0)} />
                  : '—'}
              </td>
              <MetricCells m={r.metrics} />
            </tr>
          ))}
        </tbody>
        <tfoot className="fin-tfoot">
          <tr>
            <td colSpan={4}>Total</td>
            <MetricCells m={total} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function OpexTable({ report }: { report: ReportData }) {
  const { opex } = report
  if (report.meta.gaps.opexTableMissing) {
    return (
      <p className="fin-empty">
        Operating expenses are not set up yet. Run <code>supabase/migration_finance_reporting.sql</code>,
        then add expenses here — until then the profit figures above count advertising and intake only.
      </p>
    )
  }
  if (opex.expenses.length === 0) {
    return <p className="fin-empty">No operating expenses recognised in this range.</p>
  }
  return (
    <div className="fin-scroll">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Vendor</th>
            <th>Description</th>
            <th>Category</th>
            <th>Allocation</th>
            <th className="n">Amount</th>
            <th className="n">In range</th>
          </tr>
        </thead>
        <tbody>
          {opex.expenses.map((e) => (
            <tr key={e.id}>
              <td className="fin-num">{e.expenseDate}</td>
              <td>{e.vendor || '—'}</td>
              <td>{e.description || '—'}</td>
              <td>{OPEX_CATEGORY_LABELS[e.category]}</td>
              <td>
                {e.allocationMethod === 'unallocated'
                  ? 'Company'
                  : e.shares.map((s) => s.firmName).join(', ') || 'Company'}
              </td>
              <td className="n fin-num">{formatUSD(e.amountCents)}</td>
              <td className="n fin-num">{formatUSD(e.recognizedForSelection)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="fin-tfoot">
          <tr>
            <td colSpan={6}>Recognised in range</td>
            <td className="n fin-num">{formatUSD(opex.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/** What the report could not know, said out loud. */
export function DataGaps({ report }: { report: ReportData }) {
  const g = report.meta.gaps
  const notes: string[] = []
  if (g.payRatesMissing)
    notes.push('No pay rates are configured, so intake base pay is counted at the default rate only — commission is unaffected.')
  if (g.sharedAdAccounts > 0)
    notes.push(
      `${g.sharedAdAccounts} ad account${g.sharedAdAccounts === 1 ? ' is' : 's are'} billed by more than one firm. That spend is split between them by invoiced revenue, because nothing inside the account separates the firms.`,
    )
  for (const e of g.errors) notes.push(e)
  if (notes.length === 0) return null
  return (
    <div className="fin-warn fin-sec">
      <strong>What these figures cannot see</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </div>
  )
}

/* The earn-out. Deliberately apart from operating profit: it is what a
   contract says is owed, computed from whatever that contract deducts,
   and reading it as the company's margin would be a category error. */
export function EarnoutCard({ report }: { report: ReportData }) {
  const e = report.earnout
  if (!e) return null
  return (
    <div className="fin-bars">
      <div className="fin-bar-top">
        <span>Revenue in range</span>
        <span className="fin-num">{formatUSD(e.revenue)}</span>
      </div>
      {e.deductions.map((d) => (
        <div key={d.label} className="fin-bar-top">
          <span className="fin-bar-sub">less {d.label}</span>
          <span className="fin-num fin-bar-sub">−{formatUSD(d.cents)}</span>
        </div>
      ))}
      <div className="fin-bar-top" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <span>Contractual metric</span>
        <span className="fin-num">{formatUSD(e.metric)}</span>
      </div>
      <div className="fin-bar-top">
        <span>
          Earn-out at {(e.config.rateBps / 100).toFixed(2)}%
          {e.config.agreementReference && <span className="fin-bar-sub"> · {e.config.agreementReference}</span>}
        </span>
        <span className="fin-num" style={{ fontWeight: 600 }}>{formatUSD(e.amount)}</span>
      </div>
    </div>
  )
}

/* ── Full period comparison ────────────────────────────────────────────
   Every metric, not just revenue, for each of the five windows. The strip
   above answers "is revenue up"; this answers "why". Each row compares
   equal-length windows ending on the report's end date, which is what
   makes a partial month comparable to the same partial month before it. */

const CMP_ROWS: { key: keyof Metrics; label: string; lowerIsBetter?: boolean; strong?: boolean }[] = [
  { key: 'revenue', label: 'Recognised revenue', strong: true },
  { key: 'advertising', label: 'Advertising', lowerIsBetter: true },
  { key: 'intake', label: 'Intake / worker cost', lowerIsBetter: true },
  { key: 'opex', label: 'Operating expenses', lowerIsBetter: true },
  { key: 'totalSpend', label: 'Total spend', lowerIsBetter: true, strong: true },
  { key: 'profit', label: 'Operating profit', strong: true },
  { key: 'margin', label: 'Operating margin', strong: true },
]

export function ComparisonTable({ report }: { report: ReportData }) {
  return (
    <div style={{ display: 'grid', gap: 18, padding: '14px 16px 16px' }}>
      {report.periodComparisons.map((row) => (
        <div key={row.key}>
          <div className="fin-bar-top" style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>
              {row.label}
              <span className="fin-bar-sub">
                {' '}· {row.current.label}{row.current.partial && ' (partial)'} vs {row.previous.label}
              </span>
            </span>
            {!row.dataComplete && <span className="fin-pill flag">prior window predates the data</span>}
          </div>
          <div className="fin-scroll">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="n">Current</th>
                  <th className="n">Previous</th>
                  <th className="n">Change</th>
                  <th className="n">% / pp</th>
                </tr>
              </thead>
              <tbody>
                {CMP_ROWS.map((m) => {
                  const cur = row.currentMetrics[m.key] as number | null
                  const prev = row.previousMetrics[m.key] as number | null
                  const isMargin = m.key === 'margin'
                  if (cur === null && prev === null) return null
                  const diff = (cur ?? 0) - (prev ?? 0)
                  const pct = isMargin ? null : pctChange(cur ?? 0, prev ?? 0)
                  const good = m.lowerIsBetter ? -diff : diff
                  return (
                    <tr key={m.key}>
                      <td style={{ fontWeight: m.strong ? 600 : 400 }}>{m.label}</td>
                      <td className="n fin-num">{isMargin ? formatPct(cur) : formatUSD(cur ?? 0)}</td>
                      <td className="n fin-num">{isMargin ? formatPct(prev) : formatUSD(prev ?? 0)}</td>
                      <td className={`n fin-num ${tone(good)}`}>
                        {isMargin
                          ? `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} pp`
                          : formatUSD(diff, { signed: true })}
                      </td>
                      <td className={`n fin-num ${tone(m.lowerIsBetter && pct !== null ? -pct : pct)}`}>
                        {isMargin ? '—' : prev === 0 ? '—' : formatPct(pct, { signed: true })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="fin-bar-sub" style={{ marginTop: 5 }}>{row.method}</p>
        </div>
      ))}
    </div>
  )
}

/* Operating expenses by category, as a share of the total recognised in
   this range. Separate from the cost breakdown above, which answers where
   the money went across all three cost kinds; this one is only the
   overhead, which is the part anybody can actually act on this month. */
export function OpexByCategory({ report }: { report: ReportData }) {
  const by = report.opex.byCategory
  if (!by) return <p className="fin-empty">Category breakdown is not available for a single invoice.</p>
  const rows = (Object.entries(by) as [OpexCategory, number][])
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1])
  if (rows.length === 0) return <p className="fin-empty">No operating expenses in this range.</p>

  const total = rows.reduce((a, [, v]) => a + v, 0)
  return (
    <div className="fin-bars">
      {rows.map(([cat, cents]) => (
        <div key={cat} className="fin-bar-row">
          <div className="fin-bar-top">
            <span>{OPEX_CATEGORY_LABELS[cat]}</span>
            <span className="fin-num">
              {formatUSD(cents)}
              <span className="fin-bar-sub"> · {formatPct((cents / total) * 100)}</span>
            </span>
          </div>
          <div className="fin-bar-track">
            <div className="fin-bar-fill opex" style={{ width: `${(cents / total) * 100}%` }} />
          </div>
        </div>
      ))}
      <div className="fin-bar-top" style={{ borderTop: '1px solid var(--line)', paddingTop: 9 }}>
        <span>Allocated to firms</span>
        <span className="fin-num">{formatUSD(report.opex.allocated)}</span>
      </div>
      <div className="fin-bar-top">
        <span className="fin-bar-sub">Company-level (unallocated)</span>
        <span className="fin-num fin-bar-sub">{formatUSD(report.opex.unallocated)}</span>
      </div>
      {report.opex.pctOfRevenue !== null && (
        <p className="fin-bar-sub">
          {formatPct(report.opex.pctOfRevenue)} of revenue
          {report.opex.pctChange !== null && ` · ${formatPct(report.opex.pctChange, { signed: true })} vs the comparison period`}
        </p>
      )}
    </div>
  )
}
