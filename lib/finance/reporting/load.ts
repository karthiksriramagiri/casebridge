import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { tokenForAccount } from '@/app/_metrics/ad-accounts'
import { basePayByDay, commissionByCase, rateMap, type CaseRow } from '@/lib/finance/worker-cost'
import { addDays, toISO, type ISODate } from './dates'
import { toCents, type Cents } from './money'
import {
  OPEX_CATEGORIES,
  type AdSpendRecord,
  type CaseRevenueRecord,
  type EarnoutConfig,
  type FinanceDataset,
  type Firm,
  type IntakeCostRecord,
  type Invoice,
  type OpexCategory,
  type OpexExpense,
  type TargetsConfig,
} from './types'

/* ═══════════════════════════════════════════════════════════════════════════
   Everything the Reporting Center reads, in one place.

   This module does all the I/O and nothing else: it returns a plain dataset
   in integer cents, and `buildReport` turns that into the page. Keeping the
   two apart is what makes the arithmetic testable — and it is the reason
   the figures can be trusted to reconcile, because there is exactly one
   place where a dollar becomes a cent.

   Four sources, each with its own idea of what a day is:

     firm_invoices   revenue, straight-lined across the service period
     Meta            advertising, per ad account per day
     Team Center     intake cost — hours clocked and commission earned
     operating_expenses   the overhead, allocated and recognised

   What cannot be loaded is reported in `gaps` rather than defaulted to
   zero. A missing pay-rates table is not a payroll of nothing, and the
   difference matters to every margin on the page.
   ═══════════════════════════════════════════════════════════════════════════ */

const MISSING = /does not exist|schema cache|relation .* does not exist/i
const META = 'https://graph.facebook.com/v25.0'

/* Nothing before this date counts.

   The Meta accounts hold spend going back to the start of the year, from
   campaigns run before the Financial Center billed against them. Counting
   it put $1.2M of advertising against $350k of invoiced revenue and
   handed five figures of cost to firms that have not been billed for a
   day of it. The book starts where the invoicing starts. */
