/* The dashboard's time windows.

   Presets rather than two date boxes, because the questions people actually
   ask of a book are "this month" and "this quarter", not "the 14th to the
   9th". A custom range is there for when the question really is a specific
   stretch. Everything is UTC and inclusive on both ends, matching the invoice
   periods and the daily cost rows they are compared against. */

export type Range = { from: string; to: string } | null

const iso = (d: Date) => d.toISOString().slice(0, 10)
const DAY = 86_400_000

export const RANGE_KEYS = [
  'all', 'last7', 'last30', 'last90', 'mtd', 'qtd', 'ytd', 'lastMonth', 'custom',
] as const
export type RangeKey = typeof RANGE_KEYS[number]

export const RANGE_LABEL: Record<RangeKey, string> = {
  all: 'All time',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  mtd: 'This month',
  lastMonth: 'Last month',
  qtd: 'This quarter',
  ytd: 'This year',
  custom: 'Custom range',
}

/** The window a preset means on a given day. `all` and `custom` have none. */
export function rangeFor(key: RangeKey, now = new Date()): Range {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()

  switch (key) {
    case 'last7':  return { from: iso(new Date(today.getTime() - 6 * DAY)), to: iso(today) }
    case 'last30': return { from: iso(new Date(today.getTime() - 29 * DAY)), to: iso(today) }
    case 'last90': return { from: iso(new Date(today.getTime() - 89 * DAY)), to: iso(today) }
    case 'mtd':    return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(today) }
    case 'lastMonth': {
      const first = new Date(Date.UTC(y, m - 1, 1))
      const last = new Date(Date.UTC(y, m, 1) - DAY)
      return { from: iso(first), to: iso(last) }
    }
    case 'qtd':    return { from: iso(new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1))), to: iso(today) }
    case 'ytd':    return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(today) }
    default:       return null
  }
}

/** Query string for the book, empty when the window is all time. */
export function rangeQuery(r: Range): string {
  return r ? `?from=${r.from}&to=${r.to}` : ''
}
