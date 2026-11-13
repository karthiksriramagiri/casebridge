import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { tokenForAccount } from '@/app/_metrics/ad-accounts'
import { nextPaymentDate, STANDARD_HOURLY } from '@/lib/pay'
import { campaignCodesFor, codeInCampaign } from '@/lib/finance/campaigns'
import { financeDay, financeToday } from '@/lib/finance/clock'
import { basePayByDay, commissionByCase, rateMap, type CaseRow } from '@/lib/finance/worker-cost'
import { addDays, toISO, type ISODate } from './dates'
import { distributeCents, distributeEvenly, toCents, type Cents } from './money'
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

/* Meta's daily spend, one row per campaign per day.

   Read per campaign rather than per account because a firm is named by its
   campaign, not by the account the campaign happens to sit in — Larry H.
   Parker's LHP and LHP_SP both run inside the account that once carried
   four other firms. The two levels sum to the same money (checked against
   Meta: the campaign rows for an account total its account row to the
   cent), so nothing is gained or lost by reading the finer one. */
type SpendRow = { date: ISODate; cents: Cents; campaign: string }

async function metaDaily(accountId: string, since: ISODate, until: ISODate) {
  const token = tokenForAccount(accountId)
  if (!token) return [] as SpendRow[]
  const url = new URL(`${META}/${accountId}/insights`)
  url.searchParams.set('access_token', token)
  url.searchParams.set('fields', 'campaign_name,spend')
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('time_increment', '1')
  url.searchParams.set('time_range', JSON.stringify({ since, until }))
  url.searchParams.set('limit', '500')

  const out: SpendRow[] = []
  let next: string | null = url.toString()
  for (let page = 0; next && page < 12; page++) {
    const res: any = await fetch(next, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (!res || res.error) break
    for (const r of res.data ?? []) {
      out.push({ date: r.date_start, cents: toCents(Number(r.spend) || 0), campaign: r.campaign_name ?? '' })
    }
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
      /* The Team Center's own rate for each rep, alongside the name. The
         Reps page writes it, and it is what the rep is paid. */
      supabase.from('profiles').select('id, name, hourly_rate'),
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
  /* Pacific, not UTC — the server's clock is not the company's. See
     lib/finance/clock.ts. */
  const today = financeToday()
  const opexRows = opexRes.error ? [] : (opexRes.data ?? [])
  const opexTableMissing = Boolean(opexRes.error && MISSING.test(opexRes.error.message))
  if (opexRes.error && !opexTableMissing) errors.push(`operating expenses: ${opexRes.error.message}`)

  const allDates = [
    ...invoices.flatMap((i) => [i.periodStart, i.periodEnd]),
    ...opexRows.flatMap((r: any) => [String(r.service_start).slice(0, 10), String(r.service_end).slice(0, 10)]),
  ].filter(Boolean)

  /* The ledger spans from the book's start date to today. */
  /* The ledger spans the whole calendar year, not just the days with
     something in them.

     It used to begin at the first cost, which meant the filter clamped
     every range to that date and the labels stopped being true: "Month to
     date" on the 9th of November read Nov 4 – Nov 9, because the book
     happened to start on the 4th. A month to date is the month to date.
     Days before anything happened are simply zero, which is the honest
     answer and the one the label already implies. */
  const earliest = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : today
  const floor = earliest < COST_START ? earliest : COST_START
  const dataStart: ISODate = `${floor.slice(0, 4)}-01-01`
  /* Today, never later.

     This took the furthest date anything reached, which on an invoice
     running to the end of the month meant the ledger ran to the end of the
     month too: "Today" resolved to Nov 30, Week to date ended on Nov 30,
     and the page recognised revenue for days that have not happened. A
     report is written up to now. */
  const dataAsOf: ISODate = today

  // ── Advertising ─────────────────────────────────────────────────────
  /* Read per campaign, charged to the firm whose code the campaign carries.

     Larry H. Parker runs LHP and LHP_SP; both are its campaigns and both
     are its cost. Reading the account total instead gave the same answer
     only because every other firm on that account is archived — which is
     not something a reader of the report could check, and not something
     that stays true the next time a campaign is started in there.

     A campaign matching no firm's code falls back to the old rule, split
     across the firms live on the account by invoiced revenue. It is also
     counted, because spend that names no firm is a thing to fix. */
  const accountIds = [...new Set(firms.map((f) => f.adAccountId).filter(Boolean) as string[])]
  const dailyByAccount: Record<string, SpendRow[]> = {}
  await Promise.all(
    accountIds.map(async (id) => {
      dailyByAccount[id] = await metaDaily(id, dataStart > COST_START ? dataStart : COST_START, dataAsOf)
    }),
  )

  const adSpend: AdSpendRecord[] = []
  let sharedAdAccounts = 0
  let unmatchedAdSpend = 0
  for (const accountId of accountIds) {
    const onAccount = firms.filter((f) => f.adAccountId === accountId)
    if (onAccount.length === 0) continue
    if (onAccount.length > 1) sharedAdAccounts++
    for (const { date, cents, campaign } of dailyByAccount[accountId] ?? []) {
      if (date < COST_START) continue
      /* The campaign says whose it is. Checked across every firm, not only
         the ones on this account, so a campaign started in the wrong
         account still reaches the firm that pays for it. */
      const named = firms.find((f) => codeInCampaign(campaign, campaignCodesFor(f.slug)))
      if (named) {
        adSpend.push({ date, firmId: named.id, amountCents: cents })
        continue
      }
      unmatchedAdSpend += cents
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
  /* Rates as the Team Center holds them: the dated table first, each rep's
     profile second, the standard rate for anyone in neither. */
  const profileRates = (profileRes.data ?? []).map((p: any) => ({ id: p.id, hourly_rate: p.hourly_rate ?? null }))
  const rates = rateMap(ratesRes.data ?? [], profileRates)
  /* Only a gap when the table could not be read at all. An empty table is
     not a missing rate — it means nobody is on an override, and everyone
     is on the rate the Team Center pays. */
  const payRatesMissing = Boolean(ratesRes.error) && !MISSING.test(ratesRes.error?.message ?? '')
  const repsOnStandardRate = profileRates.filter((p) => !(p.id in rates)).length
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

  /* Commission counts on the day the case signed, not the day it is paid.

     It used to move to the pay date, on the reasoning that a cost is not a
     cost until the money leaves. That is true of a bank balance and wrong
     for this report: the fortnight that produced the cases showed only the
     hourly pay against them, so a good week looked cheap and the pay date
     took a spike that belonged to the two weeks before it. Cost per case
     was unreadable — the cases were in one column and half of what they
     cost in another.

     So commission is recognised when it is earned, which is when the case
     signs. A case signed today puts its commission in today's intake even
     though payday is a week away. The figure runs ahead of the bank rather
     than behind it, which is the safer direction to be wrong in: it
     overstates cost slightly and never understates it.

     `accruedCommission` still reports what has been earned and not yet
     paid, because that gap is worth seeing on its own — it is just no
     longer the difference between appearing in the report and not. */
  let accruedCommission = 0
  let nextPayday: ISODate | null = null
  for (const row of commissionByCase(caseRows)) {
    if (!row.firmId || !firmIds.has(row.firmId) || row.date < COST_START) continue
    const cents = toCents(row.amount)
    const paidOn = toISO(nextPaymentDate(new Date(`${row.date}T12:00:00Z`)))
    if (paidOn > dataAsOf) {
      accruedCommission += cents
      if (!nextPayday || paidOn < nextPayday) nextPayday = paidOn
    }
    intakeAt(row.date, row.firmId).commissionCents += cents
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
    /* The Pacific day it signed. `qualified_at` is a UTC instant, and
       slicing its first ten characters tracked every case signed after
       four in the afternoon here to tomorrow. */
    const day = financeDay(r.qualified_at)
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

  /* Base pay, split across the firms the desk actually worked for.

     It was an even split between every firm with a live invoice, which is
     what the old book did when one firm was the only one being billed.
     With two firms live and very different volumes that charges the
     quieter firm half a day's desk for a third of the day's work, and its
     margin carries a cost nobody worked for.

     The day's signed cases are the record of where the hours went, so they
     are the weight: a day of 9 cases for one firm and 3 for another splits
     the pay three to one. Commission needs no such rule — it is earned on
     one case for one firm and goes straight there.

     A day with cases for nobody falls back to an even split: the reps were
     still on the clock and nothing else says who for. Running after the
     case map is built is what lets this read the day's cases at all. */
  for (const day of basePayByDay(timeRes.data ?? [], rates)) {
    if (day.date < COST_START) continue
    const live = firms.filter((f) =>
      invoices.some((i) => i.firmId === f.id && i.periodStart <= day.date && i.periodEnd >= day.date),
    )
    if (live.length === 0) continue
    const cents = toCents(day.spend)
    const weights = live.map((f) => caseByKey.get(`${day.date}|${f.id}`)?.cases ?? 0)
    /* Largest remainder, so a day's pay is never a cent short of what was
       paid — and an even split when the day produced no case at all. */
    const parts = distributeCents(cents, weights) ?? distributeEvenly(cents, live.length)
    live.forEach((f, k) => {
      intakeAt(day.date, f.id).basePayCents += parts[k]
    })
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
    gaps: {
      opexTableMissing,
      payRatesMissing,
      standardHourly: STANDARD_HOURLY,
      ratedReps: Object.keys(rates).length,
      repsOnStandardRate,
      sharedAdAccounts,
      unmatchedAdSpend,
      errors,
      accruedCommission,
      nextPayday,
    },
  }
}
