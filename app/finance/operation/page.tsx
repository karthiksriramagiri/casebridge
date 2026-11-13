import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { formatRange } from '@/lib/finance/reporting/dates'
import { filtersToSearchParams, parseFilters } from '@/lib/finance/reporting/filters'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { buildReport } from '@/lib/finance/reporting/report'
import { ReportFilters } from '../_components/report-filters'
import {
  ComparisonTable, CostBreakdown, DataGaps, EarnoutCard, FirmTable, InvoiceTable,
  KpiCards, PeriodStrip, TargetAttainment, TrendChart,
} from '../_components/report-ui'
import { invoicePathSegment } from '../_lib/invoice-routes'

export const metadata: Metadata = {
  title: 'Operation Center · Financial Center',
  description: 'Delivery and direct cost by law firm and invoice, without overhead or the referral royalty.',
}
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The Operation Center.

   The same book as the Reporting Center, read without overhead and
   without the Sanguine royalty: revenue against the two costs that scale
   with the work, advertising and intake.

   It exists because the Reporting Center answers "what does the company
   keep" and that is the wrong question for two readers. The earn-out is
   computed on exactly these costs and no others (APA §2.9), and anyone
   asking whether a firm or a campaign is working wants the cost of
   serving it, not its share of the software bill. Folding overhead into
   that comparison makes a good firm look worse in a month somebody
   renewed a licence.

   Neither view is a correction of the other. Both read the same ledger
   and the same days, so they can never disagree about what was delivered
   or what an ad cost — only about which costs were asked for.
   ═══════════════════════════════════════════════════════════════════════════ */

export default async function OperationCenterPage({
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
  const report = buildReport(store, filters)

  /* On finance.case-bridge.com the /finance prefix is rewritten away. */
  const base = siteRootForHost((await headers()).get('host')) === '/finance' ? '' : '/finance'
  const range = formatRange(report.meta.window.start, report.meta.window.end)

  const here = `${base}/operation`
  const scoped = (extra: Record<string, string>) => {
    const sp = filtersToSearchParams(report.meta.filters, { omitScope: true })
    for (const [k, v] of Object.entries(extra)) sp.set(k, v)
    return `${here}?${sp.toString()}`
  }

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Operation Center</h1>
          <p className="fin-sub">
            {report.meta.scopeLabel} · {range}
            {report.meta.window.partial && ' · period in progress'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <p className="fin-sub">Figures through {report.meta.dataAsOf}</p>
          <Link href={`${base}/reporting`} className="fin-btn">Reporting Center →</Link>
        </div>
      </div>

      <ReportFilters report={report} basePath={here} />

      <p className="fin-note" style={{ marginBottom: 10 }}>
        Profit here is revenue less <strong>advertising and intake</strong> only — the costs that scale with the
        work. Operating expenses and the Sanguine royalty are outside it, which is how the earn-out is measured
        (APA §2.9). The <Link href={`${base}/reporting`}>Reporting Center</Link> carries both and is the view of
        what the company actually keeps.
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

      {/* No operating-expense section here. This page's profit does not
          count overhead, so a table of it would invite the reader to
          subtract a figure that has already been left out on purpose.
          It lives on the Reporting Center and on its own page. */}

      <DataGaps report={report} />

      <p className="fin-note fin-sec">
        Calculation {report.meta.calcVersion} · data from {report.meta.dataStart} to {report.meta.dataAsOf} ·
        generated {new Date(report.meta.generatedAt).toLocaleString('en-US')}
      </p>
    </>
  )
}
