import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import LogoutButton from './LogoutButton'
import UserNav from './UserNav'
import LevelTimer from './LevelTimer'
import { sendSlack, LEVEL_LABELS } from '@/lib/slack'
import BookingScheduler from './BookingScheduler'
import AutoRefresh from './AutoRefresh'
import NewModulePopup from './NewModulePopup'
import RetakeNotificationPopup from './RetakeNotificationPopup'

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

type RawSection = {
  id: string
  name: string
  modules: ModuleRow[]
}

// Which program names belong to each level (lowercase, partial-match)
const LEVEL_PROGRAM_NAMES: Record<number, string[]> = {
  1: ['introduction', 'qualification training'],
  2: ['ops overview', 'main training module'],
  3: ['hr guidelines'],
}

function getProgramLevel(name: string): number {
  const lower = name.toLowerCase()
  for (const [lvl, names] of Object.entries(LEVEL_PROGRAM_NAMES)) {
    if (names.some((n) => lower.includes(n) || n.includes(lower))) return Number(lvl)
  }
  return 3
}

function buildSections(
  raw: RawSection[],
  initialUnlocked: boolean,
  moduleAttemptData: Record<string, AttemptData>
) {
  let prevDone = initialUnlocked
  return raw.map((section, idx) => {
    const programUnlocked = prevDone
    const programDone = section.modules.every((m) => moduleAttemptData[m.id]?.completed)
    const userInLater = raw
      .slice(idx + 1)
      .some((s) => s.modules.some((m) => moduleAttemptData[m.id]?.completed))
    prevDone = programUnlocked && (programDone || userInLater)

    const modulesWithLock = section.modules.map((mod, i) => {
      const allPrevDone = section.modules
        .slice(0, i)
        .every((m) => moduleAttemptData[m.id]?.completed)
      const userAlreadyPast = section.modules
        .slice(i)
        .some((m) => moduleAttemptData[m.id]?.completed)
      return { mod, isUnlocked: programUnlocked && (allPrevDone || userAlreadyPast), position: i }
    })

    return { ...section, isUnlocked: programUnlocked, isDone: programDone, modules: modulesWithLock }
  })
}