export const COST_START = '2026-11-04'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Meta's daily account spend. One call per account over the whole span. */
async function metaDaily(accountId: string, since: ISODate, until: ISODate) {
  const token = tokenForAccount(accountId)
  if (!token) return [] as { date: ISODate; cents: Cents }[]
  const url = new URL(`${META}/${accountId}/insights`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('fields', 'spend')
  url.searchParams.set('level', 'account')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('limit', '500')

  const out: { date: ISODate; cents: Cents }[] = []
  let next: string | null = url.toString()
  for (let page = 0; next && page < 12; page++) {
    const res: any = await fetch(next, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (!res || res.error) break
    for (const r of res.data ?? []) out.push({ date: r.date_start, cents: toCents(Number(r.spend) || 0) })
    next = res.paging?.next ?? null
  }
  return out
}

const asCategory = (v: unknown): OpexCategory =>
  (OPEX_CATEGORIES as readonly string[]).includes(String(v)) ? (v as OpexCategory) : 'other'

export async function loadFinanceData(): Promise<FinanceDataset> {
  const supabase = db()
  const errors: string[] = []

  const [firmsRes, invRes, timeRes, ratesRes, caseRes, profileRes, opexRes, targetRes, earnRes] =
    await Promise.all([
      supabase.from('firms').select('id, name, slug, archived, meta_account_id, case_value').order('name'),
      supabase
        .from('firm_invoices')
        .select('id, code, firm_id, period_start, period_end, revenue_amount, payment_received, case_count')
        .order('period_start', { ascending: false }),
      supabase.from('time_entries').select('profile_id, date, clock_in, clock_out'),
      supabase.from('worker_pay_rates').select('profile_id, hourly_rate, effective_from').order('effective_from', { ascending: false }),
      supabase
        .from('ghl_leads')
        .select('id, contact_name, firm_id, invoice_code, qualified_at, case_status, closer, closed_by_profile_id, is_ot_close, pipeline_stage')
        .not('qualified_at', 'is', null),
      supabase.from('profiles').select('id, name'),
      supabase.from('operating_expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('reporting_targets').select('*').eq('id', 1).maybeSingle(),
      supabase.from('earnout_config').select('*').eq('id', 1).maybeSingle(),
    ])

  if (firmsRes.error) errors.push(`firms: ${firmsRes.error.message}`)
  if (invRes.error && !MISSING.test(invRes.error.message)) errors.push(`invoices: ${invRes.error.message}`)

  /* Archived firms are left out. They are not billed, they have no live
     invoice, and because several of them sit on an ad account shared with
     a firm that is billed, leaving them in handed each of them an equal
     slice of that account's spend on any day the live firm had no invoice
     open — cost against a firm nobody is invoicing. */
  const firms: Firm[] = (firmsRes.data ?? [])
    .filter((f: any) => !f.archived)
    .map((f: any) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      archived: false,
      adAccountId: (f.meta_account_id || '').trim() || null,
      caseValueCents: toCents(Number(f.case_value ?? 0) || 0),
    }))
  const firmIds = new Set(firms.map((f) => f.id))

  const invoices: Invoice[] = (invRes.data ?? [])
    .filter((r: any) => r.period_start && r.period_end && firmIds.has(r.firm_id))
    .map((r: any) => ({
      id: r.id,
      number: r.code,
      firmId: r.firm_id,
      periodStart: String(r.period_start).slice(0, 10),
      periodEnd: String(r.period_end).slice(0, 10),
      invoicedCents: toCents(Number(r.revenue_amount ?? 0) || 0),
      receivedCents: r.payment_received == null ? null : toCents(Number(r.payment_received)),
      caseCount: r.case_count ?? null,
    }))

  /* The window the ledger covers. Wide enough to hold every invoice and
     every expense, because an expense can be recognised over a period no
     invoice touches and still belong in the company's costs. */
  const today = toISO(new Date())
  const opexRows = opexRes.error ? [] : (opexRes.data ?? [])
  const opexTableMissing = Boolean(opexRes.error && MISSING.test(opexRes.error.message))
  if (opexRes.error && !opexTableMissing) errors.push(`operating expenses: ${opexRes.error.message}`)

  const allDates = [
    ...invoices.flatMap((i) => [i.periodStart, i.periodEnd]),
    ...opexRows.flatMap((r: any) => [String(r.service_start).slice(0, 10), String(r.service_end).slice(0, 10)]),
  ].filter(Boolean)

  /* The ledger spans from the book's start date to today. */
  const earliest = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : today
  /* The later of the two: no earlier than the book begins, and no later
     than the first thing in it. */
  const dataStart: ISODate = earliest > COST_START ? COST_START : earliest
  /* Today, never later.

     This took the furthest date anything reached, which on an invoice
     running to the end of the month meant the ledger ran to the end of the
     month too: "Today" resolved to Nov 30, Week to date ended on Nov 30,
     and the page recognised revenue for days that have not happened. A
     report is written up to now. */
  const dataAsOf: ISODate = today

  // ── Advertising ─────────────────────────────────────────────────────
  /* Per account, then shared out to the firms on it. Two firms can bill
     against one account and nothing inside the account separates them, so
     the split is by each firm's recognised revenue that day — the same
     weight the expense allocator uses, for the same reason. */
  const accountIds = [...new Set(firms.map((f) => f.adAccountId).filter(Boolean) as string[])]
  const dailyByAccount: Record<string, { date: ISODate; cents: Cents }[]> = {}
  await Promise.all(
    accountIds.map(async (id) => {
      dailyByAccount[id] = await metaDaily(id, dataStart > COST_START ? dataStart : COST_START, dataAsOf)
    }),
  )

  const adSpend: AdSpendRecord[] = []
  let sharedAdAccounts = 0
  for (const accountId of accountIds) {
    const onAccount = firms.filter((f) => f.adAccountId === accountId)
    if (onAccount.length === 0) continue
    if (onAccount.length > 1) sharedAdAccounts++
    for (const { date, cents } of dailyByAccount[accountId] ?? []) {
      if (date < COST_START) continue
      if (onAccount.length === 1) {
        adSpend.push({ date, firmId: onAccount[0].id, amountCents: cents })
        continue
      }
      /* Weighted by who was actually being invoiced that day. A firm with
         no live invoice takes none of it; if nobody has one, the day is
         split evenly rather than dropped — the money was spent. */
      const weights = onAccount.map((f) =>
        invoices
          .filter((i) => i.firmId === f.id && i.periodStart <= date && i.periodEnd >= date)
          .reduce((a, i) => a + i.invoicedCents, 0),
      )
      const total = weights.reduce((a, b) => a + b, 0)
      onAccount.forEach((f, k) => {
        const share = total > 0 ? (weights[k] / total) * cents : cents / onAccount.length
        adSpend.push({ date, firmId: f.id, amountCents: Math.round(share) })
      })
    }
  }

  // ── Intake cost ─────────────────────────────────────────────────────
  /* Base pay is company-wide: a rep works every firm in one shift. It is
     spread across the firms with a live invoice that day, the same way the
     old book did it, so the two never disagree. Commission already belongs
     to one firm's case and goes straight there. */
  const payRatesMissing = Boolean(ratesRes.error) || (ratesRes.data ?? []).length === 0
  if (timeRes.error) errors.push(`time entries: ${timeRes.error.message}`)
  if (caseRes.error) errors.push(`signed cases: ${caseRes.error.message}`)

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

  const intakeByKey = new Map<string, IntakeCostRecord>()
  const intakeAt = (date: ISODate, firmId: string) => {
    const key = `${date}|${firmId}`
    let row = intakeByKey.get(key)
    if (!row) intakeByKey.set(key, (row = { date, firmId, basePayCents: 0, commissionCents: 0 }))
    return row
  }

  for (const day of basePayByDay(timeRes.data ?? [], rateMap(ratesRes.data ?? []))) {
    if (day.date < COST_START) continue
    const live = firms.filter((f) =>
      invoices.some((i) => i.firmId === f.id && i.periodStart <= day.date && i.periodEnd >= day.date),
    )
    if (live.length === 0) continue
    const cents = toCents(day.spend)
    live.forEach((f, k) => {
      /* Largest remainder by hand: the last firm takes what rounding left
         behind, so a day's pay is never a cent short of what was paid. */
      const share = k === live.length - 1
        ? cents - Math.floor(cents / live.length) * (live.length - 1)
        : Math.floor(cents / live.length)
      intakeAt(day.date, f.id).basePayCents += share
    })
  }

  for (const row of commissionByCase(caseRows)) {
    if (!row.firmId || !firmIds.has(row.firmId) || row.date < COST_START) continue
    intakeAt(row.date, row.firmId).commissionCents += toCents(row.amount)
  }

  // ── Case revenue ────────────────────────────────────────────────────
  /* What was delivered, day by day: cases signed for a firm, valued at
     that firm's case price. A signed case is a ghl_leads row with no
     pipeline stage — the stage column tracks a lead's progress and is
     cleared once the case signs, which is the same definition Finance
     invoices against and the Creative Center counts. */
  const caseByKey = new Map<string, CaseRevenueRecord>()
  for (const r of caseRes.data ?? []) {
    const firmId = r.firm_id as string | null
    const day = String(r.qualified_at ?? '').slice(0, 10)
    if (!firmId || !firmIds.has(firmId) || !day || day < COST_START) continue
    /* A replacement is a case swapped for another, not a case delivered.
       Counting it would bill the same delivery twice. */
    if (String(r.case_status || '').toLowerCase() === 'replacement') continue
    const value = firms.find((f) => f.id === firmId)?.caseValueCents ?? 0
    const key = `${day}|${firmId}`
    const row = caseByKey.get(key) ?? { date: day, firmId, cases: 0, amountCents: 0 }
    row.cases += 1
    row.amountCents += value
    caseByKey.set(key, row)
  }

  // ── Operating expenses ──────────────────────────────────────────────
  const expenses: OpexExpense[] = opexRows.map((r: any) => ({
    id: r.id,
    expenseDate: String(r.expense_date).slice(0, 10),
    servicePeriodStart: String(r.service_start).slice(0, 10),
    servicePeriodEnd: String(r.service_end).slice(0, 10),
    description: r.description ?? '',
    vendor: r.vendor ?? '',
    category: asCategory(r.category),
    amountCents: Number(r.amount_cents) || 0,
    recurrence: r.recurrence === 'monthly' ? 'monthly' : 'one_time',
    allocationMethod: ['direct', 'even', 'revenue', 'unallocated'].includes(r.allocation) ? r.allocation : 'unallocated',
    firmIds: Array.isArray(r.firm_ids) ? r.firm_ids.filter((id: string) => firmIds.has(id)) : [],
    status: ['posted', 'pending', 'void'].includes(r.status) ? r.status : 'posted',
    notes: r.notes ?? '',
    createdAt: r.created_at ?? '',
    createdBy: r.created_by ?? '',
    updatedAt: r.updated_at ?? '',
    updatedBy: r.updated_by ?? '',
  }))

  // ── Targets and earn-out ────────────────────────────────────────────
  /* Null rather than zero when nothing is configured. A target of zero is
     attainment of infinity, and a page that reports being infinitely ahead
     of plan is worse than one that says no target is set. */
  const t: any = targetRes.error ? null : targetRes.data
  const targets: TargetsConfig | null = t
    ? {
        company: {
          daily: Number(t.daily_cents) || 0,
          weekly: Number(t.weekly_cents) || 0,
          monthly: Number(t.monthly_cents) || 0,
          quarterly: Number(t.quarterly_cents) || 0,
          annual: Number(t.annual_cents) || 0,
        },
        firmMonthly: Object.fromEntries(
          Object.entries((t.firm_monthly ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]),
        ),
        updatedAt: t.updated_at ?? '',
        updatedBy: t.updated_by ?? '',
      }
    : null

  const e: any = earnRes.error ? null : earnRes.data
  const earnout: EarnoutConfig | null = e
    ? {
        agreementReference: e.agreement_reference ?? '',
        deductAdvertising: e.deduct_advertising !== false,
        deductIntake: e.deduct_intake !== false,
        deductUnallocatedOpex: e.deduct_unallocated === true,
        eligibleOpexCategories: (e.eligible_categories ?? []).map(asCategory),
        rateBps: Number(e.rate_bps) || 0,
        updatedAt: e.updated_at ?? '',
        updatedBy: e.updated_by ?? '',
      }
    : null

  return {
    firms,
    invoices,
    adSpend,
    intakeCosts: [...intakeByKey.values()],
    caseRevenue: [...caseByKey.values()],
    expenses,
    targets,
    earnout,
    dataStart,
    dataAsOf,
    gaps: { opexTableMissing, payRatesMissing, sharedAdAccounts, errors },
  }
}
