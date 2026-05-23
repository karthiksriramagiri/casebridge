import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const firmSlug = new URL(request.url).searchParams.get('firm') || ''
  if (!firmSlug) {
    return NextResponse.json({ error: 'firm slug required' }, { status: 400 })
  }

  const { data: firm, error: firmErr } = await supabase
    .from('firms')
    .select('id, name, slug')
    .eq('slug', firmSlug)
    .single()

  if (firmErr || !firm) {
    return NextResponse.json({ error: 'Firm not found.' }, { status: 404 })
  }

  const { data: invoices, error: invErr } = await supabase
    .from('firm_invoices')
    .select('id, code, title, period_start, period_end, sort_order')
    .eq('firm_id', firm.id)
    .order('sort_order', { ascending: true })

  if (invErr) {
    const msg = invErr.message || ''
    const missingTable =
      invErr.code === 'PGRST205' ||
      /firm_invoices/i.test(msg) ||
      /schema cache/i.test(msg)

    if (missingTable) {
      return NextResponse.json({
        firm,
        invoices: [],
        setupRequired: true,
        setupHint:
          'Create table firm_invoices in Supabase: open SQL Editor, run the script in supabase/migration_firm_invoice_periods.sql, then reload this page.',
      })
    }

    return NextResponse.json({ error: invErr.message }, { status: 500 })
  }

  return NextResponse.json({ firm, invoices: invoices ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { firm_slug, code, title, period_start, period_end, payment_received, payment_interest_rate } = body

  if (!firm_slug || !code || !period_start || !period_end) {
    return NextResponse.json({ error: 'firm_slug, code, period_start, period_end are required.' }, { status: 400 })
  }

  const { data: firm, error: firmErr } = await supabase
    .from('firms').select('id').eq('slug', firm_slug).single()
  if (firmErr || !firm) return NextResponse.json({ error: 'Firm not found.' }, { status: 404 })

  // sort_order = max existing + 1
  const { data: existing } = await supabase
    .from('firm_invoices').select('sort_order').eq('firm_id', firm.id).order('sort_order', { ascending: false }).limit(1)
  const nextOrder = ((existing?.[0]?.sort_order) ?? 0) + 1

  const { data, error } = await supabase
    .from('firm_invoices')
    .insert({
      firm_id: firm.id,
      code: code.trim().toUpperCase(),
      title: title?.trim() || null,
      period_start,
      period_end,
      sort_order: nextOrder,
      payment_received: payment_received ? Number(payment_received) : null,
      payment_interest_rate: payment_interest_rate ? Number(payment_interest_rate) : 0,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, title, period_start, period_end, payment_received, payment_interest_rate } = body

  if (!id) return NextResponse.json({ error: 'Invoice id is required.' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (title !== undefined) updates.title = title?.trim() || null
  if (period_start !== undefined) updates.period_start = period_start
  if (period_end !== undefined) updates.period_end = period_end
  if (payment_received !== undefined) updates.payment_received = payment_received ? Number(payment_received) : null
  if (payment_interest_rate !== undefined) updates.payment_interest_rate = Number(payment_interest_rate)

  const { data, error } = await supabase
    .from('firm_invoices')
    .update(updates)
    .eq('id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invoice: data })
}
