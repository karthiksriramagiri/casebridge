import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TeamsShell } from '@/app/teams/_components/teams-shell'

/* ═══════════════════════════════════════════════════════════════════════════
   The admin workspace.

   The guard is unchanged — signed in, and `profile.role === 'admin'`, or you
   are sent back to the rep dashboard. What changed is everything it used to
   draw around the page: a navy `#0f1e3c` bar, a date, and thirteen tabs in a
   scrolling row. That is now the center's sidebar, which also reaches the
   three admin pages the tab row never listed.

   The page is no longer boxed to `max-w-7xl` with its own padding. Pages set
   their own gutter through PageHeader and PageBody, so a wide table is free
   to use the width it needs instead of scrolling inside a 1280px column.
   ═══════════════════════════════════════════════════════════════════════════ */

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

  return (
    <TeamsShell role="admin" name={profile.name}>
      {children}
    </TeamsShell>
  )
}
