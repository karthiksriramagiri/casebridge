import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BASE_PAY_PER_CASE, COMMISSION_PER_CLOSED } from '@/app/finance/firms/_lib/invoice-finance'
import {
  loadCaseSheet, SHEET_FIRMS, phoneKey, nameKey, invoiceKey,
  type CaseSheet, type SheetCase,
} from '@/app/lib/case-sheet'

/* ═══════════════════════════════════════════════════════════════════════════
   Financial Center — the company-wide rollup behind the front page.

   Everything else in /finance slices one firm or one invoice. This route is
   the only one that answers "how is the business doing", so it has to solve
   the two problems a per-firm view never hits:

   1. Ad accounts are shared. MCA and LHP both bill against
      act_788484706914452 and are separated only by a campaign-name filter,
      so summing per-firm spend would count the account twice. Spend is
      therefore read once per *account*, then each ad row is handed to exactly
      one firm (filtered firms claim first; the unfiltered firm on that
      account takes the remainder).

   2. Costs are not all firm-scoped. Ops rows with firm_id = null and the
      weekly payroll rates belong to the company, not to any one firm. They
      are kept in a shared bucket rather than smeared across firms, so the
      per-firm table never invents an allocation it cannot defend.
   ═══════════════════════════════════════════════════════════════════════════ */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOKEN = (process.env.META_ACCESS_TOKEN || '').trim().replace(/\\n$/, '')
const BASE = 'https://graph.facebook.com/v25.0'

/* Meta only serves 37 months of insights; anything older is Supabase-only. */
const META_MAX_MONTHS_BACK = 36

const DAY = 86400000
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const monthOf = (iso: string) => (iso || '').slice(0, 7)

let _metaError: string | null = null

/* ── Meta ──────────────────────────────────────────────────────────────── */

async function metaPaged(path: string, params: Record<string, string>, maxPages = 12) {
  if (!TOKEN) {
    _metaError = 'META_ACCESS_TOKEN env var is not set.'
    return []
  }
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const rows: any[] = []
  let next: string | null = url.toString()
  let pages = 0

  while (next && pages < maxPages) {
    pages++
    // Spend figures settle slowly and this page reloads on every visit;
    // a 5-minute shared cache keeps a dashboard refresh off the API.
    const res: Response = await fetch(next, { next: { revalidate: 300 } })
    const json: any = await res.json().catch(() => null)
    if (!res.ok || json?.error) {
      const msg = json?.error?.message || `HTTP ${res.status}`
      _metaError = json?.error?.code === 190
        ? `Meta access token expired or invalid. Refresh it in Business Manager → System Users. (${msg})`
        : msg
      break
    }
    rows.push(...(json.data || []))
    next = json.paging?.next || null
  }
  return rows
}

/** Which firm on this account owns an ad row. Mirrors the per-firm KPI rules. */
function firmClaimsAd(firm: any, ad: any) {
  const filter = (firm.meta_campaign_filter || '').trim().toLowerCase()
  const slug = firm.slug

  // Fears Law: "FL" has to be a discrete pipe-delimited segment of the ad name,
  // otherwise it matches every word containing those letters.
  if (slug === 'fl' || slug === 'fears') {
    const parts = String(ad.ad_name || '').split('|').map((p: string) => p.trim().toUpperCase())
    return parts.includes('FL')
  }
  // Levine Law: JLL appears anywhere in the naming chain.
  if (slug === 'jll') {
    return `${ad.campaign_name || ''} ${ad.adset_name || ''} ${ad.ad_name || ''}`.toUpperCase().includes('JLL')
  }
  if (!filter) return false
  return (
    String(ad.campaign_name || '').toLowerCase().includes(filter) ||
    String(ad.adset_name || '').toLowerCase().includes(filter) ||
    String(ad.ad_name || '').toLowerCase().includes(filter)
  )
}

function hasFilter(firm: any) {
  return Boolean((firm.meta_campaign_filter || '').trim()) || firm.slug === 'fl' || firm.slug === 'fears' || firm.slug === 'jll'
}

function metaLeadsOf(actions: any[] = []) {
  return parseInt(
    actions?.find?.((a: any) => a.action_type === 'lead' || a.action_type === 'offsite_conversion.fb_pixel_lead')?.value || '0'
  ) || 0
}

/* ── Supabase paging ───────────────────────────────────────────────────────
   PostgREST caps a response at 1000 rows. Every table read here is a full
   history, so each one pages until it runs dry.                             */

