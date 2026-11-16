import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { homeFor } from '@/app/_metrics/access'
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
    /* Only the roles that have a workspace here. An account that does not —
       the Reporting Center's — is sent to its own home rather than bounced
       into a lock screen by a redirect into a center it cannot open. The
       proxy already refuses it this URL; this is the same answer given by
       the page, so the two cannot disagree. */
    const landing = WORKSPACE_LANDING[role as keyof typeof WORKSPACE_LANDING]
    redirect(landing ? base + landing : homeFor(role))
  }

  return <CreativeLogin base={base} />
}
