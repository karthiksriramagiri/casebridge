'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ModuleList from './ModuleList'
import { PageHeader, PageBody, TeamToggle } from '@/app/teams/_components/shared'

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
    <>
      <PageHeader
        title="Modules"
        description="Open a module to edit its details or manage its questions."
        actions={<TeamToggle value={team} onChange={setTeam} />}
      />
      <PageBody>

      {loading ? (
        <div className="bg-card rounded-xl border border-border px-6 py-12 text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      ) : (
        <ModuleList modules={modules} />
      )}
      </PageBody>
    </>
  )
}
