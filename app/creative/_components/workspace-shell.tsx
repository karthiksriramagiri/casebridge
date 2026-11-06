'use client'

import type { ReactNode } from 'react'
import { WorkspaceSidebar } from '@/app/creative/_components/workspace-sidebar'
import { Toaster } from '@/app/creative/_ui/sonner'
import { RoleProvider } from '@/app/creative/_lib/role'
import type { Role } from '@/app/creative/_lib/types'

/* ═══════════════════════════════════════════════════════════════════════════
   One workspace: sidebar on the left, page on the right.

   `.cc-root` is applied here rather than in the center layout so it stays off
   the legacy pages, which bring their own palette. It carries the center's
   whole colour scheme — see cc.css.

   The toaster lives here, inside the role scope, because only one workspace
   is ever mounted at a time; the store sits above all three in the center
   layout so moving between workspaces does not reset the boards.
   ═══════════════════════════════════════════════════════════════════════════ */

export function WorkspaceShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <RoleProvider role={role}>
      <div className="cc-root">
        <div className="flex min-h-dvh flex-col md:flex-row">
          <WorkspaceSidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <Toaster position="bottom-center" />
    </RoleProvider>
  )
}
