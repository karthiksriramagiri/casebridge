import {
  addDays,
  addMonths,
  addYears,
  dayDiff,
  daysInMonth,
  daysInclusive,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  formatDay,
  formatMonth,
  formatRange,
  maxDate,
  minDate,
  quarterLabel,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  toDate,
  type ISODate,
} from './dates'
import {
  addMetrics,
  buildMetrics,
  CALC_VERSION,
  getLedger,
  recognizedForAllocation,
  sameMetrics,
  seriesMetrics,
  sumArray,
  UNALLOCATED,
  type Ledger,
} from './ledger'
import { pctChange, type Cents } from './money'
import type {
  ComparisonInfo,
  EarnoutResult,
  ExpenseRow,
  FirmRow,
  InvoiceRow,
  Metrics,
  PeriodComparisonRow,
  PeriodWindow,
  ReportData,
  TargetProgress,
  TrendPoint,
} from './report-types'
import { OPEX_CATEGORIES, OPEX_CATEGORY_LABELS, type FinanceDataset, type OpexCategory, type ReportFilters } from './types'
import { COST_START } from './load'

type Scope = { kind: 'company' } | { kind: 'firm'; firmId: string } | { kind: 'invoice'; invoiceId: string; firmId: string }

function makeWindow(start: ISODate, end: ISODate, unitDays: number, label?: string): PeriodWindow {
  const days = daysInclusive(start, end)
  return { start, end, days, unitDays, partial: days < unitDays, label: label ?? formatRange(start, end) }
}

function seriesFor(ledger: Ledger, scope: Scope) {
  if (scope.kind === 'company') return ledger.company
  if (scope.kind === 'firm') return ledger.firm[scope.firmId]
  return ledger.invoice[scope.invoiceId]
}

/* How a window is to be read: which revenue line, and whether the Sanguine
   royalty is one of its costs. The two travel together because every
   helper below already threads the basis, so nothing can be given one and
   forgotten the other. */
type Reading = { basis: 'invoiced' | 'cases'; sanguine: boolean }

function metricsFor(
  ledger: Ledger,
  scope: Scope,
  start: ISODate,
  end: ISODate,
  r: Reading = { basis: 'invoiced', sanguine: false },
): Metrics {
  if (start > end) return buildMetrics(0, 0, 0, 0)
  return seriesMetrics(ledger, seriesFor(ledger, scope), start, end, r.basis, r.sanguine)
}

function equivalentElapsed(unitStart: ISODate, end: ISODate, prevUnitStart: ISODate, prevUnitEnd: ISODate) {
  const elapsed = daysInclusive(unitStart, end)
  return { start: prevUnitStart, end: minDate(addDays(prevUnitStart, elapsed - 1), prevUnitEnd) }
}

