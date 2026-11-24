import Link from 'next/link'
import { PaidToggle } from './paid-toggle'
import { formatDay, formatRange } from '@/lib/finance/reporting/dates'
import { formatPct, formatUSD, formatUSDCompact, pctChange, type Cents } from '@/lib/finance/reporting/money'
import type { Metrics, ReportData, TrendPoint } from '@/lib/finance/reporting/report-types'
import type { InvoiceProjection, ProjectionSummary } from '@/lib/finance/reporting/projection'
import { OPEX_CATEGORY_LABELS, type OpexCategory } from '@/lib/finance/reporting/types'
import { SANGUINE_PER_CASE } from '@/lib/finance/sanguine'

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

const caseCount = (n: number) => `${n.toLocaleString('en-US')} case${n === 1 ? '' : 's'}`

export function KpiCards({ report }: { report: ReportData }) {
  const prev = report.comparison?.metrics ?? null
  const m = report.current
  const onCases = report.meta.filters.basis === 'cases'
  /* What a cost is as a share of the revenue it was spent to earn. Beside
     the figure rather than under it: a cost is read against revenue every
     time, and making the reader do that division themselves is how two
     people end up with two different ideas of whether $90k of ads was a
     lot. Null revenue has no share — a percentage of nothing is not 0%. */
  const shareOfRevenue = (cents: Cents) =>
    m.revenue > 0 ? formatPct((cents / m.revenue) * 100) : undefined
  const cards: {
    label: string
    value: string
    /** The figure's own unit of meaning, set beside it: a count, a share. */
    suffix?: string
    cls?: string
    prev: Cents | null
    cur: Cents
    invert?: boolean
  }[] = [
    {
      label: 'Revenue',
      value: formatUSD(m.revenue),
      /* The count, on the basis that is made of counts. On the invoiced
         basis the cases are still delivered but they are not what this
         figure is — pairing them would read as $612,500 from 70 cases. */
      suffix: onCases ? caseCount(m.cases) : undefined,
      cur: m.revenue,
      prev: prev?.revenue ?? null,
    },
    {
      label: 'Advertising',
      value: formatUSD(m.advertising),
      suffix: shareOfRevenue(m.advertising),
      cur: m.advertising,
      prev: prev?.advertising ?? null,
      invert: true,
    },
    {
      label: 'Intake cost',
      value: formatUSD(m.intake),
      suffix: shareOfRevenue(m.intake),
      cur: m.intake,
      prev: prev?.intake ?? null,
      invert: true,
    },
    /* Overhead and the royalty appear only when the report was built with
       them. Both have always been inside profit when present; showing
       them is what lets a reader get from revenue to profit without
       finding a gap they cannot name. A zero card for a cost the company
       does not carry is noise, so neither renders at zero. */
    ...(m.opex > 0
      ? [{
          label: 'Operating expenses',
          value: formatUSD(m.opex),
          suffix: shareOfRevenue(m.opex),
          cur: m.opex,
          prev: prev?.opex ?? null,
          invert: true,
        }]
      : []),
    ...(m.sanguine > 0
      ? [{
          label: 'Sanguine',
          value: formatUSD(m.sanguine),
          suffix: `${m.cases.toLocaleString('en-US')} × ${formatUSD(SANGUINE_PER_CASE)}`,
          cur: m.sanguine,
          prev: prev?.sanguine ?? null,
          invert: true,
        }]
      : []),
    {
      label: 'Profit',
      value: formatUSD(m.profit),
      cls: m.profit > 0 ? 'pos' : m.profit < 0 ? 'neg' : '',
      cur: m.profit,
      prev: prev?.profit ?? null,
    },
  ]
  /* Cost per acquisition sits apart from the cards above because it is not
     scoped to the range they are: ad spend and the case it buys are weeks
     apart, so a day's ads over a day's cases is two unrelated numbers
     divided by each other. It runs from the day cost tracking began. */
  const cpa = report.cpa

  return (
    <>
      <div className="fin-figs">
        {cards.map((c) => (
          <div key={c.label} className="fin-fig">
            <div className="fin-fig-l">{c.label}</div>
            <div className={`fin-fig-v fin-num ${c.cls ?? ''}`}>
              {c.value}
              {c.suffix && <span className="fin-fig-x">{c.suffix}</span>}
            </div>
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

        {/* CPA. Advertising over cases and nothing else — what it cost to
            buy a case, not what the case cost to run, which is a different
            question the intake and profit figures already answer.

            Its window is the one thing on this row that is not the report's:
            ad spend and the case it buys are weeks apart, so a day's ads
            over a day's cases is two unrelated numbers divided by each
            other. It runs from the day cost tracking began, and the line
            underneath says so. */}
        {cpa && cpa.cases > 0 && (
          <div className="fin-fig">
            <div className="fin-fig-l">CPA</div>
            <div className="fin-fig-v fin-num">{cpa.cpa === null ? '—' : formatUSD(cpa.cpa)}</div>
            <span className="fin-fig-s">
              ads ÷ {cpa.cases} case{cpa.cases === 1 ? '' : 's'} since {formatDay(cpa.since, false)}
            </span>
          </div>
        )}
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
    ...(metrics.opex > 0 ? [{ label: 'Operating expenses', cents: metrics.opex, cls: 'opex' }] : []),
    ...(metrics.sanguine > 0 ? [{ label: 'Sanguine royalty', cents: metrics.sanguine, cls: 'sanguine' }] : []),
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

/* The projection: how much of each invoice has been delivered, and where
   today's pace puts the finish.

   Read as three dates side by side — the day the order was filled, the day
   it is on course to be filled, and the day it was due. Only one of the
   first two is ever set: an invoice that is finished has no projection
   left to make, and one still running has no completion date yet. */
export function ProjectionTable({ rows, unavailable, orphanCodes }: ProjectionSummary) {
  if (unavailable) {
    return (
      <p className="fin-empty">
        Case delivery is not set up yet. Run <code>supabase/migration_invoice_cases.sql</code>,
        then import the firms' case management workbooks with{' '}
        <code>scripts/import-case-workbooks.py</code>.
      </p>
    )
  }
  if (rows.length === 0) return <p className="fin-empty">No invoices in this range.</p>

  const day = (iso: string | null) => (iso ? formatDay(iso, false) : '—')
  /* A range collapses to one date when both readings land on the same day —
     "Dec 8 – Dec 8" says less than "Dec 8" and takes twice the room. */
  const span = (a: string | null, b: string | null) =>
    !a && !b ? '—' : !a || !b || a === b ? day(a ?? b) : `${day(a)} – ${day(b)}`
  const slack = (n: number | null) =>
    n === null ? null : n === 0 ? 'on the last day' : n > 0 ? `${n}d of room` : `${Math.abs(n)}d past`

  return (
    <div className="fin-scroll">
      <table className="fin-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Law firm</th>
            <th className="n">Delivered</th>
            <th className="n">Pace</th>
            <th className="n">Completed</th>
            <th className="n">Expected</th>
            <th className="n">Due within</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.invoiceId}>
              <td>
                {r.number}
                {r.state === 'complete' && <> <span className="fin-tag good">complete</span></>}
                {r.state === 'behind' && <> <span className="fin-tag bad">behind</span></>}
                {r.state === 'at_risk' && <> <span className="fin-tag warn">at risk</span></>}
                {r.state === 'stalled' && <> <span className="fin-tag warn">nothing yet</span></>}
                {r.replacements > 0 && (
                  <div className="fin-fig-s">
                    {r.replacements} replacement{r.replacements === 1 ? '' : 's'}, not counted
                  </div>
                )}
              </td>
              <td>{r.firmName}</td>
              <td className="n">
                <span className="fin-num">
                  {r.delivered.toLocaleString('en-US')}
                  {r.contracted === null ? '' : ` / ${r.contracted.toLocaleString('en-US')}`}
                </span>
                {r.percent !== null && (
                  <div className="fin-bar-track fin-bar-cell">
                    <div
                      className={`fin-bar-fill ${r.state === 'behind' || r.state === 'stalled' ? 'under' : 'over'}`}
                      style={{ width: `${r.percent}%` }}
                    />
                  </div>
                )}
              </td>
              <td className="n fin-num">
                {r.pace ? `${r.pace.toFixed(1)}/day` : '—'}
                {r.paceRecent !== null && (
                  <div className="fin-fig-s">{r.paceRecent.toFixed(1)} this week</div>
                )}
              </td>
              <td className="n fin-num">{day(r.completedOn)}</td>
              <td className="n fin-num">
                {span(r.expectedEarliest, r.expectedLatest)}
                {r.remaining > 0 && r.expectedLatest && (
                  <div className="fin-fig-s">{r.remaining} to go</div>
                )}
              </td>
              <td className="n fin-num">
                {span(r.deadlineStart, r.deadlineEnd)}
                {r.slackDays !== null && (
                  <div className={`fin-fig-s ${r.slackDays >= 0 ? 'pos' : 'neg'}`}>{slack(r.slackDays)}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orphanCodes.length > 0 && (
        <p className="fin-note" style={{ padding: '10px 16px 0' }}>
          Delivery is also recorded for {orphanCodes.join(', ')}, which have no invoice in the book.
          Those cases are counted nowhere above.
        </p>
      )}
    </div>
  )
}

/* One invoice's burn-up: delivery against the order, and where the pace
   leads.

   A burn-up rather than a burn-down. The reader is asking two questions —
   how much is done, and will the line reach the order before the period
   ends — and both are answered by where the curve sits against two straight
   references: the order across the top, and the due date down the side. A
   countdown to zero hides the second of them. */
export function ProjectionChart({ row }: { row: InvoiceProjection }) {
  const { points, contracted } = row
  if (points.length === 0 || contracted === null) {
    return <p className="fin-empty">Nothing to project — this invoice names no case count.</p>
  }

  const W = 560
  const H = 230
  /* Room on the right for the due marker's label, which sits on the last
     point whenever the period ends before the pace gets there. */
  const PAD = { l: 38, r: 26, t: 14, b: 30 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b

  const top = Math.max(contracted, row.delivered, 1)
  const x = (i: number) => PAD.l + (iw * i) / Math.max(1, points.length - 1)
  const y = (v: number) => PAD.t + ih - (v / top) * ih

  const path = (key: 'delivered' | 'projectedFast' | 'projectedSlow') => {
    let d = ''
    points.forEach((p, i) => {
      const v = p[key]
      if (v === null) return
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  }

  /* The cone between the two readings of the pace, closed into one shape:
     fast edge out, slow edge back. Where the finish actually falls is
     somewhere inside it, and a filled band says that better than two lines
     the reader has to mentally join. */
  const cone = (() => {
    const fast = points.map((p, i) => [i, p.projectedFast] as const).filter(([, v]) => v !== null)
    const slow = points.map((p, i) => [i, p.projectedSlow] as const).filter(([, v]) => v !== null)
    if (fast.length < 2 || slow.length < 2) return ''
    const out = fast.map(([i, v]) => `${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
    const back = [...slow].reverse().map(([i, v]) => `${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
    return [...out, ...back].join(' ')
  })()

  const idxOf = (iso: string | null) => (iso ? points.findIndex((p) => p.date === iso) : -1)
  const dueStartIdx = idxOf(row.deadlineStart)
  const dueEndIdx = idxOf(row.deadlineEnd)
  const doneIdx = idxOf(row.completedOn ?? row.expectedLatest)
  const late = row.slackDays !== null && row.slackDays < 0

  /* Six labels at most, and never two on top of each other: the final date
     is worth naming, but only if the last stepped label is not already
     sitting on it. */
  const step = Math.max(1, Math.ceil(points.length / 6))
  const ticks = new Set<number>()
  for (let i = 0; i < points.length; i += step) ticks.add(i)
  const last = points.length - 1
  if (last - Math.max(...ticks) >= step / 2) ticks.add(last)
  else { ticks.delete(Math.max(...ticks)); ticks.add(last) }

  return (
    <>
      <div className="fin-chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="fin-chart burn" role="img"
             aria-label={`${row.number}: ${row.delivered} of ${contracted} cases delivered`}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * f} y2={PAD.t + ih * f}
                    stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.l - 7} y={PAD.t + ih * f + 3.5} textAnchor="end">
                {Math.round(top * (1 - f))}
              </text>
            </g>
          ))}

          {/* The order: the line the curve has to reach. */}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(contracted)} y2={y(contracted)}
                stroke="var(--ink-3)" strokeWidth="1.2" strokeDasharray="2 3" />

          {/* The delivery window, kickoff + 30 to + 35 days. A band rather
              than a line: the commitment is to land inside it, and a single
              rule would say the 31st day was as late as the 40th. */}
          {dueStartIdx >= 0 && dueEndIdx >= 0 && (
            <>
              <rect x={x(dueStartIdx)} y={PAD.t} width={Math.max(1, x(dueEndIdx) - x(dueStartIdx))} height={ih}
                    fill="var(--ink-3)" opacity="0.1" />
              <line x1={x(dueEndIdx)} x2={x(dueEndIdx)} y1={PAD.t} y2={PAD.t + ih}
                    stroke={late ? 'var(--neg)' : 'var(--line-2)'} strokeWidth="1.2" />
              <text x={Math.min(x(dueEndIdx), W - PAD.r)} y={PAD.t - 4}
                    textAnchor={dueEndIdx >= points.length - 2 ? 'end' : 'middle'}
                    className="fin-chart-pin">due</text>
            </>
          )}

          {cone && (
            <polygon points={cone} fill={late ? 'var(--neg)' : 'var(--pos)'} opacity="0.13" />
          )}
          <path d={path('projectedSlow')} fill="none" stroke={late ? 'var(--neg)' : 'var(--pos)'}
                strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" />
          <path d={path('projectedFast')} fill="none" stroke={late ? 'var(--neg)' : 'var(--pos)'}
                strokeWidth="1.6" strokeDasharray="4 3" strokeLinejoin="round" opacity="0.6" />
          <path d={path('delivered')} fill="none" stroke="var(--ink)"
                strokeWidth="2" strokeLinejoin="round" />

          {/* Where it lands, actual or projected. */}
          {doneIdx >= 0 && (
            <circle cx={x(doneIdx)} cy={y(contracted)} r="3.4" fill="var(--card)"
                    stroke={row.completedOn ? 'var(--pos)' : late ? 'var(--neg)' : 'var(--pos)'} strokeWidth="2">
              <title>
                {row.completedOn
                  ? `filled ${row.completedOn}`
                  : `projected ${row.expectedEarliest} – ${row.expectedLatest}`}
              </title>
            </circle>
          )}

          {points.map((p, i) =>
            ticks.has(i) ? (
              <text key={p.date} x={x(i)} y={H - 10}
                    textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>
                {formatDay(p.date, false)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <div className="fin-legend">
        <span><i style={{ background: 'var(--ink)' }} />Delivered</span>
        <span><i style={{ background: late ? 'var(--neg)' : 'var(--pos)', opacity: 0.5 }} />Projected range</span>
        <span><i style={{ background: 'var(--ink-3)' }} />Order of {contracted}</span>
        <span><i style={{ background: 'var(--ink-3)', opacity: 0.25 }} />Due day 30–35</span>
      </div>
    </>
  )
}

function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td className="n fin-num">{formatUSD(m.revenue)}</td>
      <td className="n fin-num">{formatUSD(m.advertising)}</td>
      <td className="n fin-num">{formatUSD(m.intake)}</td>
      <td className={`n fin-num ${tone(m.profit)}`}>{formatUSD(m.profit)}</td>
      <td className={`n fin-num ${tone(m.margin)}`}>{formatPct(m.margin)}</td>
    </>
  )
}

const HEAD = ['Revenue', 'Advertising', 'Intake', 'Profit', 'Margin']

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

const CMP_ROWS: {
  key: keyof Metrics
  label: string
  lowerIsBetter?: boolean
  strong?: boolean
  /** A cost the report may not carry at all — hidden rather than shown as $0. */
  optional?: boolean
}[] = [
  { key: 'revenue', label: 'Recognised revenue', strong: true },
  { key: 'advertising', label: 'Advertising', lowerIsBetter: true },
  { key: 'intake', label: 'Intake / worker cost', lowerIsBetter: true },
  { key: 'opex', label: 'Operating expenses', lowerIsBetter: true, optional: true },
  { key: 'sanguine', label: 'Sanguine royalty', lowerIsBetter: true, optional: true },
  { key: 'totalSpend', label: 'Total spend', lowerIsBetter: true, strong: true },
  { key: 'profit', label: 'Operating profit', strong: true },
  { key: 'margin', label: 'Operating margin', strong: true },
]

export function ComparisonTable({ report }: { report: ReportData }) {
  return (
    <div style={{ display: 'grid' }}>
      {report.periodComparisons.map((row, i) => {
        const pct = pctChange(row.currentMetrics.revenue, row.previousMetrics.revenue)
        return (
          /* Closed by default. Five tables of seven rows each is thirty-five
             figures nobody asked for; the summary line carries the answer
             and the table is there for whoever wants the working. The month
             is open to start because it is the one most often wanted. */
          <details key={row.key} open={row.key === 'mom'} className="fin-cmp">
            <summary className="fin-cmp-s">
              <span className="fin-cmp-k">{row.label}</span>
              <span className="fin-cmp-w">
                {row.current.label}{row.current.partial && ' (partial)'} vs {row.previous.label}
              </span>
              <span className={`fin-cmp-v fin-num ${tone(pct)}`}>
                {formatUSDCompact(row.currentMetrics.revenue)}
                {pct !== null && <span className="fin-cmp-d"> {formatPct(pct, { signed: true })}</span>}
                {pct === null && <span className="fin-cmp-d"> {row.dataComplete ? 'no prior revenue' : 'no prior data'}</span>}
              </span>
            </summary>

            <div style={{ padding: '2px 16px 14px' }}>
              {!row.dataComplete && (
                <p className="fin-bar-sub" style={{ marginBottom: 6 }}>
                  The prior window reaches back before the first data, so the change is overstated.
                </p>
              )}
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
                    {CMP_ROWS.map((mm) => {
                      const cur = row.currentMetrics[mm.key] as number | null
                      const prev = row.previousMetrics[mm.key] as number | null
                      const isMargin = mm.key === 'margin'
                      if (cur === null && prev === null) return null
                      /* Nothing in either window and nothing to say — a
                         row of two zeroes is not an observation. */
                      if (mm.optional && !cur && !prev) return null
                      const diff = (cur ?? 0) - (prev ?? 0)
                      const p = isMargin ? null : pctChange(cur ?? 0, prev ?? 0)
                      const good = mm.lowerIsBetter ? -diff : diff
                      return (
                        <tr key={mm.key}>
                          <td style={{ fontWeight: mm.strong ? 600 : 400 }}>{mm.label}</td>
                          <td className="n fin-num">{isMargin ? formatPct(cur) : formatUSD(cur ?? 0)}</td>
                          <td className="n fin-num">{isMargin ? formatPct(prev) : formatUSD(prev ?? 0)}</td>
                          <td className={`n fin-num ${tone(good)}`}>
                            {isMargin
                              ? `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(1)} pp`
                              : formatUSD(diff, { signed: true })}
                          </td>
                          <td className={`n fin-num ${tone(mm.lowerIsBetter && p !== null ? -p : p)}`}>
                            {isMargin ? '—' : prev === 0 ? '—' : formatPct(p, { signed: true })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="fin-bar-sub" style={{ marginTop: 5 }}>{row.method}</p>
            </div>
          </details>
        )
      })}
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
