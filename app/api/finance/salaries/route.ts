import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { billableHoursForDay, splitOvertimeHours, grossPay } from '@/lib/pay'
import {
  commissionByCase, rateMap, normaliseSessions, DEFAULT_HOURLY_RATE, type CaseRow,
} from '@/lib/finance/worker-cost'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
export const dynamic = 'force-dynamic'

/* What the reps cost, per rep, read from the Team Center.

   Nothing here is entered by hand. Hours come from the clock, rates from
   worker_pay_rates, commission from the cases each rep closed — the same
   three sources the rep's own pay page reads, so the Financial Center can
   never quote someone a different number than they were paid.

   `from` and `to` narrow it to a window; without them it is all time. */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let timeQ = supabase.from('time_entries').select('profile_id, date, clock_in, clock_out')
  if (from) timeQ = timeQ.gte('date', from)
  if (to) timeQ = timeQ.lte('date', to)

  let caseQ = supabase.from('ghl_leads')
    .select('id, contact_name, firm_id, invoice_code, qualified_at, case_status, closer, closed_by_profile_id, is_ot_close')
    .not('qualified_at', 'is', null)
  if (from) caseQ = caseQ.gte('qualified_at', from)
  if (to) caseQ = caseQ.lte('qualified_at', `${to}T23:59:59`)

  const [timeRes, ratesRes, caseRes, profileRes] = await Promise.all([
    timeQ,
    supabase.from('worker_pay_rates').select('profile_id, hourly_rate, effective_from')
      .order('effective_from', { ascending: false }),
    caseQ,
    supabase.from('profiles').select('id, name, role, hide_from_hr, hourly_rate'),
  ])

  if (timeRes.error) return NextResponse.json({ error: timeRes.error.message }, { status: 500 })

  const profiles = profileRes.data ?? []
  const nameById = new Map(profiles.map((p: any) => [p.id, p.name]))
  const hidden = new Set(profiles.filter((p: any) => p.hide_from_hr).map((p: any) => p.id))
  /* Both of the Team Center's rate sources, the same way the Reporting
     Center reads them, so the two cannot disagree about what an hour cost. */
  const rates = rateMap(
    ratesRes.data ?? [],
    (profileRes.data ?? []).map((p: any) => ({ id: p.id, hourly_rate: p.hourly_rate ?? null })),
  )

  // ── Hours and base pay, per rep ──────────────────────────────────────────
  type Row = {
    profileId: string | null; name: string; hourlyRate: number
    regularHours: number; overtimeHours: number; basePay: number
    closes: number; otCloses: number; commission: number; total: number
  }
  /* Keyed by profile where there is one. Keying by name alone merged the two
     profiles with no name on them into a single "Unknown rep" carrying both
     their hours. */
  const rows = new Map<string, Row>()
  const blank = (profileId: string | null, name: string): Row => ({
    profileId, name,
    hourlyRate: profileId ? (rates[profileId] ?? DEFAULT_HOURLY_RATE) : DEFAULT_HOURLY_RATE,
    regularHours: 0, overtimeHours: 0, basePay: 0,
    closes: 0, otCloses: 0, commission: 0, total: 0,
  })

  const { entries: clocked, leftOpen, closedLate } = normaliseSessions(timeRes.data ?? [])
  const byProfileDate: Record<string, Record<string, any[]>> = {}
  for (const e of clocked) {
    if (!e.profile_id || hidden.has(e.profile_id)) continue
    const d = String(e.date).slice(0, 10)
    ;(byProfileDate[e.profile_id] ??= {})[d] ??= []
    byProfileDate[e.profile_id][d].push(e)
  }

  for (const [profileId, days] of Object.entries(byProfileDate)) {
    const name = nameById.get(profileId) || `Rep ${profileId.slice(0, 8)}`
    const row = rows.get(profileId) ?? blank(profileId, name)
    const rate = rates[profileId] ?? DEFAULT_HOURLY_RATE
    for (const entries of Object.values(days)) {
      const { regular, overtime } = splitOvertimeHours(billableHoursForDay(entries))
      row.regularHours += regular
      row.overtimeHours += overtime
      row.basePay += grossPay(regular, overtime, rate)
    }
    rows.set(profileId, row)
  }

  // ── Commission, per rep ──────────────────────────────────────────────────
  const caseRows: CaseRow[] = (caseRes.data ?? []).map((r: any) => ({
    id: r.id,
    contactName: r.contact_name ?? null,
    firmId: r.firm_id ?? null,
    invoiceCode: r.invoice_code ?? null,
    signedAt: r.qualified_at ?? null,
    caseStatus: r.case_status ?? null,
    closer: (r.closed_by_profile_id ? nameById.get(r.closed_by_profile_id) : null) || r.closer || null,
    otClose: r.is_ot_close === true,
  }))

  /* Cases name their closer; time entries name a profile. Join the two on the
     rep's name so someone's hours and their commission land on one row. */
  const keyByName = new Map([...rows].map(([key, r]) => [r.name.trim().toLowerCase(), key]))
  for (const c of commissionByCase(caseRows)) {
    const key = keyByName.get(c.closer.trim().toLowerCase()) ?? c.closer
    const row = rows.get(key) ?? blank(null, c.closer)
    row.commission += c.amount
    row.closes += 1
    if (c.otClose) row.otCloses += 1
    rows.set(key, row)
  }

  /* Nobody has a rate on file in production, so every hour is priced at the
     fallback. That is a guess standing in for a fact, and it is reported
     rather than shown as though someone had set it. */
  const onDefaultRate = [...rows.values()]
    .filter(r => r.regularHours + r.overtimeHours > 0 && !(r.profileId && r.profileId in rates))
    .length

  const out = [...rows.values()].map(r => ({
    ...r,
    regularHours: Math.round(r.regularHours * 100) / 100,
    overtimeHours: Math.round(r.overtimeHours * 100) / 100,
    basePay: Math.round(r.basePay * 100) / 100,
    commission: Math.round(r.commission * 100) / 100,
    total: Math.round((r.basePay + r.commission) * 100) / 100,
  })).sort((a, b) => b.total - a.total)

  return NextResponse.json({
    reps: out.map(r => ({ ...r, rateOnFile: Boolean(r.profileId && r.profileId in rates) })),
    totals: {
      basePay: out.reduce((s, r) => s + r.basePay, 0),
      commission: out.reduce((s, r) => s + r.commission, 0),
      total: out.reduce((s, r) => s + r.total, 0),
      hours: Math.round(out.reduce((s, r) => s + r.regularHours + r.overtimeHours, 0) * 100) / 100,
      closes: out.reduce((s, r) => s + r.closes, 0),
      otCloses: out.reduce((s, r) => s + r.otCloses, 0),
    },
    /* Shifts the clock never closed properly, each counted as one full shift.
       Surfaced so they can be fixed at the source instead of quietly
       inflating worker cost. */
    repairedShifts: { leftOpen, closedLate },
    onDefaultRate,
    defaultHourlyRate: DEFAULT_HOURLY_RATE,
    range: { from: from ?? null, to: to ?? null },
  })
}
