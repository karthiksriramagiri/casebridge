import { createClient } from '@/lib/supabase/server'
import CompletionsClient from './CompletionsClient'

export default async function CompletionsPage() {
  const supabase = await createClient()

  const { data: attempts } = await supabase
    .from('attempts')
    .select(`
      id,
      score,
      passed,
      attempt_number,
      is_invalidated,
      created_at,
      user_id,
      module_id,
      tab_leave_count,
      content_view_seconds,
      profiles!attempts_user_id_fkey(id, name),
      modules!attempts_module_id_fkey(id, title)
    `)
    .order('created_at', { ascending: false })

  // Fetch attempt_answers for breakdown capability
  const attemptIds = (attempts ?? []).map((a: any) => a.id)
  let answersByAttempt: Record<string, any[]> = {}

  if (attemptIds.length > 0) {
    const { data: allAnswers } = await supabase
      .from('attempt_answers')
      .select(`
        id,
        attempt_id,
        question_id,
        selected_option_id,
        questions!attempt_answers_question_id_fkey(question_text),
        options!attempt_answers_selected_option_id_fkey(option_text, is_correct)
      `)
      .in('attempt_id', attemptIds)

    for (const answer of allAnswers ?? []) {
      if (!answersByAttempt[answer.attempt_id]) {
        answersByAttempt[answer.attempt_id] = []
      }
      answersByAttempt[answer.attempt_id].push(answer)
    }
  }

  const rows = (attempts ?? []).map((a: any) => ({
    id: a.id,
    repName: a.profiles?.name ?? 'Unknown',
    repEmail: '',
    userId: a.user_id,
    moduleTitle: a.modules?.title ?? 'Unknown Module',
    moduleId: a.module_id,
    score: a.score,
    passed: a.passed,
    attemptNumber: a.attempt_number,
    isInvalidated: a.is_invalidated,
    createdAt: a.created_at,
    tabLeaveCount: a.tab_leave_count ?? 0,
    contentViewSeconds: a.content_view_seconds ?? 0,
    answers: answersByAttempt[a.id] ?? [],
  }))

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">All Completions</h1>
        <p className="text-sm text-gray-500 mt-1">Full history of all quiz attempts across all reps.</p>
      </div>
      <CompletionsClient rows={rows} />
    </div>
  )
}
