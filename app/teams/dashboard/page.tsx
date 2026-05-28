import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import LogoutButton from './LogoutButton'
import TimeclockWidget from './TimeclockWidget'

type AttemptData = {
  completed: boolean
  lastScore: number | null
  lastPassed: boolean | null
  attemptCount: number
  lastAttemptDate: string | null
}

type ModuleRow = {
  id: string
  title: string
  description: string
  pass_threshold: number
  is_required: boolean
  created_at: string
}

function ModuleCard({
  mod, data, qCount, isLocked, position,
}: {
  mod: ModuleRow
  data: AttemptData
  qCount: number
  isLocked: boolean
  position: number
}) {
  if (isLocked) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-4 opacity-50">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-gray-400">{position + 1}. {mod.title}</span>
          <p className="text-xs text-gray-300 mt-0.5">Complete the previous lesson to unlock</p>
        </div>
        <span className="text-xs text-gray-300 shrink-0">Locked</span>
      </div>
    )
  }

  let statusLabel = 'Not Started'
  let statusClass = 'bg-gray-100 text-gray-500'
  if (data.completed) {
    statusLabel = 'Completed ✓'
    statusClass = 'bg-green-100 text-green-700 font-semibold'
  } else if (data.attemptCount > 0) {
    statusLabel = 'Failed'
    statusClass = 'bg-red-100 text-red-600'
  }

  const isVideoOnly = qCount === 0
  const btnLabel = data.completed
    ? (isVideoOnly ? 'Rewatch' : 'Retake')
    : (isVideoOnly ? 'Watch' : data.attemptCount > 0 ? 'Retry Quiz' : 'Start')

  return (
    <div className={`bg-white rounded-xl border shadow-sm px-5 py-4 flex items-center gap-4 ${
      !data.completed && data.attemptCount === 0 ? 'border-blue-200 ring-1 ring-blue-100' : 'border-gray-100'
    }`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold
        ${data.completed ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-700'}">
        {data.completed ? '✓' : position + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-900">{mod.title}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
          {isVideoOnly ? <span>Video lesson</span> : (
            <>
              <span>{qCount} question{qCount !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>Pass: {mod.pass_threshold}%</span>
            </>
          )}
          {data.lastScore !== null && !isVideoOnly && (
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
}

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

  // Programs (sections) + links
  const [{ data: programs }, { data: programModuleLinks }] = await Promise.all([
    supabase.from('programs').select('id, name').order('created_at', { ascending: true }),
    supabase.from('program_modules').select('program_id, module_id, position').order('position', { ascending: true }),
  ])

  // Question counts
  const moduleIds = (modules ?? []).map((m) => m.id)
  const questionCounts: Record<string, number> = {}
  if (moduleIds.length > 0) {
    const { data: questions } = await supabase
      .from('questions')
      .select('id, module_id')
      .in('module_id', moduleIds)
    for (const q of questions ?? []) {
      questionCounts[q.module_id] = (questionCounts[q.module_id] ?? 0) + 1
    }
  }

  // User attempts
  const { data: userAttempts } = await supabase
    .from('attempts')
    .select('id, module_id, score, passed, attempt_number, is_invalidated, created_at')
    .eq('user_id', user.id)
    .in('module_id', moduleIds.length > 0 ? moduleIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  // Per-module attempt data
  const moduleAttemptData: Record<string, AttemptData> = {}
  for (const mod of modules ?? []) {
    const attempts = (userAttempts ?? []).filter((a) => a.module_id === mod.id)
    const valid = attempts.filter((a) => !a.is_invalidated)
    const passed = valid.some((a) => a.passed)
    const last = valid[0] ?? null
    moduleAttemptData[mod.id] = {
      completed: passed,
      lastScore: last?.score ?? null,
      lastPassed: last?.passed ?? null,
      attemptCount: valid.length,
      lastAttemptDate: last?.created_at ?? null,
    }
  }

  // Build ordered sections with locking
  const moduleMap = Object.fromEntries((modules ?? []).map((m) => [m.id, m]))
  const assignedIds = new Set((programModuleLinks ?? []).map((l) => l.module_id))

  const rawSections = (programs ?? [])
    .map((prog) => ({
      id: prog.id,
      name: prog.name,
      modules: (programModuleLinks ?? [])
        .filter((l) => l.program_id === prog.id)
        .sort((a, b) => a.position - b.position)
        .map((l) => moduleMap[l.module_id])
        .filter(Boolean) as ModuleRow[],
    }))
    .filter((s) => s.modules.length > 0)

  // Sequential locking: each program unlocks only after the previous is fully done;
  // each module unlocks only after the previous module in the same program is done.
  let prevProgramDone = true
  const sections = rawSections.map((section) => {
    const programUnlocked = prevProgramDone
    const programDone = section.modules.every((m) => moduleAttemptData[m.id]?.completed)
    // next program is unlocked only if this one is both unlocked AND fully done
    prevProgramDone = programUnlocked && programDone

    let prevModDone = true
    const modulesWithLock = section.modules.map((mod, idx) => {
      const modUnlocked = programUnlocked && prevModDone
      const modDone = moduleAttemptData[mod.id]?.completed ?? false
      if (!modDone) prevModDone = false
      return { mod, isUnlocked: modUnlocked, position: idx }
    })

    return { ...section, isUnlocked: programUnlocked, isDone: programDone, modules: modulesWithLock }
  })

  const ungroupedModules = (modules ?? []).filter((m) => !assignedIds.has(m.id))
  const requiredModules = (modules ?? []).filter((m) => m.is_required)
  const completedRequired = requiredModules.filter((m) => moduleAttemptData[m.id]?.completed).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f1e3c] px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal ml-2">· Training Portal</span>
        </div>
        <LogoutButton />
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {announcement && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <span className="text-xl shrink-0">📢</span>
            <p className="text-sm text-blue-800 font-medium">{announcement.content}</p>
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile.name || 'there'}!
          </h1>
          <p className="text-gray-500 mt-1">
            Complete each lesson in order to progress through the training.
          </p>
        </div>

        <TimeclockWidget profileId={profile.id} />

        {/* Overall progress */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Overall progress</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">
                <span className="text-green-600">{completedRequired}</span>
                <span className="text-gray-400 text-lg"> / {requiredModules.length} lessons</span>
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
          {requiredModules.length > 0 && (
            <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.round((completedRequired / requiredModules.length) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Program sections */}
        {(modules ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center">
            <p className="text-gray-500">No training modules available yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((section, sIdx) => {
              const doneCount = section.modules.filter((m) => moduleAttemptData[m.mod.id]?.completed).length
              const totalCount = section.modules.length

              return (
                <div key={section.id}>
                  {/* Section header */}
                  <div className={`flex items-center justify-between mb-3 ${!section.isUnlocked ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      {!section.isUnlocked ? (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      ) : section.isDone ? (
                        <span className="text-green-500 text-sm">✓</span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      )}
                      <h2 className="text-base font-bold text-gray-900">
                        {sIdx + 1}. {section.name}
                      </h2>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">
                      {doneCount} / {totalCount} complete
                    </span>
                  </div>

                  {/* Locked program overlay message */}
                  {!section.isUnlocked && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-center text-sm text-gray-400">
                      Complete <strong className="text-gray-500">{rawSections[sIdx - 1]?.name}</strong> to unlock this section.
                    </div>
                  )}

                  {/* Modules */}
                  {section.isUnlocked && (
                    <div className="space-y-2">
                      {section.modules.map(({ mod, isUnlocked, position }) => (
                        <ModuleCard
                          key={mod.id}
                          mod={mod}
                          data={moduleAttemptData[mod.id]}
                          qCount={questionCounts[mod.id] ?? 0}
                          isLocked={!isUnlocked}
                          position={position}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Ungrouped modules (no section) */}
            {ungroupedModules.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-gray-900 mb-3">Other Modules</h2>
                <div className="space-y-2">
                  {ungroupedModules.map((mod, idx) => (
                    <ModuleCard
                      key={mod.id}
                      mod={mod}
                      data={moduleAttemptData[mod.id]}
                      qCount={questionCounts[mod.id] ?? 0}
                      isLocked={false}
                      position={idx}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