function resolveComparison(f: ReportFilters): { start: ISODate; end: ISODate; label: string; method: string } | null {
  if (f.comparison === 'none') return null
  const len = daysInclusive(f.start, f.end)
  if (f.comparison === 'previous_year') {
    return {
      start: addYears(f.start, -1),
      end: addYears(f.end, -1),
      label: 'vs. same period last year',
      method: 'Identical calendar dates shifted back one year (Feb 29 clamps to Feb 28).',
    }
  }
  switch (f.preset) {
    case 'today':
    case 'yesterday':
      return { start: addDays(f.start, -1), end: addDays(f.end, -1), label: 'vs. prior day', method: 'Single day compared to the preceding day.' }
    case 'wtd': {
      const p = equivalentElapsed(f.start, f.end, addDays(f.start, -7), addDays(f.start, -1))
      return { ...p, label: 'vs. same days last week', method: `Week to date (${len} of 7 days) compared to the same elapsed days of the prior week.` }
    }
    case 'mtd': {
      const ps = addMonths(f.start, -1)
      const p = equivalentElapsed(f.start, f.end, ps, endOfMonth(ps))
      return { ...p, label: 'vs. same days last month', method: `Month to date (${len} days) compared to the same elapsed days of the prior month, not the full prior month.` }
    }
    case 'qtd': {
      const ps = addMonths(f.start, -3)
      const p = equivalentElapsed(f.start, f.end, ps, endOfQuarter(ps))
      return { ...p, label: 'vs. same days last quarter', method: `Quarter to date (${len} days) compared to the same elapsed days of the prior quarter.` }
    }
    case 'ytd': {
      return { start: addYears(f.start, -1), end: addYears(f.end, -1), label: 'vs. same period last year', method: 'Year to date compared to the same dates in the prior year.' }
    }
    case 'last_month': {
      const s = addMonths(f.start, -1)
      return { start: s, end: endOfMonth(s), label: 'vs. prior month', method: 'Completed month compared to the full preceding month.' }
    }
    case 'last_quarter': {
      const s = addMonths(f.start, -3)
      return { start: s, end: endOfQuarter(s), label: 'vs. prior quarter', method: 'Completed quarter compared to the full preceding quarter.' }
    }
    case 'last_week':
      return { start: addDays(f.start, -7), end: addDays(f.end, -7), label: 'vs. prior week', method: 'Completed week compared to the preceding week.' }
    default:
      return {
        start: addDays(f.start, -len),
        end: addDays(f.start, -1),
        label: `vs. prior ${len} days`,
        method: `Compared to the immediately preceding window of equal length (${len} days).`,
      }
  }
}

function periodComparisons(ledger: Ledger, scope: Scope, anchor: ISODate, dataStart: ISODate, reading: Reading): PeriodComparisonRow[] {
  const rows: Omit<PeriodComparisonRow, 'currentMetrics' | 'previousMetrics' | 'dataComplete'>[] = []

  const prevDay = addDays(anchor, -1)
  rows.push({
    key: 'dod',
    label: 'DoD',
    current: makeWindow(anchor, anchor, 1),
    previous: makeWindow(prevDay, prevDay, 1),
    method: 'Single day vs. the prior day',
  })

  const ws = startOfWeek(anchor)
  const wElapsed = equivalentElapsed(ws, anchor, addDays(ws, -7), addDays(ws, -1))
  rows.push({
    key: 'wow',
    label: 'WoW',
    current: makeWindow(ws, anchor, 7),
    previous: makeWindow(wElapsed.start, wElapsed.end, 7),
    method: 'Week to date vs. same elapsed days of prior week',
  })

  const ms = startOfMonth(anchor)
  const pms = addMonths(ms, -1)
  const mElapsed = equivalentElapsed(ms, anchor, pms, endOfMonth(pms))
  rows.push({
    key: 'mom',
    label: 'MoM',
    current: makeWindow(ms, anchor, daysInclusive(ms, endOfMonth(ms))),
    previous: makeWindow(mElapsed.start, mElapsed.end, daysInclusive(pms, endOfMonth(pms))),
    method: 'Month to date vs. same elapsed days of prior month',
  })

  const qs = startOfQuarter(anchor)
  const pqs = addMonths(qs, -3)
  const qElapsed = equivalentElapsed(qs, anchor, pqs, endOfQuarter(pqs))
  rows.push({
    key: 'qoq',
    label: 'QoQ',
    current: makeWindow(qs, anchor, daysInclusive(qs, endOfQuarter(qs))),
    previous: makeWindow(qElapsed.start, qElapsed.end, daysInclusive(pqs, endOfQuarter(pqs))),
    method: 'Quarter to date vs. same elapsed days of prior quarter',
  })

  const ys = startOfYear(anchor)
  const pys = addYears(ys, -1)
  rows.push({
    key: 'yoy',
    label: 'YoY',
    current: makeWindow(ys, anchor, daysInclusive(ys, endOfYear(ys))),
    previous: makeWindow(pys, addYears(anchor, -1), daysInclusive(pys, endOfYear(pys))),
    method: 'Year to date vs. same dates of prior year',
  })

  return rows.map((r) => ({
    ...r,
    dataComplete: r.previous.start >= dataStart,
    currentMetrics: metricsFor(ledger, scope, r.current.start, r.current.end, reading),
    previousMetrics: metricsFor(ledger, scope, maxDate(r.previous.start, dataStart), r.previous.end, reading),
  }))
}

