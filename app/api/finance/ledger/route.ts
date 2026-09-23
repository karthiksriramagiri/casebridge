import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadFanbasisLedger, fanbasisConfigured, PAYOUT_FEE, type FanbasisTransaction } from '@/app/lib/fanbasis'

/* ═══════════════════════════════════════════════════════════════════════════
   The company money model — the finance sheet, computed.

   Money in is whatever Commas has released into the bank; money out is ad
   spend, ops, payroll, referral fees and the profit share paid out to the two
   holding entities. Anything the systems cannot know — a referral fee paid by
   wire, a profit-share transfer, an investment, interest earned, a bank
   balance — is kept in `finance_entries` / `finance_balances` and typed in
   once, exactly as it was kept in the sheet.

   Periods are semi-monthly (1st–15th, 16th–end) because every cost column
   lands on a date and needs one consistent bucket. The Commas payout batches
   that make up the revenue column are listed separately, unrounded.
   ═══════════════════════════════════════════════════════════════════════════ */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN = (process.env.META_ACCESS_TOKEN || '').trim().replace(/\\n$/, '')
const META_BASE = 'https://graph.facebook.com/v25.0'

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Categories the sheet keeps, in the order the sheet keeps them. */
export const MANUAL_CATEGORIES = ['refund', 'referral', 'payroll', 'profit_share', 'investment', 'interest'] as const

type Period = { key: string; label: string; start: string; end: string }

function semiMonthlyPeriods(from: string, to: string): Period[] {
  const out: Period[] = []
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  const last = new Date(`${to}T00:00:00Z`)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  for (let cursor = start; cursor <= last && out.length < 80; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const y = cursor.getUTCFullYear()
    const m = cursor.getUTCMonth()
    const eom = new Date(Date.UTC(y, m + 1, 0))
    const half: [string, string][] = [
      [ymd(new Date(Date.UTC(y, m, 1))), ymd(new Date(Date.UTC(y, m, 15)))],
      [ymd(new Date(Date.UTC(y, m, 16))), ymd(eom)],
    ]
    for (const [s, e] of half) {
      if (e < from || s > to) continue
      out.push({
        key: s,
        label: `${MONTHS[m]} ${Number(s.slice(8, 10))}–${Number(e.slice(8, 10))}`,
        start: s,
        end: e,
      })
    }
  }
  return out
}

async function metaSpendByDay(accountIds: string[], start: string, end: string) {
  const byDay: Record<string, number> = {}
  if (!TOKEN || accountIds.length === 0) return byDay

  await Promise.all(accountIds.map(async accountId => {
    const url = new URL(`${META_BASE}/${accountId}/insights`)
    url.searchParams.set('access_token', TOKEN)
    url.searchParams.set('fields', 'spend')
    url.searchParams.set('time_range', JSON.stringify({ since: start, until: end }))
    url.searchParams.set('time_increment', '1')
    url.searchParams.set('level', 'account')
    url.searchParams.set('limit', '500')

    let next: string | null = url.toString()
    for (let page = 0; next && page < 6; page++) {
      const res: Response = await fetch(next, { next: { revalidate: 300 } })
      const json: any = await res.json().catch(() => null)
      if (!res.ok || json?.error) break
      for (const row of json.data || []) {
        const d = row.date_start
        if (d) byDay[d] = (byDay[d] || 0) + (parseFloat(row.spend || '0') || 0)
      }
      next = json.paging?.next || null
    }
  }))

  return byDay
}

