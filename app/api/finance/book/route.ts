import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tokenForAccount } from '@/app/_metrics/ad-accounts'
import {
  allocateDailyCost, allocateCommission, computeMargin, overlapDays,
  clipPeriod, prorateRevenue, clipDaily,
  type InvoiceInput, type Period,
} from '@/lib/finance/margin'
import {
  basePayByDay, commissionByCase, rateMap,
  type CaseRow,
} from '@/lib/finance/worker-cost'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

/* The whole book in one response.

   The dashboard, the firms tab and every invoice page read this, so they
   cannot disagree with each other about a number — which is exactly what
   happened in the version this replaces, where the company margin and the
   per-firm margins were computed in different places from different costs. */

const BASE = 'https://graph.facebook.com/v25.0'
const MISSING = /does not exist|schema cache/i

async function metaDaily(accountId: string, since: string, until: string) {
  const token = tokenForAccount(accountId)
  if (!token) return [] as { date: string; spend: number }[]
  const url = new URL(`${BASE}/${accountId}/insights`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('fields', 'spend')
  url.searchParams.set('level', 'account')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('limit', '500')
  const out: { date: string; spend: number }[] = []
  let next: string | null = url.toString()
  let pages = 0
  while (next && pages < 12) {
    const res: any = await fetch(next, { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    if (!res || res.error) break
    for (const r of res.data ?? []) {
      out.push({ date: r.date_start, spend: Number(r.spend) || 0 })
    }
    next = res.paging?.next ?? null
    pages++
  }
  return out
}

export async function GET(req: NextRequest) {
  /* An optional window. Without one the book is all time, which is what the
     firms tab and every invoice page ask for — only the dashboard narrows it,
     so those pages keep showing a firm's whole history. */
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const window: Period | null = from && to ? { start: from, end: to } : null

  // ── Load ──────────────────────────────────────────────────────────────
  const [firmsRes, invRes] = await Promise.all([
    supabase.from('firms')
      .select('id, name, slug, archived, meta_account_id, case_value')
      .order('name'),
    supabase.from('firm_invoices')
      .select('id, code, firm_id, title, period_start, period_end, case_count, revenue_amount, payment_received, sort_order')
      .order('period_start', { ascending: false }),
  ])

  if (firmsRes.error) {
    return NextResponse.json({ error: firmsRes.error.message }, { status: 500 })
  }
  const firms = (firmsRes.data ?? [])

  let invoicesRaw = invRes.data ?? []
  let invoicesNeedRevenueColumn = false
  if (invRes.error) {
    if (!MISSING.test(invRes.error.message)) {
      return NextResponse.json({ error: invRes.error.message }, { status: 500 })
    }
    // revenue_amount not added yet — read without it so the page still works.
    const retry = await supabase.from('firm_invoices')
      .select('id, code, firm_id, title, period_start, period_end, case_count, payment_received, sort_order')
      .order('period_start', { ascending: false })
    invoicesRaw = (retry.data ?? []).map(r => ({ ...r, revenue_amount: null }))
    invoicesNeedRevenueColumn = true
  }

  /* Worker cost comes from the Team Center, not from a payroll kept here:
     the hours reps clock, the rate each is on, and the cases they closed.
     Those are the numbers reps are actually paid against, so the margin and
     the pay page can never tell two different stories. */
  const [timeRes, ratesRes, caseRes, profileRes] = await Promise.all([
    supabase.from('time_entries').select('profile_id, date, clock_in, clock_out'),
    supabase.from('worker_pay_rates').select('profile_id, hourly_rate, effective_from')
      .order('effective_from', { ascending: false }),
    supabase.from('ghl_leads')
      .select('id, contact_name, firm_id, invoice_code, qualified_at, case_status, closer, closed_by_profile_id, is_ot_close')
      .not('qualified_at', 'is', null),
    supabase.from('profiles').select('id, name'),
  ])
  const teamDataAvailable = !timeRes.error && !caseRes.error

  // ── Shape ─────────────────────────────────────────────────────────────
  const firmById = new Map(firms.map(f => [f.id, f]))

  /* `period` is what the invoice actually bills. `window` clips it to the
     range the dashboard asked for, and every cost is allocated against the
     clipped one so nothing outside the range can reach an invoice. Revenue is
     pro-rated on the same boundary. Invoices the window misses entirely drop
     out rather than appearing at zero. */
  type Row = InvoiceInput & {
    fullPeriod: Period; fullRevenue: number
    title: string | null; caseCount: number | null; paymentReceived: number | null
    firmName: string; firmSlug: string
  }
  const invoices: Row[] = invoicesRaw
    .filter(r => r.period_start && r.period_end)
    .map(r => {
      const f = firmById.get(r.firm_id)
      const fullPeriod = {
        start: String(r.period_start).slice(0, 10),
        end: String(r.period_end).slice(0, 10),
      }
      const clipped = clipPeriod(fullPeriod, window)
      const fullRevenue = Number(r.revenue_amount ?? 0) || 0
      return {
        id: r.id,
        code: r.code,
        firmId: r.firm_id,
        period: clipped ?? fullPeriod,
        revenue: clipped ? prorateRevenue(fullRevenue, fullPeriod, window) : 0,
        fullPeriod,
        fullRevenue,
        inWindow: Boolean(clipped),
        title: r.title ?? null,
        caseCount: r.case_count ?? null,
        paymentReceived: r.payment_received == null ? null : Number(r.payment_received),
        firmName: f?.name ?? 'Unknown firm',
        firmSlug: f?.slug ?? '',
      }
    })
    .filter((r: any) => r.inWindow)

  const profileName = new Map((profileRes.data ?? []).map((p: any) => [p.id, p.name]))
  const caseRows: CaseRow[] = (caseRes.data ?? []).map((r: any) => ({
    id: r.id,
    contactName: r.contact_name ?? null,
    firmId: r.firm_id ?? null,
    invoiceCode: r.invoice_code ?? null,
    signedAt: r.qualified_at ?? null,
    caseStatus: r.case_status ?? null,
    closer: (r.closed_by_profile_id ? profileName.get(r.closed_by_profile_id) : null) || r.closer || null,
    otClose: r.is_ot_close === true,
  }))

  // ── Advertising, per firm, per day ────────────────────────────────────
  /* One Meta call per ad account over the full span the invoices cover, then
     each invoice takes the slice inside its own dates. Firms that share an
     account share its daily series — splitting a shared account between firms
     needs a campaign filter, which the old build had and got wrong often
     enough that it is better left out than left misleading. */
  const spanStart = invoices.reduce((m, i) => (i.period.start < m ? i.period.start : m),
    invoices[0]?.period.start ?? '2026-01-01')
  const spanEnd = invoices.reduce((m, i) => (i.period.end > m ? i.period.end : m),
    invoices[0]?.period.end ?? new Date().toISOString().slice(0, 10))

  const accountIds = [...new Set(firms.map(f => (f.meta_account_id || '').trim()).filter(Boolean))]
  const dailyByAccount: Record<string, { date: string; spend: number }[]> = {}
  await Promise.all(accountIds.map(async id => {
    dailyByAccount[id] = await metaDaily(id, spanStart, spanEnd)
  }))
  const dailyForFirm = (firmId: string) => {
    const acct = (firmById.get(firmId)?.meta_account_id || '').trim()
    return acct ? (dailyByAccount[acct] ?? []) : []
  }

  // ── Worker cost: base pay by day, commission by case ──────────────────
  /* Base pay is company-wide — a rep works every firm in one shift — so each
     day of it is divided between all the invoices open that day. Commission
     already belongs to one firm's case, so it is placed directly. */
  const rates = rateMap(ratesRes.data ?? [])
  const basePayDaily = clipDaily(basePayByDay(timeRes.data ?? [], rates), window)
  const baseAlloc = allocateDailyCost(basePayDaily, invoices)

  const commissionRows = clipDaily(commissionByCase(caseRows), window)
  const commAlloc = allocateCommission(commissionRows, invoices)

  const allocation = {
    byInvoice: Object.fromEntries(invoices.map(i =>
      [i.id, (baseAlloc.byInvoice[i.id] ?? 0) + (commAlloc.byInvoice[i.id] ?? 0)])),
    unallocated: baseAlloc.unallocated + commAlloc.unallocated,
    total: baseAlloc.total + commAlloc.total,
  }

  /* Advertising, allocated day by day within each firm.

     Done per firm rather than globally so one firm's spend can never land on
     another's invoice, and day by day rather than per period because invoice
     periods overlap — summing spendInPeriod across them counted shared days
     once per invoice and reported $3.27M against $1.02M of real spend. */
  const spendAlloc: Record<string, number> = {}
  let spendUnallocated = 0
  let spendTotal = 0
  const sharedAccounts: string[] = []
  for (const accountId of accountIds) {
    const daily = clipDaily(dailyByAccount[accountId] ?? [], window)
    if (!daily.length) continue
    /* Per account, not per firm. Larry H. Parker and Fears Law both sit on
       act_788484706914452, so walking firms counted that account's spend once
       for each of them — six times over including the archived firms, which is
       how $1.02M of real spend was reported as $5.5M. */
    const firmsOnAccount = firms.filter(f => (f.meta_account_id || '').trim() === accountId)
    if (firmsOnAccount.length > 1) sharedAccounts.push(accountId)
    const firmIds = new Set(firmsOnAccount.map(f => f.id))
    const own = invoices.filter(i => firmIds.has(i.firmId))
    const a = allocateDailyCost(daily, own)
    for (const [id, v] of Object.entries(a.byInvoice)) spendAlloc[id] = (spendAlloc[id] ?? 0) + v
    spendUnallocated += a.unallocated
    spendTotal += a.total
  }

  // ── Per-invoice margin ────────────────────────────────────────────────
  const invoiceRows = invoices.map(inv => {
    const adSpend = spendAlloc[inv.id] ?? 0
    const workerCost = allocation.byInvoice[inv.id] ?? 0
    const m = computeMargin(inv.revenue, adSpend, workerCost)
    return {
      id: inv.id,
      code: inv.code,
      title: inv.title,
      firmId: inv.firmId,
      firmName: inv.firmName,
      firmSlug: inv.firmSlug,
      period: inv.fullPeriod,
      countedPeriod: inv.period,
      fullRevenue: inv.fullRevenue,
      days: overlapDays(inv.fullPeriod, inv.fullPeriod),
      daysCounted: overlapDays(inv.period, inv.period),
      caseCount: inv.caseCount,
      paymentReceived: inv.paymentReceived,
      basePay: baseAlloc.byInvoice[inv.id] ?? 0,
      commission: commAlloc.byInvoice[inv.id] ?? 0,
      ...m,
    }
  })

  // ── Per-firm roll-up ──────────────────────────────────────────────────
  /* Archived firms stay in the list, flagged. Their invoices carry real
     revenue and real spend, and dropping them from here while leaving them in
     the company total is how a dashboard stops adding up. The UI can fold them
     away; the arithmetic keeps them. */
  const firmRows = firms.map(f => {
    const own = invoiceRows.filter(i => i.firmId === f.id)
    const revenue = own.reduce((s, i) => s + i.revenue, 0)
    const adSpend = own.reduce((s, i) => s + i.adSpend, 0)
    const workerCost = own.reduce((s, i) => s + i.workerCost, 0)
    return {
      id: f.id, name: f.name, slug: f.slug,
      basePay: own.reduce((s, i) => s + i.basePay, 0),
      commission: own.reduce((s, i) => s + i.commission, 0),
      archived: Boolean(f.archived),
      invoiceCount: own.length,
      ...computeMargin(revenue, adSpend, workerCost),
    }
  })

  // ── Company ───────────────────────────────────────────────────────────
  /* Built from the invoices so the dashboard and the firms tab always agree.
     Unallocated pay is reported rather than folded in — it belongs to months
     no invoice covers, and hiding it would make the totals look tidier than
     the book actually is. */
  const revenue = invoiceRows.reduce((s, i) => s + i.revenue, 0)
  const adSpend = invoiceRows.reduce((s, i) => s + i.adSpend, 0)
  const workerCost = invoiceRows.reduce((s, i) => s + i.workerCost, 0)

  return NextResponse.json({
    company: {
      ...computeMargin(revenue, adSpend, workerCost),
      invoiceCount: invoiceRows.length,
      firmCount: firmRows.filter(f => !f.archived).length,
      workerCostTotal: allocation.total,
      unallocatedWorkerCost: allocation.unallocated,
      basePay: Object.values(baseAlloc.byInvoice).reduce((s, v) => s + v, 0),
      commission: Object.values(commAlloc.byInvoice).reduce((s, v) => s + v, 0),
      basePayTotal: baseAlloc.total,
      commissionTotal: commAlloc.total,
      unallocatedBasePay: baseAlloc.unallocated,
      unallocatedCommission: commAlloc.unallocated,
      /* Spend on days no invoice covers. Shown rather than folded in so the
         dashboard reconciles with the ad accounts instead of looking tidier
         than the book is. */
      adSpendTotal: spendTotal,
      unallocatedAdSpend: spendUnallocated,
      /* Accounts more than one firm bills against. Their spend is split by
         invoice day because nothing in the account separates the firms. */
      sharedAdAccounts: sharedAccounts.length,
    },
    firms: firmRows,
    invoices: invoiceRows,
    window,
    setup: {
      invoicesNeedRevenueColumn,
      teamDataAvailable,
      metaAccounts: accountIds.length,
    },
  })
}
