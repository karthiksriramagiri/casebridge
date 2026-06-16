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

  const [activeExamRows, startTimeRows, modulesRes] = await Promise.all([
    admin.from('exam_config').select('value').eq('key', 'active_exam_id').limit(1),
    admin.from('exam_config').select('value').eq('key', 'exam_start_time').limit(1),
    admin.from('modules').select('id, title, pass_threshold').eq('is_active', true).order('created_at', { ascending: false }),
  ])

  const activeExamId = (activeExamRows.data?.[0]?.value as string | undefined) || null
  const examStartTime = (startTimeRows.data?.[0]?.value as string | undefined) || null

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

  async function setConfig(key: string, value: string | null) {
    if (value) {
      const { error } = await admin
        .from('exam_config')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw new Error(`Failed to set ${key}: ${error.message}`)
    } else {
      await admin.from('exam_config').delete().eq('key', key)
    }
  }

  try {
    const ops: Promise<void>[] = []
    if (activeExamId !== undefined) ops.push(setConfig('active_exam_id', activeExamId))
    if (examStartTime !== undefined) ops.push(setConfig('exam_start_time', examStartTime))
    await Promise.all(ops)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
