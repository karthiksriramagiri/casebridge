import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from '../dashboard/LogoutButton'
import UserNav from '../dashboard/UserNav'
import TimeclockWidget from '../dashboard/TimeclockWidget'

export default async function TimeclockPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, nda_signed, timeclock_enabled')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/teams/login')
  if (profile.role === 'admin') redirect('/teams/admin')
  if (!profile.nda_signed) redirect('/teams/onboarding')
  if (!profile.timeclock_enabled) redirect('/teams/dashboard')

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
        <UserNav timeclockEnabled={true} />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Timeclock</h1>
          <p className="text-gray-500 mt-1">Track your hours, {profile.name}.</p>
        </div>

        <TimeclockWidget profileId={profile.id} />
      </main>
    </div>
  )
}
