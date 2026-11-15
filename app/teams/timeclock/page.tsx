import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeamsShell from '../dashboard/TeamsShell'
import TimeclockWidget from '../dashboard/TimeclockWidget'
import { PageHeader, PageBody } from '@/app/teams/_components/shared'

export default async function TimeclockPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, nda_signed, timeclock_enabled, team_type')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/teams/login')
  if (profile.role === 'admin') redirect('/teams/admin')
  if (!profile.nda_signed) redirect('/teams/onboarding')
  if (!profile.timeclock_enabled) redirect('/teams/dashboard')

  return (
      <TeamsShell timeclockEnabled={true} teamType={profile.team_type ?? 'intake'}>
      <PageHeader title="Timeclock" description={`Track your hours, ${profile.name}.`} />
      <PageBody>


        <TimeclockWidget profileId={profile.id} />
        </PageBody>
      </TeamsShell>
  )
}
