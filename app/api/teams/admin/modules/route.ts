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
  const { error, supabase } = await requireAdmin()
  if (error || !supabase) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const body = await request.json()
  const { title, description, pass_threshold, is_required, content_type, video_url, video_transcript, content_body, file_url, file_name, questions, quiz_question_count } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Module title is required.' }, { status: 400 })
  }

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'At least one question is required.' }, { status: 400 })
  }

  // Create the module
  const { data: newModule, error: moduleError } = await supabase
    .from('modules')
    .insert({
      title: title.trim(),
      description: description?.trim() ?? '',
      pass_threshold: pass_threshold ?? 80,
      is_required: is_required ?? true,
      is_active: true,
      content_type: content_type ?? 'none',
      video_url: video_url?.trim() ?? '',
      video_transcript: video_transcript?.trim() ?? '',
      content_body: content_body?.trim() ?? '',
      file_url: file_url?.trim() ?? '',
      file_name: file_name?.trim() ?? '',
      quiz_question_count: quiz_question_count ?? 0,
    })
    .select()
    .single()

  if (moduleError) {
    return NextResponse.json({ error: moduleError.message }, { status: 500 })
  }

  // Create questions and options
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi]

    if (!q.question_text || !q.question_text.trim()) continue

    const { data: newQuestion, error: questionError } = await supabase
      .from('questions')
      .insert({
        module_id: newModule.id,
        question_text: q.question_text.trim(),
        explanation: q.explanation?.trim() ?? '',
        position: qi,
      })
      .select()
      .single()

    if (questionError) {
      // Rollback module if question creation fails
      await supabase.from('modules').delete().eq('id', newModule.id)
      return NextResponse.json({ error: questionError.message }, { status: 500 })
    }

    if (q.options && Array.isArray(q.options) && q.options.length > 0) {
      const optionsToInsert = q.options
        .filter((o: any) => o.option_text && o.option_text.trim())
        .map((o: any, oi: number) => ({
          question_id: newQuestion.id,
          option_text: o.option_text.trim(),
          is_correct: o.is_correct === true,
          position: oi,
        }))

      if (optionsToInsert.length > 0) {
        const { error: optionsError } = await supabase
          .from('options')
          .insert(optionsToInsert)

        if (optionsError) {
          await supabase.from('modules').delete().eq('id', newModule.id)
          return NextResponse.json({ error: optionsError.message }, { status: 500 })
        }
      }
    }
  }

  return NextResponse.json({ success: true, module: newModule })
}
