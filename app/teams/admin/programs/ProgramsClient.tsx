'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Module {
  id: string
  title: string
  is_active: boolean
}

interface Program {
  id: string
  name: string
  description: string
  position: number
  team_type: string
  modules: Module[]
}

interface Props {
  programs: Program[]
  allModules: Module[]
  defaultTeamType?: 'intake' | 'creative'
}

export default function ProgramsClient({ programs: initialPrograms, allModules, defaultTeamType = 'intake' }: Props) {
  const [programs, setPrograms] = useState(
    [...initialPrograms].sort((a, b) => a.position - b.position)
  )
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editProgram, setEditProgram] = useState<Program | null>(null)
  const [loading, setLoading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Form state — ordered list of module IDs
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formTeamType, setFormTeamType] = useState<'intake' | 'creative'>(defaultTeamType)
  const [formModuleOrder, setFormModuleOrder] = useState<string[]>([])

  function openCreate() {
    setFormName('')
    setFormDescription('')
    setFormTeamType(defaultTeamType)
    setFormModuleOrder([])
    setError('')
    setShowCreateDialog(true)
    setEditProgram(null)
  }

  function openEdit(program: Program) {
    setFormName(program.name)
    setFormDescription(program.description)
    setFormTeamType((program.team_type as 'intake' | 'creative') ?? 'intake')
    setFormModuleOrder(program.modules.map((m) => m.id))
    setError('')
    setEditProgram(program)
    setShowCreateDialog(true)
  }

  // Module ordering in dialog
  function moveModuleUp(idx: number) {
    if (idx === 0) return
    setFormModuleOrder((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  function moveModuleDown(idx: number) {
    setFormModuleOrder((prev) => {
      if (idx === prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }

  function removeModule(moduleId: string) {
    setFormModuleOrder((prev) => prev.filter((id) => id !== moduleId))
  }

  function addModule(moduleId: string) {
    setFormModuleOrder((prev) => [...prev, moduleId])
  }

  // Program ordering
  async function moveProgram(idx: number, direction: 'up' | 'down') {
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= programs.length) return

    const next = [...programs]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    // Reassign positions by array index
    const updated = next.map((p, i) => ({ ...p, position: i }))
    setPrograms(updated)

    setReordering(true)
    try {
      const supabase = createClient()
      await Promise.all(
        [updated[idx], updated[swapIdx]].map((p) =>
          supabase.from('programs').update({ position: p.position }).eq('id', p.id)
        )
      )
    } catch {
      // revert
      setPrograms(programs)
      setMessage('Error: failed to save order.')
    } finally {
      setReordering(false)
    }
  }

  async function handleSave() {
    if (!formName.trim()) {
      setError('Program name is required.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()

      if (editProgram) {
        const { error: updateError } = await supabase
          .from('programs')
          .update({ name: formName.trim(), description: formDescription.trim(), team_type: formTeamType })
          .eq('id', editProgram.id)
        if (updateError) throw updateError

        await supabase.from('program_modules').delete().eq('program_id', editProgram.id)
        if (formModuleOrder.length > 0) {
          await supabase.from('program_modules').insert(
            formModuleOrder.map((mId, i) => ({
              program_id: editProgram.id,
              module_id: mId,
              position: i,
            }))
          )
        }

        const orderedModules = formModuleOrder
          .map((id) => allModules.find((m) => m.id === id))
          .filter(Boolean) as Module[]
        setPrograms((prev) =>
          prev.map((p) =>
            p.id === editProgram.id
              ? { ...p, name: formName.trim(), description: formDescription.trim(), team_type: formTeamType, modules: orderedModules }
              : p
          )
        )
        setMessage('Program updated.')
      } else {
        const nextPosition = programs.length
        const { data: newProgram, error: createError } = await supabase
          .from('programs')
          .insert({ name: formName.trim(), description: formDescription.trim(), position: nextPosition, team_type: formTeamType })
          .select()
          .single()
        if (createError) throw createError

        if (formModuleOrder.length > 0) {
          await supabase.from('program_modules').insert(
            formModuleOrder.map((mId, i) => ({
              program_id: newProgram.id,
              module_id: mId,
              position: i,
            }))
          )
        }

        const orderedModules = formModuleOrder
          .map((id) => allModules.find((m) => m.id === id))
          .filter(Boolean) as Module[]
        setPrograms((prev) => [...prev, { ...newProgram, team_type: formTeamType, modules: orderedModules }])
        setMessage('Program created.')
      }

      setShowCreateDialog(false)
      setEditProgram(null)
    } catch (err: any) {
      setError(err.message || 'An error occurred.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(programId: string, programName: string) {
    if (!confirm(`Delete program "${programName}"? This cannot be undone.`)) return
    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase.from('programs').delete().eq('id', programId)
      if (deleteError) throw deleteError
      setPrograms((prev) => prev.filter((p) => p.id !== programId))
      setMessage('Program deleted.')
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    }
  }

  const availableModules = allModules.filter((m) => !formModuleOrder.includes(m.id))

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted-foreground">
          Use ↑↓ to reorder programs. Edit a program to reorder its modules.
        </p>
        <button
          onClick={openCreate}
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span> Create Program
        </button>
      </div>

      {message && (
        <div className={`mb-4 text-sm font-medium px-4 py-3 rounded-lg ${
 message.startsWith('Error') ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-success/10 text-success border border-success/30'
        }`}>
          {message}
        </div>
      )}

      {programs.length === 0 ? (
        <div className="bg-card rounded-xl border border-border px-6 py-12 text-center">
          <p className="text-muted-foreground">No programs yet. Create your first training program!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programs.map((program, idx) => (
            <div key={program.id} className="bg-card rounded-xl border border-border p-5 flex items-start gap-3">
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                <button
                  onClick={() => moveProgram(idx, 'up')}
                  disabled={idx === 0 || reordering}
                  className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveProgram(idx, 'down')}
                  disabled={idx === programs.length - 1 || reordering}
                  className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs"
                  title="Move down"
                >
                  ↓
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground/50">#{idx + 1}</span>
                      <h3 className="font-bold text-foreground text-base">{program.name}</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
 program.team_type === 'creative'
                          ? 'bg-team-creative-soft text-team-creative'
                          : 'bg-accent text-primary'
                      }`}>
                        {program.team_type === 'creative' ? 'Creative' : 'Intake'}
                      </span>
                    </div>
                    {program.description && (
                      <p className="text-sm text-muted-foreground mt-1">{program.description}</p>
                    )}
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Modules ({program.modules.length}) — in order
                      </p>
                      {program.modules.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No modules assigned.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {program.modules.map((mod, modIdx) => (
                            <span
                              key={mod.id}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
 mod.is_active
                                  ? 'bg-accent text-primary border-primary/30'
                                  : 'bg-muted text-muted-foreground border-border'
                              }`}
                            >
                              {modIdx + 1}. {mod.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(program)}
                      className="text-sm border border-border hover:bg-muted/50 text-foreground/90 font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(program.id, program.name)}
                      className="text-sm border border-destructive/30 bg-destructive/10 hover:bg-destructive/15 text-destructive font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">
                {editProgram ? 'Edit Program' : 'Create Program'}
              </h2>
              <button
                onClick={() => { setShowCreateDialog(false); setEditProgram(null); setError('') }}
                className="text-muted-foreground hover:text-foreground text-xl"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg px-3 py-2.5">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">Program Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="e.g. Onboarding Track"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Optional description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-1.5">Team</label>
                <div className="flex gap-2">
                  {(['intake', 'creative'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormTeamType(t)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
 formTeamType === t
                          ? t === 'creative' ? 'bg-team-creative text-primary-foreground border-team-creative' : 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border hover:border-border'
                      }`}
                    >
                      {t === 'intake' ? 'Intake Team' : 'Creative Team'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ordered module list */}
              <div>
                <label className="block text-sm font-medium text-foreground/90 mb-2">
                  Module Order
                  <span className="text-xs font-normal text-muted-foreground ml-1">— use ↑↓ to reorder</span>
                </label>
                {formModuleOrder.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg px-4 py-5 text-center text-sm text-muted-foreground">
                    No modules added. Select from the list below.
                  </div>
                ) : (
                  <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                    {formModuleOrder.map((modId, idx) => {
                      const mod = allModules.find((m) => m.id === modId)
                      if (!mod) return null
                      return (
                        <div key={modId} className="flex items-center gap-2 px-3 py-2.5 bg-card hover:bg-muted/50">
                          <span className="text-xs font-bold text-muted-foreground/50 w-5 text-center shrink-0">{idx + 1}</span>
                          <span className={`flex-1 text-sm min-w-0 truncate ${mod.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {mod.title}
                            {!mod.is_active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => moveModuleUp(idx)}
                              disabled={idx === 0}
                              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed text-xs transition-colors"
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveModuleDown(idx)}
                              disabled={idx === formModuleOrder.length - 1}
                              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed text-xs transition-colors"
                              title="Move down"
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => removeModule(modId)}
                              className="w-6 h-6 flex items-center justify-center rounded text-destructive/70 hover:text-destructive hover:bg-destructive/10 text-xs transition-colors"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Available modules to add */}
              {availableModules.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground/90 mb-2">Add Modules</label>
                  <div className="border border-border rounded-lg divide-y divide-border overflow-hidden max-h-48 overflow-y-auto">
                    {availableModules.map((mod) => (
                      <div key={mod.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/50">
                        <span className={`text-sm ${mod.is_active ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {mod.title}
                          {!mod.is_active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
                        </span>
                        <button
                          onClick={() => addModule(mod.id)}
                          className="text-xs font-semibold text-primary hover:text-primary border border-primary/30 hover:border-primary px-2 py-0.5 rounded transition-colors"
                        >
                          + Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-border">
              <button
                onClick={() => { setShowCreateDialog(false); setEditProgram(null); setError('') }}
                className="flex-1 border border-border hover:bg-muted/50 text-foreground/90 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-semibold rounded-lg py-2.5 transition-colors"
              >
                {loading ? 'Saving...' : editProgram ? 'Save Changes' : 'Create Program'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