function ModuleCard({
  mod, data, qCount, isLocked, position, prevModTitle,
}: {
  mod: ModuleRow
  data: AttemptData
  qCount: number
  isLocked: boolean
  position: number
  prevModTitle?: string
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
          <p className="text-xs text-gray-300 mt-0.5">
            {prevModTitle ? <>Complete <strong className="text-gray-400">{prevModTitle}</strong> first to unlock</> : 'Complete the previous lesson to unlock'}
          </p>
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
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
        data.completed ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-700'
      }`}>
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

function SectionBlock({
  section,
  sectionIdx,
  prevSectionName,
  moduleAttemptData,
  questionCounts,
}: {
  section: ReturnType<typeof buildSections>[number]
  sectionIdx: number
  prevSectionName: string | undefined
  moduleAttemptData: Record<string, AttemptData>
  questionCounts: Record<string, number>
}) {
  const doneCount = section.modules.filter((m) => moduleAttemptData[m.mod.id]?.completed).length
  const totalCount = section.modules.length

  return (
    <div>
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
          <h3 className="text-sm font-bold text-gray-900">{section.name}</h3>
        </div>
        <span className="text-xs text-gray-400 font-medium">{doneCount} / {totalCount} complete</span>
      </div>

      {!section.isUnlocked && prevSectionName && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 text-center text-sm text-gray-400">
          Complete <strong className="text-gray-500">{prevSectionName}</strong> to unlock this section.
        </div>
      )}

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
              prevModTitle={position > 0 ? section.modules[position - 1].mod.title : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, created_at, nda_signed, nda_signed_at, timeclock_enabled, nda_overdue_notified, training_expired_notified, timer_disabled, team_type')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/teams/login')
  if (profile.role === 'admin') redirect('/teams/admin')
  if (!profile.nda_signed) redirect('/teams/onboarding')

  const { data: announcement } = await supabase
    .from('announcements')
    .select('content')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const teamType = (profile as any).team_type ?? 'intake'

  // Fetch programs for this team type only
  const programsRes = await supabase
    .from('programs')
    .select('id, name, position, team_type')
    .or(`team_type.eq.${teamType},team_type.is.null`)
    .order('position', { ascending: true })
  const programs = programsRes.error
    ? (await supabase.from('programs').select('id, name, team_type').or(`team_type.eq.${teamType},team_type.is.null`).order('created_at', { ascending: true })).data
    : programsRes.data

  const { data: programModuleLinks } = await supabase
    .from('program_modules')
    .select('program_id, module_id, position')
    .order('position', { ascending: true })

  // Only load modules that belong to this team's programs
  const teamProgramIds = new Set((programs ?? []).map((p) => p.id))
  const teamModuleIds = new Set(
    (programModuleLinks ?? [])
      .filter((l) => teamProgramIds.has(l.program_id))
      .map((l) => l.module_id)
  )

  const { data: allModules } = await supabase
    .from('modules')
    .select('id, title, description, pass_threshold, is_required, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  // Filter modules to only those in this team's programs
  const modules = (allModules ?? []).filter((m) => teamModuleIds.has(m.id))

  const moduleIds = modules.map((m) => m.id)
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

  const { data: userAttempts } = await supabase
    .from('attempts')
    .select('id, module_id, score, passed, attempt_number, is_invalidated, created_at')
    .eq('user_id', user.id)
    .in('module_id', moduleIds.length > 0 ? moduleIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

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

  const moduleMap = Object.fromEntries((modules ?? []).map((m) => [m.id, m]))
  const assignedIds = new Set((programModuleLinks ?? []).map((l) => l.module_id))

  const rawSections: RawSection[] = (programs ?? [])
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

  // Group raw sections by level
  const rawByLevel: Record<number, RawSection[]> = { 1: [], 2: [], 3: [] }
  for (const section of rawSections) {
    const lvl = getProgramLevel(section.name)
    rawByLevel[lvl].push(section)
  }

  // User's existing booking (must be fetched before level2Started is computed)
  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('slot_time')
    .eq('user_id', user.id)
    .maybeSingle()

  const serverNow = new Date().toISOString()

  // Build sections with sequential locking per level
  const level1Sections = buildSections(rawByLevel[1], true, moduleAttemptData)
  const level1Done = rawByLevel[1].length === 0 || level1Sections.every((s) => s.isDone)

  // If the user has already completed any Level 2 modules, treat Level 1 as effectively done.
  // This prevents newly-added Level 1 modules from re-locking Level 2 for users who've progressed.
  const hasLevel2Progress = rawByLevel[2].some((s) => s.modules.some((m) => moduleAttemptData[m.id]?.completed))
  const level1EffectivelyDone = level1Done || hasLevel2Progress

  // Level 2 unlocks 30 min after the booked call slot (call is assumed complete by then)
  const callCompletedAt = existingBooking?.slot_time
    ? new Date(new Date(existingBooking.slot_time).getTime() + 30 * 60 * 1000)
    : null
  const level2Started = !!callCompletedAt && Date.now() >= callCompletedAt.getTime()

  // If user already has Level 2 progress, bypass the level2Started gate — they clearly already had access.
  // This handles cases where the call was rescheduled or new modules were added after they progressed.
  const level2EffectivelyStarted = level2Started || hasLevel2Progress
  const level2Sections = buildSections(rawByLevel[2], level1EffectivelyDone && level2EffectivelyStarted, moduleAttemptData)
  const level2Done = rawByLevel[2].length === 0 || level2Sections.every((s) => s.isDone)

  // Same pattern: if user has Level 3 progress, treat Level 2 as effectively done
  const hasLevel3Progress = rawByLevel[3].some((s) => s.modules.some((m) => moduleAttemptData[m.id]?.completed))
  const level2EffectivelyDone = level2Done || hasLevel3Progress

  const level3Sections = buildSections(rawByLevel[3], level2EffectivelyDone, moduleAttemptData)
  const level3Done = rawByLevel[3].length === 0 || level3Sections.every((s) => s.isDone)
  const certified = level1Done && level2Done && level3Done

  const levelsUnlocked = !!(profile as any).levels_unlocked
  const timerDisabled = !!(profile as any).timer_disabled

  // A user is effectively certified if they've completed (or progressed past) all levels,
  // even if new modules were added to earlier levels after they finished.
  const effectivelyCertified = certified || (level1EffectivelyDone && level2EffectivelyDone && level3Done) || levelsUnlocked

  // Countdown deadlines
  const level1StartAt = (profile as any).nda_signed_at || profile.created_at
  const level1DeadlineAt = level1StartAt
    ? new Date(new Date(level1StartAt).getTime() + 12 * 60 * 60 * 1000).toISOString()
    : null
  // Level 2: 4h window starts from when the call ended (slot + 30 min)
  const level2DeadlineAt = level2Started && callCompletedAt
    ? new Date(callCompletedAt.getTime() + 4 * 60 * 60 * 1000).toISOString()
    : null

  // Expiry lock: if a timed level's deadline has passed and it's not complete, block the dashboard.
  // Use effectively-done so newly-added modules don't falsely trigger expiry for users who've progressed.
  const now = Date.now()
  const level1Expired = !timerDisabled && !levelsUnlocked && !!level1DeadlineAt && !level1EffectivelyDone && now > new Date(level1DeadlineAt).getTime()
  const level2Expired = !timerDisabled && !levelsUnlocked && !!level2DeadlineAt && !level2EffectivelyDone && now > new Date(level2DeadlineAt).getTime()
  const expiredLevel = level1Expired ? 1 : level2Expired ? 2 : null

  // Notify Slack once when timer expires
  if (expiredLevel !== null && !(profile as any).training_expired_notified) {
    const deadlineHours = expiredLevel === 1 ? 12 : 4
    await Promise.all([
      sendSlack({
        text: `⏰ ${profile.name} ran out of time on Level ${expiredLevel}`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⏰ *${profile.name}* ran out of time\n*Level ${expiredLevel}: ${LEVEL_LABELS[expiredLevel]}* was not completed within the ${deadlineHours}-hour window.`,
          },
        }],
      }),
      supabase.from('profiles').update({ training_expired_notified: true }).eq('id', user.id),
    ])
  }

  const ungroupedModules = (modules ?? []).filter((m) => !assignedIds.has(m.id))
  const requiredModules = (modules ?? []).filter((m) => m.is_required)
  const completedRequired = requiredModules.filter((m) => moduleAttemptData[m.id]?.completed).length

  const LEVEL_META = [
    { num: 1, label: 'Introduction', sublabel: '12-hour window', sections: level1Sections, raw: rawByLevel[1] },
    { num: 2, label: 'Onboarding', sublabel: '4-hour window', sections: level2Sections, raw: rawByLevel[2] },
    { num: 3, label: 'Active', sublabel: null, sections: level3Sections, raw: rawByLevel[3] },
  ]

  // Flat (post-certification) view: all sections unlocked, no level grouping
  const flatSections = rawSections.map((section) => ({
    ...section,
    isUnlocked: true,
    isDone: section.modules.every((m) => moduleAttemptData[m.id]?.completed),
    modules: section.modules.map((m, i) => ({ mod: m, isUnlocked: true, position: i })),
  }))

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
        <UserNav timeclockEnabled={!!profile.timeclock_enabled} teamType={(profile as any).team_type ?? 'intake'} />

        {expiredLevel !== null && (
          <div className="mt-8 bg-white rounded-2xl border border-red-200 shadow-sm px-8 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Training Window Expired</h2>
            <p className="text-gray-500 max-w-sm mx-auto">
              You did not complete Level {expiredLevel} within the required time. Please reach out to your manager to discuss next steps.
            </p>
          </div>
        )}

        {expiredLevel === null && (
          <>
          {announcement && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
              <span className="text-xl shrink-0">📢</span>
              <p className="text-sm text-blue-800 font-medium">{announcement.content}</p>
            </div>
          )}

          <NewModulePopup modules={(modules ?? []).map((m) => ({ id: m.id, title: m.title }))} />
          <RetakeNotificationPopup />

          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {profile.name || 'there'}!
              </h1>
              <p className="text-gray-500 mt-1">Complete each level in order to progress through your training.</p>
            </div>
            {requiredModules.length - completedRequired > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 shrink-0">
                <div className="relative">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {requiredModules.length - completedRequired}
                  </span>
                </div>
                <span className="text-sm font-semibold text-amber-700">
                  {requiredModules.length - completedRequired} lesson{requiredModules.length - completedRequired !== 1 ? 's' : ''} remaining
                </span>
              </div>
            )}
          </div>

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

        {/* Levels (or flat view if certified) */}
        {(modules ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-10 text-center">
            <p className="text-gray-500">No training modules available yet.</p>
          </div>
        ) : effectivelyCertified ? (
          /* ── Flat post-certification view ── */
          <div className="space-y-6">
            {flatSections.map((section, idx) => (
              <SectionBlock
                key={section.id}
                section={section}
                sectionIdx={idx}
                prevSectionName={undefined}
                moduleAttemptData={moduleAttemptData}
                questionCounts={questionCounts}
              />
            ))}
            {ungroupedModules.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-3">Other Modules</h2>
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
        ) : (
          <div className="space-y-10">
            {LEVEL_META.map(({ num, label, sublabel, sections, raw }, levelIdx) => {
              const showBooking = num === 1 && level1EffectivelyDone
              const prevLevel = LEVEL_META[levelIdx - 1]
              const isLevelUnlocked =
                num === 1
                  ? true
                  : num === 2
                  ? level1EffectivelyDone && level2EffectivelyStarted
                  : level2EffectivelyDone
              const deadlineAt = num === 1 ? level1DeadlineAt : num === 2 ? level2DeadlineAt : null
              const callBooked = num === 2 && !!existingBooking && !level2EffectivelyStarted
              const callCompletedAtIso = callCompletedAt?.toISOString() ?? null
              const levelDoneCount = raw
                .flatMap((s) => s.modules)
                .filter((m) => moduleAttemptData[m.id]?.completed).length
              const levelTotalCount = raw.flatMap((s) => s.modules).length
              const isLevelDone = levelTotalCount > 0 && levelDoneCount === levelTotalCount

              // Hide timer if a new module was added to this level after training started
              const levelStartedAt = num === 1
                ? new Date(level1StartAt)
                : num === 2 && callCompletedAt
                ? callCompletedAt
                : null
              const hasNewModule = levelStartedAt !== null && raw
                .flatMap((s) => s.modules)
                .some((m) => !moduleAttemptData[m.id]?.completed && new Date(m.created_at) > levelStartedAt)
              const showTimer = isLevelUnlocked && !isLevelDone && !!deadlineAt && !hasNewModule

              return (
                <div key={num}>
                  {/* Level header */}
                  <div className={`rounded-2xl border px-5 py-4 mb-4 ${
                    !isLevelUnlocked
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : num === 1
                      ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
                      : num === 2
                      ? 'bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200'
                      : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                  }`}>
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                          !isLevelUnlocked
                            ? 'bg-gray-200 text-gray-400'
                            : isLevelDone
                            ? 'bg-green-500 text-white'
                            : num === 1
                            ? 'bg-blue-600 text-white'
                            : num === 2
                            ? 'bg-purple-600 text-white'
                            : 'bg-green-600 text-white'
                        }`}>
                          {!isLevelUnlocked ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          ) : isLevelDone ? '✓' : num}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-gray-900">Level {num}: {label}</h2>
                            {sublabel && !isLevelDone && (
                              <span className="text-xs text-gray-400 font-medium">{sublabel}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {levelTotalCount > 0
                              ? `${levelDoneCount} / ${levelTotalCount} lessons complete`
                              : 'No lessons yet'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isLevelDone && isLevelUnlocked && (
                          <span className="text-sm font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                            <span>✓</span> Completed
                          </span>
                        )}
                        {showTimer && <LevelTimer deadlineAt={deadlineAt!} />}
                        {callBooked && callCompletedAtIso && (
                          <AutoRefresh at={callCompletedAtIso} />
                        )}
                      </div>
                    </div>

                    {/* Level locked message */}
                    {!isLevelUnlocked && prevLevel && !callBooked && (
                      <p className="text-xs text-gray-400 mt-2 ml-12">
                        Complete Level {prevLevel.num}: {prevLevel.label} to unlock this level.
                      </p>
                    )}

                    {/* Level 2: call booked, waiting for call to end */}
                    {callBooked && existingBooking && callCompletedAtIso && (
                      <p className="text-xs text-gray-500 mt-2 ml-12">
                        Your call is at{' '}
                        <strong>{new Date(existingBooking.slot_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong>.
                        {' '}Level 2 will unlock automatically 30 minutes after it starts.
                      </p>
                    )}
                  </div>

                  {/* Sections within this level */}
                  {isLevelUnlocked && !(num === 2 && callBooked) && (
                    <div className="space-y-6 pl-1">
                      {sections.map((section, idx) => (
                        <SectionBlock
                          key={section.id}
                          section={section}
                          sectionIdx={idx}
                          prevSectionName={sections[idx - 1]?.name}
                          moduleAttemptData={moduleAttemptData}
                          questionCounts={questionCounts}
                        />
                      ))}
                    </div>
                  )}

                {/* Booking scheduler — shows after Level 1 is complete */}
                {showBooking && (
                  <BookingScheduler serverNow={serverNow} />
                )}
                </div>
              )
            })}

            {/* Ungrouped modules */}
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
          </>
        )}
      </main>
    </div>
  )
}
