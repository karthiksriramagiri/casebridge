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

  if (action === 'request_retake') {
    const { moduleIds, message } = body // moduleIds: { id, title }[]
    if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
      return NextResponse.json({ error: 'moduleIds required' }, { status: 400 })
    }

    const adminSupa = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Invalidate passing attempts for the selected modules
    await adminSupa
      .from('attempts')
      .update({ is_invalidated: true })
      .eq('user_id', repId)
      .eq('passed', true)
      .eq('is_invalidated', false)
      .in('module_id', moduleIds.map((m: any) => m.id))

    // Insert retake notifications
    const { error: notifError } = await adminSupa
      .from('retake_notifications')
      .insert(moduleIds.map((m: any) => ({
        user_id: repId,
        module_id: m.id,
        module_title: m.title,
        message: message?.trim() || null,
        acknowledged: false,
      })))

    if (notifError) return NextResponse.json({ error: notifError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update_todo_mode') {
    const { todoMode } = body // 'call_queue' | 'call_listener'
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ todo_mode: todoMode === 'call_listener' ? 'call_listener' : 'call_queue' })
      .eq('id', repId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'toggle_timer') {
    const { value } = body
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ timer_disabled: !!value })
      .eq('id', repId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'toggle_timeclock') {
    const { value } = body
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ timeclock_enabled: !!value })
      .eq('id', repId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update_shift') {
    const { shift } = body // one of: null, 'morning', 'afternoon', 'evening', 'morning_afternoon', 'afternoon_evening'
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ shift: shift || null })
      .eq('id', repId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update_ghl_ids') {
    const { ghlIds } = body // array of GHL user ID strings
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ghl_user_ids: Array.isArray(ghlIds) ? ghlIds : [] })
      .eq('id', repId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (action === 'update_payroll') {
    const { payrollMethod, payrollInfo, hourlyRate, commissionPerClose } = body
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        payroll_method: payrollMethod || null,
        payroll_info: payrollInfo || null,
        hourly_rate: hourlyRate != null ? Number(hourlyRate) : null,
        commission_per_close: commissionPerClose != null ? Number(commissionPerClose) : null,
      })
      .eq('id', repId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
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
