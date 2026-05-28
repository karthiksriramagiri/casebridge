'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Option {
  id: string
  option_text: string
  position: number
}

interface Question {
  id: string
  question_text: string
  explanation: string
  position: number
  options: Option[]
}

interface ModuleData {
  id: string
  title: string
  description: string
  pass_threshold: number
  is_required: boolean
  content_type: 'none' | 'video' | 'text' | 'file'
  video_url: string
  content_body: string
  file_url: string
  file_name: string
  quiz_question_count: number
}

interface BreakdownItem {
  questionId: string
  questionText: string
  explanation: string
  selectedOptionId: string
  correctOptionId: string
  isCorrect: boolean
  selectedOptionText: string
  correctOptionText: string
}

interface QuizResult {
  score: number
  passed: boolean
  attemptNumber: number
  breakdown: BreakdownItem[]
}

type QuizState = 'loading' | 'error' | 'content' | 'taking' | 'submitting' | 'results'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getEmbedUrl(url: string): string | null {
  try {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0`
    const loom = url.match(/loom\.com\/share\/([\w-]+)/)
    if (loom) return `https://www.loom.com/embed/${loom[1]}`
    const vimeo = url.match(/vimeo\.com\/(\d+)/)
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
    return null
  } catch { return null }
}

export default function ModulePage() {
  const params = useParams()
  const moduleId = params.id as string

  const [state, setState] = useState<QuizState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [moduleData, setModuleData] = useState<ModuleData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [contentConfirmed, setContentConfirmed] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [isRetake, setIsRetake] = useState(false)
  const [tabWarning, setTabWarning] = useState(false)
  const [tabLeaveCount, setTabLeaveCount] = useState(0)
  const allQuestionsRef = useRef<Question[]>([])
  const contentStartRef = useRef<number | null>(null)
  const contentViewSecondsRef = useRef(0)
  const tabLeaveCountRef = useRef(0)

  const loadModule = useCallback(async () => {
    setState('loading')
    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated.')

      const { data: mod, error: modError } = await supabase
        .from('modules')
        .select('id, title, description, pass_threshold, is_required, is_active, content_type, video_url, content_body, file_url, file_name, quiz_question_count')
        .eq('id', moduleId)
        .single()

      if (modError || !mod) throw new Error('Module not found.')
      if (!mod.is_active) throw new Error('This module is not currently active.')

      const { data: questionsData, error: qError } = await supabase
        .from('questions')
        .select('id, question_text, explanation, position, options(id, option_text, position)')
        .eq('module_id', moduleId)
        .order('position', { ascending: true })

      if (qError) throw new Error('Failed to load questions.')

      // Check previous attempt count for this user+module
      const { count: prevCount } = await supabase
        .from('attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('module_id', moduleId)

      const isARetake = (prevCount ?? 0) > 0
      setIsRetake(isARetake)

      let allQuestions: Question[] = questionsData.map((q: any) => ({
        ...q,
        options: [...(q.options ?? [])].sort((a: Option, b: Option) => a.position - b.position),
      }))

      // Always shuffle the question pool
      allQuestions = shuffle(allQuestions)

      // If quiz_question_count > 0, select that many from the bank
      const bankCount = mod.quiz_question_count ?? 0
      const selectedQuestions = bankCount > 0 && bankCount < allQuestions.length
        ? allQuestions.slice(0, bankCount)
        : allQuestions

      allQuestionsRef.current = allQuestions
      setModuleData(mod)
      setQuestions(selectedQuestions)

      if (mod.content_type && mod.content_type !== 'none') {
        contentStartRef.current = Date.now()
        setState('content')
      } else {
        setState('taking')
      }
    } catch (err: any) {
      setErrorMsg(err.message)
      setState('error')
    }
  }, [moduleId])

  useEffect(() => { loadModule() }, [loadModule])

  // Warn if user tries to leave during the quiz
  useEffect(() => {
    if (state !== 'taking') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state])

  // Reset quiz if user switches tabs during the quiz
  useEffect(() => {
    if (state !== 'taking') return
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        // They left — count it
        tabLeaveCountRef.current += 1
        setTabLeaveCount(tabLeaveCountRef.current)
        return
      }
      // They came back — reset the quiz
      const all = allQuestionsRef.current
      const mod = moduleData
      const bankCount = mod?.quiz_question_count ?? 0
      const reshuffled = shuffle(all)
      const selected = bankCount > 0 && bankCount < reshuffled.length
        ? reshuffled.slice(0, bankCount)
        : reshuffled
      setQuestions(selected)
      setAnswers({})
      setCurrentIndex(0)
      setTabWarning(true)
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [state, moduleData])

  function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }))
  }

  async function handleNext() {
    const currentQuestion = questions[currentIndex]
    if (!answers[currentQuestion.id]) return

    if (currentIndex < questions.length - 1) {
      // Animate out, then advance
      setAnimating(true)
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1)
        setAnimating(false)
      }, 220)
    } else {
      await submitQuiz()
    }
  }

  async function submitQuiz() {
    setState('submitting')
    try {
      const payload = {
        moduleId,
        answers: questions.map((q) => ({
          questionId: q.id,
          selectedOptionId: answers[q.id],
        })),
        tabLeaveCount: tabLeaveCountRef.current,
        contentViewSeconds: contentViewSecondsRef.current,
      }

      const res = await fetch('/api/teams/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit quiz.')

      // Enrich breakdown with option text + explanation from local data
      const enrichedBreakdown: BreakdownItem[] = (data.breakdown ?? []).map((item: any) => {
        const question = questions.find((q) => q.id === item.questionId)
        const selectedOption = question?.options.find((o) => o.id === item.selectedOptionId)
        const correctOption = question?.options.find((o) => o.id === item.correctOptionId)
        return {
          ...item,
          explanation: question?.explanation ?? '',
          selectedOptionText: selectedOption?.option_text ?? '',
          correctOptionText: correctOption?.option_text ?? '',
        }
      })

      setResult({ ...data, breakdown: enrichedBreakdown })
      setState('results')
    } catch (err: any) {
      setErrorMsg(err.message)
      setState('error')
    }
  }

  async function completeLesson() {
    setState('submitting')
    try {
      const res = await fetch('/api/teams/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, answers: [], contentViewSeconds: contentViewSecondsRef.current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to complete lesson.')
      setResult({ ...data, breakdown: [] })
      setState('results')
    } catch (err: any) {
      setErrorMsg(err.message)
      setState('error')
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading module...</p>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Module</h2>
          <p className="text-gray-500 text-sm mb-6">{errorMsg}</p>
          <Link href="/teams/dashboard" className="inline-block bg-[#0f1e3c] text-white font-semibold text-sm px-6 py-2.5 rounded-lg hover:bg-[#1a3060] transition-colors">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // ── Submitting ───────────────────────────────────────────────────────
  if (state === 'submitting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Submitting your answers...</p>
        </div>
      </div>
    )
  }

  // ── Content Step ─────────────────────────────────────────────────────
  if (state === 'content' && moduleData) {
    const embedUrl = moduleData.content_type === 'video' ? getEmbedUrl(moduleData.video_url) : null

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-5">
            <Link href="/teams/dashboard" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Back to Dashboard
            </Link>
            <h1 className="text-xl font-bold text-gray-900 mt-3">{moduleData.title}</h1>
            {moduleData.description && <p className="text-gray-500 text-sm mt-1">{moduleData.description}</p>}
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-2 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
              Step 1 · {moduleData.content_type === 'video' ? '🎬 Watch' : moduleData.content_type === 'file' ? '📎 Review' : '📄 Read'}
            </div>
            {questions.length > 0 && (
              <>
                <div className="h-px flex-1 bg-gray-200" />
                <div className="flex items-center gap-2 bg-gray-200 text-gray-500 text-xs font-semibold px-3 py-1.5 rounded-full">
                  Step 2 · 📝 Quiz
                </div>
              </>
            )}
          </div>

          {/* Video */}
          {moduleData.content_type === 'video' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">🎬 Training Video</h2>
                <p className="text-xs text-gray-400 mt-0.5">Watch the full video before proceeding to the quiz.</p>
              </div>
              {embedUrl ? (
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe src={embedUrl} className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              ) : (
                <div className="px-5 py-6">
                  <p className="text-sm text-gray-600 mb-2">Open directly:</p>
                  <a href={moduleData.video_url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm underline break-all">
                    {moduleData.video_url}
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Reading */}
          {moduleData.content_type === 'text' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">📄 Training Material</h2>
                <p className="text-xs text-gray-400 mt-0.5">Read carefully before proceeding to the quiz.</p>
              </div>
              <div className="px-6 py-6">
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                  {moduleData.content_body}
                </div>
              </div>
            </div>
          )}

          {/* File */}
          {moduleData.content_type === 'file' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">📎 Training Document</h2>
                <p className="text-xs text-gray-400 mt-0.5">Review this document before taking the quiz.</p>
              </div>
              <div className="px-6 py-8 text-center">
                <div className="text-5xl mb-4">📎</div>
                <p className="text-sm font-medium text-gray-800 mb-1">{moduleData.file_name || 'Training Document'}</p>
                <a
                  href={moduleData.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  Open Document ↗
                </a>
              </div>
            </div>
          )}

          {/* Confirmation */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={contentConfirmed}
                onChange={(e) => setContentConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {moduleData.content_type === 'video'
                  ? questions.length > 0
                    ? 'I have watched the full video and am ready for the quiz.'
                    : 'I have watched the full video.'
                  : moduleData.content_type === 'file'
                  ? questions.length > 0
                    ? 'I have reviewed the document and am ready for the quiz.'
                    : 'I have reviewed the document.'
                  : 'I have read and understood all the material above.'}
              </span>
            </label>
            <button
              onClick={() => {
                if (contentStartRef.current) {
                  contentViewSecondsRef.current = Math.round((Date.now() - contentStartRef.current) / 1000)
                }
                if (questions.length === 0) {
                  completeLesson()
                } else {
                  setState('taking')
                }
              }}
              disabled={!contentConfirmed}
              className="shrink-0 bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              {questions.length === 0 ? 'Complete Lesson →' : 'Start Quiz →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Results ──────────────────────────────────────────────────────────
  if (state === 'results' && result) {
    const passThreshold = moduleData?.pass_threshold ?? 80
    const wrongCount = result.breakdown.filter((i) => !i.isCorrect).length

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            {/* Score header */}
            <div className={`px-6 py-8 text-center ${result.passed ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="text-6xl font-bold mb-2">
                <span className={result.passed ? 'text-green-600' : 'text-red-500'}>{result.score}%</span>
              </div>
              <div className={`text-xl font-bold ${result.passed ? 'text-green-700' : 'text-red-600'}`}>
                {result.passed ? '🎉 Passed!' : '😔 Failed'}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                You need {passThreshold}% to pass · Attempt #{result.attemptNumber}
              </p>
              {!result.passed && (
                <p className="text-sm text-gray-600 mt-3">
                  {wrongCount} question{wrongCount !== 1 ? 's' : ''} incorrect. Review the explanations below, then retake from your dashboard.
                </p>
              )}
            </div>

            {/* Breakdown */}
            {result.breakdown.length > 0 && <div className="px-5 py-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Question Breakdown</h3>
              <div className="space-y-3">
                {result.breakdown.map((item, idx) => (
                  <div
                    key={item.questionId}
                    className={`rounded-lg border p-4 ${item.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`font-bold text-sm mt-0.5 shrink-0 ${item.isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                        {item.isCorrect ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          Q{idx + 1}: {item.questionText}
                        </p>
                        {item.isCorrect ? (
                          <p className="text-xs text-green-700 mt-1">{item.selectedOptionText}</p>
                        ) : (
                          <>
                            <p className="text-xs text-red-600 mt-1">Your answer: {item.selectedOptionText}</p>
                            <p className="text-xs text-green-700 font-medium mt-0.5">Correct: {item.correctOptionText}</p>
                            {item.explanation && (
                              <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                <span className="text-amber-500 text-sm shrink-0">💡</span>
                                <p className="text-xs text-amber-800 leading-relaxed">{item.explanation}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>}
          </div>

          <Link
            href="/teams/dashboard"
            className="w-full block text-center bg-[#0f1e3c] hover:bg-[#1a3060] text-white font-semibold text-sm px-6 py-3 rounded-lg transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // ── Quiz Taking ──────────────────────────────────────────────────────
  const currentQuestion = questions[currentIndex]
  const selectedOption = answers[currentQuestion?.id]
  const isLast = currentIndex === questions.length - 1
  const progress = Math.round(((currentIndex + 1) / questions.length) * 100)

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {tabWarning && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <span className="text-red-500 text-sm shrink-0 mt-0.5">⚠️</span>
            <div>
              <p className="text-sm text-red-700 font-medium">
                You left the tab — your quiz has been reset from the beginning.
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                You have left the tab {tabLeaveCount} time{tabLeaveCount !== 1 ? 's' : ''} during this attempt. This has been recorded.
              </p>
            </div>
          </div>
        )}

        <div className="mb-6">
          <Link href="/teams/dashboard" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            ← Back to Dashboard
          </Link>
          <div className="flex items-start justify-between mt-3">
            <h1 className="text-xl font-bold text-gray-900">{moduleData?.title}</h1>
            {isRetake && (
              <span className="shrink-0 ml-3 text-xs font-semibold bg-orange-100 text-orange-600 px-2.5 py-1 rounded-full">
                Retake
              </span>
            )}
          </div>
        </div>

        <div
          className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
          style={{
            opacity: animating ? 0 : 1,
            transform: animating ? 'translateY(8px)' : 'translateY(0)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          {/* Progress bar */}
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-sm text-gray-400">{progress}%</span>
          </div>
          <div className="bg-gray-100 h-1.5">
            <div
              className="bg-blue-600 h-1.5 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Question */}
          <div className="px-6 py-6">
            <h2 className="text-base font-semibold text-gray-900 mb-5 leading-relaxed">
              {currentQuestion?.question_text}
            </h2>

            <div className="space-y-3">
              {currentQuestion?.options.map((option) => {
                const isSelected = selectedOption === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => selectOption(currentQuestion.id, option.id)}
                    className={`w-full text-left rounded-lg border-2 px-4 py-3.5 text-sm transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                      }`}>
                        {isSelected && <span className="w-2 h-2 bg-white rounded-full" />}
                      </span>
                      {option.option_text}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleNext}
                disabled={!selectedOption || animating}
                className="bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                {isLast ? 'Submit Quiz' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
