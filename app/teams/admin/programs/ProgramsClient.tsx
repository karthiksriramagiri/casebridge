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
  created_at: string
  modules: Module[]
}

interface Props {
  programs: Program[]
  allModules: Module[]
}

export default function ProgramsClient({ programs: initialPrograms, allModules }: Props) {
  const [programs, setPrograms] = useState(initialPrograms)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editProgram, setEditProgram] = useState<Program | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSelectedModules, setFormSelectedModules] = useState<string[]>([])

  function openCreate() {
    setFormName('')
    setFormDescription('')
    setFormSelectedModules([])
    setError('')
    setShowCreateDialog(true)
    setEditProgram(null)
  }

  function openEdit(program: Program) {
    setFormName(program.name)
    setFormDescription(program.description)
    setFormSelectedModules(program.modules.map((m) => m.id))
    setError('')
    setEditProgram(program)
    setShowCreateDialog(true)
  }

  function toggleModule(moduleId: string) {
    setFormSelectedModules((prev) =>
      prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]
    )
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
        // Update
        const { error: updateError } = await supabase
          .from('programs')
          .update({ name: formName.trim(), description: formDescription.trim() })
          .eq('id', editProgram.id)
        if (updateError) throw updateError

        // Remove old modules
        await supabase.from('program_modules').delete().eq('program_id', editProgram.id)
        // Insert new
        if (formSelectedModules.length > 0) {
          await supabase.from('program_modules').insert(
            formSelectedModules.map((mId, i) => ({
              program_id: editProgram.id,
              module_id: mId,
              position: i,
            }))
          )
        }

        const updatedModules = allModules.filter((m) => formSelectedModules.includes(m.id))
        setPrograms((prev) =>
          prev.map((p) =>
            p.id === editProgram.id
              ? { ...p, name: formName.trim(), description: formDescription.trim(), modules: updatedModules }
              : p
          )
        )
        setMessage('Program updated.')
      } else {
        // Create
        const { data: newProgram, error: createError } = await supabase
          .from('programs')
          .insert({ name: formName.trim(), description: formDescription.trim() })
          .select()
          .single()
        if (createError) throw createError

        if (formSelectedModules.length > 0) {
          await supabase.from('program_modules').insert(
            formSelectedModules.map((mId, i) => ({
              program_id: newProgram.id,
              module_id: mId,
              position: i,
            }))
          )
        }

        const selectedModuleObjects = allModules.filter((m) => formSelectedModules.includes(m.id))
        setPrograms((prev) => [{ ...newProgram, modules: selectedModuleObjects }, ...prev])
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

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={openCreate}
          className="bg-[#0f1e3c] hover:bg-[#1a3060] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          <span>+</span> Create Program
        </button>
      </div>

      {message && (
        <div className={`mb-4 text-sm font-medium px-4 py-3 rounded-lg ${
          message.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {message}
        </div>
      )}

      {programs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-500">No programs yet. Create your first training program!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => (
            <div key={program.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-base">{program.name}</h3>
                  {program.description && (
                    <p className="text-sm text-gray-500 mt-1">{program.description}</p>
                  )}
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                      Modules ({program.modules.length})
                    </p>
                    {program.modules.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">No modules assigned.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {program.modules.map((mod) => (
                          <span
                            key={mod.id}
                            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
                              mod.is_active
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {mod.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(program)}
                    className="text-sm border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(program.id, program.name)}
                    className="text-sm border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 font-medium px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editProgram ? 'Edit Program' : 'Create Program'}
              </h2>
              <button
                onClick={() => { setShowCreateDialog(false); setEditProgram(null); setError('') }}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Program Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Onboarding Track"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modules</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {allModules.length === 0 ? (
                    <p className="text-sm text-gray-400">No modules available.</p>
                  ) : (
                    allModules.map((mod) => (
                      <label key={mod.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded p-1 -mx-1">
                        <input
                          type="checkbox"
                          checked={formSelectedModules.includes(mod.id)}
                          onChange={() => toggleModule(mod.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`text-sm ${mod.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                          {mod.title}
                        </span>
                        {!mod.is_active && (
                          <span className="text-xs text-gray-400">(inactive)</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => { setShowCreateDialog(false); setEditProgram(null); setError('') }}
                className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg py-2.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 bg-[#0f1e3c] hover:bg-[#1a3060] disabled:opacity-50 text-white text-sm font-semibold rounded-lg py-2.5 transition-colors"
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
