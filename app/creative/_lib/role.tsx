'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useSite } from '@/app/_metrics/site'
import type { Role } from './types'

const RoleContext = createContext<Role>('admin')

export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}

/* ═══════════════════════════════════════════════════════════════════════════
   Where each workspace lives, relative to the center.

   The creative team's workspace is `/team` rather than the original `/creative`:
   the center is already mounted at app/creative, so keeping that name would
   have meant app/creative/creative/assignments — a path that reads as a typo
   every time someone opens it. Every other route keeps its original slug.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ROLE_PATH: Record<Role, string> = {
  admin: '/admin',
  creative: '/team',
}

/* The browser-facing prefix differs by host: on creatives.case-bridge.com the
   proxy rewrite hides the /creative segment, so a link reads /admin/analysis;
   on the apex it has to read /creative/admin/analysis. useSite() already
   resolves which, from the Host header. */
export function useRoleBase(role?: Role): string {
  const { base } = useSite()
  const r = useContext(RoleContext)
  return base + ROLE_PATH[role ?? r]
}

/** Prefixes a center-relative href (as stored on a notification) for this host. */
export function useCenterHref(): (href: string) => string {
  const { base } = useSite()
  return (href: string) => base + href || '/'
}
