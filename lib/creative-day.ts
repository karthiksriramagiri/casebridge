/* ═══════════════════════════════════════════════════════════════════════════
   When the Creative Center's day turns over.

   One definition, imported by the client and by the routes, because three
   copies of a date rule is three chances for the board and the numbers on it
   to disagree about what day it is — and that disagreement is invisible
   until someone is looking at an empty list at one in the morning.

   Pacific, not Eastern. The rest of CaseBridge runs on an Eastern day — the
   dialer, the shift reports, the pay periods — but the center's day is the
   ad meeting's day, and that is run on the west coast.

   Two in the morning, not midnight. The day the center works to is a shift,
   not a calendar date, and the shift runs past midnight: at half past twelve
   the lists would roll while the same people were still working the old
   day's. The kill list emptied, a creative dismissed an hour earlier came
   back, and a kill ticked off at 1am was filed under a day nobody had worked
   yet. Two o'clock is after the last of that and before anyone starts again.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Hours after Pacific midnight that the working day rolls over. */
export const DAY_ROLLOVER_HOUR = 2

/** The center's working day for a given instant, as YYYY-MM-DD.
 *
 *  Shifting the clock back by the rollover and then asking Pacific for the
 *  date does the whole job, DST included: at 1am the shifted time is still
 *  yesterday evening, so yesterday's date comes back; at 2am it crosses into
 *  today. */
export function creativeDay(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - DAY_ROLLOVER_HOUR * 60 * 60 * 1000)
  return shifted.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

/** The working day a timestamp falls in. Empty string for a missing value,
 *  so a row with no date sorts and compares as "unknown" rather than today. */
export function creativeDayOf(iso: string | null | undefined): string {
  return iso ? creativeDay(new Date(iso)) : ''
}
