import { createClient } from '@/lib/supabase/server'
import ProgramsClient from '../programs/ProgramsClient'

export default async function CreativeProgramsPage() {
  const supabase = await createClient()

  const programsRes = await supabase
    .from('programs')
    .select('*')
    .eq('team_type', 'creative')
    .order('position', { ascending: true })

  const { data: programs } = programsRes.error
    ? await supabase.from('programs').select('*').eq('team_type', 'creative').order('created_at', { ascending: true })
    : programsRes

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
    .eq('team_type', 'creative')
    .order('title', { ascending: true })

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
        <h1 className="text-xl font-bold text-gray-900">Creative Programs</h1>
        <p className="text-sm text-gray-500 mt-1">Organize creative modules into training programs for the creative team.</p>
      </div>
      <ProgramsClient programs={enrichedPrograms} allModules={allModules ?? []} defaultTeamType="creative" />
    </div>
  )
}
