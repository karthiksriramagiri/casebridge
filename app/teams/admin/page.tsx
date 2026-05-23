import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import AnnouncementForm from './AnnouncementForm'

interface Attempt {
  id: string
  score: number
  passed: boolean
  attempt_number: number
  is_invalidated: boolean
  created_at: string
  user_id: string
  module_id: string
}

interface AttemptWithDetails extends Attempt {
  profiles: { name: string; id: string } | null
  modules: { title: string } | null
  user_email?: string
}

export default async function AdminOverviewPage() {
  const supabase = await createClient()

  // Total reps
  const { count: totalReps } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'rep')

  // All attempts
  const { data: allAttempts } = await supabase
    .from('attempts')
    .select('*')

  const validAttempts = allAttempts ?? []
  const totalAttempts = validAttempts.length
  const totalPassed = validAttempts.filter((a) => a.passed && !a.is_invalidated).length
  const retakesCount = validAttempts.filter((a) => a.attempt_number > 1 && !a.is_invalidated).length
  const avgScore =
    validAttempts.length > 0
      ? (validAttempts.reduce((sum, a) => sum + a.score, 0) / validAttempts.length).toFixed(1)
      : '0.0'

  // Certified count: reps who passed all active required modules
  const { data: requiredModules } = await supabase
    .from('modules')
    .select('id')
    .eq('is_required', true)
    .eq('is_active', true)

  const { data: repProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'rep')

  let certifiedCount = 0
  if (requiredModules && requiredModules.length > 0 && repProfiles) {
    const { data: passingAttempts } = await supabase
      .from('attempts')
      .select('user_id, module_id')
      .eq('passed', true)
      .eq('is_invalidated', false)

    const passingSet = new Set(
      (passingAttempts ?? []).map((a) => `${a.user_id}:${a.module_id}`)
    )

    for (const rep of repProfiles) {
      const allPassed = requiredModules.every((mod) =>
        passingSet.has(`${rep.id}:${mod.id}`)
      )
      if (allPassed) certifiedCount++
    }
  } else if (requiredModules && requiredModules.length === 0 && repProfiles) {
    certifiedCount = repProfiles.length
  }

  // Active announcement
  const { data: announcement } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Recent activity — last 20 attempts with user profile and module
  const { data: recentActivity } = await supabase
    .from('attempts')
    .select(`
      id,
      score,
      passed,
      attempt_number,
      is_invalidated,
      created_at,
      user_id,
      profiles!attempts_user_id_fkey(id, name),
      modules!attempts_module_id_fkey(title)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  // Fetch emails for the users in recent activity
  const userIds = [...new Set((recentActivity ?? []).map((a: any) => a.user_id))]
  let userEmailMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profilesWithEmail } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', userIds)
    // We can't get emails directly from profiles; we'll use auth if needed
    // For now we'll show user IDs truncated as fallback
    userEmailMap = {}
  }

  const stats = [
    { label: 'Total Reps', value: totalReps ?? 0, color: 'text-blue-600' },
    { label: 'Certified', value: certifiedCount, color: 'text-green-600' },
    { label: 'Attempts', value: totalAttempts, color: 'text-blue-500' },
    { label: 'Passed', value: totalPassed, color: 'text-green-500' },
    { label: 'Avg Score', value: `${avgScore}%`, color: 'text-orange-500' },
    { label: 'Retakes', value: retakesCount, color: 'text-red-500' },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
            <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Announcement + Recent Activity row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Announcement */}
        <div className="lg:col-span-2">
          <AnnouncementForm currentContent={announcement?.content ?? ''} />
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Recent Activity</h2>
            <p className="text-xs text-gray-500 mt-0.5">Last 20 quiz attempts</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Rep</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Module</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Result</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Attempt</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(recentActivity ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No attempts yet.
                    </td>
                  </tr>
                ) : (
                  (recentActivity ?? []).map((attempt: any) => {
                    const repName = attempt.profiles?.name || 'Unknown'
                    const moduleTitle = attempt.modules?.title || 'Unknown Module'
                    const dateStr = format(new Date(attempt.created_at), 'M/d/yyyy')
                    const isRetake = attempt.attempt_number > 1

                    return (
                      <tr key={attempt.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-800">{repName}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-[150px] truncate">{moduleTitle}</td>
                        <td className="px-4 py-3 text-gray-700">{attempt.score}%</td>
                        <td className="px-4 py-3">
                          {attempt.passed ? (
                            <span className="text-green-600 font-medium">Passed</span>
                          ) : (
                            <span className="text-red-500 font-medium">Failed</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isRetake ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-gray-600">#{attempt.attempt_number}</span>
                              <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded uppercase">
                                Retake
                              </span>
                            </span>
                          ) : (
                            <span className="text-gray-600">#1</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{dateStr}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
