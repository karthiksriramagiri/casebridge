import { dayDiff, daysInclusive, maxDate, minDate, type ISODate } from './dates'
import { distributeCents, distributeEvenly, marginPct, type Cents } from './money'
import type { Metrics } from './report-types'
import { OPEX_CATEGORIES, type FinanceDataset, type Invoice, type OpexCategory, type OpexExpense } from './types'

/**
 * Single calculation layer. Every figure on the page — card, chart, table,
 * export — is read from this ledger, so no two of them can disagree. That
 * was the failure of the build this replaces: the company margin and the
 * per-firm margins were computed in different places from different costs.
 *
 * Methodology (version below):
 * - Revenue: each invoice's invoiced amount is recognized straight-line per day
 *   across its service period. Prepaid cash is tracked separately and never
 *   treated as earned revenue on receipt.
 * - Advertising and intake/worker costs are recorded on the day incurred.
 * - OpEx: each non-void expense is first allocated to firms (direct / even /
 *   revenue-weighted / unallocated), then each share is spread evenly across
 *   the expense's service period. One-time expenses land on their expense date.
 * - Invoice attribution: a firm's daily costs are attributed to that firm's
 *   invoices active on the same day, weighted by each invoice's daily
 *   recognized revenue. Days with no active invoice remain "unattributed".
 * - All splits use the largest-remainder method on integer cents, so every
 *   allocation sums exactly to its source amount (no double counting).
 */
export const CALC_VERSION = '2026.11-r1'

export const UNALLOCATED = '__unallocated'

/* Two revenue lines, kept side by side rather than one replacing the
   other: `rev` is what was invoiced, `caseRev` what was delivered. The
   report chooses which drives profit; both are always computed, because
   the gap between them is one of the things worth reading. */
type Series = {
  rev: Float64Array
  caseRev: Float64Array
  cases: Float64Array
  ad: Float64Array
  intake: Float64Array
  opex: Float64Array
}

export interface ExpenseAllocation {
  firmKey: string
  allocatedCents: Cents
  startIdx: number
  daily: Cents[]
}

export interface Ledger {
  start: ISODate
  end: ISODate
  days: number
  firm: Record<string, Series>
  invoice: Record<string, Series>
  unattributed: Record<string, Series>
  unallocatedOpex: Float64Array
  opexByCategory: Record<OpexCategory, Record<string, Float64Array>>
  expenseAllocations: Record<string, ExpenseAllocation[]>
  company: Series
}

/* Keyed on the dataset's own identity. The loader hands the same object to
   every call inside one request, so the ledger is built once per request
   and never leaks between them — a module-level cache would serve one
   firm's numbers to the next reader. */
const cache = new WeakMap<FinanceDataset, Ledger>()

function emptySeries(n: number): Series {
  return {
    rev: new Float64Array(n),
    caseRev: new Float64Array(n),
    cases: new Float64Array(n),
    ad: new Float64Array(n),
    intake: new Float64Array(n),
    opex: new Float64Array(n),
  }
}

function invoiceRevenueWeight(inv: Invoice, start: ISODate, end: ISODate) {
  const s = maxDate(inv.periodStart, start)
  const e = minDate(inv.periodEnd, end)
  if (s > e) return 0
  return (inv.invoicedCents * daysInclusive(s, e)) / daysInclusive(inv.periodStart, inv.periodEnd)
}

export function allocateExpense(
  expense: Pick<OpexExpense, 'amountCents' | 'allocationMethod' | 'firmIds' | 'servicePeriodStart' | 'servicePeriodEnd'>,
  invoices: Invoice[],
): { firmKey: string; cents: Cents }[] {
  const firmIds = [...new Set(expense.firmIds)]
  if (expense.allocationMethod === 'unallocated' || firmIds.length === 0) {
    return [{ firmKey: UNALLOCATED, cents: expense.amountCents }]
  }
  if (expense.allocationMethod === 'direct') {
    return [{ firmKey: firmIds[0], cents: expense.amountCents }]
  }
  let weights = firmIds.map(() => 1)
  if (expense.allocationMethod === 'revenue') {
    const revWeights = firmIds.map((fid) =>
      invoices
        .filter((i) => i.firmId === fid)
        .reduce((sum, i) => sum + invoiceRevenueWeight(i, expense.servicePeriodStart, expense.servicePeriodEnd), 0),
    )
    // Fall back to an even split when none of the firms earned revenue in the service period.
    if (revWeights.some((w) => w > 0)) weights = revWeights
  }
  const parts = distributeCents(expense.amountCents, weights) ?? distributeEvenly(expense.amountCents, firmIds.length)
  return firmIds.map((fid, i) => ({ firmKey: fid, cents: parts[i] }))
}

