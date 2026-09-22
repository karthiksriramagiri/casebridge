import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'

export interface SessionData {
  isLoggedIn: boolean
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



