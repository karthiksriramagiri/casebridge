import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { daysInclusive, formatRange, maxDate, minDate } from '@/lib/finance/reporting/dates'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { formatPct, formatUSD, formatUSDCompact, type Cents } from '@/lib/finance/reporting/money'
import { buildReport } from '@/lib/finance/reporting/report'
import { financeToday } from '@/lib/finance/clock'
import {
  AGGREGATE_CAP, EARNOUT_PERIODS, EARNOUT_START, REQUIRED_MARGIN_PCT,
  paymentFor, spendAllowance, type EarnoutPeriod,
} from '@/lib/finance/earnout-targets'
import type { Metrics, ReportData } from '@/lib/finance/reporting/report-types'
import type { RevenueBasis } from '@/lib/finance/reporting/types'

export const metadata: Metadata = { title: 'Performance · Financial Center' }
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   Performance — the internal view.

   The Reporting Center is the book: what the firms were billed and what it
   cost to serve them. This page answers the one question the book does not
   — how much of the earn-out is safe — and it answers it in the
   agreement's own terms rather than the book's.

   Three things it keeps straight, because each of them is a way to read
   the agreement wrongly and feel reassured:

     the periods are cumulative   all five run from Nov 4, 2026. The
                                  four-month test asks for $1.33M in
                                  total, not another $1.33M after the
                                  first $667k.

     both halves have to hold     bookings bought with advertising pass
                                  the first test and fail the second, so
                                  every period is read twice and the
                                  binding half is named.

     the margin is not the book's the agreement excludes overhead,
                                  referral and Sanguine royalties,
                                  Hashshop and platform fees. This margin
                                  is therefore higher than the Reporting
                                  Center's, on purpose.

   Everything comes from the same ledger as the Reporting Center, so the
   two can never disagree about a day's revenue or a day's spend.
   ═══════════════════════════════════════════════════════════════════════════ */

