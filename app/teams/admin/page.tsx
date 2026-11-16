import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, PageBody, Section, StatCard, Pill, TableCard, EmptyState } from '@/app/teams/_components/shared'
import AnnouncementForm from './AnnouncementForm'

/* The admin overview.

   Six figures and the last twenty attempts. The figures were six centred
   cards each in a different colour — blue, green, blue, green, orange, red —
   which gave a page of neutral counts the look of a page of alarms. They are
   plain now; only the two that mean something good or bad keep a tone. */

export default async function AdminOverviewPage() {
  const supabase = await createClient()

  const { count: totalReps } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'rep')

  const { data: allAttempts } = await supabase.from('attempts').select('*')

  const attempts = allAttempts ?? []
  const totalAttempts = attempts.length
  const totalPassed = attempts.filter((a) => a.passed && !a.is_invalidated).length
  const retakesCount = attempts.filter((a) => a.attempt_number > 1 && !a.is_invalidated).length
  const avgScore =
    attempts.length > 0
      ? (attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length).toFixed(1)
      : '0.0'

  // Certified: reps who have passed every active required module.
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

    const passingSet = new Set((passingAttempts ?? []).map((a) => `${a.user_id}:${a.module_id}`))

    for (const rep of repProfiles) {
      if (requiredModules.every((mod) => passingSet.has(`${rep.id}:${mod.id}`))) certifiedCount++
    }
  } else if (requiredModules && requiredModules.length === 0 && repProfiles) {
    // Nothing is required, so everyone qualifies. Stated rather than left to
    // fall through as zero, which would read as "nobody is certified".
    certifiedCount = repProfiles.length
  }

  const { data: announcement } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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

  const rows = recentActivity ?? []
  const passRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : null

  return (
    <>
      <PageHeader
        title="Overview"
        description="Where the team stands on training, and what was attempted most recently."
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <StatCard label="Reps" value={String(totalReps ?? 0)} />
          <StatCard
            label="Certified"
            value={String(certifiedCount)}
            hint="passed every required module"
            tone={certifiedCount > 0 ? 'good' : undefined}
          />
          <StatCard label="Attempts" value={String(totalAttempts)} />
          <StatCard
            label="Passed"
            value={String(totalPassed)}
            hint={passRate === null ? undefined : `${passRate}% of attempts`}
          />
          <StatCard label="Avg score" value={`${avgScore}%`} />
          <StatCard
            label="Retakes"
            value={String(retakesCount)}
            tone={retakesCount > 0 ? 'warn' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <AnnouncementForm currentContent={announcement?.content ?? ''} />
          </div>

          <Section
            title="Recent activity"
            description="The last 20 quiz attempts"
            className="lg:col-span-3"
          >
            {rows.length === 0 ? (
              <EmptyState title="No attempts yet">
                Scores appear here as soon as a rep finishes a quiz.
              </EmptyState>
            ) : (
              <TableCard>
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Module</th>
                    <th className="num">Score</th>
                    <th>Result</th>
                    <th>Attempt</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((attempt: any) => (
                    <tr key={attempt.id}>
                      <td className="font-medium">{attempt.profiles?.name || 'Unknown'}</td>
                      <td className="max-w-[180px] truncate text-muted-foreground">
                        {attempt.modules?.title || 'Unknown module'}
                      </td>
                      <td className="num">{attempt.score}%</td>
                      <td>
                        <Pill tone={attempt.passed ? 'green' : 'red'}>
                          {attempt.passed ? 'Passed' : 'Failed'}
                        </Pill>
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-muted-foreground tabular-nums">
                            #{attempt.attempt_number}
                          </span>
                          {attempt.attempt_number > 1 && <Pill tone="amber">Retake</Pill>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {format(new Date(attempt.created_at), 'M/d/yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableCard>
            )}
          </Section>
        </div>
      </PageBody>
    </>
  )
}
