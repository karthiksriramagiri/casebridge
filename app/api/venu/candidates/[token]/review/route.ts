import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'
import { notifyDecision } from '@/app/venu/_lib/candidate-notify'

/* Qualified or not. Onboarding is deliberately a separate, explicit step —
   deciding someone is a fit and creating their credentials are two different
   actions, and the second one should never happen by accident. */

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const decision = body.decision === 'qualified' ? 'qualified'
    : body.decision === 'not_qualified' ? 'not_qualified'
    : body.decision === 'submitted' ? 'submitted'   // reopen a decision
    : null
  if (!decision) return NextResponse.json({ error: 'decision must be qualified or not_qualified' }, { status: 400 })

  const db = venuAdmin()
  const { data: row } = await db.from('venu_candidates').select('*').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (row.status === 'onboarded') {
    return NextResponse.json({ error: 'This candidate is already onboarded.' }, { status: 409 })
  }

  const { data: saved, error } = await db.from('venu_candidates').update({
    status:           decision,
    review_note:      body.note ? String(body.note).slice(0, 2000) : row.review_note,
    reviewed_by:      user.id,
    reviewed_by_name: user.name ?? null,
    reviewed_at:      new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  }).eq('id', row.id).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (decision !== 'submitted') await notifyDecision(saved, decision, user.name || 'a reviewer')

  return NextResponse.json({ candidate: saved })
}
