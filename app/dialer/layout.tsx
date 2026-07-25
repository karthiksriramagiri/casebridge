import { ThemeProvider } from './_context/theme'
import { CallProvider } from './_context/call'
import { AuthProvider } from './_context/auth'
import { DialerNav } from './_components/DialerNav'
import { FloatingCallBar } from './_components/FloatingCallBar'
import { createServerSupabase } from './_lib/supabase-server'

export const metadata = { title: 'CB Dialer' }

export default async function DialerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.user_metadata?.role ?? 'REP') as 'REP' | 'ADMIN'

  return (
    <AuthProvider initialUser={user}>
      <ThemeProvider>
        <CallProvider>
          <div className="flex h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
            <FloatingCallBar />
            <DialerNav role={role} />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </CallProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}
