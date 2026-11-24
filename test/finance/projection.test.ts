import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalCode, projectInvoice } from '../../lib/finance/reporting/projection.ts'
import type { Invoice, InvoiceCase } from '../../lib/finance/reporting/types.ts'

const FIRM = 'firm-1'

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  number: 'INV - 9',
  firmId: FIRM,
  periodStart: '2026-11-04',
  periodEnd: '2026-11-30',
  invoicedCents: 35_000_000,
  receivedCents: null,
  caseCount: 100,
  ...over,
})

/** `n` signed cases, one a day from `from`. */
const signed = (n: number, from = '2026-11-04', code = 'INV-9'): InvoiceCase[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000)
    return {
      firmId: FIRM,
      invoiceCode: code,
      name: `Case ${i + 1}`,
      signedOn: d.toISOString().slice(0, 10),
      status: 'e_signed',
    }
  })

test('an invoice code is matched however it was typed', () => {
  assert.equal(canonicalCode('INV - 9'), 'INV-9')
  assert.equal(canonicalCode('INV-9'), 'INV-9')
  assert.equal(canonicalCode('inv 9'), 'INV-9')
  // The code the workbook writes and the code the book holds must meet.
  assert.equal(canonicalCode('INV - 4'), canonicalCode('INV-4'))
})

test('delivery counts signed cases and ignores replacements', () => {
  const cases: InvoiceCase[] = [
    ...signed(3),
    { firmId: FIRM, invoiceCode: 'INV - 9', name: 'Swapped', signedOn: '2026-11-05', status: 'replacement' },
    { firmId: FIRM, invoiceCode: 'INV-9', name: 'DQ', signedOn: '2026-11-06', status: 'disqualified' },
  ]
  const p = projectInvoice(invoice(), 'LHP', cases, '2026-11-10')
  assert.equal(p.delivered, 3)
  assert.equal(p.replacements, 1)
  assert.equal(p.remaining, 97)
})

test('cases belonging to another firm or invoice are not counted', () => {
  const cases: InvoiceCase[] = [
    ...signed(2),
    ...signed(5, '2026-11-04', 'INV-8'),
    { firmId: 'other-firm', invoiceCode: 'INV-9', name: 'Elsewhere', signedOn: '2026-11-05', status: 'e_signed' },
  ]
  assert.equal(projectInvoice(invoice(), 'LHP', cases, '2026-11-10').delivered, 2)
})

test('the deadline is a window counted from the day the invoice kicked off', () => {
  const p = projectInvoice(invoice(), 'LHP', signed(1), '2026-11-13')
  // Kickoff Nov 4, so day 30 is Dec 4 and day 35 is Dec 9.
  assert.equal(p.deadlineStart, '2026-12-04')
  assert.equal(p.deadlineEnd, '2026-12-09')
  // The billing period's own end is not the commitment.
  assert.notEqual(p.deadlineEnd, p.periodEnd)
})

test('the completion date is the day the last contracted case signed', () => {
  // Ten contracted, twelve delivered: the order was filled by the tenth.
  const p = projectInvoice(invoice({ caseCount: 10 }), 'LHP', signed(12), '2026-11-30')
  assert.equal(p.delivered, 12)
  assert.equal(p.completedOn, '2026-11-13') // Nov 4 + 9 days
  assert.equal(p.state, 'complete')
  // Finished, so there is nothing left to project.
  assert.equal(p.expectedEarliest, null)
  assert.equal(p.expectedLatest, null)
  assert.equal(p.remaining, 0)
  assert.equal(p.slackDays, 26) // Nov 13 → Dec 9
})

test('an unfinished invoice projects a range from today', () => {
  // One a day throughout, so both readings of the pace agree and the
  // range collapses to a single date.
  const p = projectInvoice(invoice({ caseCount: 20 }), 'LHP', signed(10), '2026-11-13')
  assert.equal(p.elapsedDays, 10)
  assert.equal(p.pace, 1)
  assert.equal(p.paceRecent, 1)
  assert.equal(p.completedOn, null)
  assert.equal(p.expectedEarliest, '2026-11-23')
  assert.equal(p.expectedLatest, '2026-11-23')
  assert.equal(p.state, 'on_track')
  assert.equal(p.slackDays, 16) // Nov 23 → Dec 9
})

