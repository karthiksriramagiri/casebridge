import { getSession } from '@/lib/session'
import { canOpen, ROLE_ACCESS, type Role } from '@/lib/roles'

/* ═══════════════════════════════════════════════════════════════════════════
   Page-level access.

   Checked here rather than in middleware because the session cookie is sealed
   and only the server runtime can open it. Each route declares the path it is,
   so a restricted user typing a URL hits the same gate as one clicking a tab —
   hiding a tab is a courtesy, this is the control.
   ═══════════════════════════════════════════════════════════════════════════ */

export async function currentRole(): Promise<Role> {
  const session = await getSession()
  // A session predating roles belongs to the original shared admin login.
  return session.role ?? 'admin'
}

export async function hasAccess(path: string): Promise<boolean> {
  return canOpen(await currentRole(), path)
}

export function homeFor(role: Role) {
  return ROLE_ACCESS[role].home
}

/** Shown in place of a page the signed-in person may not open. */
export function NoAccess({ home }: { home: string }) {
  return (
    <main className="mx-main">
      <div className="mx-card ka-noaccess">
        <span className="ka-noaccess-lock" aria-hidden="true">🔒</span>
        <h1 className="ka-noaccess-title">You do not have access to this page</h1>
        <p className="ka-noaccess-sub">
          Your account covers Winner Analysis and Assignments. Ask an admin if you need more.
        </p>
        <a className="mx-btn mx-btn-accent" href={home}>Go to Winner Analysis</a>
      </div>
    </main>
  )
}
