import { createClient } from '@/lib/supabase/server'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'
import UrgentTasksClient from './UrgentTasksClient'

export default async function UrgentTasksPage() {
  const supabase = await createClient()

  const { data: tasks } = await supabase
    .from('urgent_tasks')
    .select('id, title, description, assigned_to, created_at')
    .order('created_at', { ascending: true })

  return (
    <>
      <PageHeader
        title="Urgent Tasks"
        description="These sit above everything else in a worker's call queue."
      />
      <PageBody>
        <div className="max-w-xl">
          <UrgentTasksClient initialTasks={tasks ?? []} />
        </div>
      </PageBody>
    </>
  )
}
