/* ═══════════════════════════════════════════════════════════════════════════
   One P&L for an invoice.

   The Overview and Finances pages previously each derived the bottom line
   their own way: Overview took worker payroll from `summary.workerPR` (which
   the API leaves at 0 for an invoice window) while Finances recomputed it from
   the case list. The two pages therefore disagreed about net profit by exactly
   the payroll figure. Both now call this.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Per-invoice rep pay. Distinct from the company-wide pay-period rates on the
 *  main Team tab, which settle per fortnight rather than per invoice. */
export const BASE_PAY_PER_CASE = 5
export const COMMISSION_PER_CLOSED = 25

export type PayrollRow = {
  name: string
  signed: number
  closed: number
  pay: number
}

/** A case counts as closed once it is explicitly marked closed, or once its
 *  replacement window has elapsed without a replacement being issued. */
export function invoicePayroll(pcs: any[], replacementWindowDays: number, now = Date.now()) {
  const byWorker: Record<string, { signed: number; closed: number }> = {}

  for (const pc of pcs) {
    if (!pc?.workerName) continue
    const w = (byWorker[pc.workerName] ||= { signed: 0, closed: 0 })
    w.signed += 1

    if (String(pc.caseStatus || '').toLowerCase() === 'closed') {
      w.closed += 1
    } else if (pc.qualifiedAt) {
      const end = new Date(pc.qualifiedAt)
      end.setUTCDate(end.getUTCDate() + replacementWindowDays)
      if (end.getTime() < now) w.closed += 1
    }
  }

  const rows: PayrollRow[] = Object.entries(byWorker)
    .map(([name, w]) => ({
      name,
      signed: w.signed,
      closed: w.closed,
      pay: w.signed * BASE_PAY_PER_CASE + w.closed * COMMISSION_PER_CLOSED,
    }))
    .sort((a, b) => b.pay - a.pay || b.signed - a.signed)

  return { rows, total: rows.reduce((t, r) => t + r.pay, 0) }
}

export type InvoicePnl = {
  revenue: number
  adSpend: number
  ops: number
  payroll: number
  sanguine: number
  totalCost: number
  netProfit: number
  netMargin: number | null
  payrollRows: PayrollRow[]
  replacementWindowDays: number
}

/** Build the whole P&L from one `/api/metrics/kpi` response. */
export function invoicePnl(kpi: any, now = Date.now()): InvoicePnl {
  const s = kpi?.summary ?? {}
  const replacementWindowDays = kpi?.firm?.replacement_window_days ?? 14
  const { rows, total: payroll } = invoicePayroll(kpi?.pcs || [], replacementWindowDays, now)

  // Net of the financing fee when a payment is recorded; otherwise the modelled
  // case-value revenue.
  const revenue = kpi?.payment ? kpi.payment.net : (s.grossRevenue ?? 0)
  const adSpend = kpi?.meta?.spend ?? 0
  const ops = s.opsExpenses ?? 0
  const sanguine = kpi?.sanguine?.total ?? 0

  const totalCost = adSpend + ops + payroll + sanguine
  const netProfit = revenue - totalCost

  return {
    revenue, adSpend, ops, payroll, sanguine,
    totalCost, netProfit,
    netMargin: revenue > 0 ? (netProfit / revenue) * 100 : null,
    payrollRows: rows,
    replacementWindowDays,
  }
}
