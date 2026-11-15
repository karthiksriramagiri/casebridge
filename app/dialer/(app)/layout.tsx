import '../dialer.css'
import { CallProvider } from '../_context/call'
import { AuthProvider } from '../_context/auth'
import { DialerSidebar } from '../_components/ui/dialer-sidebar'
import { CallBar } from '../_components/ui/call-bar'
import { InboundCallOverlay } from '../_components/InboundCallOverlay'
import { RepHeartbeat } from '../_components/RepHeartbeat'
import { createServerSupabase } from '../_lib/supabase-server'

/* ═══════════════════════════════════════════════════════════════════════════
   The dialer shell.

   Sidebar, page, and the two things that must outrank whatever page is
   open: the call bar and the inbound-call overlay. `.dl-root` carries the
   palette — see dialer.css — so every token below resolves to the dialer's
   own colours rather than the app's.

   The theme provider is gone. It toggled `dark:` variants the new palette
   does not define, so the dark half was half-painted: a dark page with
   light cards on it. Light only, the same as the Creative Center.
   ═══════════════════════════════════════════════════════════════════════════ */

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
      <CallProvider>
        <div className="dl-root flex min-h-dvh flex-col md:flex-row">
          <CallBar />
          <InboundCallOverlay />
          <RepHeartbeat />
          <DialerSidebar role={role} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </CallProvider>
    </AuthProvider>
  )
}
