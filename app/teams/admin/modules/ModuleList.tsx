'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface Option {
  id: string
  option_text: string
  is_correct: boolean
  position: number
}

interface Question {
  id: string
  module_id: string
  question_text: string
  position: number
  options: Option[]
}

interface ModuleItem {
  id: string
  title: string
  description: string
  pass_threshold: number
  is_required: boolean
  is_active: boolean
  created_at: string
  questionCount: number
  questions: Question[]
}

interface Props {
  modules: ModuleItem[]
}

export default function ModuleList({ modules: initialModules }: Props) {
  const router = useRouter()
  const [modules, setModules] = useState(initialModules)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function copyLink(moduleId: string) {
    const url = `https://teams.case-bridge.com/teams/module/${moduleId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyFeedback(moduleId)
      setTimeout(() => setCopyFeedback(null), 2000)
    } catch {
      // Fallback
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopyFeedback(moduleId)
      setTimeout(() => setCopyFeedback(null), 2000)
    }
  }

  async function toggleActive(moduleId: string, currentActive: boolean) {
    setTogglingId(moduleId)
    setMessage('')

    try {
      const res = await fetch(`/api/teams/admin/modules/${moduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update module')

      setModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, is_active: !currentActive } : m))
      )
      setMessage(`Module ${!currentActive ? 'activated' : 'deactivated'}.`)
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      {message && (
        <div className={`mb-4 text-sm font-medium px-4 py-3 rounded-lg ${
 message.startsWith('Error')
            ? 'bg-destructive/10 text-destructive border border-destructive/30'
            : 'bg-success/10 text-success border border-success/30'
        }`}>
          {message}
        </div>
      )}

      {modules.length === 0 ? (
        <div className="bg-card rounded-xl border border-border px-6 py-12 text-center">
          <p className="text-muted-foreground">No modules yet. Create your first module!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((mod) => {
            const isExpanded = expandedIds.has(mod.id)
            const isCopied = copyFeedback === mod.id
            const isToggling = togglingId === mod.id

            return (
              <div key={mod.id} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Module header row */}
                <div className="flex items-center gap-3 px-5 py-4">
                  {/* Status dot */}
                  <span
                    className={`w-3 h-3 rounded-full shrink-0 ${mod.is_active ? 'bg-success' : 'bg-border'}`}
                    title={mod.is_active ? 'Active' : 'Inactive'}
                  />

                  {/* Module info */}
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold ${mod.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {mod.title}
                    </span>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                      <span>{mod.questionCount} question{mod.questionCount !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>Pass: {mod.pass_threshold}%</span>
                      <span>·</span>
                      <span>{mod.is_required ? 'Required' : 'Optional'}</span>
                      <span>·</span>
                      <span>Created {format(new Date(mod.created_at), 'M/d/yyyy')}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => router.push(`/teams/admin/modules/${mod.id}/edit`)}
                      className="text-xs border border-border hover:bg-muted/50 text-muted-foreground font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => copyLink(mod.id)}
                      className={`text-xs border rounded-lg px-3 py-1.5 transition-colors font-medium ${
 isCopied
                          ? 'border-success/30 bg-success/10 text-success'
                          : 'border-border hover:bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      {isCopied ? '✓ Copied!' : '🔗 Copy Link'}
                    </button>
                    <button
                      onClick={() => toggleActive(mod.id, mod.is_active)}
                      disabled={isToggling}
                      className={`text-xs border rounded-lg px-3 py-1.5 transition-colors font-medium disabled:opacity-50 ${
 mod.is_active
                          ? 'border-warning/30 bg-warning/10 hover:bg-warning/10 text-warning'
                          : 'border-success/30 bg-success/10 hover:bg-success/10 text-success'
                      }`}
                    >
                      {isToggling ? '...' : mod.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => toggleExpand(mod.id)}
                      className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded questions */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/40 px-5 py-4">
                    {mod.description && (
                      <p className="text-sm text-muted-foreground mb-4 italic">{mod.description}</p>
                    )}
                    {mod.questions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No questions yet for this module.</p>
                    ) : (
                      <div className="space-y-4">
                        {mod.questions.map((question, qi) => (
                          <div key={question.id} className="bg-card rounded-lg border border-border p-4">
                            <p className="text-sm font-semibold text-foreground mb-2">
                              Q{qi + 1}: {question.question_text}
                            </p>
                            <div className="space-y-1.5">
                              {(question.options ?? [])
                                .sort((a: Option, b: Option) => a.position - b.position)
                                .map((option: Option) => (
                                  <div
                                    key={option.id}
                                    className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md ${
 option.is_correct
                                        ? 'bg-success/10 text-success font-medium'
                                        : 'text-muted-foreground'
                                    }`}
                                  >
                                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-xs shrink-0 ${
 option.is_correct
                                        ? 'border-success bg-success text-primary-foreground'
                                        : 'border-border'
                                    }`}>
                                      {option.is_correct && '✓'}
                                    </span>
                                    {option.option_text}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
