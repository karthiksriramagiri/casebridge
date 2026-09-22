import { redirect } from 'next/navigation'
import { getVenuUser } from '../_lib/auth'
import { CHECKPOINTS } from '../_lib/rubrics'
import CallClient from './CallClient'

export const dynamic = 'force-dynamic'

export default async function CallPage({
  searchParams,
}: { searchParams: Promise<{ mode?: string }> }) {
  const user = await getVenuUser()
  if (!user) redirect('/venu/login')
  if (!user.setter) redirect('/venu')

  const { mode } = await searchParams
  const resolved = mode === 'test' ? 'test' : 'practice'

  return (
    <CallClient
      mode={resolved}
      checkpoints={CHECKPOINTS.map((c) => ({ id: c.id, label: c.label, complete: c.complete }))}
    />
  )
}
