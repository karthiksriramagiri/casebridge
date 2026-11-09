/**
 * All monetary values are stored and computed as integer cents to avoid
 * floating-point drift. Any split of an amount goes through `distributeCents`,
 * which guarantees the parts sum exactly to the original amount.
 */
export type Cents = number

export function toCents(dollars: number | string): Cents {
  const n = typeof dollars === 'string' ? Number(dollars.replace(/[$,\s]/g, '')) : dollars
  if (!Number.isFinite(n)) return Number.NaN
  return Math.round(n * 100)
}

export function centsToDollars(cents: Cents): number {
  return cents / 100
}

/**
 * Split `total` cents across `weights` using the largest-remainder method so the
 * result sums exactly to `total`. Returns null if every weight is zero.
 */
export function distributeCents(total: Cents, weights: number[]): Cents[] | null {
  const weightSum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (weights.length === 0 || weightSum <= 0) return null
  const sign = total < 0 ? -1 : 1
  const abs = Math.abs(total)
  const raw = weights.map((w) => (Math.max(0, w) / weightSum) * abs)
  const floored = raw.map(Math.floor)
  let remainder = abs - floored.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    floored[order[k].i] += 1
  }
  return floored.map((v) => v * sign)
}

export function distributeEvenly(total: Cents, parts: number): Cents[] {
  return distributeCents(total, Array.from({ length: parts }, () => 1)) ?? []
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatUSD(cents: Cents, opts: { cents?: boolean; signed?: boolean } = {}): string {
  const value = cents / 100
  const formatted = (opts.cents ? usdCents : usd).format(Math.abs(value))
  if (opts.signed) return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatted}`
  return value < 0 ? `−${formatted}` : formatted
}

export function formatUSDCompact(cents: Cents): string {
  return usdCompact.format(cents / 100)
}

export function formatPct(value: number | null, opts: { signed?: boolean; digits?: number } = {}): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const digits = opts.digits ?? 1
  const s = Math.abs(value).toFixed(digits)
  if (opts.signed) return `${value > 0 ? '+' : value < 0 ? '−' : ''}${s}%`
  return `${value < 0 ? '−' : ''}${s}%`
}

export function formatPP(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)} pp`
}

/** Percentage change; null when the base is zero (growth from zero is undefined). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export function marginPct(profit: Cents, revenue: Cents): number | null {
  if (revenue === 0) return null
  return (profit / revenue) * 100
}
