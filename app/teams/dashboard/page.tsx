import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import LogoutButton from './LogoutButton'
import TimeclockWidget from './TimeclockWidget'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/teams/login')
  if (profile.role === 'admin') redirect('/teams/admin')

  // Active announcement
  const { data: announcement } = await supabase
    .from('announcements')
    .select('content')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // All active modules
  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, description, pass_threshold, is_required, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  // Question counts
  const moduleIds = (modules ?? []).map((m) => m.id)
  let questionCounts: Record<string, number> = {}
  if (moduleIds.length > 0) {
    const { data: questions } = await supabase
      .from('questions')
      .select('id, module_id')
      .in('module_id', moduleIds)
    for (const q of questions ?? []) {
      questionCounts[q.module_id] = (questionCounts[q.module_id] ?? 0) + 1
    }
  }

  // All user attempts for active modules
  const { data: userAttempts } = await supabase
    .from('attempts')
    .select('id, module_id, score, passed, attempt_number, is_invalidated, created_at')
    .eq('user_id', user.id)
    .in('module_id', moduleIds.length > 0 ? moduleIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  // Build per-module attempt data
  const moduleAttemptData: Record<string, {
    completed: boolean
    lastScore: number | null
    lastPassed: boolean | null
    attemptCount: number
    lastAttemptDate: string | null
  }> = {}

  for (const mod of modules ?? []) {
    const attempts = (userAttempts ?? []).filter((a) => a.module_id === mod.id)
    const validAttempts = attempts.filter((a) => !a.is_invalidated)
    const hasPassingAttempt = validAttempts.some((a) => a.passed)
    const lastAttempt = validAttempts[0] ?? null

    moduleAttemptData[mod.id] = {
      completed: hasPassingAttempt,
      lastScore: lastAttempt?.score ?? null,
      lastPassed: lastAttempt?.passed ?? null,
      attemptCount: validAttempts.length,
      lastAttemptDate: lastAttempt?.created_at ?? null,
    }
  }

  const requiredModules = (modules ?? []).filter((m) => m.is_required)
  const completedRequired = requiredModules.filter((m) => moduleAttemptData[m.id]?.completed).length


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Announcement banner */}
        {announcement && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-xl shrink-0">📢</span>
            <p className="text-sm text-blue-800 font-medium">{announcement.content}</p>
          </div>
        )}

        {/* Greeting */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile.name || 'there'}!
          </h1>
          <p className="text-gray-500 mt-1">
            Complete your training modules to get certified.
          </p>
        </div>

        {/* Timeclock */}
        <TimeclockWidget profileId={profile.id} />

        {/* Progress overview */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Required modules completed</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">
                <span className="text-green-600">{completedRequired}</span>
                <span className="text-gray-400 text-lg"> / {requiredModules.length}</span>
              </p>
            </div>
            <div className="text-right">
              {completedRequired === requiredModules.length && requiredModules.length > 0 ? (
                <span className="bg-green-100 text-green-700 font-semibold text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <span>✓</span> Certified!
                </span>
              ) : (
                <span className="bg-gray-100 text-gray-600 font-medium text-sm px-3 py-1.5 rounded-full">
                  In Progress
                </span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {requiredModules.length > 0 && (
            <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.round((completedRequired / requiredModules.length) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Module list */}
        <h2 className="text-base font-semibold text-gray-800 mb-3">Training Modules</h2>

        {(modules ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center">
            <p className="text-gray-500">No training modules available yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(modules ?? []).map((mod) => {
              const data = moduleAttemptData[mod.id]
              const qCount = questionCounts[mod.id] ?? 0

              let statusLabel = 'Not Started'
              let statusClass = 'bg-gray-100 text-gray-500'
              if (data.completed) {
                statusLabel = 'Completed ✓'
                statusClass = 'bg-green-100 text-green-700 font-semibold'
              } else if (data.attemptCount > 0 && !data.completed) {
                statusLabel = 'Failed'
                statusClass = 'bg-red-100 text-red-600'
              }

              const btnLabel = data.attemptCount === 0 ? 'Take Quiz' : data.completed ? 'Retake' : 'Retry Quiz'

              return (
                <div key={mod.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{mod.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${mod.is_required ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {mod.is_required ? 'Required' : 'Optional'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                      <span>{qCount} question{qCount !== 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>Pass: {mod.pass_threshold}%</span>
                      {data.lastScore !== null && (
                        <>
                          <span>·</span>
                          <span>Last score: {data.lastScore}%</span>
                        </>
                      )}
                      {data.lastAttemptDate && (
                        <>
                          <span>·</span>
                          <span>{format(new Date(data.lastAttemptDate), 'M/d/yyyy')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${statusClass}`}>
                      {statusLabel}
                    </span>
                    <Link
                      href={`/teams/module/${mod.id}`}
                      className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                        data.completed
                          ? 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                          : 'bg-[#0f1e3c] text-white hover:bg-[#1a3060]'
                      }`}
                    >
                      {btnLabel}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
