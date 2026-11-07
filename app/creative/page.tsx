import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { siteRootForHost } from '@/app/_metrics/site-root'
import { WORKSPACE_LANDING } from './_lib/workspaces'
import { CreativeLogin } from './_components/login'

/* ═══════════════════════════════════════════════════════════════════════════
   The front door.

   This used to be a workspace picker sitting behind the shared /login page:
   you signed in once, then chose a card, and the card was only a link — a
   creative could click "Admin" and get a lock screen for their trouble.

   It is the login now. Each workspace is its own door with its own account,
   so the thing you pick and the thing you are authorised as cannot disagree.
   Somebody already signed in never sees it; they go straight to their own
   workspace.
   ═══════════════════════════════════════════════════════════════════════════ */

export default async function CreativeCenterHome() {
  const session = await getSession()
  const onOwnHost = siteRootForHost((await headers()).get('host')) === '/creative'
  const base = onOwnHost ? '' : '/creative'

  if (session.isLoggedIn) {
    const role = session.role ?? 'admin'
    redirect(base + WORKSPACE_LANDING[role])
  }

  return <CreativeLogin base={base} />
}
