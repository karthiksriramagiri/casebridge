import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getProgramLevel } from '@/lib/slack'

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

export async function GET(_request: NextRequest) {
  const { error, supabase } = await requireAdmin()
  if (error || !supabase) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  // Fetch all rep profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, created_at, nda_signed, timeclock_enabled, shift, ghl_user_ids, payroll_method, payroll_info, hourly_rate, commission_per_close, timer_disabled, levels_unlocked, todo_mode, team_type')
    .eq('role', 'rep')
    .order('created_at', { ascending: false })

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  // Fetch all attempts for reps
  const repIds = (profiles ?? []).map((p) => p.id)

  const { data: allAttempts } = repIds.length > 0
    ? await supabase
        .from('attempts')
        .select('id, user_id, module_id, score, passed, attempt_number, is_invalidated, created_at, tab_leave_count, content_view_seconds, modules!attempts_module_id_fkey(title)')
        .in('user_id', repIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  // Fetch required modules with program title for level computation
  const { data: requiredModules } = await supabase
    .from('modules')
    .select('id, programs(title)')
    .eq('is_required', true)
    .eq('is_active', true)

  const requiredModuleIds = (requiredModules ?? []).map((m) => m.id)

  // Group required module IDs by level
  const moduleLevel: Record<string, number> = {}
  for (const m of requiredModules ?? []) {
    const programTitle = (m as any).programs?.title ?? ''
    moduleLevel[m.id] = getProgramLevel(programTitle)
  }
  const levelModuleIds: Record<number, string[]> = { 1: [], 2: [], 3: [] }
  for (const [id, lvl] of Object.entries(moduleLevel)) {
    ;(levelModuleIds[lvl] ??= []).push(id)
  }

  // Fetch emails via admin client
  let emailMap: Record<string, string> = {}
  try {
    const adminClient = createSupabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (repIds.length > 0) {
      const { data: usersData } = await adminClient.auth.admin.listUsers()
      if (usersData?.users) {
        for (const u of usersData.users) {
          if (repIds.includes(u.id)) {
            emailMap[u.id] = u.email ?? ''
          }
        }
      }
    }
  } catch {
    // Email lookup failed, continue without emails
  }

  const reps = (profiles ?? []).map((rep) => {
    const repAttempts = (allAttempts ?? []).filter((a: any) => a.user_id === rep.id)
    const validAttempts = repAttempts.filter((a: any) => !a.is_invalidated)

    // Build passing set
    const passingModuleIds = new Set(
      validAttempts.filter((a: any) => a.passed).map((a: any) => a.module_id)
    )

    const passedRequired = requiredModuleIds.filter((id) => passingModuleIds.has(id)).length
    const certified = requiredModuleIds.length > 0 && passedRequired === requiredModuleIds.length

    // Determine current level (lowest level with incomplete required modules)
    let currentLevel = 1
    for (const lvl of [1, 2, 3]) {
      const ids = levelModuleIds[lvl] ?? []
      const allPassed = ids.length === 0 || ids.every((id) => passingModuleIds.has(id))
      if (allPassed) { currentLevel = lvl + 1 } else { break }
    }
    if (currentLevel > 3) currentLevel = 3

    const attemptSummaries = validAttempts.map((a: any) => ({
      id: a.id,
      moduleTitle: (a.modules as any)?.title ?? 'Unknown',
      score: a.score,
      passed: a.passed,
      attemptNumber: a.attempt_number,
      createdAt: a.created_at,
      tabLeaveCount: a.tab_leave_count ?? 0,
      contentViewSeconds: a.content_view_seconds ?? 0,
    }))

    return {
      id: rep.id,
      name: rep.name,
      email: emailMap[rep.id] ?? '',
      created_at: rep.created_at,
      attempts: attemptSummaries,
      certified,
      passedRequired,
      totalRequired: requiredModuleIds.length,
      ndaSigned: (rep as any).nda_signed ?? false,
      timeclockEnabled: (rep as any).timeclock_enabled ?? false,
      shift: (rep as any).shift ?? null,
      ghlUserIds: (rep as any).ghl_user_ids ?? [],
      payrollMethod: (rep as any).payroll_method ?? null,
      payrollInfo: (rep as any).payroll_info ?? null,
      hourlyRate: (rep as any).hourly_rate ?? null,
      commissionPerClose: (rep as any).commission_per_close ?? null,
      timerDisabled: !!(rep as any).timer_disabled,
      levelsUnlocked: !!(rep as any).levels_unlocked,
      todoMode: (rep as any).todo_mode ?? 'call_queue',
      teamType: (rep as any).team_type ?? 'intake',
      currentLevel,
    }
  })

  return NextResponse.json({ reps })
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const body = await request.json()
  const { name, password, teamType } = body

  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password are required.' }, { status: 400 })
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.')
  const email = `${slug}.${Date.now()}@teams.casebridge.internal`

  const adminClient = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Create auth user
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'rep' },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Profile is auto-created by trigger, but upsert to be safe
  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: newUser.user.id,
      name,
      role: 'rep',
      team_type: teamType === 'creative' ? 'creative' : 'intake',
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, user: newUser.user })
}