export function getLedger(store: FinanceDataset): Ledger {
  const hit = cache.get(store)
  if (hit) return hit

  const start = store.dataStart
  const end = store.dataAsOf
  const n = daysInclusive(start, end)
  const idx = (d: ISODate) => dayDiff(start, d)
  const inRange = (i: number) => i >= 0 && i < n

  const firm: Record<string, Series> = {}
  const unattributed: Record<string, Series> = {}
  for (const f of store.firms) {
    firm[f.id] = emptySeries(n)
    unattributed[f.id] = emptySeries(n)
  }
  const invoice: Record<string, Series> = {}
  const unallocatedOpex = new Float64Array(n)
  const opexByCategory = Object.fromEntries(OPEX_CATEGORIES.map((c) => [c, {}])) as Record<
    OpexCategory,
    Record<string, Float64Array>
  >

  // Revenue recognition
  const activeByFirmDay: Record<string, { id: string; daily: number }[][]> = {}
  for (const f of store.firms) activeByFirmDay[f.id] = Array.from({ length: n }, () => [])
  for (const inv of store.invoices) {
    const s = invoice[inv.id] = emptySeries(n)
    const periodDays = daysInclusive(inv.periodStart, inv.periodEnd)
    const daily = distributeEvenly(inv.invoicedCents, periodDays)
    const base = idx(inv.periodStart)
    daily.forEach((cents, k) => {
      const i = base + k
      if (!inRange(i) || !firm[inv.firmId]) return
      s.rev[i] += cents
      firm[inv.firmId].rev[i] += cents
      activeByFirmDay[inv.firmId][i].push({ id: inv.id, daily: cents })
    })
  }

  for (const r of store.adSpend) {
    const i = idx(r.date)
    if (inRange(i) && firm[r.firmId]) firm[r.firmId].ad[i] += r.amountCents
  }
  /* Delivered cases. Attributed to the firm's invoices open that day by
     the same rule costs follow, so an invoice's case revenue and its
     costs are drawn from the same days. */
  for (const r of store.caseRevenue) {
    const i = idx(r.date)
    if (!inRange(i) || !firm[r.firmId]) continue
    firm[r.firmId].caseRev[i] += r.amountCents
    firm[r.firmId].cases[i] += r.cases
  }

  for (const r of store.intakeCosts) {
    const i = idx(r.date)
    if (inRange(i) && firm[r.firmId]) firm[r.firmId].intake[i] += r.basePayCents + r.commissionCents
  }

  // OpEx allocation and recognition
  const expenseAllocations: Record<string, ExpenseAllocation[]> = {}
  for (const exp of store.expenses) {
    if (exp.status === 'void') {
      expenseAllocations[exp.id] = []
      continue
    }
    const shares = allocateExpense(exp, store.invoices)
    const periodDays = daysInclusive(exp.servicePeriodStart, exp.servicePeriodEnd)
    const startIdx = idx(exp.servicePeriodStart)
    expenseAllocations[exp.id] = shares.map(({ firmKey, cents }) => {
      const daily = distributeEvenly(cents, periodDays)
      const catSeries = (opexByCategory[exp.category][firmKey] ??= new Float64Array(n))
      daily.forEach((c, k) => {
        const i = startIdx + k
        if (!inRange(i)) return
        catSeries[i] += c
        if (firmKey === UNALLOCATED) unallocatedOpex[i] += c
        else if (firm[firmKey]) firm[firmKey].opex[i] += c
      })
      return { firmKey, allocatedCents: cents, startIdx, daily }
    })
  }

  // Invoice cost attribution
  for (const f of store.firms) {
    const fs = firm[f.id]
    for (let i = 0; i < n; i++) {
      const active = activeByFirmDay[f.id][i]
      const weights = active.map((a) => a.daily)
      for (const key of ['ad', 'intake', 'opex', 'caseRev', 'cases'] as const) {
        const amount = fs[key][i]
        if (amount === 0) continue
        const parts = active.length ? distributeCents(amount, weights) : null
        if (!parts) {
          unattributed[f.id][key][i] += amount
          continue
        }
        active.forEach((a, k) => {
          invoice[a.id][key][i] += parts[k]
        })
      }
    }
  }

  const company = emptySeries(n)
  for (const f of store.firms) {
    for (let i = 0; i < n; i++) {
      company.rev[i] += firm[f.id].rev[i]
      company.caseRev[i] += firm[f.id].caseRev[i]
      company.cases[i] += firm[f.id].cases[i]
      company.ad[i] += firm[f.id].ad[i]
      company.intake[i] += firm[f.id].intake[i]
      company.opex[i] += firm[f.id].opex[i]
    }
  }
  for (let i = 0; i < n; i++) company.opex[i] += unallocatedOpex[i]

  const built: Ledger = {
    start,
    end,
    days: n,
    firm,
    invoice,
    unattributed,
    unallocatedOpex,
    opexByCategory,
    expenseAllocations,
    company,
  }
  cache.set(store, built)
  return built
}

