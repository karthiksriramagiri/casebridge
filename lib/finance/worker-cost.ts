/* ═══════════════════════════════════════════════════════════════════════════
   What the reps cost, taken from the Team Center.

   There is no separate payroll in the Financial Center any more. A rep's pay
   is already worked out in two places that reps themselves see — their hours
   on the clock and the commission on each case they close — and a second set
   of numbers kept by hand would only drift from the ones people are actually
   paid. So this module reads the Team Center's own tables and applies the
   Team Center's own rules from lib/pay.ts.

   Worker cost splits into two parts that reach an invoice differently:

     base pay    hours × that rep's rate, overtime past nine hours at $6.
                 A rep works every firm in the same shift, so a day's base pay
                 belongs to every invoice open that day, divided between them.

     commission  earned on one case, for one firm, on the day it signed — so
                 it goes straight to that firm's invoice, with no splitting.

   Commission follows the rep-facing rules: tiers that reset each calendar
   month, replacements earning nothing, and an overtime close paying a flat
   $50 in place of the tier rate.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  billableHoursForDay, splitOvertimeHours, grossPay,
  tierCommission, COMMISSION_OT_CLOSE,
} from '@/lib/pay'

export const DEFAULT_HOURLY_RATE = 5

/** A full shift. Also what a forgotten clock-out is counted as. */
export const REGULAR_SHIFT_HOURS = 9

/* The longest a single session can plausibly be and still be a day someone
   worked. Past this it is a clock-out that never happened: the table holds
   one session of 178 hours, clocked in on Oct 17 and out on Oct 24. Set well
   above a long day so genuine overtime — and there is plenty of it — survives
   untouched. */
export const MAX_SESSION_HOURS = 16

export type TimeEntry = {
  profile_id: string
  date: string                    // YYYY-MM-DD
  clock_in: string
  clock_out: string | null
}

export type PayRate = {
  profile_id: string
  hourly_rate: number | null
  effective_from?: string | null
}

export type CaseRow = {
  id: string
  contactName: string | null
  firmId: string | null
  invoiceCode: string | null
  signedAt: string | null         // qualified_at
  caseStatus: string | null
  closer: string | null
  otClose: boolean
}

export type DailyAmount = { date: string; spend: number }

export type CommissionRow = {
  caseId: string
  date: string
  firmId: string | null
  invoiceCode: string | null
  closer: string
  amount: number
  tier: number
  otClose: boolean
}

/** Most recent rate per rep. Rows must arrive newest effective_from first. */
export function rateMap(rates: PayRate[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rates) {
    if (r.profile_id && !(r.profile_id in out)) {
      out[r.profile_id] = Number(r.hourly_rate ?? DEFAULT_HOURLY_RATE) || DEFAULT_HOURLY_RATE
    }
  }
  return out
}

/* Shifts the clock never closed properly.

   Two versions of the same mistake, and both of them bill hours nobody
   worked:

     left open    billableHoursForDay measures an open session up to the
                  current moment, which is right for a rep on the clock right
                  now and badly wrong for one who forgot to clock out seven
                  weeks ago. Six of those, the oldest from early September,
                  were billing 3,149 hours between them.

     closed late  the clock-out arrives days after the clock-in. One session
                  runs 178 hours, another 103.

   Either way the session is counted as one full shift: a guess, but a bounded
   one in the right order of magnitude, where the alternative grows by $6 an
   hour forever. Today's open session is left alone — that rep really is still
   working — and so is any ordinary long day, so real overtime survives. */
export function normaliseSessions(
  entries: TimeEntry[],
  today = new Date().toISOString().slice(0, 10),
): { entries: TimeEntry[]; leftOpen: number; closedLate: number } {
  let leftOpen = 0
  let closedLate = 0

  const asShift = (e: TimeEntry): TimeEntry => ({
    ...e,
    clock_out: new Date(
      new Date(e.clock_in).getTime() + REGULAR_SHIFT_HOURS * 3_600_000,
    ).toISOString(),
  })

  const out = entries.map(e => {
    if (!e.clock_out) {
      if (String(e.date).slice(0, 10) >= today) return e   // still on the clock
      leftOpen++
      return asShift(e)
    }
    const hours = (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3_600_000
    if (hours > MAX_SESSION_HOURS) {
      closedLate++
      return asShift(e)
    }
    return e
  })

  return { entries: out, leftOpen, closedLate }
}

/* Base pay for every day anyone was on the clock.

   Overtime is split per rep per day, not across the whole day's total — nine
   hours is one person's shift, and pooling everyone's hours first would turn
   a normal day for three reps into eighteen hours of overtime. */
export function basePayByDay(
  rawEntries: TimeEntry[],
  rates: Record<string, number>,
  nowMs = Date.now(),
): DailyAmount[] {
  const { entries } = normaliseSessions(rawEntries)
  const byProfileDate: Record<string, Record<string, TimeEntry[]>> = {}
  for (const e of entries) {
    if (!e.profile_id || !e.date) continue
    const date = String(e.date).slice(0, 10)
    ;(byProfileDate[e.profile_id] ??= {})[date] ??= []
    byProfileDate[e.profile_id][date].push(e)
  }

  const byDate: Record<string, number> = {}
  for (const [profileId, days] of Object.entries(byProfileDate)) {
    const rate = rates[profileId] ?? DEFAULT_HOURLY_RATE
    for (const [date, dayEntries] of Object.entries(days)) {
      const { regular, overtime } = splitOvertimeHours(billableHoursForDay(dayEntries, nowMs))
      byDate[date] = (byDate[date] ?? 0) + grossPay(regular, overtime, rate)
    }
  }

  return Object.entries(byDate)
    .map(([date, spend]) => ({ date, spend: Math.round(spend * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/* Commission on every case, priced the way the rep is paid for it.

   Tiers count a rep's own closes within a calendar month, so the same case
   is worth $30 to someone on their third close and $50 to someone on their
   thirtieth. Cases are ordered by sign date before numbering, and a rep's
   duplicate row for the same person on the same day is dropped — the same
   de-duplication the rep's own pay page does, so the two agree. */
export function commissionByCase(cases: CaseRow[]): CommissionRow[] {
  const eligible = cases
    .filter(c => c.signedAt && (c.caseStatus || '').toLowerCase() !== 'replacement')
    .filter(c => (c.closer || '').trim())
    .sort((a, b) => String(a.signedAt).localeCompare(String(b.signedAt)))

  const seen = new Set<string>()
  const monthCounts: Record<string, number> = {}
  const out: CommissionRow[] = []

  for (const c of eligible) {
    const closer = (c.closer || '').trim()
    const date = String(c.signedAt).slice(0, 10)
    const dedupe = `${closer.toLowerCase()}|${(c.contactName || '').toLowerCase()}|${date}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)

    const monthKey = `${closer.toLowerCase()}|${date.slice(0, 7)}`
    monthCounts[monthKey] = (monthCounts[monthKey] ?? 0) + 1
    const { tier, rate } = tierCommission(monthCounts[monthKey])

    out.push({
      caseId: c.id,
      date,
      firmId: c.firmId,
      invoiceCode: c.invoiceCode,
      closer,
      // An overtime close is paid flat, in place of the tier rate.
      amount: c.otClose ? COMMISSION_OT_CLOSE : rate,
      tier: c.otClose ? 0 : tier,
      otClose: c.otClose,
    })
  }

  return out
}
