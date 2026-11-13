import type { Cents } from './reporting/money'

/* ═══════════════════════════════════════════════════════════════════════════
   The Sanguine referral royalty.

   $250 on every case delivered, paid to the referral source under the
   Sanguine Agreement. It scales with cases rather than with revenue or
   with spend, so it is counted the way commission is: per case, on the
   day the case signed, against the firm the case was for.

   It is a real cost of the business and it is deliberately *not* part of
   the earn-out test. APA §2.9 is explicit — Net Margin "shall not be
   reduced by any amount paid or payable under the Sanguine Agreement or
   to any other referral source ... as a bounty, referral fee, referral
   royalty, commission, revenue share or similar payment."

   That is the whole reason this is a flag rather than another line in the
   ledger. Two pages read the same book and need different answers:

     Reporting Center   the operating view — what the company actually
                        keeps after overhead and the royalty
     Operation Center   the same book without them, which is the shape
                        the earn-out and the delivery figures are read in

   Neither is wrong and neither is the other's correction. A single margin
   that quietly included the royalty would misstate the earn-out; one that
   quietly excluded it would misstate the business.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Paid per delivered case. Replacements deliver nothing and owe nothing. */
export const SANGUINE_PER_CASE: Cents = 250_00

/** What the royalty comes to on a given number of cases. */
export function sanguineFor(cases: number): Cents {
  return Math.round(cases * SANGUINE_PER_CASE)
}
