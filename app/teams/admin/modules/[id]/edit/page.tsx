'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface OptionForm {
  id: string
  option_text: string
  is_correct: boolean
}

interface QuestionForm {
  id: string
  question_text: string
  explanation: string
  options: OptionForm[]
}

type ContentType = 'none' | 'video' | 'text' | 'file'
type QuestionTab = 'builder' | 'bulk'

function generateId() {
  return Math.random().toString(36).slice(2)
}

function newOption(): OptionForm {
  return { id: generateId(), option_text: '', is_correct: false }
}

function newQuestion(): QuestionForm {
  return { id: generateId(), question_text: '', explanation: '', options: [newOption(), newOption()] }
}

function parseBulkQuestions(raw: string): { questions: QuestionForm[]; errors: string[] } {
  const questions: QuestionForm[] = []
  const errors: string[] = []
  const blocks = raw.split(/(?=^Q:)/m).map((b) => b.trim()).filter(Boolean)

  for (let bi = 0; bi < blocks.length; bi++) {
    const lines = blocks[bi].split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) continue
    const question_text = lines[0].replace(/^Q:\s*/i, '').trim()
    if (!question_text) { errors.push(`Block ${bi + 1}: missing question text`); continue }
    const options: OptionForm[] = []
    let explanation = ''
    for (let li = 1; li < lines.length; li++) {
      const line = lines[li]
      if (/^Explanation:/i.test(line)) { explanation = line.replace(/^Explanation:\s*/i, '').trim(); continue }
      const m = line.match(/^(\*?)([A-Za-z])[).]\s*(.+)$/)
      if (m) options.push({ id: generateId(), option_text: m[3].trim(), is_correct: m[1] === '*' })
    }
    if (options.length < 2) { errors.push(`Q${bi + 1} "${question_text.slice(0, 40)}...": need at least 2 options`); continue }
    if (!options.some((o) => o.is_correct)) { errors.push(`Q${bi + 1} "${question_text.slice(0, 40)}...": no correct answer marked`); continue }
    questions.push({ id: generateId(), question_text, explanation, options })
  }
  return { questions, errors }
}

