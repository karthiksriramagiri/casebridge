import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { commissionByCase, type CaseRow } from '@/lib/finance/worker-cost'
import { financeDay } from '@/lib/finance/clock'

export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════════════════
   The commission board.

   Every case every rep has closed, by month, with what it pays and what has
   happened to it since.

   The commission figures are not computed here. They come from
   `commissionByCase` in lib/finance/worker-cost.ts — the same function the
   Financial Center bills from and the rep's own pay page reads — so this
   board and the money that actually gets paid cannot drift apart. That
   matters more than it sounds: tiers reset monthly and depend on the order
   a rep's own closes fall in, so a second implementation would be wrong in
   a way nobody notices until payday.

   What this adds on top is the two things an admin asks about a case after
   it signs:

     OT       closed on overtime, paid a flat rate instead of the tier.
     MIA      it went quiet. The MIA board tracks the chase, so the status
              is read from there and travels with the case — a case sitting
              in `mia` is money at risk; one that reached `reconnected` or
              beyond is money somebody saved.

   Admin only. This is every rep's pay in one table.
   ═══════════════════════════════════════════════════════════════════════════ */

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MISSING = (msg: string) =>
  /could not find the table/i.test(msg) || /relation .* does not exist/i.test(msg) || /schema cache/i.test(msg)

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  /* The month being read, as YYYY-MM. Absent, the current Pacific month —
     the same clock the rest of the book keeps, so a case signed at nine in
     the evening on the 31st is in the month the rep was working. */
  const month = req.nextUrl.searchParams.get('month') || financeDay().slice(0, 7)

  const [casesRes, profilesRes, firmsRes, miaRes] = await Promise.all([
    admin
      .from('ghl_leads')
      .select('id, contact_name, firm_id, invoice_code, qualified_at, case_status, closer, closed_by_profile_id, is_ot_close')
      .not('qualified_at', 'is', null)
      .order('qualified_at', { ascending: false }),
    admin.from('profiles').select('id, name'),
    admin.from('firms').select('id, name, slug'),
    admin.from('mia_cases').select('id, lead_id, name, phone, status, owner_id, moved_at, note'),
  ])

  if (casesRes.error) return NextResponse.json({ error: casesRes.error.message }, { status: 500 })

  const profileName = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.name]))
  const firmName = new Map((firmsRes.data ?? []).map((f: any) => [f.id, f.name]))

  /* The MIA board may not have been migrated yet. That is reported, not
     treated as "nothing is MIA" — the difference matters when the whole
     point of a column is to show risk. */
  const miaMissing = Boolean(miaRes.error && MISSING(miaRes.error.message))
  const miaByLead = new Map<string, any>()
  const miaByName = new Map<string, any>()
  for (const m of miaRes.data ?? []) {
    if (m.lead_id) miaByLead.set(m.lead_id, m)
    /* A card can be added to the board before anyone has matched it to a
       lead row, so the name is the fallback link. Lower-cased and trimmed
       because one side is typed by hand. */
    if (m.name) miaByName.set(String(m.name).trim().toLowerCase(), m)
  }

  /* Every case, in the shape the commission rules expect. Tiers count a
     rep's own closes across the whole history, so the full set goes in and
     the month is filtered afterwards — slicing first would restart every
     rep at tier 1 on the 1st of whatever month was asked for. */
  const allRows: CaseRow[] = (casesRes.data ?? []).map((r: any) => ({
    id: r.id,
    contactName: r.contact_name ?? null,
    firmId: r.firm_id ?? null,
    invoiceCode: r.invoice_code ?? null,
    signedAt: r.qualified_at ?? null,
    caseStatus: r.case_status ?? null,
    closer: (r.closed_by_profile_id ? profileName.get(r.closed_by_profile_id) : null) || r.closer || null,
    otClose: r.is_ot_close === true,
  }))

  const commissionById = new Map(commissionByCase(allRows).map((c) => [c.caseId, c]))
  /* Which months have anything in them, so the picker offers only real
     ones rather than a calendar of empty pages. */
  const months = [...new Set(allRows
    .filter((r) => r.signedAt)
    .map((r) => financeDay(r.signedAt).slice(0, 7))
    .filter(Boolean))].sort().reverse()

  const rows = allRows
    .filter((r) => r.signedAt && financeDay(r.signedAt).slice(0, 7) === month)
    .map((r) => {
      const comm = commissionById.get(r.id)
      const isReplacement = String(r.caseStatus || '').toLowerCase() === 'replacement'
      const mia = miaByLead.get(r.id)
        ?? (r.contactName ? miaByName.get(r.contactName.trim().toLowerCase()) : undefined)
      return {
        id: r.id,
        name: r.contactName || '(no name)',
        closer: r.closer,
        firm: r.firmId ? firmName.get(r.firmId) ?? null : null,
        invoiceCode: r.invoiceCode,
        signedDay: financeDay(r.signedAt),
        isReplacement,
        otClose: r.otClose,
        /* Null when the case earns nothing — a replacement, or a close with
           nobody named on it. Zero would read as "paid nothing", which is a
           different fact from "does not pay". */
        commission: comm ? comm.amount : null,
        tier: comm ? comm.tier : null,
        mia: mia
          ? {
              id: mia.id,
              status: mia.status as string,
              owner: mia.owner_id ? profileName.get(mia.owner_id) ?? null : null,
              movedAt: mia.moved_at,
              note: mia.note ?? '',
              /* Anything past the first column means somebody got through. */
              reconnected: mia.status !== 'mia',
            }
          : null,
      }
    })

  /* Per rep, for the month. The board's top line: who closed what, what it
     pays, and how much of it is currently at risk. */
  const byRep = new Map<string, { closer: string; cases: number; ot: number; mia: number; atRisk: number; total: number }>()
  for (const row of rows) {
    const key = row.closer || '—'
    const r = byRep.get(key) ?? { closer: key, cases: 0, ot: 0, mia: 0, atRisk: 0, total: 0 }
    if (!row.isReplacement) r.cases += 1
    if (row.otClose) r.ot += 1
    if (row.mia) {
      r.mia += 1
      if (!row.mia.reconnected) r.atRisk += row.commission ?? 0
    }
    r.total += row.commission ?? 0
    byRep.set(key, r)
  }

  return NextResponse.json({
    month,
    months,
    rows,
    reps: [...byRep.values()].sort((a, b) => b.total - a.total),
    totals: {
      cases: rows.filter((r) => !r.isReplacement).length,
      replacements: rows.filter((r) => r.isReplacement).length,
      ot: rows.filter((r) => r.otClose).length,
      mia: rows.filter((r) => r.mia).length,
      reconnected: rows.filter((r) => r.mia?.reconnected).length,
      commission: rows.reduce((a, r) => a + (r.commission ?? 0), 0),
      atRisk: rows.reduce((a, r) => a + (r.mia && !r.mia.reconnected ? r.commission ?? 0 : 0), 0),
    },
    ...(miaMissing ? { miaSetupNeeded: true } : {}),
  })
}
