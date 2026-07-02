import { createClient } from '@/lib/supabase/server'
import ProgramsClient from './ProgramsClient'
import Link from 'next/link'

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>
}) {
  const params = await searchParams
  const team = params.team === 'creative' ? 'creative' : 'intake'
  const supabase = await createClient()

  const teamFilter = team === 'creative' ? 'team_type.eq.creative' : 'team_type.eq.intake,team_type.is.null'

  const programsRes = await supabase
    .from('programs')
    .select('*')
    .or(teamFilter)
    .order('position', { ascending: true })

  const { data: programs } = programsRes.error
    ? await supabase.from('programs').select('*').or(teamFilter).order('created_at', { ascending: true })
    : programsRes

  const { data: programModules } = await supabase
    .from('program_modules')
    .select(`program_id, module_id, position, modules(id, title, is_active)`)
    .order('position', { ascending: true })

  // Only show modules matching this team type in the picker
  const { data: allModules } = await supabase
    .from('modules')
    .select('id, title, is_active')
    .or(team === 'creative' ? 'team_type.eq.creative' : 'team_type.eq.intake,team_type.is.null')
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
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Programs</h1>
          <p className="text-sm text-gray-500 mt-1">Organize modules into structured training programs.</p>
        </div>

        {/* Team toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <Link
            href="/teams/admin/programs?team=intake"
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              team === 'intake' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Intake
          </Link>
          <Link
            href="/teams/admin/programs?team=creative"
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              team === 'creative' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Creative
          </Link>
        </div>
      </div>

      <ProgramsClient programs={enrichedPrograms} allModules={allModules ?? []} defaultTeamType={team} />
    </div>
  )
}
