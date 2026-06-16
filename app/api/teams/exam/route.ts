import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [activeExamRows, startTimeRows] = await Promise.all([
    admin.from('site_config').select('value').eq('key', 'active_exam_id').limit(1),
    admin.from('site_config').select('value').eq('key', 'exam_start_time').limit(1),
  ])

  const activeExamId = (activeExamRows.data?.[0]?.value as string | undefined) || null
  const examStartTime = (startTimeRows.data?.[0]?.value as string | undefined) || null

  if (!activeExamId) {
    return NextResponse.json({ exam: null, examStartTime: null, questions: [], myAttempts: [] })
  }

  const [moduleRes, questionsRes, attemptsRes] = await Promise.all([
    admin.from('modules').select('id, title, description, pass_threshold').eq('id', activeExamId).single(),
    admin.from('questions')
      .select('id, question_text, position, options(id, option_text, position)')
      .eq('module_id', activeExamId)
      .order('position', { ascending: true }),
    admin.from('attempts')
      .select('id, score, passed, attempt_number, created_at')
      .eq('module_id', activeExamId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  // Sort options by position for each question
  const questions = (questionsRes.data ?? []).map(q => ({
    ...q,
    options: ((q.options as any[]) ?? []).sort((a: any, b: any) => a.position - b.position),
  }))

  return NextResponse.json({
    exam: moduleRes.data ?? null,
    examStartTime,
    questions,
    myAttempts: attemptsRes.data ?? [],
  })
}
