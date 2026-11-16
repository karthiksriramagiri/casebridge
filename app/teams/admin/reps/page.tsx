'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'
import { Button } from '@/app/teams/_ui/button'
import { Plus } from 'lucide-react'

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
  levelsUnlocked: boolean
  todoMode: string
  teamType: string
  shift: string | null
  ghlUserIds: string[]
  payrollMethod: string | null
  payrollInfo: string | null
  hourlyRate: number | null
  commissionPerClose: number | null
  currentLevel: number
  repPhase: number
  creativeSlug: string | null
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

type SettingsTab = 'callqueue' | 'todos' | 'callreviews' | 'payroll' | 'retakes' | 'danger'

interface CallNote {
  id: string
  caseId: string
  contactName: string
  notes: string
  updatedAt: string
}

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
  1: 'bg-primary/10 text-primary',
  2: 'bg-primary/10 text-primary',
  3: 'bg-success/10 text-success',
}

const SHIFT_LABELS: Record<string, string> = {
  morning:           'Morning (7AM–12PM PST)',
  afternoon:         'Afternoon (12PM–3PM PST)',
  early_evening:     'Early Evening (2PM–11PM PST)',
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

  // Creative slug draft state
  const [slugDraft, setSlugDraft] = useState<Record<string, string>>({})
  const [slugSaving, setSlugSaving] = useState<string | null>(null)

  // Call notes per rep
  const [callNotes, setCallNotes] = useState<Record<string, CallNote[]>>({})
  const [callNotesLoading, setCallNotesLoading] = useState<string | null>(null)

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
  const [addTeamType, setAddTeamType] = useState('intake')
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

  async function handleToggleLevelsLock(repId: string, current: boolean) {
    setActionLoading(repId + ':levels')
    try {
      const res = await fetch(`/api/teams/admin/reps/${repId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_levels_lock', value: !current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReps(prev => prev.map(r => r.id === repId ? { ...r, levelsUnlocked: !current } : r))
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`)
    } finally {
      setActionLoading(null)
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
        body: JSON.stringify({ name: addName, password: addPassword, teamType: addTeamType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add rep')
      setShowAddDialog(false)
      setAddName('')
      setAddPassword('')
      setAddTeamType('intake')
      await fetchReps()
    } catch (err: any) {
      setAddError(err.message)
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        title="All Reps"
        description={`${reps.length} team member${reps.length !== 1 ? 's' : ''}`}
        actions={
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="size-4" aria-hidden /> Add rep
          </Button>
        }
      />
      <PageBody>

      {actionMessage && (
        <div className={`mb-4 text-sm font-medium px-4 py-3 rounded-lg ${
 actionMessage.startsWith('Error') ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-success/10 text-success border border-success/30'
        }`}>
          {actionMessage}
          <button onClick={() => setActionMessage('')} className="ml-2 opacity-50 hover:opacity-100">×</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading reps...</div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-4 py-3">{error}</div>
      ) : reps.length === 0 ? (
        <div className="bg-card rounded-xl border border-border px-6 py-16 text-center">
          <p className="text-muted-foreground text-sm">No reps yet. Add your first team member!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reps.map((rep) => {
            const isOpen = settingsOpen === rep.id
            const tab = activeTab[rep.id] ?? 'callqueue'

            return (
              <div key={rep.id} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Rep row */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: identity + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{rep.name}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LEVEL_COLORS[rep.repPhase ?? 1] ?? 'bg-muted text-muted-foreground'}`}>
                          {LEVEL_LABELS[rep.repPhase ?? 1] ?? `Phase ${rep.repPhase}`}
                        </span>
                        {rep.certified && (
                          <span className="bg-warning/15 text-warning text-xs font-semibold px-2 py-0.5 rounded-full">
                            ✦ Certified
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rep.ndaSigned ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive'}`}>
                          {rep.ndaSigned ? '✓ NDA' : '✗ NDA Pending'}
                        </span>
                        {rep.timeclockEnabled && (
                          <span className="bg-accent text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                            Timeclock
                          </span>
                        )}
                        {rep.shift && (
                          <span className="bg-team-creative-soft text-team-creative text-xs font-medium px-2 py-0.5 rounded-full">
                            {SHIFT_LABELS[rep.shift] ?? rep.shift}
                          </span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rep.teamType === 'creative' ? 'bg-team-creative-soft text-team-creative' : 'bg-accent text-primary'}`}>
                          {rep.teamType === 'creative' ? 'Creative Team' : 'Intake Team'}
                        </span>
                        {rep.payrollMethod && (
                          <span className="bg-muted text-muted-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                            {rep.payrollMethod}
                            {rep.hourlyRate != null && ` · $${rep.hourlyRate}/hr`}
                            {rep.commissionPerClose != null && ` · $${rep.commissionPerClose}/close`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {rep.email}
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        {rep.passedRequired}/{rep.totalRequired} modules
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        {rep.attempts.length} attempt{rep.attempts.length !== 1 ? 's' : ''}
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        Joined {format(new Date(rep.created_at), 'M/d/yyyy')}
                      </p>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setHistoryRep(rep)}
                        className="text-xs border border-border hover:bg-muted/50 text-muted-foreground font-medium px-3 py-1.5 rounded-lg transition-colors"
                      >
                        History
                      </button>
                      <button
                        onClick={() => isOpen ? setSettingsOpen(null) : openSettings(rep)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
 isOpen
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/40 text-foreground/90 border-border hover:bg-muted'
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
                  <div className="border-t border-border">
                    {/* Tab bar */}
                    <div className="flex border-b border-border bg-muted/40">
                      {([
                        { key: 'callqueue',    label: 'Call Queue' },
                        { key: 'todos',        label: 'Todos' },
                        { key: 'callreviews',  label: 'Call Reviews' },
                        { key: 'payroll',      label: 'Payroll' },
                        { key: 'retakes',      label: 'Retakes' },
                        { key: 'danger',       label: 'Danger Zone' },
                      ] as { key: SettingsTab; label: string }[]).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => {
                            setActiveTab(t => ({ ...t, [rep.id]: key }))
                            if (key === 'callreviews' && !callNotes[rep.id]) {
                              setCallNotesLoading(rep.id)
                              fetch(`/api/teams/admin/reps/${rep.id}/notes`)
                                .then(r => r.json())
                                .then(d => setCallNotes(prev => ({ ...prev, [rep.id]: d.notes ?? [] })))
                                .catch(() => setCallNotes(prev => ({ ...prev, [rep.id]: [] })))
                                .finally(() => setCallNotesLoading(null))
                            }
                          }}
                          className={`px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
 tab === key
                              ? key === 'danger'
                                ? 'border-destructive text-destructive bg-card'
                                : 'border-primary text-primary bg-card'
                              : 'border-transparent text-muted-foreground hover:text-foreground'
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
                          {/* Team Type */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">Team</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Which team this rep belongs to</p>
                            </div>
                            <div className="flex gap-2">
                              {(['intake', 'creative'] as const).map(t => (
                                <button
                                  key={t}
                                  onClick={async () => {
                                    await fetch(`/api/teams/admin/reps/${rep.id}`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'update_team_type', teamType: t }),
                                    })
                                    setReps(prev => prev.map(r => r.id === rep.id ? { ...r, teamType: t } : r))
                                  }}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
 rep.teamType === t
                                      ? t === 'creative' ? 'bg-team-creative text-primary-foreground border-team-creative' : 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-card text-muted-foreground border-border hover:bg-muted/50'
                                  }`}
                                >
                                  {t === 'intake' ? 'Intake' : 'Creative'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Creative Slug — only for creative reps */}
                          {rep.teamType === 'creative' && (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Creative Slug</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Used to attribute cases (e.g. OGF for Faisal)</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={slugDraft[rep.id] ?? (rep.creativeSlug || '')}
                                  onChange={e => setSlugDraft(d => ({ ...d, [rep.id]: e.target.value.toUpperCase() }))}
                                  placeholder="e.g. OGF"
                                  className="w-24 border border-border rounded-lg px-2.5 py-1.5 text-sm text-center font-mono uppercase focus:outline-none focus:ring-2 focus:ring-team-creative"
                                />
                                <button
                                  onClick={async () => {
                                    setSlugSaving(rep.id)
                                    const slug = slugDraft[rep.id] ?? rep.creativeSlug ?? ''
                                    await fetch(`/api/teams/admin/reps/${rep.id}`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'update_creative_slug', creativeSlug: slug || null }),
                                    })
                                    setReps(prev => prev.map(r => r.id === rep.id ? { ...r, creativeSlug: slug.toUpperCase() || null } : r))
                                    setSlugSaving(null)
                                  }}
                                  disabled={slugSaving === rep.id}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-team-creative text-primary-foreground hover:bg-team-creative disabled:opacity-50 transition-colors"
                                >
                                  {slugSaving === rep.id ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Phase */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">Phase</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Controls which pages this rep can access</p>
                            </div>
                            <div className="flex gap-1.5">
                              {([
                                { value: 1, label: 'Intro', color: 'sky' },
                                { value: 2, label: 'Onboarding', color: 'indigo' },
                                { value: 3, label: 'Active', color: 'emerald' },
                              ] as const).map(({ value, label, color }) => {
                                const isActive = (rep.repPhase ?? 1) === value
                                const activeClass = color === 'sky' ? 'bg-primary text-primary-foreground border-primary' : color === 'indigo' ? 'bg-primary text-primary-foreground border-primary' : 'bg-success text-primary-foreground border-success'
                                return (
                                  <button
                                    key={value}
                                    onClick={async () => {
                                      const res = await fetch(`/api/teams/admin/reps/${rep.id}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'update_phase', phase: value }),
                                      })
                                      const json = await res.json()
                                      if (!res.ok) { alert(`Failed to update phase: ${json.error ?? res.status}`); return }
                                      setReps(prev => prev.map(r => r.id === rep.id ? { ...r, repPhase: value } : r))
                                    }}
                                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${isActive ? activeClass : 'bg-card text-muted-foreground border-border hover:bg-muted/50'}`}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* Timeclock toggle */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">Timeclock Access</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Allow rep to clock in/out</p>
                            </div>
                            <button
                              onClick={() => handleToggleTimeclock(rep.id, rep.timeclockEnabled)}
                              disabled={actionLoading === rep.id + ':timeclock'}
                              className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none disabled:opacity-50 ${rep.timeclockEnabled ? 'bg-primary' : 'bg-border'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${rep.timeclockEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>

                          {/* Level lock override */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">Unlock All Levels</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Skip level progression requirements</p>
                            </div>
                            <button
                              onClick={() => handleToggleLevelsLock(rep.id, rep.levelsUnlocked)}
                              disabled={actionLoading === rep.id + ':levels'}
                              className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none disabled:opacity-50 ${rep.levelsUnlocked ? 'bg-success' : 'bg-border'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${rep.levelsUnlocked ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>

                          {/* Training timer toggle */}
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">Disable Training Timer</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Skip expiry lock on dashboard</p>
                            </div>
                            <button
                              onClick={() => handleToggleTimer(rep.id, rep.timerDisabled)}
                              disabled={actionLoading === rep.id + ':timer'}
                              className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none disabled:opacity-50 ${rep.timerDisabled ? 'bg-warning' : 'bg-border'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow transition-transform ${rep.timerDisabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Shift</label>
                              <select
                                value={shiftDraft[rep.id] ?? ''}
                                onChange={e => setShiftDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">No shift (not in call queue)</option>
                                <option value="morning">Morning — 7AM–12PM PST</option>
                                <option value="afternoon">Afternoon — 12PM–3PM PST</option>
                                <option value="early_evening">Early Evening — 2PM–11PM PST</option>
                                <option value="evening">Evening — 3PM–9PM PST</option>
                                <option value="overnight">Overnight — 9PM–7AM PST</option>
                                <option value="morning_afternoon">Morning + Afternoon — 7AM–3PM PST</option>
                                <option value="afternoon_evening">Afternoon + Evening — 12PM–9PM PST</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                                GHL User IDs
                                <span className="text-muted-foreground font-normal ml-1">(comma-separated)</span>
                              </label>
                              <input
                                type="text"
                                value={ghlDraft[rep.id] ?? ''}
                                onChange={e => setGhlDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                placeholder="e.g. DNj1g2jJWDn, JyJZdMlw3pu"
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setSettingsOpen(null)}
                              className="text-sm border border-border text-muted-foreground px-4 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveCallQueue(rep.id)}
                              disabled={callQueueSaving === rep.id}
                              className="text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                              {callQueueSaving === rep.id ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Todos tab */}
                      {tab === 'todos' && (
                        <div className="space-y-4">
                          <p className="text-xs text-muted-foreground">Choose what this rep sees in their Todos page.</p>
                          <div className="flex flex-col gap-3">
                            {[
                              { value: 'call_queue', label: 'Call Queue', desc: 'Rep sees No Response, Follow Up, and Chase leads for their shift.' },
                              { value: 'call_listener', label: 'Call Listener', desc: 'Rep sees signed cases to listen to and write notes on the call flow.' },
                            ].map(opt => {
                              const isActive = (rep.todoMode ?? 'call_queue') === opt.value
                              return (
                                <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
 isActive ? 'border-primary/30 bg-accent' : 'border-border bg-card hover:bg-muted/50'
                                }`}>
                                  <input
                                    type="radio"
                                    name={`todoMode-${rep.id}`}
                                    value={opt.value}
                                    checked={isActive}
                                    onChange={async () => {
                                      await fetch(`/api/teams/admin/reps/${rep.id}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'update_todo_mode', todoMode: opt.value }),
                                      })
                                      setReps(prev => prev.map(r => r.id === rep.id ? { ...r, todoMode: opt.value } : r))
                                    }}
                                    className="mt-0.5 text-primary"
                                  />
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Call Reviews tab */}
                      {tab === 'callreviews' && (
                        <div className="space-y-3">
                          {callNotesLoading === rep.id ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
                          ) : !callNotes[rep.id] || callNotes[rep.id].length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">No call notes submitted yet.</p>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground">{callNotes[rep.id].length} note{callNotes[rep.id].length !== 1 ? 's' : ''} submitted</p>
                              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                                {callNotes[rep.id].map(note => (
                                  <div key={note.id} className="bg-muted/40 rounded-lg border border-border p-4">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <p className="text-sm font-semibold text-foreground">{note.contactName}</p>
                                      <p className="text-xs text-muted-foreground shrink-0">
                                        {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                      </p>
                                    </div>
                                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{note.notes}</p>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Payroll tab */}
                      {tab === 'payroll' && (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Payroll Method</label>
                              <select
                                value={payrollMethodDraft[rep.id] ?? ''}
                                onChange={e => setPayrollMethodDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">Select method</option>
                                {PAYROLL_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Payment Structure</label>
                              <select
                                value={payStructureDraft[rep.id] ?? ''}
                                onChange={e => setPayStructureDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              >
                                <option value="">Not set</option>
                                <option value="hourly">Hourly</option>
                                <option value="per_close">Per Close (Commission)</option>
                              </select>
                            </div>
                          </div>

                          {payStructureDraft[rep.id] === 'hourly' && (
                            <div className="max-w-xs">
                              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hourly Rate (USD)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={hourlyRateDraft[rep.id] ?? ''}
                                  onChange={e => setHourlyRateDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full border border-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              </div>
                            </div>
                          )}

                          {payStructureDraft[rep.id] === 'per_close' && (
                            <div className="max-w-xs">
                              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Commission per Close (USD)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={commissionDraft[rep.id] ?? ''}
                                  onChange={e => setCommissionDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                                  placeholder="0.00"
                                  className="w-full border border-border rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                              Account / Payment Info
                              <span className="text-muted-foreground font-normal ml-1">(e.g. email, username, or account number)</span>
                            </label>
                            <input
                              type="text"
                              value={payrollInfoDraft[rep.id] ?? ''}
                              onChange={e => setPayrollInfoDraft(d => ({ ...d, [rep.id]: e.target.value }))}
                              placeholder="e.g. john@example.com or @johnsmith"
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setSettingsOpen(null)}
                              className="text-sm border border-border text-muted-foreground px-4 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSavePayroll(rep.id)}
                              disabled={payrollSaving === rep.id}
                              className="text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                              {payrollSaving === rep.id ? 'Saving…' : 'Save Payroll'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Retakes tab */}
                      {tab === 'retakes' && (
                        <div className="space-y-4">
                          <p className="text-xs text-muted-foreground">Select modules to invalidate and send a retake notification to this rep.</p>
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
                                    className="w-4 h-4 rounded border-border text-primary focus:ring-ring"
                                  />
                                  <span className="text-sm text-foreground/90 group-hover:text-muted-foreground">{m.title}</span>
                                </label>
                              )
                            })}
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message to rep <span className="text-muted-foreground font-normal">(optional)</span></label>
                            <textarea
                              rows={2}
                              value={retakeMessage[rep.id] ?? ''}
                              onChange={e => setRetakeMessage(prev => ({ ...prev, [rep.id]: e.target.value }))}
                              placeholder="e.g. Please review the updated guidelines before retaking."
                              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                          </div>
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleRequestRetake(rep.id)}
                              disabled={retakeSaving === rep.id || !(retakeSelected[rep.id]?.size)}
                              className="text-sm bg-warning hover:bg-warning disabled:opacity-40 text-primary-foreground font-medium px-5 py-2 rounded-lg transition-colors"
                            >
                              {retakeSaving === rep.id ? 'Sending…' : `Send Retake Request (${retakeSelected[rep.id]?.size ?? 0} module${(retakeSelected[rep.id]?.size ?? 0) !== 1 ? 's' : ''})`}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Danger Zone tab */}
                      {tab === 'danger' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between py-3 border-b border-border">
                            <div>
                              <p className="text-sm font-medium text-foreground">Force Retake</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Invalidate all passing attempts — rep must redo training</p>
                            </div>
                            <button
                              onClick={() => handleForceRetake(rep.id)}
                              disabled={actionLoading === rep.id + ':retake'}
                              className="text-xs font-semibold border border-warning/30 bg-warning/10 hover:bg-warning/10 text-warning px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                              {actionLoading === rep.id + ':retake' ? 'Working…' : 'Force Retake'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between py-3 border-b border-border">
                            <div>
                              <p className="text-sm font-medium text-foreground">Reset Password</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Send a password reset link to their email</p>
                            </div>
                            <button
                              onClick={() => handleResetPassword(rep.id)}
                              disabled={actionLoading === rep.id + ':reset'}
                              className="text-xs font-semibold border border-border hover:bg-muted/50 text-foreground/90 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                            >
                              {actionLoading === rep.id + ':reset' ? 'Sending…' : 'Send Reset Email'}
                            </button>
                          </div>
                          <div className="flex items-center justify-between py-3">
                            <div>
                              <p className="text-sm font-medium text-destructive">Delete Rep</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Permanently remove this rep and all their data</p>
                            </div>
                            <button
                              onClick={() => handleDeleteRep(rep.id, rep.name)}
                              disabled={actionLoading === rep.id + ':delete'}
                              className="text-xs font-semibold border border-destructive/30 bg-destructive/10 hover:bg-destructive/15 text-destructive px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shrink-0"
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
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">{historyRep.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{historyRep.email}</p>
              </div>
              <button onClick={() => setHistoryRep(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {historyRep.attempts.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No attempts yet.</p>
              ) : (
                <div className="space-y-2">
                  {historyRep.attempts.map((attempt) => {
                    const mins = Math.floor(attempt.contentViewSeconds / 60)
                    const secs = attempt.contentViewSeconds % 60
                    const viewTime = attempt.contentViewSeconds > 0
                      ? mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
                      : null
                    return (
                      <div key={attempt.id} className="bg-muted/40 rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{attempt.moduleTitle}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(attempt.createdAt), 'M/d/yyyy')} · Attempt #{attempt.attemptNumber}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground/90">{attempt.score}%</p>
                            <p className={`text-xs font-medium ${attempt.passed ? 'text-success' : 'text-destructive'}`}>
                              {attempt.passed ? 'Passed' : 'Failed'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2 flex-wrap items-center">
                          {viewTime && (
                            <span className="text-xs bg-accent text-primary border border-primary/25 rounded px-2 py-0.5">
                              Viewed: {viewTime}
                            </span>
                          )}
                          {attempt.tabLeaveCount > 0 && (
                            <span className="text-xs bg-destructive/10 text-destructive border border-destructive/25 rounded px-2 py-0.5">
                              Left tab {attempt.tabLeaveCount}×
                            </span>
                          )}
                          <button
                            onClick={() => openBreakdown(attempt.id)}
                            className="text-xs text-primary hover:text-primary border border-primary/30 rounded px-2 py-0.5 hover:bg-accent transition-colors"
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
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={() => setHistoryRep(null)}
                className="w-full bg-muted hover:bg-muted text-foreground/90 text-sm font-medium rounded-lg py-2.5 transition-colors"
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
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Add New Rep</h2>
              <button onClick={() => { setShowAddDialog(false); setAddError('') }} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddRep} className="px-5 py-5 space-y-4">
              {addError && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-3 py-2.5">{addError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-2">Team</label>
                <div className="flex gap-3">
                  {(['intake', 'creative'] as const).map(t => (
                    <label key={t} className={`flex-1 flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${addTeamType === t ? (t === 'creative' ? 'border-team-creative/30 bg-team-creative-soft' : 'border-primary/30 bg-accent') : 'border-border'}`}>
                      <input type="radio" name="addTeamType" value={t} checked={addTeamType === t} onChange={() => setAddTeamType(t)} className="text-primary" />
                      <span className="text-sm font-medium text-foreground">{t === 'intake' ? 'Intake Team' : 'Creative Team'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddDialog(false); setAddError('') }}
                  className="flex-1 border border-border hover:bg-muted/50 text-foreground/90 text-sm font-medium rounded-lg py-2.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold rounded-lg py-2.5 transition-colors"
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
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Attempt Breakdown</h2>
              <button onClick={() => setBreakdownAttemptId(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              {breakdownLoading ? (
                <p className="text-muted-foreground text-sm text-center py-8">Loading...</p>
              ) : breakdownAnswers.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No answer details available.</p>
              ) : (
                <div className="space-y-3">
                  {breakdownAnswers.map((answer: any, idx: number) => {
                    const isCorrect = answer.options?.is_correct === true
                    return (
                      <div key={answer.id} className={`rounded-lg border p-3 ${isCorrect ? 'border-success/30 bg-success/10' : 'border-destructive/30 bg-destructive/10'}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-sm font-bold mt-0.5 shrink-0 ${isCorrect ? 'text-success' : 'text-destructive'}`}>
                            {isCorrect ? '✓' : '✗'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              Q{idx + 1}: {answer.questions?.question_text ?? 'Unknown question'}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Answered: <span className={isCorrect ? 'text-success font-medium' : 'text-destructive font-medium'}>
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
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={() => setBreakdownAttemptId(null)}
                className="w-full bg-muted hover:bg-muted text-foreground/90 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      </PageBody>
    </>
  )
}
