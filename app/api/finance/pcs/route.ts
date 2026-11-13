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

/* Changing a case.

   Three things can be changed from the Financial Center, and nothing else
   on the case record is writable from here:

     otClose      an overtime close is paid a flat $50 in place of the tier
                  rate, so this changes what the case costs.
     replacement  a case swapped for another. It delivers nothing, so the
                  book stops counting its revenue — the case itself stays,
                  tagged, because a swap is a fact about the case and not a
                  reason to lose it.
     firm/invoice routing a case to the firm that actually took it. This
                  moves its revenue, its commission and its ad cost
                  together, because every one of them is read off the same
                  firm_id.

   Each field is optional and only the ones sent are written, so the
   overtime toggle that has always posted `{ id, otClose }` still means
   exactly what it meant. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'Send the id of a case.' }, { status: 400 })

  const patch: Record<string, unknown> = {}

  if (body.otClose !== undefined) {
    if (typeof body.otClose !== 'boolean') {
      return NextResponse.json({ error: 'otClose must be true or false.' }, { status: 400 })
    }
    patch.is_ot_close = body.otClose
  }

  /* Put back as a signed case, because that is the only other state a
     case has here — the column holds e_signed or replacement and nothing
     else, so there is no earlier value to restore. */
  if (body.replacement !== undefined) {
    if (typeof body.replacement !== 'boolean') {
      return NextResponse.json({ error: 'replacement must be true or false.' }, { status: 400 })
    }
    patch.case_status = body.replacement ? 'replacement' : 'e_signed'
  }

  /* Routing. The firm has to exist, and an invoice has to belong to the
     firm the case is being routed to — a case sitting on another firm's
     invoice is a figure that can never reconcile, and it is far easier to
     refuse it here than to find it later. */
  const routingFirm = body.firmId !== undefined
  const routingInvoice = body.invoiceCode !== undefined
  if (routingFirm || routingInvoice) {
    const { data: current, error: readErr } = await supabase
      .from('ghl_leads')
      .select('id, firm_id, invoice_code')
      .eq('id', id)
      .maybeSingle()
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
    if (!current) return NextResponse.json({ error: 'No case with that id.' }, { status: 404 })

    const firmId = routingFirm ? (body.firmId || null) : current.firm_id
    const invoiceCode = routingInvoice
      ? (String(body.invoiceCode ?? '').trim() || null)
      : current.invoice_code

    if (firmId) {
      const { data: firm } = await supabase.from('firms').select('id').eq('id', firmId).maybeSingle()
      if (!firm) return NextResponse.json({ error: 'No such law firm.' }, { status: 400 })
    }
    if (invoiceCode) {
      const { data: inv } = await supabase
        .from('firm_invoices')
        .select('code, firm_id')
        .eq('code', invoiceCode)
        .maybeSingle()
      if (!inv) return NextResponse.json({ error: `No invoice ${invoiceCode}.` }, { status: 400 })
      if (firmId && inv.firm_id !== firmId) {
        return NextResponse.json(
          { error: `${invoiceCode} belongs to another law firm. Pick an invoice of the firm the case is going to.` },
          { status: 400 },
        )
      }
    }

    if (routingFirm) patch.firm_id = firmId
    if (routingInvoice) patch.invoice_code = invoiceCode
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('ghl_leads')
    .update(patch)
    .eq('id', id)
    .select('id, is_ot_close, case_status, firm_id, invoice_code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No case with that id.' }, { status: 404 })

  return NextResponse.json({
    id: data.id,
    otClose: data.is_ot_close === true,
    replacement: String(data.case_status || '').toLowerCase() === 'replacement',
    firmId: data.firm_id,
    invoiceCode: data.invoice_code,
  })
}
