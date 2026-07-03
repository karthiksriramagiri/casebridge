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

// POST — create a new exam (module with content_type=none) + questions
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const body = await request.json()
  const { title, description, pass_threshold, team_type, questions } = body as {
    title: string
    description?: string
    pass_threshold?: number
    team_type?: string
    questions?: { question_text: string; options: { option_text: string; is_correct: boolean }[] }[]
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }
  if (!questions?.length) {
    return NextResponse.json({ error: 'At least one question is required' }, { status: 400 })
  }

  const { data: newModule, error: moduleError } = await admin
    .from('modules')
    .insert({
      title: title.trim(),
      description: description?.trim() ?? '',
      pass_threshold: pass_threshold ?? 80,
      is_required: false,
      is_active: true,
      content_type: 'none',
      team_type: team_type === 'creative' ? 'creative' : 'intake',
    })
    .select()
    .single()

  if (moduleError || !newModule) {
    return NextResponse.json({ error: moduleError?.message ?? 'Failed to create exam' }, { status: 500 })
  }

  const moduleId: string = newModule.id

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q.question_text?.trim()) continue

    const { data: newQ, error: qErr } = await admin
      .from('questions')
      .insert({ module_id: moduleId, question_text: q.question_text.trim(), position: i + 1 })
      .select()
      .single()

    if (qErr || !newQ) continue

    await admin.from('options').insert(
      q.options
        .filter(o => o.option_text?.trim())
        .map((o, oi) => ({
          question_id: newQ.id,
          option_text: o.option_text.trim(),
          is_correct: o.is_correct,
          position: oi + 1,
        }))
    )
  }

  return NextResponse.json({ success: true, moduleId })
}

// DELETE — delete an exam by id
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return NextResponse.json({ error }, { status: error === 'Unauthorized' ? 401 : 403 })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error: delErr } = await admin.from('modules').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
