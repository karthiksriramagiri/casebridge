'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ModuleList from './ModuleList'

export default function ModulesPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTeam = searchParams.get('team') === 'creative' ? 'creative' : 'intake'
  const [team, setTeam] = useState<'intake' | 'creative'>(initialTeam)
  const [modules, setModules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    router.replace(`/teams/admin/modules?team=${team}`, { scroll: false })
  }, [team, router])

  useEffect(() => {
    setLoading(true)
    const supabase = createClient()

    async function load() {
      // Fetch active exam IDs to exclude them from this list
      const { data: examConfigs } = await supabase
        .from('exam_config')
        .select('value')
        .in('key', ['active_exam_id', 'active_exam_id_creative'])

      const examModuleIds = new Set((examConfigs ?? []).map((r: any) => r.value).filter(Boolean))

      const { data: mods } = await supabase
        .from('modules')
        .select('*, questions(id, module_id, question_text, position, options(id, option_text, is_correct, position))')
        .or(team === 'creative' ? 'team_type.eq.creative' : 'team_type.eq.intake,team_type.is.null')
        .order('created_at', { ascending: false })

      const enriched = (mods ?? [])
        .filter((m: any) => !examModuleIds.has(m.id))
        .map((m: any) => {
          const qs = (m.questions ?? []).sort((a: any, b: any) => a.position - b.position)
          return {
            id: m.id,
            title: m.title,
            description: m.description,
            pass_threshold: m.pass_threshold,
            is_required: m.is_required,
            is_active: m.is_active,
            created_at: m.created_at,
            questionCount: qs.length,
            questions: qs.map((q: any) => ({
              ...q,
              options: (q.options ?? []).sort((a: any, b: any) => a.position - b.position),
            })),
          }
        })

      setModules(enriched)
      setLoading(false)
    }

    load()
  }, [team])

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modules</h1>
          <p className="text-sm text-gray-500 mt-1">Click a module to expand, edit details, or manage its questions.</p>
        </div>

        {/* Team toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTeam('intake')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              team === 'intake' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Intake
          </button>
          <button
            onClick={() => setTeam('creative')}
            className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              team === 'creative' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Creative
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center">
          <p className="text-gray-400">Loading...</p>
        </div>
      ) : (
        <ModuleList modules={modules} />
      )}
    </div>
  )
}
