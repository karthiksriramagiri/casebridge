import { createClient } from '@/lib/supabase/server'
import UrgentTasksClient from './UrgentTasksClient'

export default async function UrgentTasksPage() {
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('urgent_tasks')
    .select('id, title, description, assigned_to, created_at')
    .order('created_at', { ascending: true })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Urgent Tasks</h1>
        <p className="text-sm text-gray-500 mt-1">Add tasks that appear at the top of the call queue for workers.</p>
      </div>
      <div className="max-w-xl">
        <UrgentTasksClient initialTasks={tasks ?? []} />
      </div>
    </div>
  )
}
