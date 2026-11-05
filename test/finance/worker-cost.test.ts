import test from 'node:test'
import assert from 'node:assert/strict'
import {
  basePayByDay, commissionByCase, rateMap, normaliseSessions,
} from '../../lib/finance/worker-cost.ts'

const shift = (profile_id: string, date: string, startH: number, hours: number) => ({
  profile_id, date,
  clock_in: `${date}T${String(startH).padStart(2, '0')}:00:00Z`,
  clock_out: `${date}T${String(startH + hours).padStart(2, '0')}:00:00Z`,
})

/* ── rates ───────────────────────────────────────────────────────────────── */

test('rateMap keeps the newest rate per rep and defaults the rest', () => {
  const m = rateMap([
    { profile_id: 'a', hourly_rate: 7, effective_from: '2026-06-01' },
    { profile_id: 'a', hourly_rate: 5, effective_from: '2026-01-01' },
    { profile_id: 'b', hourly_rate: null },
  ])
  assert.equal(m.a, 7, 'rows arrive newest first; the first one wins')
  assert.equal(m.b, 5, 'a missing rate falls back rather than costing nothing')
  assert.equal(m.c, undefined)
})

/* ── base pay ────────────────────────────────────────────────────────────── */

test('base pay is hours times that rep\'s own rate', () => {
  const days = basePayByDay([shift('a', '2026-03-02', 14, 8)], { a: 7 })
  assert.deepEqual(days, [{ date: '2026-03-02', spend: 56 }])
})

test('overtime past nine hours pays $6, not the rep\'s rate', () => {
  // 11 hours: 9 regular at $10 plus 2 overtime at $6.
  const days = basePayByDay([shift('a', '2026-03-02', 10, 11)], { a: 10 })
  assert.equal(days[0].spend, 9 * 10 + 2 * 6)
})

test('overtime is per rep, not pooled across the floor', () => {
  // Three reps, eight hours each. Pooling would call fifteen of those hours
  // overtime and underpay the day by hundreds.
  const entries = ['a', 'b', 'c'].map(p => shift(p, '2026-03-02', 14, 8))
  const days = basePayByDay(entries, { a: 10, b: 10, c: 10 })
  assert.equal(days[0].spend, 3 * 8 * 10)
})

test('a rep on several days produces a row per day, in order', () => {
  const days = basePayByDay([
    shift('a', '2026-03-03', 14, 4),
    shift('a', '2026-03-01', 14, 4),
  ], { a: 5 })
  assert.deepEqual(days.map(d => d.date), ['2026-03-01', '2026-03-03'])
  assert.equal(days.reduce((s, d) => s + d.spend, 0), 40)
})

test('a rep with no rate on file still costs the default, never zero', () => {
  const days = basePayByDay([shift('ghost', '2026-03-02', 14, 8)], {})
  assert.equal(days[0].spend, 40)
})

/* ── shifts the clock never closed properly ─────────────────────────────── */

test('an old session with no clock-out is capped at one shift, not run to now', () => {
  // The real case: six sessions, the oldest from Sep 8, billing 3,149 hours
  // between them and about $20,000 of overtime that nobody worked.
  const open = { profile_id: 'a', date: '2026-09-08', clock_in: '2026-09-08T14:00:00Z', clock_out: null }
  const { entries, leftOpen } = normaliseSessions([open], '2026-10-29')
  assert.equal(leftOpen, 1)
  assert.equal(entries[0].clock_out, '2026-09-08T23:00:00.000Z')

  const days = basePayByDay([open], { a: 5 })
  assert.equal(days[0].spend, 45, 'nine hours at $5, no overtime')
})

test('a session open today is left alone — that rep is still on the clock', () => {
  const live = { profile_id: 'a', date: '2026-10-29', clock_in: '2026-10-29T14:00:00Z', clock_out: null }
  const { entries, leftOpen } = normaliseSessions([live], '2026-10-29')
  assert.equal(leftOpen, 0)
  assert.equal(entries[0].clock_out, null)
})

test('a clock-out that arrives days later is capped at one shift', () => {
  // The real row: clocked in Oct 17, clocked out Oct 24 — 178 hours.
  const late = { profile_id: 'a', date: '2026-10-17', clock_in: '2026-10-17T12:00:00Z', clock_out: '2026-10-24T22:03:00Z' }
  const { entries, closedLate } = normaliseSessions([late], '2026-10-29')
  assert.equal(closedLate, 1)
  assert.equal(entries[0].clock_out, '2026-10-17T21:00:00.000Z')
})

test('a long but humanly possible day survives, overtime and all', () => {
  const longDay = { profile_id: 'a', date: '2026-10-17', clock_in: '2026-10-17T12:00:00Z', clock_out: '2026-10-18T02:00:00Z' }
  const { entries, closedLate } = normaliseSessions([longDay], '2026-10-29')
  assert.equal(closedLate, 0, '14 hours is a real shift with overtime, not a mistake')
  assert.equal(entries[0].clock_out, longDay.clock_out)

  const days = basePayByDay([longDay], { a: 5 })
  assert.equal(days[0].spend, 9 * 5 + 5 * 6, 'nine regular hours plus five of overtime')
})

