import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import ModuleList from './ModuleList'

export default async function ModulesPage() {
  const supabase = await createClient()

  const { data: modules } = await supabase
    .from('modules')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch question counts per module
  const moduleIds = (modules ?? []).map((m) => m.id)
  let questionCounts: Record<string, number> = {}

  if (moduleIds.length > 0) {
    const { data: questions } = await supabase
      .from('questions')
      .select('id, module_id')
      .in('module_id', moduleIds)

    for (const q of questions ?? []) {
      questionCounts[q.module_id] = (questionCounts[q.module_id] ?? 0) + 1
    }
  }

  // Fetch all questions with options for expansion
  const { data: allQuestions } = await supabase
    .from('questions')
    .select(`
      id,
      module_id,
      question_text,
      position,
      options(id, option_text, is_correct, position)
    `)
    .in('module_id', moduleIds.length > 0 ? moduleIds : ['00000000-0000-0000-0000-000000000000'])
    .order('position', { ascending: true })

  const questionsByModule: Record<string, any[]> = {}
  for (const q of allQuestions ?? []) {
    if (!questionsByModule[q.module_id]) questionsByModule[q.module_id] = []
    questionsByModule[q.module_id].push(q)
  }

  const enrichedModules = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    pass_threshold: m.pass_threshold,
    is_required: m.is_required,
    is_active: m.is_active,
    created_at: m.created_at,
    questionCount: questionCounts[m.id] ?? 0,
    questions: questionsByModule[m.id] ?? [],
  }))

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Training Modules</h1>
        <p className="text-sm text-gray-500 mt-1">
          Click a module to expand, edit details, or manage its questions.
        </p>
      </div>
      <ModuleList modules={enrichedModules} />
    </div>
  )
}
