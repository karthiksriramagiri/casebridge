/* ═══════════════════════════════════════════════════════════════════════════
   The margin, and how costs reach an invoice.

       margin = (revenue − advertising − worker cost) / revenue

   Nothing else enters it. Ops, Sanguine, financing and processing fees are
   still tracked elsewhere; they are deliberately outside this number.

   Revenue is what the invoice bills. The two costs both arrive as things
   that happened on a particular day, and the day is what decides which
   invoice carries them:

     advertising  the firm's Meta spend, day by day
     base pay     the reps' hours on the clock, day by day
     commission   earned on one case, for one firm, on the day it signed

   Advertising and base pay are divided between every invoice covering the
   day they fall on, because invoice periods overlap and a day charged to
   each of them in full would report far more cost than was ever spent.
   Commission is already attached to a single firm's case, so it goes
   straight to that firm's invoice with nothing to divide.

   Anything falling on a day no invoice covers stays unallocated rather than
   being forced onto the nearest invoice, and every unallocated total is
   reported so the company view and the sum of its invoices reconcile.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Period = { start: string; end: string }   // inclusive, YYYY-MM-DD

export type InvoiceInput = {
  id: string
  code: string
  firmId: string
  period: Period
  revenue: number
}

const DAY = 86_400_000
const d = (s: string) => Date.parse(`${s}T00:00:00Z`)

/** Inclusive day count shared by two periods; 0 when they do not touch. */
export function overlapDays(a: Period, b: Period): number {
  const start = Math.max(d(a.start), d(b.start))
  const end   = Math.min(d(a.end),   d(b.end))
  if (end < start) return 0
  return Math.round((end - start) / DAY) + 1
}

export function daysInPeriod(p: Period): number {
  return overlapDays(p, p)
}

/* A window over the book.

   The dashboard can be asked for a stretch of time rather than all of it, and
   every figure has to narrow the same way or the margin stops meaning
   anything. Costs narrow for free — they are already day by day, so a day
   outside the window is simply not allocated. Revenue is the one that needs a
   rule, because an invoice bills a lump sum for a period rather than a sum
   per day.

   The rule is the same one the costs follow: an invoice contributes the share
   of its revenue that matches the share of its days inside the window. A
   window covering the whole invoice takes all of it, half the days take half
   the money, and no overlap takes none. That keeps revenue and costs clipped
   on the same boundary, so a narrowed margin stays comparable to the full
   one. */
export function clipPeriod(p: Period, window: Period | null): Period | null {
  if (!window) return p
  const start = p.start > window.start ? p.start : window.start
  const end = p.end < window.end ? p.end : window.end
  return end < start ? null : { start, end }
}

/** An invoice's revenue in proportion to how much of it the window covers. */
export function prorateRevenue(revenue: number, p: Period, window: Period | null): number {
  if (!window) return revenue
  const total = daysInPeriod(p)
  if (total <= 0) return 0
  const inside = overlapDays(p, window)
  if (inside <= 0) return 0
  if (inside >= total) return revenue
  return revenue * (inside / total)
}

/** Daily rows that fall inside the window. */
export function clipDaily<T extends { date: string }>(rows: T[], window: Period | null): T[] {
  if (!window) return rows
  return rows.filter(r => r.date >= window.start && r.date <= window.end)
}

export type Allocation = {
  byInvoice: Record<string, number>   // invoice id -> worker cost
  unallocated: number                 // pay in months no invoice covers
  total: number
}

/* Commission goes to the invoice that carries its case.

   A case is stamped with an invoice code when the firm bills it, and that
   stamp wins: a case signed after a period closed but billed on it is a real
   cost of that invoice. Only when nothing stamped the case does the sign date
   decide, and then only among its own firm's invoices. Where several of a
   firm's periods cover the same day the earliest-starting one takes it, so a
   case lands on exactly one invoice and the parts add back to the whole. */
export function allocateCommission(
  rows: { amount: number; date: string; firmId: string | null; invoiceCode: string | null }[],
  invoices: InvoiceInput[],
): Allocation {
  const byInvoice: Record<string, number> = {}
  for (const inv of invoices) byInvoice[inv.id] = 0
  let unallocated = 0
  let total = 0

  const byCode = new Map<string, InvoiceInput>()
  for (const inv of invoices) byCode.set(`${inv.firmId}|${inv.code}`, inv)

  // Earliest-starting first, so the pick among overlapping periods is stable.
  const ordered = [...invoices].sort((a, b) => a.period.start.localeCompare(b.period.start))

  for (const row of rows) {
    const amount = Number(row.amount) || 0
    if (!amount) continue
    total += amount

    const stamped = row.invoiceCode ? byCode.get(`${row.firmId}|${row.invoiceCode}`) : undefined
    const target = stamped ?? ordered.find(inv =>
      inv.firmId === row.firmId &&
      row.date >= inv.period.start && row.date <= inv.period.end)

    if (!target) { unallocated += amount; continue }
    byInvoice[target.id] += amount
  }

  return { byInvoice, unallocated, total }
}

export type Margin = {
  revenue: number
  adSpend: number
  workerCost: number
  cost: number
  profit: number
  margin: number | null       // percent; null when there is no revenue to divide by
}

export function computeMargin(revenue: number, adSpend: number, workerCost: number): Margin {
  const cost = adSpend + workerCost
  const profit = revenue - cost
  return {
    revenue, adSpend, workerCost, cost, profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
  }
}

/** Spend inside a period, from daily rows. Days outside it are ignored. */
export function spendInPeriod(daily: { date: string; spend: number }[], p: Period): number {
  return daily.reduce((s, row) =>
    row.date >= p.start && row.date <= p.end ? s + (Number(row.spend) || 0) : s, 0)
}

/* Split a daily series — advertising spend, or the reps' base pay — across
   the invoices covering each day.

   Summing a period total per invoice double counts: invoice periods overlap, so a day
   covered by two invoices is charged to both and the company total comes out
   larger than the money actually spent. Summing the per-invoice figures gave
   $3.27M against $1.02M of real spend.

   Each day is therefore divided equally between the invoices covering it, so
   the parts add back to the whole. Days no invoice covers are reported as
   unallocated rather than being quietly dropped. */
export function allocateDailyCost(
  daily: { date: string; spend: number }[],
  invoices: InvoiceInput[],
): Allocation {
  const byInvoice: Record<string, number> = {}
  for (const inv of invoices) byInvoice[inv.id] = 0
  let unallocated = 0
  let total = 0

  for (const row of daily) {
    const spend = Number(row.spend) || 0
    if (!spend) continue
    total += spend
    const covering = invoices.filter(
      inv => row.date >= inv.period.start && row.date <= inv.period.end)
    if (covering.length === 0) { unallocated += spend; continue }
    const share = spend / covering.length
    for (const inv of covering) byInvoice[inv.id] += share
  }

  return { byInvoice, unallocated, total }
}
