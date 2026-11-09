import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/* Marking an invoice paid.

   `payment_received` holds the cash actually received, so marking an
   invoice paid writes the invoiced amount into it rather than a flag —
   there is no separate "paid" column and inventing one would give the
   book two places to disagree about the same fact. Clearing it sets the
   column back to null, which is how an unpaid invoice is already stored.

   Cash is not revenue. Revenue is recognised across the service period
   whatever the payment does, so nothing on the report moves when this is
   pressed; only the invoice's own received line does. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const paid = body.paid !== false
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: inv, error: readErr } = await db
    .from('firm_invoices')
    .select('id, code, revenue_amount, payment_received')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!inv) return NextResponse.json({ error: 'No such invoice.' }, { status: 404 })

  /* An explicit amount wins — part payments are real. Without one, paid
     means the whole invoice. */
  const amount =
    body.amount != null ? Number(body.amount) : Number(inv.revenue_amount ?? 0) || 0

  const { data, error } = await db
    .from('firm_invoices')
    .update({ payment_received: paid ? amount : null })
    .eq('id', id)
    .select('id, code, payment_received')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoice: data })
}
