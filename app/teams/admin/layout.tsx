import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminNav from './AdminNav'
import LogoutButton from '../dashboard/LogoutButton'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/teams/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/teams/dashboard')
  }

  // Fetch retake count for badge
  const { count: retakeCount } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .gt('attempt_number', 1)
    .eq('is_invalidated', false)

  // Format today's date: "Thu, Apr 9"
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0f1e3c] px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg tracking-tight">CaseBridge Teams</span>
          <span className="text-blue-300 text-sm font-normal">· Training Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-blue-200 text-sm font-medium">{dateStr}</span>
          <LogoutButton />
        </div>
      </header>

      {/* Tab Navigation */}
      <AdminNav retakeCount={retakeCount ?? 0} />

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  )
}
