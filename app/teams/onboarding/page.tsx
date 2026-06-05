import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, nda_signed')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/teams/login')
  if (profile.role === 'admin') redirect('/teams/admin')
  if (profile.nda_signed) redirect('/teams/home')

  return <OnboardingClient name={profile.name} />
}
