import test from 'node:test'
import assert from 'node:assert/strict'
import {
  overlapDays, allocateDailyCost, allocateCommission, computeMargin, spendInPeriod,
} from '../../lib/finance/margin.ts'

const inv = (id: string, start: string, end: string, firmId = 'f') =>
  ({ id, code: id, firmId, period: { start, end }, revenue: 0 })

test('overlapDays counts inclusive days and returns 0 when periods miss', () => {
  assert.equal(overlapDays({ start: '2026-01-01', end: '2026-01-31' },
                           { start: '2026-01-01', end: '2026-01-31' }), 31)
  assert.equal(overlapDays({ start: '2026-01-01', end: '2026-01-10' },
                           { start: '2026-01-05', end: '2026-01-20' }), 6)
  assert.equal(overlapDays({ start: '2026-01-01', end: '2026-01-10' },
                           { start: '2026-02-01', end: '2026-02-10' }), 0)
  // touching at a single day still counts as a day
  assert.equal(overlapDays({ start: '2026-01-01', end: '2026-01-05' },
                           { start: '2026-01-05', end: '2026-01-09' }), 1)
})

test('margin is (revenue - ads - workers) / revenue', () => {
  const m = computeMargin(100000, 40000, 10000)
  assert.equal(m.cost, 50000)
  assert.equal(m.profit, 50000)
  assert.equal(m.margin, 50)
})

test('margin is null without revenue, and negative when costs exceed it', () => {
  assert.equal(computeMargin(0, 500, 100).margin, null)
  const m = computeMargin(1000, 2000, 500)
  assert.equal(m.profit, -1500)
  assert.equal(m.margin, -150)
})

test('spendInPeriod ignores days outside the window', () => {
  const daily = [
    { date: '2026-02-28', spend: 100 },
    { date: '2026-03-01', spend: 200 },
    { date: '2026-03-31', spend: 300 },
    { date: '2026-04-01', spend: 400 },
  ]
  assert.equal(spendInPeriod(daily, { start: '2026-03-01', end: '2026-03-31' }), 500)
})

/* ── allocateDailyCost: advertising and base pay ─────────────────────────── */

test('a daily cost splits between overlapping invoices instead of double counting', () => {
  const daily = [
    { date: '2026-03-01', spend: 100 },   // only i1
    { date: '2026-03-15', spend: 200 },   // i1 and i2
    { date: '2026-04-05', spend: 300 },   // only i2
    { date: '2026-12-01', spend: 400 },   // neither
  ]
  const a = allocateDailyCost(daily, [
    inv('i1', '2026-03-01', '2026-03-31'),
    inv('i2', '2026-03-10', '2026-04-30'),
  ])
  assert.equal(a.byInvoice.i1, 100 + 100)      // all of day 1, half of day 15
  assert.equal(a.byInvoice.i2, 100 + 300)      // half of day 15, all of Apr 5
  assert.equal(a.unallocated, 400)
  assert.equal(a.total, 1000)
  assert.equal(a.byInvoice.i1 + a.byInvoice.i2 + a.unallocated, a.total,
    'parts must add back to the whole')
})

test('allocated daily cost never exceeds what was actually spent', () => {
  // Five invoices all covering the same month — the pathological case that
  // produced $3.27M from $1.02M of spend.
  const daily = Array.from({ length: 31 }, (_, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`, spend: 1000,
  }))
  const invoices = ['a', 'b', 'c', 'd', 'e'].map(id => inv(id, '2026-03-01', '2026-03-31'))
  const a = allocateDailyCost(daily, invoices)
  const allocated = Object.values(a.byInvoice).reduce((s, v) => s + v, 0)
  assert.ok(Math.abs(allocated - 31000) < 0.01, `allocated ${allocated}, spent 31000`)
})

test('a day no invoice covers is reported, not pushed onto the nearest one', () => {
  const a = allocateDailyCost(
    [{ date: '2026-03-10', spend: 500 }, { date: '2026-07-10', spend: 400 }],
    [inv('i1', '2026-03-01', '2026-03-31')])
  assert.equal(a.byInvoice.i1, 500)
  assert.equal(a.unallocated, 400)
  assert.equal(a.total, 900)
})

test('base pay spread over an invoice spanning months collects all of it', () => {
  const daily = [
    { date: '2026-01-15', spend: 1000 },
    { date: '2026-02-15', spend: 1000 },
    { date: '2026-03-15', spend: 1000 },
  ]
  const a = allocateDailyCost(daily, [inv('i1', '2026-01-01', '2026-03-31')])
  assert.equal(a.byInvoice.i1, 3000)
  assert.equal(a.unallocated, 0)
})

/* ── allocateCommission: one case, one invoice ───────────────────────────── */

const comm = (amount: number, date: string, firmId = 'f', invoiceCode: string | null = null) =>
  ({ amount, date, firmId, invoiceCode })

test('a stamped case goes to the invoice it was billed on, period or not', () => {
  // Signed after the period closed but billed on it — a real cost of INV-1.
  const a = allocateCommission(
    [comm(50, '2026-04-20', 'f', 'INV-1')],
    [inv('i1', '2026-03-01', '2026-03-31'), inv('i2', '2026-04-01', '2026-04-30')]
      .map((x, n) => ({ ...x, code: n === 0 ? 'INV-1' : 'INV-2' })))
  assert.equal(a.byInvoice.i1, 50)
  assert.equal(a.byInvoice.i2, 0)
})

test('an unstamped case falls to its own firm\'s invoice covering the sign date', () => {
  const a = allocateCommission([comm(30, '2026-03-10', 'f')], [
    inv('i1', '2026-03-01', '2026-03-31', 'f'),
    inv('other', '2026-03-01', '2026-03-31', 'g'),   // another firm, same days
  ])
  assert.equal(a.byInvoice.i1, 30)
  assert.equal(a.byInvoice.other, 0, 'commission must never cross to another firm')
})

test('commission is never split across overlapping periods', () => {
  const a = allocateCommission([comm(40, '2026-03-15', 'f')], [
    inv('i1', '2026-03-01', '2026-03-31', 'f'),
    inv('i2', '2026-03-10', '2026-04-30', 'f'),      // overlaps i1
  ])
  assert.equal(a.byInvoice.i1 + a.byInvoice.i2, 40, 'the case is worth $40, once')
  assert.equal(a.byInvoice.i1, 40, 'the earlier-starting period takes it')
})

test('commission with no invoice to land on is reported, not dropped', () => {
  const a = allocateCommission(
    [comm(30, '2026-03-10', 'f'), comm(50, '2026-09-10', 'f'), comm(30, '2026-03-10', 'unknown')],
    [inv('i1', '2026-03-01', '2026-03-31', 'f')])
  assert.equal(a.byInvoice.i1, 30)
  assert.equal(a.unallocated, 80)   // out of period, and an unknown firm
  assert.equal(a.total, 110)
  const allocated = Object.values(a.byInvoice).reduce((s, v) => s + v, 0)
  assert.equal(allocated + a.unallocated, a.total)
})
