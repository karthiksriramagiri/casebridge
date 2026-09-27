import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getVenuUser, venuAdmin } from '@/app/venu/_lib/auth'
import { firstNameOf, passwordFor } from '@/app/venu/_lib/candidates'
import { notifyOnboarded } from '@/app/venu/_lib/candidate-notify'

/* Turn a qualified candidate into a Team Center rep.

   Same shape as the admin "add rep" flow: a synthetic internal email, an auth
   user and a rep profile. They sign in with their first name and that name
   plus 123, which is what gets read out to them over WhatsApp.

   The Team Center looks an account up by name, so a first name already in use
   would let two people sign in as each other. That is checked before anything
   is created, and refused rather than guessed at. */

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await getVenuUser()
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const teamType = body.teamType === 'creative' ? 'creative' : 'intake'
  const whatsappGroupUrl = body.whatsappGroupUrl ? String(body.whatsappGroupUrl).slice(0, 500) : null

  const db = venuAdmin()
  const { data: row } = await db.from('venu_candidates').select('*').eq('token', token).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (row.status !== 'qualified' && row.status !== 'onboarded') {
    return NextResponse.json({ error: 'Mark the candidate qualified first.' }, { status: 409 })
  }

  // Already has an account — just record the WhatsApp group if that is what changed.
  if (row.team_profile_id) {
    const { data: saved } = await db.from('venu_candidates').update({
      whatsapp_group_url:  whatsappGroupUrl ?? row.whatsapp_group_url,
      whatsapp_invited_at: whatsappGroupUrl ? new Date().toISOString() : row.whatsapp_invited_at,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id).select('*').single()
    return NextResponse.json({ candidate: saved, password: null, alreadyOnboarded: true })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const first = firstNameOf(row.name)
  const password = passwordFor(row.name)

  const { data: clash } = await admin.from('profiles')
    .select('id').ilike('name', first).limit(1).maybeSingle()
  if (clash) {
    return NextResponse.json({
      error: `There is already a Team Center account called ${first}. Add a surname initial to their name before onboarding, or they will be signing in as each other.`,
    }, { status: 409 })
  }

  const slug = first.toLowerCase().replace(/[^a-z0-9]/g, '.')
  const email = `${slug}.${Date.now()}@teams.casebridge.internal`

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: first, role: 'rep' },
  })
  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message || 'Could not create the account.' }, { status: 400 })
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.user.id,
    name: first,
    role: 'rep',
    team_type: teamType,
  })
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const { data: saved, error } = await db.from('venu_candidates').update({
    status:              'onboarded',
    team_profile_id:     created.user.id,
    team_login_email:    email,
    whatsapp_group_url:  whatsappGroupUrl ?? row.whatsapp_group_url,
    whatsapp_invited_at: whatsappGroupUrl ? new Date().toISOString() : row.whatsapp_invited_at,
    onboarded_at:        new Date().toISOString(),
    updated_at:          new Date().toISOString(),
  }).eq('id', row.id).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await notifyOnboarded(saved, user.name || 'a reviewer')

  return NextResponse.json({ candidate: saved, password, loginName: first })
}
