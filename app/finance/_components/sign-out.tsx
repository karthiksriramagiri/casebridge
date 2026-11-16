'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/* Signing out of the Reporting Center.

   Every other page in this center reaches sign-out through the sidebar. The
   Reporting Center deliberately has none — it is one page with an address of
   its own, handed to someone to read — which left it the only surface here
   you could not sign out of. Somebody reading the company's numbers on a
   borrowed screen had no way to close the session but to clear a cookie.

   So the button lives on the page itself, in the header beside the figures,
   rather than in furniture that is not coming back.

   It goes to /login rather than to the role's home: the session is gone by
   then, so a home page would bounce straight to the sign-in anyway and the
   `next` it carried would send the next person back into the report.        */
export function SignOutButton() {
  const router = useRouter()
  const [going, setGoing] = useState(false)

  async function signOut() {
    setGoing(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* The cookie is cleared by the server, so a failed call means the
         session is still live. Saying nothing and sending them to /login
         would look signed out while they are not; staying put with the
         button re-armed is the honest outcome. */
      setGoing(false)
      return
    }
    /* replace, not push: the back button must not return to a report the
       session behind it can no longer load. */
    router.replace('/login')
    router.refresh()
  }

  return (
    <button type="button" className="fin-signout" onClick={signOut} disabled={going}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M6.2 2.4H3.6A1.2 1.2 0 002.4 3.6v8.8a1.2 1.2 0 001.2 1.2h2.6" strokeLinecap="round" />
        <path d="M10.4 11.2L13.6 8l-3.2-3.2M13.6 8H6.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {going ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
