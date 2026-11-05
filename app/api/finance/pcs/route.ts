import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
export const dynamic = 'force-dynamic'

/* Every signed case. A signed case is a ghl_leads row with no pipeline stage:
   the stage column tracks a lead's progress, and it is cleared when the case
   signs. Replacements are flagged rather than hidden — they are real cases
   that were swapped, and a list that drops them never reconciles with the
   invoice they sit on. */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const firm = searchParams.get('firm')
  const invoice = searchParams.get('invoice')
  const limit = Math.min(Number(searchParams.get('limit')) || 1000, 5000)

  let q = supabase.from('ghl_leads')
    .select('id, contact_name, contact_phone, firm_id, invoice_code, case_status, qualified_at, closer, is_ot_close, ad_name, created_at')
    .is('pipeline_stage', null)
    .order('qualified_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (firm) q = q.eq('firm_id', firm)
  if (invoice) q = q.eq('invoice_code', invoice)

  const [leads, firms] = await Promise.all([
    q,
    supabase.from('firms').select('id, name, slug'),
  ])

  if (leads.error) return NextResponse.json({ error: leads.error.message }, { status: 500 })

  const firmName = new Map((firms.data ?? []).map(f => [f.id, f.name]))
  const rows = (leads.data ?? []).map(r => ({
    id: r.id,
    name: r.contact_name || '(no name)',
    phone: r.contact_phone || null,
    firmId: r.firm_id,
    firmName: firmName.get(r.firm_id) ?? '—',
    invoiceCode: r.invoice_code || null,
    status: r.case_status || 'e_signed',
    isReplacement: String(r.case_status || '').toLowerCase() === 'replacement',
    signedAt: r.qualified_at || r.created_at,
    closer: r.closer || null,
    otClose: r.is_ot_close === true,
    adName: r.ad_name || null,
  }))

  return NextResponse.json({
    pcs: rows,
    total: rows.length,
    replacements: rows.filter(r => r.isReplacement).length,
  })
}

/* Marking a close as overtime.

   An OT close is paid a flat $50 in place of the tier rate, so this is a
   change to what the case costs: the book re-reads is_ot_close and the
   invoice's worker cost moves with it. One field, one row — the rest of the
   case record is not writable from here. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const id = body?.id
  const otClose = body?.otClose

  if (!id || typeof otClose !== 'boolean') {
    return NextResponse.json({ error: 'Send an id and otClose true or false.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('ghl_leads')
    .update({ is_ot_close: otClose })
    .eq('id', id)
    .select('id, is_ot_close')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No case with that id.' }, { status: 404 })

  return NextResponse.json({ id: data.id, otClose: data.is_ot_close === true })
}
