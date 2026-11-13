import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSession } from '@/lib/session'
import { toCents } from '@/lib/finance/reporting/money'
import { ALLOCATION_METHODS, OPEX_CATEGORIES } from '@/lib/finance/reporting/types'

export const dynamic = 'force-dynamic'

/* Operating expenses — the half of the P&L the Financial Center never had.

   Every write is logged. An expense moves profit, and a figure that moved
   profit has to be answerable for: who changed it, when, and from what.
   That is the whole reason expense_audit_log exists alongside the table. */

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const oneOf = <T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] =>
  (list as readonly string[]).includes(String(v)) ? (v as T[number]) : fallback

/* Who is making the change.

   The session carries `user` — it has no `email` or `name`, which is what
   this read for, so every row in the audit log said "unknown" and the one
   question the log exists to answer went unanswered. */
async function who() {
  const s = await getSession().catch(() => null)
  return s?.user || s?.role || 'unknown'
}

/** The shape the table stores, from whatever the form sent. */
function shape(body: any) {
  const date = String(body.expenseDate || '').slice(0, 10)
  const recurrence = body.recurrence === 'monthly' ? 'monthly' : 'one_time'
  /* A one-time cost covers the day it was incurred and no more. Letting the
     form send a service period for it is how a $4,000 laptop ends up
     smeared across a year and every month's margin is quietly wrong. */
  const start = recurrence === 'monthly' ? String(body.serviceStart || date).slice(0, 10) : date
  const end = recurrence === 'monthly' ? String(body.serviceEnd || date).slice(0, 10) : date
  const allocation = oneOf(ALLOCATION_METHODS, body.allocation, 'unallocated')
  return {
    expense_date: date,
    service_start: start <= end ? start : end,
    service_end: start <= end ? end : start,
    description: String(body.description ?? '').trim(),
    vendor: String(body.vendor ?? '').trim(),
    category: oneOf(OPEX_CATEGORIES, body.category, 'other'),
    amount_cents: Math.round(Number(body.amountCents ?? toCents(Number(body.amount) || 0))),
    recurrence,
    allocation,
    /* Only a firm-level method carries firms. Keeping ids on an unallocated
       expense is how one later starts being allocated by accident. */
    firm_ids: allocation === 'unallocated' ? [] : (Array.isArray(body.firmIds) ? body.firmIds.map(String) : []),
    status: oneOf(['posted', 'pending', 'void'] as const, body.status, 'posted'),
    notes: String(body.notes ?? '').trim(),
  }
}

export async function GET() {
  const { data, error } = await db().from('operating_expenses').select('*').order('expense_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ expenses: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const row = shape(body)
  if (!row.expense_date) return NextResponse.json({ error: 'A date is required.' }, { status: 400 })
  if (!Number.isFinite(row.amount_cents) || row.amount_cents === 0) {
    return NextResponse.json({ error: 'An amount is required.' }, { status: 400 })
  }

  const by = await who()
  const supabase = db()
  const { data, error } = await supabase
    .from('operating_expenses')
    .insert({ ...row, created_by: by, updated_by: by })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('expense_audit_log').insert({
    expense_id: data.id,
    action: 'create',
    by_user: by,
    summary: `${row.vendor || 'Expense'} · ${(row.amount_cents / 100).toFixed(2)}`,
    changes: [],
  })
  return NextResponse.json({ expense: data })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const by = await who()
  const supabase = db()
  const { data: before } = await supabase.from('operating_expenses').select('*').eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'No such expense.' }, { status: 404 })

  const row = shape({ ...body })
  const { data, error } = await supabase
    .from('operating_expenses')
    .update({ ...row, updated_at: new Date().toISOString(), updated_by: by })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  /* Only what actually moved. A log that records every field on every save
     is one nobody reads, which is the same as not having one. */
  const changes = Object.entries(row)
    .filter(([k, v]) => JSON.stringify((before as any)[k]) !== JSON.stringify(v))
    .map(([field, to]) => ({ field, from: String((before as any)[field] ?? ''), to: String(to ?? '') }))

  if (changes.length > 0) {
    await supabase.from('expense_audit_log').insert({
      expense_id: id,
      action: 'update',
      by_user: by,
      summary: `${changes.length} field${changes.length === 1 ? '' : 's'} changed`,
      changes,
    })
  }
  return NextResponse.json({ expense: data, changes })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const by = await who()
  const supabase = db()
  const { data: before } = await supabase.from('operating_expenses').select('*').eq('id', id).maybeSingle()

  /* Voided, not deleted. A removed expense changes a margin that has
     already been reported, and the row is the only record of why. */
  const { error } = await supabase
    .from('operating_expenses')
    .update({ status: 'void', updated_at: new Date().toISOString(), updated_by: by })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('expense_audit_log').insert({
    expense_id: id,
    action: 'delete',
    by_user: by,
    summary: `Voided ${before?.vendor || 'expense'}`,
    changes: [],
  })
  return NextResponse.json({ ok: true })
}
