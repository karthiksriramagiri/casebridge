'use client'

import { useState, useEffect } from 'react'

interface Module { id: string; title: string; pass_threshold: number }
interface Option { id: string; option_text: string; is_correct: boolean; position: number }
interface Question { id: string; question_text: string; position: number; options: Option[] }
interface ExamAttempt {
  id: string
  score: number
  passed: boolean
  attempt_number: number
  created_at: string
  profiles: { name: string } | null
}
interface ExamConfig {
  activeExamId: string | null
  examStartTime: string | null
  modules: Module[]
  examAttempts: ExamAttempt[]
  questions: Question[]
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  })
}

export default function AdminExamsPage() {
  const [config, setConfig] = useState<ExamConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('')
  const [expandedQ, setExpandedQ] = useState<string | null>(null)
  const [showQuestions, setShowQuestions] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loadingQ, setLoadingQ] = useState(false)

  async function loadConfig() {
    const res = await fetch('/api/teams/admin/exams')
    if (res.ok) {
      const data: ExamConfig = await res.json()
      setConfig(data)
      const savedId = data.activeExamId ?? ''
      setSelectedExamId(savedId)
      setQuestions(data.questions ?? [])
      if (data.examStartTime) {
        const d = new Date(data.examStartTime)
        const pad = (n: number) => String(n).padStart(2, '0')
        setStartTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadConfig() }, [])

  // Fetch questions whenever selected exam changes
  useEffect(() => {
    if (!selectedExamId) { setQuestions([]); return }
    setLoadingQ(true)
    fetch(`/api/teams/admin/exams?moduleId=${selectedExamId}`)
      .then(r => r.json())
      .then(data => { setQuestions(data.questions ?? []); setLoadingQ(false) })
      .catch(() => setLoadingQ(false))
  }, [selectedExamId])

  async function handleSeed() {
    setSeeding(true)
    setSeedMsg(null)
    const res = await fetch('/api/teams/admin/exams/seed', { method: 'POST' })
    const json = await res.json()
    if (res.ok) {
      setSeedMsg({ type: 'ok', text: `Exam created! Select it from the dropdown and save.` })
      await loadConfig()
      setSelectedExamId(json.moduleId)
    } else if (res.status === 409) {
      setSeedMsg({ type: 'err', text: `Exam already exists — select "Nuance Book Exam" from the dropdown below.` })
      setSelectedExamId(json.moduleId)
    } else {
      setSeedMsg({ type: 'err', text: json.error ?? 'Failed to seed exam' })
    }
    setSeeding(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const body: Record<string, string | null> = { activeExamId: selectedExamId || null }
    body.examStartTime = startTime ? new Date(startTime).toISOString() : null
    const res = await fetch('/api/teams/admin/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setSaveMsg({ type: 'ok', text: 'Saved successfully' })
      await loadConfig()
    } else {
      const json = await res.json()
      setSaveMsg({ type: 'err', text: json.error ?? 'Failed to save' })
    }
    setSaving(false)
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  const passRate = config.examAttempts.length > 0
    ? Math.round((config.examAttempts.filter(a => a.passed).length / config.examAttempts.length) * 100)
    : null
  const avgScore = config.examAttempts.length > 0
    ? Math.round(config.examAttempts.reduce((s, a) => s + a.score, 0) / config.examAttempts.length)
    : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Exams</h1>
        <p className="text-gray-500 mt-1 text-sm">Configure the active exam and start time for reps.</p>
      </div>

      {/* Seed card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-1">Create Nuance Book Exam</h2>
        <p className="text-sm text-gray-500 mb-4">
          Seeds the 50-question Nuance Book exam. Run once — if it already exists, select it from the dropdown.
        </p>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="px-4 py-2 bg-[#0f1e3c] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2f5a] disabled:opacity-50 transition-colors"
        >
          {seeding ? 'Creating...' : 'Create Nuance Book Exam'}
        </button>
        {seedMsg && (
          <p className={`mt-3 text-sm font-medium ${seedMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {seedMsg.text}
          </p>
        )}
      </div>

      {/* Config card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">Exam Configuration</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Active Exam</label>
          <select
            value={selectedExamId}
            onChange={e => setSelectedExamId(e.target.value)}
            className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— No exam selected —</option>
            {config.modules.map(m => (
              <option key={m.id} value={m.id}>
                {m.title} (pass: {m.pass_threshold}%)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Exam Start Time</label>
          <p className="text-xs text-gray-400 mb-2">
            Reps cannot access the exam until this time. Leave blank to allow access immediately.
          </p>
          <input
            type="datetime-local"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {startTime && (
            <>
              <p className="text-xs text-gray-500 mt-1">
                Reps see: exam unlocks {fmt(new Date(startTime).toISOString())} ET
              </p>
              <button onClick={() => setStartTime('')} className="mt-1 text-xs text-red-500 hover:underline">
                Clear time (open immediately)
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          {saveMsg && (
            <p className={`text-sm font-medium ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Question preview */}
      {selectedExamId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowQuestions(v => !v)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-900">Preview Exam Questions</h2>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {loadingQ ? '...' : `${questions.length} questions`}
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showQuestions ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showQuestions && (
            <div className="border-t border-gray-100 divide-y divide-gray-50">
              {loadingQ ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400">Loading questions...</p>
              ) : questions.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400">No questions found for this exam.</p>
              ) : questions.map(q => {
                const isOpen = expandedQ === q.id
                return (
                  <div key={q.id}>
                    <button
                      onClick={() => setExpandedQ(isOpen ? null : q.id)}
                      className="w-full text-left px-6 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                    >
                      <span className="flex-shrink-0 text-xs font-bold text-gray-400 w-6 pt-0.5">{q.position}.</span>
                      <span className="text-sm text-gray-800 flex-1">{q.question_text}</span>
                      <svg
                        className={`flex-shrink-0 w-4 h-4 text-gray-300 mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-6 pb-4 pl-14 space-y-1.5">
                        {q.options.map(opt => (
                          <div
                            key={opt.id}
                            className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
                              opt.is_correct
                                ? 'bg-green-50 border border-green-200 text-green-800'
                                : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            {opt.is_correct && <span className="flex-shrink-0 text-green-600 font-bold">✓</span>}
                            <span>{opt.option_text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Exam Results</h2>
          {config.examAttempts.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {avgScore !== null && <span>Avg score: <span className="font-bold text-gray-900">{avgScore}%</span></span>}
              {passRate !== null && <span>Pass rate: <span className={`font-bold ${passRate >= 70 ? 'text-green-600' : 'text-red-600'}`}>{passRate}%</span></span>}
            </div>
          )}
        </div>
        {config.examAttempts.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            {config.activeExamId ? 'No attempts yet.' : 'No active exam configured.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {config.examAttempts.map(a => (
              <div key={a.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {(a.profiles as any)?.name ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-400">{fmt(a.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {a.attempt_number > 1 && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      Attempt #{a.attempt_number}
                    </span>
                  )}
                  <span className={`text-sm font-bold ${a.score >= 80 ? 'text-green-600' : 'text-red-600'}`}>
                    {a.score}%
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    a.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                  }`}>
                    {a.passed ? 'Passed' : 'Failed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
