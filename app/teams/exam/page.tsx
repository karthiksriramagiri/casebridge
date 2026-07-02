'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import UserNav from '../dashboard/UserNav'
import LogoutButton from '../dashboard/LogoutButton'

interface Option { id: string; option_text: string; position: number }
interface Question { id: string; question_text: string; position: number; options: Option[] }
interface ExamAttempt { id: string; score: number; passed: boolean; attempt_number: number; created_at: string }
interface BreakdownItem {
  questionId: string
  questionText: string
  selectedOptionId: string
  correctOptionId: string | null
  isCorrect: boolean
}
interface ExamData {
  exam: { id: string; title: string; description: string; pass_threshold: number } | null
  examStartTime: string | null
  questions: Question[]
  myAttempts: ExamAttempt[]
}

function Countdown({ target }: { target: Date }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    function tick() {
      const diff = target.getTime() - Date.now()
      if (diff <= 0) { setRemaining('00:00:00'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  return <span className="font-mono text-4xl font-bold text-white">{remaining}</span>
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  })
}

export default function ExamPage() {
  const router = useRouter()
  const [timeclockEnabled, setTimeclockEnabled] = useState(false)
  const [teamType, setTeamType] = useState('intake')
  const [examData, setExamData] = useState<ExamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  // Quiz state
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ score: number; passed: boolean; attemptNumber: number; breakdown: BreakdownItem[] } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Tick to detect when exam unlocks
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/teams/login'); return }

    const { data: prof } = await supabase
      .from('profiles')
      .select('role, nda_signed, timeclock_enabled, team_type')
      .eq('id', user.id)
      .single()

    if (!prof?.nda_signed) { router.push('/teams/onboarding'); return }
    if (prof.role === 'admin') { router.push('/teams/admin'); return }

    setTimeclockEnabled(!!prof.timeclock_enabled)
      setTeamType(prof.team_type ?? 'intake')

    const res = await fetch('/api/teams/exam')
    if (res.ok) setExamData(await res.json())
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function handleSubmit() {
    if (!examData?.exam) return
    const totalQ = examData.questions.length
    const answered = Object.keys(answers).length
    if (answered < totalQ) {
      if (!confirm(`You have answered ${answered} of ${totalQ} questions. Submit anyway?`)) return
    }

    setSubmitting(true)
    setSubmitError(null)
    const answerArray = examData.questions.map(q => ({
      questionId: q.id,
      selectedOptionId: answers[q.id] ?? '',
    })).filter(a => a.selectedOptionId)

    try {
      const res = await fetch('/api/teams/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId: examData.exam.id, answers: answerArray }),
      })

      const data = await res.json()
      if (res.ok) {
        setResult(data)
        setSubmitted(true)
      } else {
        setSubmitError(data?.error ?? `Submission failed (${res.status}). Please try again.`)
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.')
    }
    setSubmitting(false)
  }

  if (loading || !examData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  const { exam, examStartTime, questions, myAttempts } = examData
  const startDate = examStartTime ? new Date(examStartTime) : null
  const isLocked = startDate ? now < startDate.getTime() : false
  const bestAttempt = myAttempts.length > 0
    ? myAttempts.reduce((best, a) => a.score > best.score ? a : best)
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <UserNav timeclockEnabled={timeclockEnabled} teamType={teamType} />

        {/* No exam configured */}
        {!exam && (
          <div className="mt-8 text-center py-20">
            <p className="text-2xl font-bold text-gray-300">No exam available</p>
            <p className="text-gray-400 mt-2">Check back later — your admin will post the exam here.</p>
          </div>
        )}

        {/* Exam locked / countdown */}
        {exam && isLocked && startDate && (
          <div className="mt-8">
            <div className="bg-[#0f1e3c] rounded-2xl px-8 py-10 text-center">
              <p className="text-blue-300 text-sm font-semibold uppercase tracking-wide mb-2">Exam Starts In</p>
              <Countdown target={startDate} />
              <p className="text-blue-300 text-sm mt-4">{fmtDate(startDate.toISOString())} ET</p>
              <p className="text-white/60 text-xs mt-2">This page will unlock automatically when the timer reaches 0.</p>
            </div>
            <div className="mt-4 bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4">
              <p className="font-semibold text-gray-900">{exam.title}</p>
              <p className="text-sm text-gray-500 mt-1">{exam.description}</p>
              <p className="text-xs text-gray-400 mt-2">{questions.length} questions · Pass threshold: {exam.pass_threshold}%</p>
            </div>
          </div>
        )}

        {/* Results screen */}
        {exam && !isLocked && submitted && result && (
          <div className="mt-8 space-y-6">
            <div className={`rounded-2xl px-8 py-8 text-center ${result.passed ? 'bg-green-600' : 'bg-red-600'}`}>
              <p className="text-white/80 text-sm font-semibold uppercase tracking-wide mb-1">
                {result.passed ? 'Exam Passed!' : 'Exam Not Passed'}
              </p>
              <p className="text-5xl font-bold text-white">{result.score}%</p>
              <p className="text-white/70 text-sm mt-2">
                {result.passed
                  ? `You scored ${result.score}% — above the ${exam.pass_threshold}% pass threshold.`
                  : `You scored ${result.score}% — the pass threshold is ${exam.pass_threshold}%.`}
              </p>
            </div>

            {/* Question review */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Answer Review</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {result.breakdown.map((item, i) => {
                  const q = questions.find(q => q.id === item.questionId)
                  return (
                    <div key={item.questionId} className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {item.isCorrect ? '✓' : '✗'}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 mb-2">
                            {i + 1}. {item.questionText}
                          </p>
                          {q?.options.map(opt => {
                            const isSelected = opt.id === item.selectedOptionId
                            const isCorrect = opt.id === item.correctOptionId
                            let cls = 'text-gray-500'
                            if (isCorrect) cls = 'text-green-700 font-semibold'
                            else if (isSelected && !isCorrect) cls = 'text-red-600 line-through'
                            return (
                              <p key={opt.id} className={`text-xs mb-0.5 ${cls}`}>
                                {isSelected && !isCorrect && '✗ '}
                                {isCorrect && '✓ '}
                                {opt.option_text}
                              </p>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {!result.passed && (
              <button
                onClick={() => { setSubmitted(false); setResult(null); setAnswers({}) }}
                className="w-full py-3 bg-[#0f1e3c] text-white font-semibold rounded-xl hover:bg-[#1a2f5a] transition-colors"
              >
                Retake Exam
              </button>
            )}
          </div>
        )}

        {/* Active exam */}
        {exam && !isLocked && !submitted && (
          <div className="mt-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
                <p className="text-gray-500 text-sm mt-1">{exam.description}</p>
                <p className="text-xs text-gray-400 mt-1">{questions.length} questions · {exam.pass_threshold}% to pass</p>
              </div>
              {bestAttempt && (
                <div className="text-right bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
                  <p className="text-xs text-gray-400">Best score</p>
                  <p className={`text-lg font-bold ${bestAttempt.passed ? 'text-green-600' : 'text-red-600'}`}>
                    {bestAttempt.score}%
                  </p>
                  <p className="text-xs text-gray-400">{myAttempts.length} attempt{myAttempts.length !== 1 ? 's' : ''}</p>
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="bg-white border border-gray-100 rounded-xl px-5 py-3 shadow-sm flex items-center justify-between">
              <span className="text-sm text-gray-500">
                <span className="font-bold text-gray-900">{Object.keys(answers).length}</span> / {questions.length} answered
              </span>
              <div className="w-48 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Questions */}
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${answers[q.id] ? 'border-blue-200' : 'border-gray-100'}`}>
                  <div className="px-6 py-4 border-b border-gray-50">
                    <p className="text-sm font-semibold text-gray-900">
                      <span className="text-gray-400 mr-2">{i + 1}.</span>
                      {q.question_text}
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {q.options.map(opt => {
                      const selected = answers[q.id] === opt.id
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                          className={`w-full text-left px-6 py-3 flex items-center gap-3 transition-colors ${
                            selected ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            selected ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                          }`}>
                            {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          <span className={`text-sm ${selected ? 'text-blue-900 font-medium' : 'text-gray-700'}`}>
                            {opt.option_text.split(' — ')[0]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3">
                <p className="text-sm font-semibold text-red-700">{submitError}</p>
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 bg-[#0f1e3c] text-white font-bold text-lg rounded-xl hover:bg-[#1a2f5a] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Exam'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
