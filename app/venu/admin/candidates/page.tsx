import { redirect } from 'next/navigation'
import { getVenuUser } from '../../_lib/auth'
import CandidatesClient from './CandidatesClient'

export const dynamic = 'force-dynamic'

export default async function VenuCandidates() {
  const user = await getVenuUser()
  if (!user) redirect('/venu/login')
  if (user.role !== 'admin') redirect('/venu')
  return <CandidatesClient />
}