function bucketBounds(date: ISODate, g: ReportFilters['granularity']): { start: ISODate; end: ISODate } {
  switch (g) {
    case 'daily':
      return { start: date, end: date }
    case 'weekly': {
      const s = startOfWeek(date)
      return { start: s, end: addDays(s, 6) }
    }
    case 'monthly':
      return { start: startOfMonth(date), end: endOfMonth(date) }
    case 'quarterly':
      return { start: startOfQuarter(date), end: endOfQuarter(date) }
    case 'yearly':
      return { start: startOfYear(date), end: endOfYear(date) }
  }
}

function bucketLabel(start: ISODate, end: ISODate, g: ReportFilters['granularity']) {
  switch (g) {
    case 'daily':
      return formatDay(start, false)
    case 'weekly':
      return formatRange(start, end).replace(/, \d{4}$/, '')
    case 'monthly':
      return formatMonth(start)
    case 'quarterly':
      return quarterLabel(start)
    case 'yearly':
      return start.slice(0, 4)
  }
}

function buildTrend(ledger: Ledger, scope: Scope, f: ReportFilters, reading: Reading): TrendPoint[] {
  const points: TrendPoint[] = []
  let cursor = f.start
  let guard = 0
  while (cursor <= f.end && guard++ < 1000) {
    const unit = bucketBounds(cursor, f.granularity)
    const s = maxDate(unit.start, f.start)
    const e = minDate(unit.end, f.end)
    points.push({
      key: s,
      label: bucketLabel(s, e, f.granularity),
      start: s,
      end: e,
      partial: s !== unit.start || e !== unit.end,
      ...metricsFor(ledger, scope, s, e, reading),
    })
    cursor = addDays(unit.end, 1)
  }
  return points
}

/** Prorates a monthly target to an arbitrary window: each day earns monthly / days-in-that-month. */
function proratedMonthlyTarget(monthly: Cents, start: ISODate, end: ISODate): Cents {
  let total = 0
  let cursor = start
  while (cursor <= end) {
    const mEnd = minDate(endOfMonth(cursor), end)
    const d = toDate(cursor)
    total += (monthly * daysInclusive(cursor, mEnd)) / daysInMonth(d.getUTCFullYear(), d.getUTCMonth())
    cursor = addDays(mEnd, 1)
  }
  return Math.round(total)
}