test('a week slower than the invoice so far opens the range out', () => {
  /* Twenty through Nov 23 and two since: the lifetime pace still reads
     0.8 a day while the last week reads 0.3, and the two bound the answer
     rather than either standing for it alone. */
  const cases = [...signed(20), ...signed(2, '2026-11-25')]
  const p = projectInvoice(invoice({ caseCount: 40 }), 'LHP', cases, '2026-11-30')
  assert.equal(p.delivered, 22)
  assert.ok(p.pace! > p.paceRecent!)
  assert.ok(p.expectedEarliest! < p.expectedLatest!)
})

test('a pace that cannot finish inside the window reads as behind', () => {
  // 5 cases in 10 days against an order of 100: nowhere near.
  const p = projectInvoice(invoice(), 'LHP', signed(5), '2026-11-13')
  assert.equal(p.state, 'behind')
  assert.ok(p.expectedEarliest! > p.deadlineEnd)
  assert.ok(p.slackDays! < 0)
})

test('a range straddling the deadline reads as at risk, not behind', () => {
  /* Fast enough on one reading to land inside the window and too slow on
     the other: the honest answer is that it could go either way. */
  /* 30 of 42 delivered by Nov 30. The last week ran at 1.43 a day, which
     fills the remaining 12 by Dec 9; the invoice's own 1.11 does not get
     there until Dec 11. The window closes on Dec 9. */
  const cases = [...signed(26), ...signed(4, '2026-11-24')]
  const p = projectInvoice(invoice({ caseCount: 42 }), 'LHP', cases, '2026-11-30')
  assert.equal(p.delivered, 30)
  assert.ok(p.expectedEarliest! <= p.deadlineEnd)
  assert.ok(p.expectedLatest! > p.deadlineEnd)
  assert.equal(p.state, 'at_risk')
})

test('nothing delivered means no pace and no projected date', () => {
  const p = projectInvoice(invoice(), 'LHP', [], '2026-11-13')
  assert.equal(p.delivered, 0)
  assert.equal(p.pace, null)
  assert.equal(p.expectedEarliest, null)
  assert.equal(p.expectedLatest, null)
  assert.equal(p.slackDays, null)
  assert.equal(p.state, 'stalled')
})

test('an invoice with no case count has nothing to complete', () => {
  const p = projectInvoice(invoice({ caseCount: null }), 'LHP', signed(4), '2026-11-13')
  assert.equal(p.state, 'untracked')
  assert.equal(p.contracted, null)
  assert.equal(p.percent, null)
  assert.equal(p.completedOn, null)
})

test('the live invoices project the way the workbooks say they should', () => {
  /* LHP INV-9: 90 signed of 100, and J&M INV-4: 46 of 75, both across
     Nov 4–23 with the report as of Nov 24. These are the figures the
     firms' own case management workbooks carry. */
  const lhp = projectInvoice(invoice(), 'LHP', spread(90, '2026-11-04', '2026-11-23'), '2026-11-24')
  assert.equal(lhp.delivered, 90)
  assert.equal(lhp.remaining, 10)
  assert.equal(lhp.elapsedDays, 21) // Nov 4 through Nov 24
  assert.equal(lhp.state, 'on_track')
  assert.ok(lhp.expectedLatest! <= lhp.deadlineEnd)

  const jm = projectInvoice(
    invoice({ id: 'inv-2', number: 'INV - 4', caseCount: 75 }),
    'J&M',
    spread(46, '2026-11-04', '2026-11-23').map((c) => ({ ...c, invoiceCode: 'INV - 4' })),
    '2026-11-24',
  )
  assert.equal(jm.delivered, 46)
  assert.equal(jm.remaining, 29)
  // Against a Dec 4–9 window rather than the end of the billing period,
  // J&M is no longer late — which is the point of measuring it this way.
  assert.ok(jm.expectedLatest! > '2026-11-30')
  assert.notEqual(jm.state, 'complete')
})

/** `n` signed cases spread evenly across a date range. */
function spread(n: number, from: string, to: string): InvoiceCase[] {
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return Array.from({ length: n }, (_, i) => {
    const offset = Math.floor((i * days) / n)
    const d = new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000)
    return {
      firmId: FIRM,
      invoiceCode: 'INV-9',
      name: `Case ${i + 1}`,
      signedOn: d.toISOString().slice(0, 10),
      status: 'e_signed',
    }
  })
}
