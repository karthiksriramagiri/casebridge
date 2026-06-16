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

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ?moduleId= overrides the active exam for question preview
  const url = new URL(request.url)
  const moduleIdParam = url.searchParams.get('moduleId')

  const [activeExamRes, startTimeRes, modulesRes] = await Promise.all([
    admin.from('site_config').select('value').eq('key', 'active_exam_id').maybeSingle(),
    admin.from('site_config').select('value').eq('key', 'exam_start_time').maybeSingle(),
    admin.from('modules').select('id, title, pass_threshold').eq('is_active', true).order('created_at', { ascending: false }),
  ])

  const activeExamId = activeExamRes.data?.value ?? null
  const examStartTime = startTimeRes.data?.value ?? null

  // Fetch questions for whichever module is requested (param takes precedence over active)
  const questionModuleId = moduleIdParam || activeExamId
  let examAttempts: any[] = []
  let questions: any[] = []

  const qPromise = questionModuleId
    ? admin
        .from('questions')
        .select('id, question_text, position, options(id, option_text, is_correct, position)')
        .eq('module_id', questionModuleId)
        .order('position', { ascending: true })
    : Promise.resolve({ data: [] })

  const attPromise = activeExamId
    ? admin
        .from('attempts')
        .select('id, user_id, score, passed, attempt_number, created_at, profiles(name)')
        .eq('module_id', activeExamId)
        .order('created_at', { ascending: false })
    : Promise.resolve({ data: [] })

  const [qRes, attRes] = await Promise.all([qPromise, attPromise])
  examAttempts = (attRes as any).data ?? []
  questions = ((qRes as any).data ?? []).map((q: any) => ({
    ...q,
    options: ((q.options as any[]) ?? []).sort((a: any, b: any) => a.position - b.position),
  }))

  return NextResponse.json({
    activeExamId,
    examStartTime,
    modules: modulesRes.data ?? [],
    examAttempts,
    questions,
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { activeExamId, examStartTime } = body as { activeExamId?: string | null; examStartTime?: string | null }

  const upserts = []

  if (activeExamId !== undefined) {
    upserts.push(
      admin.from('site_config').upsert({ key: 'active_exam_id', value: activeExamId ?? '' }, { onConflict: 'key' })
    )
  }

  if (examStartTime !== undefined) {
    upserts.push(
      admin.from('site_config').upsert({ key: 'exam_start_time', value: examStartTime ?? '' }, { onConflict: 'key' })
    )
  }

  await Promise.all(upserts)

  return NextResponse.json({ success: true })
}