async function pageAll(build: () => any, pageSize = 1000) {
  const out: any[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return out
}

const LEAD_FIELDS =
  'id, firm_id, contact_name, contact_phone, qualified_at, invoice_code, case_status, victim_count, closer, closed_by_profile_id, ' +
  'custom_case_value:form_data->custom_case_value, excluded:form_data->excluded_from_payment'

/** Signed cases only. Where the pipeline-stage migration has run, stage-tracking
 *  rows share this table and are marked by a non-null pipeline_stage — they are
 *  leads in flight, not revenue. Databases without that column hold signed
 *  cases exclusively, so the filter is dropped rather than failing the page. */
async function loadSignedLeads() {
  const ordered = (q: any) => q.order('qualified_at', { ascending: true })
  try {
    return await pageAll(() => ordered(supabase.from('ghl_leads').select(LEAD_FIELDS).is('pipeline_stage', null)))
  } catch (e: any) {
    if (!/pipeline_stage/i.test(e?.message || '')) throw e
    return await pageAll(() => ordered(supabase.from('ghl_leads').select(LEAD_FIELDS)))
  }
}

/* ── Range ─────────────────────────────────────────────────────────────── */

export type RangeKey = 'this_month' | 'last_30d' | 'last_90d' | 'ytd' | 'last_12m' | 'all' | 'custom'

function resolveRange(key: string, startParam: string, endParam: string, earliest: string) {
  const now = new Date()
  const today = ymd(now)

  if (startParam && endParam) return { key: 'custom' as RangeKey, start: startParam, end: endParam }

  switch (key) {
    case 'this_month':
      return { key: 'this_month' as RangeKey, start: `${today.slice(0, 7)}-01`, end: today }
    case 'last_30d':
      return { key: 'last_30d' as RangeKey, start: ymd(new Date(now.getTime() - 29 * DAY)), end: today }
    case 'ytd':
      return { key: 'ytd' as RangeKey, start: `${today.slice(0, 4)}-01-01`, end: today }
    case 'last_12m': {
      const s = new Date(now); s.setMonth(s.getMonth() - 11); s.setDate(1)
      return { key: 'last_12m' as RangeKey, start: ymd(s), end: today }
    }
    case 'all':
      return { key: 'all' as RangeKey, start: earliest, end: today }
    case 'last_90d':
    default:
      return { key: 'last_90d' as RangeKey, start: ymd(new Date(now.getTime() - 89 * DAY)), end: today }
  }
}

function monthsBetween(start: string, end: string) {
  const out: string[] = []
  const d = new Date(`${start.slice(0, 7)}-01T00:00:00Z`)
  const last = `${end.slice(0, 7)}`
  for (let i = 0; i < 120; i++) {
    const key = ymd(d).slice(0, 7)
    out.push(key)
    if (key >= last) break
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

function daysBetween(start: string, end: string) {
  const out: string[] = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY) {
    out.push(ymd(new Date(t)))
  }
  return out
}

/** Days of [aStart, aEnd] that also fall inside [bStart, bEnd]. */
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const s = Math.max(Date.parse(`${aStart}T00:00:00Z`), Date.parse(`${bStart}T00:00:00Z`))
  const e = Math.min(Date.parse(`${aEnd}T00:00:00Z`), Date.parse(`${bEnd}T00:00:00Z`))
  return e < s ? 0 : Math.round((e - s) / DAY) + 1
}

/* ── Route ─────────────────────────────────────────────────────────────── */

export async function GET(request: NextRequest) {
  _metaError = null
  const sp = new URL(request.url).searchParams
  const rangeParam = sp.get('range') || 'last_90d'
  const startParam = sp.get('start') || ''
  const endParam = sp.get('end') || ''

  let firms: any[] = []
  let leads: any[] = []
  let ops: any[] = []
  let rates: any[] = []
  let invoices: any[] = []
  let invoicesMissing = false
  let payments: any[] = []
  let paymentsMissing = false

  try {
    const [firmRows, leadRows, opsRows, rateRows] = await Promise.all([
      pageAll(() => supabase.from('firms').select('*').order('created_at', { ascending: true })),
      loadSignedLeads(),
      pageAll(() => supabase
        .from('ops_expenses')
        .select('id, firm_id, date, amount, description, category, invoice_code')
        .order('date', { ascending: true })),
      pageAll(() => supabase
        .from('worker_pay_rates')
        .select('id, profile_id, weekly_rate, effective_from, effective_to')),
    ])
    firms = firmRows; leads = leadRows; ops = opsRows; rates = rateRows
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not read the finance tables.' }, { status: 500 })
  }

  try {
    invoices = await pageAll(() => supabase
      .from('firm_invoices')
      .select('id, firm_id, code, title, period_start, period_end, sort_order, payment_received, payment_interest_rate, case_count, fee_rate')
      .order('period_start', { ascending: true }))
  } catch (e: any) {
    // The invoice table is optional-ish: the rest of the dashboard still reads.
    if (/firm_invoices|schema cache/i.test(e?.message || '')) invoicesMissing = true
    else throw e
  }

  /* Money actually received, straight from the processor's export. Optional in
     the same way invoices are: until the migration is run the dashboard falls
     back to the hand-entered per-invoice figure rather than showing nothing. */
  try {
    payments = await pageAll(() => supabase
      .from('payments')
      .select('payment_id, paid_at, gross, net, refunded, status, payer_name, payer_domain, firm_id, product, case_count')
      .order('paid_at', { ascending: true }))
  } catch (e: any) {
    if (/payments|schema cache/i.test(e?.message || '')) paymentsMissing = true
    else throw e
  }

  const firmById: Record<string, any> = Object.fromEntries(firms.map(f => [f.id, f]))

  /* ── Window ───────────────────────────────────────────────────────────── */

  const earliestCandidates = [
    leads[0]?.qualified_at ? String(leads[0].qualified_at).slice(0, 10) : '',
    ops[0]?.date || '',
    invoices[0]?.period_start || '',
  ].filter(Boolean).sort()
  const earliest = earliestCandidates[0] || ymd(new Date(Date.now() - 365 * DAY))

  const range = resolveRange(rangeParam, startParam, endParam, earliest)
  const { start, end } = range
  const days = Math.max(1, overlapDays(start, end, start, end))
  const months = monthsBetween(start, end)

  /* ── Ad spend, read once per account ──────────────────────────────────── */

  const metaFloor = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - META_MAX_MONTHS_BACK)
    return ymd(d)
  })()
  const metaStart = start < metaFloor ? metaFloor : start
  const metaRange = JSON.stringify({ since: metaStart, until: end })
  const wantDaily = daysBetween(start, end).length <= 120

  const accountIds = [...new Set(firms.map(f => (f.meta_account_id || '').trim()).filter(Boolean))]

  const weekStart = ymd(new Date(Date.now() - 6 * DAY))
  const weekRange = JSON.stringify({ since: weekStart, until: ymd(new Date()) })

  const accountResults = await Promise.all(accountIds.map(async accountId => {
    const [adRows, dailyRows, weekRows] = await Promise.all([
      // Ad level, monthly: fine enough to attribute a firm and to build the
      // month-by-month P&L, without a row per ad per day.
      metaPaged(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,actions,ad_name,adset_name,campaign_name',
        time_range: metaRange,
        time_increment: 'monthly',
        level: 'ad',
        limit: '500',
      }),
      wantDaily
        ? metaPaged(`/${accountId}/insights`, {
            fields: 'spend,actions,impressions',
            time_range: metaRange,
            time_increment: '1',
            level: 'account',
            limit: '500',
          }, 4)
        : Promise.resolve([]),
      // Last 7 days, always — spend pacing answers "are we over the cap right
      // now", which has nothing to do with the reporting window on screen.
      metaPaged(`/${accountId}/insights`, {
        fields: 'spend,ad_name,adset_name,campaign_name',
        time_range: weekRange,
        level: 'ad',
        limit: '500',
      }, 4),
    ])
    return { accountId, adRows, dailyRows, weekRows }
  }))

  /* Attribute every ad row to exactly one firm on its account. */
  type Spend = { spend: number; leads: number; impressions: number; clicks: number }
  const blankSpend = (): Spend => ({ spend: 0, leads: 0, impressions: 0, clicks: 0 })

  const spendByFirm: Record<string, Spend> = {}
  const spendByFirmMonth: Record<string, Record<string, number>> = {}
  const spendByMonth: Record<string, number> = {}
  const dailySpend: Record<string, number> = {}
  const dailyMetaLeads: Record<string, number> = {}
  const companySpend = blankSpend()
  const unattributed = blankSpend()

  const weeklySpendByFirm: Record<string, number> = {}

  for (const { accountId, adRows, dailyRows, weekRows } of accountResults) {
    const onAccount = firms.filter(f => (f.meta_account_id || '').trim() === accountId)
    const filtered = onAccount.filter(hasFilter)
    const fallback = onAccount.find(f => !hasFilter(f)) || null

    for (const ad of adRows) {
      const month = monthOf(ad.date_start || '')
      const spend = parseFloat(ad.spend || '0') || 0
      const mLeads = metaLeadsOf(ad.actions)
      const impressions = parseInt(ad.impressions || '0', 10) || 0
      const clicks = parseInt(ad.clicks || '0', 10) || 0

      companySpend.spend += spend
      companySpend.leads += mLeads
      companySpend.impressions += impressions
      companySpend.clicks += clicks
      spendByMonth[month] = (spendByMonth[month] || 0) + spend

      const owner = filtered.find(f => firmClaimsAd(f, ad)) || fallback
      if (!owner) {
        unattributed.spend += spend
        unattributed.leads += mLeads
        continue
      }
      const bucket = (spendByFirm[owner.id] ||= blankSpend())
      bucket.spend += spend
      bucket.leads += mLeads
      bucket.impressions += impressions
      bucket.clicks += clicks
      const byMonth = (spendByFirmMonth[owner.id] ||= {})
      byMonth[month] = (byMonth[month] || 0) + spend
    }

    for (const ad of weekRows) {
      const owner = filtered.find(f => firmClaimsAd(f, ad)) || fallback
      if (!owner) continue
      weeklySpendByFirm[owner.id] = (weeklySpendByFirm[owner.id] || 0) + (parseFloat(ad.spend || '0') || 0)
    }

    for (const d of dailyRows) {
      const date = d.date_start
      if (!date) continue
      dailySpend[date] = (dailySpend[date] || 0) + (parseFloat(d.spend || '0') || 0)
      dailyMetaLeads[date] = (dailyMetaLeads[date] || 0) + metaLeadsOf(d.actions)
    }
  }

  /* ── The case management sheet ────────────────────────────────────────────
     Where a firm keeps its invoices in a sheet, the sheet decides which cases
     an invoice carries — it is what the two sides bill against. Each sheet row
     is matched back onto its CRM record (phone first, then name) so a minor's
     reduced case value and the rep who closed it survive the swap. Rows the
     CRM has but the sheet does not are left out of the money and reported as
     a discrepancy instead of quietly padding an invoice.                     */

  /* Invoice codes are hand-typed in both systems — "INV - 7" in the invoice
     table is the sheet's "INV-7" tab. Everything joins on the normalised key. */
  const invoiceByKey: Record<string, any> = {}
  for (const inv of invoices) invoiceByKey[`${inv.firm_id}:${invoiceKey(inv.code)}`] = inv
  const invoiceStart = (firmId: string, code: string) =>
    invoiceByKey[`${firmId}:${invoiceKey(code)}`]?.period_start ?? null

  const sheets: Record<string, CaseSheet> = {}
  const sheetErrors: Record<string, string> = {}

  await Promise.all(firms
    .filter(f => SHEET_FIRMS[f.slug])
    .map(async f => {
      try {
        const loaded = await loadCaseSheet(f.slug)
        if (loaded) sheets[f.id] = loaded
      } catch (e: any) {
        sheetErrors[f.slug] = e?.message || 'The case sheet could not be read.'
      }
    }))

  type Recon = {
    firmSlug: string
    firmName: string
    title: string
    url: string
    fetchedAt: string
    sheetCases: number
    matched: number
    onlyInSheet: { name: string; phone: string | null; invoice: string; signedAt: string | null; status: string }[]
    onlyInSystem: { name: string; phone: string | null; invoice: string; signedAt: string | null; status: string }[]
    movedInvoice: { name: string; sheetInvoice: string; systemInvoice: string }[]
    statusDiff: { name: string; invoice: string; sheetStatus: string; systemStatus: string }[]
    closedInSheet: number
    closedInSystem: number
  }

  const recons: Recon[] = []

  function fromSheet(firm: any, sheet: CaseSheet, dbRows: any[]) {
    const byPhone = new Map<string, any[]>()
    const byName = new Map<string, any[]>()
    for (const row of dbRows) {
      const p = phoneKey(row.contact_phone)
      if (p) (byPhone.get(p) || byPhone.set(p, []).get(p)!).push(row)
      const n = nameKey(row.contact_name)
      if (n) (byName.get(n) || byName.set(n, []).get(n)!).push(row)
    }

    const used = new Set<string>()
    const take = (bucket: any[] | undefined) => bucket?.find(r => !used.has(r.id))

    const recon: Recon = {
      firmSlug: firm.slug,
      firmName: firm.name,
      title: sheet.title,
      url: sheet.url,
      fetchedAt: sheet.fetchedAt,
      sheetCases: sheet.cases.length,
      matched: 0,
      onlyInSheet: [],
      onlyInSystem: [],
      movedInvoice: [],
      statusDiff: [],
      closedInSheet: sheet.cases.filter(c => c.closed).length,
      closedInSystem: dbRows.filter(r => String(r.case_status || '').toLowerCase() === 'closed').length,
    }

    const rows = sheet.cases.map((c: SheetCase) => {
      const match = take(byPhone.get(phoneKey(c.phone) || '')) || take(byName.get(nameKey(c.name) || ''))
      if (match) {
        used.add(match.id)
        recon.matched += 1
        const dbInvoice = invoiceKey(match.invoice_code)
        if (dbInvoice && dbInvoice !== c.invoiceCode) {
          recon.movedInvoice.push({ name: c.name, sheetInvoice: c.invoiceCode, systemInvoice: match.invoice_code })
        }
        const dbStatus = String(match.case_status || 'e_signed').toLowerCase()
        if (dbStatus !== c.status) {
          recon.statusDiff.push({ name: c.name, invoice: c.invoiceCode, sheetStatus: c.statusLabel, systemStatus: match.case_status || 'e_signed' })
        }
      } else {
        recon.onlyInSheet.push({ name: c.name, phone: c.phone, invoice: c.invoiceCode, signedAt: c.signedAt, status: c.statusLabel })
      }

      // A minor is billed at a reduced value and never carries Sanguine. The
      // value itself only exists in the CRM record; the sheet says so in prose.
      const noteSaysMinor = /minor/i.test(`${c.lhpNote || ''} ${c.caseBridgeNote || ''}`)

      return {
        id: match?.id ?? `sheet:${c.invoiceCode}:${c.row}`,
        firm_id: firm.id,
        source: 'sheet' as const,
        qualified_at: c.signedAt || match?.qualified_at || invoiceStart(firm.id, c.invoiceCode),
        invoice_code: c.invoiceCode,
        case_status: c.status,
        victim_count: 1,
        closer: match?.closer ?? null,
        closed_by_profile_id: match?.closed_by_profile_id ?? null,
        custom_case_value: match?.custom_case_value ?? null,
        excluded: match ? match.excluded : (noteSaysMinor || null),
        closedOverride: c.closed,
      }
    })

    for (const row of dbRows) {
      if (used.has(row.id)) continue
      recon.onlyInSystem.push({
        name: row.contact_name || '(no name)',
        phone: row.contact_phone || null,
        invoice: row.invoice_code || '—',
        signedAt: row.qualified_at ? String(row.qualified_at).slice(0, 10) : null,
        status: row.case_status || 'e_signed',
      })
    }

    recons.push(recon)
    return rows
  }

  /* One list of cases for the whole company: sheet-driven where a sheet
     exists, CRM rows everywhere else. Everything below counts this list. */
  const effectiveLeads: any[] = []
  for (const firm of firms) {
    const dbRows = leads.filter(l => l.firm_id === firm.id)
    const sheet = sheets[firm.id]
    if (sheet) effectiveLeads.push(...fromSheet(firm, sheet, dbRows))
    else effectiveLeads.push(...dbRows)
  }

  /* ── Cases ────────────────────────────────────────────────────────────── */

  const feePctOf = (firm: any) => (parseFloat(firm?.fee_percentage || 0) || 0) / 100
  const isReplacement = (l: any) => String(l.case_status || 'e_signed').toLowerCase() === 'replacement'
  const isDisqualified = (l: any) => String(l.case_status || '').toLowerCase() === 'disqualified'
  const isExcluded = (l: any) => l.excluded === true || l.excluded === 'true'
  const dateOf = (l: any) => String(l.qualified_at || '').slice(0, 10)

  function caseValue(l: any) {
    const firm = firmById[l.firm_id]
    if (l.custom_case_value != null) return Number(l.custom_case_value) || 0
    if (!firm) return 0
    return (parseFloat(firm.case_value || 0) || 0) * (1 - feePctOf(firm))
  }

  /** Closed = the sheet says so, else marked closed, else the replacement
   *  window elapsed without a replacement being issued. */
  function isClosed(l: any, windowDays: number, now = Date.now()) {
    if (l.closedOverride != null) return Boolean(l.closedOverride)
    if (String(l.case_status || '').toLowerCase() === 'closed') return true
    if (!l.qualified_at) return false
    const endsAt = new Date(l.qualified_at)
    endsAt.setUTCDate(endsAt.getUTCDate() + windowDays)
    return endsAt.getTime() < now
  }

  const inWindow = effectiveLeads.filter(l => {
    const d = dateOf(l)
    return d >= start && d <= end
  })

  /* ── Costs ────────────────────────────────────────────────────────────── */

  const opsInWindow = ops.filter(e => e.date >= start && e.date <= end)
  const opsTotal = opsInWindow.reduce((s, e) => s + (parseFloat(e.amount || 0) || 0), 0)

  const opsByFirm: Record<string, number> = {}
  let opsShared = 0
  const opsByMonth: Record<string, number> = {}
  const opsByCategory: Record<string, { amount: number; count: number }> = {}

  for (const e of opsInWindow) {
    const amount = parseFloat(e.amount || 0) || 0
    if (e.firm_id) opsByFirm[e.firm_id] = (opsByFirm[e.firm_id] || 0) + amount
    else opsShared += amount
    const m = monthOf(e.date)
    opsByMonth[m] = (opsByMonth[m] || 0) + amount
    const cat = (e.category || 'other').trim() || 'other'
    const c = (opsByCategory[cat] ||= { amount: 0, count: 0 })
    c.amount += amount
    c.count += 1
  }

  /** Salaried payroll: weekly rates prorated over the days they were live. */
  function payrollBetween(a: string, b: string) {
    return rates.reduce((sum, r) => {
      const from = r.effective_from || a
      const to = r.effective_to || b
      const d = overlapDays(from, to, a, b)
      return sum + (parseFloat(r.weekly_rate || 0) || 0) * (d / 7)
    }, 0)
  }
  const salaryTotal = payrollBetween(start, end)

  /* Rep case pay and Sanguine both follow the case, so they roll up per firm
     and per month the same way revenue does. */
  const repPayByFirm: Record<string, number> = {}
  const repPayByMonth: Record<string, number> = {}
  const sanguineByFirm: Record<string, number> = {}
  const sanguineByMonth: Record<string, number> = {}
  const revenueByFirm: Record<string, number> = {}
  const revenueByMonth: Record<string, number> = {}
  const casesByFirm: Record<string, { signed: number; originals: number; minors: number; disqualified: number; replacements: number; victims: number; closed: number }> = {}
  const casesByMonth: Record<string, number> = {}
  const casesByDay: Record<string, number> = {}
  const revenueByDay: Record<string, number> = {}

  let signedCases = 0, originalCases = 0, minorCases = 0, replacementCases = 0, totalVictims = 0, closedCases = 0, disqualifiedCases = 0
  let revenueTotal = 0, repPayTotal = 0, sanguineTotal = 0

  for (const l of inWindow) {
    const firm = firmById[l.firm_id]
    const m = monthOf(dateOf(l))
    const d = dateOf(l)
    const windowDays = firm?.replacement_window_days ?? 14
    const closed = isClosed(l, windowDays)
    const replacement = isReplacement(l)

    // The sheet's own disposition: a dropped case is neither billed nor
    // replaced, and nobody is paid for it.
    if (isDisqualified(l)) {
      const c = (casesByFirm[l.firm_id] ||= { signed: 0, originals: 0, minors: 0, disqualified: 0, replacements: 0, victims: 0, closed: 0 })
      c.disqualified += 1
      disqualifiedCases += 1
      continue
    }

    const c = (casesByFirm[l.firm_id] ||= { signed: 0, originals: 0, minors: 0, disqualified: 0, replacements: 0, victims: 0, closed: 0 })
    c.signed += 1
    c.victims += l.victim_count ?? 1
    signedCases += 1
    totalVictims += l.victim_count ?? 1
    casesByMonth[m] = (casesByMonth[m] || 0) + 1
    casesByDay[d] = (casesByDay[d] || 0) + 1
    if (closed) { c.closed += 1; closedCases += 1 }

    if (replacement) {
      c.replacements += 1
      replacementCases += 1
    } else {
      // A minor's case is billed at its own value but never counts toward the
      // acquisition denominators — the same split the per-firm KPI page makes.
      if (isExcluded(l)) { c.minors += 1; minorCases += 1 }
      else { c.originals += 1; originalCases += 1 }
      // A replacement is a case re-delivered under warranty — never re-billed.
      const value = caseValue(l)
      revenueTotal += value
      revenueByFirm[l.firm_id] = (revenueByFirm[l.firm_id] || 0) + value
      revenueByMonth[m] = (revenueByMonth[m] || 0) + value
      revenueByDay[d] = (revenueByDay[d] || 0) + value
    }

    // Rep pay is owed on every signed case a rep is named on, replacement or not.
    if (l.closer || l.closed_by_profile_id) {
      const pay = BASE_PAY_PER_CASE + (closed ? COMMISSION_PER_CLOSED : 0)
      repPayTotal += pay
      repPayByFirm[l.firm_id] = (repPayByFirm[l.firm_id] || 0) + pay
      repPayByMonth[m] = (repPayByMonth[m] || 0) + pay
    }

    // Sanguine bills per original case only — replacements and minors are out.
    if (!replacement && !isExcluded(l)) {
      const rate = parseFloat(firm?.sanguine_rate_per_closed_case || 0) || 0
      if (rate > 0) {
        sanguineTotal += rate
        sanguineByFirm[l.firm_id] = (sanguineByFirm[l.firm_id] || 0) + rate
        sanguineByMonth[m] = (sanguineByMonth[m] || 0) + rate
      }
    }
  }

  /* ── Collections ──────────────────────────────────────────────────────── */

  const leadsByInvoice: Record<string, any[]> = {}
  for (const l of effectiveLeads) {
    if (!l.invoice_code) continue
    const key = `${l.firm_id}:${invoiceKey(l.invoice_code)}`
    ;(leadsByInvoice[key] ||= []).push(l)
  }

  const invoiceRows = invoices
    .filter(inv => overlapDays(inv.period_start, inv.period_end, start, end) > 0)
    .map(inv => {
      const firm = firmById[inv.firm_id]
      const rows = leadsByInvoice[`${inv.firm_id}:${invoiceKey(inv.code)}`] || []
      const originals = rows.filter(l => !isReplacement(l) && !isDisqualified(l))
      const billed = originals.reduce((s, l) => s + caseValue(l), 0)
      const collected = parseFloat(inv.payment_received || 0) || 0
      const interestRate = parseFloat(inv.payment_interest_rate || 0) || 0
      const interestCost = collected * interestRate
      const sheet = sheets[inv.firm_id]
      const sheetRows = sheet?.cases.filter(c => c.invoiceCode === invoiceKey(inv.code)) ?? null

      return {
        id: inv.id,
        firmSlug: firm?.slug || '',
        firmName: firm?.name || 'Unknown firm',
        code: invoiceKey(inv.code) === invoiceKey(inv.code) && sheetRows ? invoiceKey(inv.code) : inv.code,
        fromSheet: Boolean(sheetRows),
        sheetCases: sheetRows ? sheetRows.filter(c => c.status === 'e_signed').length : null,
        sheetReplacements: sheetRows ? sheetRows.filter(c => c.status === 'replacement').length : null,
        sheetClosed: sheetRows ? sheetRows.filter(c => c.closed).length : null,
        title: inv.title,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        cases: originals.length,
        replacements: rows.length - originals.length,
        billed,
        collected,
        interestRate,
        interestCost,
        net: collected - interestCost,
        outstanding: Math.max(0, billed - collected),
      }
    })
    .sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || '') || a.firmName.localeCompare(b.firmName))

  const collectedFromInvoices = invoiceRows.reduce((s, r) => s + r.collected, 0)
  const interestCost = invoiceRows.reduce((s, r) => s + r.interestCost, 0)
  const billedOnInvoices = invoiceRows.reduce((s, r) => s + r.billed, 0)

  /* ── Payments ─────────────────────────────────────────────────────────────
     Cash in, from the processor rather than from a figure typed onto an
     invoice. Only succeeded rows count, and a refund is netted off the row it
     belongs to rather than booked as a separate negative payment. */
  const paidInWindow = payments.filter(p => {
    if (String(p.status || '').toLowerCase() !== 'succeeded') return false
    const d = String(p.paid_at || '').slice(0, 10)
    return d >= start && d <= end
  })

  const paymentsByFirm: Record<string, number> = {}
  const paymentsByMonth: Record<string, number> = {}
  const paymentsByDay: Record<string, number> = {}
  const unmatchedPayers: Record<string, { name: string; domain: string; gross: number; n: number }> = {}

  let collectedGross = 0, collectedNet = 0, refundedTotal = 0, paymentCases = 0

  for (const p of paidInWindow) {
    const gross = (parseFloat(p.gross) || 0) - (parseFloat(p.refunded) || 0)
    const net   = (parseFloat(p.net)   || 0) - (parseFloat(p.refunded) || 0)
    const d = String(p.paid_at).slice(0, 10)
    const m = d.slice(0, 7)

    collectedGross += gross
    collectedNet   += net
    refundedTotal  += parseFloat(p.refunded) || 0
    paymentCases   += parseInt(p.case_count) || 0

    paymentsByMonth[m] = (paymentsByMonth[m] || 0) + gross
    paymentsByDay[d]   = (paymentsByDay[d]   || 0) + gross

    if (p.firm_id) {
      paymentsByFirm[p.firm_id] = (paymentsByFirm[p.firm_id] || 0) + gross
    } else {
      /* A payer with no firm record still earned us the money. Bucketed by
         name rather than dropped, so the firm table and the company total can
         never silently disagree. */
      const k = String(p.payer_domain || 'unknown')
      const u = (unmatchedPayers[k] ||= { name: String(p.payer_name || k), domain: k, gross: 0, n: 0 })
      u.gross += gross
      u.n += 1
    }
  }

  /* Processing fees are a real cost — roughly 2.9% of everything collected —
     and were previously invisible because only gross was ever recorded. */
  const processingFees = collectedGross - collectedNet

  const unmatchedCollected = Object.values(unmatchedPayers).reduce((s, u) => s + u.gross, 0)

  /* Prefer the processor when it has data; fall back to the hand-entered
     invoice figure while the payments table is empty or unmigrated. */
  const hasPayments = paidInWindow.length > 0
  const collected = hasPayments ? collectedGross : collectedFromInvoices

  const outstanding = invoiceRows.reduce((s, r) => s + r.outstanding, 0)

  /* ── Totals ───────────────────────────────────────────────────────────── */

  const adSpend = companySpend.spend
  /* Processing fees only exist once real payments are loaded; before that the
     cost stack is unchanged rather than guessing a percentage. */
  const totalCost = adSpend + opsTotal + salaryTotal + repPayTotal + sanguineTotal + interestCost + processingFees
  const netProfit = revenueTotal - totalCost

  /* The same P&L run on cash actually received instead of cases booked. Both
     are true; they answer different questions, and showing only one of them is
     how a business ends up surprised by its own bank balance. */
  const cashNetProfit = collectedGross - totalCost

  const firmRows = firms
    .map(f => {
      const s = spendByFirm[f.id] || blankSpend()
      const c = casesByFirm[f.id] || { signed: 0, originals: 0, minors: 0, disqualified: 0, replacements: 0, victims: 0, closed: 0 }
      const revenue = revenueByFirm[f.id] || 0
      const firmOps = opsByFirm[f.id] || 0
      const repPay = repPayByFirm[f.id] || 0
      const sanguine = sanguineByFirm[f.id] || 0
      const cost = s.spend + firmOps + repPay + sanguine
      const invoicesForFirm = invoiceRows.filter(r => r.firmSlug === f.slug)
      return {
        id: f.id,
        slug: f.slug,
        name: f.name,
        caseValue: parseFloat(f.case_value || 0) || 0,
        metaConnected: Boolean(f.meta_account_id),
        signedCases: c.signed,
        originalCases: c.originals,
        minorCases: c.minors,
        disqualifiedCases: c.disqualified,
        billableCases: c.originals + c.minors,
        sheetBacked: Boolean(sheets[f.id]),
        replacementCases: c.replacements,
        closedCases: c.closed,
        revenue,
        adSpend: s.spend,
        metaLeads: s.leads,
        ops: firmOps,
        repPay,
        sanguine,
        totalCost: cost,
        netProfit: revenue - cost,
        netMargin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
        cpa: c.originals > 0 ? s.spend / c.originals : null,
        cpl: s.leads > 0 ? s.spend / s.leads : null,
        roas: cost > 0 ? revenue / cost : null,
        collected: invoicesForFirm.reduce((t, r) => t + r.collected, 0),
        /* What this firm actually paid, from the processor. Kept beside the
           invoice figure rather than replacing it — a gap between the two is
           itself worth seeing. */
        cashCollected: paymentsByFirm[f.id] || 0,
        outstanding: invoicesForFirm.reduce((t, r) => t + r.outstanding, 0),
        weeklySpend: weeklySpendByFirm[f.id] || 0,
        capInitial: parseFloat(f.phase_initial_max_weekly_spend || 0) || 0,
        capScale: parseFloat(f.phase_scale_max_weekly_spend || 0) || 0,
        phase: (() => {
          const w = weeklySpendByFirm[f.id] || 0
          if (w <= (parseFloat(f.phase_initial_max_weekly_spend || 0) || 0)) return 'Initial'
          if (w <= (parseFloat(f.phase_scale_max_weekly_spend || 0) || 0)) return 'Scale'
          return 'Max'
        })(),
      }
    })
    .sort((a, b) => b.revenue - a.revenue || b.adSpend - a.adSpend)

  const monthly = months.map(m => {
    const revenue = revenueByMonth[m] || 0
    const spend = spendByMonth[m] || 0
    const monthStart = `${m}-01`
    const monthEnd = ymd(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)))
    const salary = payrollBetween(
      monthStart < start ? start : monthStart,
      monthEnd > end ? end : monthEnd
    )
    const monthOps = opsByMonth[m] || 0
    const repPay = repPayByMonth[m] || 0
    const sanguine = sanguineByMonth[m] || 0
    const cost = spend + monthOps + salary + repPay + sanguine
    return {
      month: m,
      revenue,
      adSpend: spend,
      ops: monthOps,
      salary,
      repPay,
      sanguine,
      totalCost: cost,
      netProfit: revenue - cost,
      cases: casesByMonth[m] || 0,
    }
  })

  const daily = wantDaily
    ? daysBetween(start, end).map(d => ({
        date: d,
        spend: dailySpend[d] || 0,
        metaLeads: dailyMetaLeads[d] || 0,
        cases: casesByDay[d] || 0,
        revenue: revenueByDay[d] || 0,
      }))
    : []

  return NextResponse.json({
    range: { ...range, days, earliest },
    totals: {
      revenue: revenueTotal,
      adSpend,
      ops: opsTotal,
      opsShared,
      salary: salaryTotal,
      repPay: repPayTotal,
      sanguine: sanguineTotal,
      interestCost,
      totalCost,
      netProfit,
      netMargin: revenueTotal > 0 ? (netProfit / revenueTotal) * 100 : null,
      grossProfit: revenueTotal - adSpend,
      grossMargin: revenueTotal > 0 ? ((revenueTotal - adSpend) / revenueTotal) * 100 : null,
      signedCases,
      originalCases,
      minorCases,
      disqualifiedCases,
      billableCases: originalCases + minorCases,
      replacementCases,
      closedCases,
      totalVictims,
      metaLeads: companySpend.leads,
      impressions: companySpend.impressions,
      clicks: companySpend.clicks,
      cpa: originalCases > 0 ? adSpend / originalCases : null,
      cpl: companySpend.leads > 0 ? adSpend / companySpend.leads : null,
      costPerCase: originalCases > 0 ? totalCost / originalCases : null,
      revenuePerCase: originalCases + minorCases > 0 ? revenueTotal / (originalCases + minorCases) : null,
      roas: adSpend > 0 ? revenueTotal / adSpend : null,
      collected,
      collectedGross,
      collectedNet,
      processingFees,
      refundedTotal,
      paymentCount: paidInWindow.length,
      paymentCases,
      unmatchedCollected,
      cashNetProfit,
      cashMargin: collectedGross > 0 ? (cashNetProfit / collectedGross) * 100 : null,
      /* Cash in against revenue booked. Over 100% means we collected on cases
         signed before this window — prepaid packages do exactly that. */
      collectionRate: revenueTotal > 0 ? (collectedGross / revenueTotal) * 100 : null,
      billedOnInvoices,
      outstanding,
      unattributedSpend: unattributed.spend,
      weeklySpend: Object.values(weeklySpendByFirm).reduce((t, v) => t + v, 0),
      weekStart,
      activeReps: rates.filter(r => overlapDays(r.effective_from || start, r.effective_to || end, start, end) > 0).length,
    },
    firms: firmRows,
    monthly,
    daily,
    invoices: invoiceRows,
    payments: {
      missing: paymentsMissing,
      count: paidInWindow.length,
      rows: paidInWindow.slice(-60).reverse().map(p => ({
        id: p.payment_id,
        paidAt: p.paid_at,
        gross: parseFloat(p.gross) || 0,
        net: parseFloat(p.net) || 0,
        refunded: parseFloat(p.refunded) || 0,
        payer: p.payer_name,
        domain: p.payer_domain,
        firmId: p.firm_id,
        product: p.product,
        cases: p.case_count,
      })),
      /* Payers with no firm record — early or one-off clients. Surfaced by
         name so the money is visible even though no firm row claims it. */
      unmatched: Object.values(unmatchedPayers).sort((a, b) => b.gross - a.gross),
      byMonth: paymentsByMonth,
    },
    expenseCategories: Object.entries(opsByCategory)
      .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount),
    meta: {
      accounts: accountIds,
      error: _metaError,
      truncated: start < metaFloor ? metaFloor : null,
    },
    sheets: {
      firms: recons,
      errors: sheetErrors,
      backing: Object.values(sheets).map(sh => ({ title: sh.title, url: sh.url, tabs: sh.tabs, cases: sh.cases.length, fetchedAt: sh.fetchedAt })),
    },
    setup: { invoicesMissing },
  })
}
