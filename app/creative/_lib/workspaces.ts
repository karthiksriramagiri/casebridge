import type { Role } from './types'

/* Where each workspace's sign-in lands.

   Kept out of _lib/role.tsx on purpose: that module is 'use client', and
   every export of a client module reaches a server component as a client
   reference rather than its value — importing ROLE_PATH into the front door
   produced "/creativeundefined/analysis". Plain data, no directive, readable
   from both sides. */
export const WORKSPACE_LANDING: Record<Role, string> = {
  admin: '/admin/analysis',
  creative: '/team/assignments',
}
