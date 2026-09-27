import { NextRequest, NextResponse } from 'next/server'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'
import { newToken, QUALIFICATION_QUESTIONS } from '@/app/venu/_lib/candidates'

/* POST — public. The shared link lands here: a name, an email and the
   WhatsApp number we will add them to a group on becomes a temporary account.
   GET — admin. The review queue.                                           */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const name  = String(body.name ?? '').trim().slice(0, 120)
  const email = String(body.email ?? '').trim().slice(0, 200)
  const source = String(body.source ?? '').trim().slice(0, 60) || null

  if (!name)  return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
  }

  const db = venuAdmin()

  /* Someone who comes back through the shared link rather than their own
     bookmark should land in the application they already started, not a
     second one the reviewers have to reconcile. The phone number only arrives
     at the end of the interview, so email is what we have to match on. */
  if (email) {
    const { data: existing } = await db.from('venu_candidates')
      .select('token')
      .eq('email', email)
      .in('status', ['invited', 'submitted', 'qualified'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) return NextResponse.json({ token: existing.token, resumed: true })
  }

  const token = newToken()
  /* The phone is asked for at the end of the interview, but the column was
     created NOT NULL. An empty string satisfies the constraint and still reads
     as "no number yet" everywhere that matters, so the account can be made
     without waiting on a schema change. */
  const { error } = await db.from('venu_candidates').insert({
    token, name, email: email || null, phone: '', source, status: 'invited',
  })
  if (error) {
    console.error('[venu:candidates] create failed', error)
    return NextResponse.json({ error: 'Could not start your application. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ token, resumed: false })
}

export async function GET() {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = venuAdmin()
  const { data, error } = await db.from('venu_candidates')
    .select('*')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    const missing = /venu_candidates|schema cache/i.test(error.message)
    if (missing) {
      return NextResponse.json({
        candidates: [], setupRequired: true,
        setupHint: 'Run supabase/migration_venu_candidates.sql in the Supabase SQL editor, then reload.',
      })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ candidates: data ?? [], questions: QUALIFICATION_QUESTIONS })
}
