import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin()
  if (error) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const { id: repId } = await params

  const adminClient = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Delete auth user (profile cascades via FK)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(repId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, supabase } = await requireAdmin()
  if (error || !supabase) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const { id: repId } = await params
  const body = await request.json()
  const { action } = body

  if (action === 'force_retake') {
    // Invalidate all passing attempts for this rep
    const { error: updateError } = await supabase
      .from('attempts')
      .update({ is_invalidated: true })
      .eq('user_id', repId)
      .eq('passed', true)
      .eq('is_invalidated', false)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'reset_password') {
    // Get the rep's email from auth
    const adminClient = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: repUser, error: fetchError } = await adminClient.auth.admin.getUserById(repId)
    if (fetchError || !repUser.user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    const email = repUser.user.email
    if (!email) {
      return NextResponse.json({ error: 'User has no email address.' }, { status: 400 })
    }

    // Send password reset via the regular supabase client
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://teams.case-bridge.com'}/teams/login`,
    })

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
