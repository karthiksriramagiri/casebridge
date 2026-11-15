'use client'

import type { ReactNode } from 'react'
import { TeamsSidebar, type TeamsRole } from '@/app/teams/_components/teams-sidebar'
import { Toaster } from '@/app/teams/_ui/sonner'

/* ═══════════════════════════════════════════════════════════════════════════
   One Team Center workspace: sidebar on the left, page on the right.

   `.tc-root` is applied here rather than in app/teams/layout.tsx on purpose.
   The layout also wraps /teams itself — the public recruiting page — and
   /teams/login and /teams/signup, none of which should be painted as part of
   the center or carry a nav for an account that is not signed in yet.

   The toaster lives here so it inherits the palette through `.ui-portal`
   rather than the app's.
   ═══════════════════════════════════════════════════════════════════════════ */

export function TeamsShell({
  role, teamType, phase, timeclockEnabled, name, children,
}: {
  role: TeamsRole
  teamType?: string
  phase?: number
  timeclockEnabled?: boolean
  name?: string | null
  children: ReactNode
}) {
  return (
    <>
      <div className="tc-root">
        <div className="flex min-h-dvh flex-col md:flex-row">
          <TeamsSidebar
            role={role}
            teamType={teamType}
            phase={phase}
            timeclockEnabled={timeclockEnabled}
            name={name}
          />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <Toaster position="bottom-center" />
    </>
  )
}