test('ordinary closed sessions pass through untouched', () => {
  const done = { profile_id: 'a', date: '2026-09-08', clock_in: '2026-09-08T14:00:00Z', clock_out: '2026-09-08T18:00:00Z' }
  const { entries, leftOpen, closedLate } = normaliseSessions([done], '2026-10-29')
  assert.equal(leftOpen + closedLate, 0)
  assert.deepEqual(entries[0], done)
})

/* ── commission ──────────────────────────────────────────────────────────── */

const c = (id: string, closer: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, closer, contactName: `case ${id}`, firmId: 'f', invoiceCode: null,
  signedAt: `${date}T12:00:00Z`, caseStatus: 'closed', otClose: false, ...extra,
})

test('tiers climb with a rep\'s close count inside the month', () => {
  const cases = Array.from({ length: 27 }, (_, i) => c(`c${i}`, 'Ziyad', '2026-03-10'))
  const rows = commissionByCase(cases)
  assert.equal(rows.length, 27)
  assert.equal(rows[0].amount, 30, 'close 1 is tier 1')
  assert.equal(rows[14].amount, 30, 'close 15 is still tier 1')
  assert.equal(rows[15].amount, 40, 'close 16 moves to tier 2')
  assert.equal(rows[24].amount, 40, 'close 25 is still tier 2')
  assert.equal(rows[25].amount, 50, 'close 26 reaches tier 3')
})

test('the tier count resets each calendar month', () => {
  const march = Array.from({ length: 16 }, (_, i) => c(`m${i}`, 'Ziyad', '2026-03-10'))
  const april = [c('a1', 'Ziyad', '2026-04-02')]
  const rows = commissionByCase([...march, ...april])
  assert.equal(rows[15].amount, 40, 'sixteenth March close is tier 2')
  assert.equal(rows[16].amount, 30, 'first April close is back to tier 1')
})

test('each rep has their own tier count', () => {
  const ziyad = Array.from({ length: 16 }, (_, i) => c(`z${i}`, 'Ziyad', '2026-03-10'))
  const pablo = [c('p1', 'Pablo', '2026-03-11')]
  const rows = commissionByCase([...ziyad, ...pablo])
  const pabloRow = rows.find(r => r.closer === 'Pablo')!
  assert.equal(pabloRow.amount, 30, 'Pablo\'s first close is tier 1 whatever Ziyad did')
})

test('an overtime close pays a flat $50 in place of the tier rate', () => {
  const rows = commissionByCase([
    c('c1', 'Ziyad', '2026-03-10', { otClose: true }),         // would be tier 1 / $30
    c('c2', 'Ziyad', '2026-03-11'),
  ])
  assert.equal(rows[0].amount, 50)
  assert.equal(rows[0].otClose, true)
  assert.equal(rows[1].amount, 30)
})

test('an overtime close still consumes a tier slot', () => {
  // Otherwise marking closes OT would quietly hold a rep in tier 1 forever.
  const cases = Array.from({ length: 16 }, (_, i) =>
    c(`c${i}`, 'Ziyad', '2026-03-10', { otClose: i < 5 }))
  const rows = commissionByCase(cases)
  assert.equal(rows[15].amount, 40, 'the sixteenth close is tier 2 regardless')
})

test('replacements earn nothing and cases with no closer are skipped', () => {
  const rows = commissionByCase([
    c('c1', 'Ziyad', '2026-03-10', { caseStatus: 'replacement' }),
    c('c2', '', '2026-03-10'),
    c('c3', 'Ziyad', '2026-03-10'),
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].caseId, 'c3')
})

test('the same person signed twice on a day by one rep is counted once', () => {
  const rows = commissionByCase([
    { ...c('c1', 'Ziyad', '2026-03-10'), contactName: 'Kamrin Shaw' },
    { ...c('c2', 'Ziyad', '2026-03-10'), contactName: 'Kamrin Shaw' },
    { ...c('c3', 'Ziyad', '2026-03-10'), contactName: 'Lionel Doria' },
  ])
  assert.equal(rows.length, 2)
})

test('a case with no sign date earns nothing — there is no day to charge it to', () => {
  const rows = commissionByCase([{ ...c('c1', 'Ziyad', '2026-03-10'), signedAt: null }])
  assert.equal(rows.length, 0)
})

test('commission carries the firm and invoice stamp through to allocation', () => {
  const rows = commissionByCase([c('c1', 'Ziyad', '2026-03-10', { invoiceCode: 'INV-3' })])
  assert.equal(rows[0].firmId, 'f')
  assert.equal(rows[0].invoiceCode, 'INV-3')
  assert.equal(rows[0].date, '2026-03-10')
})
