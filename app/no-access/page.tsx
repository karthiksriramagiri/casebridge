import type { Metadata } from 'next'
import '@/app/_metrics/metrics.css'
import { currentRole, homeFor, NoAccess } from '@/app/_metrics/access'

/* The lock screen the middleware serves in place of a page the signed-in
   account may not open. It keeps the URL that was attempted, so this renders
   standalone rather than inside a center's chrome — a restricted account has
   no business seeing that center's navigation either. */

export const metadata: Metadata = {
  title: 'No access · CaseBridge',
  robots: { index: false, follow: false },
}

export default async function NoAccessPage() {
  return (
    <div className="mx metrics-page">
      <NoAccess home={homeFor(await currentRole())} />
    </div>
  )
}