export default function EditModulePage() {
  const router = useRouter()
  const params = useParams()
  const moduleId = params.id as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState('')

  // Module details
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [passThreshold, setPassThreshold] = useState(80)
  const [isRequired, setIsRequired] = useState(true)
  const [quizQuestionCount, setQuizQuestionCount] = useState(0)

  // Content
  const [contentType, setContentType] = useState<ContentType>('none')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTranscript, setVideoTranscript] = useState('')
  const [contentBody, setContentBody] = useState('')
  const [existingFileUrl, setExistingFileUrl] = useState('')
  const [existingFileName, setExistingFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Questions
  const [questions, setQuestions] = useState<QuestionForm[]>([newQuestion()])
  const [questionTab, setQuestionTab] = useState<QuestionTab>('builder')
  const [bulkText, setBulkText] = useState('')
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const [bulkMode, setBulkMode] = useState<'replace' | 'append'>('replace')

  // Status
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateCount, setGenerateCount] = useState(5)
  const [error, setError] = useState('')

  // Load existing module data
  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: mod, error: modErr } = await supabase
          .from('modules')
          .select('*')
          .eq('id', moduleId)
          .single()
        if (modErr || !mod) throw new Error('Module not found.')

        setTitle(mod.title ?? '')
        setDescription(mod.description ?? '')
        setPassThreshold(mod.pass_threshold ?? 80)
        setIsRequired(mod.is_required ?? true)
        setQuizQuestionCount(mod.quiz_question_count ?? 0)
        setContentType((mod.content_type as ContentType) ?? 'none')
        setVideoUrl(mod.video_url ?? '')
        setVideoTranscript(mod.video_transcript ?? '')
        setContentBody(mod.content_body ?? '')
        setExistingFileUrl(mod.file_url ?? '')
        setExistingFileName(mod.file_name ?? '')

        const { data: qs } = await supabase
          .from('questions')
          .select('id, question_text, explanation, position, options(id, option_text, is_correct, position)')
          .eq('module_id', moduleId)
          .order('position', { ascending: true })

        if (qs && qs.length > 0) {
          const loaded: QuestionForm[] = qs.map((q: any) => ({
            id: generateId(),
            question_text: q.question_text ?? '',
            explanation: q.explanation ?? '',
            options: [...(q.options ?? [])]
              .sort((a: any, b: any) => a.position - b.position)
              .map((o: any) => ({ id: generateId(), option_text: o.option_text, is_correct: o.is_correct })),
          }))
          setQuestions(loaded)
        }
      } catch (err: any) {
        setPageError(err.message)
      } finally {
        setPageLoading(false)
      }
    }
    load()
  }, [moduleId])

  // Question builder helpers
  function updateQuestion(id: string, field: 'question_text' | 'explanation', value: string) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)))
  }
  function addOption(qid: string) {
    setQuestions((prev) => prev.map((q) => q.id === qid ? { ...q, options: [...q.options, newOption()] } : q))
  }
  function removeOption(qid: string, oid: string) {
    setQuestions((prev) => prev.map((q) => q.id === qid ? { ...q, options: q.options.filter((o) => o.id !== oid) } : q))
  }
  function updateOption(qid: string, oid: string, field: 'option_text' | 'is_correct', value: string | boolean) {
    setQuestions((prev) => prev.map((q) => {
      if (q.id !== qid) return q
      return {
        ...q,
        options: q.options.map((o): OptionForm => {
          if (field === 'is_correct') return { ...o, is_correct: o.id === oid ? (value as boolean) : false }
          return o.id === oid ? { ...o, option_text: value as string } : o
        }),
      }
    }))
  }
  function addQuestion() { setQuestions((prev) => [...prev, newQuestion()]) }
  function removeQuestion(id: string) {
    if (questions.length <= 1) return
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  function handleBulkImport() {
    setBulkErrors([])
    const { questions: parsed, errors } = parseBulkQuestions(bulkText)
    if (errors.length) { setBulkErrors(errors); return }
    if (!parsed.length) { setBulkErrors(['No valid questions found.']); return }
    setQuestions(bulkMode === 'append' ? [...questions, ...parsed] : parsed)
    setBulkText('')
    setQuestionTab('builder')
  }

  async function handleGenerate() {
    setError('')
    const sourceContent =
      contentType === 'text' ? contentBody.trim() :
      contentType === 'video' ? (videoTranscript.trim() || videoUrl.trim()) :
      contentType === 'file' ? (existingFileName || selectedFile?.name || '') : ''
    if (!sourceContent) { setError('Add training content above before generating questions.'); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/teams/admin/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sourceContent, contentType, hasTranscript: contentType === 'video' && !!videoTranscript.trim(), count: generateCount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate questions')
      const generated: QuestionForm[] = data.questions.map((q: any) => ({
        id: generateId(), question_text: q.question_text, explanation: q.explanation,
        options: q.options.map((o: any) => ({ id: generateId(), option_text: o.option_text, is_correct: o.is_correct })),
      }))
      setQuestions((prev) => [...prev.filter((q) => q.question_text.trim()), ...generated])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    setError('')
    const fail = (msg: string) => { setError(msg); window.scrollTo({ top: 0, behavior: 'smooth' }); return true }

    if (!title.trim()) { fail('Module title is required.'); return }
    if (contentType === 'video' && !videoUrl.trim()) { fail('Please enter a video URL.'); return }
    if (contentType === 'text' && !contentBody.trim()) { fail('Please enter the reading content.'); return }
    if (contentType === 'file' && !selectedFile && !existingFileUrl) { fail('Please select a file to upload.'); return }

    const validQuestions = questions.filter((q) => q.question_text.trim())
    if (!validQuestions.length) { fail('At least one question is required.'); return }

    for (let i = 0; i < validQuestions.length; i++) {
      const q = validQuestions[i]
      if (!q.options.some((o) => o.option_text.trim())) { fail(`Question ${i + 1} needs at least one answer option.`); return }
      if (!q.options.some((o) => o.is_correct && o.option_text.trim())) { fail(`Question ${i + 1} needs a correct answer marked.`); return }
    }

    if (quizQuestionCount > 0 && quizQuestionCount > validQuestions.length) {
      fail(`"Questions per attempt" (${quizQuestionCount}) can't exceed the number of questions in the bank (${validQuestions.length}).`)
      return
    }

    setLoading(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      let fileUrl = existingFileUrl
      let fileName = existingFileName
      if (contentType === 'file' && selectedFile) {
        const supabase = createClient()
        const ext = selectedFile.name.split('.').pop()
        const path = `${generateId()}.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('module-files').upload(path, selectedFile, { upsert: false })
        if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`)
        const { data: publicData } = supabase.storage.from('module-files').getPublicUrl(uploadData.path)
        fileUrl = publicData.publicUrl
        fileName = selectedFile.name
      }

      const res = await fetch(`/api/teams/admin/modules/${moduleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(), description: description.trim(),
          pass_threshold: passThreshold, is_required: isRequired,
          quiz_question_count: quizQuestionCount,
          content_type: contentType, video_url: videoUrl.trim(),
          video_transcript: videoTranscript.trim(), content_body: contentBody.trim(),
          file_url: fileUrl, file_name: fileName,
          questions: validQuestions.map((q) => ({
            question_text: q.question_text.trim(),
            explanation: q.explanation.trim(),
            options: q.options.filter((o) => o.option_text.trim())
              .map((o) => ({ option_text: o.option_text.trim(), is_correct: o.is_correct })),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update module')
      router.push('/teams/admin/modules')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalQ = questions.filter((q) => q.question_text.trim()).length

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="max-w-2xl">
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{pageError}</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Edit Module</h1>
        <p className="text-sm text-gray-500 mt-1">Changes apply to all future attempts.</p>
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Module Details */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5 mb-6">
        <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">Module Details</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Module Title *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Firm Intake Criteria & Guidelines" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief description of what this module covers..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Pass Threshold (%)</label>
            <input type="number" min={1} max={100} value={passThreshold}
              onChange={(e) => setPassThreshold(parseInt(e.target.value) || 80)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm font-medium text-gray-700">Required for certification</span>
            </label>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl">🎲</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800">Question Bank</p>
              <p className="text-xs text-blue-600 mt-0.5">Reps get a random selection each attempt.</p>
              <div className="flex items-center gap-2 mt-3">
                <label className="text-sm text-blue-800 font-medium whitespace-nowrap">Questions per attempt:</label>
                <input type="number" min={0} max={999}
                  value={quizQuestionCount === 0 ? '' : quizQuestionCount}
                  onChange={(e) => setQuizQuestionCount(parseInt(e.target.value) || 0)}
                  placeholder="all"
                  className="w-20 border border-blue-200 rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                <span className="text-xs text-blue-500">
                  {quizQuestionCount > 0 ? `of ${totalQ || '?'} in bank` : `show all ${totalQ || '?'} questions`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Training Content */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5 mb-6">
        <h2 className="text-base font-semibold text-gray-800 border-b border-gray-100 pb-3">
          Training Content
          <span className="ml-2 text-xs font-normal text-gray-400">Reps complete this before the quiz</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { value: 'none', icon: '📝', label: 'Quiz Only', desc: 'No content' },
            { value: 'video', icon: '🎬', label: 'Video', desc: 'YouTube / Loom' },
            { value: 'text', icon: '📄', label: 'Reading', desc: 'Paste text' },
            { value: 'file', icon: '📎', label: 'File', desc: 'PDF / Doc' },
          ].map((opt) => (
            <button key={opt.value} type="button" onClick={() => setContentType(opt.value as ContentType)}
              className={`rounded-xl border-2 p-3.5 text-left transition-all ${
                contentType === opt.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="text-2xl mb-1">{opt.icon}</div>
              <div className={`text-sm font-semibold ${contentType === opt.value ? 'text-blue-700' : 'text-gray-800'}`}>{opt.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        {contentType === 'video' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Video URL *</label>
              <input type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://www.youtube.com/watch?v=... or Loom / Vimeo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Video Transcript
                <span className="ml-2 text-xs font-normal text-gray-400">optional but recommended for AI generation</span>
              </label>
              <textarea value={videoTranscript} onChange={(e) => setVideoTranscript(e.target.value)} rows={8}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste the video transcript here..." />
            </div>
          </div>
        )}

        {contentType === 'text' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Reading Content *</label>
            <textarea value={contentBody} onChange={(e) => setContentBody(e.target.value)} rows={14}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste your training content here..." />
          </div>
        )}

        {contentType === 'file' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload File</label>
            {existingFileUrl && !selectedFile && (
              <div className="flex items-center gap-3 mb-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <span className="text-2xl">📎</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{existingFileName || 'Current file'}</p>
                  <p className="text-xs text-gray-400">Upload a new file below to replace it</p>
                </div>
                <a href={existingFileUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0">View ↗</a>
              </div>
            )}
            <div onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f) }}
              className="border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 rounded-xl p-8 text-center cursor-pointer transition-all">
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl">📎</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                    className="ml-2 text-red-400 hover:text-red-600 text-lg">×</button>
                </div>
              ) : (
                <>
                  <div className="text-4xl mb-2">📎</div>
                  <p className="text-sm font-medium text-gray-700">Drop a file here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, PowerPoint, or any document</p>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]) }} />
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              Question Bank
              {totalQ > 0 && (
                <span className="ml-2 text-xs font-normal bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {totalQ} question{totalQ !== 1 ? 's' : ''}
                  {quizQuestionCount > 0 && ` · ${quizQuestionCount} shown per attempt`}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Build as many questions as you want — each attempt pulls a random set.</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <select value={generateCount} onChange={(e) => setGenerateCount(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400">
              {[3, 5, 8, 10, 15, 20, 25, 30, 40, 50].map((n) => <option key={n} value={n}>{n} Qs</option>)}
            </select>
            <button type="button" onClick={handleGenerate} disabled={generating}
              className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
              {generating ? (
                <><svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Generating...</>
              ) : '✨ Generate with AI'}
            </button>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          <button onClick={() => setQuestionTab('builder')}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${
              questionTab === 'builder' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            📋 Question Builder
            {totalQ > 0 && <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{totalQ}</span>}
          </button>
          <button onClick={() => setQuestionTab('bulk')}
            className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-all ${
              questionTab === 'bulk' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            📥 Bulk Add
          </button>
        </div>

        {questionTab === 'builder' && (
          <div className="space-y-4">
            {questions.map((question, qi) => (
              <div key={question.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">
                    {qi + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    <input type="text" value={question.question_text}
                      onChange={(e) => updateQuestion(question.id, 'question_text', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter question text..." />
                    <input type="text" value={question.explanation}
                      onChange={(e) => updateQuestion(question.id, 'explanation', e.target.value)}
                      className="w-full border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-amber-400"
                      placeholder="💡 Explanation shown if rep gets this wrong (optional)..." />
                  </div>
                  {questions.length > 1 && (
                    <button onClick={() => removeQuestion(question.id)}
                      className="text-red-400 hover:text-red-600 text-sm p-1 shrink-0">×</button>
                  )}
                </div>
                <div className="ml-9 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Answer Options (select the correct one)</p>
                  {question.options.map((option, oi) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <input type="radio" name={`correct-${question.id}`} checked={option.is_correct}
                        onChange={() => updateOption(question.id, option.id, 'is_correct', true)}
                        className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500 shrink-0" />
                      <input type="text" value={option.option_text}
                        onChange={(e) => updateOption(question.id, option.id, 'option_text', e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={`Option ${oi + 1}...`} />
                      {question.options.length > 2 && (
                        <button onClick={() => removeOption(question.id, option.id)}
                          className="text-red-400 hover:text-red-600 text-sm p-1 shrink-0">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addOption(question.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 mt-2">
                    + Add option
                  </button>
                </div>
              </div>
            ))}
            <button onClick={addQuestion}
              className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-xl py-4 text-sm font-medium transition-all flex items-center justify-center gap-2">
              <span className="text-lg">+</span> Add Question
            </button>
          </div>
        )}

        {questionTab === 'bulk' && (
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wider">Format Guide</p>
              <pre className="text-xs text-gray-600 leading-relaxed font-mono whitespace-pre-wrap">{`Q: What is the first step when receiving a new lead?
A) Check the CRM for duplicates
*B) Verify the case type meets firm criteria
C) Call the potential client immediately
D) Send intake paperwork
Explanation: Always verify the case type first.`}</pre>
            </div>
            {bulkErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-red-700 mb-1">Fix these errors:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {bulkErrors.map((e, i) => <li key={i} className="text-xs text-red-600">{e}</li>)}
                </ul>
              </div>
            )}
            <textarea value={bulkText} onChange={(e) => { setBulkText(e.target.value); setBulkErrors([]) }} rows={18}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Paste your questions here in the format shown above..." />
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-3">
                {(['replace', 'append'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600">
                    <input type="radio" name="bulkMode" checked={bulkMode === m} onChange={() => setBulkMode(m)}
                      className="w-3.5 h-3.5 text-blue-600 border-gray-300" />
                    {m === 'replace' ? 'Replace all questions' : `Append to existing (${totalQ})`}
                  </label>
                ))}
              </div>
              <button onClick={handleBulkImport} disabled={!bulkText.trim()}
                className="bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
                Import Questions
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex gap-3">
        <button onClick={() => router.push('/teams/admin/modules')}
          className="flex-1 sm:flex-none border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-6 py-3 rounded-lg transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={loading}
          className="flex-1 sm:flex-none bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-8 py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
          {loading ? (
            <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Saving...</>
          ) : `Save Changes (${totalQ} question${totalQ !== 1 ? 's' : ''} in bank)`}
        </button>
      </div>
    </div>
  )
}
