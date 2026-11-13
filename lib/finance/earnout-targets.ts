import type { ISODate } from './reporting/dates'
import type { Cents } from './reporting/money'

/* ═══════════════════════════════════════════════════════════════════════════
   The earn-out, as the Asset Purchase Agreement writes it.

   Project Compass APA, Article 2. Five contingent payments, each tested
   once on its own Measurement Date, each final — "a failure to earn all or
   any unpaid portion of an Earnout Payment for one Measurement Date is
   final and may not be cured by performance in a later period."

   Three things about the structure are easy to get wrong, and all three
   change what the page should say:

   1. Every period runs from the Earnout Start Date. They are not
      consecutive windows. The four-month test is Nov 4 → Mar 3 asking for
      $1.33M in total, not a second window asking for another $1.33M on top
      of the first. §2.7: "cumulative tests measured from the Earnout Start
      Date through the end of the applicable cumulative measurement
      period."

   2. A period ends the day before its Measurement Date. §2.1: a period
      "ends at 11:59 p.m. Pacific Time on the day immediately preceding the
      applicable Measurement Date" — which is also why every date in this
      book is a Pacific date (see lib/finance/clock.ts).

   3. The later three pay on a sliding scale, not pass/fail. Below the
      floor pays nothing, above the cap pays the maximum, and between them
      it is linear.

   Net Margin (§2.9) is its own measure and not the Reporting Center's:

       (Bookings − Advertising − Case Replacement − Intake) ÷ Bookings

   and nothing else reduces it. Not overhead, not referral or Sanguine
   royalties, not Hashshop, platform, payment-processing or communications
   fees, not shared-service or intercompany allocations. That is why this
   page's margin is higher than the Reporting Center's, and the difference
   is contractual rather than an error in one of them.
   ═══════════════════════════════════════════════════════════════════════════ */

/** APA §2.1. Every measurement period begins here. */
export const EARNOUT_START: ISODate = '2026-11-04'

/** APA §2.2–2.6: the margin every payment is gated on. */
export const REQUIRED_MARGIN_PCT = 25

/** APA §2.1: the aggregate cap across all five payments. */
export const AGGREGATE_CAP = 18_000_000_00

export interface EarnoutPeriod {
  key: string
  /** As the agreement names it. */
  label: string
  section: string
  /** Always EARNOUT_START — the tests are cumulative. */
  start: ISODate
  /** The day before the Measurement Date. */
  end: ISODate
  measurementDate: ISODate
  /** Bookings at or above which the payment is earned in full. */
  capCents: Cents
  /** Below this, the payment is zero. Equals `capCents` on a pass/fail test. */
  floorCents: Cents
  /** The most this payment can be. */
  maxPaymentCents: Cents
  /** True when there is no sliding scale: hit the number or earn nothing. */
  passFail: boolean
  note?: string
}

export const EARNOUT_PERIODS: EarnoutPeriod[] = [
  {
    key: 'm2',
    label: 'Two-month',
    section: '§2.2',
    start: EARNOUT_START,
    end: '2027-01-03',
    measurementDate: '2027-01-04',
    floorCents: 667_000_00,
    capCents: 667_000_00,
    maxPaymentCents: 2_000_000_00,
    passFail: true,
    note: 'Capped at $2M rather than $4M: the $2M Closing Payment was taken out of this one and no other.',
  },
  {
    key: 'm4',
    label: 'Four-month',
    section: '§2.3',
    start: EARNOUT_START,
    end: '2027-03-03',
    measurementDate: '2027-03-04',
    floorCents: 1_330_000_00,
    capCents: 1_330_000_00,
    maxPaymentCents: 4_000_000_00,
    passFail: true,
    note: 'Tested independently. Missing the two-month payment does not block this one.',
  },
  {
    key: 'm12',
    label: 'Twelve-month',
    section: '§2.4',
    start: EARNOUT_START,
    end: '2027-11-03',
    measurementDate: '2027-11-04',
    floorCents: 14_070_000_00,
    capCents: 20_100_000_00,
    maxPaymentCents: 4_000_000_00,
    passFail: false,
  },
  {
    key: 'm24',
    label: 'Twenty-four-month',
    section: '§2.5',
    start: EARNOUT_START,
    end: '2028-11-03',
    measurementDate: '2028-11-04',
    floorCents: 28_560_000_00,
    capCents: 40_800_000_00,
    maxPaymentCents: 4_000_000_00,
    passFail: false,
  },
  {
    key: 'm36',
    label: 'Thirty-six-month',
    section: '§2.6',
    start: EARNOUT_START,
    end: '2029-11-03',
    measurementDate: '2029-11-04',
    floorCents: 53_970_000_00,
    capCents: 77_100_000_00,
    maxPaymentCents: 4_000_000_00,
    passFail: false,
  },
]

/** What a period pays at a given level of bookings and margin. */
export function paymentFor(p: EarnoutPeriod, bookingsCents: Cents, marginPct: number | null): Cents {
  /* The margin is a gate, not a multiplier: below it the payment is zero
     however large the bookings. */
  if (marginPct === null || marginPct < REQUIRED_MARGIN_PCT) return 0
  if (bookingsCents < p.floorCents) return 0
  if (bookingsCents >= p.capCents) return p.maxPaymentCents
  /* Linear between floor and cap — §2.4–2.6. */
  return Math.round(p.maxPaymentCents * ((bookingsCents - p.floorCents) / (p.capCents - p.floorCents)))
}

/** The most this period can spend and still hold the required margin at a given bookings level. */
export function spendAllowance(bookingsCents: Cents, marginPct = REQUIRED_MARGIN_PCT): Cents {
  return Math.round(bookingsCents * (1 - marginPct / 100))
}
