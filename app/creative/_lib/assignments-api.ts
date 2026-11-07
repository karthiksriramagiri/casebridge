'use client'

import type { Assignment, KTask } from './types'

/* ═══════════════════════════════════════════════════════════════════════════
   Talking to the assignment board's tables.

   Every call is fire-and-forget from the caller's point of view: the store
   updates its own state first so the board moves under the cursor, and the
   write follows. A failed write is reported through `onError` rather than
   thrown, because a dropped comment must not take the page down with it.
   ═══════════════════════════════════════════════════════════════════════════ */

const URL = '/api/creative/assignments'

export type BoardData = {
  assignments: Assignment[]
  tasks: KTask[]
  setupNeeded: boolean
  error: string | null
}

export async function fetchBoard(): Promise<BoardData> {
  try {
    const res = await fetch(URL, { cache: 'no-store' })
    const d = await res.json()
    return {
      assignments: d.assignments ?? [],
      tasks: d.tasks ?? [],
      setupNeeded: !!d.setupNeeded,
      error: d.error ?? null,
    }
  } catch (e) {
    return { assignments: [], tasks: [], setupNeeded: false, error: (e as Error).message }
  }
}

async function send(method: 'POST' | 'PATCH', body: unknown): Promise<any> {
  const res = await fetch(URL, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? `${method} failed`)
  /* A 200 carrying an error means the write partly landed — some field had
     nowhere to go. Raised like a failure so the page says so, because the
     half that did not save is invisible otherwise. */
  if (d?.error) throw new Error(d.error)
  return d
}

export const api = {
  createAssignment: (a: Record<string, unknown>) => send('POST', { kind: 'assignment', ...a }),
  createTask:       (t: Record<string, unknown>) => send('POST', { kind: 'task', ...t }),
  createComment:    (c: { parentKind: 'assignment' | 'task'; parentId: string; author: string; text: string; stage?: string }) =>
    send('POST', { kind: 'comment', ...c }),
  patchAssignment:  (id: string, patch: Record<string, unknown>) => send('PATCH', { kind: 'assignment', id, ...patch }),
  patchTask:        (id: string, patch: Record<string, unknown>) => send('PATCH', { kind: 'task', id, ...patch }),
  remove: async (kind: 'assignment' | 'task' | 'comment', id: string) => {
    const res = await fetch(`${URL}?kind=${kind}&id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'delete failed')
  },
}

/* An id that came from the database is a uuid; anything else is a row this
   session invented and has not persisted yet, which must not be sent back as
   a target for an update. */
export const isPersisted = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
