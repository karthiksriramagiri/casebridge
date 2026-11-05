import test from 'node:test'
import assert from 'node:assert/strict'
import { clipPeriod, prorateRevenue, clipDaily } from '../../lib/finance/margin.ts'
import { rangeFor, rangeQuery } from '../../app/finance/_lib/ranges.ts'

const p = (start: string, end: string) => ({ start, end })

/* ── clipping ────────────────────────────────────────────────────────────── */

test('a window leaves an invoice it fully contains alone', () => {
  assert.deepEqual(clipPeriod(p('2026-03-05', '2026-03-10'), p('2026-03-01', '2026-03-31')),
                   p('2026-03-05', '2026-03-10'))
})

test('a window cuts an invoice that runs past it', () => {
  assert.deepEqual(clipPeriod(p('2026-02-20', '2026-03-10'), p('2026-03-01', '2026-03-31')),
                   p('2026-03-01', '2026-03-10'))
})

test('an invoice the window misses clips to nothing', () => {
  assert.equal(clipPeriod(p('2026-01-01', '2026-01-31'), p('2026-03-01', '2026-03-31')), null)
})

test('no window means no clipping at all', () => {
  const period = p('2026-01-01', '2026-01-31')
  assert.deepEqual(clipPeriod(period, null), period)
})

/* ── pro-rating ──────────────────────────────────────────────────────────── */

test('a window covering the whole invoice takes all of its revenue', () => {
  assert.equal(prorateRevenue(100000, p('2026-03-01', '2026-03-31'), p('2026-01-01', '2026-12-31')),
               100000)
})

test('half the days means half the money', () => {
  // March 1–31 is 31 days; a window over Mar 1–15 covers 15 of them.
  const got = prorateRevenue(31000, p('2026-03-01', '2026-03-31'), p('2026-03-01', '2026-03-15'))
  assert.equal(Math.round(got), 15000)
})

test('an invoice outside the window earns nothing', () => {
  assert.equal(prorateRevenue(50000, p('2026-01-01', '2026-01-31'), p('2026-03-01', '2026-03-31')), 0)
})

test('pro-rated revenue across adjacent windows adds back to the whole', () => {
  const period = p('2026-03-01', '2026-03-31')
  const first = prorateRevenue(90000, period, p('2026-03-01', '2026-03-15'))
  const second = prorateRevenue(90000, period, p('2026-03-16', '2026-03-31'))
  assert.ok(Math.abs(first + second - 90000) < 0.01,
    `${first} + ${second} should be 90000 — splitting the window must not create or lose revenue`)
})

test('a single-day invoice is not divided by zero', () => {
  assert.equal(prorateRevenue(1000, p('2026-03-05', '2026-03-05'), p('2026-03-01', '2026-03-31')), 1000)
  assert.equal(prorateRevenue(1000, p('2026-03-05', '2026-03-05'), p('2026-04-01', '2026-04-30')), 0)
})

/* ── daily rows ──────────────────────────────────────────────────────────── */

test('clipDaily keeps only the days inside the window, edges included', () => {
  const rows = [
    { date: '2026-02-28', spend: 1 },
    { date: '2026-03-01', spend: 2 },
    { date: '2026-03-31', spend: 3 },
    { date: '2026-04-01', spend: 4 },
  ]
  assert.deepEqual(clipDaily(rows, p('2026-03-01', '2026-03-31')).map(r => r.spend), [2, 3])
  assert.equal(clipDaily(rows, null).length, 4)
})

/* ── presets ─────────────────────────────────────────────────────────────── */

const NOW = new Date('2026-11-04T12:00:00Z')

test('presets resolve to inclusive windows ending today', () => {
  assert.deepEqual(rangeFor('last7', NOW),  { from: '2026-10-29', to: '2026-11-04' })
  assert.deepEqual(rangeFor('last30', NOW), { from: '2026-10-06', to: '2026-11-04' })
  assert.deepEqual(rangeFor('mtd', NOW),    { from: '2026-11-01', to: '2026-11-04' })
  assert.deepEqual(rangeFor('qtd', NOW),    { from: '2026-10-01', to: '2026-11-04' })
  assert.deepEqual(rangeFor('ytd', NOW),    { from: '2026-01-01', to: '2026-11-04' })
})

test('last month is the whole previous month, not a rolling thirty days', () => {
  assert.deepEqual(rangeFor('lastMonth', NOW), { from: '2026-10-01', to: '2026-10-31' })
  // across a year boundary, and into a 29-day February
  assert.deepEqual(rangeFor('lastMonth', new Date('2026-01-15T00:00:00Z')),
                   { from: '2025-12-01', to: '2025-12-31' })
  assert.deepEqual(rangeFor('lastMonth', new Date('2024-03-10T00:00:00Z')),
                   { from: '2024-02-01', to: '2024-02-29' })
})

test('last 7 days counts today as one of the seven', () => {
  const r = rangeFor('last7', NOW)!
  const days = (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 + 1
  assert.equal(days, 7)
})

test('all time has no window, and sends no query', () => {
  assert.equal(rangeFor('all', NOW), null)
  assert.equal(rangeQuery(null), '')
  assert.equal(rangeQuery({ from: '2026-01-01', to: '2026-01-31' }), '?from=2026-01-01&to=2026-01-31')
})
