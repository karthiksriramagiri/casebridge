import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await admin.from('profiles').select('team_type').eq('id', user.id).single()
  const teamType = prof?.team_type === 'creative' ? 'creative' : 'intake'

  const moduleId = request.nextUrl.searchParams.get('id')

  // ── Individual exam (questions + my attempts) ─────────────────────────────
  if (moduleId) {
    const [moduleRes, questionsRes, attemptsRes] = await Promise.all([
      admin.from('modules').select('id, title, description, pass_threshold').eq('id', moduleId).eq('is_active', true).single(),
      admin.from('questions')
        .select('id, question_text, position, options(id, option_text, position)')
        .eq('module_id', moduleId)
        .order('position', { ascending: true }),
      admin.from('attempts')
        .select('id, score, passed, attempt_number, created_at')
        .eq('module_id', moduleId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    if (!moduleRes.data) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Get start time for this exam from exam_config (active_exam_id matches)
    const examIdKey = teamType === 'creative' ? 'active_exam_id_creative' : 'active_exam_id'
    const examTimeKey = teamType === 'creative' ? 'exam_start_time_creative' : 'exam_start_time'
    const [activeExamRows, startTimeRows] = await Promise.all([
      admin.from('exam_config').select('value').eq('key', examIdKey).limit(1),
      admin.from('exam_config').select('value').eq('key', examTimeKey).limit(1),
    ])
    const activeExamId = (activeExamRows.data?.[0]?.value as string | undefined) || null
    const examStartTime = activeExamId === moduleId
      ? ((startTimeRows.data?.[0]?.value as string | undefined) || null)
      : null

    const questions = (questionsRes.data ?? []).map(q => ({
      ...q,
      options: ((q.options as any[]) ?? []).sort((a: any, b: any) => a.position - b.position),
    }))

    return NextResponse.json({
      exam: moduleRes.data,
      examStartTime,
      questions,
      myAttempts: attemptsRes.data ?? [],
    })
  }

  // ── Exam list (all active exams for this team) ────────────────────────────
  const { data: modules } = await admin
    .from('modules')
    .select('id, title, description, pass_threshold')
    .eq('is_active', true)
    .or(`team_type.eq.${teamType},team_type.is.null`)
    .order('created_at', { ascending: true })

  if (!modules?.length) {
    return NextResponse.json({ exams: [] })
  }

  // Load my attempts for all exams
  const moduleIds = modules.map(m => m.id)
  const { data: allAttempts } = await admin
    .from('attempts')
    .select('id, module_id, score, passed, attempt_number, created_at')
    .eq('user_id', user.id)
    .in('module_id', moduleIds)
    .order('created_at', { ascending: false })

  // Load question counts
  const { data: qCounts } = await admin
    .from('questions')
    .select('module_id')
    .in('module_id', moduleIds)

  const countByModule: Record<string, number> = {}
  for (const q of qCounts ?? []) {
    countByModule[q.module_id] = (countByModule[q.module_id] ?? 0) + 1
  }

  const attemptsByModule: Record<string, typeof allAttempts> = {}
  for (const a of allAttempts ?? []) {
    if (!attemptsByModule[a.module_id]) attemptsByModule[a.module_id] = []
    attemptsByModule[a.module_id]!.push(a)
  }

  const exams = modules.map(m => {
    const attempts = attemptsByModule[m.id] ?? []
    const best = attempts.length > 0
      ? attempts.reduce((b, a) => a.score > b.score ? a : b)
      : null
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      pass_threshold: m.pass_threshold,
      questionCount: countByModule[m.id] ?? 0,
      attemptCount: attempts.length,
      bestScore: best?.score ?? null,
      passed: best?.passed ?? false,
    }
  })

  return NextResponse.json({ exams })
}
