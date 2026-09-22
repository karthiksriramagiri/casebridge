import { redirect } from 'next/navigation'
import { getVenuUser, venuAdmin, embedded } from '../_lib/auth'
import AdminClient from './AdminClient'
import DrawMix from './DrawMix'
import { loadWeights, WEIGHT_FIELDS, DEFAULT_WEIGHTS } from '../_lib/draw-weights'
import { projectMix } from '@/app/api/venu/admin/weights/mix/route'

export const dynamic = 'force-dynamic'

export default async function VenuAdmin() {
  const user = await getVenuUser()
  if (!user) redirect('/venu/login')
  if (user.role !== 'admin') redirect('/venu')

  const db = venuAdmin()

  const [weights, mix] = await Promise.all([loadWeights(), projectMix()])

  const [{ data: profiles }, { data: sessions }] = await Promise.all([
    db.from('profiles').select('id, name, role, venu_setter, venu_closer').order('name'),
    db.from('venu_sessions')
      .select('id, user_id, rep_name, scenario_title, scenario_category, mode, status, started_at, duration_sec, venu_scores(overall_score, criteria_score, empathy_score, nuance_caught)')
      .eq('track', 'setter')
      .order('started_at', { ascending: false })
      .limit(200),
  ])

  const rows = sessions ?? []

  // Roll each rep's test results up — practice runs shouldn't move the numbers.
  const stats = new Map<string, { tests: number; practice: number; avg: number | null; criteria: number | null; empathy: number | null; nuance: number | null; last: string | null }>()
  for (const p of profiles ?? []) {
    const mine = rows.filter((r: any) => r.user_id === p.id)
    const scoredTests = mine.filter((r: any) => r.mode === 'test' && embedded<any>(r.venu_scores))
    const avgOf = (pick: (s: any) => number | null) => {
      const vals = scoredTests.map((r: any) => pick(embedded<any>(r.venu_scores))).filter((v: any) => typeof v === 'number')
      return vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null
    }
    stats.set(p.id, {
      tests: scoredTests.length,
      practice: mine.filter((r: any) => r.mode === 'practice').length,
      avg: avgOf((s) => s.overall_score),
      criteria: avgOf((s) => s.criteria_score),
      empathy: avgOf((s) => s.empathy_score),
      nuance: scoredTests.length
        ? Math.round((scoredTests.filter((r: any) => embedded<any>(r.venu_scores)?.nuance_caught).length / scoredTests.length) * 100)
        : null,
      last: mine[0]?.started_at ?? null,
    })
  }

  return (
    <>
    <AdminClient
      reps={(profiles ?? []).map((p: any) => ({
        id: p.id,
        name: p.name || '(no name)',
        role: p.role,
        setter: p.venu_setter === true,
        closer: p.venu_closer === true,
        ...stats.get(p.id)!,
      }))}
      sessions={rows.map((r: any) => ({
        id: r.id,
        repName: r.rep_name,
        userId: r.user_id,
        title: r.scenario_title,
        category: r.scenario_category,
        mode: r.mode,
        status: r.status,
        startedAt: r.started_at,
        durationSec: r.duration_sec,
        score: embedded<any>(r.venu_scores)?.overall_score ?? null,
        criteria: embedded<any>(r.venu_scores)?.criteria_score ?? null,
        empathy: embedded<any>(r.venu_scores)?.empathy_score ?? null,
        nuanceCaught: embedded<any>(r.venu_scores)?.nuance_caught ?? null,
      }))}
    />
    <div className="venu-wrap" style={{ maxWidth: 1080, paddingTop: 0 }}>
      <DrawMix
        fields={WEIGHT_FIELDS as any}
        initial={weights as any}
        defaults={DEFAULT_WEIGHTS as any}
        buckets={mix}
      />
    </div>
    </>
  )
}