function buildTargets(store: FinanceDataset, ledger: Ledger, scope: Scope, anchor: ISODate, reading: Reading): TargetProgress[] | null {
  if (scope.kind === 'invoice') return null
  if (!store.targets) return null
  const monthlyFirm = scope.kind === 'firm' ? store.targets.firmMonthly[scope.firmId] ?? 0 : null
  const c = store.targets.company
  const periods: { key: TargetProgress['key']; label: string; start: ISODate; end: ISODate; periodLabel: string; configured: Cents }[] = [
    { key: 'daily', label: 'Daily', start: anchor, end: anchor, periodLabel: formatDay(anchor), configured: c.daily },
    { key: 'weekly', label: 'Weekly', start: startOfWeek(anchor), end: addDays(startOfWeek(anchor), 6), periodLabel: '', configured: c.weekly },
    { key: 'monthly', label: 'Monthly', start: startOfMonth(anchor), end: endOfMonth(anchor), periodLabel: formatMonth(anchor), configured: c.monthly },
    { key: 'quarterly', label: 'Quarterly', start: startOfQuarter(anchor), end: endOfQuarter(anchor), periodLabel: quarterLabel(anchor), configured: c.quarterly },
    { key: 'annual', label: 'Annual', start: startOfYear(anchor), end: endOfYear(anchor), periodLabel: anchor.slice(0, 4), configured: c.annual },
  ]
  return periods.map((p) => {
    const target = monthlyFirm === null ? p.configured : proratedMonthlyTarget(monthlyFirm, p.start, p.end)
    const actual = metricsFor(ledger, scope, p.start, anchor, reading).revenue
    const elapsedDays = daysInclusive(p.start, anchor)
    const totalDays = daysInclusive(p.start, p.end)
    const expectedToDate = Math.round((target * elapsedDays) / totalDays)
    const paceDelta = actual - expectedToDate
    let status: TargetProgress['status'] = 'no_target'
    if (target > 0) {
      const ratio = actual / Math.max(1, expectedToDate)
      status = ratio >= 1.02 ? 'ahead' : ratio <= 0.98 ? 'behind' : 'on_pace'
    }
    return {
      key: p.key,
      label: p.label,
      periodLabel: p.periodLabel || formatRange(p.start, p.end),
      start: p.start,
      end: p.end,
      actual,
      target,
      attainment: target > 0 ? (actual / target) * 100 : null,
      remaining: Math.max(0, target - actual),
      elapsedDays,
      totalDays,
      expectedToDate,
      paceDelta,
      projected: Math.round((actual / elapsedDays) * totalDays),
      status,
      source: monthlyFirm === null ? 'configured' : 'derived',
    }
  })
}

function opexByCategoryFor(ledger: Ledger, scope: Scope, start: ISODate, end: ISODate) {
  if (scope.kind === 'invoice') return null
  const out = {} as Record<OpexCategory, Cents>
  for (const cat of OPEX_CATEGORIES) {
    const byFirm = ledger.opexByCategory[cat]
    out[cat] =
      scope.kind === 'firm'
        ? sumArray(ledger, byFirm[scope.firmId], start, end)
        : Object.values(byFirm).reduce((a, arr) => a + sumArray(ledger, arr, start, end), 0)
  }
  return out
}

/* The whole report, from one dataset and one set of filters.

   Pure: hand it the same dataset twice and it returns the same numbers.
   The loader does the I/O, this does the arithmetic, and keeping those
   apart is what makes the figures testable at all. */
