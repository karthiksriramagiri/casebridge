import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TeamsShell from '../dashboard/TeamsShell'
import TimeclockWidget from '../dashboard/TimeclockWidget'

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
    <div className="min-h-screen bg-gray-50">
      <TeamsShell timeclockEnabled={true} teamType={profile.team_type ?? 'intake'}>
      <main className="max-w-4xl mx-auto px-6 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Timeclock</h1>
          <p className="text-gray-500 mt-1">Track your hours, {profile.name}.</p>
        </div>

        <TimeclockWidget profileId={profile.id} />
      </main>
      </TeamsShell>
    </div>
  )
}