export function sumArray(ledger: Ledger, arr: Float64Array | undefined, start: ISODate, end: ISODate): Cents {
  if (!arr) return 0
  const s = Math.max(0, dayDiff(ledger.start, start))
  const e = Math.min(ledger.days - 1, dayDiff(ledger.start, end))
  let total = 0
  for (let i = s; i <= e; i++) total += arr[i]
  return total
}

export function buildMetrics(
  revenue: Cents,
  advertising: Cents,
  intake: Cents,
  opex: Cents,
  extra: { invoicedRevenue?: Cents; caseRevenue?: Cents; cases?: number } = {},
): Metrics {
  const totalSpend = advertising + intake + opex
  const profit = revenue - totalSpend
  return {
    revenue,
    advertising,
    intake,
    opex,
    totalSpend,
    profit,
    margin: marginPct(profit, revenue),
    /* Both lines travel with every metric, whichever one `revenue` was
       built from, so a card can always show the other beside it. */
    invoicedRevenue: extra.invoicedRevenue ?? revenue,
    caseRevenue: extra.caseRevenue ?? 0,
    cases: extra.cases ?? 0,
  }
}

export function seriesMetrics(
  ledger: Ledger,
  s: Series,
  start: ISODate,
  end: ISODate,
  basis: 'invoiced' | 'cases' = 'invoiced',
): Metrics {
  const invoiced = sumArray(ledger, s.rev, start, end)
  const delivered = sumArray(ledger, s.caseRev, start, end)
  return buildMetrics(
    basis === 'cases' ? delivered : invoiced,
    sumArray(ledger, s.ad, start, end),
    sumArray(ledger, s.intake, start, end),
    sumArray(ledger, s.opex, start, end),
    { invoicedRevenue: invoiced, caseRevenue: delivered, cases: sumArray(ledger, s.cases, start, end) },
  )
}

export function addMetrics(rows: Metrics[]): Metrics {
  return buildMetrics(
    rows.reduce((a, r) => a + r.revenue, 0),
    rows.reduce((a, r) => a + r.advertising, 0),
    rows.reduce((a, r) => a + r.intake, 0),
    rows.reduce((a, r) => a + r.opex, 0),
    {
      invoicedRevenue: rows.reduce((a, r) => a + r.invoicedRevenue, 0),
      caseRevenue: rows.reduce((a, r) => a + r.caseRevenue, 0),
      cases: rows.reduce((a, r) => a + r.cases, 0),
    },
  )
}

export function sameMetrics(a: Metrics, b: Metrics) {
  return a.revenue === b.revenue && a.advertising === b.advertising && a.intake === b.intake && a.opex === b.opex
}

export function recognizedForAllocation(alloc: ExpenseAllocation, ledger: Ledger, start: ISODate, end: ISODate): Cents {
  const s = dayDiff(ledger.start, start)
  const e = dayDiff(ledger.start, end)
  let total = 0
  alloc.daily.forEach((c, k) => {
    const i = alloc.startIdx + k
    if (i >= s && i <= e && i >= 0 && i < ledger.days) total += c
  })
  return total
}
