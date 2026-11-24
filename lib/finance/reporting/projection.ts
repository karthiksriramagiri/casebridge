import { addDays, dayDiff, daysInclusive, minDate, type ISODate } from './dates'
import type { FinanceDataset, Invoice, InvoiceCase } from './types'

/* Will this invoice finish, and when.

   An invoice is a commitment — a firm is billed for a number of cases over
   a period — and the report could already say what was billed and what it
   cost, but not how much of it had been delivered. That is the question
   anyone asks in the middle of a period, and the only one a report cannot
   answer after the fact.

   Delivery is counted from the firms' own case management workbooks, held
   in invoice_cases. It is tempting to count it from ghl_leads, which
   carries an invoice_code of its own, but the two disagree in both
   directions — 120 cases against LHP's INV-9 where the workbook has 90, 19
   against J&M's INV-4 where the workbook has 46. The workbook is what the
   firm is invoiced against, so the workbook is what is counted. */

/** 'INV - 9', 'INV-9' and 'inv 9' all name the same invoice. */
export function canonicalCode(raw: string): string {
  const m = /(\d+)/.exec(raw ?? '')
  return m ? `INV-${Number(m[1])}` : (raw ?? '').trim().toUpperCase()
}

/* The delivery window, counted from the day the invoice kicked off.

   An invoice is not due on the last day of its billing period — that is an
   accounting boundary, not a commitment. The commitment is to deliver the
   order within 30 to 35 days of kickoff, so the deadline is a window and
   the report has to read as one: a finish inside it is on time, and only a
   finish past its far edge is late. */
export const DEADLINE_MIN_DAYS = 30
export const DEADLINE_MAX_DAYS = 35

/* Pace is read two ways and the projection spans both: across the whole
   invoice so far, and across the last week. One alone is misleading in a
   predictable direction — the lifetime average buries a week that has
   stopped, and the last week alone turns a quiet Thanksgiving into a
   collapse. The two together are the honest answer: a range. */
export const RECENT_WINDOW_DAYS = 7

export type ProjectionState =
  /** Every contracted case delivered. */
  | 'complete'
  /** The whole projected range lands inside the delivery window. */
  | 'on_track'
  /** The range straddles the deadline — it could go either way. */
  | 'at_risk'
  /** Even the fastest reading finishes after the window closes. */
  | 'behind'
  /** Nothing delivered yet, so there is no pace to project from. */
  | 'stalled'
  /** The invoice names no case count, so there is nothing to complete. */
  | 'untracked'

export interface InvoiceProjection {
  invoiceId: string
  number: string
  firmId: string
  firmName: string
  periodStart: ISODate
  periodEnd: ISODate
  /** Cases the invoice bills for. Null when the invoice names no count. */
  contracted: number | null
  /** Signed cases delivered against it. */
  delivered: number
  /** Swapped out rather than delivered — shown, never counted. */
  replacements: number
  remaining: number
  /** Share of the order delivered, 0–100. Null when untracked. */
  percent: number | null
  firstSignedOn: ISODate | null
  lastSignedOn: ISODate | null
  /** Days the invoice has been open, through the completion date or today. */
  elapsedDays: number
  /** Cases a day across the whole invoice. Null when nothing is delivered. */
  pace: number | null
  /** Cases a day across the last week. */
  paceRecent: number | null
  /** The day the order was filled: when the last contracted case signed. */
  completedOn: ISODate | null
  /** The delivery window: kickoff + 30 and kickoff + 35 days. */
  deadlineStart: ISODate
  deadlineEnd: ISODate
  /** The fastest and slowest readings of the finish. Null once complete. */
  expectedEarliest: ISODate | null
  expectedLatest: ISODate | null
  /** Days between the slowest finish and the window closing. Positive is
      inside the window. */
  slackDays: number | null
  state: ProjectionState
  /** The burn-up curve: what has been delivered, and where the pace leads. */
  points: ProjectionPoint[]
}

