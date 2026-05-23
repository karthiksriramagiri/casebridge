import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', supabase: null, user: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return { error: 'Forbidden', supabase: null, user: null }
  return { error: null, supabase, user }
}

export async function POST(request: NextRequest) {
  const { error, supabase, user } = await requireAdmin()
  if (error || !supabase || !user) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const body = await request.json()

  // Deactivate all existing announcements
  const { error: deactivateError } = await supabase
    .from('announcements')
    .update({ is_active: false })
    .eq('is_active', true)

  if (deactivateError) {
    return NextResponse.json({ error: deactivateError.message }, { status: 500 })
  }

  // If clear: true, we're done
  if (body.clear === true) {
    return NextResponse.json({ success: true })
  }

  // Otherwise insert new announcement
  if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
    return NextResponse.json({ error: 'Content is required.' }, { status: 400 })
  }

  const { error: insertError } = await supabase
    .from('announcements')
    .insert({
      content: body.content.trim(),
      created_by: user.id,
      is_active: true,
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
