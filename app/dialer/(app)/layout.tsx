import { ThemeProvider } from '../_context/theme'
import { CallProvider } from '../_context/call'
import { AuthProvider } from '../_context/auth'
import { DialerNav } from '../_components/DialerNav'
import { FloatingCallBar } from '../_components/FloatingCallBar'
import { InboundCallOverlay } from '../_components/InboundCallOverlay'
import { RepHeartbeat } from '../_components/RepHeartbeat'
import { createServerSupabase } from '../_lib/supabase-server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  /* Case-insensitive on purpose. The dialer stores 'REP'/'ADMIN' but the
     profiles table constrains its own role column to lowercase, so an account
     created through that path carries 'rep' — and `role !== 'REP'` then reads
     lowercase 'rep' as "not a rep" and hands out the admin nav. Normalising
     here means the comparison cannot be fooled by case again. */
  const rawRole = String(user?.user_metadata?.role ?? 'REP').toUpperCase()
  const role = (rawRole === 'ADMIN' ? 'ADMIN' : 'REP') as 'REP' | 'ADMIN'

  return (
    <AuthProvider initialUser={user}>
      <ThemeProvider>
        <CallProvider>
          <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            <FloatingCallBar />
            <InboundCallOverlay />
            <RepHeartbeat />
            <DialerNav role={role} />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </CallProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}
