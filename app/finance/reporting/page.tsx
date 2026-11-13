import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { formatRange } from '@/lib/finance/reporting/dates'
import { filtersToSearchParams, parseFilters } from '@/lib/finance/reporting/filters'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { buildReport } from '@/lib/finance/reporting/report'
import { formatUSD } from '@/lib/finance/reporting/money'
import { SANGUINE_PER_CASE } from '@/lib/finance/sanguine'
import { ExpenseForm } from '../_components/expense-form'
import { ReportFilters } from '../_components/report-filters'
import {
  ComparisonTable, CostBreakdown, DataGaps, EarnoutCard, FirmTable, InvoiceTable,
  KpiCards, OpexByCategory, OpexTable, PeriodStrip, TargetAttainment, TrendChart,
} from '../_components/report-ui'
import { invoicePathSegment } from '../_lib/invoice-routes'

export const metadata: Metadata = {
  title: 'Reporting Center · Financial Center',
  description: 'Revenue, spend, operating expenses, profit and margin by law firm and invoice.',
}
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The Reporting Center.

   One range, one comparison, one calculation layer. Every figure on this
   page — the cards, the chart, both tables, the export — is read from the
   same ledger, so none of them can disagree with another. That was the
   failure of the dashboard this replaces: the company margin and the
   per-firm margins were computed in different places from different costs.

   The filters live in the query string, so a view can be sent to someone
   and open the same way for them.
   ═══════════════════════════════════════════════════════════════════════════ */

export default async function ReportingCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const store = await loadFinanceData()
  /* `firm` may arrive as a slug — the rest of the Financial Center routes
     that way — so it is resolved to an id before the filters are parsed. */
  const asked = typeof params.firm === 'string' ? params.firm : null
  const bySlug = asked ? store.firms.find((x) => x.slug === asked || x.id === asked) : null
  const filters = parseFilters(
    { ...params, firm: bySlug?.id ?? (asked ?? undefined) },
    { dataStart: store.dataStart, asOf: store.dataAsOf },
  )
  /* With overhead and the Sanguine royalty in the costs. This is the view
     of what the company actually keeps; the Operation Center reads the
     same book without them, which is how the earn-out is measured. */
  const report = buildReport(store, filters, { sanguine: true })

  /* On finance.case-bridge.com the /finance prefix is rewritten away. */
  const base = siteRootForHost((await headers()).get('host')) === '/finance' ? '' : '/finance'
  const range = formatRange(report.meta.window.start, report.meta.window.end)

  const here = `${base}/reporting`
  const scoped = (extra: Record<string, string>) => {
    const sp = filtersToSearchParams(report.meta.filters, { omitScope: true })
    for (const [k, v] of Object.entries(extra)) sp.set(k, v)
    return `${here}?${sp.toString()}`
  }

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Reporting Center</h1>
          <p className="fin-sub">
            {report.meta.scopeLabel} · {range}
            {report.meta.window.partial && ' · period in progress'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <p className="fin-sub">Figures through {report.meta.dataAsOf}</p>
          <Link href={`${base}/operation`} className="fin-btn">Operation Center →</Link>
        </div>
      </div>

      <ReportFilters report={report} basePath={here} />

      <p className="fin-note" style={{ marginBottom: 10 }}>
        Profit here is revenue less <strong>advertising, intake, operating expenses and the Sanguine royalty</strong>
        {' '}({formatUSD(SANGUINE_PER_CASE)} a delivered case) — everything the company pays to earn it. The{' '}
        <Link href={`${base}/operation`}>Operation Center</Link> reads the same book without overhead or the
        royalty, which is how the earn-out is measured (APA §2.9), so its margin is the higher of the two.
      </p>

      <KpiCards report={report} />
      <PeriodStrip report={report} />

      <div className="fin-split">
        <section className="fin-card">
          <div className="fin-card-h">
            <span className="fin-card-t">Revenue, spend and profit</span>
            <span className="fin-card-n">{range} · by {report.meta.filters.granularity}</span>
          </div>
          <TrendChart data={report.trend} />
        </section>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <section className="fin-card">
            <div className="fin-card-h">
              <span className="fin-card-t">Where the money went</span>
              <span className="fin-card-n">share of revenue</span>
            </div>
            <CostBreakdown metrics={report.current} />
          </section>
          <section className="fin-card">
            <div className="fin-card-h">
              <span className="fin-card-t">Target attainment</span>
              <span className="fin-card-n">revenue vs plan</span>
            </div>
            <TargetAttainment report={report} />
          </section>
          {report.earnout && (
            <section className="fin-card">
              <div className="fin-card-h">
                <span className="fin-card-t">Earn-out</span>
                <span className="fin-card-n">contractual — not operating profit</span>
              </div>
              <EarnoutCard report={report} />
            </section>
          )}
        </div>
      </div>

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">Period comparison</span>
          <span className="fin-card-n">equal-length windows, each ending {report.meta.window.end}</span>
        </div>
        <ComparisonTable report={report} />
      </section>

      {/* Full width: eight columns of figures do not fit two thirds of a
          page, and a table of money that scrolls sideways is a table whose
          last column nobody reads. */}
      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">By law firm</span>
          <span className="fin-card-n">
            {report.firms.reconciled ? 'reconciles with the company total' : 'does not reconcile — check allocation'}
          </span>
        </div>
        <FirmTable report={report} hrefForFirm={(id) => scoped({ firm: id })} />
      </section>

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">By invoice</span>
          <span className="fin-card-n">
            {report.invoices.reconciled ? 'reconciles with the company total' : 'does not reconcile — check allocation'}
          </span>
        </div>
        <InvoiceTable
          report={report}
          hrefForInvoice={(id) => {
            const inv = report.meta.invoiceOptions.find((i) => i.id === id)
            const firm = report.meta.firms.find((x) => x.id === inv?.firmId)
            return inv && firm
              ? `${base}/firms/${firm.slug}/invoice/${invoicePathSegment(inv.number)}`
              : scoped({ invoice: id })
          }}
        />
      </section>

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">Operating expenses</span>
          <span className="fin-card-n">recognised across the service period, not the payment date</span>
        </div>
        {/* The control sits in the body, not the header: opened, it is a
            twelve-field form, and a header is not a place to put one. */}
        {!report.meta.gaps.opexTableMissing && (
          <div style={{ padding: '12px 16px 0' }}>
            <ExpenseForm firms={report.meta.firms} defaultDate={report.meta.dataAsOf} />
          </div>
        )}
        <OpexTable report={report} />
      </section>

      {!report.meta.gaps.opexTableMissing && report.opex.total > 0 && (
        <div className="fin-split even">
          <section className="fin-card">
            <div className="fin-card-h">
              <span className="fin-card-t">Overhead by category</span>
              <span className="fin-card-n">recognised in this range</span>
            </div>
            <OpexByCategory report={report} />
          </section>
        </div>
      )}

      <DataGaps report={report} />

      <p className="fin-note fin-sec">
        Calculation {report.meta.calcVersion} · data from {report.meta.dataStart} to {report.meta.dataAsOf} ·
        generated {new Date(report.meta.generatedAt).toLocaleString('en-US')}
      </p>
    </>
  )
}
