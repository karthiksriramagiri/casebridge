import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: cases } = await admin
    .from('rep_cases')
    .select('id, user_id, contact_name, case_value, status, closed_at, notes, profiles(name)')
    .order('closed_at', { ascending: false })

  return NextResponse.json({ cases: cases || [] })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { user_id, contact_name, case_value, status, closed_at, notes } = body

  if (!user_id || !contact_name?.trim() || !closed_at) {
    return NextResponse.json({ error: 'user_id, contact_name, and closed_at are required' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('rep_cases')
    .insert({ user_id, contact_name: contact_name.trim(), case_value: case_value || null, status: status || 'signed', closed_at, notes: notes || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto score event for signed cases
  if ((status || 'signed') === 'signed') {
    await admin.from('score_events').insert({
      user_id,
      event_type: 'lead_closed',
      points: 2,
      note: `Closed: ${contact_name.trim()}`,
      date: closed_at,
      auto_generated: true,
    })
  }

  return NextResponse.json({ case: data })
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await admin.from('rep_cases').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, status } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

  const { error } = await admin.from('rep_cases').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
