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
  ndaSigned: boolean
  timeclockEnabled: boolean
  timerDisabled: boolean
  shift: string | null
  ghlUserIds: string[]
  payrollMethod: string | null
  payrollInfo: string | null
  hourlyRate: number | null
  commissionPerClose: number | null
  currentLevel: number
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

type SettingsTab = 'callqueue' | 'payroll' | 'retakes' | 'danger'

interface Module {
  id: string
  title: string
}

const LEVEL_LABELS: Record<number, string> = {
  1: 'Level 1 · Intro',
  2: 'Level 2 · Onboarding',
  3: 'Level 3 · Active',
}

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-sky-100 text-sky-700',
  2: 'bg-indigo-100 text-indigo-700',
  3: 'bg-emerald-100 text-emerald-700',
}

const SHIFT_LABELS: Record<string, string> = {
  morning:           'Morning (7AM–12PM PST)',
  afternoon:         'Afternoon (12PM–3PM PST)',
  evening:           'Evening (3PM–9PM PST)',
  morning_afternoon: 'Morning + Afternoon (7AM–3PM PST)',
  afternoon_evening: 'Afternoon + Evening (12PM–9PM PST)',
}

const PAYROLL_METHODS = ['Payoneer', 'Wise', 'Zelle', 'Venmo', 'PayPal', 'Bank Transfer', 'Other']

