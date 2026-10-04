import { getIronSession, IronSession, unsealData } from 'iron-session'
import { cookies } from 'next/headers'

/* Roles live in lib/roles.ts so the browser can read them too — this module
   cannot be imported from a client component. Re-exported here so existing
   server-side imports keep working. */
export { ROLE_ACCESS, canOpen, type Role } from './roles'
import type { Role } from './roles'

export interface SessionData {
  isLoggedIn: boolean
  role?: Role
  user?: string
}

const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'casebridge_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    /* Scoped to the apex domain so one sign-in carries across the centers.
       Without it the cookie is host-only: you would sign in on
       creatives.case-bridge.com and bounce straight back to /login on
       finance.case-bridge.com. Left unset off production so localhost,
       which cannot hold a dotted domain cookie, still works. */
    ...(process.env.NODE_ENV === 'production' ? { domain: '.case-bridge.com' } : {}),
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  return session
}

/* The middleware runs on the edge, where next/headers does not exist — it only
   has the raw cookie string. Unsealing it directly is the same read getSession
   does, minus the write half it has no use for. A cookie that will not open
   (tampered, or sealed with an older secret) is treated as no session at all
   rather than as an admin. */
export async function readSessionCookie(raw: string | undefined): Promise<SessionData | null> {
  if (!raw) return null
  try {
    const data = await unsealData<SessionData>(raw, { password: sessionOptions.password })
    return data && typeof data === 'object' && data.isLoggedIn ? data : null
  } catch {
    return null
  }
}



