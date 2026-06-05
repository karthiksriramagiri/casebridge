'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UrgentTask {
  id: string
  title: string
  description: string | null
  assigned_to: 'all' | 'pablo' | 'ziyad'
  created_at: string
}

const ASSIGN_LABELS: Record<string, string> = {
  all:   'Both workers',
  pablo: 'Pablo only',
  ziyad: 'Ziyad only',
}

export default function UrgentTasksClient({ initialTasks }: { initialTasks: UrgentTask[] }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<UrgentTask[]>(initialTasks)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState<'all' | 'pablo' | 'ziyad'>('all')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('urgent_tasks')
      .insert({ title: title.trim(), description: description.trim() || null, assigned_to: assignedTo })
      .select()
      .single()

    if (err) {
      setError(err.message)
    } else if (data) {
      setTasks(prev => [...prev, data])
      setTitle('')
      setDescription('')
      setAssignedTo('all')
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const { error: err } = await supabase.from('urgent_tasks').delete().eq('id', id)
    if (err) {
      setError(err.message)
    } else {
      setTasks(prev => prev.filter(t => t.id !== id))
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Urgent Task</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Call back John Smith ASAP"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional context or instructions..."
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assign to</label>
            <div className="flex gap-2">
              {(['all', 'pablo', 'ziyad'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAssignedTo(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    assignedTo === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {ASSIGN_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {saving ? 'Adding…' : 'Add Task'}
          </button>
        </form>
      </div>

      {/* Task list */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Active Tasks ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center">
            <p className="text-gray-400 text-sm">No urgent tasks right now</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className="bg-white rounded-xl border border-amber-200 px-5 py-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      {ASSIGN_LABELS[task.assigned_to]}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Added {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(task.id)}
                  disabled={deletingId === task.id}
                  className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40 transition-colors"
                >
                  {deletingId === task.id ? '…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