export default function RepsPage() {
  const [reps, setReps] = useState<Rep[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Retake state per rep
  const [retakeSelected, setRetakeSelected] = useState<Record<string, Set<string>>>({})
  const [retakeMessage, setRetakeMessage] = useState<Record<string, string>>({})
  const [retakeSaving, setRetakeSaving] = useState<string | null>(null)

  // Expanded settings per rep
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, SettingsTab>>({})

  // Call Queue draft state
  const [shiftDraft, setShiftDraft] = useState<Record<string, string>>({})
  const [ghlDraft, setGhlDraft] = useState<Record<string, string>>({})
  const [callQueueSaving, setCallQueueSaving] = useState<string | null>(null)

  // Payroll draft state
  const [payrollMethodDraft, setPayrollMethodDraft] = useState<Record<string, string>>({})
  const [payrollInfoDraft, setPayrollInfoDraft] = useState<Record<string, string>>({})
  const [payStructureDraft, setPayStructureDraft] = useState<Record<string, string>>({}) // 'hourly' | 'per_close' | ''
  const [hourlyRateDraft, setHourlyRateDraft] = useState<Record<string, string>>({})
  const [commissionDraft, setCommissionDraft] = useState<Record<string, string>>({})
  const [payrollSaving, setPayrollSaving] = useState<string | null>(null)

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')

  // View History dialog
  const [historyRep, setHistoryRep] = useState<Rep | null>(null)
  const [breakdownAttemptId, setBreakdownAttemptId] = useState<string | null>(null)
  const [breakdownAnswers, setBreakdownAnswers] = useState<any[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)

  // Add Rep dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addName, setAddName] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

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
    fetch('/api/teams/admin/modules')
      .then(r => r.json())
      .then(d => setModules((d.modules ?? []).map((m: any) => ({ id: m.id, title: m.title }))))
      .catch(() => {})
  }, [fetchReps])

  function openSettings(rep: Rep) {
    setSettingsOpen(rep.id)
    setActiveTab(t => ({ ...t, [rep.id]: t[rep.id] ?? 'callqueue' }))
    setShiftDraft(d => ({ ...d, [rep.id]: rep.shift ?? '' }))
    setGhlDraft(d => ({ ...d, [rep.id]: (rep.ghlUserIds ?? []).join(', ') }))
    setPayrollMethodDraft(d => ({ ...d, [rep.id]: rep.payrollMethod ?? '' }))
    setPayrollInfoDraft(d => ({ ...d, [rep.id]: rep.payrollInfo ?? '' }))
    const structure = rep.hourlyRate != null ? 'hourly' : rep.commissionPerClose != null ? 'per_close' : ''
    setPayStructureDraft(d => ({ ...d, [rep.id]: structure }))
    setHourlyRateDraft(d => ({ ...d, [rep.id]: rep.hourlyRate != null ? String(rep.hourlyRate) : '' }))
    setCommissionDraft(d => ({ ...d, [rep.id]: rep.commissionPerClose != null ? String(rep.commissionPerClose) : '' }))
  }

  async function handleSaveCallQueue(repId: string) {
    setCallQueueSaving(repId)
    const shift = shiftDraft[repId] || null
    const ghlIds = (ghlDraft[repId] || '').split(',').map(s => s.trim()).filter(Boolean)
    await Promise.all([
      fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_shift', shift }),
      }),
      fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_ghl_ids', ghlIds }),
      }),
    ])
    setReps(prev => prev.map(r => r.id === repId ? { ...r, shift, ghlUserIds: ghlIds } : r))
    setCallQueueSaving(null)
  }

  async function handleRequestRetake(repId: string) {
    const selected = retakeSelected[repId]
    if (!selected || selected.size === 0) return
    setRetakeSaving(repId)
    try {
      const moduleIds = modules.filter(m => selected.has(m.id)).map(m => ({ id: m.id, title: m.title }))
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_retake', moduleIds, message: retakeMessage[repId] || '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRetakeSelected(prev => ({ ...prev, [repId]: new Set() }))
      setRetakeMessage(prev => ({ ...prev, [repId]: '' }))
      setActionMessage('Retake request sent.')
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setRetakeSaving(null)
    }
  }

  async function handleToggleTimer(repId: string, current: boolean) {
    setActionLoading(repId + ':timer')
    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_timer', value: !current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReps(prev => prev.map(r => r.id === repId ? { ...r, timerDisabled: !current } : r))
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleToggleTimeclock(repId: string, current: boolean) {
    setActionLoading(repId + ':timeclock')
    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_timeclock', value: !current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReps(prev => prev.map(r => r.id === repId ? { ...r, timeclockEnabled: !current } : r))
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSavePayroll(repId: string) {
    setPayrollSaving(repId)
    const structure = payStructureDraft[repId]
    const hourlyRate = structure === 'hourly' ? (parseFloat(hourlyRateDraft[repId]) || null) : null
    const commissionPerClose = structure === 'per_close' ? (parseFloat(commissionDraft[repId]) || null) : null
    const res = await fetch(`/api/teams/admin/reps/${repId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_payroll',
        payrollMethod: payrollMethodDraft[repId] || null,
        payrollInfo: payrollInfoDraft[repId] || null,
        hourlyRate,
        commissionPerClose,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setReps(prev => prev.map(r =>
        r.id === repId
          ? { ...r, payrollMethod: payrollMethodDraft[repId] || null, payrollInfo: payrollInfoDraft[repId] || null, hourlyRate, commissionPerClose }
          : r
      ))
    } else {
      setActionMessage(`Error: ${data.error}`)
    }
    setPayrollSaving(null)
  }

  async function handleForceRetake(repId: string) {
    if (!confirm('Force retake will invalidate all passing attempts for this rep. Continue?')) return
    setActionLoading(repId + ':retake')
    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_retake' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActionMessage('Retake forced.')
      await fetchReps()
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResetPassword(repId: string) {
    setActionLoading(repId + ':reset')
    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
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
    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSettingsOpen(null)
      await fetchReps()
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
    }
  }

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

  async function handleAddRep(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')
    try {
      const res = await fetch('/api/teams/admin/reps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, password: addPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add rep')
      setShowAddDialog(false)
      setAddName('')
      setAddPassword('')
      await fetchReps()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">All Reps</h1>
          <p className="text-sm text-gray-500 mt-0.5">{reps.length} team member{reps.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="bg-[#0f1e3c] hover:bg-[#1a3060] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <span className="text-base leading-none">+</span>
          Add Rep
        </button>
      </div>

      {actionMessage && (
        <div className={`mb-4 text-sm font-medium px-4 py-3 rounded-lg ${
          actionMessage.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {actionMessage}
          <button onClick={() => setActionMessage('')} className="ml-2 opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading reps...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      ) : reps.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 text-center">
          <p className="text-gray-500 text-sm">No reps yet. Add your first team member!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reps.map((rep) => {
            const isOpen = settingsOpen === rep.id
            const tab = activeTab[rep.id] ?? 'callqueue'

            return (
              <div key={rep.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Rep row */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: identity + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{rep.name}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[rep.currentLevel] ?? 'bg-gray-100 text-gray-600'}`}>
                          {LEVEL_LABELS[rep.currentLevel] ?? `Level ${rep.currentLevel}`}
                        </span>
                        {rep.certified && (
                          <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                            ✦ Certified
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rep.ndaSigned ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'}`}>
                          {rep.ndaSigned ? '✓ NDA' : '✗ NDA Pending'}
                        </span>
                        {rep.timeclockEnabled && (
                          <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                            Timeclock
                          </span>
                        )}
                        {rep.shift && (
                          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
                            {SHIFT_LABELS[rep.shift] ?? rep.shift}
                          </span>
                        )}
                        {rep.payrollMethod && (
                          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                            {rep.payrollMethod}
                            {rep.hourlyRate != null && ` · $${rep.hourlyRate}/hr`}
                            {rep.commissionPerClose != null && ` · $${rep.commissionPerClose}/close`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {rep.email}
                        <span className="mx-1.5 text-gray-200">·</span>
                        {rep.passedRequired}/{rep.totalRequired} modules
                        <span className="mx-1.5 text-gray-200">·</span>
                        {rep.attempts.length} attempt{rep.attempts.length !== 1 ? 's' : ''}
                        <span className="mx-1.5 text-gray-200">·</span>
                        Joined {format(new Date(rep.created_at), 'M/d/yyyy')}
                      </p>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setHistoryRep(rep)}
                        className="text-xs border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        History
                      </button>
                      <button
                        onClick={() => isOpen ? setSettingsOpen(null) : openSettings(rep)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                          isOpen
                            ? 'bg-[#0f1e3c] text-white border-[#0f1e3c]'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </button>
                    </div>
                  </div>
                </div>

                {/* Settings panel */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {/* Tab bar */}
                    <div className="flex border-b border-gray-100 bg-gray-50">
                      {([
                        { key: 'callqueue', label: 'Call Queue' },
                        { key: 'payroll',   label: 'Payroll' },
                        { key: 'retakes',   label: 'Retakes' },
                        { key: 'danger',    label: 'Danger Zone' },
                      ] as { key: SettingsTab; label: string }[]).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setActiveTab(t => ({ ...t, [rep.id]: key }))}
                          className={`px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                            tab === key
                              ? key === 'danger'
                                ? 'border-red-500 text-red-600 bg-white'
                                : 'border-[#0f1e3c] text-[#0f1e3c] bg-white'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    <div className="px-5 py-5">
                      {/* Call Queue tab */}
                      {tab === 'callqueue' && (
                        <div className="space-y-4">
                          {/* Timeclock toggle */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">Timeclock Access</p>
                              <p className="text-xs text-gray-500 mt-0.5">Allow rep to clock in/out</p>
                            </div>
                            <button
                              onClick={() => handleToggleTimeclock(rep.id, rep.timeclockEnabled)}
                              disabled={actionLoading === rep.id + ':timeclock'}
                              className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none disabled:opacity-50 ${rep.timeclockEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rep.timeclockEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>

                          {/* Training timer toggle */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-800">Disable Training Timer</p>
                              <p className="text-xs text-gray-500 mt-0.5">Skip expiry lock on dashboard</p>
                            </div>
                            <button
                              onClick={() => handleToggleTimer(rep.id, rep.timerDisabled)}
                              disabled={actionLoading === rep.id + ':timer'}
                              className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none disabled:opacity-50 ${rep.timerDisabled ? 'bg-orange-500' : 'bg-gray-300'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${rep.timerDisabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Shift</label>
                              <select
                                value={shiftDraft[rep.id] ?? ''}
                                onChange={e => setShiftDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">No shift (not in call queue)</option>
                                <option value="morning">Morning — 7AM–12PM PST</option>
                                <option value="afternoon">Afternoon — 12PM–3PM PST</option>
                                <option value="evening">Evening — 3PM–9PM PST</option>
                                <option value="overnight">Overnight — 9PM–7AM PST</option>
                                <option value="morning_afternoon">Morning + Afternoon — 7AM–3PM PST</option>
                                <option value="afternoon_evening">Afternoon + Evening — 12PM–9PM PST</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                GHL User IDs
                                <span className="text-gray-400 font-normal ml-1">(comma-separated)</span>
                              </label>
                              <input
                                type="text"
                                value={ghlDraft[rep.id] ?? ''}
                                onChange={e => setGhlDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                placeholder="e.g. DNj1g2jJWDn, JyJZdMlw3pu"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setSettingsOpen(null)}
                              className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveCallQueue(rep.id)}
                              disabled={callQueueSaving === rep.id}
                              className="text-sm bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                              {callQueueSaving === rep.id ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Payroll tab */}
                      {tab === 'payroll' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payroll Method</label>
                              <select
                                value={payrollMethodDraft[rep.id] ?? ''}
                                onChange={e => setPayrollMethodDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Select method</option>
                                {PAYROLL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Structure</label>
                              <select
                                value={payStructureDraft[rep.id] ?? ''}
                                onChange={e => setPayStructureDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Not set</option>
                                <option value="hourly">Hourly</option>
                                <option value="per_close">Per Close (Commission)</option>
                              </select>
                            </div>
                          </div>

                          {payStructureDraft[rep.id] === 'hourly' && (
                            <div className="max-w-xs">
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Hourly Rate (USD)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={hourlyRateDraft[rep.id] ?? ''}
                                  onChange={e => setHourlyRateDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          )}

                          {payStructureDraft[rep.id] === 'per_close' && (
                            <div className="max-w-xs">
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Commission per Close (USD)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={commissionDraft[rep.id] ?? ''}
                                  onChange={e => setCommissionDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">
                              Account / Payment Info
                              <span className="text-gray-400 font-normal ml-1">(e.g. email, username, or account number)</span>
                            </label>
                            <input
                              type="text"
                              value={payrollInfoDraft[rep.id] ?? ''}
                              onChange={e => setPayrollInfoDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                              placeholder="e.g. john@example.com or @johnsmith"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setSettingsOpen(null)}
                              className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSavePayroll(rep.id)}
                              disabled={payrollSaving === rep.id}
                              className="text-sm bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                              {payrollSaving === rep.id ? 'Saving…' : 'Save Payroll'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Retakes tab */}
                      {tab === 'retakes' && (
                        <div className="space-y-4">
                          <p className="text-xs text-gray-500">Select modules to invalidate and send a retake notification to this rep.</p>
                          <div className="space-y-1.5 max-h-64 overflow-y-auto">
                            {modules.map(m => {
                              const isChecked = retakeSelected[rep.id]?.has(m.id) ?? false
                              return (
                                <label key={m.id} className="flex items-center gap-2.5 cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setRetakeSelected(prev => {
                                        const next = new Set(prev[rep.id] ?? [])
                                        isChecked ? next.delete(m.id) : next.add(m.id)
                                        return { ...prev, [rep.id]: next }
                                      })
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700 group-hover:text-gray-900">{m.title}</span>
                                </label>
                              )
                            })}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Message to rep <span className="text-gray-400 font-normal">(optional)</span></label>
                            <textarea
                              rows={2}
                              value={retakeMessage[rep.id] ?? ''}
                              onChange={e => setRetakeMessage(prev => ({ ...prev, [rep.id]: e.target.value }))}
                              placeholder="e.g. Please review the updated guidelines before retaking."
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            />
                          </div>
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleRequestRetake(rep.id)}
                              disabled={retakeSaving === rep.id || !(retakeSelected[rep.id]?.size)}
                              className="text-sm bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                              {retakeSaving === rep.id ? 'Sending…' : `Send Retake Request (${retakeSelected[rep.id]?.size ?? 0} module${(retakeSelected[rep.id]?.size ?? 0) !== 1 ? 's' : ''})`}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Danger Zone tab */}
                      {tab === 'danger' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-3 border-b border-gray-100">
                            <div>
                              <p className="text-sm font-medium text-gray-800">Force Retake</p>
                              <p className="text-xs text-gray-500 mt-0.5">Invalidate all passing attempts — rep must redo training</p>
                            </div>
                            <button
                              onClick={() => handleForceRetake(rep.id)}
                              disabled={actionLoading === rep.id + ':retake'}
                              className="text-xs font-semibold border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                              {actionLoading === rep.id + ':retake' ? 'Working…' : 'Force Retake'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-gray-100">
                            <div>
                              <p className="text-sm font-medium text-gray-800">Reset Password</p>
                              <p className="text-xs text-gray-500 mt-0.5">Send a password reset link to their email</p>
                            </div>
                            <button
                              onClick={() => handleResetPassword(rep.id)}
                              disabled={actionLoading === rep.id + ':reset'}
                              className="text-xs font-semibold border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                              {actionLoading === rep.id + ':reset' ? 'Sending…' : 'Send Reset Email'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between py-3">
                            <div>
                              <p className="text-sm font-medium text-red-700">Delete Rep</p>
                              <p className="text-xs text-gray-500 mt-0.5">Permanently remove this rep and all their data</p>
                            </div>
                            <button
                              onClick={() => handleDeleteRep(rep.id, rep.name)}
                              disabled={actionLoading === rep.id + ':delete'}
                              className="text-xs font-semibold border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                              {actionLoading === rep.id + ':delete' ? 'Deleting…' : 'Delete Rep'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                <h2 className="text-base font-semibold text-gray-900">{historyRep.name}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{historyRep.email}</p>
              </div>
              <button onClick={() => setHistoryRep(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
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
                        <div className="flex gap-2 mt-2 flex-wrap items-center">
                          {viewTime && (
                            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded px-2 py-0.5">
                              Viewed: {viewTime}
                            </span>
                          )}
                          {attempt.tabLeaveCount > 0 && (
                            <span className="text-xs bg-red-50 text-red-700 border border-red-100 rounded px-2 py-0.5">
                              Left tab {attempt.tabLeaveCount}×
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
              <button onClick={() => { setShowAddDialog(false); setAddError('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddRep} className="px-5 py-5 space-y-4">
              {addError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5">{addError}</div>
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
                  className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
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
              <button onClick={() => setBreakdownAttemptId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
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
