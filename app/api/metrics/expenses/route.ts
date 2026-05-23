import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const firmId = searchParams.get('firm_id')
  const invoiceCode = searchParams.get('invoice_code')?.trim() || ''

  let query = supabase
    .from('ops_expenses')
    .select('*')
    .order('date', { ascending: false })

  if (firmId) {
    query = query.or(`firm_id.eq.${firmId},firm_id.is.null`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let rows = data ?? []

  if (invoiceCode && firmId) {
    const { data: inv, error: invLookErr } = await supabase
      .from('firm_invoices')
      .select('period_start, period_end')
      .eq('firm_id', firmId)
      .eq('code', invoiceCode)
      .maybeSingle()

    if (invLookErr) {
      const msg = invLookErr.message || ''
      const missingInvTable =
        invLookErr.code === 'PGRST205' ||
        /firm_invoices/i.test(msg) ||
        /schema cache/i.test(msg)
      if (missingInvTable) {
        rows = rows.filter(e => e.invoice_code === invoiceCode)
      } else {
        return NextResponse.json({ error: invLookErr.message }, { status: 500 })
      }
    } else if (inv) {
      const start = inv.period_start as string
      const end = inv.period_end as string
      rows = rows.filter(
        e =>
          e.invoice_code === invoiceCode ||
          (!e.invoice_code && e.date >= start && e.date <= end)
      )
    } else {
      rows = rows.filter(e => e.invoice_code === invoiceCode)
    }
  }

  return NextResponse.json({ expenses: rows })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { firm_id, date, amount, description, category, invoice_code } = body

  if (!date || !amount) {
    return NextResponse.json({ error: 'date and amount are required.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ops_expenses')
    .insert({
      firm_id: firm_id || null,
      date,
      amount: Number(amount),
      description: description?.trim() || null,
      category: category || 'other',
      invoice_code: invoice_code?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expense: data })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })

  const { error } = await supabase.from('ops_expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
