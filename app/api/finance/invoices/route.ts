import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
export const dynamic = 'force-dynamic'

const MISSING = /does not exist|schema cache/i

/* Creating an invoice is what books revenue. There is no separate revenue
   entry: an invoice is the bill, and its amount is the money. */

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const firmId = b.firmId
  const code = String(b.code || '').trim()
  const revenue = Number(b.revenue)
  const start = String(b.periodStart || '').slice(0, 10)
  const end = String(b.periodEnd || '').slice(0, 10)

  if (!firmId) return NextResponse.json({ error: 'Pick a firm.' }, { status: 400 })
  if (!code)   return NextResponse.json({ error: 'Give the invoice a code, like INV-7.' }, { status: 400 })
  if (!Number.isFinite(revenue) || revenue <= 0) {
    return NextResponse.json({ error: 'Enter what this invoice bills.' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'Enter the period this invoice covers.' }, { status: 400 })
  }
  if (end < start) {
    return NextResponse.json({ error: 'The period ends before it starts.' }, { status: 400 })
  }

  // One code per firm — two INV-7s on one firm would split its own revenue.
  const { data: clash } = await supabase.from('firm_invoices')
    .select('id').eq('firm_id', firmId).eq('code', code).maybeSingle()
  if (clash) {
    return NextResponse.json({ error: `${code} already exists for that firm.` }, { status: 409 })
  }

  const row: Record<string, any> = {
    firm_id: firmId,
    code,
    title: b.title?.trim() || null,
    period_start: start,
    period_end: end,
    case_count: Number.isFinite(Number(b.caseCount)) ? Number(b.caseCount) : null,
    revenue_amount: revenue,
  }

  const { data, error } = await supabase.from('firm_invoices').insert(row).select().single()
  if (error) {
    if (MISSING.test(error.message)) {
      return NextResponse.json(
        { error: 'Run supabase/migration_finance_rebuild.sql first.' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ invoice: data })
}

// PATCH — edit an invoice. { id, revenue?, periodStart?, periodEnd?, title?, caseCount?, paymentReceived? }
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, any> = {}
  if (b.revenue !== undefined) {
    const n = Number(b.revenue)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'Revenue must be a number.' }, { status: 400 })
    }
    patch.revenue_amount = n
  }
  if (b.periodStart) patch.period_start = String(b.periodStart).slice(0, 10)
  if (b.periodEnd)   patch.period_end   = String(b.periodEnd).slice(0, 10)
  if (b.title !== undefined) patch.title = b.title?.trim() || null
  if (b.caseCount !== undefined) patch.case_count = Number(b.caseCount) || null
  if (b.paymentReceived !== undefined) patch.payment_received = Number(b.paymentReceived) || null

  if (patch.period_start && patch.period_end && patch.period_end < patch.period_start) {
    return NextResponse.json({ error: 'The period ends before it starts.' }, { status: 400 })
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const { data, error } = await supabase.from('firm_invoices')
    .update(patch).eq('id', b.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { error } = await supabase.from('firm_invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