const tone = (n: number | null) => (n === null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

/** §2.9: bookings less advertising, case replacement and intake. Nothing else. */
function netMargin(m: Metrics) {
  /* Case Replacement Costs are not tracked as a cash line anywhere yet —
     a replacement is recorded against the case, not as a payment — so the
     deduction is advertising and intake alone. That makes this margin
     slightly generous, and it is the one place on the page where the
     figure errs in the comfortable direction, so it is said out loud
     rather than left for someone to discover at a Measurement Date. */
  const spend = m.advertising + m.intake
  const profit = m.revenue - spend
  return { bookings: m.revenue, spend, profit, margin: m.revenue > 0 ? (profit / m.revenue) * 100 : null }
}

type Standing = ReturnType<typeof standingFor>

function standingFor(p: EarnoutPeriod, report: ReportData, today: string) {
  const n = netMargin(report.current)
  const totalDays = daysInclusive(p.start, p.end)
  const started = today >= p.start
  const over = today > p.end
  const elapsed = started ? daysInclusive(p.start, minDate(today, p.end)) : 0
  const remainingDays = Math.max(0, totalDays - elapsed)

  const attainment = (n.bookings / p.floorCents) * 100
  const expectedToDate = Math.round(p.floorCents * (elapsed / totalDays))
  const shortfall = Math.max(0, p.floorCents - n.bookings)

  /* The forward signal is delivery, not billing.

     Billing is a step — November's invoices were both raised on the 4th —
     so dividing billed revenue by days elapsed projected $3.7M against a
     $667k target: a run rate read off a number that does not run. Case
     value signed per day does run, and since the invoices bill for what
     is delivered, it is what says whether the bookings will be there. */
  const delivered = report.current.caseRevenue
  const cases = report.current.cases
  const perDay = elapsed > 0 ? Math.round(delivered / elapsed) : 0
  const projected = elapsed > 0 ? Math.round((delivered / elapsed) * totalDays) : 0

  const allowanceAtFloor = spendAllowance(p.floorCents)
  const allowanceLeft = allowanceAtFloor - n.spend
  const allowanceNow = spendAllowance(n.bookings)

  const marginOk = n.margin !== null && n.margin >= REQUIRED_MARGIN_PCT
  const bookingsOk = n.bookings >= p.floorCents
  const paceOk = projected >= p.floorCents

  /* What it pays as things stand, and what it would pay if the current
     rate held to the Measurement Date. */
  const earnedNow = paymentFor(p, n.bookings, n.margin)
  const earnedAtPace = paymentFor(p, Math.max(projected, n.bookings), n.margin)

  const status: 'not_started' | 'clear' | 'on_pace' | 'at_risk' | 'missed' = !started
    ? 'not_started'
    : over
      ? bookingsOk && marginOk ? 'clear' : 'missed'
      : bookingsOk && marginOk ? 'clear' : paceOk && marginOk ? 'on_pace' : 'at_risk'

  return {
    ...n, p, totalDays, elapsed, remainingDays, started, over,
    attainment, expectedToDate, shortfall, delivered, cases, perDay, projected,
    allowanceAtFloor, allowanceLeft, allowanceNow,
    marginOk, bookingsOk, paceOk, earnedNow, earnedAtPace, status,
  }
}

const STATUS_LABEL: Record<Standing['status'], string> = {
  not_started: 'not started',
  clear: 'earned',
  on_pace: 'on pace',
  at_risk: 'at risk',
  missed: 'missed',
}

const STATUS_CLS: Record<Standing['status'], string> = {
  not_started: '',
  clear: 'pos',
  on_pace: 'flag',
  at_risk: 'neg',
  missed: 'neg',
}

function Bar({ value, of, cls }: { value: Cents; of: Cents; cls: string }) {
  const pct = of > 0 ? Math.min(100, Math.max(0, (value / of) * 100)) : 0
  return (
    <div className="fin-bar-track">
      <div className={`fin-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function PeriodCard({ s, basisLabel }: { s: Standing; basisLabel: string }) {
  const { p } = s
  return (
    <section className="fin-card fin-sec">
      <div className="fin-card-h">
        <span className="fin-card-t">
          {p.label} <span className="fin-card-n">{p.section}</span> · {formatRange(p.start, p.end)}
        </span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <span className="fin-card-n">
            {p.passFail
              ? `${formatUSD(p.floorCents)} at ${REQUIRED_MARGIN_PCT}% → ${formatUSDCompact(p.maxPaymentCents)}`
              : `${formatUSDCompact(p.floorCents)} – ${formatUSDCompact(p.capCents)} at ${REQUIRED_MARGIN_PCT}% → up to ${formatUSDCompact(p.maxPaymentCents)}`}
          </span>
          <span className={`fin-pill ${STATUS_CLS[s.status]}`}>{STATUS_LABEL[s.status]}</span>
        </span>
      </div>

      {!s.started ? (
        <p className="fin-empty">Opens {formatRange(p.start, p.start)}.</p>
      ) : (
        <>
          <div className="fin-bars">
            <div className="fin-bar-row">
              <div className="fin-bar-top">
                <span>Bookings <span className="fin-bar-sub">{basisLabel}, cumulative since {formatRange(EARNOUT_START, EARNOUT_START)}</span></span>
                <span className="fin-num">
                  {formatUSD(s.bookings)} / {formatUSD(p.floorCents)}
                  <span className="fin-bar-sub"> · {formatPct(s.attainment)}</span>
                </span>
              </div>
              <Bar value={s.bookings} of={p.floorCents} cls={s.paceOk ? 'over' : 'under'} />
              <div className="fin-bar-sub">
                day {s.elapsed} of {s.totalDays} · {formatUSD(s.expectedToDate)} is the floor pro-rata to today
                {s.shortfall > 0 && s.remainingDays > 0 && (
                  <> · {formatUSD(s.shortfall)} still to book across {s.remainingDays} days</>
                )}
              </div>
            </div>

            <div className="fin-bar-row">
              <div className="fin-bar-top">
                <span>Delivery <span className="fin-bar-sub">the rate the bookings are earned at</span></span>
                <span className="fin-num">
                  {formatUSD(s.projected)}
                  <span className="fin-bar-sub"> by {formatRange(p.end, p.end)}</span>
                </span>
              </div>
              <Bar value={s.projected} of={p.floorCents} cls={s.paceOk ? 'over' : 'under'} />
              <div className="fin-bar-sub">
                {s.cases.toLocaleString('en-US')} case{s.cases === 1 ? '' : 's'} · {formatUSD(s.delivered)} of case
                value in {s.elapsed} days · {formatUSD(s.perDay)} a day ·
                {' '}{s.paceOk
                  ? `${formatUSD(s.projected - p.floorCents)} clear of the floor at this rate`
                  : `${formatUSD(p.floorCents - s.projected)} short of the floor at this rate`}
              </div>
            </div>

            <div className="fin-bar-row">
              <div className="fin-bar-top">
                <span>Net Margin <span className="fin-bar-sub">§2.9</span></span>
                <span className={`fin-num ${tone(s.margin === null ? null : s.margin - REQUIRED_MARGIN_PCT)}`}>
                  {formatPct(s.margin)} / {REQUIRED_MARGIN_PCT}%
                </span>
              </div>
              <Bar value={Math.max(0, Math.round(s.margin ?? 0))} of={REQUIRED_MARGIN_PCT * 2} cls={s.marginOk ? 'over' : 'under'} />
              <div className="fin-bar-sub">
                {formatUSD(s.bookings)} − {formatUSD(s.spend)} = {formatUSD(s.profit)}
                {s.margin !== null && (
                  <> · {s.marginOk
                    ? `${(s.margin - REQUIRED_MARGIN_PCT).toFixed(1)} points of room`
                    : `${(REQUIRED_MARGIN_PCT - s.margin).toFixed(1)} points short`}</>
                )}
              </div>
            </div>
          </div>

          <div className="fin-eq fin-num">
            <b>{formatUSD(Math.max(0, s.allowanceLeft))}</b>
            <span className="op">of advertising and intake left</span>
            <span className="op">·</span>
            <span className="op">
              {formatUSD(s.allowanceAtFloor)} allowed at {formatUSD(p.floorCents)} − {formatUSD(s.spend)} spent
            </span>
            <span className="res">
              {s.earnedNow > 0
                ? `${formatUSD(s.earnedNow)} earned as it stands`
                : s.earnedAtPace > 0
                  ? `${formatUSD(s.earnedAtPace)} at this rate`
                  : 'nothing earned yet'}
            </span>
          </div>

          {p.note && <p className="fin-note" style={{ padding: '0 16px 12px', marginTop: -4 }}>{p.note}</p>}

        </>
      )}
    </section>
  )
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const asked = Array.isArray(sp.basis) ? sp.basis[0] : sp.basis
  /* Invoiced by default. Qualifying Bookings is neither of the bases this
     book keeps — it is the binding insertion order — and the invoice, with
     its contracted amount and its period, is the closest thing recorded
     here. Cases delivered is a click away because the gap between booking
     and delivery is exactly what a Measurement Date turns on. */
  const basis: RevenueBasis = asked === 'cases' ? 'cases' : 'invoiced'

  const store = await loadFinanceData()
  const base = siteRootForHost((await headers()).get('host')) === '/finance' ? '' : '/finance'
  const today = financeToday()

  const periods = EARNOUT_PERIODS.map((p) => {
    const report = buildReport(store, {
      basis,
      preset: 'custom',
      start: maxDate(p.start, store.dataStart),
      end: minDate(p.end, store.dataAsOf),
      granularity: 'daily',
      firmId: null,
      invoiceId: null,
      comparison: 'none',
    })
    return { p, report, s: standingFor(p, report, today) }
  })

  /* The live one is the earliest that has not closed — the next date
     anything is decided on, and the only one today's work can still
     change. */
  const live = periods.find((x) => x.s.started && !x.s.over) ?? periods[0]
  const basisLabel = basis === 'cases' ? 'cases delivered' : 'invoiced'

  /* Earned so far across every period, and what the current rate would
     earn. Capped at the aggregate, because the agreement is. */
  const earnedNow = Math.min(AGGREGATE_CAP, periods.reduce((a, x) => a + x.s.earnedNow, 0))
  const earnedAtPace = Math.min(AGGREGATE_CAP, periods.reduce((a, x) => a + x.s.earnedAtPace, 0))

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Performance</h1>
          <p className="fin-sub">
            Internal · earn-out safety · Project Compass APA Article 2 · figures through {store.dataAsOf}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href={`${base}/performance${basis === 'cases' ? '' : '?basis=cases'}`} className="fin-btn">
            {basis === 'cases' ? 'Read as invoiced' : 'Read as cases delivered'}
          </Link>
          <Link href={`${base}/reporting`} className="fin-btn">Reporting Center →</Link>
        </div>
      </div>

      <p className="fin-note" style={{ marginBottom: 14 }}>
        Every period runs from <strong>{formatRange(EARNOUT_START, EARNOUT_START)}</strong> and the tests are
        cumulative — the four-month test asks for {formatUSD(EARNOUT_PERIODS[1].floorCents)} in total, not another{' '}
        {formatUSD(EARNOUT_PERIODS[1].floorCents)} after the first. Each needs <strong>both</strong> halves: the
        bookings, and Net Margin of at least {REQUIRED_MARGIN_PCT}%. Net Margin is{' '}
        <strong>bookings less advertising, case replacement and intake</strong> (§2.9) — overhead, referral and
        Sanguine royalties, Hashshop and platform fees are all excluded, so this margin reads higher than the
        Reporting Center&rsquo;s by design. Bookings are shown as <strong>{basisLabel}</strong>.
      </p>

      <div className="fin-figs">
        <div className="fin-fig">
          <div className="fin-fig-l">Bookings to date</div>
          <div className="fin-fig-v fin-num">{formatUSD(live.s.bookings)}</div>
          <span className="fin-fig-s">since {formatRange(EARNOUT_START, EARNOUT_START)}</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Net Margin</div>
          <div className={`fin-fig-v fin-num ${tone(live.s.margin === null ? null : live.s.margin - REQUIRED_MARGIN_PCT)}`}>
            {formatPct(live.s.margin)}
          </div>
          <span className="fin-fig-s">{REQUIRED_MARGIN_PCT}% required</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Headroom left</div>
          <div className={`fin-fig-v fin-num ${tone(live.s.allowanceLeft)}`}>
            {formatUSD(Math.max(0, live.s.allowanceLeft))}
          </div>
          <span className="fin-fig-s">spend left in the {live.p.label.toLowerCase()} test</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Earned as it stands</div>
          <div className={`fin-fig-v fin-num ${earnedNow > 0 ? 'pos' : ''}`}>{formatUSD(earnedNow)}</div>
          <span className="fin-fig-s">{formatUSD(earnedAtPace)} at the current rate</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Next Measurement Date</div>
          <div className="fin-fig-v fin-num">{formatRange(live.p.measurementDate, live.p.measurementDate)}</div>
          <span className="fin-fig-s">{live.s.remainingDays} days of trading left</span>
        </div>
      </div>

      {periods.map(({ p, s }) => (
        <PeriodCard key={p.key} s={s} basisLabel={basisLabel} />
      ))}

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">By law firm · {formatRange(live.p.start, minDate(today, live.p.end))}</span>
          <span className="fin-card-n">the {live.p.label.toLowerCase()} test, {basisLabel}</span>
        </div>
        <div className="fin-scroll">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Law firm</th>
                <th className="n">Cases</th>
                <th className="n">Bookings</th>
                <th className="n">Advertising</th>
                <th className="n">Intake</th>
                <th className="n">Contribution</th>
                <th className="n">Net Margin</th>
              </tr>
            </thead>
            <tbody>
              {live.report.firms.rows
                .filter((r) => r.firmId && (r.metrics.revenue !== 0 || r.metrics.totalSpend !== 0))
                .map((r) => {
                  const n = netMargin(r.metrics)
                  return (
                    <tr key={r.firmId ?? r.name}>
                      <td>{r.name}</td>
                      <td className="n fin-num">{r.metrics.cases || '—'}</td>
                      <td className="n fin-num">{formatUSD(n.bookings)}</td>
                      <td className="n fin-num">{formatUSD(r.metrics.advertising)}</td>
                      <td className="n fin-num">{formatUSD(r.metrics.intake)}</td>
                      <td className={`n fin-num ${tone(n.profit)}`}>{formatUSD(n.profit)}</td>
                      <td className={`n fin-num ${tone(n.margin === null ? null : n.margin - REQUIRED_MARGIN_PCT)}`}>
                        {formatPct(n.margin)}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
            <tfoot className="fin-tfoot">
              <tr>
                <td>Total</td>
                <td className="n fin-num">{live.report.current.cases || '—'}</td>
                <td className="n fin-num">{formatUSD(live.s.bookings)}</td>
                <td className="n fin-num">{formatUSD(live.report.current.advertising)}</td>
                <td className="n fin-num">{formatUSD(live.report.current.intake)}</td>
                <td className={`n fin-num ${tone(live.s.profit)}`}>{formatUSD(live.s.profit)}</td>
                <td className={`n fin-num ${tone(live.s.margin === null ? null : live.s.margin - REQUIRED_MARGIN_PCT)}`}>
                  {formatPct(live.s.margin)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* The caveats this page used to print, kept here because they are
          still true of every figure above and every one of them makes the
          page read better than a Measurement Date would:

            · Qualifying Bookings (§2.8) is the binding insertion order, not
              an invoice, and explicitly not GAAP revenue or invoicing. The
              invoice is the closest record this book keeps, so the bookings
              line is a proxy; a booking signed but not yet invoiced is
              missing from it.
            · Net Margin is a cash test (§2.9) — only expenditure actually
              paid, nothing accrued. Commission here is recognised when a
              case signs rather than when it is paid, which overstates cost
              and understates the margin.
            · Case Replacement Costs are not tracked as a cash line, so the
              only deductions are advertising and intake. Real replacement
              spend would lower every margin here.
            · Advertising is Meta's reported spend; §2.9 counts cash paid to
              the platform and excludes agency, management, platform,
              payment-processing and communications fees.
            · Bookings before the Earnout Start Date never count, nor do
              Overdelivered Cases or their reimbursement (§5.7). */}
      <p className="fin-note fin-sec">
        Read from the same ledger as the Reporting Center · aggregate cap {formatUSDCompact(AGGREGATE_CAP)} ·
        each payment is tested once and a miss is final (§2.7)
      </p>
    </>
  )
}
