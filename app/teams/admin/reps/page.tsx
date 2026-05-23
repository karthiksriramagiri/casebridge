'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'

interface Rep {
  id: string
  name: string
  email: string
  created_at: string
  attempts: AttemptSummary[]
  certified: boolean
  passedRequired: number
  totalRequired: number
}

interface AttemptSummary {
  id: string
  moduleTitle: string
  score: number
  passed: boolean
  attemptNumber: number
  createdAt: string
  tabLeaveCount: number
  contentViewSeconds: number
}

export default function RepsPage() {
  const [reps, setReps] = useState<Rep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // View History dialog
  const [historyRep, setHistoryRep] = useState<Rep | null>(null)

  // Attempt breakdown
  const [breakdownAttemptId, setBreakdownAttemptId] = useState<string | null>(null)
  const [breakdownAnswers, setBreakdownAnswers] = useState<any[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)

  async function openBreakdown(attemptId: string) {
    setBreakdownAttemptId(attemptId)
    setBreakdownLoading(true)
    setBreakdownAnswers([])
    const supabase = createClient()
    const { data } = await supabase
      .from('attempt_answers')
      .select(`
        id,
        question_id,
        selected_option_id,
        questions!attempt_answers_question_id_fkey(question_text),
        options!attempt_answers_selected_option_id_fkey(option_text, is_correct)
      `)
      .eq('attempt_id', attemptId)
    setBreakdownAnswers(data ?? [])
    setBreakdownLoading(false)
  }

  // Add Rep dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')

  const fetchReps = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/teams/admin/reps')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch reps')
      setReps(data.reps ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReps()
  }, [fetchReps])

  async function handleAddRep(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')

    try {
      const res = await fetch('/api/teams/admin/reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, email: addEmail, password: addPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add rep')

      setShowAddDialog(false)
      setAddName('')
      setAddEmail('')
      setAddPassword('')
      await fetchReps()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  async function handleForceRetake(repId: string) {
    if (!confirm('Force retake will invalidate all passing attempts for this rep. Continue?')) return
    setActionLoading(repId + ':retake')
    setActionMessage('')

    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_retake' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to force retake')
      setActionMessage(`Retake forced for rep.`)
      await fetchReps()
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResetPassword(repId: string) {
    setActionLoading(repId + ':reset')
    setActionMessage('')

    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send reset email')
      setActionMessage('Password reset email sent.')
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDeleteRep(repId: string, repName: string) {
    if (!confirm(`Delete rep "${repName}"? This cannot be undone.`)) return
    setActionLoading(repId + ':delete')
    setActionMessage('')

    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete rep')
      setActionMessage('Rep deleted.')
      await fetchReps()
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">All Reps</h1>
          <p className="text-sm text-gray-500 mt-1">{reps.length} team member{reps.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="bg-[#0f1e3c] hover:bg-[#1a3060] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <span className="text-base">+</span>
          Add Rep
        </button>
      </div>

      {actionMessage && (
        <div className={`mb-4 text-sm font-medium px-4 py-3 rounded-lg ${
          actionMessage.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {actionMessage}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading reps...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : reps.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-500">No reps yet. Add your first team member!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reps.map((rep) => {
            const isForceLoading = actionLoading === rep.id + ':retake'
            const isResetLoading = actionLoading === rep.id + ':reset'
            const isDeleteLoading = actionLoading === rep.id + ':delete'

            return (
              <div key={rep.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{rep.name}</span>
                      {rep.certified && (
                        <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                          ✦ Certified
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-1">
                      <span>{rep.email}</span>
                      <span className="text-gray-300">·</span>
                      <span>{rep.passedRequired}/{rep.totalRequired} required modules passed</span>
                      <span className="text-gray-300">·</span>
                      <span>{rep.attempts.length} total attempt{rep.attempts.length !== 1 ? 's' : ''}</span>
                      <span className="text-gray-300">·</span>
                      <span>Joined {format(new Date(rep.created_at), 'M/d/yyyy')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      onClick={() => setHistoryRep(rep)}
                      className="text-sm border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      View History
                    </button>
                    <button
                      onClick={() => handleForceRetake(rep.id)}
                      disabled={isForceLoading}
                      className="text-sm border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isForceLoading ? '...' : 'Force Retake'}
                    </button>
                    <button
                      onClick={() => handleResetPassword(rep.id)}
                      disabled={isResetLoading}
                      className="text-sm border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isResetLoading ? '...' : '🔑 Reset PW'}
                    </button>
                    <button
                      onClick={() => handleDeleteRep(rep.id, rep.name)}
                      disabled={isDeleteLoading}
                      className="text-sm border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isDeleteLoading ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View History Dialog */}
      {historyRep && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{historyRep.name}'s History</h2>
                <p className="text-xs text-gray-500 mt-0.5">{historyRep.email}</p>
              </div>
              <button onClick={() => setHistoryRep(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {historyRep.attempts.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No attempts yet.</p>
              ) : (
                <div className="space-y-2">
                  {historyRep.attempts.map((attempt) => {
                    const mins = Math.floor(attempt.contentViewSeconds / 60)
                    const secs = attempt.contentViewSeconds % 60
                    const viewTime = attempt.contentViewSeconds > 0
                      ? mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
                      : null
                    return (
                      <div key={attempt.id} className="bg-gray-50 rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{attempt.moduleTitle}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {format(new Date(attempt.createdAt), 'M/d/yyyy')} · Attempt #{attempt.attemptNumber}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-700">{attempt.score}%</p>
                            <p className={`text-xs font-medium ${attempt.passed ? 'text-green-600' : 'text-red-500'}`}>
                              {attempt.passed ? 'Passed' : 'Failed'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-2 flex-wrap items-center">
                          {viewTime && (
                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5">
                              Content viewed: {viewTime}
                            </span>
                          )}
                          {attempt.tabLeaveCount > 0 && (
                            <span className="text-xs bg-red-50 text-red-700 border border-red-100 rounded px-2 py-0.5">
                              Left tab {attempt.tabLeaveCount}× during quiz
                            </span>
                          )}
                          <button
                            onClick={() => openBreakdown(attempt.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 transition-colors"
                          >
                            View Answers
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setHistoryRep(null)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Rep Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Add New Rep</h2>
              <button onClick={() => { setShowAddDialog(false); setAddError('') }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleAddRep} className="px-5 py-5 space-y-4">
              {addError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5">
                  {addError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddDialog(false); setAddError('') }}
                  className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
                >
                  {addLoading ? 'Adding...' : 'Add Rep'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attempt Breakdown Modal */}
      {breakdownAttemptId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Attempt Breakdown</h2>
              <button onClick={() => setBreakdownAttemptId(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {breakdownLoading ? (
                <p className="text-gray-400 text-sm text-center py-8">Loading...</p>
              ) : breakdownAnswers.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">No answer details available.</p>
              ) : (
                <div className="space-y-3">
                  {breakdownAnswers.map((answer: any, idx: number) => {
                    const isCorrect = answer.options?.is_correct === true
                    return (
                      <div key={answer.id} className={`rounded-lg border p-3 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-sm font-bold mt-0.5 shrink-0 ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                            {isCorrect ? '✓' : '✗'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">
                              Q{idx + 1}: {answer.questions?.question_text ?? 'Unknown question'}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              Answered: <span className={isCorrect ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                                {answer.options?.option_text ?? 'Unknown'}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setBreakdownAttemptId(null)}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
