import { venuAdmin } from './auth'
import type { VoiceBaseline } from './voice-baseline'

/**
 * Reading and writing voice profiles.
 *
 * Kept apart from voice-baseline.ts because that module holds the types and the
 * maths, which the capture page needs — and it is a client component, so it
 * must not pull `next/headers` in through this.
 */
const key = (userId: string) => `voice_baseline:${userId}`

export async function loadBaseline(userId: string): Promise<VoiceBaseline | null> {
  try {
    const { data } = await venuAdmin()
      .from('venu_settings').select('value').eq('key', key(userId)).single()
    return (data?.value as VoiceBaseline) ?? null
  } catch {
    return null
  }
}

export async function saveBaseline(userId: string, baseline: VoiceBaseline) {
  const { error } = await venuAdmin().from('venu_settings').upsert({
    key: key(userId),
    value: baseline,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  })
  if (error) throw new Error(error.message)
}
