import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSlack, getProgramLevel, LEVEL_LABELS } from '@/lib/slack'

async function notifyLevelCompleteIfNeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  moduleId: string,
  newAttemptId: string,
  userName: string,
) {
  // Only fire if this is the first time passing this module
  const { count: prevPassed } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('module_id', moduleId)
    .eq('passed', true)
    .eq('is_invalidated', false)
    .neq('id', newAttemptId)

  if ((prevPassed ?? 0) > 0) return // already passed before

  const { data: progLink } = await supabase
    .from('program_modules')
    .select('program_id')
    .eq('module_id', moduleId)
    .maybeSingle()
  if (!progLink) return

  const { data: prog } = await supabase
    .from('programs')
    .select('name')
    .eq('id', progLink.program_id)
    .single()
  if (!prog) return

  const levelNum = getProgramLevel(prog.name)
  const levelLabel = LEVEL_LABELS[levelNum]

  const { data: allProgs } = await supabase.from('programs').select('id, name')
  const levelProgIds = (allProgs ?? [])
    .filter((p) => getProgramLevel(p.name) === levelNum)
    .map((p) => p.id)

  const { data: levelLinks } = await supabase
    .from('program_modules')
    .select('module_id')
    .in('program_id', levelProgIds)
  const levelModIds = (levelLinks ?? []).map((l) => l.module_id)
  if (levelModIds.length === 0) return

  const { data: passing } = await supabase
    .from('attempts')
    .select('module_id')
    .eq('user_id', userId)
    .in('module_id', levelModIds)
    .eq('passed', true)
    .eq('is_invalidated', false)

  const passedSet = new Set((passing ?? []).map((a) => a.module_id))
  if (!levelModIds.every((id) => passedSet.has(id))) return

  await sendSlack({
    text: `✅ ${userName} completed Level ${levelNum}: ${levelLabel}`,
    blocks: [{
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *${userName}* completed *Level ${levelNum}: ${levelLabel}*\nAll lessons in this phase are now complete.`,
      },
    }],
  })
}

interface AnswerInput {
  questionId: string
  selectedOptionId: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { moduleId, answers, tabLeaveCount, contentViewSeconds } = body as {
    moduleId: string
    answers: AnswerInput[]
    tabLeaveCount?: number
    contentViewSeconds?: number
  }

  if (!moduleId || !answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'moduleId and answers are required.' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()
  const userName = profile?.name || 'A rep'

  // Fetch module info
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .select('id, title, pass_threshold, is_active')
    .eq('id', moduleId)
    .single()

  if (moduleError || !module) {
    return NextResponse.json({ error: 'Module not found.' }, { status: 404 })
  }

  if (!module.is_active) {
    return NextResponse.json({ error: 'This module is not active.' }, { status: 400 })
  }

  // Fetch questions with correct options for this module
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select(`
      id,
      question_text,
      options(id, option_text, is_correct)
    `)
    .eq('module_id', moduleId)

  if (questionsError || !questions) {
    return NextResponse.json({ error: 'Failed to load questions.' }, { status: 500 })
  }

  // Video-only completion: no answers to grade
  if (answers.length === 0) {
    const { count: previousAttempts } = await supabase
      .from('attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('module_id', moduleId)

    const attemptNumber = (previousAttempts ?? 0) + 1

    const { data: newAttempt, error: attemptError } = await supabase
      .from('attempts')
      .insert({
        user_id: user.id,
        module_id: moduleId,
        score: 100,
        passed: true,
        attempt_number: attemptNumber,
        is_invalidated: false,
        tab_leave_count: 0,
        content_view_seconds: contentViewSeconds ?? 0,
      })
      .select()
      .single()

    if (attemptError || !newAttempt) {
      return NextResponse.json({ error: 'Failed to save completion.' }, { status: 500 })
    }

    await notifyLevelCompleteIfNeeded(supabase, user.id, moduleId, newAttempt.id, userName)
    return NextResponse.json({ score: 100, passed: true, attemptNumber, breakdown: [] })
  }

  // Build a map: questionId -> { correctOptionId, questionText, allOptions }
  const questionMap: Record<string, {
    questionText: string
    correctOptionId: string | null
    options: Array<{ id: string; option_text: string; is_correct: boolean }>
  }> = {}

  for (const q of questions) {
    const correctOption = (q.options as any[]).find((o) => o.is_correct)
    questionMap[q.id] = {
      questionText: q.question_text,
      correctOptionId: correctOption?.id ?? null,
      options: q.options as any[],
    }
  }

  // Evaluate answers
  let correctCount = 0
  const breakdown = answers.map((answer) => {
    const questionData = questionMap[answer.questionId]
    if (!questionData) {
      return {
        questionId: answer.questionId,
        questionText: 'Unknown question',
        selectedOptionId: answer.selectedOptionId,
        correctOptionId: null,
        isCorrect: false,
      }
    }

    const isCorrect = questionData.correctOptionId === answer.selectedOptionId
    if (isCorrect) correctCount++

    return {
      questionId: answer.questionId,
      questionText: questionData.questionText,
      selectedOptionId: answer.selectedOptionId,
      correctOptionId: questionData.correctOptionId,
      isCorrect,
    }
  })

  const totalQuestions = answers.length
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0
  const passed = score >= module.pass_threshold

  // Calculate attempt number
  const { count: previousAttempts } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('module_id', moduleId)

  const attemptNumber = (previousAttempts ?? 0) + 1

  // Save attempt
  const { data: newAttempt, error: attemptError } = await supabase
    .from('attempts')
    .insert({
      user_id: user.id,
      module_id: moduleId,
      score,
      passed,
      attempt_number: attemptNumber,
      is_invalidated: false,
      tab_leave_count: tabLeaveCount ?? 0,
      content_view_seconds: contentViewSeconds ?? 0,
    })
    .select()
    .single()

  if (attemptError || !newAttempt) {
    return NextResponse.json({ error: attemptError?.message ?? 'Failed to save attempt.' }, { status: 500 })
  }

  // Save attempt answers
  const answerRows = answers
    .filter((a) => a.questionId && a.selectedOptionId)
    .map((a) => ({
      attempt_id: newAttempt.id,
      question_id: a.questionId,
      selected_option_id: a.selectedOptionId,
    }))

  if (answerRows.length > 0) {
    const { error: answersError } = await supabase
      .from('attempt_answers')
      .insert(answerRows)

    if (answersError) {
      // Non-fatal: attempt is saved, answers are optional for score calculation
      console.error('Failed to save attempt answers:', answersError.message)
    }
  }

  if (passed) {
    await notifyLevelCompleteIfNeeded(supabase, user.id, moduleId, newAttempt.id, userName)
  }

  return NextResponse.json({
    score,
    passed,
    attemptNumber,
    breakdown,
  })
}
