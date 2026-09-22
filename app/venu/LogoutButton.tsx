'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    setBusy(true)
    await createClient().auth.signOut()
    router.push('/venu/login')
    // The layout reads the session on the server, so the cached tree has to go
    // too — without this the topbar still shows the signed-out user's name.
    router.refresh()
  }

  return (
    <button className="venu-signout" onClick={handleLogout} disabled={busy}>
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
