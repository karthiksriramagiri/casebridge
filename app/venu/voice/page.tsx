import { redirect } from 'next/navigation'
import { getVenuUser } from '../_lib/auth'
import { loadBaseline } from '../_lib/voice-baseline-store'
import { BASELINE_SCRIPTS } from '../_lib/voice-baseline'
import VoiceSetup from './VoiceSetup'

export const dynamic = 'force-dynamic'

export default async function VoicePage() {
  const user = await getVenuUser()
  if (!user) redirect('/venu/login')
  const baseline = await loadBaseline(user.id)
  return <VoiceSetup scripts={BASELINE_SCRIPTS} existing={baseline} />
}
