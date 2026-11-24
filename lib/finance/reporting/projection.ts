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

export type ProjectionState =
  /** Every contracted case delivered. */
  | 'complete'
  /** On pace to finish on or before the period ends. */
  | 'on_track'
  /** On pace, but not before the period ends. */
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
  /** Cases a day across those days. Null when nothing has been delivered. */
  pace: number | null
  /** The day the order was filled: when the last contracted case signed. */
  completedOn: ISODate | null
  /** Where today's pace puts the finish. Null once complete, or if stalled. */
  expectedCompletion: ISODate | null
  /** Days between the finish and the end of the period. Positive is early. */
  slackDays: number | null
  state: ProjectionState
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

  /* Projected from today rather than from the start, so a slow week moves
     the date out instead of being averaged away by a fast first week. */
  const expectedCompletion =
    completedOn === null && contracted !== null && pace
      ? addDays(asOf, Math.ceil(remaining / pace))
      : null

  const finish = completedOn ?? expectedCompletion
  const slackDays = finish ? dayDiff(finish, inv.periodEnd) : null

  const state: ProjectionState =
    contracted === null ? 'untracked'
    : completedOn ? 'complete'
    : !pace ? 'stalled'
    : (slackDays ?? 0) >= 0 ? 'on_track'
    : 'behind'

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
    lastSignedOn: signed[signed.length - 1]?.signedOn ?? null,
    elapsedDays,
    pace,
    completedOn,
    expectedCompletion,
    slackDays,
    state,
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
