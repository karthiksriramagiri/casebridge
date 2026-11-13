import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { loadFinanceData } from '@/lib/finance/reporting/load'
import { formatUSD, type Cents } from '@/lib/finance/reporting/money'
import { financeToday } from '@/lib/finance/clock'
import { OPEX_CATEGORY_LABELS, type OpexCategory } from '@/lib/finance/reporting/types'
import { ExpenseForm } from '../_components/expense-form'
import { ExpenseRow, type ExpenseRecord } from '../_components/expense-row'

export const metadata: Metadata = { title: 'Operating expenses · Financial Center' }
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   Operating expenses.

   The nav has pointed here since the Financial Center was built and there
   was nothing at the other end: expenses could only be added from a form
   buried in the Reporting Center, and once added there was no way to see
   the whole list, correct one, or take one back out.

   This is that page. Every expense, newest first, each editable where it
   is read, and a void rather than a delete — an expense that has already
   moved a reported margin cannot simply disappear, or the margin it moved
   stops being explainable.

   What it deliberately does not do is recognise anything differently from
   the Reporting Center. The figures here are the same ledger's: a cost is
   spread across the period it covers, not dropped on the day it was paid.
   ═══════════════════════════════════════════════════════════════════════════ */

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const MISSING = /does not exist|schema cache/i

/** The slice of a monthly cost that lands inside a window. */
function recognisedIn(e: ExpenseRecord, start: string, end: string): Cents {
  if (e.status === 'void') return 0
  const s = e.service_start.slice(0, 10)
  const en = e.service_end.slice(0, 10)
  if (en < start || s > end) return 0
  const days = (a: string, b: string) =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1
  const total = days(s, en)
  const inside = days(s > start ? s : start, en < end ? en : end)
  return Math.round((e.amount_cents * inside) / Math.max(1, total))
}

export default async function ExpensesPage() {
  const store = await loadFinanceData()
  const base = siteRootForHost((await headers()).get('host')) === '/finance' ? '' : '/finance'
  const today = financeToday()
  const monthStart = `${today.slice(0, 7)}-01`

  const { data, error } = await db()
    .from('operating_expenses')
    .select('*')
    .order('expense_date', { ascending: false })

  /* The migration not having been run is a different thing from there
     being no expenses, and the page says which. */
  if (error && MISSING.test(error.message)) {
    return (
      <>
        <div className="fin-head">
          <div>
            <h1 className="fin-h1">Operating expenses</h1>
            <p className="fin-sub">Not set up yet</p>
          </div>
        </div>
        <div className="fin-card">
          <p className="fin-empty">
            Run <code>supabase/migration_finance_reporting.sql</code> to create the expenses table.
            Until then every profit figure in the Financial Center counts advertising and intake only.
          </p>
        </div>
      </>
    )
  }
  if (error) {
    return (
      <>
        <h1 className="fin-h1">Operating expenses</h1>
        <p className="fin-err">{error.message}</p>
      </>
    )
  }

  const expenses = (data ?? []) as ExpenseRecord[]
  const live = expenses.filter((e) => e.status !== 'void')

  const thisMonth = live.reduce((a, e) => a + recognisedIn(e, monthStart, today), 0)
  const committed = live.reduce((a, e) => a + e.amount_cents, 0)
  const recurring = live.filter((e) => e.recurrence === 'monthly')
  const unallocated = live.filter((e) => e.allocation === 'unallocated').reduce((a, e) => a + e.amount_cents, 0)

  /* By category, over everything live — the shape of the overhead rather
     than one month of it. */
  const byCategory = new Map<OpexCategory, Cents>()
  for (const e of live) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount_cents)
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  return (
    <>
      <div className="fin-head">
        <div>
          <h1 className="fin-h1">Operating expenses</h1>
          <p className="fin-sub">
            {live.length} live · recognised across the period each one covers, not the day it was paid
          </p>
        </div>
        <Link href={`${base}/reporting`} className="fin-btn">See them in the report →</Link>
      </div>

      <div className="fin-figs">
        <div className="fin-fig">
          <div className="fin-fig-l">Recognised this month</div>
          <div className="fin-fig-v fin-num">{formatUSD(thisMonth)}</div>
          <span className="fin-fig-s">{monthStart} to {today}</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Committed</div>
          <div className="fin-fig-v fin-num">{formatUSD(committed)}</div>
          <span className="fin-fig-s">every live expense at full value</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Recurring</div>
          <div className="fin-fig-v fin-num">{recurring.length}</div>
          <span className="fin-fig-s">spread across a service period</span>
        </div>
        <div className="fin-fig">
          <div className="fin-fig-l">Company-level</div>
          <div className="fin-fig-v fin-num">{formatUSD(unallocated)}</div>
          <span className="fin-fig-s">reaching no firm&rsquo;s margin</span>
        </div>
      </div>

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">Add an expense</span>
          <span className="fin-card-n">it moves profit the moment it is saved</span>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <ExpenseForm firms={store.firms} defaultDate={today} />
        </div>
      </section>

      {categories.length > 0 && (
        <section className="fin-card fin-sec">
          <div className="fin-card-h">
            <span className="fin-card-t">By category</span>
            <span className="fin-card-n">share of every live expense</span>
          </div>
          <div className="fin-bars">
            {categories.map(([cat, cents]) => (
              <div key={cat} className="fin-bar-row">
                <div className="fin-bar-top">
                  <span>{OPEX_CATEGORY_LABELS[cat]}</span>
                  <span className="fin-num">{formatUSD(cents)}</span>
                </div>
                <div className="fin-bar-track">
                  <div className="fin-bar-fill opex"
                       style={{ width: `${committed > 0 ? (cents / committed) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="fin-card fin-sec">
        <div className="fin-card-h">
          <span className="fin-card-t">Every expense</span>
          <span className="fin-card-n">
            {expenses.length - live.length > 0
              ? `${expenses.length - live.length} voided, kept on the list`
              : 'newest first'}
          </span>
        </div>
        {expenses.length === 0 ? (
          <p className="fin-empty">
            No operating expenses yet. Add the first one above — until then every profit figure in the
            Financial Center counts advertising and intake only.
          </p>
        ) : (
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
                  <th className="n">Change</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => <ExpenseRow key={e.id} e={e} firms={store.firms} />)}
              </tbody>
              <tfoot className="fin-tfoot">
                <tr>
                  <td colSpan={5}>{live.length} live expense{live.length === 1 ? '' : 's'}</td>
                  <td className="n fin-num">{formatUSD(committed)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="fin-note fin-sec">
        A voided expense stays on the list and stops counting — an expense that has already moved a reported
        margin cannot simply disappear, or the margin it moved stops being explainable. Every change is logged
        against the expense it changed.
      </p>
    </>
  )
}
