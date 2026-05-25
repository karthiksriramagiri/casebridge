// ─── Pay calculation rules ───────────────────────────────────────────────────
// Shift:       2:00 PM – 11:00 PM EST (9 regular hours)
// Overtime:    > 9h/day @ $6/hr
// Rounding:    floor each session to nearest 0.05h; ignore sessions < 0.05h
// Pay period:  2nd and 4th Friday of every month
// Commission:  $25 per closed case (constant)

export const OVERTIME_HOURLY = 6
export const COMMISSION_PER_CLOSED = 25

/** Returns the 2nd and 4th Fridays of a given month (0-indexed month) */
function payFridaysInMonth(year: number, month: number): [Date, Date | null] {
  const fridays: Date[] = []
  // Start from day 1, walk until we collect all Fridays in the month
  const d = new Date(Date.UTC(year, month, 1))
  while (d.getUTCMonth() === month) {
    if (d.getUTCDay() === 5) fridays.push(new Date(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  // 2nd Friday = index 1, 4th Friday = index 3
  return [fridays[1], fridays[3] ?? null]
}

/**
 * All pay dates for a window of months around `now`, sorted ascending.
 * We generate prev month + current + next to cover edge cases.
 */
function nearbyPayDates(now: Date): Date[] {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const dates: Date[] = []
  for (let m = month - 1; m <= month + 2; m++) {
    const y = year + Math.floor(m / 12)
    const mo = ((m % 12) + 12) % 12
    const [second, fourth] = payFridaysInMonth(y, mo)
    dates.push(second)
    if (fourth) dates.push(fourth)
  }
  return dates.sort((a, b) => a.getTime() - b.getTime())
}

/** Returns the next payment date (2nd or 4th Friday on/after today) */
export function nextPaymentDate(now = new Date()): Date {
  const todayMs = now.getTime()
  const dates = nearbyPayDates(now)
  return dates.find(d => d.getTime() >= todayMs) ?? dates[dates.length - 1]
}

/** Returns the start of the current pay period (the pay date before today) */
export function currentPayPeriodStart(now = new Date()): Date {
  const todayMs = now.getTime()
  const dates = nearbyPayDates(now)
  // Last pay date that is strictly before today
  const prev = [...dates].reverse().find(d => d.getTime() < todayMs)
  return prev ?? dates[0]
}

/** Format a date as "Fri Jun 13" */
export function fmtPayDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Given an array of { clock_in, clock_out } entries for ONE day,
 * returns billable hours applying:
 *   - ignore sessions < 0.05h
 *   - floor each session to nearest 0.05h
 */
export function billableHoursForDay(entries: { clock_in: string; clock_out: string | null }[], nowMs = Date.now()): number {
  let total = 0
  for (const e of entries) {
    const endMs = e.clock_out ? new Date(e.clock_out).getTime() : nowMs
    const rawHours = Math.max(0, (endMs - new Date(e.clock_in).getTime()) / 3_600_000)
    if (rawHours < 0.05) continue              // ignore tiny sessions
    const floored = Math.floor(rawHours / 0.05) * 0.05
    total += floored
  }
  return Math.round(total * 1000) / 1000
}

/**
 * Given total billable hours for a day, return { regular, overtime }.
 * Regular shift = 9h (2PM–11PM EST). Anything beyond = overtime.
 */
export function splitOvertimeHours(hours: number): { regular: number; overtime: number } {
  const regular = Math.min(hours, 9)
  const overtime = Math.max(0, hours - 9)
  return { regular, overtime }
}

/** Compute gross pay for a set of hours + hourly rate (no commission) */
export function grossPay(regularHours: number, overtimeHours: number, hourlyRate: number): number {
  return regularHours * hourlyRate + overtimeHours * OVERTIME_HOURLY
}

/** EST offset in hours (–5 standard, –4 daylight). Uses JS Intl for accuracy. */
export function clockInIsLate(clockInIso: string): { late: boolean; minutesLate: number } {
  const clockIn = new Date(clockInIso)
  // Get the hour:minute of clockIn in America/New_York
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(clockIn)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  const shiftStartMinutes = 14 * 60 // 2:00 PM = 840 minutes from midnight
  const clockInMinutes = hour * 60 + minute
  const minutesLate = clockInMinutes - shiftStartMinutes
  return { late: minutesLate > 0, minutesLate: Math.max(0, minutesLate) }
}
