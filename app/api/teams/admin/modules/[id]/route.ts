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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, supabase } = await requireAdmin()
  if (error || !supabase) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const { id: moduleId } = await params
  const body = await request.json()
  const { title, description, pass_threshold, is_required, content_type, video_url, video_transcript, content_body, file_url, file_name, questions, quiz_question_count } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Module title is required.' }, { status: 400 })
  }

  // Update module fields
  const { error: updateError } = await supabase
    .from('modules')
    .update({
      title: title.trim(),
      description: description?.trim() ?? '',
      pass_threshold: pass_threshold ?? 80,
      is_required: is_required ?? true,
      content_type: content_type ?? 'none',
      video_url: video_url?.trim() ?? '',
      video_transcript: video_transcript?.trim() ?? '',
      content_body: content_body?.trim() ?? '',
      file_url: file_url?.trim() ?? '',
      file_name: file_name?.trim() ?? '',
      quiz_question_count: quiz_question_count ?? 0,
    })
    .eq('id', moduleId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Delete existing questions (options cascade via FK)
  const { error: deleteError } = await supabase
    .from('questions')
    .delete()
    .eq('module_id', moduleId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Re-insert questions and options
  if (questions && Array.isArray(questions)) {
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi]
      if (!q.question_text?.trim()) continue

      const { data: newQuestion, error: questionError } = await supabase
        .from('questions')
        .insert({
          module_id: moduleId,
          question_text: q.question_text.trim(),
          explanation: q.explanation?.trim() ?? '',
          position: qi,
        })
        .select()
        .single()

      if (questionError) return NextResponse.json({ error: questionError.message }, { status: 500 })

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
          const { error: optionsError } = await supabase.from('options').insert(optionsToInsert)
          if (optionsError) return NextResponse.json({ error: optionsError.message }, { status: 500 })
        }
      }
    }
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, supabase } = await requireAdmin()
  if (error || !supabase) {
    return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })
  }

  const { id: moduleId } = await params
  const body = await request.json()

  // Currently supports toggling is_active
  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active (boolean) is required.' }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('modules')
    .update({ is_active: body.is_active })
    .eq('id', moduleId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
