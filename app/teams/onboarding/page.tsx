import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingClient from './OnboardingClient'
import { sendSlack } from '@/lib/slack'

export default async function OnboardingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, nda_signed, created_at, nda_overdue_notified')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/teams/login')
  if (profile.role === 'admin') redirect('/teams/admin')
  if (profile.nda_signed) redirect('/teams/home')

  // Notify Slack if NDA unsigned for 24+ hours (once)
  const hoursSinceCreated = (Date.now() - new Date(profile.created_at).getTime()) / 3600000
  if (hoursSinceCreated >= 24 && !(profile as any).nda_overdue_notified) {
    await Promise.all([
      sendSlack({
        text: `⚠️ *${profile.name}* has not signed their NDA`,
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⚠️ *${profile.name}* has not signed their NDA\nAccount was created ${Math.floor(hoursSinceCreated)} hours ago and the NDA remains unsigned.`,
          },
        }],
      }),
      supabase.from('profiles').update({ nda_overdue_notified: true }).eq('id', user.id),
    ])
  }

  return <OnboardingClient name={profile.name} />
}
