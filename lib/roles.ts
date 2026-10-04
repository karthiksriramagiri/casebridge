/* ═══════════════════════════════════════════════════════════════════════════
   Who may open what.

   Kept apart from session.ts deliberately: that module reaches for
   next/headers and iron-session, neither of which exists in the browser, and
   the header needs these same rules to decide which tabs to draw. Pure data
   and one predicate, importable from anywhere.

   'admin'    — everything, as before
   'creative' — Winner Analysis and Assignments, and the Team Center. Nothing
                else: the Creative Overview leads with spend, cost per signed
                case and signed-case counts, which is company economics rather
                than anything needed to produce the work.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Role = 'admin' | 'creative'

export const ROLE_ACCESS: Record<Role, { allow: string[]; home: string }> = {
  admin: { allow: ['/'], home: '/creative' },
  creative: {
    // /teams carries its own Supabase sign-in and is listed for completeness:
    // the center gate never sees it, but the allow list should read as the
    // whole truth about where the role may go.
    allow: ['/creative/winners', '/creative/assignments', '/teams'],
    home: '/creative/winners',
  },
}

/** Enforced in proxy.ts, and read again by the header so it does not offer a
    tab that would answer with a lock screen. */
export function canOpen(role: Role | undefined, path: string): boolean {
  // No role on the session means a cookie predating roles — treat as admin.
  const r = role ?? 'admin'
  if (r === 'admin') return true
  return ROLE_ACCESS[r].allow.some(
    p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?')
  )
}
