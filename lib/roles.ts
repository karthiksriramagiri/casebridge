/* ═══════════════════════════════════════════════════════════════════════════
   Who may open what.

   Kept apart from session.ts deliberately: that module reaches for
   next/headers and iron-session, neither of which exists in the browser, and
   the header needs these same rules to decide which tabs to draw. Pure data
   and one predicate, importable from anywhere.

   'admin'     — everything, as before
   'creative'  — Winner Analysis and Assignments, and the Team Center. Nothing
                 else: the Creative Overview leads with spend, cost per signed
                 case and signed-case counts, which is company economics rather
                 than anything needed to produce the work.
   'reporting' — the Reporting Center, and nothing else at all.
   ═══════════════════════════════════════════════════════════════════════════ */

export type Role = 'admin' | 'creative' | 'reporting'

export const ROLE_ACCESS: Record<Role, { allow: string[]; home: string }> = {
  admin: { allow: ['/'], home: '/creative' },
  /* The Reporting Center, on its own.

     That page has an address of its own at /reporting and is the one surface
     here meant to be handed to someone — which, until now, meant handing them
     the admin login, because admin was the only role allowed to open it. One
     page's worth of access should not cost the whole company's.

     The allow list names the real route, /finance/reporting, because that is
     what the gate matches on: /reporting is an alias the proxy rewrites
     before any check runs. Naming the alias instead would allow a path the
     gate never sees and refuse the one it does.

     Nothing else in /finance is listed, and that is the point. Revenue by
     firm, operating expenses and rep pay are all one tab away from this page
     for an admin, and none of them are what this account is for. */
  reporting: {
    allow: ['/finance/reporting'],
    home: '/reporting',
  },
  creative: {
    // /teams carries its own Supabase sign-in and is listed for completeness:
    // the center gate never sees it, but the allow list should read as the
    // whole truth about where the role may go.
    //
    // /creative/team is the revamped Creative Center's own workspace for this
    // role — the assignment board plus the read-only research pages. Without
    // it the proxy would bounce Faisal off the one area built for him.
    // There is no third workspace: the K-Team login was removed and that work
    // is Jason's, under /creative/admin.
    //
    // '/creative' itself is the center's front door — the sign-in. It has to
    // be openable by both roles or a signed-in creative who types the bare
    // URL gets a lock screen instead of being sent to their own workspace.
    allow: ['/creative/winners', '/creative/assignments', '/creative/team', '/teams'],
    home: '/creative/winners',
  },
}

/** Enforced in proxy.ts, and read again by the header so it does not offer a
    tab that would answer with a lock screen. */
export function canOpen(role: Role | undefined, path: string): boolean {
  // No role on the session means a cookie predating roles — treat as admin.
  const r = role ?? 'admin'
  if (r === 'admin') return true
  /* The Creative Center's front door is its own sign-in, and a signed-in
     creative who types the bare URL has to reach it to be sent on to their
     workspace. Scoped to that role: a reporting account has no business in
     another center's doorway, and its allow list is meant to be the whole
     truth about where it can go. */
  if (r === 'creative' && (path === '/creative' || path === '/creative/')) return true
  return ROLE_ACCESS[r].allow.some(
    p => path === p || path.startsWith(p + '/') || path.startsWith(p + '?')
  )
}
