import type { Metadata } from 'next'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { buildProjection, DEADLINE_MAX_DAYS, DEADLINE_MIN_DAYS } from '@/lib/finance/reporting/projection'
import { formatDay, formatRange } from '@/lib/finance/reporting/dates'
import { ProjectionChart, ProjectionTable } from '../_components/report-ui'

export const metadata: Metadata = { title: 'Projection · Financial Center' }
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The Projection.

   Every other page in the Financial Center reports what happened. This one
   reports what is going to: how much of each invoice has been delivered,
   the day the order was filled, and where today's pace puts the finish
   against the day it is due.

   It has a page of its own rather than a section on the Reporting Center
   because it is read on a different clock. The report is opened at the end
   of a period to settle what it earned; this is opened in the middle of one
   to find out whether the invoices are going to land, which is a question
   with an answer only while there is still time to act on it.

   Delivery is counted from the firms' own case management workbooks, held
   in invoice_cases. See lib/finance/reporting/projection.ts for why not
   from ghl_leads.
   ═══════════════════════════════════════════════════════════════════════════ */

export default async function ProjectionPage() {
  const store = await loadFinanceData()
  const names = Object.fromEntries(store.firms.map((f) => [f.id, f.name]))
  /* Every invoice in the book, newest first — not a filtered window. An
     invoice is the unit here, and one is either finished or it is not. */
  const invoices = [...store.invoices].sort((a, b) =>
    a.periodStart === b.periodStart ? a.number.localeCompare(b.number) : b.periodStart.localeCompare(a.periodStart),
  )
  const { rows, unavailable, orphanCodes } = buildProjection(store, invoices, names)

  const open = rows.filter((r) => r.state !== 'complete' && r.state !== 'untracked')
  const contracted = rows.reduce((a, r) => a + (r.contracted ?? 0), 0)
  const delivered = rows.reduce((a, r) => a + r.delivered, 0)
  const remaining = rows.reduce((a, r) => a + r.remaining, 0)
  const behind = rows.filter((r) => r.state === 'behind' || r.state === 'at_risk' || r.state === 'stalled').length

  const figures = [
    { label: 'Under order', value: contracted.toLocaleString('en-US'), sub: `${rows.length} invoice${rows.length === 1 ? '' : 's'}` },
    { label: 'Delivered', value: delivered.toLocaleString('en-US'), sub: contracted ? `${Math.round((delivered / contracted) * 100)}% of the order` : undefined },
    { label: 'Still to deliver', value: remaining.toLocaleString('en-US'), sub: open.length ? `across ${open.length} open invoice${open.length === 1 ? '' : 's'}` : 'nothing outstanding' },
    {
      label: 'At risk or behind',
      value: behind.toLocaleString('en-US'),
      sub: behind === 0 ? 'every invoice on course' : 'may miss the window at this pace',
      cls: behind > 0 ? 'neg' : 'pos',
    },
  ]

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Projection</h1>
          <p className="fin-sub">
            Delivery against each invoice, and the day it lands · figures through {store.dataAsOf}
          </p>
        </div>
      </div>

      {unavailable ? (
        <section className="fin-card fin-sec">
          <p className="fin-empty">
            Case delivery is not set up yet. Run <code>supabase/migration_invoice_cases.sql</code>,
            then import the firms' case management workbooks with{' '}
            <code>scripts/import-case-workbooks.py</code>.
          </p>
        </section>
      ) : (
        <>
          <div className="fin-figs">
            {figures.map((f) => (
              <div key={f.label} className="fin-fig">
                <div className="fin-fig-l">{f.label}</div>
                <div className={`fin-fig-v fin-num ${f.cls ?? ''}`}>{f.value}</div>
                {f.sub && <span className="fin-fig-s">{f.sub}</span>}
              </div>
            ))}
          </div>

          <p className="fin-note" style={{ margin: '14px 0 10px' }}>
            Counted from the firms' own case management workbooks — the same list they are
            invoiced against. A <strong>replacement</strong> is a case swapped for another and
            never counts toward the order. Each invoice is due{' '}
            <strong>{DEADLINE_MIN_DAYS}–{DEADLINE_MAX_DAYS} days</strong> from the day it kicked
            off, and the expected finish is a range because the pace is read two ways: across the
            whole invoice, and across the last week.
          </p>

          {/* A chart each, rather than every invoice on one. The orders are
              different sizes, so one shared axis would flatten the smaller
              invoice into the floor of the larger one. */}
          <div className="fin-split even">
            {rows
              .filter((r) => r.contracted !== null)
              .map((r) => (
                <section key={r.invoiceId} className="fin-card">
                  <div className="fin-card-h">
                    <span className="fin-card-t">
                      {r.number} · {r.firmName}
                      {r.state === 'complete' && <> <span className="fin-tag good">complete</span></>}
                      {r.state === 'behind' && <> <span className="fin-tag bad">behind</span></>}
                      {r.state === 'at_risk' && <> <span className="fin-tag warn">at risk</span></>}
                      {r.state === 'stalled' && <> <span className="fin-tag warn">nothing yet</span></>}
                    </span>
                    <span className="fin-card-n">{formatRange(r.periodStart, r.periodEnd)}</span>
                  </div>
                  <ProjectionChart row={r} />
                  <p className="fin-note" style={{ padding: '10px 16px 14px' }}>
                    {r.delivered} of {r.contracted} delivered
                    {r.pace ? ` · ${r.pace.toFixed(1)} a day` : ''}
                    {r.completedOn
                      ? ` · filled ${formatDay(r.completedOn, false)}`
                      : r.expectedLatest
                        ? ` · on course for ${
                            r.expectedEarliest && r.expectedEarliest !== r.expectedLatest
                              ? `${formatDay(r.expectedEarliest, false)} – ${formatDay(r.expectedLatest, false)}`
                              : formatDay(r.expectedLatest, false)
                          }`
                        : ' · no pace to project from yet'}
                    {` · due by ${formatDay(r.deadlineEnd, false)}`}
                    {r.slackDays !== null && (
                      <span className={r.slackDays >= 0 ? 'pos' : 'neg'}>
                        {r.slackDays === 0
                          ? ', the last day of the window'
                          : `, ${Math.abs(r.slackDays)} day${Math.abs(r.slackDays) === 1 ? '' : 's'} ${r.slackDays > 0 ? 'inside it' : 'past it'}`}
                      </span>
                    )}
                  </p>
                </section>
              ))}
          </div>

          <section className="fin-card fin-sec">
            <div className="fin-card-h">
              <span className="fin-card-t">Every invoice</span>
              <span className="fin-card-n">delivery against the order, from the firms' case workbooks</span>
            </div>
            <ProjectionTable rows={rows} unavailable={unavailable} orphanCodes={orphanCodes} />
          </section>
        </>
      )}
    </>
  )
}
