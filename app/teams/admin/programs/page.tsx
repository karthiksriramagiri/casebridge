import { createClient } from '@/lib/supabase/server'
import ProgramsClient from './ProgramsClient'

export default async function ProgramsPage() {
  const supabase = await createClient()

  const { data: programs } = await supabase
    .from('programs')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: programModules } = await supabase
    .from('program_modules')
    .select(`
      program_id,
      module_id,
      position,
      modules(id, title, is_active)
    `)
    .order('position', { ascending: true })

  const { data: allModules } = await supabase
    .from('modules')
    .select('id, title, is_active')
    .order('title', { ascending: true })

  // Group modules by program
  const modulesByProgram: Record<string, any[]> = {}
  for (const pm of programModules ?? []) {
    if (!modulesByProgram[pm.program_id]) modulesByProgram[pm.program_id] = []
    if (pm.modules) modulesByProgram[pm.program_id].push(pm.modules)
  }

  const enrichedPrograms = (programs ?? []).map((p) => ({
    ...p,
    modules: modulesByProgram[p.id] ?? [],
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Training Programs</h1>
        <p className="text-sm text-gray-500 mt-1">Organize modules into structured training programs.</p>
      </div>
      <ProgramsClient programs={enrichedPrograms} allModules={allModules ?? []} />
    </div>
  )
}
