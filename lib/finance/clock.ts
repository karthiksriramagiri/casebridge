/* ═══════════════════════════════════════════════════════════════════════════
   The Financial Center's clock.

   Pacific, wherever a moment becomes a day.

   Every date in this book is a calendar day — a case signed on the 12th, a
   shift worked on the 12th, an invoice open from the 4th. The only place a
   timezone can change an answer is the step that turns a timestamp into one
   of those days, and until now that step asked UTC. The server runs in UTC,
   `qualified_at` is stored in UTC, and a case signed at six in the evening
   in California is already tomorrow there — so a fifth of the day's cases
   were tracked to the next day, the commission on them with it, and on the
   last evening of a month into the next month entirely.

   The company's day is a Pacific day. That is where the desk works and
   where the ad meeting is run, so that is the day a case belongs to.

   One definition, imported by the loader, the worker-cost rules and the
   pages, because three copies of a date rule is three chances for the
   figures to disagree about what day it is.

   Not the Creative Center's day — that one rolls at two in the morning
   because its day is a shift (see lib/creative-day.ts). A book keeps
   calendar days: midnight to midnight, Pacific.
   ═══════════════════════════════════════════════════════════════════════════ */

export const FINANCE_TZ = 'America/Los_Angeles'

/** The Pacific calendar day a moment falls in, as YYYY-MM-DD.
 *
 *  Empty string for a missing or unparseable value, so a row with no
 *  timestamp compares as "unknown" rather than silently landing on today.
 *  `en-CA` is the locale that formats a date as YYYY-MM-DD; asking it for a
 *  Pacific date handles DST without a table of offsets. */
export function financeDay(at: Date | string | number | null | undefined = new Date()): string {
  if (at === null || at === undefined || at === '') return ''
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: FINANCE_TZ })
}

/** Today, in Pacific — the last day any figure here can speak for. */
export function financeToday(now: Date = new Date()): string {
  return financeDay(now)
}