export interface ProjectionPoint {
  date: ISODate
  /** Cumulative signed cases. Null after today — nothing is known yet. */
  delivered: number | null
  /** The two readings of the pace carried forward from today, which bound
      the projection. Null before today, and when there is no pace. */
  projectedFast: number | null
  projectedSlow: number | null
}

export interface ProjectionSummary {
  rows: InvoiceProjection[]
  /** True when the invoice_cases table has not been created yet. */
  unavailable: boolean
  /** Invoices with delivery recorded against no invoice row, by code. */
  orphanCodes: string[]
}

function countFor(cases: InvoiceCase[], firmId: string, code: string) {
  const mine = cases.filter((c) => c.firmId === firmId && canonicalCode(c.invoiceCode) === code)
  /* A signed case is the only delivered case. A replacement was swapped for
     another and would bill the same delivery twice; a disqualification was
     never deliverable. Both stay in the table — the counts are checkable
     against the workbook only if every row is there. */
  const signed = mine
    .filter((c) => c.status === 'e_signed')
    .sort((a, b) => a.signedOn.localeCompare(b.signedOn))
  return { signed, replacements: mine.filter((c) => c.status === 'replacement').length }
}

export function projectInvoice(
  inv: Invoice,
  firmName: string,
  cases: InvoiceCase[],
  asOf: ISODate,
): InvoiceProjection {
  const code = canonicalCode(inv.number)
  const { signed, replacements } = countFor(cases, inv.firmId, code)
  const delivered = signed.length
  const lastSigned = signed[signed.length - 1]?.signedOn ?? null
  /* What is on the board today. The same as `delivered` for every row the
     workbooks carry, since a case cannot sign in the future — kept apart
     so the projection's starting point stays correct if one ever does. */
  const deliveredAsOf = signed.filter((c) => c.signedOn <= asOf).length
  const contracted = inv.caseCount && inv.caseCount > 0 ? inv.caseCount : null
  const remaining = contracted === null ? 0 : Math.max(0, contracted - delivered)

  /* The day the order was filled is the day its last contracted case
     signed — not the day the final row was added, which for an invoice
     that over-delivers is a different and later date. */
  const completedOn =
    contracted !== null && delivered >= contracted ? signed[contracted - 1].signedOn : null

  /* Pace is measured across the days the invoice was actually open for
     delivery: from the start of its period through the day it completed,
     or through today while it is still running. Measuring to the end of
     the period instead would divide by days that have not happened. */
  const through = completedOn ?? minDate(asOf, inv.periodEnd)
  const elapsedDays = Math.max(1, daysInclusive(inv.periodStart, through))
  const pace = delivered > 0 ? delivered / elapsedDays : null

  const recentFrom = addDays(asOf, -(RECENT_WINDOW_DAYS - 1))
  const recentCount = signed.filter((c) => c.signedOn >= recentFrom && c.signedOn <= asOf).length
  const paceRecent = completedOn ? null : recentCount / RECENT_WINDOW_DAYS

  /* The band the projection is drawn between. A pace of zero is dropped
     rather than used: dividing by it puts the finish at infinity, which is
     not a slower reading of the same answer but no answer at all. */
  const rates = [pace, paceRecent].filter((p): p is number => Boolean(p) && (p as number) > 0)
  const fastest = rates.length ? Math.max(...rates) : null
  const slowest = rates.length ? Math.min(...rates) : null

  /* Projected from today rather than from the start, so a slow week moves
     the date out instead of being averaged away by a fast first week. */
  const project = (rate: number | null) =>
    completedOn === null && contracted !== null && rate
      ? addDays(asOf, Math.ceil(remaining / rate))
      : null
  const expectedEarliest = project(fastest)
  const expectedLatest = project(slowest)

  const deadlineStart = addDays(inv.periodStart, DEADLINE_MIN_DAYS)
  const deadlineEnd = addDays(inv.periodStart, DEADLINE_MAX_DAYS)

  /* Measured against the far edge of the window, from the slowest reading:
     the question "is there a problem" is answered by the worst case still
     landing in time, not the best one. */
  const finish = completedOn ?? expectedLatest
  const slackDays = finish ? dayDiff(finish, deadlineEnd) : null

  const state: ProjectionState =
    contracted === null ? 'untracked'
    : completedOn ? 'complete'
    : !expectedLatest ? 'stalled'
    : expectedLatest <= deadlineEnd ? 'on_track'
    : expectedEarliest && expectedEarliest <= deadlineEnd ? 'at_risk'
    : 'behind'

  /* The curve runs from the first day of the period to whichever comes
     last: the end of the period, the projected finish, or the final
     delivery. Capped, because a pace of one case a fortnight against an
     order of a hundred projects a line two years wide. */
  const horizon = [inv.periodEnd, deadlineEnd, expectedLatest, lastSigned]
    .filter((d): d is ISODate => Boolean(d))
    .reduce((a, b) => (a > b ? a : b), inv.periodEnd)
  const chartEnd = minDate(horizon, addDays(inv.periodStart, 180))
  const points: ProjectionPoint[] = []
  for (let i = 0; i < daysInclusive(inv.periodStart, chartEnd); i++) {
    const date = addDays(inv.periodStart, i)
    const cumulative = signed.filter((c) => c.signedOn <= date).length
    /* The two lines meet on today: the actual curve ends there and the
       projection starts there, so the join is continuous rather than a
       gap the reader has to bridge by eye. */
    const isPast = date <= asOf
    /* Each edge of the band runs at its own rate from today and then flattens
       on the order, so the two lines close into a shape rather than running
       on past the number they were heading for. */
    const edge = (rate: number | null, until: ISODate | null) =>
      rate && until && contracted !== null && date >= asOf && date <= until
        ? Math.round(Math.min(contracted, deliveredAsOf + rate * dayDiff(asOf, date)) * 10) / 10
        : null
    points.push({
      date,
      delivered: isPast ? cumulative : null,
      projectedFast: edge(fastest, expectedLatest),
      projectedSlow: edge(slowest, expectedLatest),
    })
  }

  return {
    invoiceId: inv.id,
    number: inv.number,
    firmId: inv.firmId,
    firmName,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    contracted,
    delivered,
    replacements,
    remaining,
    percent: contracted ? Math.min(100, (delivered / contracted) * 100) : null,
    firstSignedOn: signed[0]?.signedOn ?? null,
    lastSignedOn: lastSigned,
    elapsedDays,
    pace,
    paceRecent,
    completedOn,
    deadlineStart,
    deadlineEnd,
    expectedEarliest,
    expectedLatest,
    slackDays,
    state,
    points,
  }
}

export function buildProjection(
  store: FinanceDataset,
  invoices: Invoice[],
  firmNameById: Record<string, string>,
): ProjectionSummary {
  const rows = invoices.map((inv) =>
    projectInvoice(inv, firmNameById[inv.firmId] ?? inv.firmId, store.invoiceCases, store.dataAsOf),
  )

  /* Delivery recorded against an invoice that was never entered. The
     workbooks go back to INV-1 for every firm while firm_invoices holds
     only the open ones, so this is how a reader learns the projection is
     showing less than the data covers. */
  const known = new Set(store.invoices.map((i) => `${i.firmId}|${canonicalCode(i.number)}`))
  const orphanCodes = [
    ...new Set(
      store.invoiceCases
        .filter((c) => !known.has(`${c.firmId}|${canonicalCode(c.invoiceCode)}`))
        .map((c) => canonicalCode(c.invoiceCode)),
    ),
  ].sort()

  return { rows, unavailable: store.gaps.invoiceCasesMissing, orphanCodes }
}
