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

interface OptionForm { id: string; option_text: string; is_correct: boolean }
interface QuestionForm { id: string; question_text: string; options: OptionForm[] }

function generateId() { return Math.random().toString(36).slice(2) }
function newOption(): OptionForm { return { id: generateId(), option_text: '', is_correct: false } }
function newQuestion(): QuestionForm {
  return { id: generateId(), question_text: '', options: [newOption(), newOption(), newOption(), newOption()] }
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  })
}

export default function AdminExamsPage() {
  const [team, setTeam] = useState<'intake' | 'creative'>('intake')
  const [config, setConfig] = useState<ExamConfig | null>(null)
  const [loading, setLoading] = useState(true)

  // Config card
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [selectedExamId, setSelectedExamId] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('')

  // Questions for selected exam
  const [questions, setQuestions] = useState<Question[]>([])
  const [examAttempts, setExamAttempts] = useState<ExamAttempt[]>([])
  const [loadingQ, setLoadingQ] = useState(false)

  // Create exam panel
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPassThreshold, setNewPassThreshold] = useState(80)
  const [newQuestions, setNewQuestions] = useState<QuestionForm[]>([newQuestion()])
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  // Add question panel (for existing exam)
  const [showAddQ, setShowAddQ] = useState(false)
  const [addQForm, setAddQForm] = useState<QuestionForm>(newQuestion())
  const [addingQ, setAddingQ] = useState(false)
  const [addQErr, setAddQErr] = useState('')

  async function loadConfig() {
    setLoading(true)
    const res = await fetch(`/api/teams/admin/exams?team=${team}`)
    if (res.ok) {
      const data: ExamConfig = await res.json()
      setConfig(data)
      setSelectedExamId(data.activeExamId ?? '')
      setQuestions(data.questions ?? [])
      setExamAttempts(data.examAttempts ?? [])
      setStartTime('')
      if (data.examStartTime) {
        const d = new Date(data.examStartTime)
        const pad = (n: number) => String(n).padStart(2, '0')
        setStartTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadConfig() }, [team]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedExamId) { setQuestions([]); setExamAttempts([]); return }
    setLoadingQ(true)
    fetch(`/api/teams/admin/exams?team=${team}&moduleId=${selectedExamId}`)
      .then(r => r.json())
      .then(data => {
        setQuestions(data.questions ?? [])
        setExamAttempts(data.examAttempts ?? [])
        setLoadingQ(false)
      })
      .catch(() => setLoadingQ(false))
  }, [selectedExamId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    const res = await fetch('/api/teams/admin/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeExamId: selectedExamId || null,
        examStartTime: startTime ? new Date(startTime).toISOString() : null,
        team,
      }),
    })
    if (res.ok) {
      setSaveMsg({ type: 'ok', text: 'Saved' })
      await loadConfig()
    } else {
      const json = await res.json()
      setSaveMsg({ type: 'err', text: json.error ?? 'Failed to save' })
    }
    setSaving(false)
  }

  async function handleDeleteExam(id: string, title: string) {
    if (!confirm(`Delete exam "${title}"? This will also delete all questions and attempt history. This cannot be undone.`)) return
    const res = await fetch(`/api/teams/admin/exams/manage?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedExamId === id) setSelectedExamId('')
      await loadConfig()
    } else {
      const json = await res.json()
      alert(json.error ?? 'Failed to delete exam')
    }
  }

  async function handleCreateExam() {
    setCreateErr('')
    if (!newTitle.trim()) { setCreateErr('Title is required'); return }
    const validQs = newQuestions.filter(q => q.question_text.trim())
    if (!validQs.length) { setCreateErr('At least one question is required'); return }
    for (let i = 0; i < validQs.length; i++) {
      const q = validQs[i]
      if (!q.options.some(o => o.is_correct && o.option_text.trim())) {
        setCreateErr(`Question ${i + 1} needs a correct answer marked`); return
      }
    }

    setCreating(true)
    const res = await fetch('/api/teams/admin/exams/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newTitle.trim(),
        description: newDesc.trim(),
        pass_threshold: newPassThreshold,
        team_type: team,
        questions: validQs.map(q => ({
          question_text: q.question_text.trim(),
          options: q.options.filter(o => o.option_text.trim()).map(o => ({
            option_text: o.option_text.trim(),
            is_correct: o.is_correct,
          })),
        })),
      }),
    })
    const json = await res.json()
    if (res.ok) {
      setShowCreate(false)
      setNewTitle('')
      setNewDesc('')
      setNewPassThreshold(80)
      setNewQuestions([newQuestion()])
      await loadConfig()
      setSelectedExamId(json.moduleId)
    } else {
      setCreateErr(json.error ?? 'Failed to create exam')
    }
    setCreating(false)
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm('Delete this question?')) return
    const res = await fetch(`/api/teams/admin/exams/questions?id=${questionId}`, { method: 'DELETE' })
    if (res.ok) {
      setQuestions(prev => prev.filter(q => q.id !== questionId))
    } else {
      const json = await res.json()
      alert(json.error ?? 'Failed to delete question')
    }
  }

  async function handleAddQuestion() {
    setAddQErr('')
    if (!addQForm.question_text.trim()) { setAddQErr('Question text is required'); return }
    if (!addQForm.options.some(o => o.is_correct && o.option_text.trim())) {
      setAddQErr('Mark one option as correct'); return
    }

    setAddingQ(true)
    const res = await fetch(`/api/teams/admin/exams/questions?moduleId=${selectedExamId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_text: addQForm.question_text.trim(),
        position: questions.length + 1,
        options: addQForm.options
          .filter(o => o.option_text.trim())
          .map(o => ({ option_text: o.option_text.trim(), is_correct: o.is_correct })),
      }),
    })
    if (res.ok) {
      setShowAddQ(false)
      setAddQForm(newQuestion())
      // Reload questions
      const r2 = await fetch(`/api/teams/admin/exams?team=${team}&moduleId=${selectedExamId}`)
      const d = await r2.json()
      setQuestions(d.questions ?? [])
    } else {
      const json = await res.json()
      setAddQErr(json.error ?? 'Failed to add question')
    }
    setAddingQ(false)
  }

  // ── Question form helpers ──
  function updateNewQ(questions: QuestionForm[], setFn: (q: QuestionForm[]) => void, id: string, field: 'question_text', val: string) {
    setFn(questions.map(q => q.id === id ? { ...q, [field]: val } : q))
  }
  function updateNewOpt(questions: QuestionForm[], setFn: (q: QuestionForm[]) => void, qid: string, oid: string, field: 'option_text' | 'is_correct', val: string | boolean) {
    setFn(questions.map(q => {
      if (q.id !== qid) return q
      return {
        ...q,
        options: q.options.map(o => {
          if (field === 'is_correct') return { ...o, is_correct: o.id === oid ? (val as boolean) : false }
          return o.id === oid ? { ...o, option_text: val as string } : o
        }),
      }
    }))
  }

  const passRate = examAttempts.length > 0
    ? Math.round((examAttempts.filter(a => a.passed).length / examAttempts.length) * 100)
    : null
  const avgScore = examAttempts.length > 0
    ? Math.round(examAttempts.reduce((s, a) => s + a.score, 0) / examAttempts.length)
    : null

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exams</h1>
          <p className="text-gray-500 mt-1 text-sm">Create and manage exams for your reps.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setTeam('intake')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                team === 'intake' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >Intake</button>
            <button
              onClick={() => setTeam('creative')}
              className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                team === 'creative' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >Creative</button>
          </div>
          <button
            onClick={() => { setShowCreate(v => !v); setCreateErr('') }}
            className="px-4 py-2 bg-[#0f1e3c] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2f5a] transition-colors"
          >
            {showCreate ? 'Cancel' : '+ New Exam'}
          </button>
        </div>
      </div>

      {/* Create Exam Panel */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 text-base">Create New Exam</h2>

          {createErr && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{createErr}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Exam Title *</label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Nuance Book Exam"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Pass Threshold (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={newPassThreshold}
                onChange={e => setNewPassThreshold(parseInt(e.target.value) || 80)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Question Builder */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">
                Questions
                <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {newQuestions.filter(q => q.question_text.trim()).length}
                </span>
              </h3>
            </div>
            <div className="space-y-3">
              {newQuestions.map((q, qi) => (
                <QuestionBuilder
                  key={q.id}
                  question={q}
                  index={qi}
                  canRemove={newQuestions.length > 1}
                  onUpdateText={val => updateNewQ(newQuestions, setNewQuestions, q.id, 'question_text', val)}
                  onUpdateOpt={(oid, field, val) => updateNewOpt(newQuestions, setNewQuestions, q.id, oid, field, val)}
                  onAddOpt={() => setNewQuestions(prev => prev.map(x => x.id === q.id ? { ...x, options: [...x.options, newOption()] } : x))}
                  onRemoveOpt={oid => setNewQuestions(prev => prev.map(x => x.id === q.id ? { ...x, options: x.options.filter(o => o.id !== oid) } : x))}
                  onRemove={() => setNewQuestions(prev => prev.filter(x => x.id !== q.id))}
                />
              ))}
              <button
                onClick={() => setNewQuestions(prev => [...prev, newQuestion()])}
                className="w-full border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl py-3 text-sm font-medium transition-all"
              >
                + Add Question
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleCreateExam}
              disabled={creating}
              className="px-6 py-2.5 bg-[#0f1e3c] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2f5a] disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create Exam'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setCreateErr('') }}
              className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Exam List */}
      {config.modules.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Exams</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {config.modules.map(m => (
              <div key={m.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="selectedExam"
                    checked={selectedExamId === m.id}
                    onChange={() => setSelectedExamId(m.id)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{m.title}</p>
                    <p className="text-xs text-gray-400">Pass: {m.pass_threshold}%</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteExam(m.id, m.title)}
                  className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Question Manager */}
      {selectedExamId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-900">Questions</h2>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                {loadingQ ? '...' : `${questions.length}`}
              </span>
            </div>
            <button
              onClick={() => { setShowAddQ(v => !v); setAddQErr('') }}
              className="px-3 py-1.5 text-sm font-semibold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {showAddQ ? 'Cancel' : '+ Add Question'}
            </button>
          </div>

          {/* Add Question Form */}
          {showAddQ && (
            <div className="p-6 border-b border-gray-100 bg-blue-50">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">New Question</h3>
              {addQErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-3">{addQErr}</div>
              )}
              <QuestionBuilder
                question={addQForm}
                index={0}
                canRemove={false}
                onUpdateText={val => setAddQForm(q => ({ ...q, question_text: val }))}
                onUpdateOpt={(oid, field, val) => setAddQForm(q => ({
                  ...q,
                  options: q.options.map(o => {
                    if (field === 'is_correct') return { ...o, is_correct: o.id === oid ? (val as boolean) : false }
                    return o.id === oid ? { ...o, option_text: val as string } : o
                  }),
                }))}
                onAddOpt={() => setAddQForm(q => ({ ...q, options: [...q.options, newOption()] }))}
                onRemoveOpt={oid => setAddQForm(q => ({ ...q, options: q.options.filter(o => o.id !== oid) }))}
                onRemove={() => {}}
                hideNumber
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handleAddQuestion}
                  disabled={addingQ}
                  className="px-5 py-2 bg-[#0f1e3c] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2f5a] disabled:opacity-50 transition-colors"
                >
                  {addingQ ? 'Saving...' : 'Save Question'}
                </button>
              </div>
            </div>
          )}

          {/* Question List */}
          {loadingQ ? (
            <p className="px-6 py-10 text-center text-sm text-gray-400">Loading...</p>
          ) : questions.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-400">
              No questions yet. Click "+ Add Question" to get started.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {questions.map((q, qi) => (
                <div key={q.id} className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 text-xs font-bold text-gray-400 w-6 mt-0.5">{qi + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{q.question_text}</p>
                      <div className="mt-2 space-y-1">
                        {q.options.sort((a, b) => a.position - b.position).map(opt => (
                          <div
                            key={opt.id}
                            className={`flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5 ${
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
                    </div>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 font-medium transition-colors ml-2"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Exam Results</h2>
          {examAttempts.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              {avgScore !== null && <span>Avg: <span className="font-bold text-gray-900">{avgScore}%</span></span>}
              {passRate !== null && (
                <span>Pass rate: <span className={`font-bold ${passRate >= 70 ? 'text-green-600' : 'text-red-600'}`}>{passRate}%</span></span>
              )}
            </div>
          )}
        </div>
        {examAttempts.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-400">
            {selectedExamId ? 'No attempts yet.' : 'Select an exam to see results.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {examAttempts.map(a => (
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
                  <span className={`text-sm font-bold ${
                    a.score >= (config.modules.find(m => m.id === selectedExamId)?.pass_threshold ?? 80)
                      ? 'text-green-600' : 'text-red-600'
                  }`}>
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

// ── Reusable question builder component ──────────────────────────────────────
function QuestionBuilder({
  question,
  index,
  canRemove,
  hideNumber,
  onUpdateText,
  onUpdateOpt,
  onAddOpt,
  onRemoveOpt,
  onRemove,
}: {
  question: QuestionForm
  index: number
  canRemove: boolean
  hideNumber?: boolean
  onUpdateText: (val: string) => void
  onUpdateOpt: (oid: string, field: 'option_text' | 'is_correct', val: string | boolean) => void
  onAddOpt: () => void
  onRemoveOpt: (oid: string) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3 mb-3">
        {!hideNumber && (
          <span className="bg-blue-100 text-blue-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
            {index + 1}
          </span>
        )}
        <input
          type="text"
          value={question.question_text}
          onChange={e => onUpdateText(e.target.value)}
          className="flex-1 border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter question text..."
        />
        {canRemove && (
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0 leading-none mt-1">
            ×
          </button>
        )}
      </div>

      <div className={`space-y-2 ${!hideNumber ? 'ml-9' : ''}`}>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Options (select correct)</p>
        {question.options.map((opt, oi) => (
          <div key={opt.id} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={opt.is_correct}
              onChange={() => onUpdateOpt(opt.id, 'is_correct', true)}
              className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500 shrink-0"
              title="Mark as correct"
            />
            <input
              type="text"
              value={opt.option_text}
              onChange={e => onUpdateOpt(opt.id, 'option_text', e.target.value)}
              className="flex-1 border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={`Option ${oi + 1}...`}
            />
            {question.options.length > 2 && (
              <button onClick={() => onRemoveOpt(opt.id)} className="text-red-400 hover:text-red-600 text-lg font-bold shrink-0 leading-none">×</button>
            )}
          </div>
        ))}
        <button
          onClick={onAddOpt}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 mt-1"
        >
          + Add option
        </button>
      </div>
    </div>
  )
}
