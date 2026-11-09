import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { formatRange } from '@/lib/finance/reporting/dates'
import { parseFilters } from '@/lib/finance/reporting/filters'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { formatPct, formatUSD, formatUSDCompact, pctChange } from '@/lib/finance/reporting/money'
import { buildReport } from '@/lib/finance/reporting/report'
import { PaidToggle } from './_components/paid-toggle'
import { invoicePathSegment } from './_lib/invoice-routes'

export const metadata: Metadata = { title: 'Dashboard · Financial Center' }
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The dashboard.

   One question: how is the company doing this month, and what needs
   attention. It is deliberately not the Reporting Center — no range
   picker, no grain, no comparison modes. Somebody opening this wants the
   answer, not the controls to derive it; the Reporting Center is one click
   away for everyone who wants to ask a different question.

   Everything here comes from the same ledger the Reporting Center reads,
   so the two can never disagree.
   ═══════════════════════════════════════════════════════════════════════════ */

const tone = (n: number | null) => (n === null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')

export default async function FinanceDashboard() {
  const store = await loadFinanceData()
  const base = siteRootForHost((await headers()).get('host')) === '/finance' ? '' : '/finance'
  const bounds = { dataStart: store.dataStart, asOf: store.dataAsOf }

  /* This month, and only this month. The dashboard answers how the month
     is going; every other window is a question, and questions belong to
     the Reporting Center. */
  const range = 'mtd'
  /* Invoiced, always. The dashboard is the billing view — what the firms
     were charged for the window. Cases delivered is a different question
     and the Reporting Center is where it is asked. */
  const mtd = buildReport(store, parseFilters({ range, basis: 'invoiced' }, bounds))
  const ytd = buildReport(store, parseFilters({ range: 'ytd', basis: 'invoiced' }, bounds))

  const m = mtd.current
  const prev = mtd.comparison?.metrics ?? null
  const win = mtd.meta.window

  /* What is worth saying out loud. A dashboard that only shows figures
     makes the reader find the problem; these are the three the figures
     are usually hiding. */
  const alerts: { tone: 'neg' | 'flag'; text: string }[] = []
  const unbilled = ytd.firms.rows.filter((r) => r.metrics.revenue === 0 && r.metrics.totalSpend > 0)
  if (unbilled.length > 0) {
    alerts.push({
      tone: 'neg',
      text: `${unbilled.map((r) => r.name).join(', ')} ${unbilled.length === 1 ? 'has' : 'have'} ${formatUSD(
        unbilled.reduce((a, r) => a + r.metrics.totalSpend, 0),
      )} of cost this year against no invoiced revenue.`,
    })
  }
  const unattributed = ytd.invoices.rows.find((r) => r.kind !== 'invoice')
  if (unattributed && unattributed.metrics.totalSpend > 0) {
    alerts.push({
      tone: 'flag',
      text: `${formatUSD(unattributed.metrics.totalSpend)} of spend this year falls outside every invoice period, so no invoice carries it.`,
    })
  }
  if (store.gaps.accruedCommission > 0) {
    alerts.push({
      tone: 'flag',
      text: `${formatUSD(store.gaps.accruedCommission)} of commission is earned but not yet paid, so it is not in intake cost${store.gaps.nextPayday ? ` until ${store.gaps.nextPayday}` : ' yet'}.`,
    })
  }
  if (store.gaps.opexTableMissing) {
    alerts.push({ tone: 'flag', text: 'Operating expenses are not set up, so profit counts advertising and intake only.' })
  }

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Dashboard</h1>
          <p className="fin-sub">{win.label}</p>
        </div>
        <Link href={`${base}/reporting`} className="fin-btn">Open the Reporting Center →</Link>
      </div>

      {/* Which revenue this is. The Reporting Center can be switched to
          cases delivered; this page cannot, and saying so stops the two
          being read as the same number. */}
      <p className="fin-note" style={{ marginBottom: 8 }}>
        Revenue is <strong>invoiced</strong> — each invoice counted in full on the day it was
        raised. Nothing is recognised on the days that follow, because nothing was billed on them.
      </p>

      <div className="fin-figs">
        {[
          { l: 'Revenue', v: m.revenue, p: prev?.revenue ?? null },
          { l: 'Advertising', v: m.advertising, p: prev?.advertising ?? null, invert: true },
          { l: 'Intake cost', v: m.intake, p: prev?.intake ?? null, invert: true },
          { l: 'Operating expenses', v: m.opex, p: prev?.opex ?? null, invert: true },
          { l: 'Profit', v: m.profit, p: prev?.profit ?? null, strong: true },
        ].map((c) => {
          const pct = c.p && c.p !== 0 ? pctChange(c.v, c.p) : null
          const good = pct === null ? null : c.invert ? -pct : pct
          return (
            <div key={c.l} className="fin-fig">
              <div className="fin-fig-l">{c.l}</div>
              <div className={`fin-fig-v fin-num ${c.strong ? tone(c.v) : ''}`}>{formatUSD(c.v)}</div>
              <span className={`fin-fig-s ${tone(good)}`}>
                {pct === null ? 'no prior period' : `${formatPct(pct, { signed: true })} vs last month`}
              </span>
            </div>
          )
        })}
        <div className="fin-fig">
          <div className="fin-fig-l">Margin</div>
          <div className={`fin-fig-v fin-num ${tone(m.margin)}`}>{formatPct(m.margin)}</div>
          <span className="fin-fig-s">year to date {formatPct(ytd.current.margin)}</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="fin-sec" style={{ display: 'grid', gap: 8 }}>
          {alerts.map((a) => (
            <p key={a.text} className={a.tone === 'neg' ? 'fin-warn' : 'fin-warn'}
               style={a.tone === 'neg' ? { borderColor: 'var(--neg)', color: 'var(--neg)' } : undefined}>
              {a.text}
            </p>
          ))}
        </div>
      )}

      <div className="fin-split even fin-sec">
        <section className="fin-card">
          <div className="fin-card-h">
            <span className="fin-card-t">By firm · {win.label}</span>
            <Link className="fin-card-n" href={`${base}/reporting?range=${range}`}>full report →</Link>
          </div>
          <div className="fin-scroll">
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Law firm</th>
                  <th className="n">Revenue</th>
                  <th className="n">Spend</th>
                  <th className="n">Profit</th>
                  <th className="n">Margin</th>
                </tr>
              </thead>
              <tbody>
                {mtd.firms.rows
                  .filter((r) => r.metrics.revenue !== 0 || r.metrics.totalSpend !== 0)
                  .map((r) => (
                    <tr key={r.firmId ?? r.name}>
                      <td>{r.name}</td>
                      <td className="n fin-num">{formatUSD(r.metrics.revenue)}</td>
                      <td className="n fin-num">{formatUSD(r.metrics.totalSpend)}</td>
                      <td className={`n fin-num ${tone(r.metrics.profit)}`}>{formatUSD(r.metrics.profit)}</td>
                      <td className={`n fin-num ${tone(r.metrics.margin)}`}>{formatPct(r.metrics.margin)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot className="fin-tfoot">
                <tr>
                  <td>Total</td>
                  <td className="n fin-num">{formatUSD(m.revenue)}</td>
                  <td className="n fin-num">{formatUSD(m.totalSpend)}</td>
                  <td className={`n fin-num ${tone(m.profit)}`}>{formatUSD(m.profit)}</td>
                  <td className={`n fin-num ${tone(m.margin)}`}>{formatPct(m.margin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="fin-card">
          <div className="fin-card-h">
            <span className="fin-card-t">Open invoices</span>
            <Link className="fin-card-n" href={`${base}/firms`}>all firms →</Link>
          </div>
          {mtd.invoices.rows.filter((r) => r.kind === 'invoice').length === 0 ? (
            <p className="fin-empty">No invoice covers this window.</p>
          ) : (
            <div className="fin-scroll">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Period</th>
                    <th className="n">Invoiced</th>
                    <th className="n">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {mtd.invoices.rows
                    .filter((r) => r.kind === 'invoice')
                    .map((r) => {
                      const firm = mtd.meta.firms.find((f) => f.id === r.firmId)
                      return (
                        <tr key={r.invoiceId ?? r.number}>
                          <td>
                            {firm ? (
                              <Link href={`${base}/firms/${firm.slug}/invoice/${invoicePathSegment(r.number)}`}>
                                {r.number}
                              </Link>
                            ) : r.number}
                            <div className="fin-fig-s">{r.firmName}</div>
                          </td>
                          <td className="fin-num">
                            {r.periodStart && r.periodEnd ? formatRange(r.periodStart, r.periodEnd) : '—'}
                          </td>
                          <td className="n fin-num">{r.invoicedCents === null ? '—' : formatUSD(r.invoicedCents)}</td>
                          <td className="n">
                            {r.invoiceId && (
                              <PaidToggle
                                id={r.invoiceId}
                                paid={r.receivedCents !== null}
                                amount={formatUSD(r.receivedCents ?? 0)}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">Year to date</span>
          <Link className="fin-card-n" href={`${base}/reporting?range=ytd&granularity=monthly`}>full report →</Link>
        </div>
        <div className="fin-bars">
          {[
            { l: 'Revenue', v: ytd.current.revenue },
            { l: 'Advertising', v: ytd.current.advertising },
            { l: 'Intake cost', v: ytd.current.intake },
            { l: 'Operating expenses', v: ytd.current.opex },
          ].map((r) => {
            const base2 = Math.max(ytd.current.revenue, ytd.current.totalSpend, 1)
            return (
              <div key={r.l} className="fin-bar-row">
                <div className="fin-bar-top">
                  <span>{r.l}</span>
                  <span className="fin-num">{formatUSDCompact(r.v)}</span>
                </div>
                <div className="fin-bar-track">
                  <div className={`fin-bar-fill ${r.l === 'Revenue' ? 'profit' : 'ad'}`}
                       style={{ width: `${Math.min(100, (r.v / base2) * 100)}%` }} />
                </div>
              </div>
            )
          })}
          <div className="fin-bar-top" style={{ borderTop: '1px solid var(--line)', paddingTop: 9 }}>
            <span>Profit year to date</span>
            <span className={`fin-num ${tone(ytd.current.profit)}`} style={{ fontWeight: 600 }}>
              {formatUSD(ytd.current.profit)} <span className="fin-bar-sub">({formatPct(ytd.current.margin)})</span>
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
