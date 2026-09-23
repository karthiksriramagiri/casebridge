/* ═══════════════════════════════════════════════════════════════════════════
   Commas (Fanbasis) — the money actually taken.

   Every firm pays CaseBridge through a Commas checkout link, so this is the
   revenue side of the company P&L: what was charged, what the processor kept,
   and — the number the finance sheet is built on — what has actually been
   released into the bank.

   Two dates matter and they are not the same. `transaction_date` is when the
   card was charged; `fund_release_on` is when Commas released the money. The
   sheet's "Total Money Received" counts released funds, which is why it sits
   a few hundred thousand below gross charges at any moment.
   ═══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://www.fanbasis.com/public-api'
const API_KEY = (process.env.FANBASIS_API_KEY || '').replace(/\\n/g, '').trim()

/** Commas charges a flat transfer fee per payout on top of the % processing
 *  fee; the finance sheet nets it out of every line. */
export const PAYOUT_FEE = 1

export const fanbasisConfigured = Boolean(API_KEY)

export type FanbasisTransaction = {
  id: number
  orderId: string
  /** Charge date, ISO yyyy-mm-dd. */
  chargedOn: string
  /** Release date, ISO yyyy-mm-dd, or null when Commas has not scheduled one. */
  releasedOn: string | null
  released: boolean
  customerName: string | null
  customerEmail: string | null
  productTitle: string | null
  /** Dollars. */
  gross: number
  fee: number
  net: number
  refunded: number
  paymentType: string | null
}

export type FanbasisLedger = {
  transactions: FanbasisTransaction[]
  fetchedAt: string
}

function toIso(v: string | null | undefined): string | null {
  const s = String(v || '').trim()
  if (!s) return null
  // Commas mixes "2026-09-15 13:23:47" and full ISO in the same payload.
  const d = s.includes('T') ? s.slice(0, 10) : s.split(' ')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': API_KEY, Accept: 'application/json' },
    // Payouts move once or twice a week; minutes-stale costs nothing and keeps
    // a dashboard reload off the processor.
    next: { revalidate: 300 },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.status === 'error') {
    const msg = json?.message || `Commas HTTP ${res.status}`
    throw new Error(
      res.status === 403
        ? `${msg} Add the "payments" scope to the API key in Commas → Account → API Keys.`
        : msg
    )
  }
  return json
}

/** Every transaction on the account, oldest first. */
export async function loadFanbasisLedger(): Promise<FanbasisLedger> {
  if (!fanbasisConfigured) throw new Error('FANBASIS_API_KEY is not set.')

  const transactions: FanbasisTransaction[] = []
  // 100 is the API's ceiling; it rejects anything larger outright.
  for (let page = 1; page <= 40; page++) {
    const json = await get(`/transactions/all?page=${page}&per_page=100`)
    const rows: any[] = json?.data?.transactions || []
    for (const t of rows) {
      const sp = t.servicePayment || {}
      const refunds: any[] = Array.isArray(t.refunds) ? t.refunds : []
      transactions.push({
        id: t.id,
        orderId: t.public_transaction_id || String(t.id),
        chargedOn: toIso(t.transaction_date) || '',
        releasedOn: toIso(sp.fund_release_on),
        released: Boolean(sp.fund_released),
        customerName: t.fan?.name || null,
        customerEmail: t.fan?.email || null,
        productTitle: t.product?.title || t.service?.title || null,
        gross: Number(t.amount) || 0,
        fee: Number(t.fee_amount) || 0,
        net: Number(t.net_amount) || 0,
        refunded: refunds.reduce((s, r) => s + (Number(r.amount ?? r.refund_amount) || 0), 0),
        paymentType: sp.payment_type || null,
      })
    }
    if (!json?.data?.pagination?.has_more) break
  }

  transactions.sort((a, b) => a.chargedOn.localeCompare(b.chargedOn))
  return { transactions, fetchedAt: new Date().toISOString() }
}

/** Money is counted on the day it lands, which is how the finance sheet reads. */
export function receivedOn(t: FanbasisTransaction): string | null {
  return t.released ? t.releasedOn : null
}
