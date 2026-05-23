import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'

export default async function RetakesPage() {
  const supabase = await createClient()

  const { data: retakes } = await supabase
    .from('attempts')
    .select(`
      id,
      score,
      passed,
      attempt_number,
      created_at,
      user_id,
      module_id,
      profiles!attempts_user_id_fkey(id, name),
      modules!attempts_module_id_fkey(id, title)
    `)
    .gt('attempt_number', 1)
    .eq('is_invalidated', false)
    .order('created_at', { ascending: false })

  // For each retake, fetch the 1st attempt score
  const firstAttemptScores: Record<string, number | null> = {}
  if (retakes && retakes.length > 0) {
    const uniquePairs = [
      ...new Map(
        retakes.map((r: any) => [`${r.user_id}:${r.module_id}`, { userId: r.user_id, moduleId: r.module_id }])
      ).values(),
    ]

    for (const { userId, moduleId } of uniquePairs) {
      const { data: firstAttempt } = await supabase
        .from('attempts')
        .select('score')
        .eq('user_id', userId)
        .eq('module_id', moduleId)
        .eq('attempt_number', 1)
        .maybeSingle()

      firstAttemptScores[`${userId}:${moduleId}`] = firstAttempt?.score ?? null
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <span>🔁</span>
          <span className="text-red-600">Retake Alerts</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Reps who have taken a quiz more than once. Review and follow up as needed.
        </p>
      </div>

      {(!retakes || retakes.length === 0) ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-gray-600 font-medium">No retakes yet!</p>
          <p className="text-gray-400 text-sm mt-1">All reps have passed on their first attempt.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(retakes ?? []).map((retake: any) => {
            const repName = retake.profiles?.name ?? 'Unknown Rep'
            const moduleTitle = retake.modules?.title ?? 'Unknown Module'
            const firstScore = firstAttemptScores[`${retake.user_id}:${retake.module_id}`]
            const dateStr = format(new Date(retake.created_at), "MMM d, yyyy 'at' h:mm a")

            return (
              <div
                key={retake.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{repName}</span>
                    <span className="text-gray-400 text-sm">&lt;{retake.user_id.slice(0, 8)}...&gt;</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-gray-600">
                    <span className="font-medium text-gray-800">{moduleTitle}</span>
                    <span className="text-gray-300">·</span>
                    <span>Attempt #{retake.attempt_number}</span>
                    <span className="text-gray-300">·</span>
                    <span>{retake.score}%</span>
                    <span className="text-gray-300">·</span>
                    <span className={retake.passed ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                      {retake.passed ? 'Passed' : 'Failed'}
                    </span>
                    {firstScore !== null && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-500">1st attempt: {firstScore}%</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">{dateStr}</p>
                </div>

                <div className="shrink-0">
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1.5 rounded-lg uppercase tracking-wide">
                    Retake #{retake.attempt_number}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
