export type ISODate = string

const DAY_MS = 86_400_000
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function toDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10)
}

export function isValidISODate(value: string | undefined | null): value is ISODate {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = toDate(value)
  return !Number.isNaN(d.getTime()) && toISO(d) === value
}

export function addDays(iso: ISODate, days: number): ISODate {
  return toISO(new Date(toDate(iso).getTime() + days * DAY_MS))
}

/** Number of days between two dates, inclusive of both ends. */
export function daysInclusive(start: ISODate, end: ISODate): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS) + 1
}

export function dayDiff(from: ISODate, to: ISODate): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS)
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

export function startOfWeek(iso: ISODate): ISODate {
  const d = toDate(iso)
  const dow = (d.getUTCDay() + 6) % 7
  return addDays(iso, -dow)
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`
}

export function endOfMonth(iso: ISODate): ISODate {
  const d = toDate(iso)
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
}

export function startOfQuarter(iso: ISODate): ISODate {
  const d = toDate(iso)
  const qm = Math.floor(d.getUTCMonth() / 3) * 3
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), qm, 1)))
}

export function endOfQuarter(iso: ISODate): ISODate {
  const d = toDate(iso)
  const qm = Math.floor(d.getUTCMonth() / 3) * 3
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), qm + 3, 0)))
}

export function startOfYear(iso: ISODate): ISODate {
  return `${iso.slice(0, 4)}-01-01`
}

export function endOfYear(iso: ISODate): ISODate {
  return `${iso.slice(0, 4)}-12-31`
}

/** Shift by whole months, clamping the day to the target month's length (e.g. Mar 31 → Feb 28). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const d = toDate(iso)
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months
  const y = Math.floor(total / 12)
  const m = total - y * 12
  const day = Math.min(d.getUTCDate(), daysInMonth(y, m))
  return toISO(new Date(Date.UTC(y, m, day)))
}

export function addYears(iso: ISODate, years: number): ISODate {
  return addMonths(iso, years * 12)
}

export function formatDay(iso: ISODate, withYear = true): string {
  const d = toDate(iso)
  const base = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
  return withYear ? `${base}, ${d.getUTCFullYear()}` : base
}

export function formatMonth(iso: ISODate): string {
  const d = toDate(iso)
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDay(start)
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDay(start, !sameYear)} – ${formatDay(end)}`
}

export function quarterLabel(iso: ISODate): string {
  const d = toDate(iso)
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}
