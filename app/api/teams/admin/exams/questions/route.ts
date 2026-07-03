import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'

const admin = adminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const }

  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return { error: 'Forbidden' as const }
  return { error: null }
}

// POST — add a question (with options) to an exam
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const moduleId = request.nextUrl.searchParams.get('moduleId')
  if (!moduleId) return NextResponse.json({ error: 'moduleId required' }, { status: 400 })

  const body = await request.json()
  const { question_text, options, position } = body as {
    question_text: string
    options: { option_text: string; is_correct: boolean }[]
    position?: number
  }

  if (!question_text?.trim()) {
    return NextResponse.json({ error: 'Question text is required' }, { status: 400 })
  }
  if (!options?.some(o => o.is_correct)) {
    return NextResponse.json({ error: 'Must mark one option as correct' }, { status: 400 })
  }

  const { data: newQ, error: qErr } = await admin
    .from('questions')
    .insert({ module_id: moduleId, question_text: question_text.trim(), position: position ?? 999 })
    .select()
    .single()

  if (qErr || !newQ) {
    return NextResponse.json({ error: qErr?.message ?? 'Failed to add question' }, { status: 500 })
  }

  await admin.from('options').insert(
    options
      .filter(o => o.option_text?.trim())
      .map((o, i) => ({
        question_id: newQ.id,
        option_text: o.option_text.trim(),
        is_correct: o.is_correct,
        position: i + 1,
      }))
  )

  return NextResponse.json({ success: true, questionId: newQ.id })
}

// DELETE — delete a question (options cascade)
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error: delErr } = await admin.from('questions').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