export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams
  const today = ymd(new Date())

  /* ── Money in ─────────────────────────────────────────────────────────── */
  let transactions: FanbasisTransaction[] = []
  let fanbasisError: string | null = null
  let fetchedAt: string | null = null

  if (!fanbasisConfigured) {
    fanbasisError = 'FANBASIS_API_KEY is not set, so no revenue can be read from Commas.'
  } else {
    try {
      const ledger = await loadFanbasisLedger()
      transactions = ledger.transactions
      fetchedAt = ledger.fetchedAt
    } catch (e: any) {
      fanbasisError = e?.message || 'Commas could not be reached.'
    }
  }

  /* ── Hand-kept lines ──────────────────────────────────────────────────── */
  let entries: any[] = []
  let balances: any[] = []
  let entriesMissing = false

  const [entriesRes, balancesRes, opsRes, firmsRes, periodsRes] = await Promise.all([
    supabase.from('finance_entries').select('*').order('date', { ascending: true }),
    supabase.from('finance_balances').select('*').order('as_of', { ascending: false }),
    supabase.from('ops_expenses').select('date, amount, category, description').order('date', { ascending: true }),
    supabase.from('firms').select('meta_account_id'),
    supabase.from('finance_periods').select('*').order('period_end', { ascending: true }),
  ])

  if (entriesRes.error) {
    if (/finance_entries|schema cache/i.test(entriesRes.error.message)) entriesMissing = true
  } else {
    entries = entriesRes.data || []
  }
  if (!balancesRes.error) balances = balancesRes.data || []

  const ops = opsRes.data || []
  const accountIds = [...new Set((firmsRes.data || []).map((f: any) => (f.meta_account_id || '').trim()).filter(Boolean))]

  /* ── Window ───────────────────────────────────────────────────────────── */
  const firstMoney = transactions[0]?.chargedOn || ops[0]?.date || today
  const start = sp.get('start') || (firstMoney < today ? firstMoney : today)
  const end = sp.get('end') || today
  /* The business closes its books on its own pay periods — irregular by
     design (the 12th, the 26th, the 17th…). Semi-monthly buckets are only the
     fallback for a database that has not been seeded yet. */
  const declared: Period[] = (periodsRes.error ? [] : (periodsRes.data || [])).map((p: any) => ({
    key: p.period_end,
    label: p.label,
    start: p.period_start,
    end: p.period_end,
  }))
  const lastDeclared = declared[declared.length - 1]
  const periods = declared.length
    ? [...declared, ...(lastDeclared && lastDeclared.end < end
        ? semiMonthlyPeriods(ymd(new Date(Date.parse(`${lastDeclared.end}T00:00:00Z`) + 86400000)), end)
        : [])]
    : semiMonthlyPeriods(start, end)
  const periodOf = (date: string) => periods.find(p => date >= p.start && date <= p.end) || null

  const spendByDay = await metaSpendByDay(accountIds, start, end)

  /* ── Fold everything into the period rows ─────────────────────────────── */
  const blank = () => ({
    revenue: 0, pending: 0, gross: 0, fees: 0, refund: 0,
    adSpend: 0, ops: 0, referral: 0, payroll: 0,
    profitShare: {} as Record<string, number>, profitShareTotal: 0,
    investment: 0, interest: 0, transactions: 0,
  })
  const rows: Record<string, ReturnType<typeof blank>> = {}
  for (const p of periods) rows[p.key] = blank()
  const bucket = (date: string | null) => {
    if (!date) return null
    const p = periodOf(date)
    return p ? rows[p.key] : null
  }

  let pendingTotal = 0
  for (const t of transactions) {
    // The sheet nets the flat transfer fee out of every payout line.
    const received = Math.max(0, t.net - PAYOUT_FEE)
    const charged = bucket(t.chargedOn)
    if (charged) {
      charged.gross += t.gross
      charged.fees += t.fee
      charged.transactions += 1
    }
    if (t.released && t.releasedOn) {
      const landed = bucket(t.releasedOn)
      if (landed) landed.revenue += received
    } else {
      pendingTotal += received
      const charged2 = bucket(t.chargedOn)
      if (charged2) charged2.pending += received
    }
    if (t.refunded > 0) {
      const r = bucket(t.releasedOn || t.chargedOn)
      if (r) r.refund += t.refunded
    }
  }

  for (const [date, spend] of Object.entries(spendByDay)) {
    const r = bucket(date)
    if (r) r.adSpend += spend
  }

  /* Where the sheet carries an ops figure for a period it is the total for
     that period, not an addition to it — ops_expenses holds only a fraction of
     those lines, and adding both would count the same software twice. */
  const manualOpsPeriods = new Set(
    entries.filter(e => e.category === 'ops').map(e => periodOf(e.date)?.key).filter(Boolean) as string[]
  )
  for (const e of ops) {
    const p = periodOf(e.date)
    if (!p || manualOpsPeriods.has(p.key)) continue
    rows[p.key].ops += parseFloat(e.amount || 0) || 0
  }

  for (const e of entries) {
    const r = bucket(e.date)
    if (!r) continue
    const amount = Math.abs(parseFloat(e.amount || 0) || 0)
    switch (e.category) {
      case 'refund':       r.refund += amount; break
      case 'referral':     r.referral += amount; break
      case 'payroll':      r.payroll += amount; break
      case 'investment':   r.investment += amount; break
      case 'interest':     r.interest += amount; break
      case 'profit_share': {
        const who = e.entity || 'Profit share'
        r.profitShare[who] = (r.profitShare[who] || 0) + amount
        r.profitShareTotal += amount
        break
      }
      default: r.ops += amount
    }
  }

  const entities = [...new Set(entries.filter(e => e.category === 'profit_share').map(e => e.entity || 'Profit share'))].sort()

  const periodRows = periods.map(p => {
    const r = rows[p.key]
    const spent = r.adSpend + r.ops + r.referral + r.payroll + r.refund
    return {
      ...p,
      ...r,
      spent,
      netProfit: r.revenue - spent - r.profitShareTotal,
    }
  })

  const sum = (pick: (r: typeof periodRows[number]) => number) => periodRows.reduce((t, r) => t + pick(r), 0)

  const received = sum(r => r.revenue)
  const refunds = sum(r => r.refund)
  const adSpend = sum(r => r.adSpend)
  const opsTotal = sum(r => r.ops)
  const referral = sum(r => r.referral)
  const payroll = sum(r => r.payroll)
  const profitShare = sum(r => r.profitShareTotal)
  const investment = sum(r => r.investment)
  const interest = sum(r => r.interest)
  const spent = adSpend + opsTotal + referral + payroll + refunds

  /* The payout batches themselves — the raw material behind the revenue
     column, so any line in the sheet can be traced to a release date. */
  const payoutMap: Record<string, { date: string; count: number; gross: number; fees: number; net: number }> = {}
  for (const t of transactions) {
    if (!t.released || !t.releasedOn) continue
    const b = (payoutMap[t.releasedOn] ||= { date: t.releasedOn, count: 0, gross: 0, fees: 0, net: 0 })
    b.count += 1
    b.gross += t.gross
    b.fees += t.fee
    b.net += Math.max(0, t.net - PAYOUT_FEE)
  }
  const payouts = Object.values(payoutMap).sort((a, b) => b.date.localeCompare(a.date))

  return NextResponse.json({
    range: { start, end },
    source: {
      revenue: 'commas',
      fetchedAt,
      error: fanbasisError,
      transactions: transactions.length,
      payoutFee: PAYOUT_FEE,
    },
    totals: {
      received,
      pending: pendingTotal,
      gross: sum(r => r.gross),
      fees: sum(r => r.fees),
      refunds,
      adSpend,
      ops: opsTotal,
      referral,
      payroll,
      spent,
      profitShare,
      investment,
      interest,
      netPosition: received - spent - profitShare + investment + interest,
      transactions: transactions.length,
    },
    entities,
    periods: periodRows,
    payouts,
    balances: balances.map(b => ({
      account: b.account,
      label: b.label || b.account,
      amount: parseFloat(b.amount || 0) || 0,
      asOf: b.as_of,
      note: b.note || null,
    })),
    setup: { entriesMissing },
  })
}
