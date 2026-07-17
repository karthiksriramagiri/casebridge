// ─── Pay calculation rules ───────────────────────────────────────────────────
// Shift:       2:00 PM – 11:00 PM EST (9 regular hours)
// Rounding:    floor each session to nearest 0.05h; ignore sessions < 0.05h
// Pay period:  bi-weekly (every 14 days), anchored to Fri Jul 17, 2026
// Commission:  $25 per signed case, $0 per replacement case (as of Jun 13, 2026)

export const OVERTIME_HOURLY = 6

// Legacy rates: cases signed on or before Jun 12, 2026
export const COMMISSION_PER_CLOSED = 25
export const COMMISSION_PER_REPLACEMENT = 10

// New rates effective Jun 13, 2026 onward
export const COMMISSION_CUTOFF = new Date(Date.UTC(2026, 5, 13)) // Jun 13, 2026
export const COMMISSION_PER_CLOSED_NEW = 30
export const COMMISSION_PER_REPLACEMENT_NEW = 0  // replacements no longer earn commission

export const DEFAULT_REPLACEMENT_WINDOW_DAYS = 28

// Bi-weekly anchor: confirmed pay date Fri Jul 17, 2026
// (Jul 3 was a special early payout due to Jul 4 holiday, covering Jun 26–Jul 17)
const ANCHOR_PAY_DATE = new Date(Date.UTC(2026, 6, 17)) // July 17, 2026 UTC
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

// Override period start for pay dates that cover non-standard periods.
// Key = pay date (YYYY-MM-DD), value = period start (YYYY-MM-DD).
export const PERIOD_START_OVERRIDES: Record<string, string> = {
  '2026-07-17': '2026-06-26', // Jul 4 holiday moved Jul 10 payout → Jul 17; period covers Jun 26–Jul 17
}

/**
 * Generates bi-weekly pay dates centered around `now`.
 * Every pay date is exactly 14 days apart from the previous.
 */
function nearbyPayDates(now: Date): Date[] {
  const cycles = Math.round((now.getTime() - ANCHOR_PAY_DATE.getTime()) / TWO_WEEKS_MS)
  const dates: Date[] = []
  for (let i = cycles - 4; i <= cycles + 4; i++) {
    dates.push(new Date(ANCHOR_PAY_DATE.getTime() + i * TWO_WEEKS_MS))
  }
  return dates.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * All pay dates from `periodsBack` pay periods ago up to 4 ahead, sorted ascending.
 * Used to enumerate historical pay periods.
 */
export function recentPayDates(now: Date, periodsBack = 8): Date[] {
  const cycles = Math.round((now.getTime() - ANCHOR_PAY_DATE.getTime()) / TWO_WEEKS_MS)
  const dates: Date[] = []
  for (let i = cycles - periodsBack; i <= cycles + 4; i++) {
    dates.push(new Date(ANCHOR_PAY_DATE.getTime() + i * TWO_WEEKS_MS))
  }
  return dates.sort((a, b) => a.getTime() - b.getTime())
}

/** Returns the next payment date (on/after today) */
export function nextPaymentDate(now = new Date()): Date {
  const todayMs = now.getTime()
  const dates = nearbyPayDates(now)
  return dates.find(d => d.getTime() >= todayMs) ?? dates[dates.length - 1]
}

/** Returns the start of the current pay period (the pay date before today) */
export function currentPayPeriodStart(now = new Date()): Date {
  const nextPay = nextPaymentDate(now)
  const nextPayStr = nextPay.toISOString().slice(0, 10)
  if (PERIOD_START_OVERRIDES[nextPayStr]) {
    return new Date(PERIOD_START_OVERRIDES[nextPayStr])
  }
  const todayMs = now.getTime()
  const dates = nearbyPayDates(now)
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

/** Maps a shift value (from profiles.shift) to the shift start hour in EST (24h). */
export function shiftStartHourEST(shift: string | null | undefined): number {
  switch (shift) {
    case 'morning':
    case 'morning_afternoon': return 10  // 7 AM PST = 10 AM EST
    case 'afternoon':
    case 'afternoon_evening': return 15  // 12 PM PST = 3 PM EST
    case 'evening':           return 18  // 3 PM PST = 6 PM EST
    default:                  return 14  // fallback: 2 PM EST
  }
}

/** EST offset in hours (–5 standard, –4 daylight). Uses JS Intl for accuracy. */
export function clockInIsLate(clockInIso: string, shift?: string | null): { late: boolean; minutesLate: number; shiftStartHour: number } {
  const clockIn = new Date(clockInIso)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(clockIn)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  const shiftHour = shiftStartHourEST(shift)
  const shiftStartMinutes = shiftHour * 60
  const clockInMinutes = hour * 60 + minute
  const minutesLate = clockInMinutes - shiftStartMinutes
  return { late: minutesLate >= 10, minutesLate: Math.max(0, minutesLate), shiftStartHour: shiftHour }
}