export function buildReport(
  store: FinanceDataset,
  f: ReportFilters,
  /* Whether the Sanguine royalty is one of this report's costs. Off by
     default, because the earn-out and every figure read against it are
     computed without it (APA §2.9); the Reporting Center turns it on
     because the operating view is what the company actually keeps. */
  { sanguine: withSanguine = false }: { sanguine?: boolean } = {},
): ReportData {
  const ledger = getLedger(store)
  const firmsById = Object.fromEntries(store.firms.map((x) => [x.id, x]))
  const invoicesById = Object.fromEntries(store.invoices.map((x) => [x.id, x]))

  const selectedInvoice = f.invoiceId ? invoicesById[f.invoiceId] : undefined
  const firmId = selectedInvoice ? selectedInvoice.firmId : f.firmId && firmsById[f.firmId] ? f.firmId : null
  const filters: ReportFilters = { ...f, firmId, invoiceId: selectedInvoice ? selectedInvoice.id : null }
  const scope: Scope = selectedInvoice
    ? { kind: 'invoice', invoiceId: selectedInvoice.id, firmId: selectedInvoice.firmId }
    : firmId
      ? { kind: 'firm', firmId }
      : { kind: 'company' }

  const window = makeWindow(f.start, f.end, daysInclusive(f.start, f.end))
  const basis = f.basis
  const reading: Reading = { basis, sanguine: withSanguine }
  const current = metricsFor(ledger, scope, f.start, f.end, reading)

  const cmp = resolveComparison(f)
  const comparison: ComparisonInfo | null = cmp
    ? {
        label: cmp.label,
        method: cmp.method,
        window: makeWindow(cmp.start, cmp.end, daysInclusive(cmp.start, cmp.end)),
        dataComplete: cmp.start >= store.dataStart,
        metrics: metricsFor(ledger, scope, maxDate(cmp.start, store.dataStart), cmp.end, reading),
      }
    : null

  // Target attainment for the selected window (prorated monthly target)
  const monthlyTarget =
    scope.kind === 'company' ? store.targets?.company.monthly ?? null : scope.kind === 'firm' ? store.targets?.firmMonthly[scope.firmId] ?? null : null
  const rangeTarget = monthlyTarget ? proratedMonthlyTarget(monthlyTarget, f.start, f.end) : null
  const prevRangeTarget = monthlyTarget && comparison ? proratedMonthlyTarget(monthlyTarget, comparison.window.start, comparison.window.end) : null

  // Firms
  const comparisonMetrics = (s: Scope) =>
    comparison && comparison.dataComplete ? metricsFor(ledger, s, comparison.window.start, comparison.window.end, reading) : null
  const visibleFirms = scope.kind === 'company' ? store.firms : store.firms.filter((x) => x.id === firmId)
  const firmRows: FirmRow[] = visibleFirms.map((firm) => {
    const s: Scope = { kind: 'firm', firmId: firm.id }
    const m = metricsFor(ledger, s, f.start, f.end, reading)
    const prev = comparisonMetrics(s)
    const monthly = store.targets?.firmMonthly[firm.id] ?? 0
    const target = monthly ? proratedMonthlyTarget(monthly, f.start, f.end) : null
    return {
      firmId: firm.id,
      name: firm.name,
      invoiceCount: store.invoices.filter((i) => i.firmId === firm.id && i.periodStart <= f.end && i.periodEnd >= f.start).length,
      metrics: m,
      previous: prev,
      revenueGrowth: prev ? pctChange(m.revenue, prev.revenue) : null,
      profitGrowth: prev ? pctChange(m.profit, prev.profit) : null,
      target,
      targetAttainment: target ? (m.revenue / target) * 100 : null,
    }
  })
  const unallocatedInRange = sumArray(ledger, ledger.unallocatedOpex, f.start, f.end)
  if (scope.kind === 'company') {
    firmRows.push({
      firmId: null,
      name: 'Company-level OpEx (unallocated)',
      invoiceCount: 0,
      metrics: buildMetrics(0, 0, 0, unallocatedInRange),
      previous: null,
      revenueGrowth: null,
      profitGrowth: null,
      target: null,
      targetAttainment: null,
    })
  }
  const firmTotal = scope.kind === 'invoice' ? metricsFor(ledger, { kind: 'firm', firmId: firmId! }, f.start, f.end, reading) : current

  // Invoices
  const visibleInvoices = store.invoices
    .filter((i) => i.periodStart <= f.end && i.periodEnd >= f.start)
    .filter((i) => (scope.kind === 'invoice' ? i.id === scope.invoiceId : scope.kind === 'firm' ? i.firmId === scope.firmId : true))
    .sort((a, b) => (a.periodStart === b.periodStart ? a.number.localeCompare(b.number) : b.periodStart.localeCompare(a.periodStart)))
  const invoiceRows: InvoiceRow[] = visibleInvoices.map((inv) => ({
    invoiceId: inv.id,
    number: inv.number,
    firmId: inv.firmId,
    firmName: firmsById[inv.firmId]?.name ?? inv.firmId,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    invoicedCents: inv.invoicedCents,
    receivedCents: inv.receivedCents,
    metrics: metricsFor(ledger, { kind: 'invoice', invoiceId: inv.id, firmId: inv.firmId }, f.start, f.end, reading),
    kind: 'invoice',
  }))
  if (scope.kind !== 'invoice') {
    const firmIds = scope.kind === 'firm' ? [scope.firmId] : store.firms.map((x) => x.id)
    /* The same reading as everything else. A case signed on a day no
       invoice was open lands here, and its royalty has to land with it or
       the invoice table stops summing to the company total. */
    const ua = firmIds.map((id) =>
      seriesMetrics(ledger, ledger.unattributed[id], f.start, f.end, reading.basis, reading.sanguine))
    const unattributed = addMetrics(ua)
    if (unattributed.totalSpend !== 0) {
      invoiceRows.push({
        invoiceId: null,
        number: 'Costs outside invoice periods',
        firmId: null,
        firmName: '—',
        periodStart: null,
        periodEnd: null,
        invoicedCents: null,
        receivedCents: null,
        metrics: unattributed,
        kind: 'unattributed',
      })
    }
    if (scope.kind === 'company' && unallocatedInRange !== 0) {
      invoiceRows.push({
        invoiceId: null,
        number: 'Company-level OpEx (unallocated)',
        firmId: null,
        firmName: '—',
        periodStart: null,
        periodEnd: null,
        invoicedCents: null,
        receivedCents: null,
        metrics: buildMetrics(0, 0, 0, unallocatedInRange),
        kind: 'unallocated',
      })
    }
  }

  // OpEx
  const byCategory = opexByCategoryFor(ledger, scope, f.start, f.end)
  const allocatedOpex = current.opex - (scope.kind === 'company' ? unallocatedInRange : 0)
  const expenses: ExpenseRow[] = store.expenses
    .filter((e) => e.servicePeriodStart <= f.end && e.servicePeriodEnd >= f.start)
    .map((e) => {
      const allocs = ledger.expenseAllocations[e.id] ?? []
      const shares = allocs.map((a) => ({
        firmId: a.firmKey === UNALLOCATED ? null : a.firmKey,
        firmName: a.firmKey === UNALLOCATED ? 'Company-level (unallocated)' : firmsById[a.firmKey]?.name ?? a.firmKey,
        allocatedCents: a.allocatedCents,
        recognizedInRange: recognizedForAllocation(a, ledger, f.start, f.end),
      }))
      const recognizedInRange = shares.reduce((a, s) => a + s.recognizedInRange, 0)
      const recognizedForSelection =
        scope.kind === 'company' ? recognizedInRange : shares.filter((s) => s.firmId === firmId).reduce((a, s) => a + s.recognizedInRange, 0)
      return { ...e, shares, recognizedInRange, recognizedForSelection }
    })
    .filter((e) => scope.kind === 'company' || e.firmIds.includes(firmId!) )
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || a.vendor.localeCompare(b.vendor))

  // Earn-out (contractual metric, kept separate from operating profit)
  /* Only when an agreement has actually been configured. An earn-out with
     no contract behind it is a number someone would read as owed. */
  let earnout: EarnoutResult | null = null
  const cfg = store.earnout
  if (scope.kind !== 'invoice' && cfg) {
    const deductions: { label: string; cents: Cents }[] = []
    if (cfg.deductAdvertising) deductions.push({ label: 'Advertising', cents: current.advertising })
    if (cfg.deductIntake) deductions.push({ label: 'Intake / worker costs', cents: current.intake })
    for (const cat of cfg.eligibleOpexCategories) {
      const byFirm = ledger.opexByCategory[cat]
      const keys = scope.kind === 'firm' ? [scope.firmId] : Object.keys(byFirm).filter((k) => k !== UNALLOCATED || cfg.deductUnallocatedOpex)
      const cents = keys.reduce((a, k) => a + sumArray(ledger, byFirm[k], f.start, f.end), 0)
      deductions.push({ label: `OpEx — ${OPEX_CATEGORY_LABELS[cat]}`, cents })
    }
    const metric = current.revenue - deductions.reduce((a, d) => a + d.cents, 0)
    earnout = { config: cfg, revenue: current.revenue, deductions, metric, amount: Math.round((Math.max(0, metric) * cfg.rateBps) / 10_000) }
  }

  const scopeLabel = selectedInvoice
    ? `${selectedInvoice.number} · ${firmsById[selectedInvoice.firmId]?.name}`
    : firmId
      ? firmsById[firmId].name
      : 'All law firms'

  const firmRowsTotal = addMetrics(firmRows.map((r) => r.metrics))
  const invoiceRowsTotal = addMetrics(invoiceRows.map((r) => r.metrics))

  return {
    meta: {
      calcVersion: CALC_VERSION,
      generatedAt: new Date().toISOString(),
      dataStart: store.dataStart,
      dataAsOf: store.dataAsOf,
      gaps: store.gaps,
      filters,
      window,
      scope: scope.kind,
      scopeLabel,
      firms: store.firms,
      invoiceOptions: store.invoices
        .filter((i) => i.periodStart <= f.end && i.periodEnd >= f.start)
        .map((i) => ({ id: i.id, number: i.number, firmId: i.firmId, periodStart: i.periodStart, periodEnd: i.periodEnd })),
    },
    current,
    comparison,
    /* Cost per acquisition, anchored at the day cost tracking began.

       It is not scoped to the selected range, and that is the point. Ad
       spend and the case it bought are weeks apart — a case signed today
       was paid for by spend that started before it — so a day's ads over a
       day's cases is two unrelated numbers divided by each other. Over the
       whole period since costs were first recorded, both halves describe
       the same run of work and the ratio means something.

       It starts at COST_START because that is the first day advertising
       exists in this report at all. Reaching back further would divide a
       partial spend figure by a complete case count and read far too
       cheap. */
    cpa: (() => {
      const from = maxDate(COST_START, store.dataStart)
      if (from > f.end) return null
      const span = metricsFor(ledger, scope, from, f.end, reading)
      return {
        since: from,
        end: f.end,
        advertising: span.advertising,
        cases: span.cases,
        /* Advertising only. Intake is a cost of running the desk, not of
           buying the case, and folding it in would answer a different
           question than the one "CPA" asks. */
        cpa: span.cases > 0 ? Math.round(span.advertising / span.cases) : null,
      }
    })(),
    targetAttainment: {
      target: rangeTarget,
      attainment: rangeTarget ? (current.revenue / rangeTarget) * 100 : null,
      previousAttainment: prevRangeTarget && comparison?.dataComplete ? (comparison.metrics.revenue / prevRangeTarget) * 100 : null,
    },
    periodComparisons: periodComparisons(ledger, scope, f.end, store.dataStart, reading),
    trend: buildTrend(ledger, scope, f, reading),
    breakdown: {
      advertising: current.advertising,
      intake: current.intake,
      opex: current.opex,
      opexByCategory: byCategory,
      allocatedOpex,
      unallocatedOpex: scope.kind === 'company' ? unallocatedInRange : 0,
    },
    targets: (() => {
      const items = buildTargets(store, ledger, scope, f.end, reading)
      if (!items || !store.targets) return null
      return { items, configured: store.targets.company, firmMonthly: store.targets.firmMonthly }
    })(),
    firms: { rows: firmRows, total: firmTotal, reconciled: scope.kind === 'invoice' || sameMetrics(firmRowsTotal, firmTotal) },
    invoices: { rows: invoiceRows, total: current, reconciled: sameMetrics(invoiceRowsTotal, current) },
    opex: {
      total: current.opex,
      previous: comparison?.dataComplete ? comparison.metrics.opex : null,
      pctChange: comparison?.dataComplete ? pctChange(current.opex, comparison.metrics.opex) : null,
      pctOfRevenue: current.revenue ? (current.opex / current.revenue) * 100 : null,
      byCategory,
      allocated: allocatedOpex,
      unallocated: scope.kind === 'company' ? unallocatedInRange : 0,
      expenses,
    },
    earnout,
  }
}

export function daysBetween(a: ISODate, b: ISODate) {
  return dayDiff(a, b)
}
