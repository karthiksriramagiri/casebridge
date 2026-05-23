'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/teams/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="text-blue-200 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 rounded border border-blue-400/30 hover:border-blue-300/60"
    >
      Sign Out
    </button>
  )
}
