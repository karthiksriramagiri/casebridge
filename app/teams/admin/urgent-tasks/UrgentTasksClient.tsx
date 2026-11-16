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
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground/90 mb-4">Add Urgent Task</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Call back John Smith ASAP"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Additional context or instructions..."
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Assign to</label>
            <div className="flex gap-2">
              {(['all', 'pablo', 'ziyad'] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAssignedTo(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
 assignedTo === opt
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-primary'
                  }`}
                >
                  {ASSIGN_LABELS[opt]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {saving ? 'Adding…' : 'Add Task'}
          </button>
        </form>
      </div>

      {/* Task list */}
      <div>
        <h2 className="text-sm font-semibold text-foreground/90 mb-3">Active Tasks ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <div className="bg-card rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="text-muted-foreground text-sm">No urgent tasks right now</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div
                key={task.id}
                className="bg-card rounded-xl border border-warning/30 px-5 py-4 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-1.5 py-0.5 rounded-full">
                      {ASSIGN_LABELS[task.assigned_to]}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Added {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(task.id)}
                  disabled={deletingId === task.id}
                  className="flex-shrink-0 text-xs text-destructive hover:text-destructive font-medium disabled:opacity-40 transition-colors"
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
